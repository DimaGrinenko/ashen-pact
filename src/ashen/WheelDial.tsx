import { useRef } from 'react';
import { RasterNumber } from './RasterNumber';
import { SpineView } from './SpineView';
import { useTranslation } from './i18n';
import './wheel-v4.css';
import './wheel-v9.css';

/** Labels and the painted wheel share the runtime bone angle, including turbo. */
export function WheelDial({values,result,caption,spinning,sequence=0,paused=false,speed=1,className=''}:{values:string[];result:string;caption:string;spinning:boolean;sequence?:number;paused?:boolean;speed?:number;className?:string}){
  const {t}=useTranslation();
  const labels=useRef<HTMLDivElement>(null);
  const dial=useRef<HTMLDivElement>(null);
  const motionCaption=useRef<HTMLSpanElement>(null);
  const selected=Math.max(0,values.indexOf(result));
  return <div ref={dial} className={`wheel-dial wheel-v4 wheel-v9 ${className} ${spinning?'spinning':'settled'}`} data-result={spinning?'':result} data-paused={paused}>
    <SpineView id="wheel" className="ritual-disc" animation={spinning?'spin':'win'} sequence={sequence} loop={false} paused={paused} poseAtEnd={paused&&!spinning} speed={speed} segmentCount={values.length} rotationOffset={selected*360/values.length} onRotation={(degrees,sealOpacity)=>{
      if(labels.current)labels.current.style.transform=`rotate(${-degrees}deg)`;
      if(dial.current){dial.current.dataset.angle=String(degrees);dial.current.dataset.sealOpacity=String(sealOpacity);dial.current.style.setProperty('--award-opacity',String(Math.max(0,Math.min(1,1-sealOpacity/.04))));}
      if(motionCaption.current&&spinning)motionCaption.current.textContent=t(degrees<65?'ПЕЧАТЬ ПРОБУЖДАЕТСЯ':degrees<1650?'СУДЬБА В ДВИЖЕНИИ':'ПОСЛЕДНИЙ ОБОРОТ');
    }}/>
    <div className="dial-numbers synced" ref={labels} aria-hidden="true">{values.map((value,index)=>{const angle=index*2*Math.PI/values.length;return <span key={value} className={`${!spinning&&index===selected?'selected-value ':''}${value==='67'||value==='MAX'||value==='↑'?'special-value':''}`} style={{left:`${50+28*Math.sin(angle)}%`,top:`${50-28*Math.cos(angle)}%`,transform:`translate(-50%,-50%) rotate(${index*360/values.length}deg)`}}>{value}</span>;})}</div>
    {!spinning&&<div className={`dial-result ${result==='67'?'free-spins-result':''}`}><strong><RasterNumber>{result}</RasterNumber></strong><small>{caption}</small></div>}
    <div className="dial-motion-caption" aria-hidden="true"><span ref={motionCaption}>{t(spinning?'ПЕЧАТЬ ПРОБУЖДАЕТСЯ':'ПЕЧАТЬ РАСКРЫТА')}</span></div>
  </div>;
}
