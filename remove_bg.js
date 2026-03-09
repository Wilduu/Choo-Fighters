const Jimp = require('jimp');
const fs = require('fs');
const path = require('path');

async function removeWhite() {
    const assetsDir = path.join(__dirname, 'public', 'assets');
    const files = fs.readdirSync(assetsDir).filter(f => f.endsWith('.png') && f !== 'background.png');

    for (const file of files) {
        const filePath = path.join(assetsDir, file);
        try {
            const img = await Jimp.read(filePath);
            img.scan(0, 0, img.bitmap.width, img.bitmap.height, function (x, y, idx) {
                const r = this.bitmap.data[idx + 0];
                const g = this.bitmap.data[idx + 1];
                const b = this.bitmap.data[idx + 2];
                // Remove anything very close to white
                if (r > 240 && g > 240 && b > 240) {
                    this.bitmap.data[idx + 3] = 0;
                }
            });
            await img.writeAsync(filePath);
            console.log(`Processed ${file}`);
        } catch (e) {
            console.error(`Error processing ${file}:`, e);
        }
    }
}

removeWhite();
