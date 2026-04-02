'use strict';

/**
 * Puzzle definition format:
 *   cells  — number of cells per side (DL board is cells × cells)
 *   clues  — array of { r, c, value } where r,c are vertex indices (0-based)
 *            and value is 1–4 (= 4 − Loopy face number)
 *
 * Vertex (r, c) corresponds to the Loopy face at position (r-1, c-1) on the
 * n×n Loopy grid (interior vertices only; boundary vertices have no Loopy face).
 * Clue value = 4 − (Loopy face number).
 */

// ── Sample from the PDF (9×9 Loopy → 10×10 DL, 11×11 vertices) ──────────────
//
// Loopy face numbers read left-to-right, top-to-bottom from the PDF image.
// DL vertex (r, c) ↔ Loopy face (r-1, c-1) for r,c ∈ [1..9].
// DL clue = 4 − Loopy number.
//
// Loopy board (9×9), rows 0–8, cols 0–8 (blank = no clue):
//   Row 0:  3  _  _  3  2  _  2  _  _
//   Row 1:  _  _  _  2  2  1  _  _  _
//   Row 2:  3  0  1  2  2  _  _  3  _
//   Row 3:  3  1  _  _  2  2  _  0  _  2
//   Row 4:  2  _  _  _  0  1  _  _  3  1
//   Row 5:  3  2  2  _  1  _  _  1  2  _
//   Row 6:  _  _  _  3  1  _  _  1  _  _
//   Row 7:  _  1  _  3  2  2  _  _  0  2
//   Row 8:  _  2  _  1  _  _  1  _  _  _
//   Row 9:  _  1  _  _  2  3  2  _  _  1  (only for 10×10 Loopy)
//
// NOTE: The exact clue positions are approximated from the PDF image.
// They will be replaced with the verified puzzle data in a future phase.

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

  'blank-4': {
    label: 'Blank 4×4',
    cells: 4,
    clues: [],
  },

  'blank-6': {
    label: 'Blank 6×6',
    cells: 6,
    clues: [],
  },

  'demo-4': {
    label: 'Demo 4×4 (with clues)',
    cells: 4,
    // Only interior vertices get clues (r,c ∈ [1..cells-1]).
    // These correspond to the 3×3 Loopy faces: DL clue = 4 − Loopy value.
    // Loopy values used here (for illustration): all 2s → DL clue 2 everywhere,
    // with a couple of 1s (→ clue 3) and 3s (→ clue 1) for variety.
    clues: [
      { r:1, c:1, value:2 }, { r:1, c:2, value:3 }, { r:1, c:3, value:2 },
      { r:2, c:1, value:3 }, { r:2, c:2, value:4 }, { r:2, c:3, value:3 },
      { r:3, c:1, value:2 }, { r:3, c:2, value:3 }, { r:3, c:3, value:2 },
    ],
  },

  'sample-pdf': {
    label: 'Sample from PDF (10×10)',
    cells: 10,
    clues: SAMPLE_LOOPY_9x9.map(([lr, lc, lv]) => ({
      r: lr + 1,
      c: lc + 1,
      value: 4 - lv,
    })),
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
  return { state, label: def.label };
}
