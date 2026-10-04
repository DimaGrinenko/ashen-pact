import {AnimationClock} from './animationClock';
import {RasterSpineRenderer} from './RasterSpineRenderer';
import {ambientBudget} from './ambientBudget';

const subscribers=new Set<(delta:number)=>void>();
const clock=new AnimationClock();let raf=0;
function resetClock(){clock.reset();ambientBudget.resetSamples();}
function tick(time:number){
  const delta=clock.next(time);
  if(!document.hidden){
    ambientBudget.observe(delta);
    RasterSpineRenderer.beginFrame();
    try{subscribers.forEach(callback=>callback(delta));}finally{RasterSpineRenderer.endFrame();}
  }
  if(subscribers.size)raf=requestAnimationFrame(tick);else{raf=0;clock.reset();}
}
/** Characters, symbols and atmosphere submit into the same GPU batch. */
export function subscribeSpineFrame(callback:(delta:number)=>void){
  subscribers.add(callback);
  if(!raf){document.addEventListener('visibilitychange',resetClock);raf=requestAnimationFrame(tick);}
  return()=>{
    subscribers.delete(callback);
    if(!subscribers.size){cancelAnimationFrame(raf);raf=0;clock.reset();document.removeEventListener('visibilitychange',resetClock);}
  };
}
