import { FitAmount } from './FitAmount';
import { useTranslation } from './i18n';

interface GameControlsProps {
  balance: string;
  win: string;
  bet: string;
  currency: string;
  replay: boolean;
  winActive: boolean;
  multiplier: number;
  autoCount: number;
  turbo: boolean;
  operating: boolean;
  bonusDisabled: boolean;
  betDisabled: boolean;
  decreaseDisabled: boolean;
  increaseDisabled: boolean;
  autoDisabled: boolean;
  turboDisabled: boolean;
  spinDisabled: boolean;
  spinLabel: string;
  onBonus: () => void;
  onMenu: () => void;
  onBet: () => void;
  onDecrease: () => void;
  onIncrease: () => void;
  onAuto: () => void;
  onTurbo: () => void;
  onSpin: () => void;
}

function ControlIcon({ name }: { name: string }) {
  return <img className="pc-icon" src={`./ashen/ui/v5/${name}.png`} alt="" aria-hidden="true" draggable={false}/>;
}

/** Presentation only: the session and game own all wager validation and actions. */
export function GameControls(props: GameControlsProps) {
  const { t } = useTranslation();
  return <div className="hud-dock pact-controls pact-controls-v18">
    <footer className="control-bar" aria-label={t('Управление')}>
      <button className="buy-button pact-buy" aria-label={t('Покупка бонусов и усиления')} aria-haspopup="dialog" disabled={props.bonusDisabled} onClick={props.onBonus}>
        <ControlIcon name="bonus"/><b><span>{t('КУПИТЬ')}</span>{t('БОНУС')}</b>
      </button>
      <div className="hud-money-grid pact-money">
        <div className="balance-block pact-readout">
          <span className="pact-label">{t(props.replay?'ПОВТОР':'БАЛАНС')} <em>{props.currency}</em></span>
          <FitAmount>{props.balance}</FitAmount>
        </div>
        <div className={`win-block pact-readout ${props.winActive?'has-win':''}`}>
          <span className="pact-label">{t('ВЫИГРЫШ')}</span><FitAmount>{props.win}</FitAmount>
        </div>
        <div className="bet-controls pact-bet">
          <span className="pact-label">{t('СТАВКА')}{props.multiplier>1&&<em> · {props.multiplier}×</em>}</span>
          <div className="pact-bet-row">
            <button className="pact-bet-step" aria-label={t('Уменьшить ставку')} disabled={props.decreaseDisabled} onClick={props.onDecrease}>−</button>
            <button className="bet-selector" aria-label={t('СТАВКА')} aria-haspopup="dialog" disabled={props.betDisabled} onClick={props.onBet}>
              <span className="bet-stepper"><FitAmount>{props.bet}</FitAmount></span><ControlIcon name="down"/>
            </button>
            <button className="pact-bet-step" aria-label={t('Увеличить ставку')} disabled={props.increaseDisabled} onClick={props.onIncrease}>+</button>
          </div>
        </div>
      </div>
      <div className="hud-utilities pact-utilities">
        <button className="menu-button" disabled={props.operating} onClick={props.onMenu} aria-label={t('Открыть меню')}><ControlIcon name="menu"/><span>MENU</span></button>
        <button className={`turbo-button ${props.turbo?'active':''}`} disabled={props.turboDisabled} onClick={props.onTurbo} aria-label={t('Быстрые вращения')} aria-pressed={props.turbo}><ControlIcon name="turbo"/><span>TURBO</span></button>
        <button className={`auto-button ${props.autoCount?'active':''}`} disabled={props.autoDisabled} onClick={props.onAuto} aria-label={t(props.autoCount?'Остановить автовращения':'Автовращения')} aria-pressed={Boolean(props.autoCount)}><ControlIcon name="auto"/><span>{props.autoCount?`AUTO ${props.autoCount}`:'AUTO'}</span></button>
      </div>
      <button className={`spin-button pact-spin ${props.operating?'busy':''} ${props.autoCount?'auto-running':''}`} disabled={props.spinDisabled} onClick={props.onSpin} aria-label={props.spinLabel}>
        <ControlIcon name={props.autoCount?'stop':'spin'}/><b className="spin-caption">{t(props.autoCount?'СТОП':'Вращать')}</b>
      </button>
    </footer>
  </div>;
}
