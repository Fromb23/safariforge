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

type PageNavigationProps = {
  current: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
};

export function PageNavigation({ current, total, onPrevious, onNext }: PageNavigationProps) {
  return (
    <nav className="page-navigation" aria-label="Safari Page navigation">
      <span className="page-navigation-title">The journey</span>
      <div className="page-navigation-controls">
        <button type="button" aria-label="Previous Safari Page" onClick={onPrevious} disabled={current === 0}>‹</button>
        <span className="page-position" aria-live="polite">{numberLabel(current + 1)} / {numberLabel(total)}</span>
        <button type="button" aria-label="Next Safari Page" onClick={onNext} disabled={current === total - 1}>›</button>
      </div>
    </nav>
  );
}

export function SafariPageSpread({
  page,
  media,
  id,
  navigation,
  hidePublicSubsectionLabel = false,
}: {
  page: SafariPageDocument;
  media: MediaRecord[];
  id?: string;
  navigation?: React.ReactNode;
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
        {navigation}
        <div className="spread-story-content">
          <ContentBlocks blocks={page.rightPanel.blocks} media={map} />
        </div>
      </section>
    </article>
  );
}

export function SafariJournalRenderer({ pages, media, preview = false }: { pages: Array<{ id: string; document: SafariPageDocument }>; media: MediaRecord[]; preview?: boolean }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = pages[Math.min(activeIndex, pages.length - 1)];

  const syncFromLocation = useCallback(() => {
    const id = decodeURIComponent(window.location.hash.replace(/^#page-/, ""));
    const index = pages.findIndex((page) => page.id === id);
    if (index >= 0) setActiveIndex(index);
  }, [pages]);

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

  const goTo = (index: number) => {
    if (index < 0 || index >= pages.length || index === activeIndex) return;
    setActiveIndex(index);
    window.history.pushState(null, "", `#page-${encodeURIComponent(pages[index].id)}`);
  };

  if (!active) return null;

  return (
    <div className="journal" id="top">
      <header className="journal-header">
        <a className="journal-brand" href="#top"><span className="brand-mark">SF</span><span>SafariForge</span></a>
      </header>
      {preview && <div className="preview-banner">Draft preview · visitors cannot see these changes</div>}
      <main>
        <SafariPageSpread
          key={active.id}
          id={`page-${active.id}`}
          page={active.document}
          media={media}
          hidePublicSubsectionLabel={!preview}
          navigation={!preview && pages.length > 0 ? <PageNavigation current={activeIndex} total={pages.length} onPrevious={() => goTo(activeIndex - 1)} onNext={() => goTo(activeIndex + 1)} /> : undefined}
        />
      </main>
    </div>
  );
}
