'use strict';

// ── Tunable theme & layout ──────────────────────────────────────────────────
// Change any value here to adjust the look of the game.

// ── Design tokens ─────────────────────────────────────────────────────────────
// Single source of truth for all canvas colors. Mirror any UI-facing colors
// in CSS variables in style.css so both stay in sync.
const C = {
  background: '#2F3A34', // deep muted green-gray — page & canvas bg
  boardSurface: '#F4F1E8', // warm parchment — undetermined cells
  gridLine: '#C8C3B6', // light neutral — undecided edge guides
  hedge: '#2E6F57', // rich green — placed hedges
  regionCompleted: '#DCE8E2', // very light green tint — enclosed/path cells
  regionThreeSides: '#C8C3B6', // same neutral as grid for three-sided cells
  numberInk: '#2A2A2A', // near-black — clue numbers
  errorRed: '#D1493F', // warm red-orange — violations & error cells
  errorStroke: '#B83328', // deeper red — error cell border stroke
  vertexDot: '#7A8F84', // mid-tone — plain dots, subtler than hedges
  vertexSatisfiedRing: '#1F5A43', // dark green ring — satisfied vertex border
  solvedAccent: '#1F5A43', // deep rich green — Solved! overlay text
  exitAccent: '#7A9BB5', // steel blue — exit markers
};

const THEME = {
  // Layout
  cellSize: 60,       // logical pixels per cell
  margin: 42,        // padding around the grid (must be ≥ cellSize/2 × portalRadiusScale)
  hitTolerance: 14,     // edge click detection radius (px)

  // Vertex sizes
  vertexRadiusNumbered: 11, // radius of numbered (clue) vertices
  vertexRadiusPlain: 5,    // radius of plain (no-clue) vertices

  // Edge widths
  edgeWidthBlack: 6,    // hedge width — dominant element
  edgeWidthGray: 1.5,    // undecided grid-guide width

  // Colors — canvas
  background: C.background,

  // Colors — cells
  cellUndetermined: C.boardSurface,
  cellPath: C.regionCompleted,
  cellEnclosed: C.regionCompleted,
  cellThreeSides: C.regionThreeSides,
  cellError: `rgba(209, 73, 63, 0.38)`, // errorRed overlay — strong enough to read at a glance

  // Colors — edges
  edgeBlack: C.hedge,
  edgeGray: C.gridLine,

  // Colors — numbered vertices
  vertexProgress: C.hedge,             // clue not yet met
  vertexSatisfied: C.regionCompleted,   // clue exactly met — light fill
  vertexSatisfiedRing: C.vertexSatisfiedRing, // distinct dark border on satisfied
  vertexViolated: C.errorRed,          // clue impossible / exceeded
  vertexRing: 'rgba(255,255,255,0)',
  vertexText: C.boardSurface,
  vertexTextSatisfied: C.numberInk,   // dark ink on light satisfied bg

  // Colors — plain vertices
  vertexPlain: C.vertexDot,

  // Entry/exit archway
  portalColor: C.regionCompleted,
  portalRadiusScale: 1.25,

  // Exit markers
  exitGold: C.exitAccent,
  exitLineWidth: 2,
  exitTriangleSize: 14,
  exitTriangleGap: 10,
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

    // 1. Cell fills — error cells get a semi-transparent terracotta overlay plus
    //    a border stroke so they stand out immediately from normal play.
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

    // 1b. Error cell border strokes — drawn as a separate pass so they sit on
    //     top of all fills and read clearly regardless of adjacency.
    if (errorCells.size > 0) {
      ctx.strokeStyle = C.errorStroke;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      for (const key of errorCells) {
        const [er, ec] = key.split(',').map(Number);
        ctx.strokeRect(
          this.vx(ec) + 1.25, this.vy(er) + 1.25,
          THEME.cellSize - 2.5, THEME.cellSize - 2.5
        );
      }
    }

    // 2. Edges
    this._drawAllEdges(state, EDGE_GRAY);
    this._drawAllEdges(state, EDGE_BLACK);

    // 4. Vertices (on top of everything)
    for (let r = 0; r <= C; r++) {
      for (let c = 0; c <= C; c++) {
        this._drawVertex(ctx, state, r, c);
      }
    }

    // 5. Exit markers — drawn after vertices so gold dots appear on top
    if (state.openMode) {
      this._drawExitMarker(ctx, state, state.entry);
      this._drawExitMarker(ctx, state, state.exit);
    }

    // 6. "Solved!" overlay — drawn last so it appears above everything
    if (state.checkWin() && !state.cheated) {
      this._drawSolvedOverlay(ctx, C, state.solvedTime || null, state.solvedAt || null);
    }
  }

  // ── Drawing helpers ───────────────────────────────────────────────────────

  _drawSolvedOverlay(ctx, C, timeStr, solvedAt) {
    const cx = THEME.margin + C * THEME.cellSize / 2;
    const cy = THEME.margin + C * THEME.cellSize / 2;

    // Ease-out scale animation: 0.82 → 1.0 over 350ms
    const ANIM_MS = 350;
    const elapsed = solvedAt ? Math.min(1, (Date.now() - solvedAt) / ANIM_MS) : 1;
    const eased = 1 - Math.pow(1 - elapsed, 3); // cubic ease-out
    const scale = 0.82 + 0.18 * eased;
    const alpha = 0.55 + 0.45 * eased;

    const fontSize = Math.round(THEME.cellSize * 0.9);
    const timeFontSize = Math.round(THEME.cellSize * 0.4);
    const lineGap = Math.round(fontSize * 0.22);

    ctx.font = `bold ${fontSize}px sans-serif`;
    const solvedW = ctx.measureText('Solved!').width;
    ctx.font = `${timeFontSize}px sans-serif`;
    const timeW = timeStr ? ctx.measureText(timeStr).width : 0;

    const padX = fontSize * 0.6;
    const padY = fontSize * 0.35;
    const contentH = fontSize + (timeStr ? lineGap + timeFontSize : 0);
    const bw = Math.max(solvedW, timeW) + padX * 2;
    const bh = contentH + padY * 2;
    const r = Math.min(bh / 2, 28);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.globalAlpha = alpha;

    const bx = -bw / 2;
    const by = -bh / 2;

    // Pill background
    ctx.beginPath();
    ctx.moveTo(bx + r, by);
    ctx.arcTo(bx + bw, by, bx + bw, by + bh, r);
    ctx.arcTo(bx + bw, by + bh, bx, by + bh, r);
    ctx.arcTo(bx, by + bh, bx, by, r);
    ctx.arcTo(bx, by, bx + bw, by, r);
    ctx.closePath();
    ctx.fillStyle = 'rgba(244, 241, 232, 0.97)';
    ctx.fill();

    ctx.fillStyle = C.solvedAccent;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // "Solved!" — vertically centered in upper portion
    const solvedY = by + padY + fontSize / 2;
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.fillText('Solved!', 0, solvedY);

    // Time — smaller, slightly muted
    if (timeStr) {
      const timeY = solvedY + fontSize / 2 + lineGap + timeFontSize / 2;
      ctx.font = `${timeFontSize}px sans-serif`;
      ctx.fillStyle = C.numberInk;
      ctx.fillText(timeStr, 0, timeY);
    }

    ctx.restore();
  }

  /**
   * Draw the golden gate marker at an entry/exit gap:
   * a thin gold line spanning the gap, gold dots at both framing vertices,
   * and a small equilateral triangle pointing outward from the board edge.
   */
  _drawExitMarker(ctx, state, edge) {
    if (!edge) return;
    const { isH, r, c } = edge;
    const C = state.cells;

    let x1, y1, x2, y2;
    if (isH) {
      x1 = this.vx(c); y1 = this.vy(r);
      x2 = this.vx(c + 1); y2 = this.vy(r);
    } else {
      x1 = this.vx(c); y1 = this.vy(r);
      x2 = this.vx(c); y2 = this.vy(r + 1);
    }

    // Thin gold line across the gap
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = THEME.exitGold;
    ctx.lineWidth = THEME.exitLineWidth;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Gold dots at the two framing vertices (overdraw the default green dots)
    const R = THEME.vertexRadiusPlain;
    ctx.fillStyle = THEME.exitGold;
    for (const [x, y] of [[x1, y1], [x2, y2]]) {
      ctx.beginPath();
      ctx.arc(x, y, R, 0, Math.PI * 2);
      ctx.fill();
    }

    // Small equilateral triangle pointing outward from the board edge.
    // Base is centered on the gap midpoint, parallel to the gap;
    // apex points away from the board interior.
    const s = THEME.exitTriangleSize;
    const h = s * Math.sqrt(3) / 2;
    const g = THEME.exitTriangleGap;
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;

    let tx1, ty1, tx2, ty2, tx3, ty3;
    if (isH) {
      if (r === 0) {
        // Top border — apex points up, base offset upward by gap
        tx1 = mx - s / 2; ty1 = my - g;
        tx2 = mx + s / 2; ty2 = my - g;
        tx3 = mx; ty3 = my - g - h;
      } else {
        // Bottom border — apex points down, base offset downward by gap
        tx1 = mx - s / 2; ty1 = my + g;
        tx2 = mx + s / 2; ty2 = my + g;
        tx3 = mx; ty3 = my + g + h;
      }
    } else {
      if (c === 0) {
        // Left border — apex points left, base offset leftward by gap
        tx1 = mx - g; ty1 = my - s / 2;
        tx2 = mx - g; ty2 = my + s / 2;
        tx3 = mx - g - h; ty3 = my;
      } else {
        // Right border — apex points right, base offset rightward by gap
        tx1 = mx + g; ty1 = my - s / 2;
        tx2 = mx + g; ty2 = my + s / 2;
        tx3 = mx + g + h; ty3 = my;
      }
    }

    ctx.beginPath();
    ctx.moveTo(tx1, ty1);
    ctx.lineTo(tx2, ty2);
    ctx.lineTo(tx3, ty3);
    ctx.closePath();
    ctx.fillStyle = THEME.exitGold;
    ctx.fill();
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
    const rad = (THEME.cellSize / 2) * THEME.portalRadiusScale;

    let cx, cy, startAngle, endAngle, anticlockwise;

    if (isH) {
      // Center x is always the midpoint of the door opening, not a function of rad.
      cx = this.vx(c) + THEME.cellSize / 2;
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
      // Center y is always the midpoint of the door opening, not a function of rad.
      cy = this.vy(r) + THEME.cellSize / 2;
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
      let isSatisfied = false;
      if (info.black > info.clue || max < info.clue) {
        fill = THEME.vertexViolated;
      } else if (info.black === info.clue) {
        fill = THEME.vertexSatisfied;
        isSatisfied = true;
      } else {
        fill = THEME.vertexProgress;
      }

      const R = THEME.vertexRadiusNumbered;
      ctx.beginPath();
      ctx.arc(x, y, R, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();

      // Distinct ring: satisfied → dark green border; others → transparent
      ctx.beginPath();
      ctx.arc(x, y, R + 1.5, 0, Math.PI * 2);
      ctx.strokeStyle = isSatisfied ? THEME.vertexSatisfiedRing : THEME.vertexRing;
      ctx.lineWidth = isSatisfied ? 2 : 2;
      ctx.stroke();

      ctx.fillStyle = isSatisfied ? THEME.vertexTextSatisfied : THEME.vertexText;
      ctx.font = `bold ${Math.round(THEME.vertexRadiusNumbered * 1.5)}px sans-serif`;
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
