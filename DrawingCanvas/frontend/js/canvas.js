const canvas = document.getElementById("drawingCanvas");
const ctx = canvas.getContext("2d");

let drawing = false;
let brushColor = "#000000";
let brushSize = 5;
let tool = "brush";
let history = [];
let redoStack = [];

// Store initial state
saveState();

function saveState() {
  history.push(canvas.toDataURL());
  if (history.length > 20) history.shift(); // Limit undo stack size
}

function startDraw(e) {
  drawing = true;
  ctx.beginPath();
  ctx.moveTo(e.offsetX, e.offsetY);
}

function draw(e) {
  if (!drawing) return;
  ctx.lineWidth = brushSize;
  ctx.lineCap = "round";

  if (tool === "brush") {
    ctx.strokeStyle = brushColor;
  } else if (tool === "eraser") {
    ctx.strokeStyle = "#fff";
  }

  ctx.lineTo(e.offsetX, e.offsetY);
  ctx.stroke();
}

function stopDraw() {
  if (!drawing) return;
  drawing = false;
  ctx.closePath();
  saveState();
}

// Undo feature
document.getElementById("undoBtn").addEventListener("click", () => {
  if (history.length > 1) {
    redoStack.push(history.pop());
    const img = new Image();
    img.src = history[history.length - 1];
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
    };
  }
});

// Redo feature
document.getElementById("redoBtn").addEventListener("click", () => {
  if (redoStack.length > 0) {
    const imgData = redoStack.pop();
    history.push(imgData);
    const img = new Image();
    img.src = imgData;
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
    };
  }
});

// Clear canvas
document.getElementById("clearBtn").addEventListener("click", () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  history = [];
  redoStack = [];
  saveState();
});

// Color picker
document.getElementById("colorPicker").addEventListener("change", (e) => {
  brushColor = e.target.value;
});

// Brush size
document.getElementById("strokeWidth").addEventListener("input", (e) => {
  brushSize = e.target.value;
});

// Tools
document.getElementById("brushBtn").addEventListener("click", () => {
  tool = "brush";
});
document.getElementById("eraserBtn").addEventListener("click", () => {
  tool = "eraser";
});

// Mouse events
canvas.addEventListener("mousedown", startDraw);
canvas.addEventListener("mousemove", draw);
canvas.addEventListener("mouseup", stopDraw);
canvas.addEventListener("mouseleave", stopDraw);

// ===== Custom Brush Cursor Logic =====
const customCursor = document.getElementById("customCursor");

canvas.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX;
  const y = e.clientY;

  // Show cursor only when inside canvas
  if (
    x >= rect.left &&
    x <= rect.right &&
    y >= rect.top &&
    y <= rect.bottom
  ) {
    customCursor.style.display = "block";
    customCursor.style.left = `${x}px`;
    customCursor.style.top = `${y}px`;
  } else {
    customCursor.style.display = "none";
  }
});

// Update cursor size dynamically based on brush size
document.getElementById("strokeWidth").addEventListener("input", (e) => {
  const size = e.target.value;
  customCursor.style.width = `${size}px`;
  customCursor.style.height = `${size}px`;
  customCursor.style.borderWidth = size > 15 ? "2px" : "1.5px";
});

// Hide cursor when mouse leaves the window
canvas.addEventListener("mouseleave", () => {
  customCursor.style.display = "none";
});

// Match cursor color with brush color
document.getElementById("colorPicker").addEventListener("input", (e) => {
  customCursor.style.borderColor = e.target.value;
});

