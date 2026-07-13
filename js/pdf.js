'use strict';

/**
 * Minimal hand-written PDF generator for printable puzzles — no libraries.
 *
 * buildPuzzlePdf(state, paper) returns the complete PDF file as an ASCII
 * string (all geometry is drawn with vector operators; text uses the
 * built-in Helvetica fonts, so nothing needs embedding).
 *
 * The page shows the pristine puzzle: title at the top, the clue grid at
 * maximum size with faint gray guide lines and gaps at the two gates, and
 * the web address at the bottom.
 */

const PDF_PAPER = {
  letter: { w: 612, h: 792 },
  a4: { w: 595.28, h: 841.89 },
};

const PDF_TITLE = "Daedalus' Labyrinth";
const PDF_URL = 'divisbyzero.github.io/Daedalus-Labyrinth';
const PDF_INSTRUCTIONS = [
  '1. Turn the grid lines into hedges so that every numbered dot touches exactly that many hedge segments.',
  '2. Every square is bounded by two or four hedges.',
  '3. The open squares form a single unbroken path labyrinth between the exits.',
  '4. Hint for easier play: Use one color (or a dark line) to draw the hedges, and use a second (or a faint line) to show the labyrinth path as it is being constructed.',
];

function _fmt(n) {
  return (Math.round(n * 100) / 100).toString();
}

function _pdfEscape(s) {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

// Text width in points, via canvas metrics when available (browser) with a
// rough per-character fallback (tests).
let _pdfMeasureCtx = null;
function _pdfTextWidth(text, size, bold) {
  if (typeof document !== 'undefined') {
    if (!_pdfMeasureCtx) _pdfMeasureCtx = document.createElement('canvas').getContext('2d');
    _pdfMeasureCtx.font = `${bold ? 'bold ' : ''}${size}px Helvetica, Arial, sans-serif`;
    return _pdfMeasureCtx.measureText(text).width;
  }
  return text.length * size * (bold ? 0.58 : 0.5);
}

/** Path operators for a full circle (four Bézier arcs). */
function _pdfCircle(cx, cy, r) {
  const k = 0.5523 * r;
  const f = _fmt;
  return `${f(cx + r)} ${f(cy)} m ` +
    `${f(cx + r)} ${f(cy + k)} ${f(cx + k)} ${f(cy + r)} ${f(cx)} ${f(cy + r)} c ` +
    `${f(cx - k)} ${f(cy + r)} ${f(cx - r)} ${f(cy + k)} ${f(cx - r)} ${f(cy)} c ` +
    `${f(cx - r)} ${f(cy - k)} ${f(cx - k)} ${f(cy - r)} ${f(cx)} ${f(cy - r)} c ` +
    `${f(cx + k)} ${f(cy - r)} ${f(cx + r)} ${f(cy - k)} ${f(cx + r)} ${f(cy)} c `;
}

function buildPuzzlePdf(state, paper) {
  const { w: W, h: H } = PDF_PAPER[paper] || PDF_PAPER.letter;
  const C = state.cells;
  const f = _fmt;
  const margin = 40;

  // ── Layout ────────────────────────────────────────────────────────────────
  const titleSize = 26;
  const titleBaseline = H - margin - titleSize * 0.8;
  const footerSize = 10;
  const footerBaseline = margin * 0.6;

  const instrSize = 9.5;
  const instrLeading = 13;

  const areaTop = titleBaseline - 24;
  const areaBottom = footerBaseline + footerSize + 16 +
    PDF_INSTRUCTIONS.length * instrLeading + 10;
  const side = Math.min(W - 2 * margin, areaTop - areaBottom);
  const cell = side / C;
  const left = (W - side) / 2;
  const top = areaTop - (areaTop - areaBottom - side) / 2; // vertically centered
  const vx = (c) => left + c * cell;
  const vy = (r) => top - r * cell;

  const isGate = (isH, r, c) =>
    [state.entry, state.exit].some((e) =>
      e && e.isH === isH && e.r === r && e.c === c);

  let s = '';

  // ── Title & footer ────────────────────────────────────────────────────────
  const titleW = _pdfTextWidth(PDF_TITLE, titleSize, true);
  s += `BT /F1 ${titleSize} Tf ${f((W - titleW) / 2)} ${f(titleBaseline)} Td (${_pdfEscape(PDF_TITLE)}) Tj ET\n`;
  const urlW = _pdfTextWidth(PDF_URL, footerSize, false);
  s += `0.45 0.45 0.45 rg BT /F2 ${footerSize} Tf ${f((W - urlW) / 2)} ${f(footerBaseline)} Td (${_pdfEscape(PDF_URL)}) Tj ET 0 0 0 rg\n`;

  // ── Instructions beneath the grid ─────────────────────────────────────────
  s += '0.25 0.25 0.25 rg\n';
  let iy = top - side - 20;
  for (const line of PDF_INSTRUCTIONS) {
    const lw = _pdfTextWidth(line, instrSize, false);
    s += `BT /F2 ${f(instrSize)} Tf ${f((W - lw) / 2)} ${f(iy)} Td (${_pdfEscape(line)}) Tj ET\n`;
    iy -= instrLeading;
  }
  s += '0 0 0 rg\n';

  // ── Faint interior grid ───────────────────────────────────────────────────
  s += '0.8 0.8 0.8 RG 0.6 w\n';
  for (let r = 1; r < C; r++)
    for (let c = 0; c < C; c++)
      s += `${f(vx(c))} ${f(vy(r))} m ${f(vx(c + 1))} ${f(vy(r))} l `;
  for (let r = 0; r < C; r++)
    for (let c = 1; c < C; c++)
      s += `${f(vx(c))} ${f(vy(r))} m ${f(vx(c))} ${f(vy(r + 1))} l `;
  s += 'S\n';

  // ── Perimeter walls (with gaps at the gates) ──────────────────────────────
  s += '0 0 0 RG 2.6 w 1 J\n';
  for (const r of [0, C])
    for (let c = 0; c < C; c++)
      if (!isGate(true, r, c))
        s += `${f(vx(c))} ${f(vy(r))} m ${f(vx(c + 1))} ${f(vy(r))} l `;
  for (const c of [0, C])
    for (let r = 0; r < C; r++)
      if (!isGate(false, r, c))
        s += `${f(vx(c))} ${f(vy(r))} m ${f(vx(c))} ${f(vy(r + 1))} l `;
  s += 'S\n';

  // ── Vertex dots (skipping clue positions; gate-flanking dots enlarged) ────
  const dotR = Math.max(1.3, cell * 0.04);
  const gatePosts = new Set();
  for (const e of [state.entry, state.exit]) {
    if (!e) continue;
    gatePosts.add(`${e.r},${e.c}`);
    gatePosts.add(e.isH ? `${e.r},${e.c + 1}` : `${e.r + 1},${e.c}`);
  }
  s += '0.15 0.15 0.15 rg\n';
  for (let r = 0; r <= C; r++)
    for (let c = 0; c <= C; c++) {
      if (state.clues[r][c] !== null) continue;
      const R = gatePosts.has(`${r},${c}`) ? dotR * 2 : dotR;
      s += _pdfCircle(vx(c), vy(r), R) + 'f\n';
    }

  // ── Clue circles & numbers ────────────────────────────────────────────────
  const clueR = Math.min(12, cell * 0.24);
  const numSize = clueR * 1.4;
  s += '1 1 1 rg 0 0 0 RG 1.1 w\n';
  for (let r = 1; r < C; r++)
    for (let c = 1; c < C; c++)
      if (state.clues[r][c] !== null)
        s += _pdfCircle(vx(c), vy(r), clueR) + 'B\n';
  s += '0 0 0 rg\n';
  for (let r = 1; r < C; r++)
    for (let c = 1; c < C; c++) {
      const clue = state.clues[r][c];
      if (clue === null) continue;
      const txt = String(clue);
      const tw = _pdfTextWidth(txt, numSize, true);
      s += `BT /F1 ${f(numSize)} Tf ${f(vx(c) - tw / 2)} ${f(vy(r) - numSize * 0.36)} Td (${txt}) Tj ET\n`;
    }

  // ── Assemble the PDF file ─────────────────────────────────────────────────
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(W)} ${f(H)}] ` +
      '/Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${s.length} >>\nstream\n${s}\nendstream`,
  ];

  let out = '%PDF-1.4\n';
  const offsets = [];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefPos = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets)
    out += `${String(off).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  return out;
}
