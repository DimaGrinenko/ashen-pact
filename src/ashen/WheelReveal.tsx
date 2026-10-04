import { WheelDial } from './WheelDial';
import { CountUp } from './CountUp';
import { SpineView } from './SpineView';
import { useTranslation } from './i18n';
import { BLUE_ADD_VALUES,BLUE_MULTIPLY_VALUES,RED_ADD_VALUES,RED_MULTIPLY_VALUES } from './engine';
import type { WheelOutcome } from './engine';
const defaultMoney=(value:number)=>(value/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
export function WheelReveal({wheel,index,total,stage,tally,paused,speed=1,money=defaultMoney}:{wheel:WheelOutcome;index:number;total:number;stage:string;tally:number;paused:boolean;speed?:number;money?:(cents:number)=>string}){
  const {t}=useTranslation();
  const additions=wheel.color==='blue'?BLUE_ADD_VALUES:RED_ADD_VALUES,multipliers=wheel.color==='blue'?BLUE_MULTIPLY_VALUES:RED_MULTIPLY_VALUES;
  const values=[...additions.map(n=>`+${n}`),...multipliers.map(n=>`×${n}`),...(wheel.color==='blue'?['67']:[]),'MAX'];
  const result=wheel.kind==='free-spins'?'67':wheel.kind==='max'?'MAX':`${wheel.kind==='multiply'?'×':'+'}${wheel.value}`;
  return <div className={`wheel-reveal wheel-ceremony-v4 wheel-ceremony-v9 ${wheel.color} ${stage==='spinning'?'revealing':'awarded'}`} role="status" aria-live="polite">
    <SpineView id="environment" className="ceremony-environment" paused={paused}/>
    <div className="eyebrow">{t('РИТУАЛ 67')} <span>{t('ПЕЧАТЬ {index} ИЗ {total}',{index:index+1,total})}</span></div>
    <h2>{t(wheel.color==='blue'?'ПЕЧАТЬ ДУШИ':'ПЕЧАТЬ КРОВИ')}</h2>
    <WheelDial values={values} result={result} caption={t(wheel.kind==='free-spins'?'ПЕЧАТЬ БОНУСА':wheel.kind==='max'?'16 666×':wheel.kind==='multiply'?'УМНОЖЕНИЕ':'ДОБАВЛЕНИЕ')} spinning={stage==='spinning'} sequence={index} paused={paused} speed={speed}/>
    <p className="wheel-tally"><span>{t('СУММА РИТУАЛА')}</span><b><CountUp cents={tally} duration={650/speed} disabled={paused||stage==='spinning'} formatter={money}/></b></p>
  </div>;
}
