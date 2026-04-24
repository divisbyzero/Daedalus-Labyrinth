'use strict';

// Edge states
const EDGE_NONE = 0;  // deleted/removed — invisible
const EDGE_GRAY = 1;  // unselected — light gray
const EDGE_BLACK = 2;  // selected/chosen — heavy black

// Left-click cycles forward:  GRAY → BLACK → NONE → GRAY
// Right-click cycles backward: GRAY → NONE → BLACK → GRAY

// Difficulty levels
const DIFF_BEGINNER = 0;   // constraint-prop only, extra clues kept on the board
const DIFF_NORMAL = 1;     // solvable by basic constraint propagation only
const DIFF_HARD = 2;       // may require paired-edge (dline) deductions
const DIFF_VERY_HARD = 3;  // may require trial-and-error (backtracking)

// Cell color codes (derived from border edge states)
const CELL = Object.freeze({
  WHITE: 'white',      // undetermined (default)
  PATH: 'path',       // exactly 2 black edges — part of labyrinth path
  THREESIDES: 'threesides', // 3 black edges — needs one removed or one added
  ENCLOSED: 'enclosed',   // 4 black edges — walled off
  ERROR: 'error',      // 0–1 black + 3+ deleted — illegal state
});
