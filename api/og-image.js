'use strict';

/**
 * Returns a branded 1200×630 PNG — no npm packages, pure Node.js zlib.
 * Used as the og:image fallback for posts without an uploaded image.
 * Result is cached in-process so cold-start cost is paid once.
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
  const crcBuf  = Buffer.allocUnsafe(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

// ── Image generator ───────────────────────────────────────────────────────
const W = 1200, H = 630;

// Colours
const TOP    = [255, 255, 255];          // #ffffff   — white top
const BOTTOM = [238, 236, 255];          // #eeecff   — violet tint bottom
const BAR    = [108,  99, 255];          // #6c63ff   — violet accent bar
const BAR_H  = 18;                       // px

function buildPNG() {
  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = ihdr[11] = ihdr[12] = 0; // 8-bit RGB

  const raw = Buffer.allocUnsafe(H * (1 + W * 3));
  let pos = 0;

  for (let y = 0; y < H; y++) {
    raw[pos++] = 0; // filter type: None
    const bar = y >= H - BAR_H;
    const t   = Math.min(y / (H - BAR_H), 1); // 0 (top) → 1 (just above bar)
    for (let x = 0; x < W; x++) {
      if (bar) {
        raw[pos++] = BAR[0]; raw[pos++] = BAR[1]; raw[pos++] = BAR[2];
      } else {
        raw[pos++] = Math.round(TOP[0] + (BOTTOM[0] - TOP[0]) * t);
        raw[pos++] = Math.round(TOP[1] + (BOTTOM[1] - TOP[1]) * t);
        raw[pos++] = Math.round(TOP[2] + (BOTTOM[2] - TOP[2]) * t);
      }
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
