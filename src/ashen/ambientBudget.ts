/** Only decorative atmosphere adapts to sustained frame pressure. Gameplay,
 * character and symbol resolution, elapsed time and outcomes are untouched. */
export class AmbientBudget {
  tier: 0 | 1 | 2 = 0;
  private samples: number[] = [];
  private elapsed = 0;
  private warmup = 3;
  private healthyWindows = 0;
  resetSamples() { this.samples=[];this.elapsed=0;this.warmup=3;this.healthyWindows=0; }
  observe(seconds: number) {
    if(!Number.isFinite(seconds)||seconds<=0)return;
    if(this.warmup>0){this.warmup-=seconds;return;}
    this.samples.push(seconds*1000);this.elapsed+=seconds;
    if(this.elapsed<2||this.samples.length<12)return;
    const values=this.samples.sort((a,b)=>a-b);
    const mean=values.reduce((a,b)=>a+b,0)/values.length,p95=values[Math.floor((values.length-1)*.95)];
    const slow=mean>25||p95>48;
    if(slow){this.tier=Math.min(2,this.tier+1) as 0|1|2;this.healthyWindows=0;}
    else if(mean<19&&p95<26){
      if(++this.healthyWindows>=8){this.tier=Math.max(0,this.tier-1) as 0|1|2;this.healthyWindows=0;}
    }else this.healthyWindows=0;
    this.samples=[];this.elapsed=0;
  }
}
export const ambientBudget = new AmbientBudget();
