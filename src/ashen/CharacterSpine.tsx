// Authored Keeper rigs share the symbol/environment raster GPU and RAF.
import {useEffect,useRef,useState} from 'react';
import {AnimationState,AnimationStateData,Physics,Skeleton} from '@esotericsoftware/spine-canvas';
import {useTranslation} from './i18n';
import {preloadCharacter} from './characterAssets';
import {beginCharacterGesture,keeperAmbientGesture,keeperAmbientInterval} from './characterMotion';
import {RasterSpineRenderer} from './RasterSpineRenderer';
import {subscribeSpineFrame} from './spineFrame';
export interface KeeperAimPoint {x:number;y:number}
interface Props {id:string;animation?:string;sequence?:number;loop?:boolean;paused?:boolean;debug?:boolean;speed?:number;className?:string;label?:string;onComplete?:()=>void;mirror?:boolean;onAimPoint?:(point:KeeperAimPoint)=>void}
export function CharacterSpine({id,animation='idle',sequence=0,loop=true,paused=false,debug=false,speed=1,className='',label,onComplete,mirror=id==='character-blue',onAimPoint}:Props){
  const {t}=useTranslation(),characterId=id==='character-blue'?'character-blue':'character';
  const host=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null);
  const latest=useRef({animation,sequence,loop,paused,debug,speed,onComplete,onAimPoint});latest.current={animation,sequence,loop,paused,debug,speed,onComplete,onAimPoint};
  const [error,setError]=useState('');
  useEffect(()=>{
    const element=host.current,target=canvas.current;if(!element||!target)return;
    let disposed=false,unsubscribe:(()=>void)|undefined,observer:ResizeObserver|undefined,readyFrame=0,drewFrame=false,renderReady=false;
    element.dataset.renderReady='false';
    const revealAfterPaint=()=>{
      if(!drewFrame||renderReady||readyFrame||disposed||document.hidden)return;
      // draw() submits into the shared batch. The following visible RAF is
      // after endFrame has flushed those pixels; loading time cannot consume
      // the character's CSS entrance while its canvas is still empty.
      readyFrame=requestAnimationFrame(()=>{readyFrame=0;if(disposed||document.hidden)return;renderReady=true;element.dataset.renderReady='true';});
    };
    void preloadCharacter(characterId).then(data=>{
      if(disposed)return;
      const context=target.getContext('2d');if(!context)throw new Error('Canvas unavailable');setError('');
      const skeleton=new Skeleton(data),stateData=new AnimationStateData(data);stateData.defaultMix=.42;
      const state=new AnimationState(stateData),renderer=new RasterSpineRenderer(context,false,true);
      const ambientPhase=characterId==='character-blue'?3.25:0,palm=skeleton.findBone('palm-emitter');
      let key='',requestedClip='',dirty=true,resizePending=true,lastDebug=false,baseRunning=false,idleElapsed=ambientPhase,ambientIndex=characterId==='character-blue'?1:0;
      let viewWidth=1,viewHeight=1,scale=1,dpr=1;
      // Welcome/game remounts reuse decoded atlases and the shared GPU texture.
      // Resize and repaint happen together on the next visible batch.
      observer=new ResizeObserver(()=>{resizePending=true;dirty=true;});observer.observe(element);
      unsubscribe=subscribeSpineFrame(delta=>{
        if(disposed||document.hidden)return;
        revealAfterPaint();
        const options=latest.current,k=`${options.animation}:${options.sequence}:${options.loop}`,newClip=key!==k;
        if(resizePending){
          resizePending=false;viewWidth=Math.max(1,element.clientWidth);viewHeight=Math.max(1,element.clientHeight);
          dpr=Math.min(window.devicePixelRatio||1,2);scale=Math.min(viewWidth/(data.width||1024),viewHeight/(data.height||1536));
          const w=Math.round(viewWidth*dpr),h=Math.round(viewHeight*dpr);
          if(target.width!==w)target.width=w;if(target.height!==h)target.height=h;dirty=true;
        }
        if(!dirty&&key===k&&lastDebug===options.debug&&(options.paused||options.animation==='static'))return;
        dirty=false;lastDebug=options.debug;
        if(newClip){
          const returningToIdle=requestedClip!=='idle';key=k;requestedClip=options.animation;state.clearListeners();
          if(options.animation==='static'){state.clearTracks();skeleton.setToSetupPose();baseRunning=false;}
          else{
            if(!baseRunning){const idle=state.setAnimation(0,'idle',true);idle.mixDuration=0;idle.trackTime=ambientPhase;idleElapsed=ambientPhase;baseRunning=true;}
            const clip=data.findAnimation(options.animation)?options.animation:'idle';
            if(clip==='idle'){if(returningToIdle&&state.getCurrent(1))state.setEmptyAnimation(1,.55);}
            else{const track=beginCharacterGesture(state,clip,options.loop);state.addListener({complete:entry=>{if(entry===track&&!options.loop)latest.current.onComplete?.();}});}
          }
        }
        if(options.animation==='idle'&&options.loop&&!options.paused&&!options.debug){
          idleElapsed+=newClip?0:delta*options.speed;
          const overlay=state.getCurrent(1),settled=!overlay||(overlay.animation?.name==='<empty>'&&overlay.mixTime>=overlay.mixDuration);
          if(settled&&idleElapsed>=keeperAmbientInterval(ambientIndex,characterId==='character-blue')){
            const clip=keeperAmbientGesture(ambientIndex++,characterId==='character-blue');
            if(data.findAnimation(clip))beginCharacterGesture(state,clip,false);idleElapsed=0;
          }
        }
        // Same Spine animation data and layered performance, now in the common
        // y-up raster renderer. Visible elapsed time is never clamped or skipped.
        const dt=options.paused||newClip?0:delta*options.speed;
        Skeleton.yDown=false;state.update(dt);state.apply(skeleton);skeleton.update(dt);skeleton.updateWorldTransform(Physics.update);
        if(palm&&options.onAimPoint){
          const point={x:.5+palm.worldX*scale*(mirror?-1:1)/viewWidth,y:.5-palm.worldY*scale/viewHeight};
          element.dataset.aimX=String(point.x);element.dataset.aimY=String(point.y);options.onAimPoint(point);
        }
        const gesture=state.getCurrent(1)?.animation?.name,activeClip=options.animation==='static'?'static':gesture&&gesture!=='<empty>'?gesture:'idle';
        if(element.dataset.activeClip!==activeClip)element.dataset.activeClip=activeClip;
        context.setTransform(dpr*scale*(mirror?-1:1),0,0,-dpr*scale,target.width/2,target.height/2);
        renderer.draw(skeleton,options.debug);
        drewFrame=true;revealAfterPaint();
        if(options.debug){
          context.strokeStyle='#30dcff';context.lineWidth=1.5/scale;context.beginPath();
          for(const bone of skeleton.bones)if(bone.parent){context.moveTo(bone.parent.worldX,bone.parent.worldY);context.lineTo(bone.worldX,bone.worldY);}
          context.stroke();
        }
      });
    }).catch(e=>{if(!disposed)setError(String(e));});
    return()=>{disposed=true;cancelAnimationFrame(readyFrame);unsubscribe?.();observer?.disconnect();};
  },[characterId,mirror]);
  return <div ref={host} className={`spine-view ${className}`} role={label?'img':undefined} aria-label={label} data-rig={characterId} data-facing={mirror?'right':'left'} data-animation={animation} data-render-ready="false"><canvas ref={canvas} aria-hidden="true"/>{error&&<span className="asset-error">{t('Не удалось загрузить персонажа')}</span>}</div>;
}
