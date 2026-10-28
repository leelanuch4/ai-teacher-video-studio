// Store one completed video locally. Browser storage can be cleared by the user/OS.
export function resultStore(factory = globalThis.indexedDB) {
  async function database() {
    if (!factory) throw new Error('ไม่รองรับพื้นที่เก็บงานในเบราว์เซอร์นี้');
    return new Promise((resolve,reject)=>{
      const req=factory.open('teacher-video-studio',1);
      req.onupgradeneeded=()=>req.result.createObjectStore('results');
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error);
    });
  }
  async function transaction(mode, action) {
    const db=await database();
    try { return await new Promise((resolve,reject)=>{
      const tx=db.transaction('results',mode);let result;
      const request=action(tx.objectStore('results'));
      request.onsuccess=()=>{result=request.result};
      tx.oncomplete=()=>resolve(result);
      tx.onerror=()=>reject(tx.error || request.error);
      tx.onabort=()=>reject(tx.error || new Error('บันทึกงานไม่สำเร็จ'));
    }); } finally {db.close();}
  }
  return {
    save:blob=>transaction('readwrite',s=>s.put({blob,savedAt:Date.now()},'latest')),
    load:()=>transaction('readonly',s=>s.get('latest')),
    clear:()=>transaction('readwrite',s=>s.delete('latest'))
  };
}
