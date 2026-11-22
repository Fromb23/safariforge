"use client";
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ContentBlock, MediaRecord, SafariPageDocument } from "@/types";
import { formatPageDate, pageDate } from "@/lib/page-date";

const numberLabel = (value: number) => String(value).padStart(2, "0");

export function Carousel({ ids, media }: { ids: string[]; media: Map<string, MediaRecord> }) {
  const valid = ids.filter((id) => media.has(id));
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const touch = useRef<number | null>(null);

  if (!valid.length) return null;

  const current = Math.min(index, valid.length - 1);
  const currentId = valid[current];
  const previous = () => setIndex((current - 1 + valid.length) % valid.length);
  const next = () => setIndex((current + 1) % valid.length);

  return (
    <div
      className="carousel"
      role="region"
      aria-roledescription="carousel"
      aria-label="Page image carousel"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          previous();
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          next();
        }
      }}
      onTouchStart={(event) => {
        touch.current = event.changedTouches[0].clientX;
      }}
      onTouchEnd={(event) => {
        if (touch.current === null) return;
        const delta = event.changedTouches[0].clientX - touch.current;
        touch.current = null;
        if (Math.abs(delta) > 40) (delta > 0 ? previous : next)();
      }}
    >
      <div className="carousel-viewport">
        {failed.has(currentId) ? (
          <div className="carousel-missing" role="img" aria-label={`${media.get(currentId)?.altText || "Image"} unavailable`}>
            Image unavailable
          </div>
        ) : (
          <img
            src={`/api/media/${currentId}/original`}
            alt={media.get(currentId)?.altText || ""}
            onError={() => setFailed((value) => new Set(value).add(currentId))}
          />
        )}
      </div>
      {valid.length > 1 && (
        <div className="carousel-controls">
          <div className="carousel-position" aria-live="polite">
            {numberLabel(current + 1)} / {numberLabel(valid.length)} <span>photos</span>
          </div>
          <div className="carousel-buttons">
            <button type="button" aria-label="Previous image" onClick={previous}>
              ←
            </button>
            <button type="button" aria-label="Next image" onClick={next}>
              →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ContentBlocks({ blocks, media }: { blocks: ContentBlock[]; media: Map<string, MediaRecord> }) {
  return (
    <>
      {blocks.map((block) => {
        if (block.type === "heading") return <h3 key={block.id}>{block.text}</h3>;
        if (block.type === "subtitle") return <p className="editorial-subtitle" key={block.id}>{block.text}</p>;
        if (block.type === "paragraph") return <p key={block.id}>{block.text}</p>;
        if (block.type === "list") return <ul key={block.id}>{block.items.filter(Boolean).map((value, index) => <li key={index}>{value}</li>)}</ul>;
        if (block.type === "facts") {
          return (
            <aside className="facts" key={block.id}>
              <h4>{block.title}</h4>
              <dl>{block.items.map((value, index) => <div key={index}><dt>{value.label}</dt><dd>{value.value}</dd></div>)}</dl>
            </aside>
          );
        }
        if (block.type === "carousel" || block.type === "imageGrid") return <Carousel key={block.id} ids={block.mediaIds} media={media} />;
        return <div key={block.id} className="image-grid">{block.mediaIds.map((id) => media.has(id) && <img key={id} src={`/api/media/${id}/original`} alt={media.get(id)?.altText || ""} />)}</div>;
      })}
    </>
  );
}

export function SafariPageSpread({
  page,
  media,
  id,
  hidePublicSubsectionLabel = false,
}: {
  page: SafariPageDocument;
  media: MediaRecord[];
  id?: string;
  hidePublicSubsectionLabel?: boolean;
}) {
  const map = useMemo(() => new Map(media.map((item) => [item.id, item])), [media]);
  const left = page.leftPanel;
  const canonicalDate = pageDate(left);
  const formattedDate = formatPageDate(canonicalDate);
  const showEyebrow = Boolean(left.eyebrow) && !(hidePublicSubsectionLabel && left.eyebrow?.trim().toUpperCase() === "A SUB SECTION");

  return (
    <article className="safari-spread" id={id}>
      <section className="spread-hero">
        {left.heroMediaId && map.has(left.heroMediaId) && <img src={`/api/media/${left.heroMediaId}/original`} alt={map.get(left.heroMediaId)?.altText || ""} style={{ objectPosition: left.objectPosition || "50% 50%" }} />}
        <div className="spread-shade" />
        <div className={`spread-copy ${left.overlayPosition || "bottom-left"}`}>
          {showEyebrow && <p>{left.eyebrow}</p>}
          <h2>{left.title}</h2>
          <span>{left.location}</span>
          {formattedDate && <time dateTime={canonicalDate}>{formattedDate}</time>}
        </div>
      </section>
      <section className="spread-story">
        <div className="spread-story-content">
          <ContentBlocks blocks={page.rightPanel.blocks} media={map} />
        </div>
      </section>
    </article>
  );
}

export function SafariJournalRenderer({ pages, media, preview = false }: { pages: Array<{ id: string; document: SafariPageDocument }>; media: MediaRecord[]; preview?: boolean }) {
  const sectionId = useCallback((id: string) => `page-${encodeURIComponent(id)}`, []);
  const idFromHash = useCallback(() => pages.find((page) => sectionId(page.id) === window.location.hash.slice(1))?.id, [pages, sectionId]);
  const [activeId, setActiveId] = useState(pages[0]?.id || "");
  const [contentsOpen, setContentsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const entryRefs = useRef(new Map<string, HTMLAnchorElement>());

  const closeContents = useCallback((restoreFocus = true) => {
    setContentsOpen(false);
    if (restoreFocus) window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  const syncFromLocation = useCallback(() => {
    const id = idFromHash();
    if (id) setActiveId(id);
    setContentsOpen(false);
  }, [idFromHash]);

  useEffect(() => {
    const initialSync = window.setTimeout(syncFromLocation, 0);
    window.addEventListener("hashchange", syncFromLocation);
    window.addEventListener("popstate", syncFromLocation);
    return () => {
      window.clearTimeout(initialSync);
      window.removeEventListener("hashchange", syncFromLocation);
      window.removeEventListener("popstate", syncFromLocation);
    };
  }, [syncFromLocation]);

  useEffect(() => {
    if (preview || typeof IntersectionObserver === "undefined") return;
    const visibility = new Map<string, IntersectionObserverEntry>();
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => visibility.set(entry.target.id, entry));
      const visible = [...visibility.values()]
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => Math.abs(a.boundingClientRect.top - window.innerHeight * 0.2) - Math.abs(b.boundingClientRect.top - window.innerHeight * 0.2));
      const id = visible[0] && pages.find((page) => sectionId(page.id) === visible[0].target.id)?.id;
      if (id) setActiveId(id);
    }, { rootMargin: "-18% 0px -80% 0px", threshold: 0 });
    pages.forEach((page) => {
      const section = document.getElementById(sectionId(page.id));
      if (section) observer.observe(section);
    });
    return () => observer.disconnect();
  }, [pages, preview, sectionId]);

  useEffect(() => {
    if (!contentsOpen) return;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeContents();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = [...panelRef.current.querySelectorAll<HTMLElement>('button, a[href], [tabindex]:not([tabindex="-1"])')].filter((item) => !item.hasAttribute("disabled"));
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [closeContents, contentsOpen]);

  useEffect(() => {
    if (!contentsOpen) return;
    const list = listRef.current, entry = entryRefs.current.get(activeId);
    if (!list || !entry) return;
    const listBounds = list.getBoundingClientRect(), entryBounds = entry.getBoundingClientRect();
    if (entryBounds.top < listBounds.top) list.scrollTop -= listBounds.top - entryBounds.top;
    else if (entryBounds.bottom > listBounds.bottom) list.scrollTop += entryBounds.bottom - listBounds.bottom;
  }, [activeId, contentsOpen]);

  const navigateTo = (id: string) => {
    const targetId = sectionId(id), target = document.getElementById(targetId);
    window.history.pushState(null, "", `#${targetId}`);
    setActiveId(id);
    closeContents();
    target?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  };

  if (!pages.length) return null;

  return (
    <div className={`journal ${preview ? "is-preview" : ""}`} id="top">
      <header className="journal-header">
        <a className="journal-brand" href="#top"><span className="brand-mark">SF</span><span>SafariForge</span></a>
        {!preview && <button ref={triggerRef} className="contents-button" type="button" aria-label="Open Table of Contents" aria-expanded={contentsOpen} aria-controls="journal-contents" onClick={() => setContentsOpen(true)}><span>Contents</span><i aria-hidden="true" /></button>}
      </header>
      {preview && <div className="preview-banner">Draft preview · visitors cannot see these changes</div>}
      {!preview && contentsOpen && <div className="contents-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeContents(); }}>
        <aside ref={panelRef} className="contents-panel" id="journal-contents" role="dialog" aria-modal="true" aria-labelledby="contents-heading">
          <header><h2 id="contents-heading">Table of Contents</h2><button ref={closeRef} type="button" aria-label="Close Table of Contents" onClick={() => closeContents()}>×</button></header>
          <ol ref={listRef}>{pages.map((page, index) => {
            const date = pageDate(page.document.leftPanel), formatted = formatPageDate(date), selected = activeId === page.id;
            return <li key={page.id}><a ref={(node) => { if (node) entryRefs.current.set(page.id, node); else entryRefs.current.delete(page.id); }} href={`#${sectionId(page.id)}`} aria-current={selected ? "location" : undefined} onClick={(event) => { event.preventDefault(); navigateTo(page.id); }}><span className="contents-number">{numberLabel(index + 1)}</span><span><strong>{page.document.leftPanel.title}</strong>{formatted && <time dateTime={date}>{formatted}</time>}</span></a></li>;
          })}</ol>
        </aside>
      </div>}
      <main>
        {pages.map((page) => <SafariPageSpread key={page.id} id={sectionId(page.id)} page={page.document} media={media} hidePublicSubsectionLabel={!preview} />)}
      </main>
    </div>
  );
}
