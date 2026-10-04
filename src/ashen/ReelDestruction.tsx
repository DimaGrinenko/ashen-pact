import {useEffect,useRef} from 'react';
import type {RefObject} from 'react';
import type {BonusArrivalStage} from './BonusArrival';

type Fragment={sx:number;sy:number;sw:number;sh:number;x:number;y:number;w:number;h:number;vx:number;vy:number;turn:number;delay:number;heavy:boolean;depth:number;yaw:number;pitch:number};
/** Fractures actual rendered symbol/frame pixels. It never changes the board,
 * consumes randomness from the game, or invents substitute symbol artwork. */
export function ReelDestruction({board,stage,paused,timeSource}:{board:RefObject<HTMLDivElement|null>;stage:BonusArrivalStage;paused:boolean;timeSource:()=>number}){
 const canvas=useRef<HTMLCanvasElement>(null),latest=useRef({stage,paused,timeSource});latest.current={stage,paused,timeSource};
 useEffect(()=>{
  const output=canvas.current,field=board.current;if(!output||!field)return;
  const ctx=output.getContext('2d');if(!ctx)return;
  const atlas=document.createElement('canvas'),tile=atlas.getContext('2d');if(!tile)return;
  const pieces:Fragment[]=[];let raf=0,elapsed=0,started=false,captured=false,captureW=1,captureH=1,painted=false;
  const snapshot=()=>{
   const area=field.getBoundingClientRect(),cx=area.x+area.width/2,cy=area.y+area.height/2;
   captureW=innerWidth;captureH=innerHeight;
   const cuts:{piece:Fragment;source:HTMLCanvasElement;polygon:number[];left:number;top:number}[]=[];
   for(const [index,source] of [...field.querySelectorAll<HTMLCanvasElement>('.symbol-cell canvas,.reel-frame-art canvas')].entries()){
    if(!source.width||!source.height)continue;
    const box=source.getBoundingClientRect(),heavy=Boolean(source.closest('.reel-frame-art'));
    const polygons:number[][]=[];
    if(heavy){
     for(let y=0;y<5;y++)for(let x=0;x<5;x++)if(!x||!y||x===4||y===4)polygons.push([x/5,y/5,(x+1)/5,y/5,(x+1)/5,(y+1)/5,x/5,(y+1)/5]);
    }else{
     const mx=.44+(index%3)*.05,my=.43+(index%4)*.04;
     polygons.push([0,0,1,0,mx,my],[1,0,1,1,mx,my],[1,1,0,1,mx,my],[0,1,0,0,mx,my]);
    }
    for(const [part,polygon] of polygons.entries()){
     const xx=polygon.filter((_,i)=>i%2===0),yy=polygon.filter((_,i)=>i%2===1),left=Math.min(...xx),top=Math.min(...yy),right=Math.max(...xx),bottom=Math.max(...yy);
     const sw=Math.max(1,Math.ceil(source.width*(right-left))),sh=Math.max(1,Math.ceil(source.height*(bottom-top)));
     const w=box.width*(right-left),h=box.height*(bottom-top),x=box.x+left*box.width+w/2,y=box.y+top*box.height+h/2;
     const dx=x-cx,dy=y-cy,len=Math.hypot(dx,dy)||1,serial=index*17+part*7;
     const force=area.width*(heavy?.31:.48)*(1+(serial%5)*.065);
     const piece={sx:0,sy:0,sw,sh,x,y,w,h,vx:dx/len*force,vy:dy/len*force-area.height*.12,turn:((serial%9)-4)*.43,delay:Math.min(.18,len/area.width*.20),heavy,depth:heavy?-.16:((serial%7)-2)*.13,yaw:((serial%5)-2)*1.25,pitch:((serial%3)-1)*.52};
     pieces.push(piece);cuts.push({piece,source,polygon,left,top});
    }
   }
   // Keep every native fragment pixel, but place the 96 cutouts on one raster
   // surface. This avoids allocating/uploading 96 independent canvas textures
   // at impact. Transparent gutters prevent neighbouring cutouts bleeding.
   const width=Math.max(1024,...pieces.map(p=>p.sw+4));let x=2,y=2,row=0;
   for(const p of [...pieces].sort((a,b)=>b.sh-a.sh)){
    if(x+p.sw+2>width){x=2;y+=row+4;row=0;}
    p.sx=x;p.sy=y;x+=p.sw+4;row=Math.max(row,p.sh);
   }
   atlas.width=width;atlas.height=Math.max(1,y+row+2);
   for(const{piece,source,polygon,left,top}of cuts){
    tile.save();tile.translate(piece.sx,piece.sy);tile.beginPath();
    for(let p=0;p<polygon.length;p+=2){const x=(polygon[p]-left)*source.width,y=(polygon[p+1]-top)*source.height;if(p)tile.lineTo(x,y);else tile.moveTo(x,y);}
    tile.closePath();tile.clip();tile.drawImage(source,-left*source.width,-top*source.height);tile.restore();
   }
   output.dataset.fragments=String(pieces.length);output.dataset.symbols=String(field.querySelectorAll('.symbol-cell').length);output.dataset.projection='perspective';captured=pieces.length>0;
  };
  const draw=()=>{
   raf=requestAnimationFrame(draw);
   if(document.hidden)return;
   const opts=latest.current,dpr=Math.min(2,devicePixelRatio||1),width=innerWidth,height=innerHeight;
   if(output.width!==Math.round(width*dpr)||output.height!==Math.round(height*dpr)){output.width=Math.round(width*dpr);output.height=Math.round(height*dpr);painted=false;}
   if(painted){ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,output.width,output.height);painted=false;}
   // Read the last actual pose at impact, not the pose from 650ms earlier.
   // CSS hides the originals but their backing pixels remain available.
   if(opts.stage==='impact'&&!captured)snapshot();
   if(opts.stage==='impact'&&captured&&!started){started=true;elapsed=0;}
   if(started&&!opts.paused&&!document.hidden)elapsed=opts.timeSource();
   if(started&&opts.stage!=='reveal'){
    const scaleX=dpr*width/captureW,scaleY=dpr*height/captureH;
    for(const p of pieces){
     const t=Math.max(0,elapsed-p.delay),life=Math.max(0,Math.min(1,(1.45-t)/.48));if(!life)continue;
     // A brief recoil precedes the separation. Each native raster shard then
     // turns on a different axis and depth plane, instead of sliding as paper.
     const recoil=Math.sin(Math.min(1,t/.095)*Math.PI)*-.012;
     const travel=Math.max(0,t-.055),inertia=1-Math.exp(-travel*3.7),gravity=captureH*(p.heavy?.19:.135)*travel*travel;
     const x=p.x+p.vx*(inertia*.76+recoil),y=p.y+p.vy*(inertia*.76+recoil)+gravity;
     const perspective=1/Math.max(.62,1-p.depth*inertia),angle=p.turn*travel,c=Math.cos(angle)*perspective,s=Math.sin(angle)*perspective;
     const yaw=Math.cos(p.yaw*travel),pitch=Math.cos(p.pitch*travel);
     const a=c*yaw,b=s*yaw,cc=-s*pitch,d=c*pitch;
     const reachX=(Math.abs(a)*p.w+Math.abs(cc)*p.h)/2,reachY=(Math.abs(b)*p.w+Math.abs(d)*p.h)/2;
     if(x+reachX<0||x-reachX>captureW||y+reachY<0||y-reachY>captureH)continue;
     ctx.globalAlpha=life;ctx.setTransform(scaleX*a,scaleY*b,scaleX*cc,scaleY*d,scaleX*x,scaleY*y);
     ctx.drawImage(atlas,p.sx,p.sy,p.sw,p.sh,-p.w/2,-p.h/2,p.w,p.h);painted=true;
    }
    output.dataset.elapsed=elapsed.toFixed(3);
   }
  };
  raf=requestAnimationFrame(draw);
  return()=>{cancelAnimationFrame(raf);atlas.width=1;atlas.height=1;};
 },[board]);
 return <canvas ref={canvas} className="reel-destruction" aria-hidden="true"/>;
}
