const fs = require('fs');
const path = require('path');

// Simple PNG generation using raw bytes
// Creates gradient bookmark icon with star

function createPNG(size) {
  // PNG header
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  
  // IHDR chunk
  const width = size;
  const height = size;
  const bitDepth = 8;
  const colorType = 6; // RGBA
  
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(bitDepth, 8);
  ihdrData.writeUInt8(colorType, 9);
  ihdrData.writeUInt8(0, 10); // compression
  ihdrData.writeUInt8(0, 11); // filter
  ihdrData.writeUInt8(0, 12); // interlace
  
  const ihdrChunk = createChunk('IHDR', ihdrData);
  
  // Create image data
  const rawData = Buffer.alloc(height * (1 + width * 4));
  
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = width / 2 - 1;
  
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 4)] = 0; // filter byte
    
    for (let x = 0; x < width; x++) {
      const offset = y * (1 + width * 4) + 1 + x * 4;
      const dx = x - centerX;
      const dy = y - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist <= radius) {
        // Inside circle - gradient from blue to purple to pink
        const t = (x + y) / (width + height);
        const r = Math.floor(59 + t * (236 - 59));
        const g = Math.floor(130 + t * (72 - 130));
        const b = Math.floor(246 + t * (153 - 246));
        
        // Check if inside bookmark shape
        const bx = (x - centerX) / (radius * 0.6);
        const by = (y - centerY) / (radius * 0.8);
        
        const inBookmark = Math.abs(bx) < 1 && by > -0.8 && by < 0.7;
        const inArrow = by >= 0.7 && by < 1.0 && Math.abs(bx) < (1.0 - (by - 0.7) * 3);
        
        if (inBookmark || inArrow) {
          // White bookmark
          rawData[offset] = 255;
          rawData[offset + 1] = 255;
          rawData[offset + 2] = 255;
          rawData[offset + 3] = 240;
        } else {
          // Gradient background
          rawData[offset] = r;
          rawData[offset + 1] = g;
          rawData[offset + 2] = b;
          rawData[offset + 3] = 255;
        }
        
        // Star sparkle
        const starX = centerX + radius * 0.5;
        const starY = centerY - radius * 0.5;
        const starDist = Math.sqrt((x - starX) ** 2 + (y - starY) ** 2);
        if (starDist < radius * 0.15) {
          rawData[offset] = 255;
          rawData[offset + 1] = 255;
          rawData[offset + 2] = 255;
          rawData[offset + 3] = 255;
        }
      } else {
        // Outside circle - transparent
        rawData[offset] = 0;
        rawData[offset + 1] = 0;
        rawData[offset + 2] = 0;
        rawData[offset + 3] = 0;
      }
    }
  }
  
  // Compress with zlib
  const zlib = require('zlib');
  const compressed = zlib.deflateSync(rawData);
  
  const idatChunk = createChunk('IDAT', compressed);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));
  
  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  
  const typeBuffer = Buffer.from(type);
  const crcData = Buffer.concat([typeBuffer, data]);
  const crc = crc32(crcData);
  
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc, 0);
  
  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

function crc32(data) {
  let crc = 0xFFFFFFFF;
  const table = makeCRCTable();
  
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xFF];
  }
  
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function makeCRCTable() {
  const table = new Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
    }
    table[n] = c;
  }
  return table;
}

// Generate favicons
const publicDir = path.join(__dirname, '..', 'public');

const sizes = [
  { name: 'favicon-16x16.png', size: 16 },
  { name: 'favicon-32x32.png', size: 32 },
  { name: 'apple-touch-icon.png', size: 180 },
];

for (const { name, size } of sizes) {
  const png = createPNG(size);
  fs.writeFileSync(path.join(publicDir, name), png);
  console.log(`Created ${name}`);
}

console.log('Favicons generated successfully!');
