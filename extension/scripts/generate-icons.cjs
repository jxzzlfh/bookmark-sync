/**
 * Generate placeholder icons for the extension
 * Run with: node scripts/generate-icons.js
 */

const fs = require('fs');
const path = require('path');

// Simple PNG generator for solid color icons with a bookmark shape
// This creates valid PNG files without external dependencies

function createPNG(size, color = { r: 14, g: 165, b: 233 }) {
  // PNG signature
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

  // Helper to create CRC32
  const crcTable = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c;
  }

  function crc32(buf) {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function createChunk(type, data) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);

    const typeBuffer = Buffer.from(type);
    const crcData = Buffer.concat([typeBuffer, data]);
    const crcValue = Buffer.alloc(4);
    crcValue.writeUInt32BE(crc32(crcData));

    return Buffer.concat([length, typeBuffer, data, crcValue]);
  }

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); // width
  ihdr.writeUInt32BE(size, 4); // height
  ihdr.writeUInt8(8, 8); // bit depth
  ihdr.writeUInt8(6, 9); // color type (RGBA)
  ihdr.writeUInt8(0, 10); // compression
  ihdr.writeUInt8(0, 11); // filter
  ihdr.writeUInt8(0, 12); // interlace

  // Create image data (simple bookmark icon)
  const rawData = [];
  const centerX = size / 2;
  const centerY = size / 2;
  const radius = size * 0.4;

  for (let y = 0; y < size; y++) {
    rawData.push(0); // filter byte
    for (let x = 0; x < size; x++) {
      // Draw a rounded rectangle bookmark shape
      const inBookmark = isInBookmark(x, y, size);
      
      if (inBookmark) {
        rawData.push(color.r, color.g, color.b, 255);
      } else {
        rawData.push(0, 0, 0, 0); // transparent
      }
    }
  }

  function isInBookmark(x, y, size) {
    const padding = size * 0.15;
    const left = padding;
    const right = size - padding;
    const top = padding;
    const bottom = size - padding * 0.5;
    const notchDepth = size * 0.2;
    const cornerRadius = size * 0.1;

    // Main rectangle bounds
    if (x < left || x > right || y < top) return false;

    // Bottom notch (V shape)
    if (y > bottom - notchDepth) {
      const centerX = size / 2;
      const notchTop = bottom - notchDepth;
      const slope = notchDepth / ((right - left) / 2);
      
      if (x <= centerX) {
        const maxY = notchTop + (x - left) * slope;
        if (y > maxY) return false;
      } else {
        const maxY = notchTop + (right - x) * slope;
        if (y > maxY) return false;
      }
    }

    // Round corners at top
    if (y < top + cornerRadius) {
      if (x < left + cornerRadius) {
        const dx = x - (left + cornerRadius);
        const dy = y - (top + cornerRadius);
        if (dx * dx + dy * dy > cornerRadius * cornerRadius) return false;
      }
      if (x > right - cornerRadius) {
        const dx = x - (right - cornerRadius);
        const dy = y - (top + cornerRadius);
        if (dx * dx + dy * dy > cornerRadius * cornerRadius) return false;
      }
    }

    return true;
  }

  // Compress with zlib (simple deflate)
  const zlib = require('zlib');
  const compressed = zlib.deflateSync(Buffer.from(rawData));

  // IDAT chunk
  const idat = createChunk('IDAT', compressed);

  // IEND chunk
  const iend = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([
    signature,
    createChunk('IHDR', ihdr),
    idat,
    iend,
  ]);
}

// Generate icons
const sizes = [16, 32, 48, 128];
const iconsDir = path.join(__dirname, '..', 'icons');

if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

for (const size of sizes) {
  const png = createPNG(size);
  const filename = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(filename, png);
  console.log(`Created ${filename}`);
}

console.log('Done!');
