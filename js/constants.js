'use strict';

// Edge states
const EDGE_NONE  = 0;  // deleted/removed — invisible
const EDGE_GRAY  = 1;  // unselected — light gray
const EDGE_BLACK = 2;  // selected/chosen — heavy black

// Left-click cycles forward: NONE → GRAY → BLACK → NONE
// Right-click cycles backward: BLACK → GRAY → NONE → BLACK

// Cell color codes (derived from border edge states)
const CELL = Object.freeze({
  WHITE:  'white',   // undetermined (default)
  YELLOW: 'yellow',  // exactly 2 black edges — part of labyrinth path
  GRAY:   'gray',    // 3 black edges — needs one removed or one added
  BLACK:  'black',   // 4 black edges — walled off
  RED:    'red',     // 0–1 black + 3+ deleted — illegal state
});
