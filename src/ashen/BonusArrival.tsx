import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { SpineView } from './SpineView';
import { ReelDestruction } from './ReelDestruction';
import type { VisibleTimeline } from './animationClock';
import { BONUS_ARRIVAL, arrivalEase } from './bonusArrivalMotion';

export type BonusArrivalStage = 'charge'|'impact'|'ashes'|'reveal';
export interface KeeperAim {x:number;y:number}
export interface KeeperAimState {
  blue: KeeperAim;
  red: KeeperAim;
  onChange?: (color:'blue'|'red')=>void;
}
interface Props {
  stage: BonusArrivalStage;
  board: RefObject<HTMLDivElement|null>;
  blue: RefObject<HTMLDivElement|null>;
  red: RefObject<HTMLDivElement|null>;
  aims: RefObject<KeeperAimState>;
  paused: boolean;
  timeline: VisibleTimeline;
}

/** Live hand anchors come from the posed Spine bones. The effect has no
 * authority over the already-resolved board, bonus result or wallet. */
export function BonusArrival({stage,board,blue,red,aims,paused,timeline}:Props) {
  const host=useRef<HTMLDivElement>(null);
  const current=useRef({stage,paused,timeline});current.current={stage,paused,timeline};
  const sceneTime=()=>timeline.seconds(performance.now());
  const portalTime=()=>Math.min(sceneTime(),stage==='reveal'?BONUS_ARRIVAL.end:BONUS_ARRIVAL.reveal);
  const impactTime=()=>Math.max(0,sceneTime()-BONUS_ARRIVAL.impact);
  useEffect(()=>{
    let frame=0,active=true;
    const fieldElement=board.current;
    const aimState=aims.current;
    const element=host.current;
    const views={blue:blue.current?.querySelector<HTMLElement>('.spine-view'),red:red.current?.querySelector<HTMLElement>('.spine-view')};
    const beams={blue:element?.querySelector<HTMLElement>('.ritual-stream-blue'),red:element?.querySelector<HTMLElement>('.ritual-stream-red')};
    const caption=element?.querySelector<HTMLElement>('.ritual-caption');
    const controls=fieldElement?.closest('.ashen-app')?.querySelector<HTMLElement>('.hud-dock');
    const impact=element?.querySelector<HTMLElement>('.ritual-impact');
    const portal=element?.querySelector<HTMLElement>('.arrival-portal');
    let dirty=true,lastStage=current.current.stage;
    let geometry:{field:DOMRect;views:{blue?:DOMRect;red?:DOMRect};target:{x:number;y:number};beamWidth:number;beamHeight:number}|undefined;
    const invalidate=()=>{dirty=true;};
    const observer=new ResizeObserver(invalidate);
    for(const node of [fieldElement,views.blue,views.red,caption,controls])if(node)observer.observe(node);
    window.addEventListener('resize',invalidate);
    const measure=()=>{
      if(!fieldElement||!element)return;
      // All layout reads happen together, only on geometry changes. The live
      // mixed Spine palm coordinates still update on every rendered pose.
      const field=fieldElement.getBoundingClientRect();
      const viewRects={blue:views.blue?.getBoundingClientRect(),red:views.red?.getBoundingClientRect()};
      const controlsRect=controls?.getBoundingClientRect(),captionHeight=caption?.offsetHeight??0;
      const target={x:field.x+field.width/2,y:field.y+field.height/2};
      const beamWidth=Math.min(768,Math.max(256,innerWidth*.4)),beamHeight=beamWidth*.3;
      geometry={field,views:viewRects,target,beamWidth,beamHeight};dirty=false;
      for(const beam of [beams.blue,beams.red])if(beam){
        beam.style.left='0px';beam.style.top='0px';
        beam.style.width=`${beamWidth}px`;beam.style.height=`${beamHeight}px`;
      }
      if(impact){const size=Math.max(field.width,field.height)*1.1;impact.style.cssText=`left:${target.x-size/2}px;top:${target.y-size/2}px;width:${size}px;height:${size}px`;}
      if(portal){
        const reachX=Math.max(target.x,innerWidth-target.x),reachY=Math.max(target.y,innerHeight-target.y);
        const size=Math.max(field.width*1.85,field.height*1.85,reachX*3.4,reachY*3.4);
        portal.style.cssText=`left:${target.x-size/2}px;top:${target.y-size/2}px;width:${size}px;height:${size}px`;
      }
      if(caption&&controlsRect){caption.style.top=`${(field.bottom+controlsRect.top-captionHeight)/2}px`;caption.style.bottom='auto';}
    };
    const position=(changedColor?:'blue'|'red')=>{
      if(!active||document.hidden)return;
      if(lastStage!==current.current.stage){lastStage=current.current.stage;dirty=true;}
      if(dirty)measure();
      if(geometry&&element){
        const {views:viewRects,target,beamWidth,beamHeight}=geometry;
        const time=current.current.timeline.seconds(performance.now());
        const revealed=current.current.stage==='reveal'?arrivalEase(BONUS_ARRIVAL.reveal,2.95,time):0;
        // Opacity follows the same visible clock as the smoke. CSS transitions
        // continue while a tab is hidden; these values stop exactly with the scene.
        if(!changedColor){
          element.style.setProperty('--stream-opacity',String(.96*arrivalEase(.57,.86,time)*(1-arrivalEase(1.32,1.78,time))));
          element.style.setProperty('--impact-opacity',String(arrivalEase(.65,.8,time)*(1-arrivalEase(1.35,1.95,time))));
          element.style.setProperty('--caption-opacity',String(arrivalEase(.08,.4,time)*(1-arrivalEase(2.7,3,time))));
          fieldElement?.style.setProperty('--arrival-field-opacity',String(revealed));
        }
        for(const color of ['blue','red'] as const){
          if(changedColor&&color!==changedColor)continue;
          const view=viewRects[color];
          const beam=beams[color];
          if(!view||!beam)continue;
          const point=aims.current[color],x=view.x+point.x*view.width,y=view.y+point.y*view.height;
          const dx=target.x-x,dy=target.y-y,distance=Math.hypot(dx,dy);
          beam.style.transform=`translate(${x}px,${y-beamHeight/2}px) rotate(${Math.atan2(dy,dx)}rad) scale(${distance/beamWidth})`;
        }
      }
    };
    // Each Spine renderer publishes its mixed palm pose synchronously before
    // paint. Follow that pose immediately even when our RAF ran first; waiting
    // for the next RAF leaves the beam attached to the preceding hand position.
    const onAimChange=(color:'blue'|'red')=>position(color);
    aimState.onChange=onAimChange;
    // Pose callbacks never schedule frames. This is the only animation loop;
    // timing remains on the shared visible clock and stops while the tab hides.
    const tick=()=>{if(!active)return;position();frame=requestAnimationFrame(tick);};
    tick();return()=>{
      active=false;cancelAnimationFrame(frame);
      observer.disconnect();window.removeEventListener('resize',invalidate);
      if(aimState.onChange===onAimChange)delete aimState.onChange;
      fieldElement?.style.removeProperty('--arrival-field-opacity');
    };
  },[board,blue,red,aims]);
  return <div ref={host} className="bonus-arrival" data-stage={stage} data-paused={paused} aria-hidden="true">
    <ReelDestruction board={board} stage={stage} paused={paused} timeSource={impactTime}/>
    <div className="arrival-portal"><SpineView id="ritual-portal" animation="win" loop={false} paused={paused} timeSource={portalTime}/></div>
    <div className="ritual-stream ritual-stream-blue"><SpineView id="ritual-fire-blue" paused={paused||stage==='reveal'}/></div>
    <div className="ritual-stream ritual-stream-red"><SpineView id="ritual-fire-red" paused={paused||stage==='reveal'}/></div>
    <div className="ritual-impact"><SpineView id="ritual-impact" animation={stage==='charge'?'static':'win'} loop={false} paused={paused||stage==='reveal'} timeSource={impactTime}/></div>
    <div className="ritual-caption">{stage==='reveal'?'BEYOND THE ASHEN GATE':'THE KEEPERS BREAK THE SEAL'}</div>
  </div>;
}
