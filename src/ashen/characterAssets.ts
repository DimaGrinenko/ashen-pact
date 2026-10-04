import {skeletonData} from './spineAssets';
export type CharacterRigId='character'|'character-blue';
/** The same decoded atlas and Spine data serve welcome, game and Studio. */
export function preloadCharacter(id:CharacterRigId='character'){return skeletonData(id);}
