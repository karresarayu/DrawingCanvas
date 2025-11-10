// backend/server.js
import express from "express";
import http from "http";
import dotenv from "dotenv";
import mongoose from "mongoose";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { Server as IOServer } from "socket.io";
import jwt from "jsonwebtoken";

import authRoutes from "./routes/auth.js";
import User from "./models/User.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ===== MongoDB Connection =====
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

// ===== API Routes =====
app.use("/api/auth", authRoutes);

// ===== Serve Frontend =====
app.use(express.static(path.join(__dirname, "../frontend")));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

// ===== HTTP + WebSocket Setup =====
const httpServer = http.createServer(app);
const io = new IOServer(httpServer, { cors: { origin: "*" } });

// ===== Global Canvas State =====
let actions = []; // all drawn strokes
let redoStack = []; // undone strokes kept here
const allStrokes = {}; // quick stroke lookup

// ===== Verify Socket Token =====
async function verifyTokenSocket(token) {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).lean();
    return user || null;
  } catch {
    return null;
  }
}

io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error("Unauthorized"));
  const user = await verifyTokenSocket(token);
  if (!user) return next(new Error("Unauthorized"));

  socket.user = {
    id: user._id.toString(),
    name: user.name,
    color: "#" + Math.floor(Math.random() * 16777215).toString(16),
  };
  next();
});

// ===== Socket Connections =====
io.on("connection", (socket) => {
  console.log(`🎨 ${socket.user.name} connected`);

  // Send full canvas history to new user
  socket.emit("history", actions);

  // ===== When a user draws =====
  socket.on("stroke", (stroke) => {
    if (!stroke.id) stroke.id = `${socket.id}_${Date.now()}`;
    stroke.userId = socket.user.id;
    stroke.userName = socket.user.name;
    stroke.color = stroke.color || socket.user.color || "#000";
    stroke.width = stroke.width || 3;

    // Save globally
    actions.push(stroke);
    allStrokes[stroke.id] = stroke;

    // ❌ Don't clear redoStack here
    // redoStack = [];

    // Broadcast to all other users
    socket.broadcast.emit("stroke", stroke);
  });

  // ===== Global Undo (remove last global stroke) =====
  socket.on("undo", () => {
    if (actions.length === 0) {
      socket.emit("undo-empty");
      return;
    }

    const lastStroke = actions.pop();
    redoStack.push(lastStroke);
    delete allStrokes[lastStroke.id];

    // Tell everyone to remove it
    io.emit("remove-stroke", lastStroke.id);
  });

  // ===== Global Redo (restore last undone) =====
  socket.on("redo", () => {
    if (redoStack.length === 0) {
      socket.emit("redo-empty");
      return;
    }

    const stroke = redoStack.pop();
    actions.push(stroke);
    allStrokes[stroke.id] = stroke;

    // Tell everyone to re-draw it
    io.emit("stroke", stroke);
  });

  // ===== Clear Canvas (global) =====
  socket.on("clear", () => {
    redoStack = [...actions, ...redoStack];
    actions = [];
    io.emit("history", actions);
  });

  // ===== Cursor Tracking =====
  socket.on("cursor", (pos) => {
    socket.broadcast.emit("cursor", {
      socketId: socket.id,
      userName: socket.user.name,
      color: socket.user.color,
      x: pos.x,
      y: pos.y,
    });
  });

  socket.on("disconnect", () => {
    console.log(`❌ ${socket.user.name} disconnected`);
  });
});

// ===== Start Server =====
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
