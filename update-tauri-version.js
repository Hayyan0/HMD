const fs = require('fs');
const path = require('path');

const tauriConfigPath = path.join(__dirname, 'tauri.conf.json');
const packageJsonPath = path.join(__dirname, 'package.json');

const tauriConfig = require(tauriConfigPath);
const packageJson = require(packageJsonPath);

// Sync tauri.conf.json version with package.json
tauriConfig.version = packageJson.version;

fs.writeFileSync(tauriConfigPath, JSON.stringify(tauriConfig, null, 2));

console.log(`Updated tauri.conf.json version to ${packageJson.version}`);
