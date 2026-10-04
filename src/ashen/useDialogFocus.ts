import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

const openers = new WeakMap<HTMLElement, HTMLElement>();

export function useDialogFocus<T extends HTMLElement>(host: RefObject<T | null>, focusKey: string, onClose?: () => void) {
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  const controls = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('button:not(:disabled),select:not(:disabled),input:not(:disabled),a[href],[tabindex="0"]')]
    .filter(el => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden');
  useEffect(() => {
    const root = host.current, before = document.activeElement as HTMLElement | null;
    if (!root) return;
    const app = root.closest<HTMLElement>('.ashen-app') ?? document.body;
    if (!openers.get(app)?.isConnected && before && before !== document.body && !root.contains(before)) openers.set(app, before);
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && close.current) { event.preventDefault(); close.current(); }
      if (event.key !== 'Tab') return;
      const items = controls(root), first = items[0], last = items.at(-1);
      if (!first || !last) { event.preventDefault(); root.focus({preventScroll:true}); return; }
      if (!root.contains(document.activeElement) || event.shiftKey && document.activeElement === first || !event.shiftKey && document.activeElement === last) {
        event.preventDefault(); (event.shiftKey ? last : first).focus({preventScroll:true});
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      // A replacement panel keeps the original HUD opener through the chain.
      if (app.querySelector('[role="dialog"]')) return;
      const opener = openers.get(app);
      const fallback = app.querySelector<HTMLElement>('.menu-button:not(:disabled)');
      if (opener?.isConnected && !opener.closest('[inert]')) opener.focus({preventScroll:true});
      else fallback?.focus({preventScroll:true});
      openers.delete(app);
    };
  }, [host]);
  useEffect(() => {
    const root = host.current;
    if (root) (controls(root)[0] ?? root).focus({preventScroll:true});
  }, [host, focusKey]);
}
