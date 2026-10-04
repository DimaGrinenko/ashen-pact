import { useLayoutEffect, useRef } from 'react';
import { RasterNumber } from './RasterNumber';
import './fit-amount.css';

/** Preserve every currency digit while fitting the actual width of its HUD column. */
export function FitAmount({ children, className = '' }: { children: string; className?: string }) {
  const host = useRef<HTMLElement>(null);
  const value = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const outer = host.current, inner = value.current;
    if (!outer || !inner) return;
    let frame = 0, disposed = false;
    const fit = () => {
      if (disposed || outer.clientWidth === 0) return;
      const base = Number.parseFloat(getComputedStyle(outer).fontSize);
      inner.style.fontSize = `${base}px`;
      outer.dataset.compact=String(base<28);
      let natural = inner.getBoundingClientRect().width;
      let ratio = Math.min(1, (outer.clientWidth - 1) / Math.max(1, natural));
      // Keep currency punctuation clear when the painted bevel would be subpixel.
      if(base*ratio<26&&outer.dataset.compact!=='true'){
        outer.dataset.compact='true';natural=inner.getBoundingClientRect().width;
        ratio=Math.min(1,(outer.clientWidth-1)/Math.max(1,natural));
      }
      inner.style.fontSize = `${Math.floor(base * ratio * 100) / 100}px`;
      outer.dataset.fitted = String(ratio < .999);
    };
    const queue = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(fit); };
    const observer = new ResizeObserver(queue);
    observer.observe(outer);
    fit();
    void document.fonts.ready.then(queue);
    window.addEventListener('resize', queue);
    return () => { disposed = true; observer.disconnect(); cancelAnimationFrame(frame); window.removeEventListener('resize', queue); };
  }, [children]);
  return <strong ref={host} className={`fit-amount ${className}`}><span ref={value}><RasterNumber tabular>{children}</RasterNumber></span></strong>;
}
