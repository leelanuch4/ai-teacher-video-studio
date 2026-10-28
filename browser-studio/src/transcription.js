// Translate model timestamp chunks into editable captions. Never invent timings.
export function transcriptCues(result, duration) {
  if (!Number.isFinite(duration)||duration<=0) throw Error('อ่านความยาวเสียงไม่ได้');
  const cues=[];
  for (const chunk of result?.chunks||[]) {
    const text=String(chunk.text||'').trim().replace(/<[^>]*>/g,'').replace(/\{[^}]*\}/g,'');
    let [start,end]=chunk.timestamp||[];
    if(!text||!Number.isFinite(start))continue;
    if(end===null)end=duration;
    if(!Number.isFinite(end))continue;
    start=Math.max(0,start,cues.at(-1)?.end||0);end=Math.min(duration,end);
    if(end-start<0.02)continue;
    if(text.length>300)throw Error('ข้อความซับที่ได้ยาวเกินไป กรุณาลองคลิปที่สั้นลง');
    cues.push({start,end,text});
  }
  if(!cues.length)throw Error('ยังไม่พบคำพูดพร้อมเวลา กรุณาลองคลิปที่เสียงพูดชัดขึ้น');
  if(cues.length>200)throw Error('ซับเกิน 200 ช่วง กรุณาลองคลิปที่สั้นลง');
  return cues;
}
