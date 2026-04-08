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

// ── Input handling (mouse + touch, with long-press → delete) ─────────────────
//
// Short press/tap : cycle the edge (same as before)
// Long press/hold : set the edge directly to Removed (EDGE_NONE), undoable
//
// Works identically on desktop and phone.

const LONG_PRESS_MS = 500;  // ms to hold before long-press fires
const MOVE_CANCEL_PX = 8;   // pixels of movement that cancels the press

let pressTimer = null;
let pressEdge = null;
let pressForward = true;
let pressStartX = 0;
let pressStartY = 0;

function getCanvasXY(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (clientX - rect.left) * (canvas.offsetWidth / rect.width),
    y: (clientY - rect.top) * (canvas.offsetHeight / rect.height),
  };
}

function startPress(clientX, clientY, forward) {
  cancelPress();
  pressForward = forward;
  pressStartX = clientX;
  pressStartY = clientY;
  const { x, y } = getCanvasXY(clientX, clientY);
  pressEdge = renderer ? renderer.findEdge(x, y, state) : null;
  if (!pressEdge) return;
  pressTimer = setTimeout(() => {
    pressTimer = null;
    state.setEdge(pressEdge.isH, pressEdge.r, pressEdge.c, EDGE_NONE);
    pressEdge = null;
    redraw();
  }, LONG_PRESS_MS);
}

function commitShortPress() {
  if (!pressTimer || !pressEdge) return; // long press already fired, or nothing pending
  clearTimeout(pressTimer);
  pressTimer = null;
  state.clickEdge(pressEdge.isH, pressEdge.r, pressEdge.c, pressForward);
  pressEdge = null;
  redraw();
}

function cancelPress() {
  if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
  pressEdge = null;
}

// ── Mouse ─────────────────────────────────────────────────────────────────────

canvas.addEventListener('mousedown', (e) => {
  e.preventDefault();
  if (!helpBackdrop.hasAttribute('hidden')) return;
  startPress(e.clientX, e.clientY, e.button === 0 && !e.ctrlKey);
});

canvas.addEventListener('mousemove', (e) => {
  if (!pressTimer) return;
  if (Math.hypot(e.clientX - pressStartX, e.clientY - pressStartY) > MOVE_CANCEL_PX)
    cancelPress();
});

canvas.addEventListener('mouseleave', cancelPress);
window.addEventListener('mouseup', commitShortPress);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// ── Touch ─────────────────────────────────────────────────────────────────────

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  if (!helpBackdrop.hasAttribute('hidden')) return;
  const t = e.changedTouches[0];
  startPress(t.clientX, t.clientY, true); // touch always cycles forward
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
  e.preventDefault();
  commitShortPress();
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
  if (!pressTimer) return;
  const t = e.changedTouches[0];
  if (Math.hypot(t.clientX - pressStartX, t.clientY - pressStartY) > MOVE_CANCEL_PX)
    cancelPress();
}, { passive: true });

canvas.addEventListener('touchcancel', cancelPress);

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
