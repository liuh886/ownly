// Generates store artwork from the Ownly mark (SVG) using sharp.
// Usage: node scripts/make-store-assets.mjs
// Outputs to dist/store-assets (gitignored, produced at submit time):
//   - ownly-store-logo-300.png  (300x300, Edge store logo)
//   - ownly-promo-440x280.png   (440x280, Chrome Web Store small promo tile)
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const outDir = path.join(root, 'dist', 'store-assets');
await mkdir(outDir, { recursive: true });

const markSvg = await readFile(path.join(root, 'public', 'icons', 'ownly-mark.svg'));

// 300x300 store logo: light stone backdrop + centered mark.
{
  const mark = await sharp(markSvg, { density: 300 }).resize(216, 216).png().toBuffer();
  await sharp({
    create: { width: 300, height: 300, channels: 4, background: '#fafaf9' },
  })
    .composite([{ input: mark, left: 42, top: 42 }])
    .png()
    .toFile(path.join(outDir, 'ownly-store-logo-300.png'));
}

// 440x280 promo tile: dark stone backdrop + mark + wordmark.
{
  const tile = `<svg xmlns="http://www.w3.org/2000/svg" width="440" height="280" viewBox="0 0 440 280">
    <rect width="440" height="280" rx="24" fill="#1c1917"/>
    <g transform="translate(48,96) scale(1.375)">
      <rect x="1" y="1" width="62" height="62" rx="15" fill="#1c1917" stroke="#44403c" stroke-width="1.25"/>
      <path d="M50.5 32A18.5 18.5 0 1 1 35.213 13.782" fill="none" stroke="#faf7f0" stroke-width="7.5" stroke-linecap="round"/>
      <circle cx="46.17" cy="20.11" r="5.1" fill="#10b981" stroke="#1c1917" stroke-width="2.5"/>
    </g>
    <text x="158" y="140" font-family="sans-serif" font-size="32" font-weight="bold" fill="#fafaf9">Ownly Capture</text>
    <text x="158" y="168" font-family="sans-serif" font-size="13.5" fill="#a8a29e">Travel research into your planner</text>
  </svg>`;
  await sharp(Buffer.from(tile)).png().toFile(path.join(outDir, 'ownly-promo-440x280.png'));
}

console.log(`store assets written to ${path.relative(root, outDir)}`);
