import { pipeline, env } from '@huggingface/transformers';
env.allowLocalModels=false;
env.backends.onnx.wasm.numThreads=1;
env.backends.onnx.wasm.proxy=false;
env.backends.onnx.wasm.wasmPaths=new URL('/onnx/',self.location.origin).href;
self.onmessage=async({data})=>{
  let model;
  try {
    self.postMessage({type:'status',stage:'A3 โหลดโมเดล',text:'กำลังโหลดโมเดลถอดเสียงครั้งแรก กรุณาเปิดหน้านี้ไว้'});
    model=await pipeline('automatic-speech-recognition','Xenova/whisper-tiny',{
      device:'wasm',dtype:'q8',
      progress_callback:p=>{if(p.status==='progress')self.postMessage({type:'progress',file:p.file,progress:p.progress});}
    });
    self.postMessage({type:'status',stage:'A4 ถอดเสียง',text:'กำลังฟังเสียงและสร้างซับไทย อาจใช้เวลาหลายนาที'});
    const result=await model(new Float32Array(data.audio),{language:'thai',task:'transcribe',return_timestamps:true,chunk_length_s:30,stride_length_s:5});
    self.postMessage({type:'done',result});
  } catch(e){self.postMessage({type:'error',message:String(e?.message||e)});}
  finally{try{await model?.dispose();}catch{}}
};
