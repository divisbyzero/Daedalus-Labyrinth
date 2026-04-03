'use strict';

/**
 * Puzzle definition format:
 *   cells  — number of cells per side (DL board is cells × cells)
 *   clues  — array of { r, c, value } where r,c are vertex indices (0-based)
 *            and value is 1–4 (= 4 − Loopy face number)
 *   entry  — { isH, r, c } identifying the entrance perimeter edge, or null
 *   exit   — { isH, r, c } identifying the exit perimeter edge, or null
 *
 * entry/exit null → closed-labyrinth mode (objective: single closed loop).
 * entry/exit set  → open-labyrinth mode   (objective: path from entry to exit).
 *
 * Perimeter edge conventions:
 *   Top edge at col c:    { isH: true,  r: 0,     c }
 *   Bottom edge at col c: { isH: true,  r: cells, c }
 *   Left edge at row r:   { isH: false, r,         c: 0     }
 *   Right edge at row r:  { isH: false, r,         c: cells }
 */

// ── Sample from the PDF (9×9 Loopy → 10×10 DL, 11×11 vertices) ──────────────
const SAMPLE_LOOPY_9x9 = [
  // [loopy_row, loopy_col, loopy_value]  →  DL vertex (r+1, c+1), DL clue = 4-v
  [0,0,3],[0,3,3],[0,4,2],[0,6,2],
  [1,3,2],[1,4,2],[1,5,1],
  [2,0,3],[2,1,0],[2,2,1],[2,3,2],[2,4,2],[2,7,3],
  [3,0,3],[3,1,1],[3,4,2],[3,5,2],[3,7,0],[3,9,2],
  [4,0,2],[4,4,0],[4,5,1],[4,8,3],[4,9,1],
  [5,0,3],[5,1,2],[5,2,2],[5,4,1],[5,7,1],[5,8,2],
  [6,3,3],[6,4,1],[6,7,1],
  [7,1,1],[7,3,3],[7,4,2],[7,5,2],[7,8,0],[7,9,2],
  [8,1,2],[8,3,1],[8,6,1],
];

// ── Puzzle registry ───────────────────────────────────────────────────────────

const PUZZLES = {

  // Closed-loop puzzles (derived from Loopy): entry/exit are null.
  // Open-mode puzzles require separate generation — see Phase 6.

  'blank-4': {
    label: 'Blank 4×4',
    cells: 4,
    clues: [],
    entry: null, exit: null,
  },

  'blank-6': {
    label: 'Blank 6×6',
    cells: 6,
    clues: [],
    entry: null, exit: null,
  },

  'demo-4': {
    label: 'Demo 4×4 (with clues)',
    cells: 4,
    clues: [
      { r:1, c:1, value:2 }, { r:1, c:2, value:3 }, { r:1, c:3, value:2 },
      { r:2, c:1, value:3 }, { r:2, c:2, value:4 }, { r:2, c:3, value:3 },
      { r:3, c:1, value:2 }, { r:3, c:2, value:3 }, { r:3, c:3, value:2 },
    ],
    entry: null, exit: null,
  },

  'sample-pdf': {
    label: 'Sample from PDF (10×10)',
    cells: 10,
    clues: SAMPLE_LOOPY_9x9.map(([lr, lc, lv]) => ({
      r: lr + 1, c: lc + 1, value: 4 - lv,
    })),
    entry: null, exit: null,
  },

};

/**
 * Build a fresh GameState for the named puzzle.
 * Returns { state, label } or throws if name unknown.
 */
function loadPuzzle(name) {
  const def = PUZZLES[name];
  if (!def) throw new Error(`Unknown puzzle: ${name}`);
  const state = new GameState(def.cells);
  state.loadClues(def.clues);
  if (def.entry && def.exit) state.setEntryExit(def.entry, def.exit);
  return { state, label: def.label };
}
