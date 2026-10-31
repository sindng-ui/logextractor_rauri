const fs = require('fs');
const cp = require('child_process');
const os = require('os');
const path = require('path');

const tempOutDir = path.join(os.tmpdir(), 'electron-build-out').replace(/\\/g, '/');
const localDistBin = path.join(__dirname, '..', 'dist_bin').replace(/\\/g, '/');

console.log('=== [1/3] Building frontend assets (Vite)... ===');
cp.execSync('node ./node_modules/vite/bin/vite.js build', { stdio: 'inherit' });

console.log('=== [2/3] Packaging Electron App with electron-builder... ===');
cp.execSync(`node ./node_modules/electron-builder/cli.js --config.directories.output="${tempOutDir}"`, { stdio: 'inherit' });

console.log('=== [3/3] Copying built installers to dist_bin/... ===');
if (!fs.existsSync(localDistBin)) {
    fs.mkdirSync(localDistBin, { recursive: true });
}

const files = fs.readdirSync(tempOutDir);
files.forEach(f => {
    if (f.endsWith('.exe') || f.endsWith('.blockmap') || f.endsWith('.yml')) {
        const src = path.join(tempOutDir, f);
        const dest = path.join(localDistBin, f);
        fs.copyFileSync(src, dest);
        const sizeMb = (fs.statSync(dest).size / (1024 * 1024)).toFixed(2);
        console.log(` -> Copied ${f} (${sizeMb} MB) to dist_bin/`);
    }
});

console.log('\n[SUCCESS] Electron build finished cleanly without file lock issues!');
