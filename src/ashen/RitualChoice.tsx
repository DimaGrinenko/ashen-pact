import { useId } from 'react';
import type { ReactNode } from 'react';
import { FitAmount } from './FitAmount';
import { SpineView } from './SpineView';
import { useTranslation } from './i18n';
import './ritual-choice.css';

export type RitualTier = 1 | 2 | 3;
export interface RitualChoiceProps {
  betCents: number;
  balanceCents: number;
  costs: Readonly<Record<RitualTier, number>>;
  names: Readonly<Record<RitualTier, string>>;
  /** Effective session registry: game modes, narrowed by explicit server metadata. */
  availableModes?: readonly string[];
  money: (cents: number) => string;
  onChoose: (tier: RitualTier) => void;
  motion: boolean;
  disabled?: boolean;
  social?: boolean;
  publishedMath?: boolean;
  artwork?: Partial<Record<RitualTier, string>>;
  children?: ReactNode;
}

/** Selecting a ritual opens the caller's confirmation. It never starts a round. */
export function RitualChoice({ betCents, balanceCents, costs, names, availableModes, money,
  onChoose, motion, disabled = false, social = false, publishedMath = true, artwork, children }: RitualChoiceProps) {
  const { language } = useTranslation(social);
  const prefix = useId();
  const en = language === 'en';
  const copy = en ? {
    intro: 'Three paths through the rift. Choose a ritual, then confirm its full cost.',
    free: '10 FREE SPINS', startingFree: 'STARTS WITH 10 FREE SPINS', select: 'SELECT RITUAL', total: social ? 'PLAY AMOUNT' : 'ONE-TIME COST',
    unavailable: 'Unavailable in this session', funds: 'Insufficient balance', next: 'Confirmation follows',
    rtp: 'THEORETICAL RTP 96.00%', demo: 'LOCAL DEMONSTRATION', max: social ? 'MAX WIN 16,666× PLAY AMOUNT' : 'MAX WIN 16,666× BASE BET',
    foot: 'Every ritual has its own fixed rules. Your selection is made before the round starts.',
    rules: [
      ['Azure and crimson seals', 'A recorded pact may change the spin count or ritual tier'],
      ['Crimson seals only', 'A recorded pact may change the spin count or ritual tier'],
      ['Two guaranteed crimson seals each spin', 'Starts at the highest ritual. No pact'],
    ],
  } : {
    intro: 'Три пути сквозь разлом. Выберите ритуал и подтвердите его полную стоимость.',
    free: '10 БЕСПЛАТНЫХ ВРАЩЕНИЙ', startingFree: 'ВНАЧАЛЕ 10 БЕСПЛАТНЫХ ВРАЩЕНИЙ', select: 'ВЫБРАТЬ РИТУАЛ', total: 'ОДНОКРАТНАЯ СТОИМОСТЬ',
    unavailable: 'Недоступно в этой сессии', funds: 'Недостаточно средств', next: 'Далее — подтверждение',
    rtp: 'ТЕОРЕТИЧЕСКИЙ RTP 96.00%', demo: 'ЛОКАЛЬНАЯ ДЕМОНСТРАЦИЯ', max: 'МАКС. ВЫИГРЫШ 16 666× БАЗОВОЙ СТАВКИ',
    foot: 'У каждого ритуала свои фиксированные правила. Выбор происходит до начала раунда.',
    rules: [
      ['Синие и алые печати', 'Записанный договор может изменить число вращений или уровень'],
      ['Только алые печати', 'Записанный договор может изменить число вращений или уровень'],
      ['Две гарантированные алые печати в каждом вращении', 'Высший ритуал с начала. Без договора'],
    ],
  };

  return <div className="ritual-choice" data-motion={motion}>
    <p className="ritual-choice-intro">{copy.intro}</p>
    <div className="ritual-choice-cards">
      {([1, 2, 3] as const).map(tier => {
        const cost = betCents * costs[tier];
        const offered = !availableModes || availableModes.includes(`bonus${tier}`);
        const apiCost = cost * 10000;
        const affordable = Number.isSafeInteger(Math.round(apiCost)) && Math.abs(apiCost - Math.round(apiCost)) < 1e-4 && cost > 0 && cost <= balanceCents;
        const unavailable = disabled || !offered || !affordable;
        const descriptionId = `${prefix}-ritual-${tier}`;
        return <article className={`ritual-choice-card ritual-choice-tier-${tier}`} key={tier} data-ritual={tier}>
          <div className="ritual-choice-art" aria-hidden="true">
            <div className="ritual-choice-plate-window">
              <img className="ritual-choice-plate" src={artwork?.[tier] ?? `./ashen/ui/v19/ritual-${tier}.webp`} alt="" draggable={false} />
            </div>
            <span className="ritual-choice-order">{['I', 'II', 'III'][tier - 1]}</span>
            <div className="ritual-choice-seal"><SpineView id={tier === 1 ? 'blue-six' : 'red-six'} paused={!motion} />
              {tier === 3 && <SpineView id="red-six" paused={!motion} />}</div>
          </div>
          <div className="ritual-choice-copy">
            <span className="ritual-choice-spins">{tier === 3 ? copy.free : copy.startingFree}</span>
            <h3>{names[tier]}</h3>
            <ul id={descriptionId}>{copy.rules[tier - 1].map(rule => <li key={rule}>{rule}</li>)}</ul>
            <div className="ritual-choice-cost"><span>{copy.total} · {costs[tier]}×</span><FitAmount>{money(cost)}</FitAmount></div>
            <button className="primary ritual-choice-select" disabled={unavailable} aria-describedby={descriptionId}
              aria-label={`${copy.select}: ${names[tier]}, ${money(cost)}`} onClick={() => { if (!unavailable) onChoose(tier); }}>
              {copy.select}<span aria-hidden="true">→</span>
            </button>
            <small className="ritual-choice-status">{!offered ? copy.unavailable : !affordable ? copy.funds : copy.next}</small>
          </div>
        </article>;
      })}
    </div>
    <div className="ritual-choice-meta"><span>{publishedMath ? copy.rtp : copy.demo}</span><span>{copy.max}</span></div>
    <p className="ritual-choice-disclosure">{copy.foot}</p>
    {children}
  </div>;
}
