const fs = require('fs');
const path = require('path');
// Vite creates a module worker, so it must load the ESM core (not UMD).
const src = path.resolve(path.dirname(require.resolve('@ffmpeg/core')), '..', 'esm');
const dest = path.join(__dirname, '..', 'public', 'ffmpeg');
fs.mkdirSync(dest, {recursive:true});
for (const name of ['ffmpeg-core.js', 'ffmpeg-core.wasm']) fs.copyFileSync(path.join(src,name), path.join(dest,name));
// Serve inference runtime from this site; only model weights come from Hugging Face.
const ort=path.dirname(require.resolve('onnxruntime-web'));
const ortDest=path.join(__dirname,'..','public','onnx');fs.mkdirSync(ortDest,{recursive:true});
for(const name of ['ort-wasm-simd-threaded.mjs','ort-wasm-simd-threaded.wasm','ort-wasm-simd-threaded.jsep.mjs','ort-wasm-simd-threaded.jsep.wasm'])fs.copyFileSync(path.join(ort,name),path.join(ortDest,name));
