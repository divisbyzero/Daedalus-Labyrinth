'use strict';

// ── DOM references ────────────────────────────────────────────────────────────

const canvas = document.getElementById('gameCanvas');
const btnUndo = document.getElementById('btnUndo');
const btnRedo = document.getElementById('btnRedo');
const btnReset = document.getElementById('btnReset');
const btnShowSolution = document.getElementById('btnShowSolution');
const puzzleSelect = document.getElementById('puzzleSelect');
const statusMsg = document.getElementById('statusMsg');
const loopyInput = document.getElementById('loopyInput');
const btnLoad = document.getElementById('btnLoad');
const importError = document.getElementById('importError');
const genSize = document.getElementById('genSize');
const genDiff = document.getElementById('genDiff');
const btnGenerate = document.getElementById('btnGenerate');

// ── App state ─────────────────────────────────────────────────────────────────

let state = null;
let renderer = null;

// ── Lifecycle ─────────────────────────────────────────────────────────────────

function getClosedLoopSolutionCountUpTo2(s) {
  if (s.openMode) return null;
  const clueGrid = buildClueGridFromState(s);
  return countSolutions(clueGrid, s.cells, 2);
}

function initPuzzle(name) {
  const { state: s, label } = loadPuzzle(name);
  state = s;
  renderer = renderer || new Renderer(canvas);
  renderer.resize(state.cells);
  redraw();

  // Loopy-style puzzle instances are expected to have exactly one solution.
  const solCount = getClosedLoopSolutionCountUpTo2(state);
  if (solCount !== null && solCount !== 1) {
    statusMsg.textContent = 'This board is not a unique Loopy-style puzzle.';
    statusMsg.style.color = '#cc2222';
  } else {
    statusMsg.textContent = '';
  }
}

function redraw() {
  renderer.render(state);
  updateButtons();
  updateStatus();
}

function updateStatus() {
  if (state.checkWin()) {
    statusMsg.textContent = 'Solved!';
    statusMsg.style.color = '#228833';
  } else if (state.getErrorCellSet().size > 0) {
    statusMsg.textContent = 'Loop in labyrinth path — fix it';
    statusMsg.style.color = '#cc2222';
  } else {
    statusMsg.textContent = '';
    statusMsg.style.color = '';
  }
}

function updateButtons() {
  btnUndo.disabled = !state.canUndo;
  btnRedo.disabled = !state.canRedo;
}

function buildClueGridFromState(s) {
  const N = s.cells;
  const cg = Array.from({ length: N + 1 }, () => new Array(N + 1).fill(null));
  for (let r = 1; r < N; r++) {
    for (let c = 1; c < N; c++) {
      const v = s.clues[r][c];
      if (v !== null && v !== undefined) cg[r][c] = v;
    }
  }
  return cg;
}

function applySolvedEdgesToState(s, solved) {
  s.hEdges = solved.h.map((row) => row.slice());
  s.vEdges = solved.v.map((row) => row.slice());
  s._undoStack = [];
  s._redoStack = [];
}

// ── Mouse input ───────────────────────────────────────────────────────────────

canvas.addEventListener('mousedown', (e) => {
  e.preventDefault();

  const rect = canvas.getBoundingClientRect();
  const mx = (e.clientX - rect.left) * (canvas.offsetWidth / rect.width);
  const my = (e.clientY - rect.top) * (canvas.offsetHeight / rect.height);

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
  // reset() preserves clues and re-opens entry/exit automatically.
  state.reset();
  redraw();
});

btnShowSolution.addEventListener('click', () => {
  if (state.openMode) {
    statusMsg.textContent = 'Show solution currently supports closed-loop puzzles only.';
    statusMsg.style.color = '#cc2222';
    return;
  }

  statusMsg.textContent = 'Solving…';
  statusMsg.style.color = '';
  requestAnimationFrame(() => {
    const clueGrid = buildClueGridFromState(state);
    const solved = findOneSolution(clueGrid, state.cells);
    if (!solved) {
      statusMsg.textContent = 'No solution found for current clues.';
      statusMsg.style.color = '#cc2222';
      return;
    }
    applySolvedEdgesToState(state, solved);
    redraw();
  });
});

puzzleSelect.addEventListener('change', () => initPuzzle(puzzleSelect.value));

// ── Generate ──────────────────────────────────────────────────────────────────

btnGenerate.addEventListener('click', () => {
  const cells = parseInt(genSize.value, 10);
  const diff = parseInt(genDiff.value, 10);
  statusMsg.textContent = 'Generating…';
  statusMsg.style.color = '';
  // Defer one frame so the browser can repaint the status before the DFS runs.
  requestAnimationFrame(() => {
    try {
      state = generatePuzzle(cells, diff);
      const solCount = getClosedLoopSolutionCountUpTo2(state);
      if (solCount !== 1) {
        throw new Error('Generator produced a non-unique board. Please generate again.');
      }
      renderer = renderer || new Renderer(canvas);
      renderer.resize(cells);
      redraw();
      statusMsg.textContent = '';
    } catch (err) {
      statusMsg.textContent = err.message;
      statusMsg.style.color = '#cc2222';
    }
  });
});

// ── Loopy import ──────────────────────────────────────────────────────────────

function loadFromLoopyString(raw) {
  importError.textContent = '';
  const result = parseLoopyString(raw);
  if (result.error) {
    importError.textContent = result.error;
    return;
  }

  const imported = new GameState(result.cells);
  imported.loadClues(result.clues);
  if (result.entry && result.exit) imported.setEntryExit(result.entry, result.exit);

  // Enforce Loopy's uniqueness expectation for closed-loop imports.
  const solCount = getClosedLoopSolutionCountUpTo2(imported);
  if (solCount !== null && solCount !== 1) {
    importError.textContent = 'Imported puzzle is not uniquely solvable.';
    return;
  }

  state = imported;
  renderer.resize(result.cells);
  redraw();
  statusMsg.textContent = '';
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
