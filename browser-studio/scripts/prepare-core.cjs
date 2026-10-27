const fs = require('fs');
const path = require('path');
const src = path.dirname(require.resolve('@ffmpeg/core'));
const dest = path.join(__dirname, '..', 'public', 'ffmpeg');
fs.mkdirSync(dest, {recursive:true});
for (const name of ['ffmpeg-core.js', 'ffmpeg-core.wasm']) fs.copyFileSync(path.join(src,name), path.join(dest,name));
