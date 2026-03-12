/**
 * process_sprites.js
 * Strips backgrounds from ALL character sprites in public/assets/ (except background.png).
 * Seeds flood fill from every border pixel — reliable for AI-generated images.
 *
 * Usage:
 *   node process_sprites.js            — processes all character PNGs
 *   node process_sprites.js sarah.png  — processes only a specific file
 *
 * Run this anytime you add a new character sprite.
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ASSETS_DIR = path.join(__dirname, 'public', 'assets');
const TOLERANCE = 60;
const EXCLUDE = ['background.png']; // files to never touch

async function processSprite(filePath) {
    const { data, info } = await sharp(filePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width, height, channels } = info;
    const visited = new Uint8Array(width * height);

    // Seed from every pixel on all 4 edges
    const seeds = [];
    for (let x = 0; x < width; x++) {
        seeds.push([x, 0]);
        seeds.push([x, height - 1]);
    }
    for (let y = 1; y < height - 1; y++) {
        seeds.push([0, y]);
        seeds.push([width - 1, y]);
    }

    for (const [sx, sy] of seeds) {
        const sIdx = (sy * width + sx) * channels;
        if (visited[sy * width + sx] || data[sIdx + 3] === 0) continue;

        const seedR = data[sIdx], seedG = data[sIdx + 1], seedB = data[sIdx + 2];
        const stack = [[sx, sy]];
        visited[sy * width + sx] = 1;

        while (stack.length > 0) {
            const [x, y] = stack.pop();
            const idx = (y * width + x) * channels;
            data[idx + 3] = 0;

            for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
                if (nx >= 0 && nx < width && ny >= 0 && ny < height && !visited[ny * width + nx]) {
                    visited[ny * width + nx] = 1;
                    const nIdx = (ny * width + nx) * channels;
                    if (data[nIdx + 3] > 0 &&
                        Math.abs(data[nIdx]     - seedR) <= TOLERANCE &&
                        Math.abs(data[nIdx + 1] - seedG) <= TOLERANCE &&
                        Math.abs(data[nIdx + 2] - seedB) <= TOLERANCE) {
                        stack.push([nx, ny]);
                    }
                }
            }
        }
    }

    await sharp(data, { raw: { width, height, channels } }).png().toFile(filePath);
}

(async () => {
    const args = process.argv.slice(2);
    let files;

    if (args.length > 0) {
        // Specific file(s) passed as arguments
        files = args.map(f => path.join(ASSETS_DIR, f));
    } else {
        // Auto-detect all PNGs in assets except excluded ones
        files = fs.readdirSync(ASSETS_DIR)
            .filter(f => f.endsWith('.png') && !EXCLUDE.includes(f))
            .map(f => path.join(ASSETS_DIR, f));
    }

    console.log(`Processing ${files.length} sprite(s)...`);
    for (const filePath of files) {
        const name = path.basename(filePath);
        if (!fs.existsSync(filePath)) { console.log(`  SKIP: ${name} not found`); continue; }
        await processSprite(filePath);
        console.log(`  OK: ${name}`);
    }
    console.log('Done!');
})();
