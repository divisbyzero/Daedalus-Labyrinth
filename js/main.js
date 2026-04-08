'use strict';

// ── DOM references ────────────────────────────────────────────────────────────

const canvas = document.getElementById('gameCanvas');
const btnUndo = document.getElementById('btnUndo');
const btnRedo = document.getElementById('btnRedo');
const btnReset = document.getElementById('btnReset');
const btnShowSolution = document.getElementById('btnShowSolution');
const statusMsg = document.getElementById('statusMsg');
const genSize = document.getElementById('genSize');
const genDiff = document.getElementById('genDiff');
const btnGenerate = document.getElementById('btnGenerate');

// ── Help modal ────────────────────────────────────────────────────────────────

const btnHelp = document.getElementById('btnHelp');
const helpBackdrop = document.getElementById('helpBackdrop');
const helpClose = document.getElementById('helpClose');

const HELP_SEEN_KEY = 'daedalus_help_seen';
const CLOSE_DURATION_MS = 150;

function openHelpModal() {
  helpBackdrop.removeAttribute('hidden');
  helpBackdrop.classList.remove('closing');
  helpClose.focus();
  document.addEventListener('keydown', handleHelpKey);
  pauseTimer();
}

function closeHelpModal() {
  helpBackdrop.classList.add('closing');
  document.removeEventListener('keydown', handleHelpKey);
  setTimeout(() => {
    helpBackdrop.setAttribute('hidden', '');
    helpBackdrop.classList.remove('closing');
    resumeTimer();
  }, CLOSE_DURATION_MS);
}

function handleHelpKey(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    closeHelpModal();
    return;
  }
  // Trap focus within modal (only one focusable element: the close button)
  if (e.key === 'Tab') {
    e.preventDefault();
    helpClose.focus();
  }
}

btnHelp.addEventListener('click', openHelpModal);
helpClose.addEventListener('click', closeHelpModal);
helpBackdrop.addEventListener('click', (e) => {
  if (e.target === helpBackdrop) closeHelpModal();
});

// Show automatically on first visit.
if (!localStorage.getItem(HELP_SEEN_KEY)) {
  localStorage.setItem(HELP_SEEN_KEY, '1');
  // Defer until after initial render so the game is ready first.
  setTimeout(openHelpModal, 400);
}

// ── Phone detection ───────────────────────────────────────────────────────────
// Use the shorter screen dimension so landscape orientation stays restricted too.

const IS_PHONE = Math.min(screen.width, screen.height) <= 480;
if (IS_PHONE) document.body.classList.add('is-phone');

// ── App state ─────────────────────────────────────────────────────────────────

let state = null;
let renderer = null;

// ── Timer ─────────────────────────────────────────────────────────────────────

const timerDisplay = document.getElementById('timerDisplay');
const toolbarCenter = document.getElementById('toolbarCenter');
let timerStart = null;
let timerInterval = null;
let timerDone = false;
let timerPausedAt = null;

function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function startTimer() {
  stopTimer();
  timerStart = Date.now();
  timerDone = false;
  timerDisplay.textContent = '0:00';
  timerDisplay.className = 'timer-display';
  toolbarCenter.hidden = false;
  if (state) { state.solvedTime = null; state.solvedAt = null; }
  timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - timerStart) / 1000);
    timerDisplay.textContent = formatTime(elapsed);
  }, 1000);
}

function stopTimer() {
  if (timerInterval !== null) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function pauseTimer() {
  if (timerInterval === null || timerDone) return;
  timerPausedAt = Date.now();
  stopTimer();
}

function resumeTimer() {
  if (timerInterval !== null || timerDone || timerStart === null) return;
  // Shift timerStart forward by however long we were paused.
  if (timerPausedAt !== null) {
    timerStart += Date.now() - timerPausedAt;
    timerPausedAt = null;
  }
  timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - timerStart) / 1000);
    timerDisplay.textContent = formatTime(elapsed);
  }, 1000);
}

function markTimerSolved() {
  if (timerDone) return;
  timerDone = true;
  stopTimer();
  const elapsed = Math.floor((Date.now() - timerStart) / 1000);
  timerDisplay.textContent = formatTime(elapsed);
  state.solvedTime = formatTime(elapsed);
  state.solvedAt = Date.now(); // used by renderer for intro animation
  toolbarCenter.hidden = true;
  animateSolvedIntro();
}

const SOLVED_ANIM_MS = 350; // total duration of scale-in animation
function animateSolvedIntro() {
  const start = Date.now();
  function frame() {
    redraw();
    if (Date.now() - start < SOLVED_ANIM_MS) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

function getSolutionCountUpTo2(s) {
  const clueGrid = buildClueGridFromState(s);
  if (s.openMode) {
    return countSolutions(clueGrid, s.cells, 2, undefined, s.entry, s.exit);
  }
  return countSolutions(clueGrid, s.cells, 2);
}

function redraw() {
  renderer.render(state);
  updateButtons();
  updateStatus();
  if (state.checkWin() && !state.cheated) {
    markTimerSolved();
  }
}

function updateStatus() {
  statusMsg.textContent = '';
  statusMsg.style.color = '';
  statusMsg.style.background = '';
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
  if (!helpBackdrop.hasAttribute('hidden')) return; // modal is open

  const rect = canvas.getBoundingClientRect();
  const mx = (e.clientX - rect.left) * (canvas.offsetWidth / rect.width);
  const my = (e.clientY - rect.top) * (canvas.offsetHeight / rect.height);

  const edge = renderer.findEdge(mx, my, state);
  if (!edge) return;

  const forward = (e.button === 0 && !e.ctrlKey);
  state.clickEdge(edge.isH, edge.r, edge.c, forward);
  redraw();
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// Touch support (phones) — tap cycles forward; use Undo for corrections.
canvas.addEventListener('touchstart', (e) => {
  e.preventDefault(); // block scroll and the synthesised mouse event
  if (!helpBackdrop.hasAttribute('hidden')) return;
  const touch = e.changedTouches[0];
  const rect = canvas.getBoundingClientRect();
  const mx = (touch.clientX - rect.left) * (canvas.offsetWidth / rect.width);
  const my = (touch.clientY - rect.top) * (canvas.offsetHeight / rect.height);
  const edge = renderer.findEdge(mx, my, state);
  if (!edge) return;
  state.clickEdge(edge.isH, edge.r, edge.c, true); // always forward on touch
  redraw();
}, { passive: false });

// ── Buttons ───────────────────────────────────────────────────────────────────

btnUndo.addEventListener('click', () => { state.undo(); redraw(); });
btnRedo.addEventListener('click', () => { state.redo(); redraw(); });
btnReset.addEventListener('click', () => {
  // reset() preserves clues and re-opens entry/exit automatically.
  state.reset();
  startTimer();
  redraw();
});

btnShowSolution.addEventListener('click', () => {
  statusMsg.textContent = 'Solving…';
  statusMsg.style.color = '';
  statusMsg.style.background = '';
  requestAnimationFrame(() => {
    const clueGrid = buildClueGridFromState(state);
    const solved = state.openMode
      ? findOneSolution(clueGrid, state.cells, state.entry, state.exit)
      : findOneSolution(clueGrid, state.cells);
    if (!solved) {
      statusMsg.textContent = 'No solution found for current clues.';
      statusMsg.style.color = '#C47058';
      statusMsg.style.background = 'rgba(196, 112, 88, 0.15)';
      return;
    }
    state.cheated = true;
    stopTimer();
    applySolvedEdgesToState(state, solved);
    redraw();
  });
});

// ── Generate ──────────────────────────────────────────────────────────────────

function doGenerate() {
  const cells = IS_PHONE ? 6 : parseInt(genSize.value, 10);
  const diff = parseInt(genDiff.value, 10);
  statusMsg.textContent = 'Generating…';
  statusMsg.style.color = '';
  statusMsg.style.background = '';
  requestAnimationFrame(() => {
    try {
      state = generatePuzzle(cells, diff);
      const solCount = getSolutionCountUpTo2(state);
      if (solCount !== 1) {
        throw new Error('Generator produced a non-unique board. Please generate again.');
      }
      renderer = renderer || new Renderer(canvas);
      renderer.resize(cells);
      redraw();
      startTimer();
      statusMsg.textContent = '';
      statusMsg.style.background = '';
    } catch (err) {
      statusMsg.textContent = err.message;
      statusMsg.style.color = '#C47058';
      statusMsg.style.background = 'rgba(196, 112, 88, 0.15)';
    }
  });
}

btnGenerate.addEventListener('click', doGenerate);

// ── Keyboard shortcuts ────────────────────────────────────────────────────────

document.addEventListener('keydown', (e) => {
  if (!helpBackdrop.hasAttribute('hidden')) return; // modal is open — let handleHelpKey handle it
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
    e.preventDefault();
    state.undo(); redraw();
  } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
    e.preventDefault();
    state.redo(); redraw();
  }
});

// ── Boot ──────────────────────────────────────────────────────────────────────

doGenerate();
