import { useLayoutEffect, useRef } from 'react';
import { countUpValue } from './countUpValue';
import { writeRasterNumber } from './rasterNumberDom';
import './raster-number.css';
const defaultFormat=(cents:number)=>(cents/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
export function CountUp({cents,disabled=false,duration=2800,formatter,fitToParent=false,timeSource}:{cents:number;disabled?:boolean;duration?:number;formatter?:(cents:number)=>string;fitToParent?:boolean;timeSource?:()=>number}){
  const element=useRef<HTMLSpanElement>(null);
  const displayed=useRef(0);
  const formatterRef=useRef(formatter);formatterRef.current=formatter;
  const timeSourceRef=useRef(timeSource);timeSourceRef.current=timeSource;
  const finalText=formatter?formatter(cents):defaultFormat(cents);
  useLayoutEffect(()=>{const target=element.current;if(!target)return;let frame=0,previous=0,elapsed=0,complete=false;
    const format=(n:number)=>formatterRef.current?formatterRef.current(n):defaultFormat(n);
    if(disabled){displayed.current=cents;writeRasterNumber(target,format(cents),true);return;}
    displayed.current=0;writeRasterNumber(target,format(0),true);
    const tick=(time:number)=>{if(document.hidden){previous=0;return;}if(timeSourceRef.current)elapsed=Math.max(0,timeSourceRef.current()*1000);else if(previous)elapsed+=time-previous;previous=time;const t=Math.min(1,elapsed/duration),ease=1-(1-t)**3;displayed.current=countUpValue(cents,ease);writeRasterNumber(target,format(displayed.current),true);complete=t===1;if(!complete)frame=requestAnimationFrame(tick);};
    const visibility=()=>{cancelAnimationFrame(frame);previous=0;if(!document.hidden&&!complete)frame=requestAnimationFrame(tick);};
    document.addEventListener('visibilitychange',visibility);frame=requestAnimationFrame(tick);return()=>{cancelAnimationFrame(frame);document.removeEventListener('visibilitychange',visibility);};
  },[cents,disabled,duration]);
  useLayoutEffect(()=>{if(element.current)writeRasterNumber(element.current,formatter?formatter(displayed.current):defaultFormat(displayed.current),true);},[formatter]);
  useLayoutEffect(()=>{
    const target=element.current,parent=target?.parentElement;if(!target||!parent)return;
    if(!fitToParent){target.style.fontSize='';target.style.paddingLeft='';target.style.paddingRight='';delete target.dataset.fitted;return;}
    let disposed=false;
    const fit=()=>{
      if(disposed||parent.clientWidth===0)return;
      const style=getComputedStyle(parent),base=Number.parseFloat(style.fontSize);
      const available=Math.max(0,parent.clientWidth-Number.parseFloat(style.paddingLeft)-Number.parseFloat(style.paddingRight)-1);
      // Measure the final award, not each intermediate count. The size stays
      // stable throughout the reveal, including currency prefixes and decimals.
      const probe=document.createElement('span');probe.className=target.className;
      probe.setAttribute('aria-hidden','true');
      probe.style.cssText=`position:absolute;visibility:hidden;pointer-events:none;left:0;top:0;width:max-content;max-width:none;padding:0;margin:0;flex:none;font-size:${base}px`;
      parent.append(probe);
      let natural=0,leftBleed=0,rightBleed=0;
      try{
        writeRasterNumber(probe,finalText,true);
        const bounds=probe.getBoundingClientRect();natural=probe.offsetWidth;
        // The award can be scaling in during this measurement. Layout widths
        // exclude that parent transform, so the final amount still fits at 1x.
        const renderedScale=bounds.width/Math.max(1,natural);
        // Painted tiles are wider than their advance. Reserve their overhang,
        // otherwise the first/last bevel can still touch the frame after fitting.
        for(const glyph of probe.querySelectorAll<HTMLElement>('.painted-glyph')){
          const box=glyph.getBoundingClientRect(),overhang=(base-box.width/renderedScale)/2;
          leftBleed=Math.max(leftBleed,(bounds.left-box.left)/renderedScale+overhang);
          rightBleed=Math.max(rightBleed,(box.right-bounds.right)/renderedScale+overhang);
        }
      }finally{probe.remove();}
      const ratio=Math.min(1,available/Math.max(1,natural+leftBleed+rightBleed));
      target.style.fontSize=`${base*ratio}px`;
      target.style.paddingLeft=`${leftBleed*ratio}px`;
      target.style.paddingRight=`${rightBleed*ratio}px`;
      target.dataset.fitted=String(ratio<.999);
    };
    const observer=new ResizeObserver(fit);observer.observe(parent);
    fit();void document.fonts.ready.then(fit);window.addEventListener('resize',fit);
    return()=>{disposed=true;observer.disconnect();window.removeEventListener('resize',fit);};
  },[fitToParent,finalText]);
  return <span ref={element} className="raster-number" role="img" aria-label={finalText}/>;
}
