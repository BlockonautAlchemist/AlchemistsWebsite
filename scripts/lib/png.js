const fs = require('node:fs');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
function readRgbaPng(file) {
  const buffer = fs.readFileSync(file);
  assert.equal(buffer[24], 8, `${file} is not 8-bit`);
  assert.equal(buffer[25], 6, `${file} is not RGBA`);
  assert.equal(buffer[28], 0, `${file} is interlaced`);

  const width = buffer.readUInt32BE(16), height = buffer.readUInt32BE(20);
  const idat = [];
  let pos = 8;
  while (pos < buffer.length) {
    const length = buffer.readUInt32BE(pos);
    const type = buffer.toString('ascii', pos + 4, pos + 8);
    if (type === 'IDAT') idat.push(buffer.subarray(pos + 8, pos + 8 + length));
    if (type === 'IEND') break;
    pos += 12 + length;
  }

  // Undo the per-scanline filters; only the alpha byte of each pixel is read
  // afterwards, but every channel has to be reconstructed to get to it.
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = 4;
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x += 1) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? out[(y - 1) * stride + x - bpp] : 0;
      let value = line[x];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[y * stride + x] = value & 0xff;
    }
  }

  return { width, height, pixels: out };
}
module.exports = { readRgbaPng };
