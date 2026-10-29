export const MAX_INPUT_BYTES=200_000_000;
export const MAX_CLIPS=5;
export function inputBudget(files,musicBytes=0){
  const bytes=files.reduce((total,file)=>total+file.size,0)+musicBytes;
  return {bytes,mb:bytes/1e6,remaining:Math.max(0,bytes-MAX_INPUT_BYTES),allowed:files.length>0&&files.length<=MAX_CLIPS&&bytes<=MAX_INPUT_BYTES,large:bytes>100_000_000};
}
