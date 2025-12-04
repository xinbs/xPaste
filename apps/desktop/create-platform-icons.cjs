// Generate platform-specific icons. Currently: macOS .icns from assets/icon.png
// Requires macOS built-ins: `sips` and `iconutil`.
// Usage: node create-platform-icons.cjs

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = __dirname;
const assetsDir = path.join(root, 'assets');
const inputPng = path.join(assetsDir, 'icon.png');
const outputIcns = path.join(assetsDir, 'icon.icns');
const iconsetDir = path.join(assetsDir, 'icon.iconset');

function ensureFileExists(p) {
  if (!fs.existsSync(p)) {
    throw new Error(`Missing required file: ${p}`);
  }
}

function rimraf(dir) {
  try {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch (e) {
    // ignore
  }
}

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function generateMacIcns() {
  ensureFileExists(inputPng);

  // If icon.icns already exists and is non-empty, skip regeneration
  if (fs.existsSync(outputIcns)) {
    const stat = fs.statSync(outputIcns);
    if (stat.size > 0) {
      console.log(`[icons] mac icon.icns already exists, skipping.`);
      return;
    }
  }

  rimraf(iconsetDir);
  mkdirp(iconsetDir);

  const sizes = [16, 32, 128, 256, 512];
  for (const size of sizes) {
    const baseName = `icon_${size}x${size}.png`;
    const basePath = path.join(iconsetDir, baseName);
    const retinaName = `icon_${size}x${size}@2x.png`;
    const retinaSize = size * 2;
    const retinaPath = path.join(iconsetDir, retinaName);

    console.log(`[icons] sips -> ${baseName}`);
    execFileSync('sips', ['-z', String(size), String(size), inputPng, '--out', basePath], { stdio: 'inherit' });

    console.log(`[icons] sips -> ${retinaName}`);
    execFileSync('sips', ['-z', String(retinaSize), String(retinaSize), inputPng, '--out', retinaPath], { stdio: 'inherit' });
  }

  // Also include 32 base icon (Apple expects both 16 and 32 bases)
  // sizes already include 32.

  console.log('[icons] iconutil -> icon.icns');
  execFileSync('iconutil', ['-c', 'icns', iconsetDir, '-o', outputIcns], { stdio: 'inherit' });

  // Clean up iconset folder to keep the repo tidy during CI/local builds
  rimraf(iconsetDir);

  console.log(`[icons] Generated ${outputIcns}`);
}

try {
  generateMacIcns();
} catch (err) {
  console.error('[icons] Failed to generate mac .icns:', err.message);
  process.exitCode = 1;
}
