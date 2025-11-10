// frontend/js/canvas.js
// Assumes canvas.html provides elements with ids used below

// Auth check
const token = localStorage.getItem("token");
const user = JSON.parse(localStorage.getItem("user") || "null");
if (!token || !user) {
  window.location.href = "login.html";
}

document.getElementById("userName").innerText = `Welcome, ${user.name}`;
document.getElementById("logoutBtn").addEventListener("click", () => {
  localStorage.clear();
  window.location.href = "login.html";
});

// Canvas setup
const canvas = document.getElementById("drawingCanvas");
const ctx = canvas.getContext("2d");
canvas.width = canvas.clientWidth;
canvas.height = canvas.clientHeight;

let painting = false;
let tool = "brush";
let brushColor = "#000000";
let brushSize = 5;
let localPoints = [];
let lastEmit = 0;
const EMIT_INTERVAL = 40; // ms
let clientActions = []; // mirror of server history

// custom cursor element
const customCursor = document.getElementById("customCursor");

// connect socket.io with token
const socket = io({
  auth: { token }
});

socket.on("connect_error", (err) => {
  console.error("Socket connect error:", err.message);
});

socket.on("history", (serverActions) => {
  clientActions = serverActions.slice();
  redrawFromActions();
});

socket.on("stroke", (stroke) => {
  // draw final stroke from other user
  drawStrokeOnCanvas(stroke, false);
  clientActions.push(stroke);
});

socket.on("stroke-progress", (partial) => {
  // render preview: redraw everything + partial on top
  redrawFromActions(partial);
});

socket.on("cursor", (payload) => {
  showRemoteCursor(payload);
});

socket.on("presence", (list) => {
  // optional: you can show online user list
  // console.log("presence:", list);
});

socket.on("user-disconnected", (socketId) => {
  removeRemoteCursor(socketId);
});

// Drawing helpers
function redrawFromActions(preview = null) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const s of clientActions) drawStrokeOnCanvas(s, false);
  if (preview) drawStrokeOnCanvas(preview, true);
}

function drawStrokeOnCanvas(stroke, isPreview) {
  if (!stroke || !stroke.points || stroke.points.length === 0) return;
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

  if (!isPreview) {
    // ensure not duplicated in clientActions
    if (!clientActions.find(s => s.id === stroke.id)) clientActions.push(stroke);
  }
  ctx.restore();
}

// utilities
function getPointerPos(e) {
  const rect = canvas.getBoundingClientRect();
  return [e.clientX - rect.left, e.clientY - rect.top];
}

// drawing event handlers
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
  ctx.strokeStyle = (tool === "brush") ? brushColor : "#fff";
  // clear redo if you want server to handle redo stack; we just notify server by action
}

function draw(e) {
  if (!painting) return;
  const p = getPointerPos(e);
  localPoints.push(p);
  ctx.lineTo(p[0], p[1]);
  ctx.stroke();

  // throttle stroke-progress
  const now = Date.now();
  if (now - lastEmit > EMIT_INTERVAL) {
    lastEmit = now;
    socket.emit("stroke-progress", {
      id: `${socket.id}_${Date.now()}`,
      points: localPoints.slice(-40),
      color: (tool === "brush") ? brushColor : "#fff",
      width: brushSize
    });
  }

  // emit cursor
  emitCursor(e);
}

function stopDraw(e) {
  if (!painting) return;
  painting = false;
  // finalize stroke
  const stroke = {
    id: `${socket.id}_${Date.now()}`,
    points: localPoints.slice(),
    color: (tool === "brush") ? brushColor : "#fff",
    width: brushSize,
    userName: user.name
  };
  // draw final locally (already drawn but ensure complete)
  drawStrokeOnCanvas(stroke, false);
  // send to server
  socket.emit("stroke", stroke);
  localPoints = [];
}

// mouse & touch wiring
canvas.addEventListener("mousedown", startDraw);
canvas.addEventListener("mousemove", draw);
window.addEventListener("mouseup", stopDraw);

// touch support
canvas.addEventListener("touchstart", (ev) => { ev.preventDefault(); startDraw(ev.touches[0]); }, { passive: false });
canvas.addEventListener("touchmove", (ev) => { ev.preventDefault(); draw(ev.touches[0]); }, { passive: false });
window.addEventListener("touchend", (ev) => { ev.preventDefault(); stopDraw(ev.changedTouches[0]); }, { passive: false });

// tools wiring
document.getElementById("brushBtn").addEventListener("click", () => { tool = "brush"; });
document.getElementById("eraserBtn").addEventListener("click", () => { tool = "eraser"; });
document.getElementById("colorPicker").addEventListener("input", (e) => { brushColor = e.target.value; customCursor.style.borderColor = brushColor; });
document.getElementById("strokeWidth").addEventListener("input", (e) => { brushSize = Number(e.target.value); updateCustomCursorSize(brushSize); });

document.getElementById("undoBtn").addEventListener("click", () => socket.emit("undo"));
document.getElementById("redoBtn").addEventListener("click", () => socket.emit("redo"));
document.getElementById("clearBtn").addEventListener("click", () => socket.emit("clear"));

// ----- Remote cursor visuals -----
const remoteCursors = {}; // socketId -> element

function showRemoteCursor(payload) {
  const id = payload.socketId;
  let el = remoteCursors[id];
  if (!el) {
    el = document.createElement("div");
    el.className = "remote-cursor";
    el.innerHTML = `<div class="dot" style="background:${payload.color}"></div><div class="label">${payload.userName}</div>`;
    document.body.appendChild(el);
    remoteCursors[id] = el;
  }
  // position in page coordinates
  el.style.left = `${payload.x}px`;
  el.style.top = `${payload.y}px`;
}

function removeRemoteCursor(socketId) {
  const el = remoteCursors[socketId];
  if (el) {
    el.remove();
    delete remoteCursors[socketId];
  }
}

// emit cursor (throttled)
let lastCursorEmit = 0;
function emitCursor(e) {
  const now = Date.now();
  if (now - lastCursorEmit < 30) return;
  lastCursorEmit = now;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX;
  const y = e.clientY;
  socket.emit("cursor", { x, y });
}

// ----- Custom brush cursor -----
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

canvas.addEventListener("mouseleave", () => { customCursor.style.display = "none"; });

function updateCustomCursorSize(size) {
  customCursor.style.width = `${size}px`;
  customCursor.style.height = `${size}px`;
  customCursor.style.borderWidth = size > 15 ? "2px" : "1.5px";
}
// set initial cursor size & color
updateCustomCursorSize(brushSize);
customCursor.style.borderColor = brushColor;
