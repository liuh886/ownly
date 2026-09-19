// Builds a store-uploadable zip from dist/extension using only node builtins.
// Usage: npm run build:extension && node scripts/package-extension.mjs [--out dist/ownly-capture-1.0.0-edge.zip]
// dist/ is gitignored: the zip is produced locally at submit time, never committed.
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { deflateRawSync } from 'node:zlib';

const root = process.cwd();
const srcDir = resolve(root, 'dist', 'extension');
if (!existsSync(join(srcDir, 'manifest.json'))) {
  console.error('dist/extension/manifest.json is missing. Run npm run build:extension first.');
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(join(srcDir, 'manifest.json'), 'utf8'));
const outPath = resolve(root, process.argv[2] === '--out' && process.argv[3]
  ? process.argv[3]
  : `dist/ownly-capture-${manifest.version ?? 'dev'}-edge.zip`);

function listFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const files = listFiles(srcDir).sort();
const chunks = [];
const central = [];
let offset = 0;

for (const abs of files) {
  const name = Buffer.from(relative(srcDir, abs).replace(/\\/g, '/'), 'utf8');
  const data = readFileSync(abs);
  const compressed = deflateRawSync(data, { level: 9 });
  const useCompressed = compressed.length < data.length;
  const body = useCompressed ? compressed : data;

  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x0800, 6); // UTF-8 filenames
  header.writeUInt16LE(useCompressed ? 8 : 0, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(0, 12);
  header.writeUInt32LE(crc32(data), 14);
  header.writeUInt32LE(body.length, 18);
  header.writeUInt32LE(data.length, 22);
  header.writeUInt16LE(name.length, 26);
  header.writeUInt16LE(0, 28);
  chunks.push(header, name, body);

  const centralHeader = Buffer.alloc(46);
  centralHeader.writeUInt32LE(0x02014b50, 0);
  centralHeader.writeUInt16LE(20, 4);
  centralHeader.writeUInt16LE(20, 6);
  centralHeader.writeUInt16LE(0x0800, 8);
  centralHeader.writeUInt16LE(useCompressed ? 8 : 0, 10);
  centralHeader.writeUInt16LE(0, 12);
  centralHeader.writeUInt16LE(0, 14);
  centralHeader.writeUInt32LE(crc32(data), 16);
  centralHeader.writeUInt32LE(body.length, 20);
  centralHeader.writeUInt32LE(data.length, 24);
  centralHeader.writeUInt16LE(name.length, 28);
  centralHeader.writeUInt32LE(0, 32);
  centralHeader.writeUInt16LE(0, 36);
  centralHeader.writeUInt16LE(0, 38);
  centralHeader.writeUInt32LE(0, 40);
  centralHeader.writeUInt32LE(offset, 42);
  central.push(centralHeader, name);
  offset += header.length + name.length + body.length;
}

const centralDir = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralDir.length, 12);
end.writeUInt32LE(offset, 16);

writeFileSync(outPath, Buffer.concat([...chunks, centralDir, end]));
console.log(`packaged ${files.length} files → ${relative(root, outPath)}`);
