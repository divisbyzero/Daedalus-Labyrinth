'use strict';

// ── Tunable theme & layout ──────────────────────────────────────────────────
// Change any value here to adjust the look of the game.

const THEME = {
  // Layout
  cellSize: 60,       // logical pixels per cell
  margin: 36,        // padding around the grid
  hitTolerance: 14,     // edge click detection radius (px)

  // Vertex sizes
  vertexRadiusNumbered: 10, // radius of numbered (clue) vertices (~10% smaller)
  vertexRadiusPlain: 8,   // radius of plain (no-clue) vertices (~20% smaller than numbered)

  // Edge widths
  edgeWidthBlack: 5,    // wall edge width
  edgeWidthGray: 1.5,    // undecided edge width

  // Colors — canvas
  background: '#3D3F38',  // muted sage

  // Colors — cells
  cellUndetermined: '#F2EDE4',   // white (default / undetermined cells)
  cellPath: '#DCCFB3',          // warm packed-earth sand (labyrinth path)
  cellEnclosed: '#2D5A3F',      // darker botanical green (impassable / tree)
  cellThreeSides: '#B8AFA0',    // warm mid-tone gray
  cellError: 'rgba(196, 112, 88, 0.65)', // dusty terracotta, semi-transparent overlay

  // Colors — edges
  edgeBlack: '#3A6B4F',   // warm botanical green (hedge)
  edgeGray: '#B8AFA0',    // warm mid-tone gray (guide gridline)

  // Colors — numbered vertices
  vertexProgress: '#3A6B4F',   // clue not yet met
  vertexSatisfied: '#3A6B4F',  // clue exactly met
  vertexViolated: '#A85A40',   // deeper terracotta — clue impossible / exceeded
  vertexRing: 'rgba(255,255,255,0)',
  vertexText: '#F2EDE4',

  // Colors — plain vertices
  vertexPlain: '#3A6B4F',  // match hedge green

  // Entry/exit archway
  portalColor: '#DCCFB3', // match path color
};

/**
 * Renderer — draws the DL board onto an HTML canvas.
 *
 * Coordinate system (logical pixels, DPR-scaled internally):
 *   Vertex (r, c) is at pixel (MARGIN + c*CELL, MARGIN + r*CELL).
 *   Cells are drawn in the space between vertices.
 */
class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = window.devicePixelRatio || 1;
  }

  // ── Setup ─────────────────────────────────────────────────────────────────

  /** Resize the canvas to fit a board with `cells` cells per side. */
  resize(cells) {
    this._lastCells = cells;
    const total = THEME.margin * 2 + cells * THEME.cellSize;
    const dpr = this.dpr;
    this.canvas.width = total * dpr;
    this.canvas.height = total * dpr;
    this.canvas.style.width = `${total}px`;
    this.canvas.style.height = `${total}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ── Coordinate helpers ────────────────────────────────────────────────────

  vx(c) { return THEME.margin + c * THEME.cellSize; }
  vy(r) { return THEME.margin + r * THEME.cellSize; }

  // ── Main render ───────────────────────────────────────────────────────────

  render(state) {
    const { ctx } = this;
    const C = state.cells;
    const W = THEME.margin * 2 + C * THEME.cellSize;

    // Background
    ctx.fillStyle = THEME.background;
    ctx.fillRect(0, 0, W, W);

    // 1. Cell fills — error cells get a semi-transparent terracotta overlay on
    //    top of their normal color so grid structure remains visible.
    const errorCells = state.getErrorCellSet();
    for (let r = 0; r < C; r++) {
      for (let c = 0; c < C; c++) {
        ctx.fillStyle = this._cellFill(state.getCellColor(r, c));
        ctx.fillRect(this.vx(c), this.vy(r), THEME.cellSize, THEME.cellSize);
        if (errorCells.has(`${r},${c}`)) {
          ctx.fillStyle = THEME.cellError;
          ctx.fillRect(this.vx(c), this.vy(r), THEME.cellSize, THEME.cellSize);
        }
      }
    }

    // 2. Edges
    this._drawAllEdges(state, EDGE_GRAY);
    this._drawAllEdges(state, EDGE_BLACK);

    // 3. Entry / exit path spill (below vertices)
    if (state.openMode) {
      this._drawPortalSpill(ctx, state, state.entry);
      this._drawPortalSpill(ctx, state, state.exit);
    }

    // 4. Vertices (on top of everything)
    for (let r = 0; r <= C; r++) {
      for (let c = 0; c <= C; c++) {
        this._drawVertex(ctx, state, r, c);
      }
    }

    // 5. "Solved!" overlay — drawn last so it appears above everything
    if (state.checkWin() && !state.cheated) {
      this._drawSolvedOverlay(ctx, C);
    }
  }

  // ── Drawing helpers ───────────────────────────────────────────────────────

  _drawSolvedOverlay(ctx, C) {
    const cx = THEME.margin + C * THEME.cellSize / 2;
    const cy = THEME.margin + C * THEME.cellSize / 2;
    const fontSize = Math.round(THEME.cellSize * 0.9);
    ctx.font = `bold ${fontSize}px sans-serif`;
    const text = 'Solved!';
    const textW = ctx.measureText(text).width;
    const padX = fontSize * 0.6;
    const padY = fontSize * 0.4;
    const bw = textW + padX * 2;
    const bh = fontSize + padY * 2;
    const bx = cx - bw / 2;
    const by = cy - bh / 2;
    const r = bh / 2;

    // Pill background
    ctx.beginPath();
    ctx.moveTo(bx + r, by);
    ctx.arcTo(bx + bw, by, bx + bw, by + bh, r);
    ctx.arcTo(bx + bw, by + bh, bx, by + bh, r);
    ctx.arcTo(bx, by + bh, bx, by, r);
    ctx.arcTo(bx, by, bx + bw, by, r);
    ctx.closePath();
    ctx.fillStyle = 'rgba(242, 237, 228, 0.93)';
    ctx.fill();

    // Text
    ctx.fillStyle = THEME.edgeBlack;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, cx, cy);
  }

  /**
   * Draw a filled semicircle (archway) extending outward from an entry/exit
   * gap. The flat edge of the semicircle is flush with the border wall; the
   * dome extends away from the board interior.
   */
  _drawPortalSpill(ctx, state, edge) {
    if (!edge) return;
    const C = state.cells;
    const { isH, r, c } = edge;
    const rad = THEME.cellSize / 2;

    let cx, cy, startAngle, endAngle, anticlockwise;

    if (isH) {
      cx = this.vx(c) + rad;
      if (r === 0) {
        // Top border — dome extends upward
        cy = this.vy(0);
        startAngle = 0; endAngle = Math.PI; anticlockwise = true;
      } else {
        // Bottom border — dome extends downward
        cy = this.vy(C);
        startAngle = 0; endAngle = Math.PI; anticlockwise = false;
      }
    } else {
      cy = this.vy(r) + rad;
      if (c === 0) {
        // Left border — dome extends leftward
        cx = this.vx(0);
        startAngle = Math.PI / 2; endAngle = -Math.PI / 2; anticlockwise = false;
      } else {
        // Right border — dome extends rightward
        cx = this.vx(C);
        startAngle = -Math.PI / 2; endAngle = Math.PI / 2; anticlockwise = false;
      }
    }

    // Fill the closed semicircle (arc + diameter)
    ctx.beginPath();
    ctx.arc(cx, cy, rad, startAngle, endAngle, anticlockwise);
    ctx.closePath();
    ctx.fillStyle = THEME.portalColor;
    ctx.fill();
  }

  _cellFill(color) {
    switch (color) {
      case CELL.ENCLOSED: return THEME.cellEnclosed;
      case CELL.THREESIDES: return THEME.cellThreeSides;
      case CELL.PATH: return THEME.cellPath;
      case CELL.ERROR: return THEME.cellError;
      default: return THEME.cellUndetermined;
    }
  }

  _drawAllEdges(state, targetState) {
    const { ctx } = this;
    const C = state.cells;

    if (targetState === EDGE_BLACK) {
      ctx.strokeStyle = THEME.edgeBlack;
      ctx.lineWidth = THEME.edgeWidthBlack;
      ctx.lineCap = 'round';
    } else {
      ctx.strokeStyle = THEME.edgeGray;
      ctx.lineWidth = THEME.edgeWidthGray;
      ctx.lineCap = 'butt';
    }

    ctx.beginPath();
    for (let r = 0; r <= C; r++)
      for (let c = 0; c < C; c++) {
        if (state.hEdges[r][c] !== targetState) continue;
        ctx.moveTo(this.vx(c), this.vy(r));
        ctx.lineTo(this.vx(c + 1), this.vy(r));
      }
    for (let r = 0; r < C; r++)
      for (let c = 0; c <= C; c++) {
        if (state.vEdges[r][c] !== targetState) continue;
        ctx.moveTo(this.vx(c), this.vy(r));
        ctx.lineTo(this.vx(c), this.vy(r + 1));
      }
    ctx.stroke();
  }

  _drawVertex(ctx, state, r, c) {
    const x = this.vx(c);
    const y = this.vy(r);
    const C = state.cells;

    // Perimeter vertices sit on fixed boundary edges — they never get clue numbers.
    const isPerimeter = (r === 0 || r === C || c === 0 || c === C);

    const info = state.getVertexDegreeInfo(r, c);
    if (isPerimeter) info.clue = null;

    if (info.clue !== null) {
      // Determine constraint state:
      //   violated  — black edges already exceed clue, OR impossible to reach clue
      //   satisfied — black edges == clue (exact)
      //   progress  — still reachable, not yet met
      const max = info.black + info.gray; // max achievable black edges
      let fill;
      if (info.black > info.clue || max < info.clue) {
        fill = THEME.vertexViolated;
      } else if (info.black === info.clue) {
        fill = THEME.vertexSatisfied;
      } else {
        fill = THEME.vertexProgress;
      }

      const R = THEME.vertexRadiusNumbered;
      ctx.beginPath();
      ctx.arc(x, y, R, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();

      // White ring so it reads clearly against any cell color
      ctx.beginPath();
      ctx.arc(x, y, R + 1.5, 0, Math.PI * 2);
      ctx.strokeStyle = THEME.vertexRing;
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = THEME.vertexText;
      ctx.font = `bold ${Math.round(THEME.vertexRadiusNumbered * 1.4)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(info.clue), x, y);
    } else {
      // Plain vertex dot
      const R = THEME.vertexRadiusPlain;
      ctx.beginPath();
      ctx.arc(x, y, R, 0, Math.PI * 2);
      ctx.fillStyle = THEME.vertexPlain;
      ctx.fill();
    }
  }

  // ── Hit detection ─────────────────────────────────────────────────────────

  /**
   * Given a mouse position in logical canvas pixels, return the nearest edge
   * within HIT tolerance, or null.
   * Returns { isH, r, c } where isH=true means horizontal edge.
   */
  findEdge(mouseX, mouseY, state) {
    const C = state.cells;
    const HIT = THEME.hitTolerance;
    let best = null;
    let bestD = HIT + 1;

    // Horizontal edges
    for (let r = 0; r <= C; r++) {
      const ey = this.vy(r);
      const dy = Math.abs(mouseY - ey);
      if (dy > HIT) continue;
      for (let c = 0; c < C; c++) {
        const x1 = this.vx(c), x2 = this.vx(c + 1);
        if (mouseX < x1 - HIT || mouseX > x2 + HIT) continue;
        const dx = Math.max(0, x1 - mouseX, mouseX - x2);
        const dist = Math.hypot(dx, dy);
        if (dist < bestD) { bestD = dist; best = { isH: true, r, c }; }
      }
    }

    // Vertical edges
    for (let c = 0; c <= C; c++) {
      const ex = this.vx(c);
      const dx = Math.abs(mouseX - ex);
      if (dx > HIT) continue;
      for (let r = 0; r < C; r++) {
        const y1 = this.vy(r), y2 = this.vy(r + 1);
        if (mouseY < y1 - HIT || mouseY > y2 + HIT) continue;
        const dy = Math.max(0, y1 - mouseY, mouseY - y2);
        const dist = Math.hypot(dx, dy);
        if (dist < bestD) { bestD = dist; best = { isH: false, r, c }; }
      }
    }

    return best;
  }
}
