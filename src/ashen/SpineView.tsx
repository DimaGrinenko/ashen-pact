import { useEffect, useRef, useState } from 'react';
import { AnimationState, AnimationStateData, Physics, Skeleton } from '@esotericsoftware/spine-canvas';
import { RasterSpineRenderer } from './RasterSpineRenderer';
import { CharacterSpine } from './CharacterSpine';
import type { KeeperAimPoint } from './CharacterSpine';
import { useTranslation } from './i18n';

import { skeletonData } from './spineAssets';
import { subscribeSpineFrame } from './spineFrame';
import { ambientBudget } from './ambientBudget';
let serial = 0;
interface Props { id: string; animation?: string; sequence?: number; loop?: boolean; paused?: boolean; poseAtEnd?:boolean; debug?: boolean; speed?: number; className?: string; label?: string; onComplete?: () => void; rotationOffset?: number; onRotation?: (degrees:number,sealOpacity:number)=>void; segmentCount?:number; mirror?:boolean;onAimPoint?:(point:KeeperAimPoint)=>void; timeSource?:()=>number }
function CanvasSpine({ id, animation = 'idle', sequence = 0, loop = true, paused = false, poseAtEnd = false, debug = false, speed = 1, className = '', label, onComplete, rotationOffset, onRotation, segmentCount, timeSource }: Props) {
  const {t}=useTranslation();
  const canvas = useRef<HTMLCanvasElement>(null);
  const instance = useRef<{ skeleton: Skeleton; state: AnimationState } | null>(null);
  const latest = useRef({ animation, sequence, loop, paused, poseAtEnd, debug, speed, onComplete, rotationOffset, onRotation, segmentCount, timeSource });
  latest.current = { animation, sequence, loop, paused, poseAtEnd, debug, speed, onComplete, rotationOffset, onRotation, segmentCount, timeSource };
  const [error, setError] = useState('');
  useEffect(() => {
    const element = canvas.current; if (!element) return;
    let disposed = false; let unsubscribe: (() => void) | undefined; let observer: ResizeObserver | undefined;
    let readyFrame=0,drewFrame=false,renderReady=false;
    const host=element.parentElement;if(host)host.dataset.renderReady='false';
    const revealAfterPaint=()=>{
      if(!drewFrame||renderReady||readyFrame||disposed||document.hidden)return;
      // Shared raster draw jobs flush at endFrame, before this following RAF.
      readyFrame=requestAnimationFrame(()=>{readyFrame=0;if(disposed||document.hidden)return;renderReady=true;if(host)host.dataset.renderReady='true';});
    };
    skeletonData(id).then(data => {
      if (disposed) return;
      const context = element.getContext('2d'); if (!context) throw new Error('Canvas unavailable');
      const skeleton = new Skeleton(data), stateData = new AnimationStateData(data); stateData.defaultMix = .20;
      const state = new AnimationState(stateData), renderer = new RasterSpineRenderer(context,id==='frame',true);
      instance.current = { skeleton, state };
      let lastKey = '', w = 1, h = 1, dpr = 1,dirty=true,resizePending=true,lastDebug=false,lastVisual='';
      const phase = (++serial * .417) % 4;
      let ambientTier = -1;
      const draw = (delta: number) => {
        // ResizeObserver and initial asset readiness can call draw outside the
        // shared RAF. They must preserve the exact visible bitmap while hidden.
        if(document.hidden)return;
        revealAfterPaint();
        if(id.startsWith('environment')&&ambientTier!==ambientBudget.tier){ambientTier=ambientBudget.tier;resizePending=true;dirty=true;element.dataset.detailTier=String(ambientTier);}
        if(resizePending){
          resizePending=false;
          w = Math.max(1, element.clientWidth); h = Math.max(1, element.clientHeight);
          dpr = Math.min(window.devicePixelRatio || 1, id.startsWith('environment') ? 1 : 2);
          // Only the soft animated atmosphere uses a bounded render surface.
          // World plates, characters, symbols and UI retain their native detail.
          if(id.startsWith('environment'))dpr=Math.min(dpr,[1280,1120,960][Math.max(0,ambientTier)]/Math.max(w,h));
          // Bound the soft full-screen wipe so it cannot evict all small rigs
          // from the shared GPU batch.
          if(id==='ritual-portal')dpr=Math.min(dpr,1024/Math.max(w,h));
          const pixelWidth=Math.round(w*dpr),pixelHeight=Math.round(h*dpr);
          if(element.width!==pixelWidth)element.width=pixelWidth;
          if(element.height!==pixelHeight)element.height=pixelHeight;
          dirty=true;
        }
        // Poses follow visible elapsed time, including dropped frames. A hidden
        // tab resets the shared clock instead of advancing a paused wheel.
        const opts = latest.current, key = `${opts.animation}:${opts.sequence}:${opts.loop}`,visual=`${opts.rotationOffset}:${opts.segmentCount}:${opts.poseAtEnd}`;
        if(!dirty&&lastKey===key&&lastDebug===opts.debug&&lastVisual===visual&&(opts.paused||opts.animation==='static'))return;
        dirty=false;lastDebug=opts.debug;lastVisual=visual;
        const newClip=key!==lastKey;
        if (key !== lastKey) {
          lastKey = key;
          const name = data.findAnimation(opts.animation) ? opts.animation : 'idle';
          state.clearListeners(); const entry = state.setAnimation(0, name, opts.loop);
          if (opts.timeSource||opts.poseAtEnd) entry.mixDuration = 0;
          if (name === 'idle') entry.trackTime = phase;
          state.addListener({ complete: track => { if (track === entry && !opts.loop) latest.current.onComplete?.(); } });
          if (!opts.timeSource && !opts.loop && !/^(open|close)(-|$)/.test(name) && !(id==='wheel'&&['spin','win','win-seal'].includes(name))) state.addAnimation(0, id==='bigwin'&&['big','mega','epic','max'].includes(name)&&data.findAnimation(`idle-${name}`)?`idle-${name}`:'idle', true, 0);
        }
        if (opts.poseAtEnd) {
          // Reduced motion must show the revealed result, not freeze its
          // covering seal on the first frame of the reveal animation.
          const track=state.getCurrent(0);
          if(track){track.mixDuration=0;track.trackTime=track.animation?.duration??0;}
        } else if (opts.timeSource) {
          const track=state.getCurrent(0);
          if(track){track.trackTime=Math.max(0,opts.timeSource());element.dataset.sceneTime=track.trackTime.toFixed(3);}
        } else if (!opts.paused&&!newClip) state.update(delta * opts.speed);
        if(id.startsWith('environment'))for(const b of skeleton.bones)if(b.parent?.data.name==='main'&&b.data.name!=='camera'){b.x=b.data.x;b.scaleX=b.data.scaleX;b.scaleY=b.data.scaleY;}
        if(id.startsWith('environment'))for(const slot of skeleton.slots)if(slot.data.name.startsWith('detail-'))slot.color.a=slot.data.color.a;
        if(opts.animation==='static') skeleton.setToSetupPose(); else state.apply(skeleton);
        if(id.startsWith('environment')&&ambientTier>0)for(const slot of skeleton.slots)if(slot.data.name.startsWith('detail-'))slot.color.a*=ambientTier===1?.75:.45;
        if(opts.rotationOffset!==undefined){const rotor=skeleton.findBone('rotor');if(rotor){const track=state.getCurrent(0),progress=opts.animation==='spin'?Math.min(1,(track?.trackTime||0)/2.5):1;rotor.rotation=(opts.animation==='spin'?rotor.rotation:0)+opts.rotationOffset*(progress**3*(progress*(progress*6-15)+10));opts.onRotation?.(rotor.rotation,skeleton.findSlot('seal')?.color.a??0);}}
        if(id==='wheel'){
          const count=Math.max(1,Math.min(15,opts.segmentCount??14));
          for(let i=0;i<15;i++){
            const divider=skeleton.findBone(`divider-${i}`),slot=skeleton.findSlot(`divider-${i}`);
            if(divider)divider.rotation=-(i+.5)*360/count;
            if(slot)slot.color.a=i<count?.60:0;
          }
          if(opts.animation==='spin'){
            const pointer=skeleton.findBone('pointer'),rotor=skeleton.findBone('rotor');
            if(pointer&&rotor){const phase=((rotor.rotation/(360/count))%1+1)%1;pointer.rotation=-9*Math.pow(Math.sin(phase*Math.PI),8);}
          }
        }
        if(id.startsWith('environment')) {const cover=Math.max(w/(data.width||1600),h/(data.height||900)),ratio=Math.min(1,w/cover/(data.width||1600));for(const b of skeleton.bones)if(b.parent?.data.name==='main'&&b.data.name!=='camera'){b.x*=ratio;const f=b.data.name.startsWith('mist')?.75:Math.max(.38,ratio);b.scaleX*=f;b.scaleY*=f;}}
        Skeleton.yDown=false;skeleton.updateWorldTransform(Physics.update);
        const designW = data.width || 300, designH = data.height || 300;
        const scale = id.startsWith('environment')||id==='curtain'&&className.includes('reel-curtain')?Math.max(w/designW,h/designH):Math.min(w / designW, h / designH);
        context.setTransform(dpr * scale, 0, 0, -dpr * scale, element.width / 2, element.height / 2);
        renderer.draw(skeleton,opts.debug);
        drewFrame=true;revealAfterPaint();
        if (opts.debug) {
          context.strokeStyle = '#26e4ff'; context.fillStyle = '#ff3252'; context.lineWidth = 1 / scale;
          for (const bone of skeleton.bones) { if (!bone.parent) continue; context.beginPath(); context.moveTo(bone.parent.worldX, bone.parent.worldY); context.lineTo(bone.worldX, bone.worldY); context.stroke(); context.fillRect(bone.worldX - 2 / scale, bone.worldY - 2 / scale, 4 / scale, 4 / scale); }
        }
      };
      const resize = () => {
        // Changing canvas.width/height clears its pixels, even without a draw.
        // Defer both resizing and reposing until the next visible frame.
        resizePending=true;dirty=true;
      };
      resize(); observer = new ResizeObserver(resize); observer.observe(element); unsubscribe = subscribeSpineFrame(draw);
    }).catch(e => { if (!disposed) setError(String(e)); });
    return () => { disposed = true; cancelAnimationFrame(readyFrame); unsubscribe?.(); observer?.disconnect(); instance.current = null; };
  }, [id,className]);
  return <div className={`spine-view ${className}`} role={label ? 'img' : undefined} aria-label={label} data-rig={id} data-animation={animation} data-render-ready="false">
    <canvas ref={canvas} aria-hidden="true" />{error && <span className="asset-error">{t('Ошибка загрузки анимации')}</span>}
  </div>;
}
export function SpineView(props:Props){return props.id==='character'||props.id==='character-blue'?<CharacterSpine {...props}/>:<CanvasSpine {...props}/>;}
