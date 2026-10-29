import { inputBudget } from './input-budget.js';
import { transcriptCues } from './transcription.js';
import { parseSrt, toSrt, toVtt } from './captions.js';
import { resultStore } from './saved-result.js';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

const $ = s => document.querySelector(s);
const ffmpeg = new FFmpeg();
let clips = [], outputUrl = null, working = false, logs = [], captionBase=null, trackUrl=null;
ffmpeg.on('log', ({message}) => logs.push(message));
const saved = resultStore();
const savedNote=document.createElement('p');
$('#result').after(savedNote);
function displayResult(blob, keepBase=false) {
  if(!keepBase) captionBase=blob;
  if(outputUrl) URL.revokeObjectURL(outputUrl);
  outputUrl=URL.createObjectURL(blob);
  const video=document.createElement('video');video.controls=true;video.preload='metadata';video.playsInline=true;video.src=outputUrl;
  const link=document.createElement('a');link.href=outputUrl;link.download='teacher-video.mp4';link.textContent='ดาวน์โหลดวิดีโอ';
  $('#result').replaceChildren(video,link);
}
const restore = (async()=>{
  try {
    const previous=await saved.load();
    if(previous?.blob){displayResult(previous.blob);savedNote.textContent='เปิดผลลัพธ์ล่าสุดที่เก็บไว้ในเบราว์เซอร์นี้แล้ว กรุณาดาวน์โหลดเก็บไว้ด้วย';}
  } catch {savedNote.textContent='เบราว์เซอร์นี้ยังเปิดพื้นที่เก็บงานไม่ได้ กรุณาดาวน์โหลดวิดีโอทันทีเมื่อเสร็จ';}
})();

function clipSummary(){
  const budget=inputBudget(clips.map(c=>c.file),$('#music').files[0]?.size||0);
  const known=clips.filter(c=>Number.isFinite(c.duration));
  const seconds=known.reduce((n,c)=>n+c.duration,0);
  const minutes=Math.floor(seconds/60),remaining=Math.floor(seconds%60);
  let state=!clips.length?'เลือกคลิปได้เลย เว็บจะตรวจขนาดให้เอง':budget.allowed?(budget.large?'เริ่มทดลองได้ — ไฟล์ค่อนข้างใหญ่ อาจใช้เวลานานหรือหน่วยความจำไม่พอ':'เริ่มทดลองรวมคลิปได้'):'ต้องลดไฟล์ก่อนเริ่ม';
  if(clips.length>5)state+=' · เลือกได้ไม่เกิน 5 คลิป';
  if(budget.remaining)state+=` · ลบหรือลดไฟล์รวมอย่างน้อย ${(budget.remaining/1e6).toFixed(1)} MB`;
  $('#clip-summary').textContent=`${state} | เลือก ${clips.length} คลิป · ${known.length===clips.length?`ความยาวรวม ${minutes} นาที ${remaining} วินาที`:'กำลังอ่านความยาว'} (ก่อนตัด) · รวมเพลง ${budget.mb.toFixed(1)} จาก 200 MB · ซับเต็มคลิปทดลองได้ไม่เกิน 2 นาที`;
  $('#clip-summary').style.padding='12px';$('#clip-summary').style.background=budget.allowed?'#edf6e8':'#fff2d7';$('#clip-summary').style.borderRadius='10px';
}
$('#music').addEventListener('change',clipSummary);

function draw() {
  clipSummary();
  const list = $('#list'); list.replaceChildren();
  clips.forEach((c,i) => {
    const li=document.createElement('li'), name=document.createElement('strong'); name.textContent=`${i+1}. ${c.file.name}`; li.append(name);
    const video=document.createElement('video'); video.controls=true; video.preload='metadata'; video.src=c.url;video.onloadedmetadata=()=>{c.duration=video.duration;clipSummary()};li.append(video);
    for(const [text,disabled,fn] of [['ขึ้น',i===0,()=>{[clips[i-1],clips[i]]=[clips[i],clips[i-1]]}],['ลง',i===clips.length-1,()=>{[clips[i+1],clips[i]]=[clips[i],clips[i+1]]}],['ลบ',false,()=>{URL.revokeObjectURL(c.url);clips.splice(i,1)}]]) {
      const b=document.createElement('button');b.type='button';b.textContent=text;b.disabled=disabled||working;b.onclick=()=>{fn();draw()};li.append(b);
    } list.append(li);
  });
}
$('#files').addEventListener('change',e=>{ for(const file of e.target.files) clips.push({file,url:URL.createObjectURL(file)});e.target.value='';draw(); });
async function exec(args) { const code=await ffmpeg.exec(args); if(code!==0) throw Error('เครื่องมือตัดต่อไม่สามารถอ่านไฟล์นี้ได้'); }
function parseSilence(messages, duration) {
  const events=[];
  for(const line of messages) { for(const match of line.matchAll(/silence_(start|end):\s*([\d.]+)/g)) events.push([match[1],Number(match[2])]); }
  const silence=[];let start=null;
  for(const [type,t] of events){if(type==='start')start=t; else if(start!==null){silence.push([start,t]);start=null;}}
  if(start!==null)silence.push([start,duration]);
  if(silence.length===1&&silence[0][0]<0.05&&silence[0][1]>=duration-0.05)return [[0,duration]];
  let pos=0;const keep=[];
  for(const [a,b] of silence){const x=Math.max(pos,a+0.2),y=Math.min(duration,b-0.2);if(y<=x)continue;if(x-pos>0.05)keep.push([pos,x]);pos=y;}
  if(duration-pos>0.05)keep.push([pos,duration]); return keep.length?keep:[[0,duration]];
}
function durationFromLogs(messages){for(const line of messages){const m=line.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);if(m)return +m[1]*3600 + +m[2]*60 + +m[3];}return null;}
async function safeDelete(name){try{await ffmpeg.deleteFile(name)}catch{}}
$('#run').addEventListener('click',async()=>{
  if(working)return;
  await restore;
  const music=$('#music').files[0];
  if(!clips.length){$('#status').textContent='กรุณาเลือกคลิปก่อน';return;}
  if(!inputBudget(clips.map(c=>c.file),music?.size||0).allowed){clipSummary();$('#status').textContent='ยังเริ่มไม่ได้ กรุณาดูคำแนะนำในช่องตรวจไฟล์ด้านบน';$('#clip-summary').scrollIntoView({behavior:'smooth',block:'center'});return;}
  working=true; $('#run').disabled=true;$('#files').disabled=true;draw();$('#result').replaceChildren();if(outputUrl){URL.revokeObjectURL(outputUrl);outputUrl=null;}
  const cleanup=[];
  try{
    $('#status').textContent='กำลังโหลดเครื่องมือตัดต่อครั้งแรก อาจใช้เวลาสักครู่';
    if(!ffmpeg.loaded)await ffmpeg.load({coreURL:new URL('/ffmpeg/ffmpeg-core.js',location.href).href,wasmURL:new URL('/ffmpeg/ffmpeg-core.wasm',location.href).href});
    const [w,h]=({portrait:[360,640],landscape:[640,360],square:[480,480]})[$('#format').value];let segments=[];
    for(let i=0;i<clips.length;i++){
      $('#status').textContent=`กำลังเตรียมคลิปที่ ${i+1} จาก ${clips.length}`;
      const input=`input${i}`,norm=`norm${i}.mp4`;cleanup.push(input,norm);
      await ffmpeg.writeFile(input,await fetchFile(clips[i].file)); logs=[]; await ffmpeg.exec(['-i',input,'-f','null','-']);
      const hasAudio=logs.some(x=>/Stream #.*Audio:/.test(x));
      const args=['-y','-i',input];if(!hasAudio)args.push('-f','lavfi','-i','anullsrc=channel_layout=stereo:sample_rate=48000');
      args.push('-map','0:v:0','-map',hasAudio?'0:a:0':'1:a:0','-vf',`scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=25`,'-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-ar','48000','-ac','2','-af','apad','-shortest',norm);
      await exec(args);await safeDelete(input);
      logs=[];await ffmpeg.exec(['-i',norm,'-af','silencedetect=noise=-35dB:d=0.8','-f','null','-']);
      const duration=durationFromLogs(logs);if(!duration)throw Error('อ่านความยาวคลิปไม่ได้ กรุณาลองไฟล์อื่น');
      const keep=$('#trim').checked&&hasAudio?parseSilence(logs,duration):[[0,duration]];
      for(let j=0;j<keep.length;j++){
        const [start,end]=keep[j],part=`part${i}_${j}.mp4`;cleanup.push(part);segments.push(part);
        await exec(['-y','-ss',start.toFixed(3),'-i',norm,'-t',(end-start).toFixed(3),'-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-ar','48000','-ac','2',part]);
      }
      await safeDelete(norm);
    }
    $('#status').textContent='กำลังรวมคลิป';
    const manifest=segments.map(x=>`file '${x}'`).join('\n');cleanup.push('list.txt','assembled.mp4','final.mp4','music');
    await ffmpeg.writeFile('list.txt',new TextEncoder().encode(manifest));await exec(['-y','-f','concat','-safe','0','-i','list.txt','-c','copy','assembled.mp4']);
    let output='assembled.mp4';
    if(music){$('#status').textContent='กำลังใส่เพลงพื้นหลัง';await ffmpeg.writeFile('music',await fetchFile(music));await exec(['-y','-i','assembled.mp4','-stream_loop','-1','-i','music','-filter_complex','[1:a]volume=0.12[m];[0:a][m]amix=inputs=2:duration=first:normalize=0[a]','-map','0:v:0','-map','[a]','-c:v','copy','-c:a','aac','-movflags','+faststart','final.mp4']);output='final.mp4';}
    const data=await ffmpeg.readFile(output), blob=new Blob([data],{type:'video/mp4'});
    displayResult(blob);
    $('#status').textContent='ประมวลผลเสร็จแล้ว กรุณาตรวจวิดีโอก่อนดาวน์โหลด';
    try {await saved.save(blob);savedNote.textContent='เก็บผลลัพธ์ล่าสุดในเบราว์เซอร์นี้แล้ว งานใหม่จะทับผลลัพธ์นี้ ยังควรดาวน์โหลดสำรอง เพราะระบบหรือการล้างข้อมูลอาจลบไฟล์ได้';}
    catch {savedNote.textContent='บันทึกในเบราว์เซอร์ไม่สำเร็จ กรุณาดาวน์โหลดก่อนปิดหรือรีเฟรชหน้า';}

  } catch(e){console.error(e);$('#status').textContent=`ยังประมวลผลไม่สำเร็จ: ${e instanceof Error ? e.message : String(e || 'ไม่ทราบสาเหตุ')}`;}
  finally {for(const name of cleanup)await safeDelete(name);working=false;$('#run').disabled=false;$('#files').disabled=false;draw();}
});

$('#srt-file').addEventListener('change',async e=>{
  try {const f=e.target.files[0];if(!f)return;if(f.size>200000)throw Error('ไฟล์ซับใหญ่เกินไป');$('#srt-editor').value=toSrt(parseSrt(await f.text()));$('#caption-status').textContent='นำเข้าซับแล้ว ตรวจข้อความและเวลาได้';}
  catch(e){$('#caption-status').textContent=String(e.message||e);}
  finally {e.target.value='';}
});
function captionCues(){
  if(!captionBase)throw Error('กรุณารวมคลิปให้เสร็จก่อน หรือเปิดวิดีโอที่บันทึกไว้');
  const cues=parseSrt($('#srt-editor').value),video=$('#result video');
  if(!Number.isFinite(video?.duration))throw Error('รอให้วิดีโอโหลด แล้วกดอีกครั้ง');
  if(cues.some(c=>c.end>video.duration+0.1))throw Error('เวลาซับเกินความยาววิดีโอ กรุณาตรวจเวลา');
  return cues;
}
$('#preview-captions').onclick=()=>{
  try{const cues=captionCues(),video=$('#result video');video.querySelectorAll('track').forEach(t=>t.remove());if(trackUrl)URL.revokeObjectURL(trackUrl);trackUrl=URL.createObjectURL(new Blob([toVtt(cues)],{type:'text/vtt'}));const track=document.createElement('track');track.kind='subtitles';track.label='ภาษาไทย';track.srclang='th';track.src=trackUrl;track.default=true;video.append(track);track.addEventListener('load',()=>{track.track.mode='showing'});$('#caption-status').textContent='เพิ่มซับตัวอย่างแล้ว กดเล่นวิดีโอด้านบน รูปแบบในไฟล์ส่งออกอาจต่างจากเครื่องเล่น';video.scrollIntoView({behavior:'smooth',block:'center'});}
  catch(e){$('#caption-status').textContent=String(e.message||e);}
};
$('#burn-captions').onclick=async()=>{
  if(working){$('#caption-status').textContent='รอประมวลผลปัจจุบันให้เสร็จก่อน';return;}
  let cues;try{cues=captionCues();}catch(e){$('#caption-status').textContent=String(e.message||e);return;}
  working=true;$('#run').disabled=true;$('#burn-captions').disabled=true;
  try{
    $('#caption-status').textContent='กำลังใส่ซับไทยสีขาว กรุณาเปิดหน้านี้ไว้';
    if(!ffmpeg.loaded)await ffmpeg.load({coreURL:new URL('/ffmpeg/ffmpeg-core.js',location.href).href,wasmURL:new URL('/ffmpeg/ffmpeg-core.wasm',location.href).href});
    const response=await fetch('/fonts/NotoSansThai.ttf');if(!response.ok)throw Error('โหลดฟอนต์ภาษาไทยไม่สำเร็จ');
    await ffmpeg.writeFile('thai.ttf',new Uint8Array(await response.arrayBuffer()));
    await ffmpeg.writeFile('captions.srt',new TextEncoder().encode(toSrt(cues)));
    await ffmpeg.writeFile('caption-input.mp4',await fetchFile(captionBase));
    await exec(['-y','-i','caption-input.mp4','-vf',"subtitles=captions.srt:fontsdir=.:force_style='FontName=Noto Sans Thai,FontSize=20,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=1.5,Shadow=0,MarginV=24'",'-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','copy','-movflags','+faststart','caption-output.mp4']);
    const data=await ffmpeg.readFile('caption-output.mp4'),blob=new Blob([data],{type:'video/mp4'});displayResult(blob,true);
    try{await saved.save(blob);savedNote.textContent='เก็บวิดีโอพร้อมซับเป็นผลลัพธ์ล่าสุดแล้ว กรุณาดาวน์โหลดสำรอง';}catch{savedNote.textContent='เก็บผลลัพธ์ไม่สำเร็จ กรุณาดาวน์โหลดก่อนปิดหน้า';}
    $('#caption-status').textContent='สร้างวิดีโอพร้อมซับแล้ว ตรวจและดาวน์โหลดจากวิดีโอด้านบน';
  }catch(e){$('#caption-status').textContent='ใส่ซับไม่สำเร็จ: '+String(e.message||e);}
  finally{for(const f of ['thai.ttf','captions.srt','caption-input.mp4','caption-output.mp4'])await safeDelete(f);working=false;$('#run').disabled=false;$('#burn-captions').disabled=false;}
};

async function mediaReady(video){
  if(Number.isFinite(video?.duration))return;
  if(!video)throw Error('ยังไม่มีวิดีโอที่ประมวลผลแล้ว');
  await new Promise((resolve,reject)=>{
    const cleanup=()=>{clearTimeout(timer);video.removeEventListener('loadedmetadata',ok);video.removeEventListener('error',bad)};
    const ok=()=>{cleanup();resolve()};const bad=()=>{cleanup();reject(Error('อ่านวิดีโอที่บันทึกไว้ไม่ได้'))};
    const timer=setTimeout(()=>{cleanup();reject(Error('ยังอ่านความยาววิดีโอไม่ได้ กรุณากดเล่นวิดีโอหนึ่งครั้ง'))},15000);
    video.addEventListener('loadedmetadata',ok,{once:true});video.addEventListener('error',bad,{once:true});
  });
}
let asrWorker=null;
let stopTranscription=null;
$('#cancel-transcribe').onclick=()=>stopTranscription?.();
$('#auto-captions').onclick=async()=>{
  if(working){$('#caption-status').textContent='รอประมวลผลปัจจุบันให้เสร็จก่อน';return;}
  await restore;
  const video=$('#result video');
  if(!captionBase){$('#caption-status').textContent='กรุณารวมคลิปให้เสร็จก่อน';return;}
  try{await mediaReady(video)}catch(e){$('#caption-status').textContent=e.message;return;}
  const sample=$('#asr-range').value==='sample';
  if(video.duration>120&&!sample){$('#caption-status').textContent='โหมดถอดเสียงในอุปกรณ์รุ่นทดลองรองรับคลิปไม่เกิน 2 นาที';return;}
  working=true;$('#run').disabled=true;$('#burn-captions').disabled=true;$('#auto-captions').disabled=true;
  let stage='A1 เตรียมเสียง';$('#caption-diagnostic').textContent='';
  try{
    $('#caption-status').textContent='กำลังเตรียมเสียงจากวิดีโอ';
    if(!ffmpeg.loaded)await ffmpeg.load({coreURL:new URL('/ffmpeg/ffmpeg-core.js',location.href).href,wasmURL:new URL('/ffmpeg/ffmpeg-core.wasm',location.href).href});
    await ffmpeg.writeFile('asr-input.mp4',await fetchFile(captionBase));
    await exec(['-y','-i','asr-input.mp4',...(sample?['-t','20']:[]),'-vn','-ac','1','-ar','16000','-f','f32le','asr-audio.pcm']);
    const bytes=await ffmpeg.readFile('asr-audio.pcm');
    const audio=new Float32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
    // Release video engine memory before starting inference on phones.
    ffmpeg.terminate();
    let energy=0;for(let i=0;i<audio.length;i++)energy+=audio[i]*audio[i];
    if(!audio.length||Math.sqrt(energy/audio.length)<0.0001)throw Error('เสียงเงียบเกินไป ยังสร้างซับไม่ได้');
    const duration=audio.length/16000;
    $('#cancel-transcribe').hidden=false;
    stage='A2 เปิดตัวประมวลผล AI';
    const result=await new Promise((resolve,reject)=>{
      asrWorker=new Worker(new URL('./transcribe.worker.js',import.meta.url),{type:'module'});
      stopTranscription=()=>reject(Error('ยกเลิกการถอดเสียงแล้ว วิดีโอยังอยู่'));
      asrWorker.onerror=e=>reject(Error(e.message||'อุปกรณ์เปิดเครื่องมือถอดเสียงไม่ได้'));
      asrWorker.onmessage=({data})=>{
        if(data.type==='done')resolve(data.result);
        else if(data.type==='error')reject(Error(data.message));
        else if(data.type==='status'){stage=data.stage||stage;$('#caption-status').textContent=data.text;}
        else if(data.type==='progress'){stage='A3 โหลดโมเดล';$('#caption-status').textContent=`กำลังโหลดโมเดล ${Math.round(data.progress||0)}% (${data.file||''})`;}
      };
      asrWorker.postMessage({audio:audio.buffer},[audio.buffer]);
    });
    stage='A5 จัดข้อความและเวลา';
    const cues=transcriptCues(result,duration);
    $('#srt-editor').value=toSrt(cues);
    $('#caption-status').textContent=(sample?'สร้างร่างซับเฉพาะ 20 วินาทีแรกแล้ว ไม่ใช่ซับเต็มคลิป — ':'สร้างร่างซับเต็มคลิปแล้ว — ')+'ตรวจแก้คำและเวลาก่อนสร้างวิดีโอพร้อมซับ';
  }catch(e){$('#caption-status').textContent='ถอดเสียงยังไม่สำเร็จในขั้น '+stage;$('#caption-diagnostic').textContent='รายละเอียดสำหรับแจ้งมะลิ: '+String(e.message||e);}
  finally{
    asrWorker?.terminate();asrWorker=null;stopTranscription=null;$('#cancel-transcribe').hidden=true;
    if(ffmpeg.loaded){await safeDelete('asr-input.mp4');await safeDelete('asr-audio.pcm');}
    working=false;$('#run').disabled=false;$('#burn-captions').disabled=false;$('#auto-captions').disabled=false;
  }
};
