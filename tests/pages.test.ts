import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { db } from "@/lib/db";
import { createPage, deletePage, duplicatePage, getPage, listPages, listPublishedPages, mediaAllocations, migrateLegacyPages, movePage, pageMediaIsPublished, publishPage, savePage, setJournalInclusion, unpublishPage, validatePage } from "@/lib/pages";
import { SafariJournalRenderer } from "@/components/SafariJournalRenderer";
import { formatPageDate, normalizePageDocument } from "@/lib/page-date";
import type { ItineraryDocument, MediaRecord, SafariPageDocument } from "@/types";

const page = (title = "Safari Note", date = "2027-01-01"): SafariPageDocument => ({
  leftPanel: {
    eyebrow: "A Note About Your Itinerary",
    title,
    location: "Serengeti",
    date,
    overlayPosition: "bottom-left",
  },
  rightPanel: {
    blocks: [
      { id: randomUUID(), type: "heading", text: "A Note About Your Safari" },
      { id: randomUUID(), type: "subtitle", text: "Tailor made travel" },
      {
        id: randomUUID(),
        type: "paragraph",
        text: "Dear traveler,\n\nWelcome to your safari.",
      },
    ],
  },
});
beforeEach(() => db().exec("DELETE FROM safari_page_revision_media; DELETE FROM safari_page_revisions; DELETE FROM safari_pages; DELETE FROM sessions; DELETE FROM credentials; DELETE FROM revision_media; DELETE FROM revisions; DELETE FROM itineraries; DELETE FROM templates; DELETE FROM media;"));
describe("independent Safari Pages", () => {
  it("creates exactly one left and right panel and saves ordered blocks", () => {
    const created = createPage(),
      draft = getPage(created.id, "draft")!;
    const document = page();
    const saved = savePage(created.id, document, draft.revisionId, draft.revisionVersion)!;
    expect(saved.document.leftPanel.title).toBe("Safari Note");
    expect(saved.document.rightPanel.blocks.map((block) => block.type)).toEqual(["heading", "subtitle", "paragraph"]);
    expect(() => validatePage(saved.document)).not.toThrow();
  });
  it("reopens the complete saved draft with left fields, ordered blocks, media, revision ID, and version", () => {
    const mediaId = randomUUID(),
      stamp = new Date().toISOString();
    db().prepare("INSERT INTO media(id,storage_key,thumbnail_key,original_name,mime_type,size_bytes,sha256,width,height,tags_json,alt_text,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(mediaId, "restore.jpg", "restore.webp", "restore.jpg", "image/jpeg", 1, randomUUID(), 10, 10, '["restore"]', "Restored", stamp);
    const created = createPage(),
      draft = getPage(created.id, "draft")!,
      document = page("Restored page");
    document.leftPanel = {
      ...document.leftPanel,
      eyebrow: "Restored eyebrow",
      date: "2027-01-03",
      heroMediaId: mediaId,
      overlayPosition: "top-right",
      objectPosition: "25% 75%",
    };
    document.rightPanel.blocks.push({
      id: randomUUID(),
      type: "carousel",
      mediaIds: [],
    });
    const saved = savePage(created.id, document, draft.revisionId, draft.revisionVersion)!,
      reopened = getPage(created.id, "draft")!;
    expect(reopened).toEqual(saved);
    expect(reopened.revisionId).toBe(draft.revisionId);
    expect(reopened.revisionVersion).toBe(2);
    expect(reopened.document.leftPanel).toMatchObject({
      eyebrow: "Restored eyebrow",
      date: "2027-01-03",
      heroMediaId: mediaId,
      overlayPosition: "top-right",
      objectPosition: "25% 75%",
    });
    expect(reopened.document.rightPanel.blocks.map((v) => v.type)).toEqual(["heading", "subtitle", "paragraph", "carousel"]);
  });
  it("publishes atomically and keeps its snapshot stable while the next draft changes", () => {
    const created = createPage(),
      draft = getPage(created.id, "draft")!,
      published = publishPage(created.id, page("Published"), draft.revisionId, draft.revisionVersion);
    expect(published.draft.document).toEqual(published.published.document);
    expect(published.published.document.leftPanel.date).toBe("2027-01-01");
    savePage(created.id, page("Private edit"), published.draft.revisionId, published.draft.revisionVersion);
    expect(getPage(created.id, "published")?.document.leftPanel.title).toBe("Published");
    expect(listPages()[0].status).toBe("UNPUBLISHED_CHANGES");
  });
  it("rejects stale writes and duplicate publication requests", () => {
    const created = createPage(),
      draft = getPage(created.id, "draft")!,
      saved = savePage(created.id, page(), draft.revisionId, draft.revisionVersion)!;
    expect(() => savePage(created.id, page("Stale"), draft.revisionId, draft.revisionVersion)).toThrow(/changed in another session/i);
    publishPage(created.id, saved.document, saved.revisionId, saved.revisionVersion);
    expect(() => publishPage(created.id, saved.document, saved.revisionId, saved.revisionVersion)).toThrow(/already changed or published/i);
  });
  it("publishes, orders, unpublishes, and deletes pages independently", () => {
    const later = createPage(),
      early = createPage(),
      lateDraft = getPage(later.id, "draft")!,
      earlyDraft = getPage(early.id, "draft")!;
    publishPage(later.id, page("Later", "2027-02-01"), lateDraft.revisionId, lateDraft.revisionVersion);
    publishPage(early.id, page("Early", "2027-01-01"), earlyDraft.revisionId, earlyDraft.revisionVersion);
    expect(listPublishedPages().map((v) => v.document.leftPanel.title)).toEqual(["Early", "Later"]);
    unpublishPage(early.id);
    expect(listPublishedPages().map((v) => v.document.leftPanel.title)).toEqual(["Later"]);
    deletePage(early.id);
    expect(listPages()).toHaveLength(1);
  });
  it("duplicates editorial structure into an independent draft", () => {
    const created = createPage(),
      draft = getPage(created.id, "draft")!;
    savePage(created.id, page("Original"), draft.revisionId, draft.revisionVersion);
    const result = duplicatePage(created.id),
      copy = getPage(result.id, "draft")!;
    expect(copy.document.leftPanel.title).toBe("Original copy");
    expect(copy.document.leftPanel.heroMediaId).toBeUndefined();
    expect(copy.document.rightPanel.blocks.map((block) => block.type)).toEqual(["heading", "subtitle", "paragraph"]);
  });
  it("supports explicit administrative ordering for pages on the same date", () => {
    const first = createPage(),
      second = createPage(),
      a = getPage(first.id, "draft")!,
      b = getPage(second.id, "draft")!;
    publishPage(first.id, page("First"), a.revisionId, a.revisionVersion);
    publishPage(second.id, page("Second"), b.revisionId, b.revisionVersion);
    movePage(second.id, "earlier");
    expect(listPublishedPages().map((item) => item.document.leftPanel.title)).toEqual(["Second", "First"]);
  });
  it("prevents duplicate image placement within a page and conflicts across included drafts", () => {
    const mediaId = randomUUID(),
      stamp = new Date().toISOString();
    db().prepare("INSERT INTO media(id,storage_key,thumbnail_key,original_name,mime_type,size_bytes,sha256,width,height,tags_json,alt_text,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(mediaId, "one.jpg", "one.webp", "one.jpg", "image/jpeg", 1, randomUUID(), 10, 10, '[\"wildlife\"]', "Wildlife", stamp);
    const first = createPage(),
      firstDraft = getPage(first.id, "draft")!,
      firstDoc = page("One");
    firstDoc.leftPanel.heroMediaId = mediaId;
    savePage(first.id, firstDoc, firstDraft.revisionId, firstDraft.revisionVersion);
    const duplicated = structuredClone(firstDoc);
    duplicated.rightPanel.blocks.push({
      id: randomUUID(),
      type: "carousel",
      mediaIds: [mediaId],
    });
    expect(() => validatePage(duplicated)).toThrow(/only once/i);
    const second = createPage(),
      secondDraft = getPage(second.id, "draft")!,
      secondDoc = page("Two");
    secondDoc.leftPanel.heroMediaId = mediaId;
    expect(() => savePage(second.id, secondDoc, secondDraft.revisionId, secondDraft.revisionVersion)).toThrow(/already allocated/i);
    setJournalInclusion(first.id, false);
    expect(() => savePage(second.id, secondDoc, secondDraft.revisionId, secondDraft.revisionVersion)).not.toThrow();
  });
  it("keeps published image allocation and public authorization after removal from its successor draft", () => {
    const mediaId = randomUUID(),
      stamp = new Date().toISOString();
    db().prepare("INSERT INTO media(id,storage_key,thumbnail_key,original_name,mime_type,size_bytes,sha256,width,height,tags_json,alt_text,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(mediaId, "published.jpg", "published.webp", "published.jpg", "image/jpeg", 1, randomUUID(), 10, 10, '["wildlife"]', "Wildlife", stamp);
    const created = createPage(),
      draft = getPage(created.id, "draft")!,
      document = page();
    document.leftPanel.heroMediaId = mediaId;
    const result = publishPage(created.id, document, draft.revisionId, draft.revisionVersion),
      without = structuredClone(result.draft.document);
    without.leftPanel.heroMediaId = undefined;
    savePage(created.id, without, result.draft.revisionId, result.draft.revisionVersion);
    expect(getPage(created.id, "published")?.document.leftPanel.heroMediaId).toBe(mediaId);
    expect(pageMediaIsPublished(mediaId)).toBe(true);
    expect(mediaAllocations()).toEqual([{ media_id: mediaId, page_id: created.id, page_title: "Safari Note" }]);
  });
  it("renders a published legacy imageGrid without rewriting its revision JSON or media order", () => {
    const stamp = new Date().toISOString(),
      mediaIds = ["image-a", "image-b", "image-c"];
    for (const mediaId of mediaIds) db().prepare("INSERT INTO media(id,storage_key,thumbnail_key,original_name,mime_type,size_bytes,sha256,width,height,tags_json,alt_text,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(mediaId, `${mediaId}.jpg`, `${mediaId}.webp`, `${mediaId}.jpg`, "image/jpeg", 1, randomUUID(), 1200, 800, '["wildlife"]', mediaId, stamp);
    const created = createPage(),
      draft = getPage(created.id, "draft")!,
      document = page();
    document.rightPanel.blocks.push({
      id: "existing-image-block",
      type: "imageGrid",
      mediaIds,
    });
    const result = publishPage(created.id, document, draft.revisionId, draft.revisionVersion),
      row = db().prepare("SELECT document_json FROM safari_page_revisions WHERE id=?").get(result.published.revisionId) as { document_json: string },
      before = row.document_json;
    const published = getPage(created.id, "published")!,
      html = renderToStaticMarkup(
        createElement(SafariJournalRenderer, {
          pages: [{ id: created.id, document: published.document }],
          media: mediaIds.map((id, index) => ({
            id,
            originalName: `${id}.jpg`,
            mimeType: "image/jpeg",
            width: 1200,
            height: 800,
            tags: ["wildlife"],
            altText: `Photo ${index + 1}`,
            createdAt: stamp,
          })),
        }),
      );
    expect(html).toContain("Page image carousel");
    expect(html).not.toContain("image-grid");
    expect(getPage(created.id, "published")?.document.rightPanel.blocks.at(-1)).toEqual({ id: "existing-image-block", type: "imageGrid", mediaIds });
    expect((db().prepare("SELECT document_json FROM safari_page_revisions WHERE id=?").get(result.published.revisionId) as { document_json: string }).document_json).toBe(before);
    expect(
      db()
        .prepare("SELECT media_id FROM safari_page_revision_media WHERE revision_id=? ORDER BY rowid")
        .all(result.published.revisionId)
        .map((row) => (row as { media_id: string }).media_id),
    ).toEqual(mediaIds);
  });
  it("normalizes SQLite allocation rows into plain serializable objects", () => {
    expect(mediaAllocations().every((value) => Object.getPrototypeOf(value) === Object.prototype)).toBe(true);
    expect(() => structuredClone({ pages: listPages(), allocations: mediaAllocations() })).not.toThrow();
  });
  it("shows excluded-page assignments in media management without treating them as public-journal conflicts", () => {
    const mediaId = randomUUID(),
      stamp = new Date().toISOString();
    db().prepare("INSERT INTO media(id,storage_key,thumbnail_key,original_name,mime_type,size_bytes,sha256,width,height,tags_json,alt_text,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(mediaId, "excluded.jpg", "excluded.webp", "excluded.jpg", "image/jpeg", 1, randomUUID(), 10, 10, '["archive"]', "Archive", stamp);
    const created = createPage(),
      draft = getPage(created.id, "draft")!,
      document = page("Excluded page");
    document.leftPanel.heroMediaId = mediaId;
    savePage(created.id, document, draft.revisionId, draft.revisionVersion);
    setJournalInclusion(created.id, false);
    expect(mediaAllocations()).toEqual([]);
    expect(mediaAllocations(true)).toEqual([{ media_id: mediaId, page_id: created.id, page_title: "Excluded page" }]);
  });
  it("rejects inclusion when an excluded published snapshot would duplicate public media", () => {
    const mediaId = randomUUID(),
      stamp = new Date().toISOString();
    db().prepare("INSERT INTO media(id,storage_key,thumbnail_key,original_name,mime_type,size_bytes,sha256,width,height,tags_json,alt_text,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(mediaId, "include.jpg", "include.webp", "include.jpg", "image/jpeg", 1, randomUUID(), 10, 10, '["archive"]', "Archive", stamp);
    const excluded = createPage();
    setJournalInclusion(excluded.id, false);
    const excludedDraft = getPage(excluded.id, "draft")!,
      excludedDoc = page("Excluded published");
    excludedDoc.leftPanel.heroMediaId = mediaId;
    publishPage(excluded.id, excludedDoc, excludedDraft.revisionId, excludedDraft.revisionVersion);
    const included = createPage(),
      includedDraft = getPage(included.id, "draft")!,
      includedDoc = page("Included page");
    includedDoc.leftPanel.heroMediaId = mediaId;
    savePage(included.id, includedDoc, includedDraft.revisionId, includedDraft.revisionVersion);
    expect(() => setJournalInclusion(excluded.id, true)).toThrow(/already allocated/i);
  });
});
describe("legacy migration", () => {
  function legacy(title: string) {
    const itineraryId = randomUUID(),
      revisionId = randomUUID(),
      stamp = new Date().toISOString(),
      document: ItineraryDocument = {
        title,
        subtitle: "",
        travelerName: "",
        sections: [
          {
            id: randomUUID(),
            title: `${title} section`,
            startDate: "2027-01-01",
            location: "Arusha",
            blocks: [{ id: randomUUID(), type: "paragraph", text: "Preserved copy" }],
          },
        ],
      };
    db().prepare("INSERT INTO itineraries(id,slug,draft_revision_id,published_revision_id,created_at,updated_at) VALUES(?,?,?,?,?,?)").run(itineraryId, itineraryId, revisionId, revisionId, stamp, stamp);
    db().prepare("INSERT INTO revisions(id,itinerary_id,number,state,document_json,created_at,updated_at,published_at) VALUES(?,?,1,'PUBLISHED',?,?,?,?)").run(revisionId, itineraryId, JSON.stringify(document), stamp, stamp, stamp);
    return document.sections[0].id;
  }
  it("is idempotent, preserves stable section IDs, and imports a single journal as included", () => {
    const sectionId = legacy("Only");
    migrateLegacyPages();
    migrateLegacyPages();
    expect(listPages()).toMatchObject([{ id: sectionId, title: "Only section", journalIncluded: true }]);
    expect(listPublishedPages()[0].document.rightPanel.blocks[0]).toMatchObject({ type: "paragraph", text: "Preserved copy" });
  });
  it("does not silently merge multiple legacy itineraries", () => {
    legacy("One");
    legacy("Two");
    migrateLegacyPages();
    expect(listPages()).toHaveLength(2);
    expect(listPages().every((item) => !item.journalIncluded)).toBe(true);
    expect(listPublishedPages()).toEqual([]);
  });
});
describe("shared journal rendering", () => {
  it("renders subtitles, paragraphs, stable anchors, and responsive spreads", () => {
    const document = page(),
      media: MediaRecord[] = [];
    const html = renderToStaticMarkup(
      createElement(SafariJournalRenderer, {
        pages: [{ id: "stable-page", document }],
        media,
      }),
    );
    expect(html).toContain('id="page-stable-page"');
    expect(html).toContain("Tailor made travel");
    expect(html).toContain("Dear traveler");
    expect(html).toContain("safari-spread");
  });
  it("renders a single normalized legacy date and no placeholder for a missing date", () => {
    const legacyRange = page("Legacy range") as SafariPageDocument & { leftPanel: SafariPageDocument["leftPanel"] & { startDate?: string; endDate?: string } };
    delete legacyRange.leftPanel.date;
    legacyRange.leftPanel.startDate = "2026-11-21";
    legacyRange.leftPanel.endDate = "2026-11-23";
    const endOnly = page("End only") as typeof legacyRange;
    delete endOnly.leftPanel.date;
    endOnly.leftPanel.endDate = "2026-11-23";
    const missing = page("Undated");
    delete missing.leftPanel.date;
    const html = renderToStaticMarkup(createElement(SafariJournalRenderer, { pages: [
      { id: "range", document: legacyRange },
      { id: "end", document: endOnly },
      { id: "missing", document: missing },
    ], media: [] }));
    expect(html).toContain('<time dateTime="2026-11-21">November 21, 2026</time>');
    expect(html).toContain('<time dateTime="2026-11-23">November 23, 2026</time>');
    expect(html).not.toContain("November 21, 2026 — November 23, 2026");
    expect(html).not.toContain("Invalid Date");
    expect((html.match(/<time/g) || [])).toHaveLength(2);
  });
});

describe("canonical Safari Page dates", () => {
  it.each(["0000-01-01", "2026-02-29", "2026-04-31", "2026-11-1", "not-a-date"])("rejects invalid calendar date %s", (date) => {
    expect(() => validatePage(page("Invalid", date))).toThrow(/valid calendar date/i);
  });
  it.each(["2024-02-29", "2026-11-21"])("accepts valid calendar date %s", (date) => {
    expect(() => validatePage(page("Valid", date))).not.toThrow();
  });
  it("allows pages without a date", () => {
    const undated = page("Undated");
    delete undated.leftPanel.date;
    expect(() => validatePage(undated)).not.toThrow();
  });
  it("normalizes legacy precedence idempotently and persists only the canonical field on save", () => {
    const legacy = page("Legacy") as SafariPageDocument & { leftPanel: SafariPageDocument["leftPanel"] & { startDate?: string; endDate?: string } };
    delete legacy.leftPanel.date;
    legacy.leftPanel.startDate = "2026-11-21";
    legacy.leftPanel.endDate = "2026-11-23";
    expect(normalizePageDocument(normalizePageDocument(legacy))).toEqual(normalizePageDocument(legacy));
    expect(normalizePageDocument(legacy).leftPanel.date).toBe("2026-11-21");
    const created = createPage(), draft = getPage(created.id, "draft")!;
    const saved = savePage(created.id, legacy, draft.revisionId, draft.revisionVersion)!;
    const stored = (db().prepare("SELECT document_json FROM safari_page_revisions WHERE id=?").get(saved.revisionId) as { document_json: string }).document_json;
    expect(JSON.parse(stored).leftPanel).toMatchObject({ date: "2026-11-21" });
    expect(stored).not.toContain("startDate");
    expect(stored).not.toContain("endDate");
  });
  it("normalizes reads without mutating historical published revision JSON", () => {
    const created = createPage(), draft = getPage(created.id, "draft")!, legacy = page("Historical") as SafariPageDocument & { leftPanel: SafariPageDocument["leftPanel"] & { startDate?: string; endDate?: string } };
    delete legacy.leftPanel.date;
    legacy.leftPanel.startDate = "2026-11-21";
    legacy.leftPanel.endDate = "2026-11-23";
    const original = JSON.stringify(legacy), stamp = new Date().toISOString();
    db().prepare("UPDATE safari_page_revisions SET document_json=?,state='PUBLISHED',published_at=? WHERE id=?").run(original, stamp, draft.revisionId);
    db().prepare("UPDATE safari_pages SET published_revision_id=? WHERE id=?").run(draft.revisionId, created.id);
    expect(getPage(created.id, "published")?.document.leftPanel.date).toBe("2026-11-21");
    expect(listPublishedPages()[0].document.leftPanel.date).toBe("2026-11-21");
    expect((db().prepare("SELECT document_json FROM safari_page_revisions WHERE id=?").get(draft.revisionId) as { document_json: string }).document_json).toBe(original);
  });
  it("orders canonical and legacy dates chronologically with deterministic undated ordering", () => {
    const ids = [createPage(), createPage(), createPage(), createPage()];
    const docs = [page("Undated one"), page("Legacy end"), page("Canonical"), page("Undated two")];
    delete docs[0].leftPanel.date;
    delete docs[3].leftPanel.date;
    const legacy = docs[1] as SafariPageDocument & { leftPanel: SafariPageDocument["leftPanel"] & { endDate?: string } };
    delete legacy.leftPanel.date;
    legacy.leftPanel.endDate = "2026-11-20";
    docs[2].leftPanel.date = "2026-11-21";
    ids.forEach((created, index) => {
      const draft = getPage(created.id, "draft")!, stamp = new Date().toISOString();
      db().prepare("UPDATE safari_page_revisions SET document_json=?,state='PUBLISHED',published_at=? WHERE id=?").run(JSON.stringify(docs[index]), stamp, draft.revisionId);
      db().prepare("UPDATE safari_pages SET published_revision_id=? WHERE id=?").run(draft.revisionId, created.id);
    });
    expect(listPublishedPages().map((item) => item.document.leftPanel.title)).toEqual(["Legacy end", "Canonical", "Undated one", "Undated two"]);
  });
  it("formats the same calendar value in different server timezones", () => {
    const prior = process.env.TZ;
    process.env.TZ = "Pacific/Honolulu";
    const west = formatPageDate("2026-11-21");
    process.env.TZ = "Pacific/Kiritimati";
    const east = formatPageDate("2026-11-21");
    if (prior === undefined) delete process.env.TZ;
    else process.env.TZ = prior;
    expect(west).toBe("November 21, 2026");
    expect(east).toBe(west);
  });
});
