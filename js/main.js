'use strict';

// ── DOM references ────────────────────────────────────────────────────────────

const canvas      = document.getElementById('gameCanvas');
const btnUndo     = document.getElementById('btnUndo');
const btnRedo     = document.getElementById('btnRedo');
const btnReset    = document.getElementById('btnReset');
const gridSelect  = document.getElementById('gridSize');
const statusMsg   = document.getElementById('statusMsg');

// ── App state ─────────────────────────────────────────────────────────────────

let state    = null;
let renderer = null;

// ── Lifecycle ─────────────────────────────────────────────────────────────────

function initGame(cells) {
  state    = new GameState(cells);
  renderer = new Renderer(canvas);
  renderer.resize(cells);
  redraw();
}

function redraw() {
  renderer.render(state);
  updateButtons();
}

function updateButtons() {
  btnUndo.disabled = !state.canUndo;
  btnRedo.disabled = !state.canRedo;
}

// ── Mouse input ───────────────────────────────────────────────────────────────

canvas.addEventListener('mousedown', (e) => {
  e.preventDefault();

  const rect   = canvas.getBoundingClientRect();
  const scaleX = canvas.offsetWidth  / rect.width;   // account for any CSS zoom
  const scaleY = canvas.offsetHeight / rect.height;
  const mx     = (e.clientX - rect.left)  * scaleX;
  const my     = (e.clientY - rect.top)   * scaleY;

  const edge = renderer.findEdge(mx, my, state);
  if (!edge) return;

  // Left click = forward (none→gray→black), right click = backward
  const forward = (e.button === 0);
  state.clickEdge(edge.isH, edge.r, edge.c, forward);
  redraw();
});

// Suppress the browser context menu so right-click works as a game action.
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// ── Buttons ───────────────────────────────────────────────────────────────────

btnUndo.addEventListener('click', () => { state.undo(); redraw(); });
btnRedo.addEventListener('click', () => { state.redo(); redraw(); });
btnReset.addEventListener('click', () => { state.reset(); redraw(); });

gridSelect.addEventListener('change', () => {
  initGame(Number(gridSelect.value));
});

// ── Keyboard shortcuts ────────────────────────────────────────────────────────

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
    e.preventDefault();
    state.undo();
    redraw();
  } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
    e.preventDefault();
    state.redo();
    redraw();
  }
});

// ── Boot ──────────────────────────────────────────────────────────────────────

initGame(Number(gridSelect.value));
