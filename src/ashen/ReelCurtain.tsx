import { useEffect, useRef, useState } from 'react';
import { SpineView } from './SpineView';
import { subscribeSpineFrame } from './spineFrame';
import './ritual-effects-v17.css';

/** An opaque chamber replaces the four symbols while the velvet opens.
 * The plate and cloth share visible elapsed time; neither chooses a result. */
export function ReelCurtain({open,color,speed,sequence,paused}:{open:boolean;color:'blue'|'red';speed:number;sequence:number;paused:boolean}){
  const host=useRef<HTMLDivElement>(null);
  const [revealedKey,setRevealedKey]=useState('');
  const options=useRef({open,speed,paused});options.current={open,speed,paused};
  const clock=useRef({key:'',elapsed:0});
  const key=`${sequence}:${open}`;
  if(clock.current.key!==key)clock.current={key,elapsed:0};
  useEffect(()=>{
    return subscribeSpineFrame(delta=>{
      if(!host.current)return;
      if(!options.current.paused){
        clock.current.elapsed=options.current.open?clock.current.elapsed+delta*options.current.speed:Math.min(.55,clock.current.elapsed+delta*options.current.speed);
        if(options.current.open&&clock.current.elapsed>=1.2&&revealedKey!==clock.current.key)setRevealedKey(clock.current.key);
      }
      const u=options.current.paused||options.current.open?1:Math.min(1,clock.current.elapsed/.22);
      const alpha=u*u*u*(u*(u*6-15)+10);
      host.current.style.setProperty('--chamber-opacity',String(alpha));
      const depth=options.current.open?Math.min(1,clock.current.elapsed/1.2):0;
      host.current.style.setProperty('--chamber-scale',String(1+.045*depth*depth*(3-2*depth)));
      host.current.dataset.coverage=String(alpha);
    });
  },[sequence,revealedKey]);
  const hold=open&&revealedKey===key&&!paused;
  return <div ref={host} className="reel-curtain ritual-curtain" data-phase={open?'open':'close'} data-color={color} data-paused={paused} aria-hidden="true">
    <div className="ritual-chamber-back"/>
    <SpineView id="curtain" className="reel-curtain-renderer" animation={`${hold?'hold':open?'open':'close'}-${color}`} timeSource={()=>hold?Math.max(0,clock.current.elapsed-1.2):Math.min(open?1.2:.55,clock.current.elapsed)} loop={hold} sequence={sequence} paused={paused} poseAtEnd={paused}/>
  </div>;
}
