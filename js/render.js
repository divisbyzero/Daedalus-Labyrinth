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

  // Gates (entrance/exit)
  gatePost: '#1C4A38',       // gate piers — denser than the hedge green
};

// Duration of the solved-board "reveal" transformation (also read by main.js
// to keep redrawing until the animation completes).
const SOLVED_REVEAL_MS = 1100;

/**
 * Deterministic hash of (r, c, k) → [0, 1).  Used for solved-board texture
 * so speckles and canopy blobs stay put across redraws instead of
 * shimmering with every frame.
 */
function _hash01(r, c, k) {
  let h = Math.imul(r + 1, 374761393) ^ Math.imul(c + 1, 668265263) ^ Math.imul(k + 1, 362437);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

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

  // Gates (entrance/exit): stone threshold through the gap + flanking piers
  gateThreshold: PALETTE.regionCompleted,
  gatePost: PALETTE.gatePost,
  gateStubScale: 0.45,     // threshold length, as a fraction of cell size
  gatePostScale: 0.13,     // pier radius, as a fraction of cell size
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
    this.sizeFixed(cells, this._cellSize, this._margin);
  }

  /**
   * Size the canvas for an exact cell size and margin.  Used by resize()
   * and directly by non-interactive boards (the How to Play example).
   */
  sizeFixed(cells, cellSize, margin) {
    this._lastCells = cells;
    this._cellSize = cellSize;
    this._margin = margin;
    const total = margin * 2 + cells * cellSize;
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

    // 1a. Solved-board floor texture — flagstones on the walking path.
    if (reveal > 0) this._drawFloorTexture(state, reveal);

    // 1b. Gate thresholds — stone underfoot, beneath the walls.
    this._drawThreshold(state.entry, reveal);
    this._drawThreshold(state.exit, reveal);

    // 2. Edges — flat lines during play; standing hedgerows once solved.
    // (During the reveal, undecided GRAY edges are implicit hedges and are
    // drawn by _drawHedgerows rather than as thin guides.)
    if (reveal > 0) {
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

    // 4. Gate piers — always at full strength; they rise with the reveal.
    this._drawGatePosts(state, reveal);
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

    // The board is solved, so undecided GRAY edges are implicit hedges.
    const isHedge = (e) => e !== EDGE_NONE;

    // Map of enclosed (topiary) cells: any cell with no doorway.
    const enclosed = Array.from({ length: C }, (_, r) =>
      Array.from({ length: C }, (_, c) => state.getCellEdges(r, c).every(isHedge)));

    const walls = new Path2D();
    const dividers = new Path2D(); // walls between two enclosed cells
    const crowns = new Path2D();   // walls that get the sunlit centerline
    const wallSegs = [];           // wall segments, for the leaf-fleck pass
    // Walls bordering a stand are part of its broad top: they keep their
    // dark base and flecks but skip the highlight line, so no bright ring
    // outlines the stand.
    for (let r = 0; r <= C; r++)
      for (let c = 0; c < C; c++)
        if (isHedge(state.hEdges[r][c])) {
          const above = r > 0 && enclosed[r - 1][c];
          const below = r < C && enclosed[r][c];
          if (above && below) {
            dividers.moveTo(this.vx(c), this.vy(r));
            dividers.lineTo(this.vx(c + 1), this.vy(r));
            continue;
          }
          walls.moveTo(this.vx(c), this.vy(r));
          walls.lineTo(this.vx(c + 1), this.vy(r));
          wallSegs.push({ x: this.vx(c), y: this.vy(r), horiz: true, sr: r, sc: c, k: 200 });
          if (!above && !below) {
            crowns.moveTo(this.vx(c), this.vy(r));
            crowns.lineTo(this.vx(c + 1), this.vy(r));
          }
        }
    for (let r = 0; r < C; r++)
      for (let c = 0; c <= C; c++)
        if (isHedge(state.vEdges[r][c])) {
          const left = c > 0 && enclosed[r][c - 1];
          const right = c < C && enclosed[r][c];
          if (left && right) {
            dividers.moveTo(this.vx(c), this.vy(r));
            dividers.lineTo(this.vx(c), this.vy(r + 1));
            continue;
          }
          walls.moveTo(this.vx(c), this.vy(r));
          walls.lineTo(this.vx(c), this.vy(r + 1));
          wallSegs.push({ x: this.vx(c), y: this.vy(r), horiz: false, sr: r, sc: c, k: 300 });
          if (!left && !right) {
            crowns.moveTo(this.vx(c), this.vy(r));
            crowns.lineTo(this.vx(c), this.vy(r + 1));
          }
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
    // Block tops match the sunlit-crown tone of the walls (crown = base
    // green + highlight at 0.35 alpha).  Drawn at alpha t, they fade in
    // over the underlying cell fill as they rise.
    const crown = _hexLerp(THEME.edgeBlack, THEME.hedgeHighlight, 0.35);

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

    // Top faces: wall tops first, then the block fill flows over the inner
    // half of its boundary walls — the crown tone runs unbroken from block
    // interior into the walls' highlight band, leaving a dark edge only on
    // the outer (path-facing) side where the top drops off.
    ctx.strokeStyle = THEME.edgeBlack;
    ctx.stroke(walls);
    if (hasBlocks) {
      ctx.save();
      ctx.globalAlpha = t;
      ctx.fillStyle = crown;
      ctx.fill(blocks);
      ctx.restore();

      // Leaf flecks: the same clipped-hedge stipple as the wall crowns,
      // scattered across the stand tops — one material, one texture.
      ctx.save();
      ctx.clip(blocks);
      for (let r = 0; r < C; r++) {
        for (let c = 0; c < C; c++) {
          if (!enclosed[r][c]) continue;
          for (let i = 0; i < 16; i++) {
            const bx = this.vx(c) + this._cellSize * _hash01(r, c, 50 + i);
            const by = this.vy(r) + this._cellSize * _hash01(r, c, 70 + i);
            const br = 0.7 + 1.0 * _hash01(r, c, 90 + i);
            const dark = _hash01(r, c, 110 + i) < 0.5;
            ctx.globalAlpha = (dark ? 0.20 : 0.16) * t;
            ctx.fillStyle = dark ? THEME.hedgeSide : THEME.hedgeHighlight;
            ctx.beginPath();
            ctx.arc(bx, by, br, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      ctx.restore();
    }

    // Old dividers linger on the rising block tops and dissolve.
    if (t < 1) {
      ctx.save();
      ctx.globalAlpha = 1 - t;
      ctx.lineWidth = THEME.edgeWidthBlack;
      ctx.stroke(dividers);
      ctx.restore();
    }

    // Sunlit highlight along the crown of free-standing walls only —
    // stand-bordering walls stay flat so the stands read as one surface.
    ctx.globalAlpha = 0.35 * t;
    ctx.strokeStyle = THEME.hedgeHighlight;
    ctx.lineWidth = w * 0.45;
    ctx.stroke(crowns);

    // Leaf flecks along the crowns — the same texture as the stand tops.
    const cs = this._cellSize;
    for (const s of wallSegs) {
      for (let i = 0; i < 5; i++) {
        const along = cs * _hash01(s.sr, s.sc, s.k + i);
        const across = (0.6 * _hash01(s.sr, s.sc, s.k + 20 + i) - 0.3) * w;
        const px = s.horiz ? s.x + along : s.x + across;
        const py = s.horiz ? s.y + across : s.y + along;
        const rad = 0.7 + 1.0 * _hash01(s.sr, s.sc, s.k + 40 + i);
        const dark = _hash01(s.sr, s.sc, s.k + 60 + i) < 0.5;
        ctx.globalAlpha = (dark ? 0.20 : 0.16) * t;
        ctx.fillStyle = dark ? THEME.hedgeSide : THEME.hedgeHighlight;
        ctx.beginPath();
        ctx.arc(px, py, rad, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  /**
   * Sparse speckles of wear on a uniform stone ground, within the given
   * rect.  Deterministic per (sa, sb) seed pair, fading in with the reveal.
   */
  _drawStoneSpeckles(x, y, w, h, sa, sb, count, t) {
    const { ctx } = this;
    for (let i = 0; i < count; i++) {
      const px = x + w * (0.06 + 0.88 * _hash01(sa, sb, 10 + i));
      const py = y + h * (0.06 + 0.88 * _hash01(sa, sb, 20 + i));
      const rad = 0.7 + 1.3 * _hash01(sa, sb, 30 + i);
      ctx.fillStyle = _hash01(sa, sb, 40 + i) < 0.5
        ? `rgba(96, 84, 60, ${0.10 * t})`
        : `rgba(255, 252, 240, ${0.12 * t})`;
      ctx.beginPath();
      ctx.arc(px, py, rad, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** Stone texture on solved-board path cells. */
  _drawFloorTexture(state, t) {
    const { ctx } = this;
    const C = state.cells;
    const cs = this._cellSize;
    ctx.save();
    for (let r = 0; r < C; r++)
      for (let c = 0; c < C; c++)
        if (state.getCellColor(r, c) === CELL.PATH)
          this._drawStoneSpeckles(this.vx(c), this.vy(r), cs, cs, r, c, 5, t);
    ctx.restore();
  }

  /**
   * Stone threshold extending outward through an entry/exit gap — a short
   * tab of path-colored stone, rounded on its outer end, showing where the
   * walking path leaves the board.
   *
   * During the reveal the extruded walls' visual bases sit down-right of
   * the flat grid line, so the threshold shifts with them to stay flush
   * with the gate mouth at floor level.
   */
  _drawThreshold(edge, reveal = 0) {
    if (!edge) return;
    const { ctx } = this;
    const cs = this._cellSize;
    const L = Math.min(cs * THEME.gateStubScale, this._margin - 2);
    const rad = Math.min(10, L * 0.5);
    const { isH, r, c } = edge;
    const drop = cs * THEME.hedgeHeightScale * reveal;
    // Extend the inner edge under the maze floor by at least the shift
    // distance, so the down-right translation can never open a gap between
    // floor and threshold (it pushes right- and bottom-gate thresholds
    // away from the board).
    const eV = drop + 2;                      // inner extension, vertical gates
    const eH = drop * THEME.hedgeSlant + 2;   // inner extension, horizontal gates
    let x, y, w, h, radii; // radii: [top-left, top-right, bottom-right, bottom-left]
    if (isH) {
      x = this.vx(c); w = cs;
      if (r === 0) { y = this.vy(r) - L; h = L + eV; radii = [rad, rad, 0, 0]; }
      else { y = this.vy(r) - eV; h = L + eV; radii = [0, 0, rad, rad]; }
    } else {
      y = this.vy(r); h = cs;
      if (c === 0) { x = this.vx(c) - L; w = L + eH; radii = [rad, 0, 0, rad]; }
      else { x = this.vx(c) - eH; w = L + eH; radii = [0, rad, rad, 0]; }
    }
    ctx.save();
    ctx.translate(drop * THEME.hedgeSlant, drop);
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, radii);
    else ctx.rect(x, y, w, h);
    ctx.fillStyle = THEME.gateThreshold;
    ctx.fill();
    // Same worn-stone speckling as the path flagstones.
    this._drawStoneSpeckles(x, y, w, h, (isH ? 1000 : 2000) + r, c, 4, reveal);
    ctx.restore();
  }

  /**
   * Solid pier dots at the two vertices flanking each gate gap.  Drawn last
   * and never faded; during the reveal they get the same down-right
   * extrusion as the hedge walls so they rise into standing pillars.
   */
  _drawGatePosts(state, reveal = 0) {
    const { ctx } = this;
    const R = Math.max(6, this._cellSize * THEME.gatePostScale);
    for (const edge of [state.entry, state.exit]) {
      if (!edge) continue;
      const { isH, r, c } = edge;
      const pts = isH
        ? [[this.vx(c), this.vy(r)], [this.vx(c + 1), this.vy(r)]]
        : [[this.vx(c), this.vy(r)], [this.vx(c), this.vy(r + 1)]];
      for (const [x, y] of pts) {
        if (reveal > 0) {
          const h = this._cellSize * THEME.hedgeHeightScale * reveal;
          const step = Math.max(1, h / 6);
          ctx.fillStyle = THEME.hedgeSide;
          for (let d = h; d > 0; d -= step) {
            ctx.beginPath();
            ctx.arc(x + d * THEME.hedgeSlant, y + d, R, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.beginPath();
        ctx.arc(x, y, R, 0, Math.PI * 2);
        ctx.fillStyle = THEME.gatePost;
        ctx.fill();
      }
    }
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
