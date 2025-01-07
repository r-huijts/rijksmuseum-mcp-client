const { spawn } = require('child_process');
const electron = require('electron');
const path = require('path');

const proc = spawn(electron, [path.join(__dirname, 'dist/main.js')], {
  stdio: 'inherit'
});

proc.on('close', (code) => {
  process.exit(code);
}); 