import { useEffect,useLayoutEffect,useRef,useState } from 'react';
import './reel-motion.css';

/** Integral of a smooth acceleration, constant speed and smooth deceleration. */
function reelTravel(progress:number){
  const t=Math.max(0,Math.min(1,progress)),acceleration=.15,deceleration=.35,cruiseEnd=1-deceleration;
  const total=1-(acceleration+deceleration)/2;
  if(t<acceleration){const u=t/acceleration;return acceleration*(u*u*u-u*u*u*u/2)/total;}
  if(t<cruiseEnd)return(t-acceleration/2)/total;
  const u=(t-cruiseEnd)/deceleration;
  return(cruiseEnd-acceleration/2+deceleration*(u-u*u*u+u*u*u*u/2))/total;
}

/** The outgoing strip is retained while the recorded result enters from above.
 * Landing uses the live Spine canvases, preserving the exact final pose/order. */
export function ReelMotion({active,speed,column,durationMs,startedAt}:{active:boolean;speed:number;column:number;durationMs?:number;startedAt:number}){
  const canvas=useRef<HTMLCanvasElement>(null);
  const [visible,setVisible]=useState(false);
  const running=useRef(active);
  const stopRequestedAt=useRef<number|null>(null);
  useLayoutEffect(()=>{
    running.current=active;
    stopRequestedAt.current=active?null:performance.now();
    const host=canvas.current?.parentElement;
    if(host){if(!active&&visible)host.dataset.reelSettling='true';else delete host.dataset.reelSettling;}
  },[active,visible]);
  useEffect(()=>{
    const target=canvas.current,host=target?.parentElement;
    if(!target||!host||!running.current)return;
    const context=target.getContext('2d');if(!context)return;
    const duration=durationMs??(800+column*100)/(speed>1?1/.36:1),distance=4*(2+Math.floor(column/2));
    // Leave one paint-sized interval at the destination before the controller
    // hands over to the landing skeleton, even if its first mount was delayed.
    const travelDuration=Math.max(1,duration-Math.min(36,duration*.08));
    let raf=0,width=1,height=1,measureNeeded=true,lastOffset=0,lastTime=0,retained=false,settleFrom:number|null=null;
    const start=startedAt;
    let hiddenAt:number|null=document.hidden?start:null,hiddenDuration=0;
    const visibility=()=>{const now=performance.now();if(document.hidden)hiddenAt=now;else if(hiddenAt!==null){const pausedFor=now-hiddenAt;hiddenDuration+=pausedFor;if(stopRequestedAt.current!==null)stopRequestedAt.current+=pausedFor;hiddenAt=null;lastTime=0;}};
    document.addEventListener('visibilitychange',visibility);
    type Cell={source:HTMLCanvasElement;x:number;y:number;width:number;height:number};
    let cells:Cell[]=[];
    const measure=()=>{
      const box=host.getBoundingClientRect(),ratio=Math.min(devicePixelRatio||1,1.6);
      width=Math.max(1,Math.round(box.width*ratio));height=Math.max(1,Math.round(box.height*ratio));
      if(target.width!==width||target.height!==height){target.width=width;target.height=height;}
      cells=[...host.querySelectorAll<HTMLCanvasElement>('.symbol-cell canvas')].map((source,index)=>{const r=source.getBoundingClientRect();return{source,x:(r.x-box.x)*ratio,y:(r.y-box.y-index*box.height/4)*ratio,width:r.width*ratio,height:r.height*ratio};});
      measureNeeded=false;
    };
    measure();
    // The controller publishes its result during the spin. Keeping the old
    // texture snapshots prevents all four visible symbols changing at once.
    const outgoingWidth=width,outgoingHeight=height;
    const outgoing=cells.map(cell=>{
      const snapshot=document.createElement('canvas');snapshot.width=cell.source.width;snapshot.height=cell.source.height;
      snapshot.getContext('2d')?.drawImage(cell.source,0,0);
      return{...cell,source:snapshot};
    });
    target.dataset.stripMode='retained-outgoing';
    const observer=new ResizeObserver(()=>{measureNeeded=true;});observer.observe(host);
    const mutations=new MutationObserver(()=>{measureNeeded=true;});mutations.observe(host,{childList:true,subtree:true,attributes:true,attributeFilter:['data-symbol','class']});
    const render=()=>{
      const now=performance.now();
      if(document.hidden){raf=requestAnimationFrame(render);return;}
      if(!retained&&running.current){retained=true;setVisible(true);}
      if(measureNeeded)measure();
      context.clearRect(0,0,width,height);
      let progress=Math.min(1,Math.max(0,(now-start-hiddenDuration)/travelDuration)),travel=reelTravel(progress)*distance;
      if(!running.current){
        // A late browser frame must finish the remaining travel instead of
        // unmounting the strip between rows. Copy the live landing pose until
        // the exact handover frame, then reveal that same source underneath.
        if(settleFrom===null)settleFrom=lastOffset;
        const settleMs=speed>1?60:90;
        const t=host.closest('.reduced-motion')?1:Math.max(0,Math.min(1,(now-(stopRequestedAt.current??now))/settleMs));
        travel=settleFrom+(distance-settleFrom)*(1-(1-t)**3);
        progress=t===1?1:progress;
        target.dataset.phase='settling';
      }
      const velocity=lastTime?(travel-lastOffset)/Math.max(1,now-lastTime):0;
      const offset=travel%4,cellH=height/4,first=-Math.ceil(travel);
      const trail=Math.min(cellH*.10,Math.abs(velocity)*cellH*4.5);
      context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';
      const drawStrip=(shutterOffset:number,alpha:number)=>{
        context.globalAlpha=alpha;
        for(let row=first-1;row<first+6;row++){
          const resolvedRow=row+distance,fromResult=resolvedRow>=0&&resolvedRow<4;
          const cell=fromResult?cells[resolvedRow]:outgoing[((row%4)+4)%4];
          if(!cell?.source.width||!cell.source.height)continue;
          const sx=fromResult?1:width/outgoingWidth,sy=fromResult?1:height/outgoingHeight;
          const drawY=(row+travel)*cellH+cell.y*sy+shutterOffset,drawH=cell.height*sy;
          // The retained strip includes guard rows. Skip rows wholly outside
          // its canvas instead of issuing invisible copies for all three trails.
          if(drawY>=height||drawY+drawH<=0)continue;
          context.drawImage(cell.source,cell.x*sx,drawY,cell.width*sx,drawH);
        }
      };
      // Short vertical exposure softens fast travel without blurring horizontal
      // details. It fades continuously to a sharp, registered landing image.
      if(trail>.5){drawStrip(-trail,.12);drawStrip(trail,.12);}
      drawStrip(0,1);context.globalAlpha=1;
      target.style.filter='none';target.dataset.travel=travel.toFixed(5);
      target.dataset.progress=progress.toFixed(3);target.dataset.offset=offset.toFixed(4);
      lastOffset=travel;lastTime=now;
      if(!running.current&&distance-travel<.000001){
        target.dataset.offset='0.0000';target.dataset.progress='1.000';target.style.filter='none';
        delete host.dataset.reelSettling;setVisible(false);return;
      }
      raf=requestAnimationFrame(render);
    };
    raf=requestAnimationFrame(render);return()=>{cancelAnimationFrame(raf);observer.disconnect();mutations.disconnect();document.removeEventListener('visibilitychange',visibility);delete host.dataset.reelSettling;};
  },[speed,column,durationMs,startedAt]);
  return active||visible?<canvas ref={canvas} className="reel-motion-strip" aria-hidden="true"/>:null;
}
