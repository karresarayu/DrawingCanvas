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

// Resolve __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// MongoDB Connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

// API routes
app.use("/api/auth", authRoutes);

// Serve frontend
app.use(express.static(path.join(__dirname, "../frontend")));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

// Create HTTP server and Socket.io
const httpServer = http.createServer(app);
const io = new IOServer(httpServer, {
  cors: { origin: "*" }, // allow frontend requests
});

// ===== In-memory stores =====
const actions = []; // all strokes on canvas
const allSavedStrokes = {}; // all strokes ever drawn (for redo)
const userActions = {}; // per-user stack of stroke IDs
const redoStacks = {}; // per-user redo stack

// ===== Helper: Verify token during socket handshake =====
async function verifyTokenSocket(token) {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).lean();
    return user || null;
  } catch (err) {
    return null;
  }
}

// ===== Socket Authentication =====
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Unauthorized"));
    const user = await verifyTokenSocket(token);
    if (!user) return next(new Error("Unauthorized"));
    socket.user = {
      id: user._id.toString(),
      name: user.name,
      color:
        user.color ||
        "#" + Math.floor(Math.random() * 16777215).toString(16),
    };
    next();
  } catch (err) {
    next(new Error("Unauthorized"));
  }
});

// ===== Socket Connections =====
io.on("connection", (socket) => {
  console.log(`✅ ${socket.user.name} connected (${socket.id})`);

  // Send current history to new user
  socket.emit("history", actions);

  // ===== When user draws a stroke =====
  socket.on("stroke", (stroke) => {
    if (!stroke.id) stroke.id = `${socket.id}_${Date.now()}`;
    stroke.userId = socket.user.id;
    stroke.userName = socket.user.name;
    stroke.color = stroke.color || socket.user.color || "#000";
    stroke.width = stroke.width || 3;

    // store stroke globally
    actions.push(stroke);
    allSavedStrokes[stroke.id] = stroke;

    // track this user’s strokes
    userActions[stroke.userId] = userActions[stroke.userId] || [];
    userActions[stroke.userId].push(stroke.id);

    // new stroke clears redo stack for this user
    redoStacks[stroke.userId] = [];

    // broadcast to others (real-time)
    socket.broadcast.emit("stroke", stroke);
  });

  // ===== Undo (per user) =====
  socket.on("undo", () => {
    const uid = socket.user.id;
    const ulist = userActions[uid] || [];
    if (ulist.length === 0) {
      socket.emit("undo-empty");
      return;
    }

    // pop user’s last stroke ID
    const lastStrokeId = ulist.pop();

    // push to redo stack
    redoStacks[uid] = redoStacks[uid] || [];
    redoStacks[uid].push(lastStrokeId);

    // remove from global canvas
    const idx = actions.findIndex((s) => s.id === lastStrokeId);
    if (idx !== -1) actions.splice(idx, 1);

    // broadcast updated canvas
    io.emit("history", actions);
  });

  // ===== Redo (per user) =====
  socket.on("redo", () => {
    const uid = socket.user.id;
    const rstack = redoStacks[uid] || [];
    if (rstack.length === 0) {
      socket.emit("redo-empty");
      return;
    }

    const strokeId = rstack.pop();
    const stroke = allSavedStrokes[strokeId];
    if (!stroke) {
      socket.emit("redo-failed");
      return;
    }

    // restore stroke globally
    actions.push(stroke);
    userActions[uid] = userActions[uid] || [];
    userActions[uid].push(strokeId);

    // broadcast updated canvas
    io.emit("history", actions);
  });

  // ===== Clear Canvas (global for now) =====
  socket.on("clear", () => {
    for (const s of actions) {
      redoStacks[s.userId] = redoStacks[s.userId] || [];
      redoStacks[s.userId].push(s.id);
    }
    actions.length = 0;
    io.emit("history", actions);
  });

  // ===== Cursor Position =====
  socket.on("cursor", (pos) => {
    const payload = {
      socketId: socket.id,
      userId: socket.user.id,
      userName: socket.user.name,
      color: socket.user.color,
      x: pos.x,
      y: pos.y,
    };
    socket.broadcast.emit("cursor", payload);
  });

  socket.on("disconnect", () => {
    console.log(`❌ ${socket.user.name} disconnected`);
  });
});

// ===== Start Server =====
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () =>
  console.log(`🚀 Server running on port ${PORT}`)
);
