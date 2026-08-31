// One-off generator for issue #74's placeholder PWA icons. Not part of the
// build/start pipeline - it's a one-time asset generator whose *output*
// (the PNGs under public/pwa/) is what gets committed and served, matching
// the existing tools/ convention (tools/pack, tools/unpack, tools/map,
// tools/audit).
//
// Run from the engine/ package root: `npx tsx tools/pwa/generate-icons.ts`
//
// Draws a deliberately simple placeholder - the game shell's own accent
// green (`#04A800`, view/client.ejs's `.green` class) filling the canvas,
// with a black circle monogram centered - swappable for real branded
// artwork later without reopening this issue (see its Out of Scope).
//
// The 512px maskable variant keeps the glyph inside the standard maskable
// "safe zone" (an inner circle covering 80% of the canvas) so Android's
// icon-mask cropping never clips it: https://web.dev/articles/maskable-icon

import fs from 'fs';
import path from 'path';

import { Jimp } from 'jimp';

const BACKGROUND = 0x04a800ff; // matches view/client.ejs's `.green` accent
const GLYPH = 0x000000ff;

const OUTPUT_DIR = path.join(process.cwd(), 'public', 'pwa');

interface IconSpec {
    fileName: string;
    size: number;
    // Glyph circle diameter as a fraction of the canvas size.
    glyphScale: number;
}

const ICONS: IconSpec[] = [
    { fileName: 'icon-192.png', size: 192, glyphScale: 0.6 },
    { fileName: 'icon-512.png', size: 512, glyphScale: 0.6 },
    // Maskable: OS icon masks crop arbitrarily outside the inner 80% safe
    // zone, so this glyph is scaled well inside it (see file header).
    { fileName: 'icon-512-maskable.png', size: 512, glyphScale: 0.45 }
];

function drawIcon(size: number, glyphScale: number): InstanceType<typeof Jimp> {
    const image = new Jimp({ width: size, height: size, color: BACKGROUND });

    const center = size / 2;
    const radius = (size * glyphScale) / 2;
    const radiusSq = radius * radius;

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const dx = x + 0.5 - center;
            const dy = y + 0.5 - center;
            if (dx * dx + dy * dy <= radiusSq) {
                image.setPixelColor(GLYPH, x, y);
            }
        }
    }

    return image;
}

async function main() {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    for (const icon of ICONS) {
        const image = drawIcon(icon.size, icon.glyphScale);
        const outPath = path.join(OUTPUT_DIR, icon.fileName);
        await image.write(outPath as `${string}.png`);
        console.log(`wrote ${outPath}`);
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
