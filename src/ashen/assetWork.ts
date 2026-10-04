/** Give the loading UI a paint between CPU/GPU preparation jobs. */
export function afterAssetPaint():Promise<void>{
  return new Promise(resolve=>{
    if(document.hidden){setTimeout(resolve,16);return;}
    requestAnimationFrame(()=>setTimeout(resolve,0));
  });
}

let assetQueue:Promise<unknown>=Promise.resolve();
/** Fetch/decode may overlap; synchronous Spine parsing and GPU uploads may not. */
export function scheduleAssetWork<T>(work:()=>T|Promise<T>):Promise<T>{
  const task=assetQueue.catch(()=>undefined).then(async()=>{await afterAssetPaint();return work();});
  assetQueue=task;return task;
}
