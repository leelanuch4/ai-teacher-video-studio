export function parseSrt(source) {
  if(source.length>50000) throw Error('ไฟล์ซับยาวเกินไป (สูงสุด 50,000 ตัวอักษร)');
  const blocks=source.replace(/^\uFEFF/,'').replace(/\r/g,'').trim().split(/\n\s*\n/);
  const cues=[];
  function seconds(t){const m=t.match(/^(\d{2,}):(\d{2}):(\d{2})[,.](\d{3})$/);if(!m||+m[2]>59||+m[3]>59)throw Error('เวลาไม่ถูกต้อง ใช้รูปแบบ 00:00:01,000');return +m[1]*3600 + +m[2]*60 + +m[3]+ +m[4]/1000;}
  for(const block of blocks){if(!block.trim())continue;const lines=block.split('\n');if(/^\d+$/.test(lines[0].trim()))lines.shift();const timing=lines.shift()?.trim().split(/\s+-->\s+/);if(timing?.length!==2)throw Error('แต่ละช่วงต้องมีเวลาเริ่ม --> เวลาจบ');const start=seconds(timing[0]),end=seconds(timing[1]);
    const text=lines.join('\n').replace(/<[^>]*>/g,'').replace(/\{[^}]*\}/g,'').trim();
    if(!text||end<=start)throw Error('แต่ละช่วงต้องมีข้อความและเวลาจบมากกว่าเวลาเริ่ม');
    if(text.length>300)throw Error('ข้อความต่อช่วงยาวเกิน 300 ตัวอักษร');
    cues.push({start,end,text});
  }
  if(!cues.length||cues.length>200)throw Error('ใส่ซับได้ 1–200 ช่วง');
  cues.sort((a,b)=>a.start-b.start);
  for(let i=1;i<cues.length;i++)if(cues[i].start<cues[i-1].end)throw Error('เวลาซับทับกัน กรุณาปรับช่วงเวลา');
  return cues;
}
function stamp(t,sep=','){const ms=Math.round(t*1000);return `${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}${sep}${String(ms%1000).padStart(3,'0')}`;}
export function toSrt(cues){return cues.map((c,i)=>`${i+1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}`).join('\n\n')+'\n';}
export function toVtt(cues){return 'WEBVTT\n\n'+cues.map(c=>`${stamp(c.start,'.')} --> ${stamp(c.end,'.')}\n${c.text.replace(/&/g,'&amp;').replace(/</g,'&lt;')}`).join('\n\n')+'\n';}
