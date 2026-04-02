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
