import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { BonusArrival, type BonusArrivalStage, type KeeperAimState } from './BonusArrival';
import { BONUS_ARRIVAL } from './bonusArrivalMotion';
import { BONUS_COSTS, BONUS_NAMES, ECLIPSE_PACT_NAME, FEATURE_COSTS, PAYLINES, PAYTABLE_TENTHS, PRESET_NAMES, REGULAR_SYMBOLS, initialState, spin, buyBonus, deal, setBet, setFeatureMode } from './engine';
import type { GameState, WheelOutcome, PresetName, FeatureMode, DealResult } from './engine';
import { SpineView } from './SpineView';
import { preloadRigs, RIG_IDS } from './spineAssets';
import { AshenAudio } from './audio';
import { WheelReveal } from './WheelReveal';
import { WheelDial } from './WheelDial';
import { WinCelebration as Celebration } from './WinCelebration';
import { FitAmount } from './FitAmount';
import { GameControls } from './GameControls';
import { RasterNumber } from './RasterNumber';
import { RitualChoice } from './RitualChoice';
import { waitForPresentation } from './presentationClock';
import { VisibleTimeline } from './animationClock';
import { useDialogFocus } from './useDialogFocus';
import { ReelMotion } from './ReelMotion';
import { ReelCurtain } from './ReelCurtain';
import { useRgsSession } from './useRgsSession';
import { createServerState } from './rgs';
import { SocialModeContext, useTranslation, translateError, type TranslationMessage } from './i18n';
import type { ServerFrame } from './rgs';
import './ashen.css';
import './presentation-v4.css';
import './paperclip-ui.css';
import './paperclip-panels.css';
import './presentation-v6.css';
import './geometry-v7.css';
import './geometry-v8.css';
import './typography-v8.css';
import './v9-scene.css';
import './v9-panels.css';
import './v10-ui.css';
import './v11-scenes.css';
import './v11-ui.css';
import './v12-scenes.css';
import './v12-ui.css';
import './v13-ui.css';
import './v13-scenes.css';
import './v13-world-motion.css';
import './v14-scene.css';
import './release-v15.css';
import './game-controls.css';
import './v18-layout.css';
import './environment-v18.css';
import './v19-presentation.css';

const LABELS: Record<string,string> = { ten:'Десятка',j:'Валет',q:'Дама',k:'Король',a:'Туз',poison:'Сосуд душ',skull:'Череп',raven:'Ворон',heart:'Реликварий',hand:'Рука судьбы','blue-six':'Синяя печать','red-six':'Алая печать',character:'Хранитель договора','character-blue':'Azure Keeper','environment-bonus':'Rift atmosphere','ritual-fire-blue':'Azure fire stream','ritual-fire-red':'Crimson fire stream','ritual-impact':'Ritual impact',environment:'Дыхание собора',curtain:'Шторы ритуала',wheel:'Колесо договора',bigwin:'Большой выигрыш',frame:'Живая рама' };
const PRESET_LABELS:Record<PresetName,string> = {dead:'Без выигрыша','line-win':'Линии','blue-wheel':'Синее колесо','red-wheel':'Алое колесо','two-wheels':'Два колеса','bonus-1':'Первый бонус','bonus-2':'Второй бонус','bonus-3':'Третий бонус','big-win':'Big win','mega-win':'Mega win','epic-win':'Epic win','max-win':'16 666×'};
const BETS=[10,20,40,60,80,100,150,200,300,500,1000,2000,5000,10000];
const PUBLISHED_RTP='96.00%';
const PURCHASE_NAMES={...BONUS_NAMES,3:ECLIPSE_PACT_NAME};
const bonusName=(bonus:{tier:1|2|3;variant?:'eclipse'})=>bonus.variant==='eclipse'?ECLIPSE_PACT_NAME:BONUS_NAMES[bonus.tier];
const bonusTitleArt=(bonus:{tier:1|2|3;variant?:'eclipse'})=>`./ashen/ui/v19/${bonus.variant==='eclipse'?'eclipse-pact':['first-pact','hell-unbound','final-rite'][bonus.tier-1]}.webp`;
const RTP_MODES=[
  {label:'Обычный режим',cost:FEATURE_COSTS.base},
  {label:'Синяя печать',cost:FEATURE_COSTS.blue},
  {label:'Алая печать',cost:FEATURE_COSTS.red},
  {label:BONUS_NAMES[1],cost:BONUS_COSTS[1]},
  {label:BONUS_NAMES[2],cost:BONUS_COSTS[2]},
  {label:ECLIPSE_PACT_NAME,cost:BONUS_COSTS[3]},
];
const format = (cents: number) => (cents/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:6});
const formatMoney = (cents:number,currency:string) => {
  if(currency==='DEMO')return format(cents);
  const socialCodes:Record<string,string>={XGC:'GC',XSC:'SC',XEC:'SC'};
  if(socialCodes[currency])return `${format(cents)} ${socialCodes[currency]}`;
  try{return new Intl.NumberFormat('en-US',{style:'currency',currency,maximumFractionDigits:6}).format(cents/100);}catch{return `${format(cents)} ${currency}`;}
};
type Panel='rules'|'buy'|'confirm'|'settings'|'studio'|'menu'|'autoplay'|'bet'|null;
type PurchaseChoice={kind:'feature';mode:'blue'|'red';betCents:number}|{kind:'bonus';tier:1|2|3;betCents:number};
function PcIcon({name}:{name:string}){return <img className="pc-icon" src={`./ashen/ui/v5/${name}.png`} alt="" aria-hidden="true" draggable={false}/>;}
function Modal({title,titleArt,eyebrow,children,onClose,className=''}:{title:string;titleArt?:string;eyebrow?:string;children:ReactNode;onClose?:()=>void;className?:string}){
  const {t}=useTranslation();
  const host=useRef<HTMLDivElement>(null);
  useDialogFocus(host,title,onClose);
  return <div className="modal-backdrop"><section ref={host} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className={`modal ${className}`}>
    {onClose&&<button className="close-button" aria-label={t("Закрыть окно")} onClick={onClose}><PcIcon name="close"/></button>}
    {eyebrow&&<div className="eyebrow">{eyebrow}</div>}<h2 className={titleArt?'raster-modal-title':undefined}>{titleArt?<img src={titleArt} alt={title} draggable={false}/>:title}</h2>{children}
  </section></div>;
}
function WelcomeFact({id,index,paused,children}:{id:string;index:number;paused:boolean;children:ReactNode}){
  const [beat,setBeat]=useState(0);
  useEffect(()=>{
    if(paused)return;
    const controller=new AbortController();
    void (async()=>{try{
      await waitForPresentation(1800+index*1600,controller.signal);
      while(!controller.signal.aborted){setBeat(value=>value+1);await waitForPresentation(9000,controller.signal);}
    }catch{/* Cancel the local welcome performance when leaving. */}})();
    return()=>controller.abort();
  },[index,paused]);
  return <article><SpineView id={id} animation={beat?'win':'idle'} sequence={beat} loop={!beat} paused={paused}/>{children}</article>;
}
function Rules({network,social}:{network:boolean;social:boolean}){const {t}=useTranslation(social);return <div className="rules-content">
  <p>{t("5 барабанов · 4 ряда · 14 постоянных линий. От 3 одинаковых символов слева направо. Выплачивается самая длинная комбинация на каждой линии.")}</p>
  <div className="paytable-grid">{[...REGULAR_SYMBOLS].reverse().map(id=><div className="paytable-item" key={id}><SpineView id={id} paused/><div><b>{t(LABELS[id]??id)}</b>{[5,4,3].map(count=><span key={count}>{count} <em>{(PAYTABLE_TENTHS[id][count-3]/10).toFixed(1)}×</em></span>)}</div></div>)}</div>
  <h3>{t("Два цвета договора")}</h3><p>{t("Печати выпадают на барабанах 1, 3 и 5: не более одной на барабан. Каждая открывает колесо. Значения обрабатываются слева направо: «+» добавляет выигрыш в ставках, «×» умножает накопленную сумму колёс. Первое умножение начинает с 1× ставки. Выигрыши по линиям добавляются отдельно.")}</p>
  <div className="rules-pair"><p><b className="cyan">{t("Синее колесо")}</b> {t("+5–100× · умножение ×2–10 · бонусная печать 67 · максимальный выигрыш.")}</p><p><b className="red">{t("Алое колесо")}</b> {t("+10–500× · умножение ×3–20 · максимальный выигрыш.")}</p></div>
  <h3>{t("Три ступени ритуала")}</h3><p>{t("1 / 2 / 3 бонусные печати 67 на синих колёсах открывают THE FIRST PACT / HELL UNBOUND / THE FINAL RITE. Каждый бонус начинается с 10 вращений. В первом есть синие и алые колёса; во втором — только алые; в третьем гарантировано хотя бы одно алое колесо в каждом вращении.")}</p>
  <p>{t("ECLIPSE PACT: отдельный бонус за 500×. 10 вращений без договора, две гарантированные алые печати в каждом вращении; возможна третья. Гарантия печатей не означает возврат стоимости бонуса.")}</p>
  <h3>{t("Все значения колёс")}</h3><p>{t("Синее: +5, +10, +15, +20, +25, +50, +100; ×2, ×3, ×4, ×5, ×10; бонус 67; MAX. Алое: +10, +15, +20, +25, +50, +100, +250, +500; ×3, ×4, ×5, ×10, ×15, ×20; MAX. Сектора показывают возможные исходы; их визуальный размер не обозначает вероятность выпадения.")}</p>
  <p>{network?t("В серверном раунде решение договора уже записано в результате. Кнопка раскрывает это решение; новая ветка на клиенте не выбирается."):t("Перед первыми двумя бонусами можно сохранить 10 вращений или принять договор: получить 5, 8, 12, 16, 20 вращений либо повышение уровня. При повышении с первого до второго уровня доступен ещё один договор.")} {t("Дополнительные вращения не начисляются за повторное выпадение печатей.")}</p>
  <p>{t("Максимальный выигрыш за весь оплаченный раунд, включая бонус, —")} <b>{t("16 666× базовой ставки")}</b>{t(". При достижении лимита раунд заканчивается. Стоимость усилений: синяя печать 10×, алая 50×; покупка бонусов 100×, 250× и 500×.")}</p>
  <h3>{t("Теоретический RTP")}</h3>
  {network?<><ul>{RTP_MODES.map(mode=><li key={mode.label}><b>{t(mode.label)}</b> · {t("Стоимость {cost}× базовой ставки",{cost:mode.cost})} · <b>{PUBLISHED_RTP}</b></li>)}</ul><p>{t("RTP — теоретическая доля общей стоимости игр, возвращаемая в виде выигрышей на очень большом числе полных раундов. Он включает бонусные вращения и рассчитывается относительно полной стоимости выбранного режима. Это не гарантированный возврат за отдельный раунд или игровую сессию.")}</p></>:<p>{t("Локальная демонстрация использует собственные предварительные вероятности. Опубликованный RTP 96.00% не описывает эту демонстрацию.")}</p>}
  <h3>{t("14 линий")}</h3><div className="line-diagrams">{PAYLINES.map((line,i)=><div className="line-diagram" key={i}><b>{i+1}</b><div>{Array.from({length:20},(_,j)=><i key={j} className={line[j%5]===Math.floor(j/5)?'on':''}/>)}</div></div>)}</div>
  <h3>{t("Режим сохраняется до отключения")}</h3><p>{t("Синяя печать повышает частоту колёс за 10×. Алая печать гарантирует алое колесо за 50×. Выбранный режим действует во всех следующих обычных вращениях, пока вы не выберете «Обычное».")} {social?t("Игровая сумма"):t("Цена")} {t("следующего вращения показана постоянно под полем.")}</p>
  <h3>{t("Управление")}</h3><p>{t("Кнопка SPIN или пробел запускают вращение. Кнопки −/+ меняют ставку; нажатие на сумму открывает список доступных ставок. При усилении BET показывает полную стоимость вращения, а окно выбора — базовую ставку. TURBO включает быстрый режим. AUTO открывает выбор количества и подтверждение автовращений; остановите серию кнопкой SPIN. MENU открывает настройки, звук и правила.")} {t("Часть функций может быть отключена правилами вашей сессии.")}</p>
  <h3>{t("Работа игры")}</h3><p>{t("Сбой аннулирует выигрыши и игровые операции. Для серверной игры необходимо стабильное соединение. При обрыве перезагрузите игру, чтобы завершить незаконченный раунд. Ожидаемая отдача оценивается по большому числу игр. Изображение условно и не представляет физическое устройство. В серверном режиме сумма выигрыша определяется ответом RGS, а не анимациями в браузере.")}</p>
</div>;}

function Studio({paused,onPreset}:{paused:boolean;onPreset:(preset:PresetName)=>void}){
  const {t}=useTranslation();
  const [id,setId]=useState('character'),[animation,setAnimation]=useState('idle'),[seq,setSeq]=useState(0),[bones,setBones]=useState(false),[speed,setSpeed]=useState(1);
  const clips=id==='ritual-portal'?['static','idle','open','win','drop']:id==='bigwin'?['static','idle','big','mega','epic','max','win']:id==='frame'?['static','idle','anticipation','win','bonus']:id.startsWith('character')?['static','idle','welcome','focus','guard','beckon','conjure','ritual-sway','bow','anticipation','cast','win','loss','bonus','laugh','celebrate','duel-cast']:id==='curtain'?['static','idle','close-blue','open-blue','close-red','open-red']:id==='wheel'?['static','idle','drop','spin','win','win-seal']:id.startsWith('ritual-fire-')?['static','idle','win']:['environment','environment-bonus','bigwin','ritual-impact'].includes(id)?['static','idle','drop','win']:['static','idle','drop','land','win'];
  return <div className="studio"><div className="studio-sidebar">{RIG_IDS.map(name=><button data-rig={name} className={name===id?'selected':''} key={name} onClick={()=>{setId(name);setAnimation('idle');setSeq(x=>x+1);}}>{t(LABELS[name]??name)}</button>)}</div>
    <div className="studio-work"><div className={`studio-stage rig-${id}`}><SpineView id={id} animation={animation} paused={animation==='static'||paused} debug={bones} speed={speed} sequence={seq} loop={animation==='idle'||animation==='static'}/></div>
      <div className="clip-buttons">{clips.map(clip=><button data-clip={clip} key={clip} className={clip===animation?'selected':''} onClick={()=>{setAnimation(clip);setSeq(x=>x+1);}}>{t('clip.'+clip)}</button>)}</div>
      <div className="studio-tools"><label><input type="checkbox" checked={bones} onChange={e=>setBones(e.target.checked)}/> {t("Кости")}</label><label>{t("Скорость")} <select value={speed} onChange={e=>setSpeed(Number(e.target.value))}><option value={.25}>0.25×</option><option value={.5}>0.5×</option><option value={1}>1×</option><option value={1.5}>1.5×</option></select></label></div>
      <p className="technical-note">{t("Spine 4.2 · отдельные растровые attachments · взвешенные mesh-вершины. Статический режим останавливает позу.")}</p>
    </div><div className="scenario-buttons"><span className="eyebrow">{t("СЦЕНАРИИ ИГРЫ")}</span>{PRESET_NAMES.map(p=><button data-scenario={p} key={p} onClick={()=>onPreset(p)}>{t(PRESET_LABELS[p])}</button>)}</div>
  </div>;
}

export function AshenGame(){
  const session=useRgsSession();
  const [game,setGame]=useState(()=>session.enabled?createServerState({amount:0,currency:'USD'},1_000_000):initialState({seed:666})); const latest=useRef(game);latest.current=game;
  const [progress,setProgress]=useState(0),[loaded,setLoaded]=useState(false),[entered,setEntered]=useState(false),[loadError,setLoadError]=useState('');
  const [panel,setPanel]=useState<Panel>(null),[busy,setBusy]=useState(false),[revealed,setRevealed]=useState(5),[mood,setMood]=useState('idle'),[sequence,setSequence]=useState(0);
  const [entering,setEntering]=useState(false);
  const [welcomeLogoReady,setWelcomeLogoReady]=useState(false);
  const [welcomeMood,setWelcomeMood]=useState<'welcome'|'idle'>('welcome');
  const [bonusArrival,setBonusArrival]=useState<BonusArrivalStage|null>(null),[bonusLocation,setBonusLocation]=useState(Boolean(game.bonus));
  const boardHost=useRef<HTMLDivElement>(null),blueKeeper=useRef<HTMLDivElement>(null),redKeeper=useRef<HTMLDivElement>(null);
  const keeperAims=useRef<KeeperAimState>({blue:{x:.72,y:.4},red:{x:.28,y:.4}});
  const arrivalTimeline=useRef<VisibleTimeline|null>(null);
  const [purchaseChoice,setPurchaseChoice]=useState<PurchaseChoice|null>(null);
  const [reelStartedAt,setReelStartedAt]=useState(0);
  const [displayBoard,setDisplayBoard]=useState(game.board),[displayBalance,setDisplayBalance]=useState(game.balanceCents),[message,setMessage]=useState<TranslationMessage>({key:'Печать ждёт своего часа.'}),[error,setError]=useState('');
  const [wheel,setWheel]=useState<{value:WheelOutcome;index:number;total:number;stage:string;tally:number}|null>(null),[curtain,setCurtain]=useState(-1),[curtainOpen,setCurtainOpen]=useState(false);
  const [curtainRate,setCurtainRate]=useState(1);
  const [curtainColor,setCurtainColor]=useState<'blue'|'red'>('blue');
  const [celebration,setCelebration]=useState<{name:string;amount:number}|null>(null),[bonusIntro,setBonusIntro]=useState(false);
  const [bonusIntroReady,setBonusIntroReady]=useState(false);
  const [dealWheel,setDealWheel]=useState<{stage:'spinning'|'result';result:DealResult;recorded:boolean}|null>(null);
  const [sound,setSound]=useState(false),[turbo,setTurbo]=useState(false),[motion,setMotion]=useState(()=>!window.matchMedia('(prefers-reduced-motion: reduce)').matches),[autoplay,setAutoplay]=useState(0);
  const [autoCount,setAutoCount]=useState(10);
  const audio=useRef<AshenAudio|null>(null),locked=useRef(false),alive=useRef(true),autoRef=useRef(0);autoRef.current=autoplay;
  const presentationAbort=useRef(new AbortController());
  const [pageVisible,setPageVisible]=useState(()=>!document.hidden);
  const sessionStart=useRef(Date.now()),openingBalance=useRef<number|null>(null),[sessionSeconds,setSessionSeconds]=useState(0);
  const jurisdiction=session.config?.jurisdiction??{},social=Boolean(jurisdiction.socialCasino||new URLSearchParams(location.search).get('social')==='true');
  const {t,language,setLanguage}=useTranslation(social);
  const operating=busy||session.busy,serverAvailable=!session.enabled||session.ready&&!session.error;
  const turboAllowed=!jurisdiction.disabledTurbo&&!jurisdiction.disabledSuperTurbo,fast=turbo&&turboAllowed;
  const autoplayAllowed=!jurisdiction.disabledAutoplay&&!session.readOnly;
  const bets=session.enabled?(session.config?.betLevels.map(amount=>amount/10_000)??[]):BETS;
  const amountLocked=operating||game.phase!=='base'||session.roundPending||session.readOnly||!serverAvailable;
  const featuresAllowed=!jurisdiction.disabledBuyFeature&&!session.readOnly;
  const referenceReplay=Boolean(session.replayInfo&&(session.replayInfo.displayDefaults.amount||session.replayInfo.displayDefaults.currency));
  const money=(cents:number)=>formatMoney(cents,referenceReplay?'DEMO':session.enabled?session.currency:'DEMO');
  const applyGame=(next:GameState)=>{latest.current=next;setGame(next);};
  useEffect(()=>{alive.current=true;presentationAbort.current=new AbortController();audio.current=new AshenAudio();void preloadRigs(setProgress).then(()=>setLoaded(true)).catch(e=>setLoadError(String(e)));return()=>{alive.current=false;presentationAbort.current.abort();audio.current?.destroy();};},[]);
  useEffect(()=>{const changed=()=>setPageVisible(!document.hidden);document.addEventListener('visibilitychange',changed);return()=>document.removeEventListener('visibilitychange',changed);},[]);
  useEffect(()=>{audio.current?.setEnabled(sound&&entered);},[sound,entered]);
  useEffect(()=>{
    // Do not let the second click that confirms a purchase skip its new screen.
    setBonusIntroReady(false);
    if(!bonusIntro||celebration)return;
    let live=true,timer:ReturnType<typeof setTimeout>|undefined;
    // Read animations after the committed dialog has acquired its CSS entrance.
    // A wall-clock timeout alone can enable a still-transparent dialog after a
    // slow first paint. The same promises naturally wait while motion is paused.
    const frame=requestAnimationFrame(()=>{
      const intro=document.querySelector('.bonus-intro');
      const animations=[...(intro?.getAnimations()??[]),...(intro?.parentElement?.getAnimations()??[])];
      const visible=Promise.all(animations.map(animation=>animation.finished.catch(()=>{})));
      const clickGuard=new Promise<void>(resolve=>{timer=setTimeout(resolve,350);});
      void Promise.all([visible,clickGuard]).then(()=>{if(live)setBonusIntroReady(true);});
    });
    return()=>{live=false;cancelAnimationFrame(frame);clearTimeout(timer);};
  },[bonusIntro,celebration]);
  useEffect(()=>{
    if(!session.enabled||!session.state||locked.current)return;
    latest.current=session.state;setGame(session.state);setDisplayBoard(session.state.board);setDisplayBalance(session.state.balanceCents);setRevealed(5);setBonusLocation(Boolean(session.state.bonus));
    if(openingBalance.current===null)openingBalance.current=session.state.balanceCents;
    if(session.readOnly)setMessage({key:'Записанный раунд. Баланс и средства не изменяются.'});
    else if(session.roundPending)setMessage({key:'Продолжаем сохранённый серверный раунд.'});
  },[session.enabled,session.state,session.readOnly,session.roundPending]);
  useEffect(()=>{
    if(!jurisdiction.displaySessionTimer)return;
    const timer=setInterval(()=>setSessionSeconds(Math.floor((Date.now()-sessionStart.current)/1000)),1000);return()=>clearInterval(timer);
  },[jurisdiction.displaySessionTimer]);
  const pause=async(ms:number)=>{await waitForPresentation(!motion?30:fast?ms*.36:ms,presentationAbort.current.signal); if(!alive.current)throw new Error('Disposed');};
  const holdResult=(ms:number)=>waitForPresentation(Math.max(fast?650:900,fast?ms*.7:ms),presentationAbort.current.signal);
  const enterBonusWorld=async()=>{
    setAutoplay(0);setCelebration(null);setBonusIntro(false);setMood('duel-cast');setSequence(n=>n+1);
    audio.current?.play('bonus');
    if(!motion){setBonusLocation(true);setMood('bonus');return;}
    // This short scene uses one visible-time clock, independent of turbo. It
    // presents an existing result and never draws or modifies an outcome.
    const timeline=new VisibleTimeline(performance.now());arrivalTimeline.current=timeline;
    const visibility=()=>timeline.setPaused(performance.now(),document.hidden);
    visibility();document.addEventListener('visibilitychange',visibility);
    // Absolute deadlines avoid adding one delayed timer callback to the next phase.
    const waitUntil=(ms:number)=>waitForPresentation(Math.max(0,ms-timeline.seconds(performance.now())*1000),presentationAbort.current.signal);
    try{
      setBonusArrival('charge');await waitUntil(BONUS_ARRIVAL.impact*1000);
      setBonusArrival('impact');audio.current?.play('wheel');await waitUntil(BONUS_ARRIVAL.ashes*1000);
      setBonusArrival('ashes');await waitUntil(BONUS_ARRIVAL.reveal*1000);
      setBonusLocation(true);setBonusArrival('reveal');await waitUntil(BONUS_ARRIVAL.end*1000);
    }finally{document.removeEventListener('visibilitychange',visibility);if(alive.current){setBonusArrival(null);setMood('bonus');}}
  };
  const runPresentation=async(next:GameState)=>{
    const result=next.lastSpin;if(!result)return;
    if(session.enabled)setDisplayBalance(next.balanceCents);
    setWheel(null);setCelebration(null);setMessage({key:'Договор вступает в силу…'});setMood('anticipation');setReelStartedAt(performance.now());setRevealed(0);setSequence(x=>x+1);audio.current?.play('spin');
    await pause(300);setDisplayBoard(result.board);
    for(let i=0;i<5;i++){await pause(i===0?500:100);setRevealed(i+1);audio.current?.play('stop');}
    await pause(260);
    for(let i=0;i<result.wheels.length;i++){
      const item=result.wheels[i];
      // Cloth and molten fire keep their own readable tempo, even in turbo.
      const closeMs=fast?400:i?500:550,openMs=fast?900:i?1200:1400;
      const curtainWait=(ms:number)=>waitForPresentation(motion?ms:30,presentationAbort.current.signal);
      setCurtain(item.reel);setCurtainColor(item.color);setCurtainOpen(false);setCurtainRate(550/closeMs);setMood('cast');audio.current?.play('wheel');
      await curtainWait(closeMs);setCurtainOpen(true);setCurtainRate(1200/openMs);await curtainWait(openMs);
      setWheel({value:item,index:i,total:result.wheels.length,stage:'spinning',tally:item.beforeCents});setCurtain(-1);await pause(2000);
      setWheel({value:item,index:i,total:result.wheels.length,stage:'result',tally:item.afterCents});setMood(item.kind==='free-spins'?'bonus':'win');audio.current?.play('win');await holdResult(i?1100:1250);
    }
    setWheel(null);setCurtain(-1);applyGame(next);setDisplayBalance(next.balanceCents);setSequence(x=>x+1);
    if(result.totalWinCents){setMood('win');const lines=result.lineWins.length;setMessage({key:'spin-win',params:{amount:money(result.totalWinCents),lines,ritual:result.wheels.length>0}});audio.current?.play('win');}
    else{setMood(result.bonusTriggered?'bonus':'loss');setMessage({key:result.bonusTriggered?'Пепельный договор открыт.':'Печать ждёт своего часа.'});}
    if(!next.completedBonus&&!result.bonusTriggered&&!['none','win'].includes(result.celebration)){setCelebration({name:result.celebration==='max'?'MAX WIN':`${result.celebration.toUpperCase()} WIN`,amount:result.totalWinCents});setMood('celebrate');await pause(700);}
    if(result.bonusTriggered){await enterBonusWorld();setBonusIntro(true);}
    if(next.completedBonus&&!result.bonusTriggered){setAutoplay(0);setMood('laugh');setCelebration({name:'RITUAL COMPLETE',amount:next.completedBonus.totalWinCents});}
  };
  const runDealPresentation=async(next:GameState,recorded:boolean)=>{
    const result=next.lastDeal;if(!result)throw new Error('В результате отсутствует договор');
    if(session.enabled)setDisplayBalance(next.balanceCents);
    setBonusIntro(false);setMood('cast');setSequence(value=>value+1);
    if(result.decision==='accept'){
      setDealWheel({stage:'spinning',result,recorded});audio.current?.play('wheel');await pause(2500);setDealWheel({stage:'result',result,recorded});
      audio.current?.play('bonus');await holdResult(1300);
    }else{
      // Keeping ten spins is a choice, not one of the six wheel outcomes.
      setDealWheel(null);audio.current?.play('bonus');
    }
    applyGame(next);setDisplayBalance(next.balanceCents);setDealWheel(null);setBonusIntro(true);setMood('bonus');
    setMessage({key:result.outcome==='upgrade'?'Договор повышен: {name}.':result.decision==='decline'?'Ритуал: {count} вращений сохранено.':'Ритуал: {count} вращений.',params:{name:BONUS_NAMES[result.toTier],count:result.spins}});
  };
  const serverPresenter=async(next:GameState,frame:ServerFrame)=>{
    if(frame.type==='deal')await runDealPresentation(next,true);else await runPresentation(next);
  };
  const performSpin=async(preset?:PresetName)=>{
    if(locked.current||session.busy||!serverAvailable||session.enabled&&preset||session.readOnly&&session.replayInfo?.completed)return;locked.current=true;setBusy(true);setError('');setPanel(null);
    try{
      const current=latest.current;
      if(session.enabled){const next=await session.advance({amountCents:current.betCents,featureMode:current.featureMode,presenter:serverPresenter});applyGame(next);setDisplayBalance(next.balanceCents);}
      else{const next=spin(current,preset?{preset}:undefined);setDisplayBalance(current.balanceCents-(current.phase==='base'?current.betCents*FEATURE_COSTS[current.featureMode]:0));await runPresentation(next);}
      if(autoRef.current>0)setAutoplay(n=>Math.max(0,n-1));
    }catch(e){setError(e instanceof Error?e.message:String(e));setDisplayBalance(latest.current.balanceCents);setAutoplay(0);}
    finally{if(alive.current){setBusy(false);locked.current=false;setWheel(null);setDealWheel(null);setCurtain(-1);setRevealed(5);}}
  };
  useEffect(()=>{
    if(!pageVisible||!entered||operating||panel||celebration||bonusIntro||game.phase==='deal'||session.nextFrameType==='deal'||!serverAvailable||!autoplayAllowed)return;
    if(autoplay>0){const t=setTimeout(()=>{void performSpin();},fast?120:700);return()=>clearTimeout(t);}
  });
  useEffect(()=>{const listener=(e:KeyboardEvent)=>{if(e.code==='Space'&&!e.repeat&&pageVisible&&!jurisdiction.disabledSpacebar&&entered&&!panel&&!celebration&&!bonusIntro&&!operating&&game.phase!=='deal'&&session.nextFrameType!=='deal'&&!['INPUT','SELECT','BUTTON','TEXTAREA'].includes((e.target as HTMLElement).tagName)&&!(e.target as HTMLElement).isContentEditable){e.preventDefault();void performSpin();}};window.addEventListener('keydown',listener);return()=>window.removeEventListener('keydown',listener);});
  const changeBet=(direction:number)=>{if(amountLocked||!bets.length)return;const index=bets.indexOf(game.betCents);const next=bets[Math.max(0,Math.min(bets.length-1,index+direction))];try{applyGame(session.enabled?{...game,betCents:next}:setBet(game,next));audio.current?.play('click');}catch(e){setError(String(e));}};
  const purchase=async(tier:1|2|3)=>{
    if(locked.current||amountLocked||!featuresAllowed)return;locked.current=true;setBusy(true);setAutoplay(0);setError('');setPanel(null);
    try{if(session.enabled){const next=await session.advance({amountCents:game.betCents,buyTier:tier,deferPresentation:true,presenter:serverPresenter});applyGame(next);setDisplayBalance(next.balanceCents);await enterBonusWorld();setBonusIntro(true);}
      else{const next=buyBonus(game,tier);applyGame(next);setDisplayBalance(next.balanceCents);await enterBonusWorld();setBonusIntro(true);}}
    catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{locked.current=false;setBusy(false);setDealWheel(null);}
  };
  const chooseDeal=async(decision:'accept'|'decline')=>{
    if(locked.current||operating||session.enabled)return;locked.current=true;setBusy(true);setError('');
    try{await runDealPresentation(deal(latest.current,decision),false);}catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{locked.current=false;setBusy(false);setDealWheel(null);}
  };
  const revealRecordedDeal=async()=>{
    if(locked.current||operating||!session.enabled)return;locked.current=true;setBusy(true);setError('');
    try{const next=await session.revealRecordedDeal(serverPresenter);applyGame(next);setDisplayBalance(next.balanceCents);}
    catch(e){setError(e instanceof Error?e.message:String(e));}finally{locked.current=false;setBusy(false);setDealWheel(null);}
  };
  const feature=(mode:FeatureMode)=>{if(amountLocked||mode!=='base'&&!featuresAllowed)return;try{if(session.enabled&&!session.config?.modes.includes(mode))return;applyGame(session.enabled?{...game,featureMode:mode}:setFeatureMode(game,mode));audio.current?.play('click');}catch(e){setError(String(e));}};
  const choiceMode=purchaseChoice?.kind==='feature'?purchaseChoice.mode:`bonus${purchaseChoice?.tier??1}` as 'bonus1'|'bonus2'|'bonus3';
  const choiceCost=purchaseChoice?purchaseChoice.betCents*(purchaseChoice.kind==='feature'?FEATURE_COSTS[purchaseChoice.mode]:BONUS_COSTS[purchaseChoice.tier]):0;
  const choiceAvailable=Boolean(purchaseChoice&&!amountLocked&&featuresAllowed&&game.betCents===purchaseChoice.betCents&&game.balanceCents>=choiceCost&&(!session.enabled||session.config?.modes.includes(choiceMode)));
  const cancelPurchase=()=>{setPurchaseChoice(null);setPanel('buy');};
  const confirmPurchase=()=>{
    if(!purchaseChoice||!choiceAvailable||locked.current)return;
    const choice=purchaseChoice;setPurchaseChoice(null);setPanel(null);
    if(choice.kind==='feature')feature(choice.mode);else void purchase(choice.tier);
  };
  const winners=new Set(!operating?game.lastSpin?.lineWins.flatMap(w=>w.cells.map(c=>`${c.reel}-${c.row}`)):[]);
  if(!operating)game.lastSpin?.wheels.forEach(w=>winners.add(`${w.reel}-${w.row}`));
  const showDeal=(session.enabled?session.nextFrameType==='deal':game.phase==='deal')&&!bonusIntro&&!operating&&!celebration&&serverAvailable;
  const insufficientBalance=serverAvailable&&game.phase==='base'&&!session.readOnly&&!session.roundPending&&game.balanceCents<game.betCents*FEATURE_COSTS[game.featureMode];
  const canSpin=!operating&&!panel&&!celebration&&!bonusIntro&&!showDeal&&serverAvailable&&!insufficientBalance&&!(session.readOnly&&session.replayInfo?.completed);
  const scenePaused=!motion||Boolean(panel||celebration||bonusIntro||showDeal||wheel||dealWheel);
  const fieldDestroyed=bonusArrival==='impact'||bonusArrival==='ashes';
  const overlayOpen=Boolean(bonusArrival||panel||celebration||bonusIntro||showDeal||wheel||dealWheel||session.enabled&&(!session.ready||session.error));
  const stopOrSpin=()=>{if(autoplay){setAutoplay(0);return;}void performSpin();};
  const preview=(preset:PresetName)=>{if(session.enabled||operating||locked.current)return;setPanel(null);setAutoplay(0);setBonusLocation(false);const reset=initialState({balanceCents:Math.max(100000,latest.current.balanceCents),betCents:latest.current.betCents,seed:latest.current.seed});applyGame(reset);void performSpin(preset);};
  const reconnect=async()=>{setError('');setCelebration(null);setBonusIntro(false);setDealWheel(null);setAutoplay(0);try{await session.reconnect();}catch{/* Session error is displayed by the recovery modal. */}};
  const enterGame=async()=>{if(entering||!loaded)return;setEntering(true);audio.current?.play('click');try{if(motion)await waitForPresentation(650,presentationAbort.current.signal);if(alive.current)setEntered(true);}catch{/* Unmounted during the entrance. */}finally{if(alive.current)setEntering(false);}};
  const restartReplay=()=>{if(operating)return;setCelebration(null);setBonusIntro(false);setError('');session.restartReplay();};
  return <SocialModeContext.Provider value={social}><main className={`ashen-app ${entered?'entered':''} ${game.bonus?'bonus-mode':''} ${!motion?'reduced-motion':''} ${!pageVisible?'presentation-paused':''}`}>
    <div className="world-scene" data-location={bonusLocation?'bonus':'base'} data-paused={scenePaused||!pageVisible}><div className="world-plate world-base"/><div className="world-plate world-bonus"/></div><SpineView id={bonusLocation?'environment-bonus':'environment'} className="environment-layer" paused={scenePaused}/><div className="vignette"/>
    {!entered?<section className={`startup startup-v13 startup-v14 ${loaded?'assets-ready':''} ${entering?'departing':''}`} aria-busy={!loaded}>{RIG_IDS.includes('ritual-portal')&&<div className="welcome-portal" aria-hidden="true"><SpineView id="ritual-portal" animation="idle" paused={scenePaused}/></div>}<div className="startup-title"><span className="eyebrow">THE RAVEN'S RITUAL</span><h1><img src="./ashen/ui/v14/logo.webp" alt="ASHEN PACT" data-render-ready={welcomeLogoReady} onLoad={event=>{const image=event.currentTarget;void image.decode().then(()=>{if(alive.current)setWelcomeLogoReady(true);}).catch(()=>{if(image.naturalWidth&&alive.current)setWelcomeLogoReady(true);});}}/></h1><p>{t("ПЕПЕЛЬНЫЙ ДОГОВОР")}</p></div>
      
      <div className="startup-character startup-character-blue"><SpineView id="character-blue" animation={welcomeMood} loop={welcomeMood==='idle'} paused={scenePaused}/></div>
      <div className="startup-character startup-character-red"><SpineView id="character" animation={welcomeMood} loop={welcomeMood==='idle'} paused={scenePaused} onComplete={()=>{if(!entered)setWelcomeMood('idle');}}/></div>
      <div className="welcome"><div className="fact-cards"><WelcomeFact id="blue-six" index={0} paused={scenePaused||!loaded}><h3>{t("ДВЕ ПЕЧАТИ")}</h3><p>{t("Синяя открывает ритуал.")}<br/>{t("Алая усиливает выигрыш.")}</p></WelcomeFact><WelcomeFact id="red-six" index={1} paused={scenePaused||!loaded}><h3>{t("ТРИ РИТУАЛА")}</h3><p>{t("10 бесплатных вращений.")}<br/>{t("Три ступени силы.")}</p></WelcomeFact><article className="fact-ultimate"><b>16 666<span>×</span></b><h3>{t("ПРЕДЕЛ СИЛЫ")}</h3><p>{t("Максимальный выигрыш")}<br/>{t("за весь раунд.")}</p></article></div><div className="welcome-action-area"><button className="primary enter-button" disabled={!loaded||entering} onClick={()=>{void enterGame();}}>{t("ВОЙТИ В СОБОР")} <span>→</span></button><div className={`loading-block ${loadError?'has-error':''}`} hidden={loaded}><span>{loadError?t("Не удалось загрузить изображения"):t("ПРОБУЖДАЕМ ХРАНИТЕЛЯ")}</span><div className="loading-track" role="progressbar" aria-label={t("ПРОБУЖДАЕМ ХРАНИТЕЛЯ")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress*100)}><i style={{transform:`scaleX(${progress})`}}/></div><small>{Math.round(progress*100)}%</small>{loadError&&<button onClick={()=>location.reload()}>{t("Повторить загрузку")}</button>}</div></div><label className="welcome-audio"><input type="checkbox" checked={sound} disabled={!loaded} onChange={e=>setSound(e.target.checked)}/> {t("Звук и атмосфера")}</label></div>
    </section>:<div className="game-shell" inert={overlayOpen}>
      <header className="game-header"><div className="wordmark"><img src="./ashen/ui/v14/logo.webp" alt="ASHEN PACT"/></div><div className="header-center">{game.bonus?<><span className="red">{bonusName(game.bonus)}</span><b>{game.bonus.remaining} <small>{t("ВРАЩЕНИЙ")}</small></b></>:<span className="game-premise">{t("14 ЛИНИЙ · ДО 16 666×")}</span>}</div><div className="header-right"><span className="session-chip">{session.readOnly?'REPLAY':session.enabled?'RGS SESSION':'LOCAL DEMO'}</span></div></header>
      {session.replayInfo&&<div className="replay-info"><span>{t("ПОВТОР ·")} {session.replayInfo.mode.toUpperCase()}</span><span>{referenceReplay?t('Нормализованный повтор · условная сумма {amount} · результат {multiplier}×',{amount:money(session.replayInfo.amountCents),multiplier:session.replayInfo.payoutMultiplier}):t('Сумма {amount} · выигрыш {payout}',{amount:money(session.replayInfo.amountCents),payout:money(session.replayInfo.payoutCents)})}</span><button disabled={operating} onClick={restartReplay}>{session.replayInfo.completed?t("ПОСМОТРЕТЬ ЗАНОВО"):t("С НАЧАЛА")}</button></div>}
      <section className="game-stage" data-bonus-stage={bonusArrival??undefined}><div className="reels-area" ref={boardHost}>
        <div className={`reel-board ${busy?'is-spinning':''}`} aria-label={t("Поле 5 барабанов и 4 ряда")}>
          {displayBoard.map((column,col)=><div className={`reel-column ${col>=revealed?'rolling':''}`} key={col}>
            {column.map((id,row)=><div className={`symbol-cell ${winners.has(`${col}-${row}`)?'winning':''} ${id.includes('six')?'special-symbol':''}`} key={`${col}-${row}`} data-symbol={id} style={{'--break-x':`${(col-2)*80+(row%2?15:-15)}px`,'--break-y':`${(row-1.5)*65+30}px`,'--break-turn':`${(col-2)*12+(row%2?18:-18)}deg`,'--break-delay':`${Math.abs(col-2)*35+row*12}ms`} as CSSProperties}><SpineView id={id} label={t(LABELS[id]??id)} animation={col>=revealed?'idle':busy?'land':winners.has(`${col}-${row}`)?'win':'idle'} speed={busy&&fast?1/.36:1} sequence={sequence} loop={!busy&&!winners.has(`${col}-${row}`)} paused={scenePaused||fieldDestroyed||col>=revealed||curtain===col}/></div>)}
            {curtain===col&&<ReelCurtain color={curtainColor} open={curtainOpen} speed={curtainRate} sequence={sequence} paused={!motion}/>}
            <ReelMotion active={col>=revealed&&motion} speed={fast?1.5:1} column={col} durationMs={(800+col*100)*(fast?.36:1)} startedAt={reelStartedAt}/>
          </div>)}
          
        </div><SpineView id="frame" className="reel-frame-art" animation={busy?'anticipation':game.bonus?'bonus':game.lastSpin?.totalWinCents?'win':'idle'} loop={busy||Boolean(game.bonus)||!game.lastSpin?.totalWinCents} sequence={sequence} paused={scenePaused||fieldDestroyed}/>
      </div><div ref={blueKeeper} className="character-stage character-stage-blue"><SpineView id="character-blue" animation={mood} loop={['idle','anticipation','bonus'].includes(mood)} sequence={sequence} paused={scenePaused} onAimPoint={point=>{keeperAims.current.blue=point;keeperAims.current.onChange?.('blue');}}/></div><div ref={redKeeper} className="character-stage character-stage-red"><SpineView id="character" animation={mood} loop={['idle','anticipation','bonus'].includes(mood)} sequence={sequence} paused={scenePaused} onAimPoint={point=>{keeperAims.current.red=point;keeperAims.current.onChange?.('red');}} onComplete={()=>{if(!operating&&!locked.current&&!scenePaused&&!bonusArrival&&['win','loss','laugh','cast','celebrate'].includes(mood))setMood(game.bonus?'bonus':'idle');}}/></div></section>
      <div className="message-bar" aria-live="polite">{(error||insufficientBalance)?<span className="error-message">{error?translateError(error,language,social):t('Недостаточно средств. Уменьшите ставку или отключите усиление.')}<button onClick={()=>setError('')} aria-label={t("Скрыть сообщение")}>×</button></span>:<span>{t(message.key,message.params)}</span>}{game.bonus&&<strong>{t("БОНУС")} {money(game.bonus.totalWinCents)}</strong>}</div>
      <div className={`feature-status ${game.featureMode}`}><span>{game.featureMode==='base'?t("ОБЫЧНЫЙ РЕЖИМ"):t(game.featureMode==='blue'?'СИНЯЯ ПЕЧАТЬ · РЕЖИМ СОХРАНЯЕТСЯ':'АЛАЯ ПЕЧАТЬ · РЕЖИМ СОХРАНЯЕТСЯ')}</span><strong>{game.bonus?t("БЕСПЛАТНОЕ ВРАЩЕНИЕ"):session.readOnly?t("ЗАПИСАННЫЙ РАУНД"):t('СЛЕДУЮЩЕЕ ВРАЩЕНИЕ · {amount}',{amount:money(game.betCents*FEATURE_COSTS[game.featureMode])})}</strong></div>
      <GameControls
        balance={session.readOnly?'—':money(displayBalance)} win={money(!operating?game.lastSpin?.totalWinCents||0:0)}
        bet={money(game.betCents*(game.bonus?1:FEATURE_COSTS[game.featureMode]))}
        currency={referenceReplay?t('УСЛОВНЫЕ ЕДИНИЦЫ'):session.enabled?session.currency:'DEMO'} replay={session.readOnly}
        winActive={Boolean(!operating&&game.lastSpin?.totalWinCents)} multiplier={game.bonus?1:FEATURE_COSTS[game.featureMode]}
        autoCount={autoplay} turbo={fast} operating={operating}
        bonusDisabled={amountLocked||!featuresAllowed} betDisabled={amountLocked||!bets.length}
        decreaseDisabled={amountLocked||!bets.length||game.betCents===bets[0]} increaseDisabled={amountLocked||!bets.length||game.betCents===bets.at(-1)}
        autoDisabled={!autoplayAllowed||!serverAvailable||showDeal||game.phase==='deal'||operating&&!autoplay} turboDisabled={!turboAllowed||operating}
        spinDisabled={autoplay?!autoplayAllowed:!canSpin}
        spinLabel={autoplay?t('Остановить серию'):session.roundPending&&session.nextFrameType===null?t('Завершить серверный раунд'):session.readOnly?t('Продолжить повтор'):game.bonus?t('Следующее бесплатное вращение'):t('Вращать')}
        onBonus={()=>{setAutoplay(0);setPanel('buy');}} onMenu={()=>{setAutoplay(0);setPanel('menu');}} onBet={()=>{setAutoplay(0);setPanel('bet');}}
        onDecrease={()=>changeBet(-1)} onIncrease={()=>changeBet(1)} onAuto={()=>{if(autoplay)setAutoplay(0);else setPanel('autoplay');}} onTurbo={()=>setTurbo(x=>!x)} onSpin={stopOrSpin}
      /><div className="footer-notes"><span>ASHEN PACT</span><span>{jurisdiction.disabledSpacebar?t("УПРАВЛЕНИЕ КНОПКОЙ ВРАЩЕНИЯ"):t("ПРОБЕЛ — ВРАЩАТЬ")}</span><span>{session.readOnly?t("ПОВТОР БЕЗ ОПЕРАЦИЙ СО СРЕДСТВАМИ"):session.enabled?t("СЕРВЕРНЫЙ БАЛАНС"):t("ДЕМОНСТРАЦИОННЫЕ СРЕДСТВА")}</span></div>
      {(jurisdiction.displaySessionTimer||jurisdiction.displayNetPosition||jurisdiction.displayRTP)&&<div className="session-info">{jurisdiction.displaySessionTimer&&<span>{t("СЕССИЯ")} {Math.floor(sessionSeconds/60)}:{String(sessionSeconds%60).padStart(2,'0')}</span>}{jurisdiction.displayNetPosition&&<span>{t("ИЗМЕНЕНИЕ БАЛАНСА")} {money(displayBalance-(openingBalance.current??displayBalance))}</span>}{jurisdiction.displayRTP&&<span title={session.enabled||session.readOnly?t("Теоретическая отдача за большое число раундов; не гарантируется в отдельном раунде или сессии."):t("Локальная демонстрация использует собственные предварительные вероятности. Опубликованный RTP 96.00% не описывает эту демонстрацию.")}>{session.enabled||session.readOnly?t("ТЕОРЕТИЧЕСКИЙ RTP: {rtp}",{rtp:PUBLISHED_RTP}):t("RTP: ЛОКАЛЬНОЕ ДЕМО")}</span>}</div>}
    </div>}
    {entered&&panel==='menu'&&<Modal title={t("Меню")} onClose={()=>setPanel(null)} className="menu-modal"><div className="menu-options"><button className="settings-button" aria-label={t("Открыть настройки")} onClick={()=>setPanel('settings')}><PcIcon name="settings"/>{t("Настройки")}</button><button className="info-button" aria-label={t("Открыть правила")} onClick={()=>setPanel('rules')}><PcIcon name="info"/>{t("Правила и выплаты")}</button><button onClick={()=>setSound(x=>!x)}><PcIcon name={sound?'sound':'mute'}/>{sound?t("Выключить звук"):t("Включить звук")}</button>{featuresAllowed&&<button disabled={amountLocked} onClick={()=>setPanel('buy')}><PcIcon name="bonus"/>{t("Бонусы и усиления")}</button>}<button onClick={()=>setPanel(null)}><PcIcon name="back"/>{t("Вернуться к игре")}</button></div></Modal>}
    {entered&&panel==='autoplay'&&<Modal title={t("Автовращения")} onClose={()=>setPanel(null)} className="autoplay-modal"><p>{t("Количество вращений")}</p><div className="autoplay-options">{[10,25,50,100].map(count=><button key={count} aria-pressed={autoCount===count} className={autoCount===count?'selected':''} onClick={()=>setAutoCount(count)}>{count}</button>)}</div><p className="autoplay-cost">{game.bonus?t("Бесплатные вращения"):t('Цена одного вращения · {amount}',{amount:money(game.betCents*FEATURE_COSTS[game.featureMode])})}</p><button className="primary autoplay-start" disabled={!autoplayAllowed||!serverAvailable||operating||insufficientBalance} onClick={()=>{setAutoplay(autoCount);setPanel(null);}}>{t("НАЧАТЬ")} {autoCount} {t("ВРАЩЕНИЙ")}</button><p>{t("Серию можно остановить кнопкой SPIN. Начатое вращение завершится.")}</p></Modal>}
    {entered&&panel==='bet'&&<Modal title={social?t("СУММА ИГРЫ"):t("СТАВКА")} onClose={()=>setPanel(null)} className="bet-modal">
      {game.featureMode!=='base'&&<p className="bet-base-note">{t('Базовая ставка. Итоговая стоимость учитывает активное усиление.')}</p>}
      <div className="bet-dialog-current"><button aria-label={t("Уменьшить ставку")} disabled={amountLocked||game.betCents===bets[0]||!bets.length} onClick={()=>changeBet(-1)}>−</button><FitAmount>{money(game.betCents)}</FitAmount><button aria-label={t("Увеличить ставку")} disabled={amountLocked||game.betCents===bets.at(-1)||!bets.length} onClick={()=>changeBet(1)}>+</button></div>
      <div className="bet-levels" role="group" aria-label={social?t("СУММА ИГРЫ"):t("СТАВКА")}>{bets.map(value=><button key={value} aria-pressed={game.betCents===value} disabled={amountLocked} onClick={()=>{if(amountLocked||!bets.includes(value))return;try{applyGame(session.enabled?{...game,betCents:value}:setBet(game,value));audio.current?.play('click');}catch(e){setError(String(e));}}}>{money(value)}</button>)}</div>
      <p className="bet-dialog-total">{t('СЛЕДУЮЩЕЕ ВРАЩЕНИЕ · {amount}',{amount:money(game.betCents*FEATURE_COSTS[game.featureMode])})}</p><button className="primary" onClick={()=>setPanel(null)}>{t("ПРОДОЛЖИТЬ →")}</button>
    </Modal>}
    {entered&&panel==='rules'&&<Modal title={t("Книга договора")} eyebrow={t("ПРАВИЛА И ВЫПЛАТЫ")} onClose={()=>setPanel(null)} className="rules-modal"><Rules network={session.enabled||session.readOnly} social={social}/></Modal>}
    {entered&&panel==='settings'&&<Modal title={t("Настройки")} eyebrow="ASHEN PACT" onClose={()=>setPanel(null)} className="settings-modal"><div className="settings-list"><label>{t("Звук и музыка")}<input type="checkbox" checked={sound} onChange={e=>setSound(e.target.checked)}/></label><label>{t("Анимация окружения")}<input type="checkbox" checked={motion} onChange={e=>setMotion(e.target.checked)}/></label><label>{t("Быстрые вращения")}<input type="checkbox" checked={fast} disabled={!turboAllowed||operating} onChange={e=>setTurbo(e.target.checked)}/></label></div>{!social&&<div className="language-options" role="group" aria-label={t('Язык интерфейса')}><button aria-pressed={language==='ru'} onClick={()=>setLanguage('ru')}>{t("Русский")}</button><button aria-pressed={language==='en'} onClick={()=>setLanguage('en')}>English</button></div>}<button className="secondary full" disabled={session.enabled||operating} onClick={()=>{if(!session.enabled&&!operating)setPanel('studio');}}>{t("ОТКРЫТЬ СТУДИЮ АНИМАЦИИ →")}</button><button className="text-button" onClick={()=>setPanel('rules')}>{t("Правила и таблица выплат")}</button>{session.enabled&&<p className="technical-note">{session.readOnly?t("Режим просмотра записанного раунда."):t("Игровые ограничения и доступные суммы определяет сервер сессии.")}</p>}</Modal>}
    {entered&&panel==='studio'&&!session.enabled&&!operating&&<Modal title={t("Animation studio")} eyebrow={t("ПРОСМОТР АССЕТОВ")} onClose={()=>setPanel(null)} className="studio-modal"><Studio paused={false} onPreset={preview}/></Modal>}
    {entered&&panel==='buy'&&!amountLocked&&featuresAllowed&&<Modal title={t("Бонусы и усиления")} onClose={()=>setPanel(null)} className="buy-modal ritual-choice-modal">
      <RitualChoice betCents={game.betCents} balanceCents={game.balanceCents} costs={BONUS_COSTS} names={PURCHASE_NAMES} availableModes={session.enabled?session.config?.modes??[]:undefined} money={money} onChoose={tier=>{setPurchaseChoice({kind:"bonus",tier,betCents:game.betCents});setPanel("confirm");}} motion={motion} social={social} publishedMath={session.enabled||session.readOnly}/>
      <details className="ritual-boosts"><summary>{t("Усиления основной игры")}</summary>
      <div className="purchase-cards">
        {(['blue','red'] as const).map(mode=><article className={`purchase-card feature-card mode-${mode}`} key={mode}>
          <div className="purchase-art"><SpineView id={mode==='blue'?'blue-six':'red-six'} paused={!motion}/></div>
          <div className="purchase-body"><span className="purchase-kind">{t("УСИЛЕНИЕ ·")} {FEATURE_COSTS[mode]}×</span><h3>{mode==='blue'?t("СИНЯЯ ПЕЧАТЬ"):t("АЛАЯ ПЕЧАТЬ")}</h3><p>{mode==='blue'?t("Повышенная частота колёс"):t("Алое колесо в каждом вращении")}</p><FitAmount className="purchase-price">{money(game.betCents*FEATURE_COSTS[mode])}</FitAmount>{game.balanceCents<game.betCents*FEATURE_COSTS[mode]&&<small className="purchase-availability">{t("Недостаточно средств")}</small>}<button className="purchase-action" aria-pressed={game.featureMode===mode} disabled={game.balanceCents<game.betCents*FEATURE_COSTS[mode]||session.enabled&&!session.config?.modes.includes(mode)} onClick={()=>{if(game.featureMode===mode){setPanel(null);return;}setPurchaseChoice({kind:"feature",mode,betCents:game.betCents});setPanel("confirm");}}>{game.featureMode===mode?t("АКТИВНО"):t("АКТИВИРОВАТЬ")}</button></div>
        </article>)}
      </div>
      </details>
      <div className="purchase-footer"><div className="purchase-balance"><span>{t("БАЛАНС")}</span><FitAmount>{money(displayBalance)}</FitAmount></div><div className="purchase-bet"><span>{social?t("СУММА ИГРЫ"):t("СТАВКА")}</span><div className="purchase-bet-row"><button className="bet-down" aria-label={t("Уменьшить ставку покупки")} disabled={!bets.length||game.betCents===bets[0]} onClick={()=>changeBet(-1)}><PcIcon name="down"/></button><FitAmount>{money(game.betCents)}</FitAmount><button className="bet-up" aria-label={t("Увеличить ставку покупки")} disabled={!bets.length||game.betCents===bets.at(-1)} onClick={()=>changeBet(1)}><PcIcon name="up"/></button></div></div><button className="feature-reset" disabled={game.featureMode==='base'||session.enabled&&!session.config?.modes.includes('base')} onClick={()=>feature('base')}>{t("ОБЫЧНОЕ ВРАЩЕНИЕ")}</button></div>
      <p className="purchase-disclosure">{game.featureMode==='base'?t("Обычный режим"):t(game.featureMode==='blue'?'Активна синяя печать':'Активна алая печать')} {t("· Следующее вращение")} {money(game.betCents*FEATURE_COSTS[game.featureMode])}{t(". Усиление сохраняется до отключения.")}</p>
    </Modal>}
    {entered&&panel==='confirm'&&purchaseChoice&&<Modal title={purchaseChoice.kind==='feature'?t("Подтвердить усиление"):t("Подтвердить бонус")} eyebrow="ASHEN PACT" onClose={cancelPurchase} className="purchase-confirm-modal">
      <div className="confirm-emblem"><SpineView id={(purchaseChoice.kind==='feature'?purchaseChoice.mode==='blue':purchaseChoice.tier===1)?'blue-six':'red-six'} paused={!motion}/></div>
      <h3>{purchaseChoice.kind==='feature'?t(purchaseChoice.mode==='blue'?"СИНЯЯ ПЕЧАТЬ":"АЛАЯ ПЕЧАТЬ"):PURCHASE_NAMES[purchaseChoice.tier]}</h3>
      <div className="confirm-cost"><span>{t(purchaseChoice.kind==='feature'?"ЗА КАЖДОЕ ВРАЩЕНИЕ":"ОДНОКРАТНАЯ СТОИМОСТЬ")}</span><FitAmount>{money(choiceCost)}</FitAmount></div>
      <p className="confirm-description">{t(purchaseChoice.kind==='feature'?"Усиление действует на каждое следующее обычное вращение, пока вы его не отключите. Активация не запускает вращение.":purchaseChoice.tier===3?"Eclipse: 10 вращений, две гарантированные алые печати в каждом. Стоимость списывается один раз. Договора нет.":"Стоимость будет списана один раз. Бонус начинается с 10 бесплатных вращений и предложения договора.")}</p>
      <div className="confirm-balance"><span>{t("БАЛАНС")}</span><span>{money(displayBalance)}</span></div>
      {!choiceAvailable&&<p className="purchase-availability">{t("Выбор недоступен. Вернитесь к бонусам и проверьте сумму.")}</p>}
      <div className="confirm-actions"><button className="secondary" onClick={cancelPurchase}>{t("ОТМЕНА")}</button><button className="primary confirm-purchase" disabled={!choiceAvailable} onClick={confirmPurchase}>{t(purchaseChoice.kind==='feature'?"АКТИВИРОВАТЬ":"ПОДТВЕРДИТЬ")}</button></div>
    </Modal>}
    {entered&&bonusIntro&&!celebration&&game.bonus&&<Modal title={bonusName(game.bonus)} titleArt={bonusTitleArt(game.bonus)} eyebrow={t('РИТУАЛ {tier}',{tier:game.bonus.tier})} className={`bonus-intro bonus-tier-${game.bonus.tier}`}><SpineView id={bonusLocation?'environment-bonus':'environment'} className="ceremony-environment" paused={!motion}/><SpineView id={game.bonus.tier===1?'blue-six':'red-six'} animation="win" loop={false} paused={!motion}/>{RIG_IDS.includes('ritual-portal')&&<div className="bonus-gate-art" aria-hidden="true"><SpineView id="ritual-portal" animation="open" loop={false} paused={!motion}/></div>}<div className="free-spin-count"><RasterNumber>{game.bonus.remaining}</RasterNumber><span>{t("БЕСПЛАТНЫХ ВРАЩЕНИЙ")}</span></div><p className="bonus-rule">{game.bonus.variant==='eclipse'?t("ДВЕ АЛЫЕ ПЕЧАТИ В КАЖДОМ ВРАЩЕНИИ"):game.bonus.tier===1?t("СИНИЕ И АЛЫЕ ПЕЧАТИ"):game.bonus.tier===2?t("ТОЛЬКО АЛЫЕ ПЕЧАТИ"):t("АЛАЯ ПЕЧАТЬ В КАЖДОМ ВРАЩЕНИИ")}</p><button className="primary" disabled={!bonusIntroReady} onClick={()=>{if(!bonusIntroReady)return;setBonusIntro(false);setMood('bonus');if(game.phase==='free-spins'&&autoplayAllowed)setAutoplay(game.bonus?.remaining??0);}}>{t("ПРОДОЛЖИТЬ →")}</button></Modal>}
    {entered&&showDeal&&<Modal title={session.enabled?t("Записанный договор"):t("Цена силы")} eyebrow={t("DEAL WITH THE KEEPER")} className="deal-modal"><SpineView id={bonusLocation?'environment-bonus':'environment'} className="ceremony-environment" paused={!motion}/><div className="deal-keeper"><SpineView id="character" animation="anticipation" paused={!motion}/></div>{session.enabled?<><p>{t(session.dealLimitation)}</p><div className="deal-actions"><button className="primary" onClick={()=>{void revealRecordedDeal();}}>{t("РАСКРЫТЬ ДОГОВОР →")}</button></div></>:<><p>{t("Сохраните")} {game.bonus?.remaining??10} {t("вращений или примите договор.")}<br/>{t("Колесо даст 5, 8, 12, 16, 20 вращений — либо ритуал выше.")}</p><div className="deal-actions"><button className="secondary" onClick={()=>{void chooseDeal('decline');}}>{t("СОХРАНИТЬ")} {game.bonus?.remaining??10}</button><button className="primary" onClick={()=>{void chooseDeal('accept');}}>{t("ПРИНЯТЬ ДОГОВОР")}</button></div></>}</Modal>}
    {wheel&&<WheelReveal wheel={wheel.value} index={wheel.index} total={wheel.total} stage={wheel.stage} tally={wheel.tally} paused={!motion} speed={(fast?1/.36:1)*1.25} money={money}/>}
    {dealWheel&&<Modal title={dealWheel.stage==='spinning'?t("Колесо договора"):dealWheel.result.outcome==='upgrade'?t("Ритуал выше"):dealWheel.result.decision==='decline'?t("Договор сохранён"):t("Договор заключён")} eyebrow={dealWheel.recorded?t("ЗАПИСАННЫЙ РЕЗУЛЬТАТ"):t("THE KEEPER DECIDES")} className="deal-wheel-modal"><SpineView id={bonusLocation?'environment-bonus':'environment'} className="ceremony-environment" paused={!motion}/><WheelDial className="deal-wheel" values={['5','8','12','16','20','↑']} result={dealWheel.result.outcome==='upgrade'?'↑':String(dealWheel.result.spins)} caption={dealWheel.result.outcome==='upgrade'?BONUS_NAMES[dealWheel.result.toTier]:t("БЕСПЛАТНЫХ ВРАЩЕНИЙ")} spinning={dealWheel.stage==='spinning'} sequence={sequence} paused={!motion} speed={fast?1/.36:1}/><p className="deal-result-note" aria-live="polite">{dealWheel.stage==='spinning'?t("Печати вращаются…"):dealWheel.result.outcome==='upgrade'?t('УРОВЕНЬ {from} → {to}',{from:dealWheel.result.fromTier,to:dealWheel.result.toTier}):t(dealWheel.result.decision==='decline'?'Сохранено вращений: {count}':'Вращений для нового ритуала: {count}',{count:dealWheel.result.spins})}</p></Modal>}
    {bonusArrival&&arrivalTimeline.current&&<BonusArrival stage={bonusArrival} board={boardHost} blue={blueKeeper} red={redKeeper} aims={keeperAims} paused={!pageVisible||!motion} timeline={arrivalTimeline.current}/>}
    {celebration&&<Celebration key={`${sequence}:${celebration.name}:${celebration.amount}`} {...celebration} sequence={sequence} motion={motion} money={money} onAccent={accent=>audio.current?.play(accent==='rise'?'wheel':'win')} onContinue={()=>{setCelebration(null);setBonusLocation(Boolean(game.bonus));setMood(game.bonus?'bonus':'idle');}}/>}
    {entered&&session.enabled&&(!session.ready||session.error)&&<Modal title={session.error?t("Сессия приостановлена"):session.readOnly?t("Загрузка повтора"):t("Подключение к сессии")} eyebrow="STAKE ENGINE" className="session-modal"><p>{session.error?translateError(session.error,language,social):t('Проверяем авторизацию и серверный результат раунда.')}</p>{session.error&&<><p>{t("Восстановление проверит состояние принятого раунда и баланс.")}</p>{session.errorReference&&<p className="technical-note" data-rgs-error-reference>{session.errorReference}</p>}<button className="primary" disabled={session.busy||busy} onClick={()=>{void reconnect();}}>{t("ВОССТАНОВИТЬ СЕССИЮ")}</button></>}<p className="technical-note">{session.readOnly?t("Повтор загружается без операций с балансом."):t("Результаты и баланс подтверждаются сервером сессии.")}</p></Modal>}
  </main></SocialModeContext.Provider>;
}
