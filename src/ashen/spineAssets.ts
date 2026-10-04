import { AtlasAttachmentLoader, CanvasTexture, SkeletonJson, TextureAtlas } from '@esotericsoftware/spine-canvas';
import type { SkeletonData } from '@esotericsoftware/spine-canvas';
import { RasterSpineRenderer } from './RasterSpineRenderer';
import { scheduleAssetWork } from './assetWork';
const ROOT = `${import.meta.env.BASE_URL}ashen/`;
const cache = new Map<string, Promise<SkeletonData>>();
const atlases = new Map<string, Promise<TextureAtlas>>();
const groupFor = (id: string) => id === 'frame' ? 'frame' : id.startsWith('character') ? id : id.startsWith('environment') ? 'environment' : ['curtain', 'wheel', 'bigwin', 'ritual-fire-blue', 'ritual-fire-red', 'ritual-impact', 'ritual-portal'].includes(id) ? 'effects' : 'symbols';
async function get(url: string) { const r = await fetch(url); if (!r.ok) throw new Error(`Cannot load ${url}: ${r.status}`); return r; }
async function decodedAtlas(url:string):Promise<HTMLImageElement|ImageBitmap>{
  if(typeof createImageBitmap==='function'){
    // Decode a Blob on the browser decoder thread, rather than synchronously
    // extracting/re-decoding a large HTMLImage inside the first GPU frame.
    const blob=await (await get(url)).blob();
    try{return await createImageBitmap(blob,{premultiplyAlpha:'premultiply'});}catch{/* Older decoders retain the ordinary image fallback. */}
  }
  const image=new Image();image.decoding='async';image.src=url;await image.decode();return image;
}
export function skeletonData(id: string): Promise<SkeletonData> {
  if (!cache.has(id)) {
    const group = groupFor(id);
    if (!atlases.has(group)) atlases.set(group, get(`${ROOT}${group}.atlas?v=review19-cartoon-final`).then(r => r.text()).then(async text => {
      const atlas = new TextureAtlas(text);
      await Promise.all(atlas.pages.map(async page=>{
        const image=await decodedAtlas(`${ROOT}${page.name}?v=review19-cartoon-final`);
        await scheduleAssetWork(async()=>{if(group!=='frame')await RasterSpineRenderer.prepareImage(image);page.setTexture(new CanvasTexture(image));});
      }));
      return atlas;
    }).catch(error => { atlases.delete(group); throw error; }));
    cache.set(id, Promise.all([atlases.get(group)!, get(`${ROOT}${id}.json?v=review19-cartoon-final`).then(r => r.json())]).then(([atlas, json]) => scheduleAssetWork(()=>new SkeletonJson(new AtlasAttachmentLoader(atlas)).readSkeletonData(json))).catch(error => { cache.delete(id); throw error; }));
  }
  return cache.get(id)!;
}
export const RIG_IDS = ['ten','j','q','k','a','poison','skull','raven','heart','hand','blue-six','red-six','character','character-blue','environment','environment-bonus','ritual-fire-blue','ritual-fire-red','ritual-impact','ritual-portal','curtain','wheel','bigwin','frame'];
export async function preloadRigs(onProgress: (value: number) => void) {
  let count=0;
  const ids=RIG_IDS,bitmaps=['ui/numerals-v9.webp','background-v14.webp','bonus-background-v14.webp','curtain-chamber-v17.webp','ui/v14/logo.webp','ui/v14/panel.webp','ui/v14/action.webp','ui/v14/spin.webp','ui/v14/bonus.webp','ui/v14/reel-bed.webp',...['first-pact','hell-unbound','final-rite','eclipse-pact','ritual-1','ritual-2','ritual-3'].map(name=>`ui/v19/${name}.webp`),...['big','mega','epic','max'].map(name=>`ui/v19/${name}.webp`),...['bonus','menu','turbo','auto','spin','stop','down'].map(name=>`ui/v5/${name}.png`)],total=ids.length+bitmaps.length;
  const progress=()=>onProgress(++count/total);
  await Promise.all([
    ...ids.map(async id=>{await skeletonData(id);progress();}),
    ...bitmaps.map(async file=>{const image=new Image();image.decoding='async';image.src=`${ROOT}${file}`;await image.decode();progress();})
  ]);
}
