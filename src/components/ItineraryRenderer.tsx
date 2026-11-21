"use client";
/* eslint-disable @next/next/no-img-element -- private originals are served through session-checked, no-store routes */
import { useEffect, useMemo, useRef, useState } from "react";
import type { ItineraryDocument, MediaRecord, ContentBlock } from "@/types";

function formatDate(start?: string, end?: string) {
  if (!start) return "";
  const f = (v: string) =>
    new Intl.DateTimeFormat("en", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${v}T00:00:00Z`));
  return end && end !== start ? `${f(start)} — ${f(end)}` : f(start);
}
function MediaImage({
  id,
  media,
  className,
  onClick,
}: {
  id: string;
  media: Map<string, MediaRecord>;
  className?: string;
  onClick?: () => void;
}) {
  const item = media.get(id);
  if (!item)
    return (
      <div className={`${className || ""} image-missing`}>
        Image unavailable
      </div>
    );
  return (
    <button
      className={`image-button ${className || ""}`}
      onClick={onClick}
      aria-label={
        onClick ? `Open ${item.altText || item.originalName}` : undefined
      }
      tabIndex={onClick ? 0 : -1}
    >
      <img
        src={`/api/media/${id}/original`}
        alt={item.altText || item.originalName}
      />
    </button>
  );
}
function Carousel({
  ids,
  media,
  onOpen,
}: {
  ids: string[];
  media: Map<string, MediaRecord>;
  onOpen: (id: string) => void;
}) {
  const valid = ids.filter((id) => media.has(id));
  const [index, setIndex] = useState(0);
  const touch = useRef<number | null>(null);
  if (!valid.length) return null;
  const current = Math.min(index, valid.length - 1);
  const move = (delta: number) =>
    setIndex((current + delta + valid.length) % valid.length);
  return (
    <div
      className="carousel"
      role="region"
      aria-label="Section image carousel"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") move(-1);
        if (event.key === "ArrowRight") move(1);
      }}
      onTouchStart={(event) => {
        touch.current = event.touches[0].clientX;
      }}
      onTouchEnd={(event) => {
        if (touch.current === null) return;
        const delta = event.changedTouches[0].clientX - touch.current;
        if (Math.abs(delta) > 45) move(delta > 0 ? -1 : 1);
        touch.current = null;
      }}
    >
      <MediaImage
        id={valid[current]}
        media={media}
        onClick={() => onOpen(valid[current])}
      />
      {valid.length > 1 && (
        <>
          <button
            className="carousel-prev"
            aria-label="Previous image"
            onClick={() => move(-1)}
          >
            ←
          </button>
          <button
            className="carousel-next"
            aria-label="Next image"
            onClick={() => move(1)}
          >
            →
          </button>
          <div className="carousel-position" aria-live="polite">
            {current + 1} / {valid.length}
          </div>
          <div className="carousel-dots">
            {valid.map((id, i) => (
              <button
                key={id}
                className={i === current ? "active" : ""}
                aria-label={`Show image ${i + 1}`}
                onClick={() => setIndex(i)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
function Block({
  block,
  media,
  onOpen,
}: {
  block: ContentBlock;
  media: Map<string, MediaRecord>;
  onOpen: (id: string) => void;
}) {
  if (block.type === "heading")
    return block.text.trim() ? <h3>{block.text}</h3> : null;
  if (block.type === "paragraph")
    return block.text.trim() ? <p>{block.text}</p> : null;
  if (block.type === "list")
    return block.items.some((item) => item.trim()) ? (
      <ul>
        {block.items
          .filter((item) => item.trim())
          .map((item, i) => (
            <li key={i}>{item}</li>
          ))}
      </ul>
    ) : null;
  if (block.type === "facts")
    return block.items.length ? (
      <aside className="facts">
        <h4>{block.title}</h4>
        <dl>
          {block.items.map((fact, i) => (
            <div key={i}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      </aside>
    ) : null;
  if (block.type === "carousel")
    return <Carousel ids={block.mediaIds} media={media} onOpen={onOpen} />;
  return block.mediaIds.length ? (
    <div className={block.type === "gallery" ? "gallery" : "image-grid"}>
      {block.mediaIds.map((id) => (
        <MediaImage key={id} id={id} media={media} onClick={() => onOpen(id)} />
      ))}
    </div>
  ) : null;
}
export function ItineraryRenderer({
  document,
  media,
  preview = false,
}: {
  document: ItineraryDocument;
  media: MediaRecord[];
  preview?: boolean;
}) {
  const sections = useMemo(
    () =>
      document.sections
        .map((section, index) => ({ section, index }))
        .sort(
          (a, b) =>
            (a.section.startDate || "9999-12-31").localeCompare(
              b.section.startDate || "9999-12-31",
            ) ||
            a.index - b.index ||
            a.section.id.localeCompare(b.section.id),
        )
        .map((item) => item.section),
    [document.sections],
  );
  const mediaMap = useMemo(() => new Map(media.map((m) => [m.id, m])), [media]);
  const [active, setActive] = useState(sections[0]?.id || "");
  const [drawer, setDrawer] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const refs = useRef(new Map<string, HTMLElement>());
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible)
          setActive((visible.target as HTMLElement).dataset.section || "");
      },
      { rootMargin: "-20% 0px -55%", threshold: [0, 0.2, 0.5, 0.8] },
    );
    refs.current.forEach((el) => observer.observe(el));
    const hash = decodeURIComponent(location.hash.slice(1));
    if (hash && sections.some((s) => s.id === hash))
      queueMicrotask(() => setActive(hash));
    return () => observer.disconnect();
  }, [sections]);
  useEffect(() => {
    if (!lightbox) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
    };
    const body = globalThis.document.body;
    body.classList.add("modal-open");
    window.addEventListener("keydown", handler);
    return () => {
      body.classList.remove("modal-open");
      window.removeEventListener("keydown", handler);
    };
  }, [lightbox]);
  const current = sections.find((s) => s.id === active) || sections[0];
  return (
    <div className={`journal ${preview ? "is-preview" : ""}`}>
      <header className="journal-header">
        <a className="journal-brand" href={preview ? "/admin" : "#top"}>
          <span className="brand-mark">SF</span>
          <span>SafariForge</span>
        </a>
        <button
          className="contents-button"
          onClick={() => setDrawer(true)}
          aria-expanded={drawer}
          aria-controls="trip-contents"
        >
          <span>Trip contents</span>
          <i />
        </button>
      </header>
      {preview && (
        <div className="preview-banner">
          Draft preview · travelers cannot see these changes
        </div>
      )}
      <div className="journal-intro" id="top">
        <p className="eyebrow">Prepared for {document.travelerName}</p>
        <h1>{document.title}</h1>
        <p>{document.subtitle}</p>
        <time>{formatDate(document.startDate, document.endDate)}</time>
      </div>
      <main className="reader">
        <aside className="desktop-stage" aria-live="polite">
          {current?.heroMediaId ? (
            <MediaImage
              id={current.heroMediaId}
              media={mediaMap}
              className="stage-image"
            />
          ) : (
            <div className="stage-image image-missing" />
          )}
          <div className="stage-shade" />
          <div className="stage-copy">
            <p>{formatDate(current?.startDate, current?.endDate)}</p>
            <h2>{current?.title}</h2>
            <span>{current?.location}</span>
          </div>
        </aside>
        <div className="section-stream">
          {sections.map((section, index) => (
            <article
              id={section.id}
              data-section={section.id}
              key={section.id}
              ref={(el) => {
                if (el) refs.current.set(section.id, el);
                else refs.current.delete(section.id);
              }}
              className="story-section"
            >
              <div className="mobile-hero">
                {section.heroMediaId && (
                  <MediaImage id={section.heroMediaId} media={mediaMap} />
                )}
                <div>
                  <p>{formatDate(section.startDate, section.endDate)}</p>
                  <h2>{section.title}</h2>
                  <span>{section.location}</span>
                </div>
              </div>
              <p className="section-number">
                {String(index + 1).padStart(2, "0")} ·{" "}
                {section.location || "On safari"}
              </p>
              {section.blocks.map((block) => (
                <Block
                  key={block.id}
                  block={block}
                  media={mediaMap}
                  onOpen={setLightbox}
                />
              ))}
            </article>
          ))}
        </div>
      </main>
      <div
        className={`drawer-scrim ${drawer ? "open" : ""}`}
        onClick={() => setDrawer(false)}
      />
      <aside
        id="trip-contents"
        className={`contents-drawer ${drawer ? "open" : ""}`}
        aria-hidden={!drawer}
      >
        <button
          className="drawer-close"
          onClick={() => setDrawer(false)}
          aria-label="Close trip contents"
        >
          Close
        </button>
        <p className="eyebrow">Your journey</p>
        <h2>Trip contents</h2>
        <nav>
          {sections.map((s, i) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className={active === s.id ? "active" : ""}
              onClick={() => {
                setActive(s.id);
                setDrawer(false);
              }}
            >
              <span>{String(i + 1).padStart(2, "0")}</span>
              <b>{s.title}</b>
              <small>{s.location}</small>
            </a>
          ))}
        </nav>
      </aside>
      {lightbox && (
        <div
          className="lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Gallery image"
        >
          <button autoFocus onClick={() => setLightbox(null)}>
            Close image
          </button>
          <img
            src={`/api/media/${lightbox}/original`}
            alt={mediaMap.get(lightbox)?.altText || "Safari photograph"}
          />
        </div>
      )}
    </div>
  );
}
