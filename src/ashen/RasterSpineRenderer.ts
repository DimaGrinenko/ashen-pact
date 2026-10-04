import { MeshAttachment, RegionAttachment, type Skeleton, type TextureAtlasRegion } from '@esotericsoftware/spine-canvas';
import {SharedSpineGpu} from './SpineGpuCompositor';

let gpu:SharedSpineGpu|undefined,unavailable=false,batching=false;
const jobs:{renderer:RasterSpineRenderer;skeleton:Skeleton;context:CanvasRenderingContext2D;replace:boolean}[]=[];
const gpuRigs=new WeakSet<Skeleton>();
function compositor(){if(!gpu&&!unavailable)try{gpu=new SharedSpineGpu();}catch{unavailable=true;}return gpu;}

// Cache original raster cutouts. A mesh triangle samples only its own attachment,
// avoiding hundreds of full-atlas resamples per frame. Spine still owns all poses.
const textures = new WeakMap<TextureAtlasRegion, Map<string,HTMLCanvasElement>>();
function texture(region: TextureAtlasRegion,red=1,green=1,blue=1) {
  let variants=textures.get(region);if(!variants){variants=new Map();textures.set(region,variants);}
  const channels=[red,green,blue].map(value=>Math.round(Math.max(0,Math.min(1,value))*255)),key=channels.join(',');
  let result = variants.get(key);
  if (!result) {
    result = document.createElement('canvas');
    result.width = region.width; result.height = region.height;
    const image = region.texture!.getImage() as HTMLImageElement;
    const context=result.getContext('2d')!;context.drawImage(image, region.x, region.y, region.width, region.height, 0, 0, region.width, region.height);
    if(channels.some(value=>value!==255)){const pixels=context.getImageData(0,0,result.width,result.height);for(let i=0;i<pixels.data.length;i+=4)for(let c=0;c<3;c++)pixels.data[i+c]=pixels.data[i+c]*channels[c]/255;context.putImageData(pixels,0,0);}
    if(variants.size>=32)variants.delete(variants.keys().next().value!);variants.set(key,result);
  }
  return result;
}

export class RasterSpineRenderer {
  private vertices = new Float32Array(8192);
  private context: CanvasRenderingContext2D;
  private preserveRegionEdges: boolean;
  private ownsCanvas: boolean;
  constructor(context: CanvasRenderingContext2D,preserveRegionEdges=false,ownsCanvas=false) { this.context = context;this.preserveRegionEdges=preserveRegionEdges;this.ownsCanvas=ownsCanvas; }
  private clearOwnedCanvas(){
    if(!this.ownsCanvas)return;
    const ctx=this.context;ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,ctx.canvas.width,ctx.canvas.height);ctx.restore();
  }
  static async prepareImage(image:HTMLImageElement|ImageBitmap){await compositor()?.prepareImage(image);}
  static beginFrame(){batching=true;jobs.length=0;}
  static endFrame(){
    batching=false;
    const shared=jobs.length?compositor():undefined;
    // Each job owns a separate destination canvas. Height ordering packs the
    // shelves without changing a skeleton's draw order or any visible layer.
    // If one batch exceeds the GPU limit, retain batching for the fitting
    // halves instead of clearing/copying the shared surface once per rig.
    jobs.sort((a,b)=>b.context.canvas.height-a.context.canvas.height);
    const render=(group:typeof jobs)=>{
      if(!group.length)return;
      if(shared?.drawBatch(group))return;
      if(shared&&group.length>1){const middle=Math.ceil(group.length/2);render(group.slice(0,middle));render(group.slice(middle));return;}
      for(const job of group)if(!shared?.draw(job.skeleton,job.context,job.replace))job.renderer.drawCanvas(job.skeleton);
    };
    render(jobs);
    jobs.length=0;
  }
  draw(skeleton: Skeleton,immediate=false) {
    // An authored effect whose slots are all transparent needs no GPU tile;
    // owned view canvases must still discard the previous visible pose.
    if(!skeleton.drawOrder.some(slot=>{
      const attachment=slot.getAttachment();
      return slot.bone.active&&(attachment instanceof RegionAttachment||attachment instanceof MeshAttachment)&&attachment.region&&skeleton.color.a*slot.color.a*attachment.color.a>.001;
    })){this.clearOwnedCanvas();return;}
    let useGpu=!this.preserveRegionEdges&&gpuRigs.has(skeleton);
    // The authored frame's narrow raster rails need Canvas crop sampling;
    // atlas mipmaps soften those borders. Its small glow tints are inexpensive.
    if(!useGpu&&!this.preserveRegionEdges){
      // Even a first/static tint belongs in the shader. The previous first
      // paint synchronously read and recoloured entire raster attachments.
      useGpu=skeleton.slots.some(slot=>{
        const attachment=slot.getAttachment();
        if(attachment instanceof MeshAttachment)return true;
        if(!(attachment instanceof RegionAttachment)||!slot.bone.active||skeleton.color.a*slot.color.a*attachment.color.a<=.001)return false;
        const red=Math.round(skeleton.color.r*slot.color.r*attachment.color.r*255),green=Math.round(skeleton.color.g*slot.color.g*attachment.color.g*255),blue=Math.round(skeleton.color.b*slot.color.b*attachment.color.b*255);
        return red!==255||green!==255||blue!==255;
      });
      // Keep the same sampler after a tint returns to white, avoiding a
      // rendering-path change in the middle of a win animation.
      if(useGpu)gpuRigs.add(skeleton);
    }
    if(useGpu&&!immediate&&compositor()){
      if(batching){jobs.push({renderer:this,skeleton,context:this.context,replace:this.ownsCanvas});return;}
      if(compositor()!.draw(skeleton,this.context,this.ownsCanvas))return;
    }
    this.drawCanvas(skeleton);
  }
  private drawCanvas(skeleton: Skeleton) {
    this.clearOwnedCanvas();
    const ctx = this.context;
    for (const slot of skeleton.drawOrder) {
      const attachment = slot.getAttachment();
      if (!slot.bone.active || !(attachment instanceof RegionAttachment || attachment instanceof MeshAttachment)) continue;
      const alpha = skeleton.color.a * slot.color.a * attachment.color.a;
      if (alpha <= .001 || !attachment.region) continue;
      const region = attachment.region as TextureAtlasRegion;
      const red=skeleton.color.r*slot.color.r*attachment.color.r,green=skeleton.color.g*slot.color.g*attachment.color.g,blue=skeleton.color.b*slot.color.b*attachment.color.b;
      ctx.globalAlpha = alpha;
      ctx.globalCompositeOperation = (['source-over','lighter','multiply','screen'] as const)[slot.data.blendMode] ?? 'source-over';
      if (attachment instanceof RegionAttachment) {
        attachment.computeWorldVertices(slot, this.vertices, 0, 2);
        // Spine region order: bottom-left, top-left, top-right, bottom-right.
        const v = this.vertices;
        ctx.save();
        ctx.transform((v[4]-v[2])/region.width, (v[5]-v[3])/region.width,
          (v[0]-v[2])/region.height, (v[1]-v[3])/region.height, v[2], v[3]);
        if(red!==1||green!==1||blue!==1)ctx.drawImage(texture(region,red,green,blue),0,0);
        else ctx.drawImage(region.texture!.getImage() as HTMLImageElement, region.x, region.y, region.width, region.height, 0, 0, region.width, region.height);ctx.restore();
      } else {
        const image=texture(region,red,green,blue);
        if (this.vertices.length < attachment.worldVerticesLength) this.vertices = new Float32Array(attachment.worldVerticesLength);
        attachment.computeWorldVertices(slot, 0, attachment.worldVerticesLength, this.vertices, 0, 2);
        const uv = attachment.regionUVs, v = this.vertices, indices = attachment.triangles;
        for (let i=0;i<indices.length;i+=3) {
          const a=indices[i]*2,b=indices[i+1]*2,c=indices[i+2]*2;
          const u0=uv[a]*image.width,v0=uv[a+1]*image.height;
          const du1=(uv[b]-uv[a])*image.width,dv1=(uv[b+1]-uv[a+1])*image.height;
          const du2=(uv[c]-uv[a])*image.width,dv2=(uv[c+1]-uv[a+1])*image.height;
          const det=du1*dv2-du2*dv1;if(Math.abs(det)<1e-8)continue;
          const dx1=v[b]-v[a],dy1=v[b+1]-v[a+1],dx2=v[c]-v[a],dy2=v[c+1]-v[a+1];
          const aa=(dx1*dv2-dx2*dv1)/det,bb=(dy1*dv2-dy2*dv1)/det;
          const cc=(dx2*du1-dx1*du2)/det,dd=(dy2*du1-dy1*du2)/det;
          ctx.save();ctx.beginPath();ctx.moveTo(v[a],v[a+1]);ctx.lineTo(v[b],v[b+1]);ctx.lineTo(v[c],v[c+1]);ctx.closePath();ctx.clip();
          ctx.transform(aa,bb,cc,dd,v[a]-aa*u0-cc*v0,v[a+1]-bb*u0-dd*v0);
          ctx.drawImage(image,0,0);ctx.restore();
        }
      }
    }
    ctx.globalAlpha=1;
    ctx.globalCompositeOperation='source-over';
  }
}
