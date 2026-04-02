'use strict';

// ── DOM references ────────────────────────────────────────────────────────────

const canvas        = document.getElementById('gameCanvas');
const btnUndo       = document.getElementById('btnUndo');
const btnRedo       = document.getElementById('btnRedo');
const btnReset      = document.getElementById('btnReset');
const puzzleSelect  = document.getElementById('puzzleSelect');
const statusMsg     = document.getElementById('statusMsg');
const loopyInput    = document.getElementById('loopyInput');
const btnLoad       = document.getElementById('btnLoad');
const importError   = document.getElementById('importError');

// ── App state ─────────────────────────────────────────────────────────────────

let state    = null;
let renderer = null;

// ── Lifecycle ─────────────────────────────────────────────────────────────────

function initPuzzle(name) {
  const { state: s, label } = loadPuzzle(name);
  state    = s;
  renderer = renderer || new Renderer(canvas);
  renderer.resize(state.cells);
  redraw();
  statusMsg.textContent = '';
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
  const mx     = (e.clientX - rect.left)  * (canvas.offsetWidth  / rect.width);
  const my     = (e.clientY - rect.top)   * (canvas.offsetHeight / rect.height);

  const edge = renderer.findEdge(mx, my, state);
  if (!edge) return;

  const forward = (e.button === 0);
  state.clickEdge(edge.isH, edge.r, edge.c, forward);
  redraw();
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// ── Buttons ───────────────────────────────────────────────────────────────────

btnUndo.addEventListener('click', () => { state.undo(); redraw(); });
btnRedo.addEventListener('click', () => { state.redo(); redraw(); });
btnReset.addEventListener('click', () => {
  state.reset();
  // Re-apply clues (reset clears the board but we keep the clue set)
  const def = PUZZLES[puzzleSelect.value];
  if (def) state.loadClues(def.clues);
  redraw();
});

puzzleSelect.addEventListener('change', () => initPuzzle(puzzleSelect.value));

// ── Loopy import ──────────────────────────────────────────────────────────────

function loadFromLoopyString(raw) {
  importError.textContent = '';
  const result = parseLoopyString(raw);
  if (result.error) {
    importError.textContent = result.error;
    return;
  }
  state = new GameState(result.cells);
  state.loadClues(result.clues);
  renderer.resize(result.cells);
  redraw();
  statusMsg.textContent = `${result.cells}×${result.cells} puzzle loaded.`;
}

btnLoad.addEventListener('click', () => loadFromLoopyString(loopyInput.value));
loopyInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') loadFromLoopyString(loopyInput.value);
});

// ── Keyboard shortcuts ────────────────────────────────────────────────────────

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
    e.preventDefault();
    state.undo(); redraw();
  } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
    e.preventDefault();
    state.redo(); redraw();
  }
});

// ── Boot ──────────────────────────────────────────────────────────────────────

initPuzzle(puzzleSelect.value);
