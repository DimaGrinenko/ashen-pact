import { RASTER_GLYPHS } from './rasterGlyphs';

const atlasUrl = `${import.meta.env.BASE_URL}ashen/ui/numerals-v9.webp`;
const aliases: Record<string,string> = { '-':'−', 'x':'×' };
const cache = new WeakMap<HTMLElement,{ text:HTMLElement; visual:HTMLElement; current:string; tabular:boolean }>();

/** Reuse glyph nodes during count-up; the exact formatted amount remains selectable and accessible. */
export function writeRasterNumber(host:HTMLElement, value:string, tabular=false) {
  let state = cache.get(host);
  if (!state) {
    const text = document.createElement('i'), visual = document.createElement('i');
    text.className = 'raster-number-text';
    visual.className = 'raster-number-visual'; visual.setAttribute('aria-hidden','true');
    host.replaceChildren(text,visual);
    // CSS custom-property URLs resolve at the consuming stylesheet in production.
    // Anchor to the document first so /assets/*.css and CDN subpaths both work.
    host.style.setProperty('--number-atlas',`url("${new URL(atlasUrl,document.baseURI).href}")`);
    state = { text,visual,current:'',tabular }; cache.set(host,state);
  }
  if (value === state.current && tabular === state.tabular) return;
  state.current = value; state.tabular = tabular; state.text.textContent = value;
  const characters = Array.from(value);
  while (state.visual.childElementCount > characters.length) state.visual.lastElementChild?.remove();
  characters.forEach((character,index) => {
    let node = state!.visual.children[index] as HTMLElement | undefined;
    if (!node) { node = document.createElement('i'); state!.visual.append(node); }
    if (node.dataset.char === character && node.dataset.tabular === String(tabular)) return;
    node.dataset.char = character; node.dataset.tabular = String(tabular);
    const glyph = RASTER_GLYPHS[aliases[character] || character];
    node.className = `raster-glyph ${glyph ? 'painted-glyph' : 'type-glyph'}`;
    node.style.width = glyph ? `${tabular && /[0-9]/.test(character) ? .73 : glyph.advance}em` : '';
    node.style.setProperty('--glyph-x',glyph ? `${(glyph.index%4)*100/3}%` : '0%');
    node.style.setProperty('--glyph-y',glyph ? `${Math.floor(glyph.index/4)*100/3}%` : '0%');
  });
}
