// Generates the extension's PNG icons (no external deps). Run: npm run icons
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'icons');

const BG = [37, 99, 235, 255]; // #2563eb
const FG = [255, 255, 255, 255];
const TRANSPARENT = [0, 0, 0, 0];

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // no filter
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function inRoundedRect(x, y, size, r) {
  const cx = Math.min(Math.max(x, r), size - 1 - r);
  const cy = Math.min(Math.max(y, r), size - 1 - r);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function drawIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const r = Math.round(size * 0.2);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      let color = TRANSPARENT;
      if (inRoundedRect(x, y, size, r)) {
        color = BG;
        const nx = x / size;
        const ny = y / size;
        const shaft = nx >= 0.26 && nx <= 0.6 && Math.abs(ny - 0.5) <= 0.085;
        const head = nx >= 0.52 && nx <= 0.74 && Math.abs(ny - 0.5) <= (0.74 - nx) * 1.15;
        if (shaft || head) color = FG;
      }
      rgba[i] = color[0];
      rgba[i + 1] = color[1];
      rgba[i + 2] = color[2];
      rgba[i + 3] = color[3];
    }
  }
  return rgba;
}

fs.mkdirSync(outDir, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  const png = encodePng(size, drawIcon(size));
  fs.writeFileSync(path.join(outDir, `icon${size}.png`), png);
  console.log(`wrote icons/icon${size}.png (${png.length} bytes)`);
}
