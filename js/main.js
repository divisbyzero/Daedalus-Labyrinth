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

// A hand-picked solved 5×5 puzzle shown inside How to Play.
// h/v strings use the edge-state values: 0 = removed, 2 = hedge.
const HELP_DEMO = {
  entry: { isH: false, r: 2, c: 5 },
  exit: { isH: true, r: 0, c: 3 },
  clues: [
    [1, 1, 1], [1, 2, 2], [1, 3, 1], [1, 4, 3], [2, 1, 1],
    [2, 3, 2], [2, 4, 4], [3, 1, 2], [3, 4, 2], [4, 1, 1],
  ],
  h: ['22202', '02002', '20222', '02000', '00200', '22222'],
  v: ['200222', '202022', '202020', '220222', '202202'],
};

let helpDemoRenderer = null;

function renderHelpDemo() {
  if (!helpDemoRenderer) {
    helpDemoRenderer = new Renderer(document.getElementById('helpDemoCanvas'));
  }
  const s = new GameState(5);
  s.loadClues(HELP_DEMO.clues.map(([r, c, value]) => ({ r, c, value })));
  s.hEdges = HELP_DEMO.h.map(row => [...row].map(Number));
  s.vEdges = HELP_DEMO.v.map(row => [...row].map(Number));
  s.entry = HELP_DEMO.entry;
  s.exit = HELP_DEMO.exit;
  helpDemoRenderer.sizeFixed(5, 40, 20);
  // flatView keeps the in-play look — no solved-board 3-D reveal.
  helpDemoRenderer.render(s, null, { showErrors: false }, true);
}

function openHelpModal() {
  renderHelpDemo();
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
const PREFS_VERSION = 2;
const prefs = { difficulty: 1, boardSize: 6, showErrors: true, showTimer: true, paperSize: 'letter', earlyFinish: false };

function loadPrefs() {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    if (saved.version !== PREFS_VERSION) return; // stale/unversioned save — use defaults
    if (typeof saved.difficulty === 'number') prefs.difficulty = saved.difficulty;
    if (typeof saved.boardSize === 'number') prefs.boardSize = saved.boardSize;
    if (typeof saved.showErrors === 'boolean') prefs.showErrors = saved.showErrors;
    if (typeof saved.showTimer === 'boolean') prefs.showTimer = saved.showTimer;
    if (saved.paperSize === 'letter' || saved.paperSize === 'a4') prefs.paperSize = saved.paperSize;
    if (typeof saved.earlyFinish === 'boolean') prefs.earlyFinish = saved.earlyFinish;
    else if (typeof saved.strictWin === 'boolean') prefs.earlyFinish = !saved.strictWin; // migrate old key
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
const prefPaper = document.getElementById('prefPaper');
const prefEarlyFinish = document.getElementById('prefEarlyFinish');
const btnPrint = document.getElementById('btnPrint');

function syncPrefsUI() {
  prefSize.value = String(prefs.boardSize);
  prefDiff.value = String(prefs.difficulty);
  prefShowErrors.checked = prefs.showErrors;
  prefShowTimer.checked = prefs.showTimer;
  prefPaper.value = prefs.paperSize;
  prefEarlyFinish.checked = prefs.earlyFinish;
}

// Snapshot of the game-setup prefs taken when the modal opens, used to
// detect changes that call for a new board.
let prefsSnapshot = null;

function openPrefsModal() {
  syncPrefsUI();
  prefsSnapshot = { boardSize: prefs.boardSize, difficulty: prefs.difficulty };
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
    maybeApplyNewGameSettings();
  }, CLOSE_DURATION_MS);
}

/**
 * Called when the preferences modal closes.  If board size or difficulty
 * changed: start a new game immediately when nothing would be lost (fresh,
 * solved, or revealed board); otherwise ask before discarding progress.
 */
function maybeApplyNewGameSettings() {
  if (!prefsSnapshot) return;
  const changed = prefs.boardSize !== prefsSnapshot.boardSize ||
    prefs.difficulty !== prefsSnapshot.difficulty;
  prefsSnapshot = null;
  if (!changed) return;
  const inProgress = state && state.canUndo && !state.cheated && !state.checkWin();
  if (inProgress) openConfirmModal();
  else doGenerate();
}

// ── New-game confirmation modal ──────────────────────────────────────────────

const confirmBackdrop = document.getElementById('confirmBackdrop');
const confirmMessage = document.getElementById('confirmMessage');
const btnConfirmNew = document.getElementById('confirmNew');
const btnConfirmKeep = document.getElementById('confirmKeep');

function openConfirmModal() {
  const size = `${prefs.boardSize}×${prefs.boardSize}`;
  confirmMessage.textContent =
    `Your current puzzle is still in progress. Start a new ${size} game now, ` +
    'or keep playing and use the new settings for your next game.';
  confirmBackdrop.removeAttribute('hidden');
  confirmBackdrop.classList.remove('closing');
  btnConfirmNew.focus();
  document.addEventListener('keydown', handleConfirmKey);
  requestPause('modal-confirm');
}

function closeConfirmModal(startNew) {
  confirmBackdrop.classList.add('closing');
  document.removeEventListener('keydown', handleConfirmKey);
  setTimeout(() => {
    confirmBackdrop.setAttribute('hidden', '');
    confirmBackdrop.classList.remove('closing');
    clearPause('modal-confirm');
    if (startNew) doGenerate();
  }, CLOSE_DURATION_MS);
}

function handleConfirmKey(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    closeConfirmModal(false);
    return;
  }
  if (e.key === 'Tab') {
    e.preventDefault();
    (document.activeElement === btnConfirmNew ? btnConfirmKeep : btnConfirmNew).focus();
  }
}

btnConfirmNew.addEventListener('click', () => closeConfirmModal(true));
btnConfirmKeep.addEventListener('click', () => closeConfirmModal(false));
confirmBackdrop.addEventListener('click', (e) => {
  if (e.target === confirmBackdrop) closeConfirmModal(false);
});

function handlePrefsKey(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    closePrefsModal();
    return;
  }
  if (e.key === 'Tab') {
    e.preventDefault();
    const focusable = [prefsClose, prefSize, prefDiff, prefEarlyFinish, prefShowErrors, prefShowTimer, prefPaper];
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

prefPaper.addEventListener('change', () => {
  prefs.paperSize = prefPaper.value;
  savePrefs();
});

prefEarlyFinish.addEventListener('change', () => {
  prefs.earlyFinish = prefEarlyFinish.checked;
  savePrefs();
  // Applies to the current game too; enabling it may complete the game on
  // the spot if the path is already bounded.
  if (state) {
    state.strictWin = !prefs.earlyFinish;
    redraw();
  }
});

function downloadPuzzlePdf() {
  if (!state) return;
  const pdf = buildPuzzlePdf(state, prefs.paperSize);
  const blob = new Blob([pdf], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `daedalus-labyrinth-${state.cells}x${state.cells}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

btnPrint.addEventListener('click', downloadPuzzlePdf);

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
  } else if (timerStart !== null) {
    // Running timer or, after a win, the "Solved!" banner.
    if (timerDone && state && state.solvedTime) {
      timerDisplay.textContent = `Solved! · ${state.solvedTime}`;
    }
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
  if (prefs.boardSize > 7) { prefs.boardSize = 7; savePrefs(); }
}

// ── App state ─────────────────────────────────────────────────────────────────

let state = null;
let renderer = null;

// ── Timer ─────────────────────────────────────────────────────────────────────

const timerDisplay = document.getElementById('timerDisplay');
const toolbarCenter = document.getElementById('toolbarCenter');
const btnViewToggle = document.getElementById('btnViewToggle');

// Post-win view toggle: false = 3-D labyrinth, true = flat clue board.
let solvedViewFlat = false;

function updateViewToggleLabel() {
  btnViewToggle.textContent = solvedViewFlat ? 'View labyrinth' : 'View solution';
}

function showViewToggle(flat = false) {
  solvedViewFlat = flat;
  updateViewToggleLabel();
  btnViewToggle.hidden = false;
}

btnViewToggle.addEventListener('click', () => {
  solvedViewFlat = !solvedViewFlat;
  updateViewToggleLabel();
  if (!solvedViewFlat && state && !state.solvedAt) {
    // First look at the labyrinth (the solution was shown flat) — run the
    // rise animation now.
    state.solvedAt = Date.now();
    animateSolvedIntro();
  }
  redraw();
});
let timerStart = null;
let timerInterval = null;
let timerDone = false;
let timerPausedAt = null;
const pauseReasons = new Set();

function isGamePaused() {
  return pauseReasons.size > 0;
}

function getPauseMessage() {
  return 'Game Paused';
}

function updatePauseUI() {
  const paused = isGamePaused();
  const canvasWidth = canvas.offsetWidth;
  const canvasHeight = canvas.offsetHeight;

  if (canvasWidth > 0 && canvasHeight > 0) {
    pauseOverlay.style.width = `${canvasWidth}px`;
    pauseOverlay.style.height = `${canvasHeight}px`;
  }

  if (renderer) {
    pauseOverlay.style.setProperty('--pause-cell', `${renderer._cellSize}px`);
    pauseOverlay.style.setProperty('--pause-margin', `${renderer._margin}px`);
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

/**
 * A deliberate game action (New Game, Show Solution, Reset) means the
 * player is back at the board — lift any manual or away-from-tab pause.
 * (Modal pauses are unaffected; these buttons can't be clicked while a
 * modal is open.)
 */
function resumeFromPause() {
  clearPause('manual');
  clearPause('visibility');
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

function updateTimerDisplay() {
  timerDisplay.textContent = formatTime(Math.floor((Date.now() - timerStart) / 1000));
}

function startTimerInterval() {
  updateTimerDisplay();
  timerInterval = setInterval(updateTimerDisplay, 1000);
}

function startTimer() {
  stopTimer();
  timerStart = Date.now();
  timerDone = false;
  timerPausedAt = null;
  timerDisplay.textContent = '0:00';
  timerDisplay.className = 'timer-display';
  timerDisplay.hidden = false;
  solvedViewFlat = false;
  btnViewToggle.hidden = true;
  toolbarCenter.hidden = !prefs.showTimer;
  if (state) { state.solvedTime = null; state.solvedAt = null; }
  if (isGamePaused()) {
    // Record the pause start so resumeTimer() excludes the paused span.
    timerPausedAt = Date.now();
    updatePauseUI();
    return;
  }
  startTimerInterval();
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
  startTimerInterval();
}

function markTimerSolved() {
  if (timerDone) return;
  timerDone = true;
  stopTimer();
  const elapsed = Math.floor((Date.now() - timerStart) / 1000);
  state.solvedTime = formatTime(elapsed);
  state.solvedAt = Date.now(); // drives the labyrinth reveal animation
  // The timer slot becomes the celebration banner (it covers nothing there).
  timerDisplay.textContent = prefs.showTimer
    ? `Solved! · ${state.solvedTime}`
    : 'Solved!';
  timerDisplay.classList.add('timer-display--solved');
  toolbarCenter.hidden = false;
  showViewToggle();
  animateSolvedIntro();
}

// Keep redrawing until the labyrinth reveal (SOLVED_REVEAL_MS, defined in
// render.js) has finished.
function animateSolvedIntro() {
  const start = Date.now();
  function frame() {
    redraw();
    if (Date.now() - start < SOLVED_REVEAL_MS) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

/**
 * Run `fn` once, after the browser has painted the current frame — so a
 * status message set just before a long synchronous task actually appears.
 * requestAnimationFrame alone runs *before* paint (hence the nested timeout),
 * and rAF may never fire at all in a throttled/hidden tab (hence the
 * plain-timeout fallback racing it).
 */
function afterPaint(fn) {
  let done = false;
  const run = () => { if (!done) { done = true; fn(); } };
  requestAnimationFrame(() => setTimeout(run, 0));
  setTimeout(run, 250);
}

function setStatus(msg, isError = false) {
  statusMsg.textContent = msg;
  statusMsg.style.color = isError ? '#C47058' : '';
  statusMsg.style.background = isError ? 'rgba(196, 112, 88, 0.15)' : '';
}

// ── Error-highlight grace period ─────────────────────────────────────────────
// Cycling an edge (Undecided → Hedge → Removed) means a double click passes
// through the Hedge state; without a grace period the board flashes red
// between the two clicks.  Edge changes apply instantly — only the error
// highlighting waits for input to go idle.

const ERROR_GRACE_MS = 350;
let errorGraceUntil = 0;
let errorGraceTimer = null;

function deferErrorHighlights() {
  errorGraceUntil = Date.now() + ERROR_GRACE_MS;
  clearTimeout(errorGraceTimer);
  errorGraceTimer = setTimeout(redraw, ERROR_GRACE_MS + 15);
}

function redraw() {
  // Mark the win before rendering so the reveal animation starts from its
  // first frame (render reads state.solvedAt for the transformation).
  if (state.checkWin() && !state.cheated) {
    markTimerSolved();
  } else if (!btnViewToggle.hidden && !state.checkWin()) {
    // Board was edited after being solved — the view toggle no longer applies.
    btnViewToggle.hidden = true;
    solvedViewFlat = false;
  }
  const effectivePrefs = Date.now() < errorGraceUntil
    ? { ...prefs, showErrors: false }
    : prefs;
  renderer.render(state, pressEdge, effectivePrefs, solvedViewFlat);
  updatePauseUI();
  updateButtons();
  updateStatus();
}

function updateStatus() {
  setStatus('');
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
  deferErrorHighlights();
  redraw();
}

function cancelPress() {
  if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
  const hadEdge = pressEdge !== null;
  pressEdge = null;
  if (hadEdge && renderer && state) redraw(); // clear the highlight
}

// ── Mouse ─────────────────────────────────────────────────────────────────────

function anyModalOpen() {
  return !helpBackdrop.hasAttribute('hidden') ||
    !prefsBackdrop.hasAttribute('hidden') ||
    !confirmBackdrop.hasAttribute('hidden');
}

canvas.addEventListener('mousedown', (e) => {
  e.preventDefault();
  if (e.button !== 0 && e.button !== 2) return; // ignore middle/extra buttons
  if (isGamePaused() || anyModalOpen()) return;
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
  if (isGamePaused() || anyModalOpen()) return;
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

btnUndo.addEventListener('click', () => { if (state) { state.undo(); redraw(); } });
btnRedo.addEventListener('click', () => { if (state) { state.redo(); redraw(); } });
btnReset.addEventListener('click', () => {
  if (!state) return;
  resumeFromPause();
  // reset() preserves clues and re-opens entry/exit automatically.
  state.reset();
  startTimer();
  redraw();
});

btnShowSolution.addEventListener('click', () => {
  if (!state) return;
  resumeFromPause();
  setStatus('Solving…');
  afterPaint(() => {
    const clueGrid = buildClueGridFromState(state);
    const solved = state.openMode
      ? findOneSolution(clueGrid, state.cells, state.entry, state.exit)
      : findOneSolution(clueGrid, state.cells);
    if (!solved) {
      setStatus('No solution found for current clues.', true);
      return;
    }
    state.cheated = true;
    // Freeze the timer for good — prevents pause/resume from restarting it.
    stopTimer();
    timerDone = true;
    // No banner for a revealed solution.  It opens in the flat annotated
    // view; "View labyrinth" runs the 3-D rise on demand (solvedAt stays
    // unset until then so the rise animates on first viewing).
    timerDisplay.hidden = true;
    toolbarCenter.hidden = false;
    showViewToggle(true);
    applySolvedEdgesToState(state, solved);
    redraw();
  });
});

// ── Generate ──────────────────────────────────────────────────────────────────

function doGenerate() {
  resumeFromPause();
  const cells = prefs.boardSize;
  const diff = prefs.difficulty;
  setStatus('Generating…');
  afterPaint(() => {
    try {
      state = generatePuzzle(cells, diff);
      state.strictWin = !prefs.earlyFinish;
      renderer = renderer || new Renderer(canvas);
      renderer.resize(cells);
      redraw();
      startTimer();
      setStatus('');
    } catch (err) {
      setStatus(err.message, true);
    }
  });
}

btnGenerate.addEventListener('click', doGenerate);

// ── Keyboard shortcuts ────────────────────────────────────────────────────────

document.addEventListener('keydown', (e) => {
  // A modal is open — its own key handler owns the keyboard.
  if (!helpBackdrop.hasAttribute('hidden')) return;
  if (!prefsBackdrop.hasAttribute('hidden')) return;
  if (!confirmBackdrop.hasAttribute('hidden')) return;
  if (isGamePaused() && e.key !== 'Escape') return;
  if (!state) return;
  const key = e.key.toLowerCase(); // Shift+Z reports 'Z' — normalize
  if ((e.ctrlKey || e.metaKey) && key === 'z' && !e.shiftKey) {
    e.preventDefault();
    state.undo(); redraw();
  } else if ((e.ctrlKey || e.metaKey) && (key === 'y' || (e.shiftKey && key === 'z'))) {
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

// Re-fit the board when the window is resized or the device rotates.
let resizeDebounce = null;
window.addEventListener('resize', () => {
  if (!state || !renderer) return;
  clearTimeout(resizeDebounce);
  resizeDebounce = setTimeout(() => {
    renderer.resize(state.cells);
    redraw();
  }, 150);
});

// ── Boot ──────────────────────────────────────────────────────────────────────

doGenerate();
