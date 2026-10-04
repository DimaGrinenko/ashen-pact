import { createContext, useContext, useEffect, useSyncExternalStore } from 'react';

export type Language = 'ru' | 'en';
export type TranslationParams = Record<string, string | number | boolean>;
export interface TranslationMessage { key: string; params?: TranslationParams }

/** Source-language keys keep all visible copy in one audited dictionary. */
export const english: Record<string, string> = {
  'Усиления основной игры':'Base-game boosts',
  'СТОП':'STOP',
  'Базовая ставка. Итоговая стоимость учитывает активное усиление.':'Base bet. The total spin cost includes the active boost.',
  'ДВЕ АЛЫЕ ПЕЧАТИ В КАЖДОМ ВРАЩЕНИИ':'TWO CRIMSON SEALS EVERY SPIN',
  'Eclipse: 10 вращений, две гарантированные алые печати в каждом. Стоимость списывается один раз. Договора нет.':'Eclipse: 10 free spins with two guaranteed crimson seals each spin. One-time cost. No pact offer.',
  'ECLIPSE PACT: отдельный бонус за 500×. 10 вращений без договора, две гарантированные алые печати в каждом вращении; возможна третья. Гарантия печатей не означает возврат стоимости бонуса.':'ECLIPSE PACT is a separate 500× bonus: 10 free spins, no pact, and two guaranteed crimson seals on every spin, with a possible third. Guaranteed seals do not guarantee recovery of the bonus cost.',
  'Подтвердить усиление':'Confirm boost', 'Подтвердить бонус':'Confirm bonus',
  'ЗА КАЖДОЕ ВРАЩЕНИЕ':'PER SPIN', 'ОДНОКРАТНАЯ СТОИМОСТЬ':'ONE-TIME COST',
  'Усиление действует на каждое следующее обычное вращение, пока вы его не отключите. Активация не запускает вращение.':'This boost applies to every following base spin until you turn it off. Activation does not start a spin.',
  'Стоимость будет списана один раз. Бонус начинается с 10 бесплатных вращений и предложения договора.':'The cost is deducted once. The bonus starts with 10 free spins and a pact offer.',
  'Выбор недоступен. Вернитесь к бонусам и проверьте сумму.':'This selection is unavailable. Return to bonuses and check the amount.',
  'ОТМЕНА':'CANCEL', 'ПОДТВЕРДИТЬ':'CONFIRM',
  'ПЕЧАТЬ ПРОБУЖДАЕТСЯ':'THE SEAL AWAKENS', 'СУДЬБА В ДВИЖЕНИИ':'FATE IN MOTION', 'ПОСЛЕДНИЙ ОБОРОТ':'THE FINAL TURN',
  'ПЕЧАТЬ РАСКРЫТА':'THE SEAL IS REVEALED', 'РИТУАЛ 67':'RITUAL 67', 'ПЕЧАТЬ {index} ИЗ {total}':'SEAL {index} OF {total}',
  'ПЕЧАТЬ ДУШИ':'SOUL SEAL', 'ПЕЧАТЬ КРОВИ':'BLOOD SEAL', 'ПЕЧАТЬ БОНУСА':'BONUS SEAL', 'УМНОЖЕНИЕ':'MULTIPLY', 'ДОБАВЛЕНИЕ':'ADD', 'СУММА РИТУАЛА':'RITUAL TOTAL',
  'Не удалось загрузить персонажа':'Unable to load the Keeper', 'Ошибка загрузки анимации':'Unable to load animation',
  'Управление':'Controls',
  'Кнопка SPIN или пробел запускают вращение. Кнопки −/+ меняют ставку; нажатие на сумму открывает список доступных ставок. При усилении BET показывает полную стоимость вращения, а окно выбора — базовую ставку. TURBO включает быстрый режим. AUTO открывает выбор количества и подтверждение автовращений; остановите серию кнопкой SPIN. MENU открывает настройки, звук и правила.':'Press SPIN or Space to spin. Use −/+ to change the bet, or tap the amount to open the available bet levels. With a boost active, BET shows the full spin cost; the picker shows the base bet. TURBO enables faster spins. AUTO opens the spin count and confirmation; stop the series with SPIN. MENU opens settings, sound and game rules.',
  'Часть функций может быть отключена правилами вашей сессии.':'Some controls may be disabled by your session rules.',
  'Десятка':'Ten', 'Валет':'Jack', 'Дама':'Queen', 'Король':'King', 'Туз':'Ace',
  'Сосуд душ':'Soul vessel', 'Череп':'Skull', 'Ворон':'Raven', 'Реликварий':'Reliquary', 'Рука судьбы':'Hand of fate',
  'Синяя печать':'Blue seal', 'Алая печать':'Crimson seal', 'Хранитель договора':'The Keeper', 'Дыхание собора':'Cathedral atmosphere',
  'Шторы ритуала':'Ritual curtains', 'Колесо договора':'Pact wheel', 'Большой выигрыш':'Big win', 'Живая рама':'Living frame',
  'Без выигрыша':'No win', 'Линии':'Line wins', 'Синее колесо':'Blue wheel', 'Алое колесо':'Crimson wheel', 'Два колеса':'Two wheels',
  'Первый бонус':'First bonus', 'Второй бонус':'Second bonus', 'Третий бонус':'Third bonus',
  'Закрыть окно':'Close dialog', 'Меню':'Menu', 'Настройки':'Settings', 'Правила и выплаты':'Rules and payouts',
  'Включить звук':'Unmute', 'Выключить звук':'Mute', 'Вернуться к игре':'Return to game',
  'Открыть меню':'Open menu', 'Открыть настройки':'Open settings', 'Открыть правила':'Open rules',
  'Звук и музыка':'Sound and music', 'Звук и атмосфера':'Sound and atmosphere', 'Анимация окружения':'Ambient animation',
  'Быстрые вращения':'Turbo spins', 'Язык интерфейса':'Interface language', 'Русский':'Russian',
  'ОТКРЫТЬ СТУДИЮ АНИМАЦИИ →':'OPEN ANIMATION STUDIO →', 'Правила и таблица выплат':'Rules and paytable',
  'Режим просмотра записанного раунда.':'Viewing a recorded round.',
  'Игровые ограничения и доступные суммы определяет сервер сессии.':'Session limits and available amounts are set by the server.',
  'Animation studio':'Animation studio', 'ПРОСМОТР АССЕТОВ':'ASSET VIEWER', 'Кости':'Bones', 'Скорость':'Speed', 'СЦЕНАРИИ ИГРЫ':'GAME SCENARIOS',
  'Spine 4.2 · отдельные растровые attachments · взвешенные mesh-вершины. Статический режим останавливает позу.':'Spine 4.2 · separate raster attachments · weighted mesh vertices. Static mode freezes the pose.',
  'clip.conjure':'Conjure', 'clip.ritual-sway':'Ritual sway', 'clip.bow':'Bow',
  'clip.close-blue':'Azure curtain closes', 'clip.open-blue':'Azure curtain opens', 'clip.close-red':'Crimson curtain closes', 'clip.open-red':'Crimson curtain opens',
  'clip.duel-cast':'Ritual strike', 'clip.welcome':'Welcome', 'clip.focus':'Focus', 'clip.guard':'Guard', 'clip.beckon':'Beckon', 'clip.celebrate':'Celebrate', 'clip.static':'Static', 'clip.idle':'Idle', 'clip.anticipation':'Anticipation', 'clip.cast':'Cast', 'clip.win':'Win', 'clip.loss':'Loss',
  'clip.bonus':'Bonus', 'clip.laugh':'Laugh', 'clip.close':'Close', 'clip.open':'Open', 'clip.drop':'Drop', 'clip.land':'Settle', 'clip.spin':'Spin', 'clip.win-seal':'Seal win',
  'ПЕПЕЛЬНЫЙ ДОГОВОР':'THE ASHEN PACT', 'ПРОБУЖДАЕМ ХРАНИТЕЛЯ':'AWAKENING THE KEEPER',
  'Не удалось загрузить изображения':'Artwork could not be loaded', 'Повторить загрузку':'Retry loading',
  'ДВЕ ПЕЧАТИ':'TWO SEALS', 'Синяя открывает ритуал.':'Blue unlocks the ritual.', 'Алая усиливает выигрыш.':'Crimson amplifies the win.',
  'ТРИ РИТУАЛА':'THREE RITUALS', '10 бесплатных вращений.':'10 free spins.', '10 бесплатных вращений':'10 free spins',
  'Три ступени силы.':'Three levels of power.', 'ПРЕДЕЛ СИЛЫ':'ULTIMATE POWER', 'Максимальный выигрыш':'Maximum win',
  'за весь раунд.':'across the entire round.', 'ВОЙТИ В СОБОР':'ENTER THE CATHEDRAL',
  '14 ЛИНИЙ · ДО 16 666×':'14 LINES · UP TO 16 666×', 'ВРАЩЕНИЙ':'SPINS',
  'Поле 5 барабанов и 4 ряда':'Reel grid: 5 reels and 4 rows', 'Скрыть сообщение':'Dismiss message',
  'Печать ждёт своего часа.':'The seal awaits its moment.', 'Договор вступает в силу…':'The pact is taking hold…', 'Пепельный договор открыт.':'The Ashen Pact is unlocked.',
  'Записанный раунд. Баланс и средства не изменяются.':'Recorded round. No balance or funds are changed.',
  'Продолжаем сохранённый серверный раунд.':'Resuming the saved server round.',
  'В результате отсутствует договор':'The result does not contain a pact.',
  'Договор повышен: {name}.':'Pact upgraded: {name}.', 'Ритуал: {count} вращений сохранено.':'Ritual: {count} spins kept.', 'Ритуал: {count} вращений.':'Ritual: {count} spins.',
  'Недостаточно средств. Уменьшите ставку или отключите усиление.':'Insufficient balance. Lower the bet or disable the boost.',
  'Недостаточно средств':'Insufficient balance', 'ОБЫЧНЫЙ РЕЖИМ':'STANDARD MODE', 'Обычный режим':'Standard mode',
  'СИНЯЯ ПЕЧАТЬ · РЕЖИМ СОХРАНЯЕТСЯ':'BLUE SEAL · MODE STAYS ACTIVE', 'АЛАЯ ПЕЧАТЬ · РЕЖИМ СОХРАНЯЕТСЯ':'CRIMSON SEAL · MODE STAYS ACTIVE',
  'БЕСПЛАТНОЕ ВРАЩЕНИЕ':'FREE SPIN', 'ЗАПИСАННЫЙ РАУНД':'RECORDED ROUND', 'СЛЕДУЮЩЕЕ ВРАЩЕНИЕ · {amount}':'NEXT SPIN · {amount}',
  'БОНУСЫ':'BONUSES', 'БОНУС':'BONUS', 'БАЛАНС':'BALANCE', 'ВЫИГРЫШ':'WIN', 'СТАВКА':'BET', 'СУММА ИГРЫ':'PLAY AMOUNT', 'АВТО · {count}':'AUTO · {count}',
  'Покупка бонусов и усиления':'Buy bonuses and boosts', 'Увеличить ставку':'Increase bet', 'Уменьшить ставку':'Decrease bet',
  'Вращать':'Spin', 'Остановить серию':'Stop autoplay', 'Завершить серверный раунд':'Complete server round',
  'Продолжить повтор':'Continue replay', 'Следующее бесплатное вращение':'Next free spin', 'Остановить автовращения':'Stop autoplay',
  'Автовращения':'Autoplay', 'Количество вращений':'Number of spins', 'Бесплатные вращения':'Free spins',
  'Цена одного вращения · {amount}':'Cost per spin · {amount}', 'НАЧАТЬ':'START',
  'Серию можно остановить кнопкой SPIN. Начатое вращение завершится.':'Stop autoplay with the SPIN button. A spin already in progress will finish.',
  'УПРАВЛЕНИЕ КНОПКОЙ ВРАЩЕНИЯ':'USE THE SPIN BUTTON', 'ПРОБЕЛ — ВРАЩАТЬ':'SPACE — SPIN',
  'ПОВТОР БЕЗ ОПЕРАЦИЙ СО СРЕДСТВАМИ':'REPLAY · NO FUNDS ARE MOVED', 'СЕРВЕРНЫЙ БАЛАНС':'SERVER BALANCE', 'ДЕМОНСТРАЦИОННЫЕ СРЕДСТВА':'DEMO CREDITS',
  'СЕССИЯ':'SESSION', 'ИЗМЕНЕНИЕ БАЛАНСА':'NET POSITION',
  'ТЕОРЕТИЧЕСКИЙ RTP: {rtp}':'THEORETICAL RTP: {rtp}', 'RTP: ЛОКАЛЬНОЕ ДЕМО':'RTP: LOCAL DEMO',
  'Теоретическая отдача за большое число раундов; не гарантируется в отдельном раунде или сессии.':'Theoretical return over a large number of rounds; not guaranteed in any individual round or session.',
  'ПОВТОР':'REPLAY', 'ПОВТОР ·':'REPLAY ·', 'УСЛОВНЫЕ ЕДИНИЦЫ':'REFERENCE UNITS',
  'Нормализованный повтор · условная сумма {amount} · результат {multiplier}×':'Normalized replay · reference amount {amount} · result {multiplier}×',
  'Сумма {amount} · выигрыш {payout}':'Amount {amount} · payout {payout}', 'ПОСМОТРЕТЬ ЗАНОВО':'WATCH AGAIN', 'С НАЧАЛА':'RESTART',
  'Бонусы и усиления':'Bonuses and boosts', 'УСИЛЕНИЕ ·':'BOOST ·', 'СИНЯЯ ПЕЧАТЬ':'BLUE SEAL', 'АЛАЯ ПЕЧАТЬ':'CRIMSON SEAL',
  'Повышенная частота колёс':'More frequent wheels', 'Алое колесо в каждом вращении':'A crimson wheel on every spin',
  'АКТИВНО':'ACTIVE', 'АКТИВИРОВАТЬ':'ACTIVATE', 'БОНУС ·':'BONUS ·', 'Синие и алые колёса':'Blue and crimson wheels', 'Только алые колёса':'Crimson wheels only',
  'КУПИТЬ':'BUY', 'Уменьшить ставку покупки':'Decrease bonus bet', 'Увеличить ставку покупки':'Increase bonus bet',
  'ОБЫЧНОЕ ВРАЩЕНИЕ':'STANDARD SPIN', 'Активна синяя печать':'Blue seal active', 'Активна алая печать':'Crimson seal active',
  '· Следующее вращение':'· Next spin', '. Усиление сохраняется до отключения.':'. The boost stays active until disabled.',
  'РИТУАЛ {tier}':'RITUAL {tier}', 'БЕСПЛАТНЫХ ВРАЩЕНИЙ':'FREE SPINS', 'СИНИЕ И АЛЫЕ ПЕЧАТИ':'BLUE AND CRIMSON SEALS',
  'ТОЛЬКО АЛЫЕ ПЕЧАТИ':'CRIMSON SEALS ONLY', 'АЛАЯ ПЕЧАТЬ В КАЖДОМ ВРАЩЕНИИ':'A CRIMSON SEAL ON EVERY SPIN', 'ПРОДОЛЖИТЬ →':'CONTINUE →',
  'Записанный договор':'Recorded pact', 'Цена силы':'The price of power', 'DEAL WITH THE KEEPER':'DEAL WITH THE KEEPER',
  'РАСКРЫТЬ ДОГОВОР →':'REVEAL THE PACT →', 'Сохраните':'Keep', 'вращений или примите договор.':'spins, or accept the pact.',
  'Колесо даст 5, 8, 12, 16, 20 вращений — либо ритуал выше.':'The wheel awards 5, 8, 12, 16 or 20 spins — or a ritual upgrade.',
  'СОХРАНИТЬ':'KEEP', 'ПРИНЯТЬ ДОГОВОР':'ACCEPT THE PACT', 'Ритуал выше':'Ritual upgraded', 'Договор сохранён':'Pact kept', 'Договор заключён':'Pact sealed',
  'ЗАПИСАННЫЙ РЕЗУЛЬТАТ':'RECORDED RESULT', 'THE KEEPER DECIDES':'THE KEEPER DECIDES', 'Печати вращаются…':'The seals are turning…',
  'УРОВЕНЬ {from} → {to}':'LEVEL {from} → {to}', 'Сохранено вращений: {count}':'Spins kept: {count}', 'Вращений для нового ритуала: {count}':'Spins for the new ritual: {count}',
  'RITUAL COMPLETE':'RITUAL COMPLETE', 'Сессия приостановлена':'Session paused', 'Загрузка повтора':'Loading replay', 'Подключение к сессии':'Connecting to session',
  'Проверяем авторизацию и серверный результат раунда.':'Checking authentication and the server round result.',
  'Восстановление проверит состояние принятого раунда и баланс.':'Recovery will check the accepted round and balance.', 'ВОССТАНОВИТЬ СЕССИЮ':'RECOVER SESSION',
  'Повтор загружается без операций с балансом.':'The replay loads without balance transactions.',
  'Результаты и баланс подтверждаются сервером сессии.':'Results and balance are confirmed by the session server.',
  'Серверный повтор договора уже записан в результате раунда. Здесь раскрывается записанное решение; выбор новой ветки недоступен.':'The pact decision is already recorded in the round result. This reveals that decision; a new branch cannot be selected.',
  'Книга договора':'The book of pacts', 'ПРАВИЛА И ВЫПЛАТЫ':'RULES AND PAYOUTS',
  '5 барабанов · 4 ряда · 14 постоянных линий. От 3 одинаковых символов слева направо. Выплачивается самая длинная комбинация на каждой линии.':'5 reels · 4 rows · 14 fixed paylines. Match at least 3 symbols from left to right. Only the longest combination pays on each line.',
  'Два цвета договора':'Two colors of the pact',
  'Печати выпадают на барабанах 1, 3 и 5: не более одной на барабан. Каждая открывает колесо. Значения обрабатываются слева направо: «+» добавляет выигрыш в ставках, «×» умножает накопленную сумму колёс. Первое умножение начинает с 1× ставки. Выигрыши по линиям добавляются отдельно.':'Seals appear on reels 1, 3 and 5, with at most one per reel. Each opens a wheel. Outcomes apply from left to right: “+” adds a win in bet multiples; “×” multiplies the accumulated wheel amount. An initial multiplier starts from 1× the bet. Payline wins are added separately.',
  '+5–100× · умножение ×2–10 · бонусная печать 67 · максимальный выигрыш.':'+5–100× · multipliers ×2–10 · bonus seal 67 · maximum win.',
  '+10–500× · умножение ×3–20 · максимальный выигрыш.':'+10–500× · multipliers ×3–20 · maximum win.',
  'Три ступени ритуала':'Three ritual levels',
  '1 / 2 / 3 бонусные печати 67 на синих колёсах открывают THE FIRST PACT / HELL UNBOUND / THE FINAL RITE. Каждый бонус начинается с 10 вращений. В первом есть синие и алые колёса; во втором — только алые; в третьем гарантировано хотя бы одно алое колесо в каждом вращении.':'1 / 2 / 3 bonus seals marked 67 on blue wheels unlock THE FIRST PACT / HELL UNBOUND / THE FINAL RITE. Each starts with 10 spins. The first has blue and crimson wheels; the second has only crimson wheels; the third guarantees at least one crimson wheel on every spin.',
  'Все значения колёс':'All wheel outcomes',
  'Синее: +5, +10, +15, +20, +25, +50, +100; ×2, ×3, ×4, ×5, ×10; бонус 67; MAX. Алое: +10, +15, +20, +25, +50, +100, +250, +500; ×3, ×4, ×5, ×10, ×15, ×20; MAX. Сектора показывают возможные исходы; их визуальный размер не обозначает вероятность выпадения.':'Blue: +5, +10, +15, +20, +25, +50, +100; ×2, ×3, ×4, ×5, ×10; bonus 67; MAX. Crimson: +10, +15, +20, +25, +50, +100, +250, +500; ×3, ×4, ×5, ×10, ×15, ×20; MAX. Sectors show possible outcomes; their visual size does not indicate outcome probability.',
  'В серверном раунде решение договора уже записано в результате. Кнопка раскрывает это решение; новая ветка на клиенте не выбирается.':'In a server round, the pact decision is already recorded in the result. The button reveals that decision; the client does not select a new branch.',
  'Перед первыми двумя бонусами можно сохранить 10 вращений или принять договор: получить 5, 8, 12, 16, 20 вращений либо повышение уровня. При повышении с первого до второго уровня доступен ещё один договор.':'Before the first two bonuses, keep 10 spins or accept a pact awarding 5, 8, 12, 16 or 20 spins, or an upgrade. An upgrade from the first to the second level offers another pact.',
  'Дополнительные вращения не начисляются за повторное выпадение печатей.':'Additional seals do not award extra spins.',
  'Максимальный выигрыш за весь оплаченный раунд, включая бонус, —':'The maximum win for the entire paid round, including any bonus, is',
  '16 666× базовой ставки':'16 666× the base bet',
  '. При достижении лимита раунд заканчивается. Стоимость усилений: синяя печать 10×, алая 50×; покупка бонусов 100×, 250× и 500×.':'. Reaching the cap ends the round. Boost costs: blue seal 10×, crimson seal 50×. Bonus purchases cost 100×, 250× and 500×.',
  '14 линий':'14 paylines', 'Режим сохраняется до отключения':'The mode stays active until disabled',
  'Синяя печать повышает частоту колёс за 10×. Алая печать гарантирует алое колесо за 50×. Выбранный режим действует во всех следующих обычных вращениях, пока вы не выберете «Обычное».':'Blue seal increases wheel frequency for 10×. Crimson seal guarantees a crimson wheel for 50×. The selected mode applies to all subsequent base spins until you select “Standard”.',
  'Игровая сумма':'Play amount', 'Цена':'Cost', 'следующего вращения показана постоянно под полем.':'of the next spin is always shown below the grid.',
  'Теоретический RTP':'Theoretical RTP',
  'Стоимость {cost}× базовой ставки':'Cost {cost}× the base bet',
  'RTP — теоретическая доля общей стоимости игр, возвращаемая в виде выигрышей на очень большом числе полных раундов. Он включает бонусные вращения и рассчитывается относительно полной стоимости выбранного режима. Это не гарантированный возврат за отдельный раунд или игровую сессию.':'RTP is the theoretical share of total play costs returned as winnings over a very large number of complete rounds. It includes bonus spins and is measured against the full cost of the selected mode. It is not a guaranteed return for an individual round or session.',
  'Локальная демонстрация использует собственные предварительные вероятности. Опубликованный RTP 96.00% не описывает эту демонстрацию.':'This local demo uses its own provisional probabilities. The published 96.00% RTP does not describe this demo.',
  'Работа игры':'Game operation',
  'Сбой аннулирует выигрыши и игровые операции. Для серверной игры необходимо стабильное соединение. При обрыве перезагрузите игру, чтобы завершить незаконченный раунд. Ожидаемая отдача оценивается по большому числу игр. Изображение условно и не представляет физическое устройство. В серверном режиме сумма выигрыша определяется ответом RGS, а не анимациями в браузере.':'Malfunctions void wins and plays. A stable connection is required for server play. If disconnected, reload the game to complete any unfinished round. Expected return is measured over a large number of plays. Graphics are illustrative and do not represent a physical device. In server mode, the payout is determined by the RGS response, not browser animations.',
};

const russianOverrides: Record<string,string> = {
  'clip.conjure':'Сотворение магии', 'clip.ritual-sway':'Ритуальный танец', 'clip.bow':'Поклон',
  'clip.close-blue':'Закрытие синей шторы', 'clip.open-blue':'Раскрытие синей шторы', 'clip.close-red':'Закрытие алой шторы', 'clip.open-red':'Раскрытие алой шторы',
  'Animation studio':'Студия анимации', 'DEAL WITH THE KEEPER':'ДОГОВОР С ХРАНИТЕЛЕМ', 'THE KEEPER DECIDES':'ВЫБОР ХРАНИТЕЛЯ', 'RITUAL COMPLETE':'РИТУАЛ ЗАВЕРШЁН',
  'clip.duel-cast':'Удар ритуала','clip.welcome':'Приветствие','clip.focus':'Внимание','clip.guard':'Защита','clip.beckon':'Приглашение','clip.celebrate':'Торжество','clip.static':'Статика','clip.idle':'Ожидание','clip.anticipation':'Предвкушение','clip.cast':'Заклинание','clip.win':'Выигрыш','clip.loss':'Поражение','clip.bonus':'Бонус','clip.laugh':'Смех','clip.close':'Закрытие','clip.open':'Открытие','clip.drop':'Падение','clip.spin':'Вращение','clip.win-seal':'Печать выигрыша',
};

export function resolveLanguage(url: string): Language {
  const params = new URL(url, 'http://localhost').searchParams;
  if (params.get('social') === 'true') return 'en';
  if (params.has('lang')) return params.get('lang')?.toLowerCase() === 'ru' ? 'ru' : 'en';
  return 'en';
}
/** Propagates a server-supplied Social Mode flag to nested dialogs and effects. */
export const SocialModeContext = createContext(false);
let language: Language = resolveLanguage(typeof window === 'undefined' ? 'http://localhost' : window.location.href);
const listeners = new Set<()=>void>();
const subscribe = (listener:()=>void) => {listeners.add(listener);return()=>{listeners.delete(listener);};};
export function setLanguage(next: Language): void {
  if (next === language) return;
  language = next;
  listeners.forEach(listener=>listener());
}

function socialCopy(text:string, locale:Language):string {
  if (locale==='en') return text.replace(/\bbonus purchases\b/gi,'bonus entries').replace(/\bpurchases\b/gi,'entries').replace(/\bpurchase\b/gi,'entry').replace(/\bpaid round\b/gi,'played round').replace(/\bbets\b/gi,'play amounts').replace(/\bbet\b/g,'play amount').replace(/\bBet\b/g,'Play amount').replace(/\bBET\b/g,'PLAY AMOUNT').replace(/\bBUY\b/g,'GET').replace(/\bBuy\b/g,'Get').replace(/\bbuy\b/g,'get').replace(/\bfunds\b/gi,'coins');
  return text.replace(/Покупка бонусов/g,'Получение бонусов').replace(/покупка бонусов/g,'получение бонусов').replace(/ставках/g,'игровых суммах').replace(/ставки/g,'игровой суммы').replace(/ставку/g,'игровую сумму').replace(/СТАВКА/g,'СУММА ИГРЫ').replace(/средств/g,'монет').replace(/средства/g,'монеты').replace(/оплаченный раунд/g,'игровой раунд').replace(/КУПИТЬ/g,'ПОЛУЧИТЬ').replace(/ставку покупки/g,'сумму бонуса');
}
export function translate(locale:Language,key:string,params:TranslationParams={},social=false):string {
  if (social) locale = 'en';
  if (key==='spin-win') {
    const count=Number(params.lines)||0;
    const form=count%100>=11&&count%100<=14?'линий':count%10===1?'линия':count%10>=2&&count%10<=4?'линии':'линий';
    return `${locale==='en'?'Win':'Выигрыш'} ${params.amount}${count?` · ${count} ${locale==='en'?(count===1?'line':'lines'):form}`:''}${params.ritual?locale==='en'?' · ritual':' · ритуал':''}`;
  }
  let value=locale==='en'?(english[key]??key):(russianOverrides[key]??key);
  if(social)value=socialCopy(value,locale);
  return value.replace(/\{(\w+)\}/g,(placeholder,name:string)=>params[name]===undefined?placeholder:String(params[name]));
}
export function useTranslation(social?: boolean) {
  const inheritedSocial=useContext(SocialModeContext);
  const socialMode=social??(inheritedSocial||typeof window !== 'undefined'&&new URLSearchParams(window.location.search).get('social')==='true');
  const selected=useSyncExternalStore(subscribe,()=>language,()=>language);
  const current=socialMode?'en':selected;
  useEffect(()=>{document.documentElement.lang=current;},[current]);
  return {language:current,setLanguage:(next:Language)=>setLanguage(socialMode?'en':next),t:(key:string,params?:TranslationParams)=>translate(current,key,params,socialMode)};
}

const errors:Record<string,[string,string]>={
  'Server rejected the round checkpoint':['Сервер отклонил сохранение позиции раунда.','The server rejected the round checkpoint.'],
  'Server rejected round settlement':['Сервер отклонил завершение раунда.','The server rejected round settlement.'],
  'Insufficient balance':['Недостаточно средств','Insufficient balance'],
  'Session expired. Reopen the game':['Сессия истекла. Откройте игру заново.','Session expired. Reopen the game.'],
  'Session not authenticated':['Сессия не авторизована. Откройте игру заново.','Session is not authenticated. Reopen the game.'],
  'Session limit reached':['Достигнут лимит сессии.','Session limit reached.'],
  'Game unavailable in this location':['Игра недоступна в этом регионе.','The game is unavailable in this location.'],
  'Server rejected play parameters':['Сервер отклонил параметры игры.','The server rejected the play parameters.'],
  'Server confirmation unavailable':['Нет подтверждения сервера. Восстановите сессию.','Server confirmation is unavailable. Recover the session.'],
  'Unconfirmed transaction. Reconnect to recover; do not repeat the play.':['Операция не подтверждена. Восстановите сессию; не повторяйте вращение.','Transaction unconfirmed. Recover the session; do not repeat the spin.'],
  'Could not read the server response':['Не удалось получить ответ сервера. Восстановите сессию.','Could not read the server response. Recover the session.'],
  'Another session operation is pending':['Дождитесь завершения текущей операции.','Wait for the current operation to finish.'],
  'Reconnect to recover the session before continuing':['Восстановите сессию перед продолжением.','Recover the session before continuing.'],
  'Incompatible session data; game paused':['Данные сессии несовместимы с этой версией. Игра приостановлена.','Session data is incompatible with this version. The game is paused.'],
  'Server returned an incompatible result. Reconnect to recover.':['Сервер вернул несовместимый результат. Восстановите сессию.','The server returned an incompatible result. Recover the session.'],
  'Replay is unavailable or incompatible with ASHEN PACT':['Повтор недоступен или несовместим с ASHEN PACT.','The replay is unavailable or incompatible with ASHEN PACT.'],
  'Server does not allow this play amount':['Эта сумма недоступна для сессии.','This play amount is unavailable for the session.'],
  'Server does not allow this mode':['Этот режим недоступен для сессии.','This mode is unavailable for the session.'],
  'Feature modes are disabled for this session':['Усиления отключены для этой сессии.','Boosts are disabled for this session.'],
  'Complete the current round first':['Сначала завершите текущий раунд.','Complete the current round first.'],
  'Bet is locked during a bonus':['Сумма зафиксирована до завершения бонуса.','The amount is locked until the bonus ends.'],
  'Feature mode is locked during a bonus':['Режим зафиксирован до завершения бонуса.','The mode is locked until the bonus ends.'],
  'No free spins remaining':['Бесплатные вращения закончились.','No free spins remain.'],
  'Resolve the pact offer before spinning':['Сначала завершите договор.','Resolve the pact before spinning.'],
  'A bonus is already active':['Бонус уже активен.','A bonus is already active.'],
};
const sessionErrors:Record<string,string>={
  'Не удалось получить подтверждение сервера':'Server confirmation is unavailable. Recover the session.',
  'Некорректная ссылка сессии: необходимы sessionID и rgs_url':'Invalid session link. Reopen the game from its launch page.',
  'Неполная ссылка повтора: необходим полный набор параметров replay':'Incomplete replay link. Open a complete replay link.',
  'Операция сессии уже выполняется':'A session operation is already in progress.',
  'Дождитесь завершения текущей операции':'Wait for the current operation to finish.',
  'Локальная игра не использует серверную сессию':'The local demo does not use a server session.',
  'Восстановите серверную сессию перед продолжением':'Recover the server session before continuing.',
  'Повтор завершён. Начните его заново для просмотра':'The replay has ended. Restart it to watch again.',
  'В серверном раунде нет ожидающего договора':'No pact decision is pending in this server round.',
  'Серверный повтор не загружен':'The server replay has not loaded.',
  'Дождитесь завершения текущего показа':'Wait for the current presentation to finish.',
};
export function translateError(error:string,locale:Language,social=false):string {
  if (social) locale = 'en';
  const key=error.replace(/^Error:\s*/,''),known=errors[key];
  let text=known?known[locale==='ru'?0:1]:sessionErrors[key]?(locale==='ru'?key:sessionErrors[key]):english[key]?(locale==='ru'?key:english[key]):'';
  if(!text&&/launch|replay flag|replay amount|session link|RGS endpoint|RGS requires HTTPS|sessionID|rgs_url/i.test(key))text=locale==='ru'?'Некорректная ссылка запуска. Откройте игру заново с исходной страницы.':'Invalid launch link. Reopen the game from its launch page.';
  if(!text)text=locale==='ru'?'Игра приостановлена: не удалось подтвердить результат. Восстановите сессию или перезагрузите игру.':'Game paused: the result could not be confirmed. Recover the session or reload the game.';
  return social?socialCopy(text,locale):text;
}
