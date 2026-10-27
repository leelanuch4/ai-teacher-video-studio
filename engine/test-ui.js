// Local test mode only. Automatic subtitles are not implemented.
const section=document.querySelectorAll('section')[2];
const localNote=document.createElement('p');
localNote.textContent='โหมดทดสอบในเครื่อง: รวมคลิปและตัดช่วงเงียบได้ (สูงสุด 20 คลิป รวมเพลงไม่เกิน 190 MB) ยังไม่รองรับซับ เลือกไฟล์เพลงพื้นหลังได้';
section.prepend(localNote);
section.querySelectorAll('fieldset').forEach(field=>field.disabled=true);
const layout=document.createElement('select');layout.setAttribute('aria-label','รูปแบบวิดีโอ');[['portrait','แนวตั้ง 9:16'],['landscape','แนวนอน 16:9'],['square','สี่เหลี่ยม 1:1']].forEach(([value,title])=>layout.add(new Option(title,value)));section.append(layout);
const trimLabel=document.createElement('label');
trimLabel.innerHTML='<input id="trim-local" type="checkbox"> ตัดช่วงเงียบ (ทดลอง)';
section.append(trimLabel);
const musicInput=document.createElement('input');musicInput.type='file';musicInput.accept='audio/*';musicInput.setAttribute('aria-label','เลือกไฟล์เพลงพื้นหลัง');section.append(musicInput);
const processButton=section.querySelector('button');
processButton.disabled=false;processButton.textContent='ทดลองประมวลผล';
const statusNode=document.createElement('p');section.append(statusNode);
processButton.addEventListener('click',async()=>{
 if(!clips.length){statusNode.textContent='กรุณาเลือกคลิปก่อน';return;}
 if(clips.length>20||clips.reduce((n,c)=>n+c.file.size,0)+(musicInput.files[0]?.size||0)>190*1024*1024){statusNode.textContent='เลือกได้ไม่เกิน 20 คลิป และขนาดรวมเพลงไม่เกิน 190 MB';return;}
 const data=new FormData();data.append('layout',layout.value);clips.forEach(c=>data.append('clips',c.file));if(document.querySelector('#trim-local').checked)data.append('silence','on');if(musicInput.files[0])data.append('musicfile',musicInput.files[0]);
 processButton.disabled=true;statusNode.textContent='กำลังประมวลผล โปรดรอ';
 try{const response=await fetch('/api/edit',{method:'POST',body:data});if(!response.ok)throw Error('ประมวลผลไม่สำเร็จ');const blob=await response.blob();const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='teacher-video.mp4';a.textContent='ดาวน์โหลดวิดีโอที่ประมวลผลแล้ว';statusNode.replaceChildren(a);}
 catch(e){statusNode.textContent='ประมวลผลไม่สำเร็จ ลองใช้คลิปสั้นหรือชนิดไฟล์อื่น';}finally{processButton.disabled=false;}
});
