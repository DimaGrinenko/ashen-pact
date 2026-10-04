const BASE = `${import.meta.env.BASE_URL}ashen/audio/`;
type Sound = 'click'|'spin'|'stop'|'wheel'|'win'|'bonus';
export class AshenAudio {
  enabled = false;
  private music: HTMLAudioElement | null = null;
  private playing = new Map<HTMLAudioElement, Sound>();
  private fade = 0;
  private restore = 0;
  constructor() { document.addEventListener('visibilitychange', this.visibility); }
  private stopEffects() { this.playing.forEach((_,a) => a.pause()); this.playing.clear(); }
  private clearMix() { cancelAnimationFrame(this.fade); clearTimeout(this.restore); }
  private fadeMusic(volume:number) {
    cancelAnimationFrame(this.fade);
    const step=()=>{if(!this.music||!this.enabled||document.hidden)return;const diff=volume-this.music.volume;this.music.volume=Math.abs(diff)<.001?volume:this.music.volume+diff*.09;if(Math.abs(diff)>=.001)this.fade=requestAnimationFrame(step);};
    this.fade=requestAnimationFrame(step);
  }
  private visibility = () => { if (document.hidden) { this.clearMix();this.music?.pause();this.stopEffects(); } else if (this.enabled) {this.fadeMusic(.24);void this.music?.play().catch(() => {});} };
  setEnabled(value: boolean) {
    this.enabled = value;
    if (!this.music) { this.music = new Audio(`${BASE}deep-humidity.ogg`); this.music.loop = true; this.music.preload='none';this.music.volume = 0; }
    if (value && !document.hidden) {this.fadeMusic(.24);void this.music.play().catch(() => {});} else { this.clearMix();this.music.pause();this.music.volume=0;this.stopEffects(); }
  }
  play(kind: Sound) {
    if (!this.enabled || document.hidden) return;
    const same=[...this.playing].filter(([,name])=>name===kind),limit=kind==='stop'?3:1;
    if(same.length>=limit){same[0][0].pause();this.playing.delete(same[0][0]);}
    const levels={click:.16,spin:.26,stop:.20,wheel:.32,win:.34,bonus:.36};
    const a = new Audio(`${BASE}${kind}.ogg`);a.volume=levels[kind];this.playing.set(a,kind);a.onended=()=>{this.playing.delete(a);};a.onerror=()=>{this.playing.delete(a);};void a.play().catch(()=>{this.playing.delete(a);});
    if(kind==='wheel'||kind==='win'||kind==='bonus'){clearTimeout(this.restore);this.fadeMusic(.10);this.restore=window.setTimeout(()=>this.fadeMusic(.24),kind==='wheel'?3200:kind==='bonus'?2400:1250);}
  }
  destroy() { this.enabled = false;this.clearMix();this.music?.pause();this.stopEffects();document.removeEventListener('visibilitychange',this.visibility); }
}
