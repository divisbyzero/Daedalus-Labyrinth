'use strict';

/**
 * Parse a Loopy game string (or full URL) and return a DL puzzle definition.
 *
 * Loopy game string format:  NxN[tK]:clue_data
 *   N        — grid size (we only support square, so both dimensions must match)
 *   tK       — grid type (optional; we only handle t0 = square, the default)
 *   clue_data — run-length-encoded clue list, read left-to-right, top-to-bottom:
 *                 digit '0'–'3' → clue value at the current face
 *                 letter 'a'–'z' → skip (charCode − 96) faces with no clue
 *                                   ('a'=1, 'b'=2, … 'z'=26)
 *
 * DL conversion:
 *   Loopy face at (r, c) → DL interior vertex at (r+1, c+1)
 *   DL clue value = 4 − Loopy face number
 *
 * Returns an object:
 *   { cells, clues }   on success  (cells = N+1, clues = [{r,c,value}, …])
 *   { error }          on failure
 */
function parseLoopyString(raw) {
  // If the user pasted a full URL, extract the fragment.
  const hashIdx = raw.indexOf('#');
  const input = (hashIdx >= 0 ? raw.slice(hashIdx + 1) : raw).trim();

  // Match:  NxN  or  NxNtK  followed by a colon and the clue data.
  const m = input.match(/^(\d+)x(\d+)(?:t\d+)?:(.*)$/i);
  if (!m) {
    return { error: 'Could not parse game string. Expected format: NxN:… or NxNt0:…' };
  }

  const W    = parseInt(m[1], 10);
  const H    = parseInt(m[2], 10);
  const data = m[3];

  if (W !== H) {
    return { error: `Only square grids are supported (got ${W}×${H}).` };
  }
  if (W < 2 || W > 20) {
    return { error: `Grid size ${W} is out of the supported range (2–20).` };
  }

  // Decode run-length clue data into a W×H grid (null = no clue).
  const grid = Array.from({ length: H }, () => new Array(W).fill(null));
  let pos = 0;

  for (const ch of data) {
    if (ch >= '0' && ch <= '3') {
      if (pos < W * H) {
        grid[Math.floor(pos / W)][pos % W] = parseInt(ch, 10);
      }
      pos++;
    } else if (ch >= 'a' && ch <= 'z') {
      pos += ch.charCodeAt(0) - 96; // 'a'→1, 'b'→2, …
    }
    // ignore any other characters (spaces, etc.)
  }

  // Convert Loopy face clues → DL interior vertex clues.
  const clues = [];
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      if (grid[r][c] !== null) {
        clues.push({ r: r + 1, c: c + 1, value: 4 - grid[r][c] });
      }
    }
  }

  return { cells: W + 1, clues };
}
