'use strict';

/**
 * GameState manages the DL board.
 *
 * Board layout for a `cells × cells` grid:
 *   - hEdges[r][c] : horizontal edge between vertex(r,c) and vertex(r,c+1)
 *       r ∈ [0 .. cells],   c ∈ [0 .. cells-1]
 *   - vEdges[r][c] : vertical edge between vertex(r,c) and vertex(r+1,c)
 *       r ∈ [0 .. cells-1], c ∈ [0 .. cells]
 *   - clues[r][c]  : vertex clue number (1–4) or null
 *       r,c ∈ [0 .. cells]
 *
 * Cell (r,c) is bounded by:
 *   top    = hEdges[r][c]
 *   bottom = hEdges[r+1][c]
 *   left   = vEdges[r][c]
 *   right  = vEdges[r][c+1]
 */
class GameState {
  constructor(cells) {
    this.cells = cells;
    this.V = cells + 1; // vertices per side

    // All inner edges start gray; perimeter edges start black.
    this.hEdges = Array.from({ length: cells + 1 }, () =>
      new Array(cells).fill(EDGE_GRAY));
    this.vEdges = Array.from({ length: cells }, () =>
      new Array(cells + 1).fill(EDGE_GRAY));

    // Vertex clue numbers (null = no clue)
    this.clues = Array.from({ length: this.V }, () =>
      new Array(this.V).fill(null));

    // Undo / redo stacks — each entry: { isH, r, c, from, to }
    this._undoStack = [];
    this._redoStack = [];

    this._initPerimeter();
  }

  _initPerimeter() {
    const C = this.cells;
    for (let c = 0; c < C; c++) {
      this.hEdges[0][c] = EDGE_BLACK;
      this.hEdges[C][c] = EDGE_BLACK;
    }
    for (let r = 0; r < C; r++) {
      this.vEdges[r][0] = EDGE_BLACK;
      this.vEdges[r][C] = EDGE_BLACK;
    }
  }

  // ── Edge access ──────────────────────────────────────────────────────────

  getEdge(isH, r, c) {
    return isH ? this.hEdges[r][c] : this.vEdges[r][c];
  }

  _setEdge(isH, r, c, value) {
    if (isH) this.hEdges[r][c] = value;
    else     this.vEdges[r][c] = value;
  }

  /**
   * Cycle an edge state and record it in the undo stack.
   * forward=true : NONE→GRAY→BLACK  (left click)
   * forward=false: BLACK→GRAY→NONE  (right click)
   */
  clickEdge(isH, r, c, forward) {
    const from = this.getEdge(isH, r, c);
    // Left (forward):  NONE→GRAY→BLACK→GRAY→BLACK…  (BLACK wraps to GRAY, not NONE)
    // Right (backward): BLACK→GRAY→NONE→GRAY→NONE… (NONE wraps to GRAY, not BLACK)
    let to;
    if (forward) {
      to = (from === EDGE_NONE) ? EDGE_GRAY
         : (from === EDGE_GRAY) ? EDGE_BLACK
         :                        EDGE_GRAY;  // BLACK→GRAY
    } else {
      to = (from === EDGE_BLACK) ? EDGE_GRAY
         : (from === EDGE_GRAY)  ? EDGE_NONE
         :                         EDGE_GRAY; // NONE→GRAY
    }
    if (from === to) return;
    this._undoStack.push({ isH, r, c, from, to });
    this._redoStack = [];
    this._setEdge(isH, r, c, to);
  }

  // ── Undo / Redo ──────────────────────────────────────────────────────────

  get canUndo() { return this._undoStack.length > 0; }
  get canRedo() { return this._redoStack.length > 0; }

  undo() {
    if (!this.canUndo) return;
    const op = this._undoStack.pop();
    this._setEdge(op.isH, op.r, op.c, op.from);
    this._redoStack.push(op);
  }

  redo() {
    if (!this.canRedo) return;
    const op = this._redoStack.pop();
    this._setEdge(op.isH, op.r, op.c, op.to);
    this._undoStack.push(op);
  }

  // ── Cell logic ───────────────────────────────────────────────────────────

  /** Returns the four edge states surrounding cell (r,c). */
  getCellEdges(r, c) {
    return [
      this.hEdges[r][c],      // top
      this.hEdges[r + 1][c],  // bottom
      this.vEdges[r][c],      // left
      this.vEdges[r][c + 1],  // right
    ];
  }

  /**
   * Base color — determined solely by this cell's own edge counts, ignoring
   * what neighbors look like.  Used as a first pass before yellow promotion.
   *   4 black              → BLACK
   *   3 black              → GRAY
   *   ≤1 black + ≥3 deleted → RED
   *   otherwise            → WHITE
   */
  _getCellBaseColor(r, c) {
    const edges   = this.getCellEdges(r, c);
    const black   = edges.filter(e => e === EDGE_BLACK).length;
    const deleted = edges.filter(e => e === EDGE_NONE).length;
    if (black === 4)                return CELL.BLACK;
    if (black === 3)                return CELL.GRAY;
    if (black <= 1 && deleted >= 3) return CELL.RED;
    return CELL.WHITE;
  }

  /**
   * Final cell color.  A white cell is promoted to YELLOW only when:
   *   1. It has at least one deleted edge, AND
   *   2. Every in-bounds neighbor across a deleted edge is itself white
   *      (not gray or red) — i.e. "neither tile is red or gray".
   */
  getCellColor(r, c) {
    const base = this._getCellBaseColor(r, c);
    if (base !== CELL.WHITE) return base;

    const C = this.cells;
    // [edge state, neighbor row, neighbor col]
    const sides = [
      [this.hEdges[r][c],         r - 1, c    ],  // top
      [this.hEdges[r + 1][c],     r + 1, c    ],  // bottom
      [this.vEdges[r][c],         r,     c - 1],  // left
      [this.vEdges[r][c + 1],     r,     c + 1],  // right
    ];

    let hasDeleted = false;
    for (const [edgeState, nr, nc] of sides) {
      if (edgeState !== EDGE_NONE) continue;
      hasDeleted = true;
      // If the neighbor exists and is gray or red, stay white.
      if (nr >= 0 && nr < C && nc >= 0 && nc < C) {
        const nb = this._getCellBaseColor(nr, nc);
        if (nb === CELL.GRAY || nb === CELL.RED) return CELL.WHITE;
      }
    }

    return hasDeleted ? CELL.YELLOW : CELL.WHITE;
  }

  // ── Vertex degree ─────────────────────────────────────────────────────────

  /**
   * Returns degree info for vertex (r, c):
   *   black — number of currently black edges
   *   gray  — number of currently gray edges
   *   clue  — the clue value (null if none)
   *
   * Vertex (r,c) is adjacent to up to four edges:
   *   left:  hEdges[r][c-1]   (if c > 0)
   *   right: hEdges[r][c]     (if c < cells)
   *   up:    vEdges[r-1][c]   (if r > 0)
   *   down:  vEdges[r][c]     (if r < cells)
   */
  getVertexDegreeInfo(r, c) {
    const C = this.cells;
    const adj = [];
    if (c > 0)    adj.push(this.hEdges[r][c - 1]);
    if (c < C)    adj.push(this.hEdges[r][c]);
    if (r > 0)    adj.push(this.vEdges[r - 1][c]);
    if (r < C)    adj.push(this.vEdges[r][c]);
    return {
      black: adj.filter(e => e === EDGE_BLACK).length,
      gray:  adj.filter(e => e === EDGE_GRAY).length,
      clue:  this.clues[r][c],
    };
  }

  // ── Graph analysis ───────────────────────────────────────────────────────

  /** True if any edge is still in the undecided gray state. */
  hasGrayEdges() {
    const C = this.cells;
    for (let r = 0; r <= C; r++)
      for (let c = 0; c < C; c++)
        if (this.hEdges[r][c] === EDGE_GRAY) return true;
    for (let r = 0; r < C; r++)
      for (let c = 0; c <= C; c++)
        if (this.vEdges[r][c] === EDGE_GRAY) return true;
    return false;
  }

  /**
   * Build an adjacency structure for all currently-black edges.
   * Vertices are indexed as  r * V + c  where V = cells + 1.
   */
  _buildBlackGraph() {
    const C = this.cells, V = C + 1, N = V * V;
    const degree = new Int32Array(N);
    const adj    = Array.from({ length: N }, () => []);

    for (let r = 0; r <= C; r++)
      for (let c = 0; c < C; c++)
        if (this.hEdges[r][c] === EDGE_BLACK) {
          const a = r * V + c, b = r * V + c + 1;
          adj[a].push(b); adj[b].push(a);
          degree[a]++;    degree[b]++;
        }
    for (let r = 0; r < C; r++)
      for (let c = 0; c <= C; c++)
        if (this.vEdges[r][c] === EDGE_BLACK) {
          const a = r * V + c, b = (r + 1) * V + c;
          adj[a].push(b); adj[b].push(a);
          degree[a]++;    degree[b]++;
        }
    return { adj, degree, V, N };
  }

  /** Partition non-isolated vertices into connected components. */
  _findComponents(adj, degree, N) {
    const visited    = new Uint8Array(N);
    const components = [];
    for (let start = 0; start < N; start++) {
      if (degree[start] === 0 || visited[start]) continue;
      const verts = [];
      const queue = [start];
      visited[start] = 1;
      while (queue.length) {
        const v = queue.pop();
        verts.push(v);
        for (const u of adj[v])
          if (!visited[u]) { visited[u] = 1; queue.push(u); }
      }
      const isCycle = verts.every(v => degree[v] === 2);
      components.push({ verts, isCycle });
    }
    return components;
  }

  /**
   * Returns a Set of "r,c" keys for every cell that is part of a premature
   * loop in the labyrinth path.
   *
   * The labyrinth path is modelled as a graph where:
   *   - nodes  = cells
   *   - edges  = deleted internal boundaries between adjacent cells
   *              (a deleted shared edge is a "doorway" between two cells)
   *
   * A premature loop exists when this doorway graph contains a cycle while
   * gray (undecided) edges still remain in the puzzle.  All cells in such a
   * cycle-containing component are flagged as errors.
   *
   * Note: cycles in the black-edge graph (e.g. the perimeter, walled cells)
   * are completely fine — only cycles in the cell-path graph are errors.
   */
  getErrorCellSet() {
    if (!this.hasGrayEdges()) return new Set();

    const C  = this.cells;
    const ck = (r, c) => r * C + c;
    const N  = C * C;

    // Build doorway graph from deleted *internal* edges only.
    // (Perimeter edges are never doorways — they bound the board.)
    const adj = Array.from({ length: N }, () => []);

    // Deleted horizontal internal edges: shared by cell(r-1,c) and cell(r,c)
    for (let r = 1; r < C; r++)
      for (let c = 0; c < C; c++)
        if (this.hEdges[r][c] === EDGE_NONE) {
          adj[ck(r - 1, c)].push(ck(r, c));
          adj[ck(r, c)].push(ck(r - 1, c));
        }

    // Deleted vertical internal edges: shared by cell(r,c-1) and cell(r,c)
    for (let r = 0; r < C; r++)
      for (let c = 1; c < C; c++)
        if (this.vEdges[r][c] === EDGE_NONE) {
          adj[ck(r, c - 1)].push(ck(r, c));
          adj[ck(r, c)].push(ck(r, c - 1));
        }

    // Find connected components; flag any that contain a cycle.
    // A connected component on n nodes with >= n edges contains a cycle.
    const visited = new Uint8Array(N);
    const errorIdx = new Set();

    for (let start = 0; start < N; start++) {
      if (adj[start].length === 0 || visited[start]) continue;

      const comp  = [];
      let   edges = 0;
      const queue = [start];
      visited[start] = 1;
      while (queue.length) {
        const v = queue.pop();
        comp.push(v);
        for (const u of adj[v]) {
          edges++;                       // each edge counted twice
          if (!visited[u]) { visited[u] = 1; queue.push(u); }
        }
      }
      edges /= 2;

      if (edges >= comp.length)         // cycle present in this component
        for (const v of comp) errorIdx.add(v);
    }

    const result = new Set();
    for (const idx of errorIdx)
      result.add(`${Math.floor(idx / C)},${idx % C}`);
    return result;
  }

  /**
   * Returns true when the puzzle is solved:
   *   - no gray edges remain, and
   *   - the doorway graph (cells connected via deleted edges) forms exactly
   *     one connected component that is a single closed cycle, meaning every
   *     cell on the labyrinth path is part of one continuous closed loop.
   */
  checkWin() {
    if (this.hasGrayEdges()) return false;

    const C  = this.cells;
    const ck = (r, c) => r * C + c;
    const N  = C * C;

    const degree = new Int32Array(N);
    const adj    = Array.from({ length: N }, () => []);

    for (let r = 1; r < C; r++)
      for (let c = 0; c < C; c++)
        if (this.hEdges[r][c] === EDGE_NONE) {
          adj[ck(r-1,c)].push(ck(r,c)); adj[ck(r,c)].push(ck(r-1,c));
          degree[ck(r-1,c)]++;          degree[ck(r,c)]++;
        }
    for (let r = 0; r < C; r++)
      for (let c = 1; c < C; c++)
        if (this.vEdges[r][c] === EDGE_NONE) {
          adj[ck(r,c-1)].push(ck(r,c)); adj[ck(r,c)].push(ck(r,c-1));
          degree[ck(r,c-1)]++;          degree[ck(r,c)]++;
        }

    // Find all components of the doorway graph.
    const visited = new Uint8Array(N);
    const comps   = [];
    for (let start = 0; start < N; start++) {
      if (degree[start] === 0 || visited[start]) continue;
      const verts = [];
      const queue = [start];
      visited[start] = 1;
      while (queue.length) {
        const v = queue.pop();
        verts.push(v);
        for (const u of adj[v]) if (!visited[u]) { visited[u] = 1; queue.push(u); }
      }
      comps.push(verts);
    }

    // Win: exactly one component, and every cell in it has degree exactly 2
    // (every cell on the path has exactly two doorways — a proper closed loop).
    return comps.length === 1 && comps[0].every(v => degree[v] === 2);
  }

  // ── Clues ────────────────────────────────────────────────────────────────

  /** Load an array of { r, c, value } clue descriptors. */
  loadClues(clueList) {
    for (const { r, c, value } of clueList) {
      this.clues[r][c] = value;
    }
  }

  // ── Reset ────────────────────────────────────────────────────────────────

  /** Reset edge states to initial (all gray, perimeter black). Preserves clues. */
  reset() {
    const C = this.cells;
    for (let r = 0; r <= C; r++)
      for (let c = 0; c < C; c++)
        this.hEdges[r][c] = EDGE_GRAY;
    for (let r = 0; r < C; r++)
      for (let c = 0; c <= C; c++)
        this.vEdges[r][c] = EDGE_GRAY;
    this._undoStack = [];
    this._redoStack = [];
    this._initPerimeter();
    // clues are intentionally preserved
  }
}
