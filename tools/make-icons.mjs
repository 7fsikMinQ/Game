// 아이콘을 코드로 그린다(외부 이미지 도구 불필요). 결과: baseball/icons/*.png
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../baseball/icons');
fs.mkdirSync(out, { recursive: true });

const BG = [31, 90, 58];
const BALL = [244, 238, 225];
const SEAM = [180, 81, 44];

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
function png(size, pixel) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x / size, y / size, size);
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// 공 + 양쪽 봉합선(점선 호). 3x3 슈퍼샘플링으로 가장자리를 부드럽게.
function sample(u, v) {
  const R = 0.3;
  const d = Math.hypot(u - 0.5, v - 0.5);
  if (d > R) return BG;
  for (const side of [-1, 1]) {
    const cx = 0.5 + side * R * 1.55;
    const rr = R * 1.02;
    const dd = Math.hypot(u - cx, v - 0.5);
    if (Math.abs(dd - rr) < 0.011 && d < R - 0.012) {
      const ang = Math.atan2(v - 0.5, u - cx);
      if (Math.floor(ang * 34) % 2 === 0) return SEAM;
    }
  }
  return BALL;
}
function pixel(u, v, size) {
  const n = 3;
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const c = sample(u + (i / n - 0.5 + 0.5 / n) / size, v + (j / n - 0.5 + 0.5 / n) / size);
    r += c[0]; g += c[1]; b += c[2];
  }
  return [Math.round(r / 9), Math.round(g / 9), Math.round(b / 9)];
}

for (const [name, size] of [['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512]]) {
  fs.writeFileSync(path.join(out, name), png(size, pixel));
  console.log('wrote', name);
}
fs.writeFileSync(path.join(out, 'icon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#1f5a3a"/><circle cx="50" cy="50" r="30" fill="#f4eee1"/><g fill="none" stroke="#b4512c" stroke-width="1.6" stroke-dasharray="2.4 2.4" stroke-linecap="round"><path d="M27 33a30.6 30.6 0 0 1 0 34"/><path d="M73 33a30.6 30.6 0 0 0 0 34"/></g></svg>\n`);
console.log('wrote icon.svg');
