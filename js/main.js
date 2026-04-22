'use strict';

// ── DOM references ────────────────────────────────────────────────────────────

const canvas = document.getElementById('gameCanvas');
const btnUndo = document.getElementById('btnUndo');
const btnRedo = document.getElementById('btnRedo');
const btnReset = document.getElementById('btnReset');
const btnPause = document.getElementById('btnPause');
const btnShowSolution = document.getElementById('btnShowSolution');
const statusMsg = document.getElementById('statusMsg');
const btnGenerate = document.getElementById('btnGenerate');
const canvasWrapper = document.getElementById('canvasWrapper');
const pauseOverlay = document.getElementById('pauseOverlay');
const pauseMessage = document.getElementById('pauseMessage');
const btnResumeOverlay = document.getElementById('btnResumeOverlay');

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
  requestPause('modal-help');
}

function closeHelpModal() {
  helpBackdrop.classList.add('closing');
  document.removeEventListener('keydown', handleHelpKey);
  setTimeout(() => {
    helpBackdrop.setAttribute('hidden', '');
    helpBackdrop.classList.remove('closing');
    clearPause('modal-help');
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

// ── Preferences ──────────────────────────────────────────────────────────────────

const PREFS_KEY = 'daedalus_prefs';
const PREFS_VERSION = 1;
const IS_PHONE_DEFAULT_SIZE = Math.min(screen.width, screen.height) <= 480 ? 7 : 10;
const prefs = { difficulty: 0, boardSize: IS_PHONE_DEFAULT_SIZE, showErrors: true, showTimer: true };

function loadPrefs() {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    if (saved.version !== PREFS_VERSION) return; // stale/unversioned save — use defaults
    if (typeof saved.difficulty === 'number') prefs.difficulty = saved.difficulty;
    if (typeof saved.boardSize === 'number') prefs.boardSize = saved.boardSize;
    if (typeof saved.showErrors === 'boolean') prefs.showErrors = saved.showErrors;
    if (typeof saved.showTimer === 'boolean') prefs.showTimer = saved.showTimer;
  } catch (_) { }
}

function savePrefs() {
  localStorage.setItem(PREFS_KEY, JSON.stringify({ version: PREFS_VERSION, ...prefs }));
}

// Prefs modal DOM refs
const btnPrefs = document.getElementById('btnPrefs');
const prefsBackdrop = document.getElementById('prefsBackdrop');
const prefsClose = document.getElementById('prefsClose');
const prefSize = document.getElementById('prefSize');
const prefDiff = document.getElementById('prefDiff');
const prefShowErrors = document.getElementById('prefShowErrors');
const prefShowTimer = document.getElementById('prefShowTimer');

function syncPrefsUI() {
  prefSize.value = String(prefs.boardSize);
  prefDiff.value = String(prefs.difficulty);
  prefShowErrors.checked = prefs.showErrors;
  prefShowTimer.checked = prefs.showTimer;
}

function openPrefsModal() {
  syncPrefsUI();
  prefsBackdrop.removeAttribute('hidden');
  prefsBackdrop.classList.remove('closing');
  prefsClose.focus();
  document.addEventListener('keydown', handlePrefsKey);
  requestPause('modal-prefs');
}

function closePrefsModal() {
  prefsBackdrop.classList.add('closing');
  document.removeEventListener('keydown', handlePrefsKey);
  setTimeout(() => {
    prefsBackdrop.setAttribute('hidden', '');
    prefsBackdrop.classList.remove('closing');
    clearPause('modal-prefs');
  }, CLOSE_DURATION_MS);
}

function handlePrefsKey(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    closePrefsModal();
    return;
  }
  if (e.key === 'Tab') {
    e.preventDefault();
    const focusable = [prefsClose, prefSize, prefDiff, prefShowErrors, prefShowTimer];
    const idx = focusable.indexOf(document.activeElement);
    const next = e.shiftKey
      ? (idx - 1 + focusable.length) % focusable.length
      : (idx + 1) % focusable.length;
    focusable[next].focus();
  }
}

btnPrefs.addEventListener('click', openPrefsModal);
prefsClose.addEventListener('click', closePrefsModal);
prefsBackdrop.addEventListener('click', (e) => {
  if (e.target === prefsBackdrop) closePrefsModal();
});

prefSize.addEventListener('change', () => {
  prefs.boardSize = parseInt(prefSize.value, 10);
  savePrefs();
});

prefDiff.addEventListener('change', () => {
  prefs.difficulty = parseInt(prefDiff.value, 10);
  savePrefs();
});

prefShowErrors.addEventListener('change', () => {
  prefs.showErrors = prefShowErrors.checked;
  savePrefs();
  if (state) redraw();
});

prefShowTimer.addEventListener('change', () => {
  prefs.showTimer = prefShowTimer.checked;
  savePrefs();
  if (!prefs.showTimer) {
    toolbarCenter.hidden = true;
  } else if (!timerDone && timerStart !== null) {
    toolbarCenter.hidden = false;
  }
  if (state) redraw();
});

loadPrefs();

// ── Phone detection ───────────────────────────────────────────────────────────
// Use the shorter screen dimension so landscape orientation stays restricted too.

const IS_PHONE = Math.min(screen.width, screen.height) <= 480;
if (IS_PHONE) document.body.classList.add('is-phone');

// On phones, limit board size options to 7×7 max.
if (IS_PHONE) {
  Array.from(prefSize.options)
    .filter(o => parseInt(o.value, 10) > 7)
    .forEach(o => o.remove());
  // Clamp any saved boardSize that exceeds the phone limit.
  if (prefs.boardSize > 7) { prefs.boardSize = 6; savePrefs(); }
}

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
const pauseReasons = new Set();

function isGamePaused() {
  return pauseReasons.size > 0;
}

function getPauseMessage() {
  if (pauseReasons.has('visibility')) return 'Game paused because the page lost focus';
  return 'Game paused';
}

function updatePauseUI() {
  const paused = isGamePaused();
  const canvasWidth = canvas.offsetWidth;
  const canvasHeight = canvas.offsetHeight;

  if (canvasWidth > 0 && canvasHeight > 0) {
    pauseOverlay.style.width = `${canvasWidth}px`;
    pauseOverlay.style.height = `${canvasHeight}px`;
  }

  canvasWrapper.classList.toggle('paused', paused);
  pauseOverlay.hidden = !paused;
  pauseMessage.textContent = getPauseMessage();
  btnPause.textContent = paused ? 'Resume' : 'Pause';
  btnPause.setAttribute('aria-pressed', String(paused));
}

function requestPause(reason) {
  if (pauseReasons.has(reason)) return;
  pauseReasons.add(reason);
  cancelPress();
  pauseTimer();
  updatePauseUI();
}

function clearPause(reason) {
  if (!pauseReasons.has(reason)) return;
  pauseReasons.delete(reason);
  if (!isGamePaused()) {
    resumeTimer();
  }
  updatePauseUI();
}

function toggleManualPause() {
  if (isGamePaused()) {
    clearPause('manual');
    clearPause('visibility');
    return;
  }
  requestPause('manual');
}

function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function startTimer() {
  stopTimer();
  timerStart = Date.now();
  timerDone = false;
  timerPausedAt = null;
  timerDisplay.textContent = '0:00';
  timerDisplay.className = 'timer-display';
  toolbarCenter.hidden = !prefs.showTimer;
  if (state) { state.solvedTime = null; state.solvedAt = null; }
  if (isGamePaused()) {
    updatePauseUI();
    return;
  }
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
  if (timerInterval === null || timerDone || timerStart === null) return;
  timerPausedAt = Date.now();
  stopTimer();
}

function resumeTimer() {
  if (timerInterval !== null || timerDone || timerStart === null || isGamePaused()) return;
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
  renderer.render(state, pressEdge, prefs);
  updatePauseUI();
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
let isTouch = false;

function getCanvasXY(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (clientX - rect.left) * (canvas.offsetWidth / rect.width),
    y: (clientY - rect.top) * (canvas.offsetHeight / rect.height),
  };
}

function startPress(clientX, clientY, forward, isTouchEvent = false) {
  cancelPress();
  isTouch = isTouchEvent;
  pressForward = forward;
  pressStartX = clientX;
  pressStartY = clientY;
  const { x, y } = getCanvasXY(clientX, clientY);
  pressEdge = renderer ? renderer.findEdge(x, y, state) : null;
  if (!pressEdge) return;
  if (isTouch) redraw(); // show highlight immediately only for touch
  pressTimer = setTimeout(() => {
    pressTimer = null;
    if (navigator.vibrate) navigator.vibrate(40);
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
  const hadEdge = pressEdge !== null;
  pressEdge = null;
  if (hadEdge && renderer && state) redraw(); // clear the highlight
}

// ── Mouse ─────────────────────────────────────────────────────────────────────

canvas.addEventListener('mousedown', (e) => {
  e.preventDefault();
  if (isGamePaused()) return;
  if (!helpBackdrop.hasAttribute('hidden') || !prefsBackdrop.hasAttribute('hidden')) return;
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
  if (isGamePaused()) return;
  if (!helpBackdrop.hasAttribute('hidden') || !prefsBackdrop.hasAttribute('hidden')) return;
  const t = e.changedTouches[0];
  startPress(t.clientX, t.clientY, true, true); // true = touch event
}, { passive: false });

btnPause.addEventListener('click', toggleManualPause);
btnResumeOverlay.addEventListener('click', toggleManualPause);

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
  const cells = prefs.boardSize;
  const diff = prefs.difficulty;
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
  if (!prefsBackdrop.hasAttribute('hidden')) return;
  if (isGamePaused() && e.key !== 'Escape') return;
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
    e.preventDefault();
    state.undo(); redraw();
  } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
    e.preventDefault();
    state.redo(); redraw();
  } else if (e.key === 'Escape' && isGamePaused()) {
    e.preventDefault();
    toggleManualPause();
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    requestPause('visibility');
  }
});

window.addEventListener('blur', () => {
  requestPause('visibility');
});

// ── Boot ──────────────────────────────────────────────────────────────────────

doGenerate();
