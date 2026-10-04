import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { VisibleTimeline } from './animationClock';
import { CountUp } from './CountUp';
import { SpineView } from './SpineView';
import { useDialogFocus } from './useDialogFocus';
import { useTranslation } from './i18n';
import './win-celebration.css';

type Tier = 'big' | 'mega' | 'epic' | 'max';
type Phase = 'entry' | 'rise' | 'finale' | 'hold';
interface Props {
  name:string; amount:number; sequence:number; motion:boolean;
  money:(cents:number)=>string; onContinue:()=>void;
  onAccent?:(accent:'rise'|'finale')=>void;
}
const COUNT_START=.55;
const COUNT_END:Record<Tier,number>={big:2.9,mega:3.35,epic:3.8,max:4.25};
const smooth=(value:number)=>{const t=Math.max(0,Math.min(1,value));return t*t*(3-2*t);};

/** Award money, raster effects and typography share one pause-aware clock. */
export function WinCelebration({name,amount,sequence,motion,money,onContinue,onAccent}:Props){
  const {t}=useTranslation();
  const tier:Tier=name.startsWith('MAX')?'max':name.startsWith('EPIC')?'epic':name.startsWith('MEGA')?'mega':'big';
  const level=tier==='max'?4:tier==='epic'?3:tier==='mega'?2:1;
  const hasRasterTitle=/^(BIG|MEGA|EPIC|MAX) WIN$/.test(name);
  const end=COUNT_END[tier],settled=end+.95;
  const host=useRef<HTMLDivElement>(null),title=useRef<HTMLHeadingElement>(null),value=useRef<HTMLElement>(null);
  const timeline=useRef<VisibleTimeline|null>(null),accent=useRef(onAccent);accent.current=onAccent;
  const [holding,setHolding]=useState(false);
  useDialogFocus(host,`${name}:${sequence}`,onContinue);
  const sceneTime=useCallback(()=>motion?(timeline.current?.seconds(performance.now())??0):settled,[motion,settled]);
  const rigTime=useCallback(()=>holding?Math.max(0,sceneTime()-settled):Math.min(settled,sceneTime()),[holding,sceneTime,settled]);
  const countTime=useCallback(()=>Math.max(0,sceneTime()-COUNT_START),[sceneTime]);

  useLayoutEffect(()=>{
    const root=host.current;if(!root)return;
    const clock=new VisibleTimeline(performance.now());timeline.current=clock;
    clock.setPaused(performance.now(),document.hidden);
    let frame=0,lastPhase:Phase|undefined,riseSent=false,finaleSent=false;
    const paint=()=>{
      // A visibility event can arrive between the browser collecting this RAF
      // batch and dispatching a callback. Never paint a final hidden frame.
      if(document.hidden)return;
      const time=motion?clock.seconds(performance.now()):settled;
      const phase:Phase=time<COUNT_START?'entry':time<end?'rise':time<settled?'finale':'hold';
      root.dataset.sceneTime=time.toFixed(3);root.dataset.phase=phase;
      if(phase!==lastPhase){lastPhase=phase;setHolding(phase==='hold');}
      if(motion&&!riseSent&&time>=COUNT_START){riseSent=true;accent.current?.('rise');}
      if(motion&&!finaleSent&&time>=end){finaleSent=true;accent.current?.('finale');}
      const arrive=motion?smooth(time/.65):1;
      const titleIn=motion?smooth((time-.1)/.65):1;
      const numberIn=motion?smooth((time-.38)/.5):1;
      const impact=motion?Math.sin(Math.PI*Math.max(0,Math.min(1,(time-end)/.65))):0;
      const progress=Math.max(0,Math.min(1,(time-COUNT_START)/(end-COUNT_START)));
      // A few deliberately spaced count accents grow with the award tier.
      // Their envelope vanishes at both boundaries, so entry/finale/hold join.
      const countAccent=motion&&phase==='rise'?Math.sin(progress*Math.PI)**2*Math.max(0,Math.sin(progress*Math.PI*2*(level+1)))**3:0;
      root.style.setProperty('--win-veil',String(.94*arrive));
      if(title.current){title.current.style.opacity=String(titleIn);title.current.style.transform=`translate(-50%,-50%) translateY(${(1-titleIn)*-25}px) perspective(700px) rotateX(${(1-titleIn)*-24}deg) scale(${.91+.09*titleIn+impact*.035+countAccent*.01})`;}
      if(value.current){value.current.style.opacity=String(numberIn);value.current.style.transform=`translate(-50%,-50%) scale(${.92+.08*numberIn+impact*(.068+level*.008)+countAccent*.026})`;}
      if(motion&&!document.hidden&&phase!=='hold')frame=requestAnimationFrame(paint);
    };
    const visibility=()=>{clock.setPaused(performance.now(),document.hidden);cancelAnimationFrame(frame);if(!document.hidden)paint();};
    document.addEventListener('visibilitychange',visibility);paint();
    return()=>{cancelAnimationFrame(frame);document.removeEventListener('visibilitychange',visibility);timeline.current=null;};
  },[end,level,motion,sequence,settled]);

  return <div ref={host} tabIndex={-1} className="celebration-screen win-celebration" data-tier={tier} data-motion={motion?'full':'reduced'} role="dialog" aria-modal="true" aria-label={t(name)}>
    <SpineView id="bigwin" className="win-performance" animation={holding?`idle-${tier}`:tier} sequence={sequence} loop={holding} paused={!motion} timeSource={rigTime}/>
    <div className="celebration-copy win-copy">
      <h2 ref={title} className={hasRasterTitle?'award-title':undefined}>{hasRasterTitle?<><span className="award-title-label">{t(name)}</span><img src={`${import.meta.env.BASE_URL}ashen/ui/v19/${tier}.webp`} alt="" draggable={false}/></>:t(name)}</h2>
      <strong ref={value} className="win-total"><CountUp cents={amount} disabled={!motion} duration={(end-COUNT_START)*1000} timeSource={countTime} formatter={money} fitToParent/></strong>
      <button className="primary win-continue" onClick={onContinue}>{t('ПРОДОЛЖИТЬ →')}</button>
    </div>
  </div>;
}
