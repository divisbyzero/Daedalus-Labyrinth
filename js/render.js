'use strict';

// ── Tunable theme & layout ──────────────────────────────────────────────────
// Change any value here to adjust the look of the game.

// ── Design tokens ─────────────────────────────────────────────────────────────
// "Ancient Maze" — refined
const PALETTE = {
  // Board surfaces
  background: '#E4EAE4',   // warmer than before — restores frame/board separation
  boardSurface: '#F6F4E8',   // undetermined cells — warm neutral

  // Structural
  gridLine: '#9A9078',
  hedge: '#265C48',   // deep shadowed hedge green
  regionCompleted: '#C9BFA0',   // stone/limestone path
  regionEnclosed: '#6E8880',   // shaded interior lawn
  regionThreeSides: '#BDC4BB',

  // Error
  errorHighlight: '#7A3040',   // deep wine — wrong but belongs to the world
  errorFill: '#743040',
  errorStroke: '#6A304088',
  errorVertexStroke: '#5A2030',
  errorVertexText: '#FFF0F2',

  // Clue circles — unfulfilled state
  clueNormalFill: '#F5F3EC',
  clueNormalBorder: '#265C48',
  clueNormalText: '#253330',

  // Clue circles — on enclosed cells
  clueOnDarkFill: '#E8EDEA',
  clueOnDarkBorder: '#1C4A38',
  clueOnDarkText: '#182820',

  // Vertex / dot
  numberInk: '#253330',
  vertexDot: '#3A4E47',
  vertexSatisfiedRing: '#1C5240',

  // Solved-board hedgerows
  hedgeSide: '#17392B',      // shadowed side face of a standing hedge
  hedgeHighlight: '#5E9678', // sunlit crown along the top face
};

// Duration of the solved-board "reveal" transformation (also read by main.js
// to keep redrawing until the animation completes).
const SOLVED_REVEAL_MS = 1100;

/** Linear interpolation between two '#RRGGBB' colors. */
function _hexLerp(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  let out = '#';
  for (const shift of [16, 8, 0]) {
    const va = (pa >> shift) & 255;
    const vb = (pb >> shift) & 255;
    out += Math.round(va + (vb - va) * t).toString(16).padStart(2, '0');
  }
  return out;
}

const THEME = {
  // Layout
  cellSize: 60,       // logical pixels per cell
  margin: 42,         // padding around the grid
  hitTolerance: 14,   // minimum edge click detection radius (px)

  // Vertex sizes
  vertexRadiusNumbered: 11, // radius of numbered (clue) vertices
  vertexRadiusPlain: 5,     // radius of plain (no-clue) vertices

  // Edge widths
  edgeWidthBlack: 6,    // hedge width — dominant element
  edgeWidthGray: 1.5,   // undecided grid-guide width

  // Colors — canvas
  background: PALETTE.background,

  // Colors — cells
  cellUndetermined: PALETTE.boardSurface,
  cellPath: PALETTE.regionCompleted,
  cellEnclosed: PALETTE.regionEnclosed,
  cellThreeSides: PALETTE.regionThreeSides,
  cellError: PALETTE.errorFill,    // error overlay (drawn on top of base fill)
  cellErrorStroke: PALETTE.errorStroke,  // error region perimeter

  // Colors — edges
  edgeBlack: PALETTE.hedge,
  edgeGray: PALETTE.gridLine,

  // Colors — numbered vertices — unfulfilled state
  vertexProgress: PALETTE.clueNormalFill,
  vertexProgressRing: PALETTE.clueNormalBorder,
  vertexText: PALETTE.clueNormalText,
  // satisfied state
  vertexSatisfied: PALETTE.regionCompleted,
  vertexSatisfiedRing: PALETTE.vertexSatisfiedRing,
  vertexTextSatisfied: PALETTE.numberInk,
  // violated state
  vertexViolated: PALETTE.errorHighlight,
  vertexViolatedRing: PALETTE.errorVertexStroke,
  vertexErrorText: PALETTE.errorVertexText,
  // clue on enclosed cell
  vertexOnDarkFill: PALETTE.clueOnDarkFill,
  vertexOnDarkBorder: PALETTE.clueOnDarkBorder,
  vertexOnDarkText: PALETTE.clueOnDarkText,

  // Colors — plain vertices
  vertexPlain: PALETTE.vertexDot,

  // Solved-board hedgerows (the win "reveal" transformation)
  hedgeSide: PALETTE.hedgeSide,
  hedgeHighlight: PALETTE.hedgeHighlight,
  hedgeWidthScale: 0.16,   // final hedge width, as a fraction of cell size
  hedgeHeightScale: 0.18,  // extrusion height, as a fraction of cell size
  hedgeSlant: 0.45,        // horizontal drift per unit of drop (light from upper left)
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
    this._cellSize = THEME.cellSize;
    this._margin = THEME.margin;
    this._hitTolerance = THEME.hitTolerance;
  }

  // ── Setup ─────────────────────────────────────────────────────────────────

  /** Resize the canvas to fit a board with `cells` cells per side. */
  resize(cells) {
    this._lastCells = cells;
    // Read available width from the wrapper (which has width:100%, so this is
    // the true content width after CSS padding is applied).
    const availableWidth = this.canvas.parentElement.clientWidth;
    const isPhone = Math.min(screen.width, screen.height) <= 480;
    if (isPhone) {
      // On phones, target a thin margin (~10px) and maximize cell size.
      // The canvas fills the wrapper wall-to-wall.
      const targetMargin = 10;
      this._cellSize = Math.min(THEME.cellSize, Math.floor((availableWidth - 2 * targetMargin) / cells));
      this._margin = Math.floor((availableWidth - cells * this._cellSize) / 2);
    } else {
      // On desktop/tablet, preserve the design-default margin when there is
      // plenty of room; scale gracefully for narrower windows.
      const r = THEME.margin / THEME.cellSize; // 0.7
      const fittedCellSize = Math.floor(availableWidth / (2 * r + cells));
      this._cellSize = Math.min(THEME.cellSize, fittedCellSize);
      this._margin = this._cellSize < THEME.cellSize
        ? Math.floor((availableWidth - cells * this._cellSize) / 2)
        : THEME.margin;
    }
    // Edge hit tolerance scales with the rendered cell size so a click that
    // lands a little off an edge still registers.  The cap keeps a small
    // dead zone at each cell's center, where a click would be ambiguous
    // between all four edges.  Phones get a larger floor for finger taps.
    const minTolerance = isPhone ? 18 : THEME.hitTolerance;
    this._hitTolerance = Math.max(minTolerance, Math.min(this._cellSize * 0.34, 24));
    const total = this._margin * 2 + cells * this._cellSize;
    const dpr = this.dpr;
    this.canvas.width = total * dpr;
    this.canvas.height = total * dpr;
    this.canvas.style.width = `${total}px`;
    this.canvas.style.height = `${total}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ── Coordinate helpers ────────────────────────────────────────────────────

  vx(c) { return this._margin + c * this._cellSize; }
  vy(r) { return this._margin + r * this._cellSize; }

  // ── Main render ───────────────────────────────────────────────────────────

  render(state, highlightEdge = null, prefs = {}) {
    const { ctx } = this;
    const C = state.cells;
    const W = this._margin * 2 + C * this._cellSize;
    const showErrors = prefs.showErrors !== false;

    // Solved-board reveal: 0 = normal play rendering, 1 = full labyrinth
    // (apparatus faded out, hedges drawn as standing hedgerows).
    const isSolved = state.checkWin();
    const reveal = isSolved ? this._revealProgress(state.solvedAt) : 0;

    // Background
    ctx.fillStyle = THEME.background;
    ctx.fillRect(0, 0, W, W);

    // 1. Cell fills — cells with three black edges or a premature loop get a
    //    semi-transparent error overlay plus a border stroke.
    const errorCells = showErrors && !isSolved ? state.getErrorCellSet() : new Set();
    if (showErrors && !isSolved) {
      for (let r = 0; r < C; r++) {
        for (let c = 0; c < C; c++) {
          const cellColor = state.getCellColor(r, c);
          if (cellColor === CELL.THREESIDES || cellColor === CELL.ERROR) {
            errorCells.add(`${r},${c}`);
          }
        }
      }
    }
    // During the reveal, undecided cells melt into the enclosed-greenery tone
    // so everything that isn't path reads as hedge mass.
    const undeterminedFill = reveal > 0
      ? _hexLerp(THEME.cellUndetermined, THEME.cellEnclosed, reveal)
      : THEME.cellUndetermined;
    for (let r = 0; r < C; r++) {
      for (let c = 0; c < C; c++) {
        const base = this._cellFill(state.getCellColor(r, c));
        ctx.fillStyle = base === THEME.cellUndetermined ? undeterminedFill : base;
        ctx.fillRect(this.vx(c), this.vy(r), this._cellSize, this._cellSize);
        if (errorCells.has(`${r},${c}`)) {
          ctx.fillStyle = THEME.cellError;
          ctx.fillRect(this.vx(c), this.vy(r), this._cellSize, this._cellSize);
        }
      }
    }

    // Draw only the outer perimeter of the error region (skip shared interior
    // edges) to avoid double-stroking between adjacent error cells.
    if (errorCells.size > 0) {
      ctx.strokeStyle = THEME.cellErrorStroke;
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (const key of errorCells) {
        const [er, ec] = key.split(',').map(Number);
        if (!errorCells.has(`${er - 1},${ec}`)) {
          ctx.moveTo(this.vx(ec), this.vy(er));
          ctx.lineTo(this.vx(ec + 1), this.vy(er));
        }
        if (!errorCells.has(`${er + 1},${ec}`)) {
          ctx.moveTo(this.vx(ec), this.vy(er + 1));
          ctx.lineTo(this.vx(ec + 1), this.vy(er + 1));
        }
        if (!errorCells.has(`${er},${ec - 1}`)) {
          ctx.moveTo(this.vx(ec), this.vy(er));
          ctx.lineTo(this.vx(ec), this.vy(er + 1));
        }
        if (!errorCells.has(`${er},${ec + 1}`)) {
          ctx.moveTo(this.vx(ec + 1), this.vy(er));
          ctx.lineTo(this.vx(ec + 1), this.vy(er + 1));
        }
      }
      ctx.stroke();
    }

    // 2. Edges — flat lines during play; standing hedgerows once solved.
    if (reveal > 0) {
      if (reveal < 1) {
        ctx.save();
        ctx.globalAlpha = 1 - reveal;
        this._drawAllEdges(state, EDGE_GRAY);
        ctx.restore();
      }
      this._drawHedgerows(state, reveal);
    } else {
      this._drawAllEdges(state, EDGE_GRAY);
      this._drawAllEdges(state, EDGE_BLACK);
    }

    // 2a. Long-press pending indicator — drawn above edges, below vertices
    if (highlightEdge) this._drawEdgeHighlight(highlightEdge);

    // 3. Vertices (on top of everything) — fade out during the reveal.
    if (reveal < 1) {
      ctx.save();
      if (reveal > 0) ctx.globalAlpha = 1 - reveal;
      for (let r = 0; r <= C; r++) {
        for (let c = 0; c <= C; c++) {
          this._drawVertex(ctx, state, r, c, showErrors);
        }
      }
      ctx.restore();
    }
  }

  /**
   * Progress of the solved-board transformation, eased 0→1.
   * With no timestamp (e.g. a board that loads already solved) the
   * transformation is shown complete rather than never starting.
   */
  _revealProgress(solvedAt) {
    if (!solvedAt) return 1;
    const t = Math.min(1, (Date.now() - solvedAt) / SOLVED_REVEAL_MS);
    return 1 - Math.pow(1 - t, 3); // cubic ease-out
  }

  // ── Drawing helpers ───────────────────────────────────────────────────────

  _cellFill(color) {
    switch (color) {
      case CELL.ENCLOSED: return THEME.cellEnclosed;
      case CELL.PATH: return THEME.cellPath;
      case CELL.THREESIDES: // base fill visible beneath error overlay
      case CELL.ERROR:      // base fill visible beneath error overlay
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

  /**
   * Draw the hedge walls as standing hedgerows for the solved-board reveal.
   *
   * Pseudo-3D extrusion for a tilted aerial view with light from the upper
   * left: the wall path is stroked repeatedly at decreasing down-right
   * offsets in a dark "side face" green, then once in place as the top face
   * with a sunlit highlight along the crown.
   *
   * Enclosed cells are raised along with the walls as solid blocks of the
   * same green and height, so each connected enclosed region reads as one
   * mass of clipped topiary rather than a walled courtyard.  Walls between
   * two enclosed cells are therefore left out of the extrusion; during the
   * animation they linger on top of the rising block and dissolve.
   *
   * `t` ∈ (0..1] animates the transformation — width, height, shadow and
   * highlight all scale with it, so t→0 matches the flat in-game look.
   */
  _drawHedgerows(state, t) {
    const { ctx } = this;
    const C = state.cells;

    // Map of enclosed (topiary) cells.
    const enclosed = Array.from({ length: C }, (_, r) =>
      Array.from({ length: C }, (_, c) => state.getCellColor(r, c) === CELL.ENCLOSED));

    const walls = new Path2D();
    const dividers = new Path2D(); // walls between two enclosed cells
    for (let r = 0; r <= C; r++)
      for (let c = 0; c < C; c++)
        if (state.hEdges[r][c] === EDGE_BLACK) {
          const isDivider = r > 0 && r < C && enclosed[r - 1][c] && enclosed[r][c];
          const p = isDivider ? dividers : walls;
          p.moveTo(this.vx(c), this.vy(r));
          p.lineTo(this.vx(c + 1), this.vy(r));
        }
    for (let r = 0; r < C; r++)
      for (let c = 0; c <= C; c++)
        if (state.vEdges[r][c] === EDGE_BLACK) {
          const isDivider = c > 0 && c < C && enclosed[r][c - 1] && enclosed[r][c];
          const p = isDivider ? dividers : walls;
          p.moveTo(this.vx(c), this.vy(r));
          p.lineTo(this.vx(c), this.vy(r + 1));
        }

    // Enclosed regions as one filled silhouette (adjacent rects merge).
    const blocks = new Path2D();
    let hasBlocks = false;
    for (let r = 0; r < C; r++)
      for (let c = 0; c < C; c++)
        if (enclosed[r][c]) {
          blocks.rect(this.vx(c), this.vy(r), this._cellSize, this._cellSize);
          hasBlocks = true;
        }

    const targetW = this._cellSize * THEME.hedgeWidthScale;
    const w = THEME.edgeWidthBlack + (targetW - THEME.edgeWidthBlack) * t;
    const h = this._cellSize * THEME.hedgeHeightScale * t;
    const slant = THEME.hedgeSlant;
    // Block tops blend from the in-play sage into hedge green as they rise.
    const blockTop = _hexLerp(THEME.cellEnclosed, THEME.edgeBlack, t);

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = w;

    // Deepest side stroke carries a soft ground shadow to seat the hedges.
    // Blocks need no shadow pass of their own — their boundary walls ring
    // them, so the wall shadow already outlines each region.
    ctx.save();
    ctx.translate(h * slant, h);
    ctx.shadowColor = `rgba(15, 26, 20, ${0.35 * t})`;
    ctx.shadowBlur = 7;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 3;
    ctx.strokeStyle = THEME.hedgeSide;
    ctx.stroke(walls);
    ctx.restore();

    // Side faces — walls and blocks at decreasing down-right offsets.
    ctx.strokeStyle = THEME.hedgeSide;
    ctx.fillStyle = THEME.hedgeSide;
    const step = Math.max(1, h / 6);
    for (let d = h; d > 0; d -= step) {
      ctx.save();
      ctx.translate(d * slant, d);
      if (hasBlocks) ctx.fill(blocks);
      ctx.stroke(walls);
      ctx.restore();
    }

    // Top faces: blocks first, then walls flow over the region boundaries.
    if (hasBlocks) {
      ctx.fillStyle = blockTop;
      ctx.fill(blocks);
    }
    ctx.strokeStyle = THEME.edgeBlack;
    ctx.stroke(walls);

    // Old dividers linger on the rising block tops and dissolve.
    if (t < 1) {
      ctx.save();
      ctx.globalAlpha = 1 - t;
      ctx.lineWidth = THEME.edgeWidthBlack;
      ctx.stroke(dividers);
      ctx.restore();
    }

    // Sunlit highlight along the crown of the walls.
    ctx.globalAlpha = 0.35 * t;
    ctx.strokeStyle = THEME.hedgeHighlight;
    ctx.lineWidth = w * 0.45;
    ctx.stroke(walls);

    ctx.restore();
  }

  _drawVertex(ctx, state, r, c, showErrors = true) {
    const x = this.vx(c);
    const y = this.vy(r);
    const gridSize = state.cells;

    // Perimeter vertices sit on fixed boundary edges — they never get clue numbers.
    const isPerimeter = (r === 0 || r === gridSize || c === 0 || c === gridSize);

    const info = state.getVertexDegreeInfo(r, c);
    if (isPerimeter) info.clue = null;

    if (info.clue !== null) {
      const max = info.black + info.gray; // max achievable black edges
      const isViolated = showErrors && (info.black > info.clue || max < info.clue);
      const isSatisfied = !isViolated && info.black === info.clue;

      // Use subtler styling when the circle sits over an enclosed cell
      const isOnDark = [[r - 1, c - 1], [r - 1, c], [r, c - 1], [r, c]].some(
        ([cr, cc]) => cr >= 0 && cr < gridSize && cc >= 0 && cc < gridSize
          && state.getCellColor(cr, cc) === CELL.ENCLOSED
      );

      let circleFill, circleRing, textColor;
      if (isViolated) {
        circleFill = THEME.vertexViolated;
        circleRing = THEME.vertexViolatedRing;
        textColor = THEME.vertexErrorText;
      } else if (isSatisfied) {
        circleFill = THEME.vertexSatisfied;
        circleRing = THEME.vertexSatisfiedRing;
        textColor = THEME.vertexTextSatisfied;
      } else if (isOnDark) {
        circleFill = THEME.vertexOnDarkFill;
        circleRing = THEME.vertexOnDarkBorder;
        textColor = THEME.vertexOnDarkText;
      } else {
        circleFill = THEME.vertexProgress;
        circleRing = THEME.vertexProgressRing;
        textColor = THEME.vertexText;
      }

      const R = THEME.vertexRadiusNumbered;
      ctx.beginPath();
      ctx.arc(x, y, R, 0, Math.PI * 2);
      ctx.fillStyle = circleFill;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(x, y, R + 1.5, 0, Math.PI * 2);
      ctx.strokeStyle = circleRing;
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = textColor;
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

  /** Amber band over an edge to show a long press is in progress. */
  _drawEdgeHighlight(edge) {
    const { ctx } = this;
    const { isH, r, c } = edge;
    ctx.save();
    ctx.strokeStyle = 'rgba(195, 155, 55, 0.65)';
    ctx.lineWidth = this._cellSize * 0.28;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (isH) {
      ctx.moveTo(this.vx(c), this.vy(r));
      ctx.lineTo(this.vx(c + 1), this.vy(r));
    } else {
      ctx.moveTo(this.vx(c), this.vy(r));
      ctx.lineTo(this.vx(c), this.vy(r + 1));
    }
    ctx.stroke();
    ctx.restore();
  }

  // ── Hit detection ─────────────────────────────────────────────────────────

  /**
   * Given a mouse position in logical canvas pixels, return the nearest edge
   * within HIT tolerance, or null.
   * Returns { isH, r, c } where isH=true means horizontal edge.
   */
  findEdge(mouseX, mouseY, state) {
    const C = state.cells;
    const HIT = this._hitTolerance;
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
