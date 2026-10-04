import type { AnimationState } from '@esotericsoftware/spine-canvas';

/** Unequal pauses keep the two Keepers from performing a synchronized loop. */
export const KEEPER_AMBIENT_GESTURES = ['conjure', 'focus', 'ritual-sway', 'beckon', 'guard', 'bow'] as const;
const AMBIENT_INTERVALS = [4.8, 6.2, 5.4, 6.8, 5.6, 7.1] as const;
export function keeperAmbientInterval(index:number,blue:boolean){
  return AMBIENT_INTERVALS[(index+(blue?2:0))%AMBIENT_INTERVALS.length]+(blue?.35:0);
}

/** Separate acting order makes the Keepers partners rather than mirrors. */
export function keeperAmbientGesture(index:number,blue:boolean){
  const order=blue?[1,3,0,5,2,4]:[0,2,4,1,3,5];
  return KEEPER_AMBIENT_GESTURES[order[index%order.length]];
}

/** Overlay a gesture without restarting the continuous idle on track zero. */
export function beginCharacterGesture(state:AnimationState,clip:string,loop:boolean){
  const hasOverlay=Boolean(state.getCurrent(1));
  // Spine requires mixing from an empty entry to fade in the first overlay.
  // Setting mixDuration on an otherwise empty track does not create that mix.
  if(!hasOverlay)state.setEmptyAnimation(1,0);
  const track=hasOverlay?state.setAnimation(1,clip,loop):state.addAnimation(1,clip,loop,0);
  track.delay=0;
  track.mixDuration=clip==='anticipation'?.34:.42;
  if(!loop)state.addEmptyAnimation(1,.55,track.animation?.duration??0);
  return track;
}
