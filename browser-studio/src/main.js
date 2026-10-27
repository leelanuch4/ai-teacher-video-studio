import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

const $ = s => document.querySelector(s);
const ffmpeg = new FFmpeg();
let clips = [], outputUrl = null, working = false, logs = [];
ffmpeg.on('log', ({message}) => logs.push(message));
function draw() {
  const list = $('#list'); list.replaceChildren();
  clips.forEach((c,i) => {
    const li=document.createElement('li'), name=document.createElement('strong'); name.textContent=`${i+1}. ${c.file.name}`; li.append(name);
    const video=document.createElement('video'); video.controls=true; video.preload='metadata'; video.src=c.url; li.append(video);
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
  const music=$('#music').files[0];
  if(!clips.length){$('#status').textContent='กรุณาเลือกคลิปก่อน';return;}
  if(clips.length>5 || clips.reduce((n,c)=>n+c.file.size,0)+(music?.size||0)>100_000_000){$('#status').textContent='รุ่นทดลองรองรับไม่เกิน 5 คลิป รวมเพลงไม่เกิน 100 MB';return;}
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
    const data=await ffmpeg.readFile(output);outputUrl=URL.createObjectURL(new Blob([data],{type:'video/mp4'}));
    const video=document.createElement('video');video.controls=true;video.src=outputUrl;const link=document.createElement('a');link.href=outputUrl;link.download='teacher-video.mp4';link.textContent='ดาวน์โหลดวิดีโอ';$('#result').append(video,link);$('#status').textContent='ประมวลผลเสร็จแล้ว กรุณาตรวจวิดีโอก่อนดาวน์โหลด';
  } catch(e){console.error(e);$('#status').textContent=`ยังประมวลผลไม่สำเร็จ: ${e.message||'ลองคลิปที่สั้นลงหรือใช้อุปกรณ์อื่น'}`;}
  finally {for(const name of cleanup)await safeDelete(name);working=false;$('#run').disabled=false;$('#files').disabled=false;draw();}
});
