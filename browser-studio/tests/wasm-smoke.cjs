// Runs the same FFmpeg WebAssembly core against synthetic clips, without a browser.
global.self={location:{href:'file:///tmp/worker.js'}};
const fs=require('fs'),os=require('os'),path=require('path'),{execFileSync}=require('child_process');
const make=require('@ffmpeg/core');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'teacher-wasm-'));
 try {
  const a=path.join(dir,'a.mp4'),b=path.join(dir,'b.mp4'),out=path.join(dir,'out.mp4');
  execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=blue:s=160x90:r=25:d=1.4','-f','lavfi','-i','sine=frequency=440:duration=1.4','-shortest','-c:v','libx264','-c:a','aac',a]);
  execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=red:s=160x90:r=25:d=1','-c:v','libx264',b]);
  const m=await make({wasmBinary:fs.readFileSync(require.resolve('@ffmpeg/core/wasm'))});let logs=[];m.setLogger(x=>logs.push(x.message));
  function run(...args){logs=[];const code=m.exec(...args);m.reset();if(code!==0)throw Error('FFmpeg error: '+logs.slice(-5).join('\n'));}
  for(let i=0;i<2;i++){
   m.FS.writeFile('in'+i,fs.readFileSync(i?b:a));const args=['-i','in'+i];
   if(i)args.push('-f','lavfi','-i','anullsrc=channel_layout=stereo:sample_rate=48000');
   args.push('-map','0:v:0','-map',i?'1:a:0':'0:a:0','-vf','scale=360:640:force_original_aspect_ratio=decrease,pad=360:640:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=25','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-ar','48000','-ac','2','-af','apad','-shortest','norm'+i+'.mp4');
   run(...args);run('-i','norm'+i+'.mp4','-af','silencedetect=noise=-35dB:d=0.8','-f','null','-');
   if(!logs.some(x=>x.includes('Duration:')))throw Error('Duration missing');
   run('-ss','0','-i','norm'+i+'.mp4','-t',i?'1.0':'1.4','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-ar','48000','-ac','2','part'+i+'.mp4');
  }
  m.FS.writeFile('list.txt',"file 'part0.mp4'\nfile 'part1.mp4'\n");run('-f','concat','-safe','0','-i','list.txt','-c','copy','assembled.mp4');fs.writeFileSync(out,m.FS.readFile('assembled.mp4'));
  const info=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_type','-of','json',out],{encoding:'utf8'}));
  const duration=Number(info.format.duration);if(duration<2.1||duration>2.8||!info.streams.some(s=>s.codec_type==='video')||!info.streams.some(s=>s.codec_type==='audio'))throw Error('Unexpected output duration or streams');
  console.log(`WebAssembly merge passed: ${duration}s with video and audio`);
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1});
