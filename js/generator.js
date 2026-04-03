'use strict';

/**
 * Puzzle generator for Daedalus's Labyrinth.
 *
 * Modelled after Simon Tatham's Loopy generator (loopy.c / loopgen.c):
 *
 *  Phase 1  Generate a random simple cycle on the N×N cell grid.
 *           (Analogous to loopgen.c generate_loop() — produces one closed
 *           loop, not necessarily visiting every cell.)
 *
 *  Phase 2  Extract vertex clues from the solution: for each interior vertex,
 *           count its BLACK (wall) adjacent edges.
 *           (Direct port of loopy.c add_full_clues().)
 *
 *  Phase 3  Greedy random clue removal: visit every clue in random order;
 *           tentatively remove it; keep the removal only if the puzzle is
 *           still uniquely solvable.
 *           (Direct port of loopy.c remove_clues().)
 *
 *  Uniqueness testing uses constraint propagation — vertex-clue forcing and
 *  per-cell degree parity forcing (degree 0 or 2) — with backtracking DFS
 *  that stops as soon as a second solution is found.
 *  (Analogous to loopy.c game_has_unique_soln() / solve_game_rec().)
 */

// ── Utilities ─────────────────────────────────────────────────────────────────

/** Fisher-Yates shuffle — mutates arr and returns it. */
function _shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

// ── Phase 1: Random loop generation via face colouring ────────────────────────

/**
 * Port of loopgen.c generate_loop() for a square grid.
 *
 * Colours every cell of the N×N grid BLACK (outside) or WHITE (inside).
 * The boundary between BLACK and WHITE regions forms a single closed loop
 * that defines the doorway edges.
 *
 * Returns { hS, vS } edge arrays:
 *   hS[r][c]   r ∈ [0..N], c ∈ [0..N-1]   — horizontal edges
 *   vS[r][c]   r ∈ [0..N-1], c ∈ [0..N]   — vertical edges
 * Each entry is EDGE_NONE (doorway, on the loop) or EDGE_BLACK (wall).
 */
function generateLoop(N) {
  const GREY = 0, WHITE = 1, BLACK = 2;

  // board[r][c] — colour of each cell; starts GREY.
  const board = Array.from({ length: N }, () => new Int8Array(N)); // 0 = GREY

  // For the exterior "virtual face": always BLACK.
  // A cell is adjacent to the exterior if it's on the perimeter row/col.
  function faceColour(r, c) {
    if (r < 0 || r >= N || c < 0 || c >= N) return BLACK; // exterior
    return board[r][c];
  }

  // Neighbours of cell (r,c): the 4 orthogonal cells + exterior represented as null.
  // We return [{r,c}] for real cells, but for scoring/adjacency we use faceColour.
  const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  function cellNeighbours(r, c) {
    const out = [];
    for (const [dr, dc] of DIRS) {
      const nr = r + dr, nc = c + dc;
      out.push([nr, nc]); // may be out-of-bounds → exterior
    }
    return out;
  }

  /**
   * can_colour_face() port: can we colour cell (r,c) with `colour`
   * without creating a topological violation?
   *
   * Rules:
   *  1. Must be adjacent to at least one cell of the same colour.
   *  2. Walking around the cell's perimeter (inflated outward), the number
   *     of colour/not-colour transitions must be exactly 2.
   */
  function canColourCell(r, c, colour) {
    if (board[r][c] !== GREY) return false;

    // Rule 1: must be adjacent to at least one same-coloured face.
    let foundNeighbour = false;
    for (const [nr, nc] of cellNeighbours(r, c)) {
      if (faceColour(nr, nc) === colour) { foundNeighbour = true; break; }
    }
    if (!foundNeighbour) return false;

    // Rule 2: count colour transitions around the cell's surrounding faces.
    // For a square cell, the "inflated perimeter" visits 8 surrounding faces
    // in order (the 4 edge-adjacent + 4 corner-adjacent), going clockwise:
    //   top, top-right, right, bottom-right, bottom, bottom-left, left, top-left
    const surrounding = [
      [r - 1, c],     // top
      [r - 1, c + 1], // top-right
      [r, c + 1],     // right
      [r + 1, c + 1], // bottom-right
      [r + 1, c],     // bottom
      [r + 1, c - 1], // bottom-left
      [r, c - 1],     // left
      [r - 1, c - 1], // top-left
    ];
    let transitions = 0;
    const n = surrounding.length;
    let prev = (faceColour(surrounding[n - 1][0], surrounding[n - 1][1]) === colour);
    for (let i = 0; i < n; i++) {
      const cur = (faceColour(surrounding[i][0], surrounding[i][1]) === colour);
      if (cur !== prev) transitions++;
      prev = cur;
    }

    return transitions === 2;
  }

  /** Count neighbours of cell (r,c) that have the given colour. */
  function numNeighboursOfColour(r, c, colour) {
    let count = 0;
    for (const [nr, nc] of cellNeighbours(r, c))
      if (faceColour(nr, nc) === colour) count++;
    return count;
  }

  /**
   * Score for colouring a cell: we want to maximise loopiness, so we favour
   * cells with fewer same-coloured neighbours (negative count → higher score
   * = more "frontier" feel).
   */
  function cellScore(r, c, colour) {
    return -numNeighboursOfColour(r, c, colour);
  }

  // ── Main face-colouring loop (loopgen.c generate_loop) ───────────────────

  // Colour one random cell WHITE.
  const startIdx = (Math.random() * N * N) | 0;
  board[(startIdx / N) | 0][startIdx % N] = WHITE;

  // Each GREY cell has a random tiebreaker (fixed for this generation run).
  const randomKey = Array.from({ length: N * N }, () => Math.random());

  // Sorted candidate lists (we re-sort each iteration; N is small enough).
  function buildCandidates(colour) {
    const list = [];
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (board[r][c] !== GREY) continue;
        if (canColourCell(r, c, colour)) {
          list.push({
            r, c,
            score: cellScore(r, c, colour),
            rnd: randomKey[r * N + c],
          });
        }
      }
    }
    // Sort descending by score, then descending by random tiebreaker.
    list.sort((a, b) => (b.score - a.score) || (b.rnd - a.rnd));
    return list;
  }

  while (true) {
    const lightable = buildCandidates(WHITE);
    const darkable = buildCandidates(BLACK);
    if (lightable.length === 0 && darkable.length === 0) break;

    // Pick WHITE or BLACK at random.
    const colour = Math.random() < 0.5 ? WHITE : BLACK;
    const candidates = (colour === WHITE) ? lightable : darkable;

    // Pick the best-scoring candidate (first in sorted list).
    if (candidates.length === 0) continue; // try the other colour next iteration
    const chosen = candidates[0];
    board[chosen.r][chosen.c] = colour;
  }

  // ── Tendril-growing pass (loopgen.c post-processing) ─────────────────────
  // Flip any face that is adjacent to exactly one opposite-coloured face,
  // if the flip is legal. Repeat until no more flips occur.
  const faceOrder = _shuffle(Array.from({ length: N * N }, (_, i) => i));

  let doRandomPass = false;
  while (true) {
    let flipped = false;
    for (const idx of faceOrder) {
      const r = (idx / N) | 0, c = idx % N;
      const opp = (board[r][c] === WHITE) ? BLACK : WHITE;
      if (!canColourCell(r, c, opp)) continue;
      // canColourCell checks board[r][c]===GREY, but we're flipping a coloured
      // cell. Temporarily set to GREY to use canColourCell.
      const orig = board[r][c];
      board[r][c] = GREY;
      if (!canColourCell(r, c, opp)) { board[r][c] = orig; continue; }
      if (doRandomPass) {
        if (Math.random() < 0.1) board[r][c] = opp; else board[r][c] = orig;
      } else {
        if (numNeighboursOfColour(r, c, opp) === 1) {
          board[r][c] = opp;
          flipped = true;
        } else {
          board[r][c] = orig;
        }
      }
    }
    if (doRandomPass) break;
    if (!flipped) doRandomPass = true;
  }

  // ── Convert face colouring to edge arrays ─────────────────────────────────
  // An edge between two cells (or a cell and the exterior) is a doorway
  // (EDGE_NONE / on the loop) iff the two faces have different colours.
  // Otherwise it's a wall (EDGE_BLACK).
  const hS = Array.from({ length: N + 1 }, () => new Array(N).fill(EDGE_BLACK));
  const vS = Array.from({ length: N }, () => new Array(N + 1).fill(EDGE_BLACK));

  // Horizontal edges: hS[r][c] is between cell(r-1,c) and cell(r,c).
  for (let r = 0; r <= N; r++) {
    for (let c = 0; c < N; c++) {
      const above = faceColour(r - 1, c);
      const below = faceColour(r, c);
      hS[r][c] = (above !== below) ? EDGE_NONE : EDGE_BLACK;
    }
  }
  // Vertical edges: vS[r][c] is between cell(r,c-1) and cell(r,c).
  for (let r = 0; r < N; r++) {
    for (let c = 0; c <= N; c++) {
      const left = faceColour(r, c - 1);
      const right = faceColour(r, c);
      vS[r][c] = (left !== right) ? EDGE_NONE : EDGE_BLACK;
    }
  }

  return { hS, vS };
}

// ── Phase 2: Extract clues from solution ─────────────────────────────────────

/**
 * Compute the clue at every interior vertex (r, c ∈ [1..N-1]).
 * Clue = number of BLACK (wall) adjacent edges.
 *
 * Returns a (N+1)×(N+1) array; interior positions hold 0..4, others null.
 * (Includes all clue values — remove_clues will drop the unneeded ones.)
 *
 * Port of loopy.c add_full_clues(): for each edge on the loop boundary,
 * increment the clue counter of the touching faces.  Here the dual
 * transformation maps "face clue = loop-boundary edges" to
 * "vertex clue = BLACK adjacent edges".
 */
function _extractAllClues(hS, vS, N) {
  const cg = Array.from({ length: N + 1 }, () => new Array(N + 1).fill(null));
  for (let r = 1; r < N; r++) {
    for (let c = 1; c < N; c++) {
      let b = 0;
      if (hS[r][c - 1] === EDGE_BLACK) b++;
      if (hS[r][c] === EDGE_BLACK) b++;
      if (vS[r - 1][c] === EDGE_BLACK) b++;
      if (vS[r][c] === EDGE_BLACK) b++;
      cg[r][c] = b;
    }
  }
  return cg;
}

// ── Phase 3a: Uniqueness solver ───────────────────────────────────────────────

/**
 * Count solutions consistent with clueGrid, stopping at `limit` (default 2).
 *
 * clueGrid  (N+1)×(N+1) array: interior positions (r,c ∈ [1..N-1]) hold an
 *           integer clue value or null; all other positions are ignored.
 *
 * A solution is a complete assignment of every internal edge to EDGE_BLACK
 * (wall) or EDGE_NONE (doorway) such that:
 *   • every interior vertex with a clue has exactly that many BLACK edges, and
 *   • the doorway graph (cells connected by NONE edges) forms exactly one
 *     closed loop (cells not on the loop are allowed).
 *
 * Constraint propagation rules (applied in a fixed-point loop):
 *   Rule 1 — Vertex clue forcing:
 *     If black == clue            → all gray adjacent edges become EDGE_NONE.
 *     If black + gray == clue     → all gray adjacent edges become EDGE_BLACK.
 *   Rule 2 — Cell degree forcing (final degree must be 0 or 2):
 *     If none > 2                 → contradiction.
 *     If none == 2                → all gray edges become BLACK.
 *     If none == 1 and gray == 0  → contradiction (dead end).
 *     If none == 1 and gray == 1  → remaining gray edge becomes NONE.
 *     If none == 0 and gray == 1  → remaining gray edge becomes BLACK.
 *
 * When propagation reaches a fixed point with undecided edges remaining,
 * branch on the first gray edge and recurse.
 */
function _countOrSolve(clueGrid, N, limit, captureFirst) {
  if (limit === undefined) limit = 2;
  if (captureFirst === undefined) captureFirst = false;
  let firstSolution = null;

  // ── Edge arrays ─────────────────────────────────────────────────────────────
  // h[r][c]: horizontal edge at vertex-row r, vertex-col c to c+1.
  //   r ∈ [0..N], c ∈ [0..N-1].  Perimeter (r=0 or r=N): EDGE_BLACK.
  // v[r][c]: vertical edge at vertex-col c, vertex-row r to r+1.
  //   r ∈ [0..N-1], c ∈ [0..N].  Perimeter (c=0 or c=N): EDGE_BLACK.
  const h = Array.from({ length: N + 1 }, (_, r) =>
    new Array(N).fill(r === 0 || r === N ? EDGE_BLACK : EDGE_GRAY)
  );
  const v = Array.from({ length: N }, () => {
    const row = new Array(N + 1).fill(EDGE_GRAY);
    row[0] = row[N] = EDGE_BLACK;
    return row;
  });

  // ── Constraint propagation ───────────────────────────────────────────────────

  function propagate() {
    let changed = true;
    while (changed) {
      changed = false;

      // Rule 1: vertex clue forcing.
      // For interior vertex (r, c) all 4 adjacent edges are always internal,
      // so we access h/v directly without a perimeter guard.
      for (let r = 1; r < N; r++) {
        for (let c = 1; c < N; c++) {
          const clue = clueGrid[r][c];
          if (clue === null) continue;

          const L = h[r][c - 1];   // left  horizontal edge
          const R = h[r][c];       // right horizontal edge
          const U = v[r - 1][c];   // above vertical edge
          const D = v[r][c];       // below vertical edge

          let black = 0, gray = 0;
          if (L === EDGE_BLACK) black++; else if (L === EDGE_GRAY) gray++;
          if (R === EDGE_BLACK) black++; else if (R === EDGE_GRAY) gray++;
          if (U === EDGE_BLACK) black++; else if (U === EDGE_GRAY) gray++;
          if (D === EDGE_BLACK) black++; else if (D === EDGE_GRAY) gray++;

          if (black > clue || black + gray < clue) return false; // contradiction

          if (gray > 0) {
            let fv = -1;
            if (black === clue) fv = EDGE_NONE;
            else if (black + gray === clue) fv = EDGE_BLACK;
            if (fv >= 0) {
              if (L === EDGE_GRAY) { h[r][c - 1] = fv; changed = true; }
              if (R === EDGE_GRAY) { h[r][c] = fv; changed = true; }
              if (U === EDGE_GRAY) { v[r - 1][c] = fv; changed = true; }
              if (D === EDGE_GRAY) { v[r][c] = fv; changed = true; }
            }
          }
        }
      }

      // Rule 2: cell degree forcing (final degree must be 0 or 2).
      // Cell (r, c) has 4 edges; perimeter edges are stored as EDGE_BLACK.
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const T = h[r][c];         // top    — perimeter BLACK when r === 0
          const B = h[r + 1][c];     // bottom — perimeter BLACK when r === N-1
          const L = v[r][c];         // left   — perimeter BLACK when c === 0
          const R = v[r][c + 1];     // right  — perimeter BLACK when c === N-1

          let none = 0, gray = 0;
          if (T === EDGE_NONE) none++; else if (T === EDGE_GRAY) gray++;
          if (B === EDGE_NONE) none++; else if (B === EDGE_GRAY) gray++;
          if (L === EDGE_NONE) none++; else if (L === EDGE_GRAY) gray++;
          if (R === EDGE_NONE) none++; else if (R === EDGE_GRAY) gray++;

          if (none > 2) return false;

          // If a path has entered this cell, it must be able to leave.
          if (none === 1 && gray === 0) return false;

          if (gray > 0) {
            // Saturated loop cell: all remaining edges are walls.
            if (none === 2) {
              if (T === EDGE_GRAY) { h[r][c] = EDGE_BLACK; changed = true; }
              if (B === EDGE_GRAY) { h[r + 1][c] = EDGE_BLACK; changed = true; }
              if (L === EDGE_GRAY) { v[r][c] = EDGE_BLACK; changed = true; }
              if (R === EDGE_GRAY) { v[r][c + 1] = EDGE_BLACK; changed = true; }
            }

            // Degree parity forcing for near-complete local states.
            if (none === 1 && gray === 1) {
              if (T === EDGE_GRAY) { h[r][c] = EDGE_NONE; changed = true; }
              if (B === EDGE_GRAY) { h[r + 1][c] = EDGE_NONE; changed = true; }
              if (L === EDGE_GRAY) { v[r][c] = EDGE_NONE; changed = true; }
              if (R === EDGE_GRAY) { v[r][c + 1] = EDGE_NONE; changed = true; }
            }
            if (none === 0 && gray === 1) {
              if (T === EDGE_GRAY) { h[r][c] = EDGE_BLACK; changed = true; }
              if (B === EDGE_GRAY) { h[r + 1][c] = EDGE_BLACK; changed = true; }
              if (L === EDGE_GRAY) { v[r][c] = EDGE_BLACK; changed = true; }
              if (R === EDGE_GRAY) { v[r][c + 1] = EDGE_BLACK; changed = true; }
            }
          }
        }
      }
    }

    // Rule 3: At most one cycle component may exist at any time.
    // Once a cycle exists, no degree-1 path stubs can remain elsewhere.
    if (!loopStructureStillPossible()) return false;

    return true; // no contradiction found
  }

  function loopStructureStillPossible() {
    const vis = new Uint8Array(N * N);
    const deg = new Uint8Array(N * N);
    let cycleComponents = 0;

    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const i = r * N + c;
        if (r > 0 && h[r][c] === EDGE_NONE) deg[i]++;
        if (r < N - 1 && h[r + 1][c] === EDGE_NONE) deg[i]++;
        if (c > 0 && v[r][c] === EDGE_NONE) deg[i]++;
        if (c < N - 1 && v[r][c + 1] === EDGE_NONE) deg[i]++;
      }
    }

    for (let start = 0; start < N * N; start++) {
      if (vis[start] || deg[start] === 0) continue;

      let nodes = 0, edgeCount = 0;
      const stk = [start]; vis[start] = 1;
      while (stk.length) {
        const u = stk.pop();
        nodes++;
        const r = (u / N) | 0, c = u % N;
        if (r > 0 && h[r][c] === EDGE_NONE) { edgeCount++; if (!vis[u - N]) { vis[u - N] = 1; stk.push(u - N); } }
        if (r < N - 1 && h[r + 1][c] === EDGE_NONE) { edgeCount++; if (!vis[u + N]) { vis[u + N] = 1; stk.push(u + N); } }
        if (c > 0 && v[r][c] === EDGE_NONE) { edgeCount++; if (!vis[u - 1]) { vis[u - 1] = 1; stk.push(u - 1); } }
        if (c < N - 1 && v[r][c + 1] === EDGE_NONE) { edgeCount++; if (!vis[u + 1]) { vis[u + 1] = 1; stk.push(u + 1); } }
      }
      edgeCount /= 2;

      // In an undirected connected component, E>=V implies at least one cycle.
      const hasCycle = edgeCount >= nodes;
      if (hasCycle) cycleComponents++;
      if (cycleComponents > 1) return false;

      // If we've closed a loop already, no other partial path component can
      // remain, because it can never connect into a degree-2 cycle.
      if (hasCycle && nodes < N * N) {
        for (let i = 0; i < N * N; i++) {
          if (!vis[i] && deg[i] > 0) {
            if (deg[i] === 1 || deg[i] === 2) return false;
          }
        }
      }
    }
    return true;
  }

  // ── Final solution check ────────────────────────────────────────────────────

  function isSingleLoopWithOptionalIsolatedCells() {
    const active = [];
    const degree = new Uint8Array(N * N);

    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const i = r * N + c;
        let n = 0;
        if (r > 0 && h[r][c] === EDGE_NONE) n++;
        if (r < N - 1 && h[r + 1][c] === EDGE_NONE) n++;
        if (c > 0 && v[r][c] === EDGE_NONE) n++;
        if (c < N - 1 && v[r][c + 1] === EDGE_NONE) n++;
        degree[i] = n;
        if (n !== 0 && n !== 2) return false;
        if (n === 2) active.push(i);
      }
    }

    if (active.length === 0) return false;

    // Active cells (degree 2) must form one connected component.
    const vis = new Uint8Array(N * N);
    const q = [active[0]];
    vis[active[0]] = 1;
    let cnt = 1;
    while (q.length) {
      const i = q.pop(), r = (i / N) | 0, c = i % N;
      if (r > 0 && h[r][c] === EDGE_NONE && !vis[i - N]) { vis[i - N] = 1; cnt++; q.push(i - N); }
      if (r < N - 1 && h[r + 1][c] === EDGE_NONE && !vis[i + N]) { vis[i + N] = 1; cnt++; q.push(i + N); }
      if (c > 0 && v[r][c] === EDGE_NONE && !vis[i - 1]) { vis[i - 1] = 1; cnt++; q.push(i - 1); }
      if (c < N - 1 && v[r][c + 1] === EDGE_NONE && !vis[i + 1]) { vis[i + 1] = 1; cnt++; q.push(i + 1); }
    }
    return cnt === active.length;
  }

  // ── Backtracking search ──────────────────────────────────────────────────────

  // Save and restore h/v arrays in-place (no reference replacement, so outer
  // snaps remain independent of inner modifications).
  function snap() {
    return { h: h.map(r => r.slice()), v: v.map(r => r.slice()) };
  }
  function restore(s) {
    for (let i = 0; i < h.length; i++)
      for (let j = 0; j < h[i].length; j++) h[i][j] = s.h[i][j];
    for (let i = 0; i < v.length; i++)
      for (let j = 0; j < v[i].length; j++) v[i][j] = s.v[i][j];
  }

  function findGray() {
    for (let r = 1; r < N; r++)
      for (let c = 0; c < N; c++)
        if (h[r][c] === EDGE_GRAY) return [true, r, c];
    for (let r = 0; r < N; r++)
      for (let c = 1; c < N; c++)
        if (v[r][c] === EDGE_GRAY) return [false, r, c];
    return null;
  }

  function search(count) {
    if (!propagate()) return count;

    const gray = findGray();
    if (!gray) {
      if (!isSingleLoopWithOptionalIsolatedCells()) return count;
      if (captureFirst && !firstSolution) firstSolution = snap();
      return count + 1;
    }

    const [isH, r, c] = gray;
    const s = snap();

    // Branch 1: set this edge BLACK (wall)
    if (isH) h[r][c] = EDGE_BLACK; else v[r][c] = EDGE_BLACK;
    count = search(count);
    if (count >= limit) { restore(s); return count; }

    // Branch 2: set this edge NONE (doorway)
    restore(s);
    if (isH) h[r][c] = EDGE_NONE; else v[r][c] = EDGE_NONE;
    count = search(count);

    restore(s);
    return count;
  }

  return { count: search(0), solution: firstSolution };
}

function countSolutions(clueGrid, N, limit) {
  return _countOrSolve(clueGrid, N, limit, false).count;
}

function hasUniqueSolution(clueGrid, N) {
  return countSolutions(clueGrid, N, 2) === 1;
}

/**
 * Return one solved edge assignment for this clue grid, or null if unsolved.
 *
 * Return shape: { h, v } where h/v have the same indexing as the state's
 * hEdges/vEdges arrays.
 */
function findOneSolution(clueGrid, N) {
  return _countOrSolve(clueGrid, N, 1, true).solution;
}

// ── Phase 3b: Greedy clue removal ─────────────────────────────────────────────

/**
 * Remove redundant clues in random order, keeping only those required for
 * uniqueness.  Modifies clueGrid in-place.
 *
 * Direct port of loopy.c remove_clues():
 *   shuffle the face list, then for each face tentatively remove its clue
 *   and call game_has_unique_soln(); restore if uniqueness is lost.
 */
function _removeRedundantClues(clueGrid, N) {
  const positions = [];
  for (let r = 1; r < N; r++)
    for (let c = 1; c < N; c++)
      positions.push([r, c]);
  _shuffle(positions);

  for (const [r, c] of positions) {
    if (clueGrid[r][c] === null) continue;
    const saved = clueGrid[r][c];
    clueGrid[r][c] = null;
    if (!hasUniqueSolution(clueGrid, N)) clueGrid[r][c] = saved;
  }
}

// ── Full pipeline ──────────────────────────────────────────────────────────────

/**
 * Generate a random DL puzzle with `cells` cells per side.
 *
 * Pipeline (modelled on loopy.c new_game_desc()):
 *   1. Find a random simple cycle             → the solution path
 *   2. Derive all vertex clues from it        → add_full_clues equivalent
 *   3. Remove redundant clues while unique    → remove_clues equivalent
 *   4. Build and return a GameState with the minimal clue set loaded.
 *
 * Returns a configured GameState; all internal edges start as EDGE_GRAY
 * (undecided) — the player must deduce the solution.
 * Throws on the rare failure to find a cycle.
 */
function generatePuzzle(cells) {
  const N = cells;

  // Phase 1 — generate a random closed loop via face colouring.
  const { hS, vS } = generateLoop(N);

  // Phase 2 — Solution edges + full clue set
  const clueGrid = _extractAllClues(hS, vS, N);

  // Phase 3 — Remove redundant clues (Loopy's remove_clues)
  _removeRedundantClues(clueGrid, N);

  // Build GameState
  const clues = [];
  for (let r = 1; r < N; r++)
    for (let c = 1; c < N; c++)
      if (clueGrid[r][c] !== null)
        clues.push({ r, c, value: clueGrid[r][c] });

  const state = new GameState(N);
  state.loadClues(clues);
  return state;
}
