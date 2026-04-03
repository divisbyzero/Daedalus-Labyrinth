'use strict';

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

    this.CELL = 60;   // logical pixels per cell
    this.MARGIN = 36;   // padding around the grid
    this.VRAD_NUM = 11; // numbered vertex radius
    this.VRAD_PLAIN = 7; // unnumbered vertex radius
    this.EDGE_W_BLACK = 5; // black (wall) edge width
    this.EDGE_W_GRAY = 2;  // gray (undecided) edge width
    this.EHIT = 14;   // hit-detection tolerance in px
  }

  // ── Setup ─────────────────────────────────────────────────────────────────

  /** Resize the canvas to fit a board with `cells` cells per side. */
  resize(cells) {
    this._lastCells = cells;
    const total = this.MARGIN * 2 + cells * this.CELL;
    const dpr = this.dpr;
    this.canvas.width = total * dpr;
    this.canvas.height = total * dpr;
    this.canvas.style.width = `${total}px`;
    this.canvas.style.height = `${total}px`;
    // Apply DPR scaling once; all subsequent draw calls use logical pixels.
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ── Coordinate helpers ────────────────────────────────────────────────────

  vx(c) { return this.MARGIN + c * this.CELL; }
  vy(r) { return this.MARGIN + r * this.CELL; }

  // ── Main render ───────────────────────────────────────────────────────────

  render(state) {
    const { ctx } = this;
    const C = state.cells;
    const W = this.MARGIN * 2 + C * this.CELL;

    // Background
    ctx.fillStyle = '#c8c8c8';
    ctx.fillRect(0, 0, W, W);

    // 1. Cell fills — premature-loop cells override their normal color to red.
    const errorCells = state.getErrorCellSet();
    for (let r = 0; r < C; r++) {
      for (let c = 0; c < C; c++) {
        const color = errorCells.has(`${r},${c}`) ? CELL.RED : state.getCellColor(r, c);
        ctx.fillStyle = this._cellFill(color);
        ctx.fillRect(this.vx(c), this.vy(r), this.CELL, this.CELL);
      }
    }

    // 2. Edges
    this._drawAllEdges(state, EDGE_GRAY);
    this._drawAllEdges(state, EDGE_BLACK);

    // 3. Vertices (on top of everything)
    for (let r = 0; r <= C; r++) {
      for (let c = 0; c <= C; c++) {
        this._drawVertex(ctx, state, r, c);
      }
    }

    // 4. (Portal markers removed — openings are visible as gaps in the perimeter.)
  }

  // ── Drawing helpers ───────────────────────────────────────────────────────

  _cellFill(color) {
    switch (color) {
      case CELL.BLACK: return '#1e1e1e';
      case CELL.GRAY: return '#9a9a9a';
      case CELL.YELLOW: return '#b8e6a0';
      case CELL.RED: return '#ee3333';
      default: return '#f8f8f8';
    }
  }

  _drawAllEdges(state, targetState) {
    const { ctx } = this;
    const C = state.cells;

    if (targetState === EDGE_BLACK) {
      ctx.strokeStyle = '#1a472a';
      ctx.lineWidth = this.EDGE_W_BLACK;
      ctx.lineCap = 'round';
    } else {
      ctx.strokeStyle = '#b0b0b0';
      ctx.lineWidth = this.EDGE_W_GRAY;
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
        fill = '#cc2222'; // violated — red
      } else if (info.black === info.clue) {
        fill = '#1a472a'; // satisfied — dark green
      } else {
        fill = '#111111'; // in progress — black
      }

      const R = this.VRAD_NUM;
      ctx.beginPath();
      ctx.arc(x, y, R, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();

      // White ring so it reads clearly against any cell color
      ctx.beginPath();
      ctx.arc(x, y, R + 1.5, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.round(this.VRAD_NUM * 1.4)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(info.clue), x, y);
    } else {
      // Plain vertex dot
      const R = this.VRAD_PLAIN;
      ctx.beginPath();
      ctx.arc(x, y, R, 0, Math.PI * 2);
      ctx.fillStyle = '#1a472a';
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
    const HIT = this.EHIT;
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
