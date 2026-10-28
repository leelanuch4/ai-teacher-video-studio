const fs = require('fs');
const path = require('path');
// Vite creates a module worker, so it must load the ESM core (not UMD).
const src = path.resolve(path.dirname(require.resolve('@ffmpeg/core')), '..', 'esm');
const dest = path.join(__dirname, '..', 'public', 'ffmpeg');
fs.mkdirSync(dest, {recursive:true});
for (const name of ['ffmpeg-core.js', 'ffmpeg-core.wasm']) fs.copyFileSync(path.join(src,name), path.join(dest,name));
