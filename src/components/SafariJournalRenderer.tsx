"use client";
/* eslint-disable @next/next/no-img-element */
import { useMemo, useRef, useState } from "react";
import type { ContentBlock, MediaRecord, SafariPageDocument } from "@/types";
function dates(start?: string, end?: string) {
  if (!start) return "";
  const show = (v: string) =>
    new Intl.DateTimeFormat("en", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${v}T00:00:00Z`));
  return end && end !== start ? `${show(start)} — ${show(end)}` : show(start);
}
export function Carousel({ ids, media }: { ids: string[]; media: Map<string, MediaRecord> }) {
  const valid = ids.filter((id) => media.has(id)),
    [index, setIndex] = useState(0),
    [failed, setFailed] = useState<Set<string>>(() => new Set()),
    touch = useRef<number | null>(null);
  if (!valid.length) return null;
  const current = Math.min(index, valid.length - 1),
    currentId = valid[current],
    previous = () => setIndex((current - 1 + valid.length) % valid.length),
    next = () => setIndex((current + 1) % valid.length);
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
      {failed.has(currentId) ? (
        <div className="carousel-missing" role="img" aria-label={`${media.get(currentId)?.altText || "Image"} unavailable`}>
          Image unavailable
        </div>
      ) : (
        <img src={`/api/media/${currentId}/original`} alt={media.get(currentId)?.altText || ""} onError={() => setFailed((value) => new Set(value).add(currentId))} />
      )}{" "}
      {valid.length > 1 && (
        <>
          <button className="carousel-prev" type="button" aria-label="Previous image" onClick={previous}>
            ←
          </button>
          <button className="carousel-next" type="button" aria-label="Next image" onClick={next}>
            →
          </button>
          <div className="carousel-position" aria-live="polite">
            {current + 1} / {valid.length}
          </div>
        </>
      )}
    </div>
  );
}
export function ContentBlocks({ blocks, media }: { blocks: ContentBlock[]; media: Map<string, MediaRecord> }) {
  return (
    <>
      {blocks.map((block) => {
        if (block.type === "heading") return <h3 key={block.id}>{block.text}</h3>;
        if (block.type === "subtitle")
          return (
            <p className="editorial-subtitle" key={block.id}>
              {block.text}
            </p>
          );
        if (block.type === "paragraph") return <p key={block.id}>{block.text}</p>;
        if (block.type === "list")
          return (
            <ul key={block.id}>
              {block.items.filter(Boolean).map((v, i) => (
                <li key={i}>{v}</li>
              ))}
            </ul>
          );
        if (block.type === "facts")
          return (
            <aside className="facts" key={block.id}>
              <h4>{block.title}</h4>
              <dl>
                {block.items.map((v, i) => (
                  <div key={i}>
                    <dt>{v.label}</dt>
                    <dd>{v.value}</dd>
                  </div>
                ))}
              </dl>
            </aside>
          );
        if (block.type === "carousel" || block.type === "imageGrid") return <Carousel key={block.id} ids={block.mediaIds} media={media} />;
        return (
          <div key={block.id} className="image-grid">
            {block.mediaIds.map((id) => media.has(id) && <img key={id} src={`/api/media/${id}/original`} alt={media.get(id)?.altText || ""} />)}
          </div>
        );
      })}
    </>
  );
}
export function SafariPageSpread({ page, media, id }: { page: SafariPageDocument; media: MediaRecord[]; id?: string }) {
  const map = useMemo(() => new Map(media.map((item) => [item.id, item])), [media]),
    left = page.leftPanel;
  return (
    <article className="safari-spread" id={id}>
      <section className="spread-hero">
        {left.heroMediaId && map.has(left.heroMediaId) && <img src={`/api/media/${left.heroMediaId}/original`} alt={map.get(left.heroMediaId)?.altText || ""} style={{ objectPosition: left.objectPosition || "50% 50%" }} />}
        <div className="spread-shade" />
        <div className={`spread-copy ${left.overlayPosition || "bottom-left"}`}>
          <p>{left.eyebrow}</p>
          <h2>{left.title}</h2>
          <span>{left.location}</span>
          <time>{dates(left.startDate, left.endDate)}</time>
        </div>
      </section>
      <section className="spread-story">
        <ContentBlocks blocks={page.rightPanel.blocks} media={map} />
      </section>
    </article>
  );
}
export function SafariJournalRenderer({ pages, media, preview = false }: { pages: Array<{ id: string; document: SafariPageDocument }>; media: MediaRecord[]; preview?: boolean }) {
  return (
    <div className="journal" id="top">
      <header className="journal-header">
        <a className="journal-brand" href="#top">
          <span className="brand-mark">SF</span>
          <span>SafariForge</span>
        </a>
        <nav>
          {pages.map((p, i) => (
            <a key={p.id} href={`#page-${p.id}`}>
              {String(i + 1).padStart(2, "0")}
            </a>
          ))}
        </nav>
      </header>
      {preview && <div className="preview-banner">Draft preview · visitors cannot see these changes</div>}
      <main>
        {pages.map((page) => (
          <SafariPageSpread key={page.id} id={`page-${page.id}`} page={page.document} media={media} />
        ))}
      </main>
    </div>
  );
}
