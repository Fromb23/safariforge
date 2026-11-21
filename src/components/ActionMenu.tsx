"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

const OPEN_EVENT = "safariforge:action-menu-open";

export function ActionMenu({ label = "Actions", children }: { label?: string; children: React.ReactNode }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  const place = () => {
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect) return;
    const width = 224;
    const gap = 6;
    const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
    const roomBelow = window.innerHeight - rect.bottom;
    const estimatedHeight = Math.min(menu.current?.offsetHeight || 320, window.innerHeight - 16);
    const top = roomBelow >= estimatedHeight + gap ? rect.bottom + gap : Math.max(8, rect.top - estimatedHeight - gap);
    setPosition({ top, left });
  };

  const close = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) requestAnimationFrame(() => trigger.current?.focus());
  };

  const toggle = () => {
    if (open) close();
    else {
      window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: id }));
      setOpen(true);
    }
  };

  useEffect(() => {
    if (!open) return;
    place();
    requestAnimationFrame(() => menu.current?.querySelector<HTMLElement>('a[href],button:not(:disabled),[tabindex="0"]')?.focus());
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!trigger.current?.contains(target) && !menu.current?.contains(target)) close();
    };
    const another = (event: Event) => { if ((event as CustomEvent<string>).detail !== id) close(); };
    const reposition = () => place();
    document.addEventListener("pointerdown", outside);
    window.addEventListener(OPEN_EVENT, another);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener(OPEN_EVENT, another);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [id, open]);

  const keyboard = (event: React.KeyboardEvent) => {
    const items = [...(menu.current?.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),[tabindex="0"]') || [])];
    const current = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === "Escape") { event.preventDefault(); close(true); return; }
    if (event.key === "Tab") return;
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : event.key === "ArrowDown" ? (current + 1) % items.length : (current - 1 + items.length) % items.length;
    items[next]?.focus();
  };

  return <div className="action-menu">
    <button ref={trigger} type="button" className="action-menu-trigger" aria-haspopup="menu" aria-expanded={open} aria-controls={`${id}-menu`} onClick={toggle}>{label}</button>
    {open && createPortal(<div ref={menu} id={`${id}-menu`} className="action-menu-popover" role="menu" style={position} onKeyDown={keyboard} onClick={(event) => {
      const target = (event.target as HTMLElement).closest("a,button") as HTMLButtonElement | HTMLAnchorElement | null;
      if (target && !(target instanceof HTMLButtonElement && target.disabled)) close();
    }}>{children}</div>, document.body)}
  </div>;
}
