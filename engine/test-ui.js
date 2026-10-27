// Local test mode only. Subtitle and music choices are not yet implemented.
const section=document.querySelectorAll('section')[2];
const localNote=document.createElement('p');
localNote.textContent='โหมดทดสอบในเครื่อง: รวมคลิปและตัดช่วงเงียบได้ (สูงสุด 20 คลิป รวมไม่เกิน 200 MB) ยังไม่รองรับซับหรือเพลง';
section.prepend(localNote);
const trimLabel=document.createElement('label');
trimLabel.innerHTML='<input id="trim-local" type="checkbox"> ตัดช่วงเงียบ (ทดลอง)';
section.append(trimLabel);
const processButton=section.querySelector('button');
processButton.disabled=false;processButton.textContent='ทดลองประมวลผล';
const statusNode=document.createElement('p');section.append(statusNode);
processButton.addEventListener('click',async()=>{
 if(!clips.length){statusNode.textContent='กรุณาเลือกคลิปก่อน';return;}
 if(clips.length>20||clips.reduce((n,c)=>n+c.file.size,0)>200*1024*1024){statusNode.textContent='เลือกได้ไม่เกิน 20 คลิปและรวมไม่เกิน 200 MB';return;}
 const data=new FormData();clips.forEach(c=>data.append('clips',c.file));if(document.querySelector('#trim-local').checked)data.append('silence','on');
 processButton.disabled=true;statusNode.textContent='กำลังประมวลผล โปรดรอ';
 try{const response=await fetch('/api/edit',{method:'POST',body:data});if(!response.ok)throw Error('ประมวลผลไม่สำเร็จ');const blob=await response.blob();const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='teacher-video.mp4';a.textContent='ดาวน์โหลดวิดีโอที่ประมวลผลแล้ว';statusNode.replaceChildren(a);}
 catch(e){statusNode.textContent='ประมวลผลไม่สำเร็จ ลองใช้คลิปสั้นหรือชนิดไฟล์อื่น';}finally{processButton.disabled=false;}
});
