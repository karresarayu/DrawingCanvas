// frontend/js/canvas.js

// ===== Authentication Check =====
const token = localStorage.getItem("token");
const user = JSON.parse(localStorage.getItem("user") || "null");
if (!token || !user) window.location.href = "login.html";

// ===== Display User Info =====
document.getElementById("userName").innerText = `Welcome, ${user.name}`;
document.getElementById("logoutBtn").addEventListener("click", () => {
  localStorage.clear();
  window.location.href = "login.html";
});

// ===== Canvas Setup =====
const canvas = document.getElementById("drawingCanvas");
const ctx = canvas.getContext("2d");
canvas.width = canvas.clientWidth;
canvas.height = canvas.clientHeight;

let painting = false;
let tool = "brush";
let brushColor = "#000000";
let brushSize = 5;
let localPoints = [];
let clientActions = [];

const customCursor = document.getElementById("customCursor");

// ===== Socket.io Connection =====
const socket = io({ auth: { token } });

socket.on("connect_error", (err) => {
  console.error("Socket connection error:", err.message);
});

// ===== Handle Canvas History =====
socket.on("history", (serverActions) => {
  clientActions = serverActions.slice();
  redrawCanvas();
});

// ===== Receive a Stroke from Others =====
socket.on("stroke", (stroke) => {
  drawStroke(stroke);
  clientActions.push(stroke);
});

// ===== Handle Undo (Remove Stroke) =====
socket.on("remove-stroke", (strokeId) => {
  clientActions = clientActions.filter((s) => s.id !== strokeId);
  redrawCanvas();
});

// ===== Remote Cursor =====
socket.on("cursor", (payload) => showRemoteCursor(payload));
socket.on("user-disconnected", (id) => removeRemoteCursor(id));

// ===== Drawing Functions =====
function drawStroke(stroke) {
  if (!stroke?.points?.length) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = stroke.color || "#000";
  ctx.lineWidth = stroke.width || 3;

  ctx.beginPath();
  const pts = stroke.points;
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke();
  ctx.closePath();
  ctx.restore();
}

function redrawCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const stroke of clientActions) drawStroke(stroke);
}

// ===== Get Pointer Position =====
function getPointerPos(e) {
  const rect = canvas.getBoundingClientRect();
  return [e.clientX - rect.left, e.clientY - rect.top];
}

// ===== Drawing Events =====
function startDraw(e) {
  painting = true;
  localPoints = [];
  const p = getPointerPos(e);
  localPoints.push(p);

  ctx.beginPath();
  ctx.moveTo(p[0], p[1]);
  ctx.lineWidth = brushSize;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = tool === "brush" ? brushColor : "#fff";
}

function draw(e) {
  if (!painting) return;
  const p = getPointerPos(e);
  localPoints.push(p);
  ctx.lineTo(p[0], p[1]);
  ctx.stroke();
  emitCursor(e);
}

function stopDraw(e) {
  if (!painting) return;
  painting = false;

  const stroke = {
    id: `${socket.id}_${Date.now()}`,
    points: localPoints.slice(),
    color: tool === "brush" ? brushColor : "#fff",
    width: brushSize,
    userName: user.name,
  };

  drawStroke(stroke);
  socket.emit("stroke", stroke);
  localPoints = [];
}

// ===== Mouse Events =====
canvas.addEventListener("mousedown", startDraw);
canvas.addEventListener("mousemove", draw);
window.addEventListener("mouseup", stopDraw);

// ===== Touch Events =====
canvas.addEventListener("touchstart", (e) => startDraw(e.touches[0]), { passive: false });
canvas.addEventListener("touchmove", (e) => draw(e.touches[0]), { passive: false });
canvas.addEventListener("touchend", (e) => stopDraw(e.changedTouches[0]), { passive: false });

// ===== Tool Buttons =====
document.getElementById("brushBtn").addEventListener("click", () => (tool = "brush"));
document.getElementById("eraserBtn").addEventListener("click", () => (tool = "eraser"));
document.getElementById("colorPicker").addEventListener("input", (e) => {
  brushColor = e.target.value;
  customCursor.style.borderColor = brushColor;
});
document.getElementById("strokeWidth").addEventListener("input", (e) => {
  brushSize = Number(e.target.value);
  updateCursorSize(brushSize);
});

document.getElementById("undoBtn").addEventListener("click", () => socket.emit("undo"));
document.getElementById("redoBtn").addEventListener("click", () => socket.emit("redo"));
document.getElementById("clearBtn").addEventListener("click", () => socket.emit("clear"));

// ===== Remote Cursor =====
const remoteCursors = {};

function showRemoteCursor(payload) {
  let el = remoteCursors[payload.socketId];
  if (!el) {
    el = document.createElement("div");
    el.className = "remote-cursor";
    el.innerHTML = `<div class="dot" style="background:${payload.color}"></div><div class="label">${payload.userName}</div>`;
    document.body.appendChild(el);
    remoteCursors[payload.socketId] = el;
  }
  el.style.left = `${payload.x}px`;
  el.style.top = `${payload.y}px`;
}

function removeRemoteCursor(socketId) {
  if (remoteCursors[socketId]) {
    remoteCursors[socketId].remove();
    delete remoteCursors[socketId];
  }
}

let lastCursorEmit = 0;
function emitCursor(e) {
  const now = Date.now();
  if (now - lastCursorEmit < 30) return;
  lastCursorEmit = now;
  socket.emit("cursor", { x: e.clientX, y: e.clientY });
}

// ===== Custom Cursor =====
canvas.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
    customCursor.style.display = "block";
    customCursor.style.left = `${e.clientX}px`;
    customCursor.style.top = `${e.clientY}px`;
  } else {
    customCursor.style.display = "none";
  }
});

canvas.addEventListener("mouseleave", () => (customCursor.style.display = "none"));

function updateCursorSize(size) {
  customCursor.style.width = `${size}px`;
  customCursor.style.height = `${size}px`;
  customCursor.style.borderWidth = size > 15 ? "2px" : "1.5px";
}
updateCursorSize(brushSize);
customCursor.style.borderColor = brushColor;
