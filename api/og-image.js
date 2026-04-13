'use strict';

/**
 * Branded 1200×630 PNG — pure Node.js zlib, no npm packages.
 * Renders "Luminary" ("Lumi" dark / "nary" violet) centered on a
 * white-to-violet-tint gradient with a violet accent bar at the bottom.
 * Result is cached in-process after the first cold-start request.
 */

const zlib = require('zlib');

// ── CRC-32 (required by PNG spec) ─────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf  = Buffer.allocUnsafe(4); lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf  = Buffer.allocUnsafe(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

// ── 5×7 bitmap glyphs for "Luminary" ──────────────────────────────────────
// Each row is an array of 5 bits (1 = filled, 0 = empty).
const GLYPHS = {
  L: [[1,0,0,0,0],[1,0,0,0,0],[1,0,0,0,0],[1,0,0,0,0],[1,0,0,0,0],[1,0,0,0,0],[1,1,1,1,1]],
  u: [[0,0,0,0,0],[0,0,0,0,0],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[0,1,1,1,0]],
  m: [[0,0,0,0,0],[0,0,0,0,0],[1,1,0,1,1],[1,0,1,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1]],
  i: [[0,0,0,0,0],[0,0,1,0,0],[0,0,0,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0]],
  n: [[0,0,0,0,0],[0,0,0,0,0],[1,1,1,0,0],[1,0,0,1,0],[1,0,0,1,0],[1,0,0,1,0],[1,0,0,1,0]],
  a: [[0,0,0,0,0],[0,0,0,0,0],[0,1,1,1,0],[0,0,0,0,1],[0,1,1,1,1],[1,0,0,0,1],[0,1,1,1,1]],
  r: [[0,0,0,0,0],[0,0,0,0,0],[1,1,1,0,0],[1,0,0,1,0],[1,0,0,0,0],[1,0,0,0,0],[1,0,0,0,0]],
  y: [[0,0,0,0,0],[0,0,0,0,0],[1,0,0,0,1],[1,0,0,0,1],[0,1,1,1,1],[0,0,0,0,1],[0,1,1,1,0]],
};

// ── Canvas constants ───────────────────────────────────────────────────────
const W     = 1200;
const H     = 630;
const BAR_H = 18;                        // violet accent bar at bottom

const SCALE = 14;                        // each font-pixel → 14×14 screen-pixels
const GAP   = 8;                         // px between characters
const COLS  = 5;                         // glyph width in font-pixels
const ROWS  = 7;                         // glyph height in font-pixels

const WORD  = 'Luminary';
const SPLIT = 4;                         // first SPLIT chars dark, rest violet

// Precomputed colours (RGB)
const TOP_COLOR    = [255, 255, 255];    // #ffffff — gradient top
const BOT_COLOR    = [238, 236, 255];    // #eeecff — gradient bottom
const BAR_COLOR    = [108,  99, 255];    // #6c63ff — accent bar
const DARK_COLOR   = [ 27,  29,  54];   // #1b1d36 — "Lumi"
const VIOLET_COLOR = [108,  99, 255];    // #6c63ff — "nary"

// ── Build text bitmap ──────────────────────────────────────────────────────
function buildTextBitmap() {
  const textW = WORD.length * COLS * SCALE + (WORD.length - 1) * GAP;
  const textH = ROWS * SCALE;
  const xOff  = Math.round((W - textW) / 2);
  const yOff  = Math.round((H - BAR_H - textH) / 2);

  // Use a Uint8Array as a colour-index bitmap:
  // 0 = background, 1 = dark (Lumi), 2 = violet (nary)
  const bmp = new Uint8Array(H * W); // initialised to 0

  for (let ci = 0; ci < WORD.length; ci++) {
    const glyph  = GLYPHS[WORD[ci]];
    if (!glyph) continue;
    const colour = ci < SPLIT ? 1 : 2;
    const charX  = xOff + ci * (COLS * SCALE + GAP);

    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        if (!glyph[row][col]) continue;
        const py0 = yOff + row * SCALE;
        const px0 = charX + col * SCALE;
        for (let sy = 0; sy < SCALE; sy++) {
          const y = py0 + sy;
          if (y < 0 || y >= H) continue;
          for (let sx = 0; sx < SCALE; sx++) {
            const x = px0 + sx;
            if (x >= 0 && x < W) bmp[y * W + x] = colour;
          }
        }
      }
    }
  }

  return bmp;
}

// ── PNG generator ──────────────────────────────────────────────────────────
function buildPNG() {
  const textBmp = buildTextBitmap();

  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = ihdr[11] = ihdr[12] = 0; // 8-bit RGB

  const raw = Buffer.allocUnsafe(H * (1 + W * 3));
  let pos = 0;

  for (let y = 0; y < H; y++) {
    raw[pos++] = 0; // filter: None
    const inBar = y >= H - BAR_H;
    const t     = Math.min(y / (H - BAR_H), 1); // 0 (top) → 1 (bottom)

    for (let x = 0; x < W; x++) {
      const txt = textBmp[y * W + x];
      let r, g, b;

      if (txt === 1) {
        [r, g, b] = DARK_COLOR;
      } else if (txt === 2) {
        [r, g, b] = VIOLET_COLOR;
      } else if (inBar) {
        [r, g, b] = BAR_COLOR;
      } else {
        r = Math.round(TOP_COLOR[0] + (BOT_COLOR[0] - TOP_COLOR[0]) * t);
        g = Math.round(TOP_COLOR[1] + (BOT_COLOR[1] - TOP_COLOR[1]) * t);
        b = Math.round(TOP_COLOR[2] + (BOT_COLOR[2] - TOP_COLOR[2]) * t);
      }

      raw[pos++] = r; raw[pos++] = g; raw[pos++] = b;
    }
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

let cache = null;

module.exports = function handler(_req, res) {
  if (!cache) cache = buildPNG();
  res.setHeader('Content-Type',  'image/png');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.end(cache);
};
