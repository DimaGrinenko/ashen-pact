import { MeshAttachment, RegionAttachment, type Skeleton, type TextureAtlasRegion } from '@esotericsoftware/spine-canvas';
import {afterAssetPaint} from './assetWork';
const quadTriangles=new Uint16Array([0,1,2,2,3,0]);
type AtlasImage=HTMLImageElement|ImageBitmap;
type DrawJob={skeleton:Skeleton;context:CanvasRenderingContext2D;replace?:boolean};
type DrawCommand={image:AtlasImage;blend:number;first:number;count:number;x:number;y:number;width:number;height:number};

// One offscreen context composites the actual Spine triangles for every small
// canvas. DOM hit areas stay independent without creating one WebGL context per cell.
export class SharedSpineGpu {
 private canvas=document.createElement('canvas');
 private gl:WebGLRenderingContext;
 private images=new WeakMap<AtlasImage,{texture:WebGLTexture;u:number;v:number}>();
 private preparing=new WeakMap<AtlasImage,Promise<void>>();
 private supportedImages=new WeakMap<AtlasImage,boolean>();
 private points=new Float32Array(16384);
 // One upload covers all jobs, including their material changes. Keep indices
 // unsigned-16 for WebGL1; very large frames flush at the exact vertex limit.
 private vertices=new Float32Array(65536*8);
 private indices=new Uint16Array(65536*6);
 private vertexCount=0;
 private indexCount=0;
 private commands:DrawCommand[]=[];
 private buffer:WebGLBuffer;
 private elements:WebGLBuffer;
 private size:WebGLUniformLocation;
 private uvScale:WebGLUniformLocation;
 private maximum:number;
 private lost=false;
 private batching=false;
 private placement={x:0,y:0};
 constructor(){
  // Reserve the common scene surface before creating the GL context. Growing
  // its backbuffer when the twenty reel cells mount caused a visible entrance
  // stall. This is one shared surface, never one render target per symbol.
  this.canvas.width=2048;
  this.canvas.height=Math.min(4096,Math.ceil(window.innerHeight*Math.min(window.devicePixelRatio||1,2)*2/256)*256);
  // Raster alpha and mip filtering already smooth the artwork. Avoid resolving
  // a multisampled offscreen buffer before each tile is copied to Canvas.
  const gl=this.canvas.getContext('webgl',{alpha:true,antialias:false,premultipliedAlpha:true,preserveDrawingBuffer:false,depth:false,stencil:false});
  if(!gl)throw new Error('WebGL unavailable');this.gl=gl;
  this.maximum=Math.min(4096,gl.getParameter(gl.MAX_TEXTURE_SIZE),...gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array);
  if(this.canvas.width>this.maximum)this.canvas.width=this.maximum;
  if(this.canvas.height>this.maximum)this.canvas.height=this.maximum;
  this.canvas.addEventListener('webglcontextlost',()=>{this.lost=true;});
  const shader=(type:number,source:string)=>{const s=gl.createShader(type)!;gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s)||'Shader unavailable');return s;};
  const program=gl.createProgram()!;
  const precision=gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER,gl.HIGH_FLOAT)?.precision?'highp':'mediump';
  gl.attachShader(program,shader(gl.VERTEX_SHADER,'attribute vec2 aPosition;attribute vec2 aUv;attribute vec4 aColor;uniform vec2 uSize;uniform vec2 uUvScale;varying vec2 vUv;varying vec4 vColor;void main(){gl_Position=vec4(aPosition.x/uSize.x*2.0-1.0,1.0-aPosition.y/uSize.y*2.0,0.0,1.0);vUv=aUv*uUvScale;vColor=aColor;}'));
  // A small LOD bias retains painted detail at phone sizes while keeping the
  // mip chain that prevents texture shimmer during animated minification.
  gl.attachShader(program,shader(gl.FRAGMENT_SHADER,`precision ${precision} float;varying vec2 vUv;varying vec4 vColor;uniform sampler2D uTexture;void main(){gl_FragColor=texture2D(uTexture,vUv,-1.0)*vColor;}`));
  gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program)||'Program unavailable');gl.useProgram(program);
  this.buffer=gl.createBuffer()!;this.elements=gl.createBuffer()!;this.size=gl.getUniformLocation(program,'uSize')!;this.uvScale=gl.getUniformLocation(program,'uUvScale')!;
  gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this.elements);
  for(const [name,count,offset] of [['aPosition',2,0],['aUv',2,8],['aColor',4,16]] as const){const a=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,count,gl.FLOAT,false,32,offset);}
  gl.enable(gl.BLEND);gl.disable(gl.DEPTH_TEST);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);gl.clearColor(0,0,0,0);
 }
 private allocateImage(image:AtlasImage){
  const gl=this.gl,texture=gl.createTexture()!,width=2**Math.ceil(Math.log2(image.width)),height=2**Math.ceil(Math.log2(image.height));
  const atlas={texture,u:image.width/width,v:image.height/height};
  gl.bindTexture(gl.TEXTURE_2D,texture);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
  return atlas;
 }
 private supportsImage(image:AtlasImage){
  // Atlas dimensions are immutable. Avoid native image dimension reads and
  // power-of-two checks for every attachment on every animation frame.
  let supported=this.supportedImages.get(image);
  if(supported===undefined){supported=2**Math.ceil(Math.log2(image.width))<=this.maximum&&2**Math.ceil(Math.log2(image.height))<=this.maximum;this.supportedImages.set(image,supported);}
  return supported;
 }
 /** Upload native pixels during loading, in bounded strips between paints.
  * The authored texture and its mip chain are unchanged. */
 prepareImage(image:AtlasImage):Promise<void>{
  if(this.images.has(image)||this.lost||!this.supportsImage(image))return Promise.resolve();
  if(!this.preparing.has(image))this.preparing.set(image,(async()=>{
   const gl=this.gl,atlas=this.allocateImage(image);
   let decoded:ImageBitmap|undefined;
   try{
    if(typeof createImageBitmap!=='function')throw new Error('ImageBitmap unavailable');
    // Cropping an HTMLImageElement can decode the compressed WebP again for
    // every strip in Chromium. Decode once, then crop the already decoded bitmap.
    decoded=typeof ImageBitmap!=='undefined'&&image instanceof ImageBitmap?image:await createImageBitmap(image,{premultiplyAlpha:'premultiply'});
    for(let row=0;row<image.height;row+=256){
     const bitmap=await createImageBitmap(decoded,0,row,image.width,Math.min(256,image.height-row),{premultiplyAlpha:'premultiply'});
     try{gl.bindTexture(gl.TEXTURE_2D,atlas.texture);gl.texSubImage2D(gl.TEXTURE_2D,0,0,row,gl.RGBA,gl.UNSIGNED_BYTE,bitmap);}finally{bitmap.close();}
     gl.flush();await afterAssetPaint();
    }
   }catch{
    // Browsers without bitmap crop support retain the original raster path.
    gl.bindTexture(gl.TEXTURE_2D,atlas.texture);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,image);
    await afterAssetPaint();
   }finally{if(decoded!==image)decoded?.close();}
   gl.bindTexture(gl.TEXTURE_2D,atlas.texture);gl.generateMipmap(gl.TEXTURE_2D);gl.flush();this.images.set(image,atlas);
  })());
  return this.preparing.get(image)!;
 }
 private clearArea(x:number,y:number,width:number,height:number){
  const gl=this.gl;
  // The backing surface only grows. A viewport does not restrict gl.clear,
  // so clear only pixels copied by this draw, then restore unrestricted drawing.
  try{gl.enable(gl.SCISSOR_TEST);gl.scissor(x,y,width,height);gl.clear(gl.COLOR_BUFFER_BIT);}
  finally{gl.disable(gl.SCISSOR_TEST);}
 }
 private resetGeometry(){this.vertexCount=0;this.indexCount=0;this.commands.length=0;}
 private flushGeometry(){
  if(!this.indexCount)return;
  const gl=this.gl;
  gl.bufferData(gl.ARRAY_BUFFER,this.vertices.subarray(0,this.vertexCount*8),gl.STREAM_DRAW);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,this.indices.subarray(0,this.indexCount),gl.STREAM_DRAW);
  let lastImage:AtlasImage|undefined,lastBlend=-1,lastViewport:DrawCommand|undefined;
  for(const command of this.commands){
   if(command.image!==lastImage){
    let atlas=this.images.get(command.image);
    if(!atlas){
     atlas=this.allocateImage(command.image);this.images.set(command.image,atlas);
     gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,command.image);gl.generateMipmap(gl.TEXTURE_2D);
    }else gl.bindTexture(gl.TEXTURE_2D,atlas.texture);
    gl.uniform2f(this.uvScale,atlas.u,atlas.v);lastImage=command.image;
   }
   if(command.blend!==lastBlend){gl.blendFunc(gl.ONE,command.blend===1?gl.ONE:gl.ONE_MINUS_SRC_ALPHA);lastBlend=command.blend;}
   if(!lastViewport||command.x!==lastViewport.x||command.y!==lastViewport.y||command.width!==lastViewport.width||command.height!==lastViewport.height){
    // Retain each rig's original viewport. It clips overflowing attachments
    // exactly as before and prevents a flame bleeding into an adjacent tile.
    gl.viewport(command.x,command.y,command.width,command.height);gl.uniform2f(this.size,command.width,command.height);lastViewport=command;
   }
   gl.drawElements(gl.TRIANGLES,command.count,gl.UNSIGNED_SHORT,command.first*2);
  }
  this.resetGeometry();
 }
 private copy(context:CanvasRenderingContext2D,x:number,y:number,replace=false){
  const {width,height}=context.canvas;
  context.save();context.setTransform(1,0,0,1,0,0);
  // The owned view canvas can be replaced, including transparent pixels, in
  // one operation. Generic callers still compose onto an existing surface.
  if(replace){context.globalCompositeOperation='copy';context.globalAlpha=1;}
  context.drawImage(this.canvas,x,y,width,height,0,0,width,height);context.restore();
 }
 drawBatch(jobs:DrawJob[]){
  if(this.lost||this.gl.isContextLost())return false;
  if(!jobs.length)return true;
  const width=Math.max(Math.min(2048,this.maximum),...jobs.map(j=>j.context.canvas.width));let x=0,y=0,row=0,usedWidth=0;
  const placements=jobs.map(job=>{const w=job.context.canvas.width,h=job.context.canvas.height;if(x+w>width){y+=row;x=0;row=0;}const place={x,y};x+=w;usedWidth=Math.max(usedWidth,x);row=Math.max(row,h);return place;});
  const height=y+row;if(width>this.maximum||height>this.maximum)return false;
  if(this.canvas.width<width)this.canvas.width=width;
  if(this.canvas.height<height)this.canvas.height=Math.min(this.maximum,Math.ceil(height/256)*256);
  // Batch placements and Canvas copy rectangles start at the top; GL scissors
  // start at the bottom, including when an earlier batch grew this surface.
  this.clearArea(0,this.canvas.height-height,usedWidth,height);this.resetGeometry();this.batching=true;
  for(let i=0;i<jobs.length;i++){this.placement=placements[i];if(!this.draw(jobs[i].skeleton,jobs[i].context)){this.batching=false;this.resetGeometry();return false;}}
  this.flushGeometry();this.batching=false;
  for(let i=0;i<jobs.length;i++){const {context,replace}=jobs[i],{x,y}=placements[i];this.copy(context,x,y,replace);}
  return true;
 }
 draw(skeleton:Skeleton,context:CanvasRenderingContext2D,replace=false){
  if(this.lost||this.gl.isContextLost())return false;
  const w=context.canvas.width,h=context.canvas.height;
  if(w>this.maximum||h>this.maximum)return false;
  if(!this.batching){if(this.canvas.width<w)this.canvas.width=w;if(this.canvas.height<h)this.canvas.height=Math.min(this.maximum,Math.ceil(h/256)*256);}
  if(!this.batching){this.clearArea(0,0,w,h);this.resetGeometry();}
  const transform=context.getTransform(),x=this.batching?this.placement.x:0,y=this.batching?this.canvas.height-this.placement.y-h:0;
  let command:DrawCommand|undefined;
  for(const slot of skeleton.drawOrder){
   const a=slot.getAttachment();if(!slot.bone.active||!(a instanceof RegionAttachment||a instanceof MeshAttachment)||!a.region)continue;
   const alpha=skeleton.color.a*slot.color.a*a.color.a;if(alpha<=.001)continue;
   const region=a.region as TextureAtlasRegion,image=region.texture!.getImage(),blend=slot.data.blendMode;
   const count=a instanceof RegionAttachment?4:a.worldVerticesLength/2,triangles=a instanceof RegionAttachment?quadTriangles:a.triangles;
   // Multiply/screen need the destination surface for correct transparent-edge
   // composition; the Canvas fallback supplies those uncommon blend modes.
   if(blend>1||!this.supportsImage(image)||count>8192||triangles.length>this.indices.length)return false;
   if(this.vertexCount+count>65536||this.indexCount+triangles.length>this.indices.length){this.flushGeometry();command=undefined;}
   if(!command||command.image!==image||command.blend!==blend){
    command={image,blend,first:this.indexCount,count:0,x,y,width:w,height:h};this.commands.push(command);
   }
   if(a instanceof RegionAttachment)a.computeWorldVertices(slot,this.points,0,2);else a.computeWorldVertices(slot,0,a.worldVerticesLength,this.points,0,2);
   const uv=a.uvs,red=skeleton.color.r*slot.color.r*a.color.r*alpha,green=skeleton.color.g*slot.color.g*a.color.g*alpha,blue=skeleton.color.b*slot.color.b*a.color.b*alpha;
   for(let n=0;n<count;n++){const px=this.points[n*2],py=this.points[n*2+1],o=(this.vertexCount+n)*8;this.vertices[o]=transform.a*px+transform.c*py+transform.e;this.vertices[o+1]=transform.b*px+transform.d*py+transform.f;this.vertices[o+2]=uv[n*2];this.vertices[o+3]=uv[n*2+1];this.vertices[o+4]=red;this.vertices[o+5]=green;this.vertices[o+6]=blue;this.vertices[o+7]=alpha;}
   for(let n=0;n<triangles.length;n++)this.indices[this.indexCount++]=this.vertexCount+triangles[n];this.vertexCount+=count;command.count+=triangles.length;
  }
  if(!this.batching){this.flushGeometry();this.copy(context,0,this.canvas.height-h,replace);}return true;
 }
}
