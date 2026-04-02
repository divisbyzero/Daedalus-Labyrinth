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
   * Cell color table (from spec):
   *
   * black  gray  deleted  color
   *   4     0      0      BLACK
   *   3     1      0      GRAY
   *   3     0      1      GRAY
   *   2     0      2      YELLOW
   *   2     1      1      WHITE
   *   2     2      0      WHITE
   *   1     0      3      RED
   *   1     1      2      WHITE
   *   1     2      1      WHITE
   *   1     3      0      WHITE
   *   0     0      4      RED
   *   0     1      3      RED
   *   0     2      2      WHITE
   *   0     3      1      WHITE
   *   0     4      0      WHITE
   */
  getCellColor(r, c) {
    const edges   = this.getCellEdges(r, c);
    const black   = edges.filter(e => e === EDGE_BLACK).length;
    const deleted = edges.filter(e => e === EDGE_NONE).length;

    if (black === 4)              return CELL.BLACK;
    if (black === 3)              return CELL.GRAY;
    if (black === 2 && deleted === 2) return CELL.YELLOW;
    if (black <= 1 && deleted >= 3)   return CELL.RED;
    return CELL.WHITE;
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
