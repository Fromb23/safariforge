import { randomUUID } from "node:crypto";
import { db } from "./db";
import type {
  ContentBlock,
  ItineraryDocument,
  ItinerarySection,
  MediaRecord,
  RevisionSummary,
  TemplateRecord,
} from "@/types";

type ItineraryRow = {
  id: string;
  slug: string;
  draft_revision_id: string;
  published_revision_id: string | null;
};
type RevisionRow = {
  id: string;
  itinerary_id: string;
  number: number;
  state: string;
  document_json: string;
  published_at: string | null;
  updated_at: string;
  version: number;
};
type MediaRow = {
  id: string;
  original_name: string;
  mime_type: string;
  width: number;
  height: number;
  tags_json: string;
  alt_text: string;
  created_at: string;
};
type TemplateRow = {
  id: string;
  name: string;
  description: string;
  blocks_json: string;
  updated_at: string;
};
const now = () => new Date().toISOString();
export class DocumentConflictError extends Error {
  constructor(
    message = "This draft changed in another session. Reload before continuing.",
  ) {
    super(message);
    this.name = "DocumentConflictError";
  }
}

export function mediaIds(document: ItineraryDocument) {
  const ids = new Set<string>();
  for (const section of document.sections) {
    if (section.heroMediaId) ids.add(section.heroMediaId);
    for (const block of section.blocks)
      if (
        block.type === "gallery" ||
        block.type === "carousel" ||
        block.type === "imageGrid"
      )
        block.mediaIds.forEach((id) => ids.add(id));
  }
  return [...ids];
}
function validateShape(
  value: unknown,
  publishing: boolean,
): asserts value is ItineraryDocument {
  const doc = value as ItineraryDocument;
  if (!doc || typeof doc.title !== "string" || !doc.title.trim())
    throw new Error("An itinerary title is required.");
  if (!Array.isArray(doc.sections))
    throw new Error("Sections must be an ordered list.");
  if (publishing && !doc.sections.length)
    throw new Error("Add at least one section before publishing.");
  const sectionIds = new Set<string>();
  const blockIds = new Set<string>();
  for (const section of doc.sections) {
    if (!section.id || sectionIds.has(section.id) || !section.title?.trim())
      throw new Error("Every section needs a unique stable ID and title.");
    sectionIds.add(section.id);
    if (!Array.isArray(section.blocks))
      throw new Error(`“${section.title}” has invalid content.`);
    if (publishing && !section.blocks.length)
      throw new Error(`“${section.title}” needs at least one content block.`);
    for (const block of section.blocks) {
      if (!block.id || blockIds.has(block.id))
        throw new Error("Every content block needs a unique stable ID.");
      blockIds.add(block.id);
      if (
        (block.type === "gallery" ||
          block.type === "carousel" ||
          block.type === "imageGrid") &&
        !Array.isArray(block.mediaIds)
      )
        throw new Error("Image selections must be an ordered list.");
    }
  }
  const ids = mediaIds(doc);
  if (ids.length) {
    const found = db()
      .prepare(
        `SELECT COUNT(*) count FROM media WHERE id IN (${ids.map(() => "?").join(",")})`,
      )
      .get(...ids) as { count: number };
    if (found.count !== ids.length)
      throw new Error("The itinerary references media that no longer exists.");
  }
}
export function validateDraft(
  value: unknown,
): asserts value is ItineraryDocument {
  validateShape(value, false);
}
export function validateDocument(
  value: unknown,
): asserts value is ItineraryDocument {
  validateShape(value, true);
}
export function chronologicalSections(sections: ItinerarySection[]) {
  return sections
    .map((section, index) => ({ section, index }))
    .sort((a, b) => {
      const ad = a.section.startDate || "9999-12-31",
        bd = b.section.startDate || "9999-12-31";
      return (
        ad.localeCompare(bd) ||
        a.index - b.index ||
        a.section.id.localeCompare(b.section.id)
      );
    })
    .map(({ section }) => section);
}
function syncRevisionMedia(revisionId: string, document: ItineraryDocument) {
  db()
    .prepare("DELETE FROM revision_media WHERE revision_id=?")
    .run(revisionId);
  const insert = db().prepare(
    "INSERT INTO revision_media(revision_id,media_id) VALUES(?,?)",
  );
  mediaIds(document).forEach((id) => insert.run(revisionId, id));
}
function serialize(row: RevisionRow & { slug: string }) {
  return {
    id: row.itinerary_id,
    slug: row.slug,
    revisionId: row.id,
    revisionVersion: row.version,
    revisionNumber: row.number,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    document: JSON.parse(row.document_json) as ItineraryDocument,
  };
}
export function listItineraries() {
  return db()
    .prepare(
      `SELECT i.id,i.slug,i.updated_at,i.published_revision_id,r.id draft_id,r.document_json,p.published_at,
       EXISTS(SELECT 1 FROM revisions history WHERE history.itinerary_id=i.id AND history.state!='DRAFT') had_publication
       FROM itineraries i JOIN revisions r ON r.id=i.draft_revision_id LEFT JOIN revisions p ON p.id=i.published_revision_id ORDER BY i.updated_at DESC`,
    )
    .all()
    .map((raw) => {
      const item = raw as {
        id: string;
        slug: string;
        updated_at: string;
        published_revision_id: string | null;
        draft_id: string;
        document_json: string;
        published_at: string | null;
        had_publication: number;
      };
      const doc = JSON.parse(item.document_json) as ItineraryDocument;
      const status: "PUBLISHED" | "UNPUBLISHED" | "DRAFT" =
        item.published_revision_id
          ? "PUBLISHED"
          : item.had_publication
            ? "UNPUBLISHED"
            : "DRAFT";
      return {
        id: item.id,
        slug: item.slug,
        title: doc.title,
        subtitle: doc.subtitle,
        sectionCount: doc.sections.length,
        updatedAt: item.updated_at,
        publishedAt: item.published_at,
        status,
      };
    });
}
export function getItinerary(id: string, mode: "draft" | "published") {
  const pointer =
    mode === "draft" ? "draft_revision_id" : "published_revision_id";
  const row = db()
    .prepare(
      `SELECT i.slug,r.* FROM itineraries i JOIN revisions r ON r.id=i.${pointer} WHERE i.id=?`,
    )
    .get(id) as (RevisionRow & { slug: string }) | undefined;
  return row ? serialize(row) : null;
}
export function getPublishedForItinerary(id: string) {
  return getItinerary(id, "published");
}
export function getPublishedBySlug(slug: string) {
  const row = db()
    .prepare(
      "SELECT i.slug,r.* FROM itineraries i JOIN revisions r ON r.id=i.published_revision_id WHERE i.slug=?",
    )
    .get(slug) as (RevisionRow & { slug: string }) | undefined;
  return row ? serialize(row) : null;
}
export function saveDraft(
  id: string,
  document: ItineraryDocument,
  expectedRevisionId: string,
  expectedVersion: number,
) {
  validateDraft(document);
  db().transaction(() => {
    const itinerary = db()
      .prepare("SELECT * FROM itineraries WHERE id=?")
      .get(id) as ItineraryRow | undefined;
    if (!itinerary) throw new Error("Itinerary not found.");
    if (itinerary.draft_revision_id !== expectedRevisionId)
      throw new DocumentConflictError();
    const stamp = now();
    const result = db()
      .prepare(
        "UPDATE revisions SET document_json=?,updated_at=?,version=version+1 WHERE id=? AND state='DRAFT' AND version=?",
      )
      .run(
        JSON.stringify(document),
        stamp,
        expectedRevisionId,
        expectedVersion,
      );
    if (!result.changes) throw new DocumentConflictError();
    syncRevisionMedia(expectedRevisionId, document);
    db()
      .prepare("UPDATE itineraries SET updated_at=? WHERE id=?")
      .run(stamp, id);
  })();
  return getItinerary(id, "draft");
}
export function publish(
  id: string,
  document: ItineraryDocument,
  expectedRevisionId: string,
  expectedVersion: number,
) {
  validateDocument(document);
  let publishedId = "",
    draftId = "";
  db().transaction(() => {
    const itinerary = db()
      .prepare("SELECT * FROM itineraries WHERE id=?")
      .get(id) as ItineraryRow | undefined;
    if (!itinerary) throw new Error("Itinerary not found.");
    if (itinerary.draft_revision_id !== expectedRevisionId)
      throw new DocumentConflictError(
        "This draft was already changed or published in another session.",
      );
    const draft = db()
      .prepare(
        "SELECT * FROM revisions WHERE id=? AND state='DRAFT' AND version=?",
      )
      .get(expectedRevisionId, expectedVersion) as RevisionRow | undefined;
    if (!draft) throw new DocumentConflictError();
    const stamp = now();
    publishedId = draft.id;
    draftId = randomUUID();
    db()
      .prepare(
        "UPDATE revisions SET document_json=?,state='PUBLISHED',published_at=?,updated_at=?,version=version+1 WHERE id=? AND version=?",
      )
      .run(JSON.stringify(document), stamp, stamp, draft.id, expectedVersion);
    syncRevisionMedia(draft.id, document);
    if (
      itinerary.published_revision_id &&
      itinerary.published_revision_id !== draft.id
    )
      db()
        .prepare("UPDATE revisions SET state='RETIRED' WHERE id=?")
        .run(itinerary.published_revision_id);
    const clean: ItineraryDocument = {
      title: document.title,
      subtitle: document.subtitle,
      travelerName: document.travelerName,
      startDate: document.startDate,
      endDate: document.endDate,
      sections: [],
    };
    db()
      .prepare(
        "INSERT INTO revisions(id,itinerary_id,number,state,document_json,created_at,updated_at) VALUES(?,?,?,'DRAFT',?,?,?)",
      )
      .run(draftId, id, draft.number + 1, JSON.stringify(clean), stamp, stamp);
    db()
      .prepare(
        "UPDATE itineraries SET draft_revision_id=?,published_revision_id=?,updated_at=? WHERE id=?",
      )
      .run(draftId, publishedId, stamp, id);
  })();
  return {
    published: getItinerary(id, "published")!,
    draft: getItinerary(id, "draft")!,
  };
}
export function listRevisions(id: string): RevisionSummary[] {
  return (
    db()
      .prepare(
        "SELECT id,number,state,published_at,updated_at FROM revisions WHERE itinerary_id=? AND state!='DRAFT' ORDER BY number DESC",
      )
      .all(id) as Array<{
      id: string;
      number: number;
      state: string;
      published_at: string | null;
      updated_at: string;
    }>
  ).map((r) => ({
    id: r.id,
    number: r.number,
    state: r.state,
    publishedAt: r.published_at,
    updatedAt: r.updated_at,
  }));
}
export function getRevision(id: string, revisionId: string) {
  const row = db()
    .prepare(
      "SELECT i.slug,r.* FROM itineraries i JOIN revisions r ON r.itinerary_id=i.id WHERE i.id=? AND r.id=? AND r.state!='DRAFT'",
    )
    .get(id, revisionId) as (RevisionRow & { slug: string }) | undefined;
  return row ? serialize(row) : null;
}
export function editPublication(
  id: string,
  revisionId: string,
  expectedDraftId: string,
  expectedVersion: number,
) {
  let result: null | ReturnType<typeof getItinerary> = null;
  db().transaction(() => {
    const itinerary = db()
      .prepare("SELECT * FROM itineraries WHERE id=?")
      .get(id) as ItineraryRow | undefined;
    if (!itinerary) throw new Error("Itinerary not found.");
    if (itinerary.draft_revision_id !== expectedDraftId)
      throw new DocumentConflictError();
    const source = db()
      .prepare(
        "SELECT * FROM revisions WHERE id=? AND itinerary_id=? AND state!='DRAFT'",
      )
      .get(revisionId, id) as RevisionRow | undefined;
    if (!source) throw new Error("Publication not found.");
    const document = JSON.parse(source.document_json) as ItineraryDocument;
    const changed = db()
      .prepare(
        "UPDATE revisions SET document_json=?,updated_at=?,version=version+1 WHERE id=? AND state='DRAFT' AND version=?",
      )
      .run(source.document_json, now(), expectedDraftId, expectedVersion);
    if (!changed.changes) throw new DocumentConflictError();
    syncRevisionMedia(expectedDraftId, document);
  });
  result = getItinerary(id, "draft");
  return result;
}
export function unpublish(id: string) {
  db().transaction(() => {
    const row = db()
      .prepare("SELECT published_revision_id FROM itineraries WHERE id=?")
      .get(id) as { published_revision_id: string | null } | undefined;
    if (!row) throw new Error("Itinerary not found.");
    if (row.published_revision_id)
      db()
        .prepare("UPDATE revisions SET state='RETIRED' WHERE id=?")
        .run(row.published_revision_id);
    db()
      .prepare(
        "UPDATE itineraries SET published_revision_id=NULL,updated_at=? WHERE id=?",
      )
      .run(now(), id);
  })();
}
export function deletePublication(id: string, revisionId: string) {
  db().transaction(() => {
    const itinerary = db()
      .prepare("SELECT * FROM itineraries WHERE id=?")
      .get(id) as ItineraryRow | undefined;
    if (!itinerary) throw new Error("Itinerary not found.");
    const revision = db()
      .prepare(
        "SELECT id FROM revisions WHERE id=? AND itinerary_id=? AND state!='DRAFT'",
      )
      .get(revisionId, id);
    if (!revision) throw new Error("Publication not found.");
    if (itinerary.published_revision_id === revisionId)
      db()
        .prepare(
          "UPDATE itineraries SET published_revision_id=NULL,updated_at=? WHERE id=?",
        )
        .run(now(), id);
    db().prepare("DELETE FROM revisions WHERE id=?").run(revisionId);
  })();
}
export function deleteItinerary(id: string) {
  db().transaction(() => {
    db()
      .prepare("UPDATE credentials SET itinerary_id=NULL WHERE itinerary_id=?")
      .run(id);
    db()
      .prepare("UPDATE sessions SET itinerary_id=NULL WHERE itinerary_id=?")
      .run(id);
    db().prepare("DELETE FROM itineraries WHERE id=?").run(id);
  })();
}
export function listMedia(): MediaRecord[] {
  return (
    db()
      .prepare("SELECT * FROM media ORDER BY created_at DESC")
      .all() as MediaRow[]
  ).map((r) => ({
    id: r.id,
    originalName: r.original_name,
    mimeType: r.mime_type,
    width: r.width,
    height: r.height,
    tags: JSON.parse(r.tags_json),
    altText: r.alt_text,
    createdAt: r.created_at,
  }));
}
export function listMediaForDocument(
  document: ItineraryDocument,
): MediaRecord[] {
  const ids = mediaIds(document);
  if (!ids.length) return [];
  return (
    db()
      .prepare(
        `SELECT * FROM media WHERE id IN (${ids.map(() => "?").join(",")})`,
      )
      .all(...ids) as MediaRow[]
  ).map((r) => ({
    id: r.id,
    originalName: r.original_name,
    mimeType: r.mime_type,
    width: r.width,
    height: r.height,
    tags: JSON.parse(r.tags_json),
    altText: r.alt_text,
    createdAt: r.created_at,
  }));
}
export function getMediaRow(id: string) {
  return db().prepare("SELECT * FROM media WHERE id=?").get(id) as
    | (MediaRow & {
        storage_key: string;
        thumbnail_key: string;
        size_bytes: number;
        sha256: string;
      })
    | undefined;
}
export function mediaIsPublished(id: string, itineraryId?: string) {
  return Boolean(
    db()
      .prepare(
        `SELECT 1 FROM revision_media rm JOIN itineraries i ON i.published_revision_id=rm.revision_id WHERE rm.media_id=?${itineraryId ? " AND i.id=?" : ""} LIMIT 1`,
      )
      .get(...(itineraryId ? [id, itineraryId] : [id])),
  );
}
export function updateMedia(id: string, tags: string[], altText: string) {
  const clean = [
    ...new Set(
      tags
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t && t !== "uploaded"),
    ),
  ];
  if (!clean.length) throw new Error("Add at least one meaningful tag.");
  if (!altText.trim()) throw new Error("Alt text is required.");
  const result = db()
    .prepare("UPDATE media SET tags_json=?,alt_text=? WHERE id=?")
    .run(JSON.stringify(clean), altText.trim(), id);
  if (!result.changes) throw new Error("Media not found.");
  return getMediaRow(id);
}
export function deleteMediaRecord(id: string) {
  if (
    db()
      .prepare("SELECT 1 FROM revision_media WHERE media_id=? UNION ALL SELECT 1 FROM safari_page_revision_media WHERE media_id=? LIMIT 1")
      .get(id,id)
  )
    throw new Error(
      "This image is referenced by a retained revision and cannot be deleted.",
    );
  const row = getMediaRow(id);
  if (!row) throw new Error("Media not found.");
  db().prepare("DELETE FROM media WHERE id=?").run(id);
  return row;
}
export function listTemplates(): TemplateRecord[] {
  return (
    db().prepare("SELECT * FROM templates ORDER BY name").all() as TemplateRow[]
  ).map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    blocks: JSON.parse(r.blocks_json),
    updatedAt: r.updated_at,
  }));
}
function cloneTemplateBlocks(blocks: ContentBlock[]) {
  return blocks.map((block) =>
    block.type === "gallery" ||
    block.type === "carousel" ||
    block.type === "imageGrid"
      ? { ...structuredClone(block), id: randomUUID(), mediaIds: [] }
      : { ...structuredClone(block), id: randomUUID() },
  );
}
export function saveTemplate(input: Omit<TemplateRecord, "updatedAt">) {
  if (!input.name?.trim()) throw new Error("Template name is required.");
  const blocks = cloneTemplateBlocks(input.blocks || []),
    stamp = now();
  db()
    .prepare(
      `INSERT INTO templates(id,name,description,blocks_json,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,blocks_json=excluded.blocks_json,updated_at=excluded.updated_at`,
    )
    .run(
      input.id || randomUUID(),
      input.name.trim(),
      input.description?.trim() || "",
      JSON.stringify(blocks),
      stamp,
      stamp,
    );
  return (
    listTemplates().find((t) => t.id === (input.id || "")) ||
    listTemplates().find((t) => t.name === input.name.trim())
  );
}
export function deleteTemplate(id: string) {
  const result = db().prepare("DELETE FROM templates WHERE id=?").run(id);
  if (!result.changes) throw new Error("Template not found.");
}
export function newBlock(type: ContentBlock["type"]): ContentBlock {
  const id = randomUUID();
  if (type === "heading") return { id, type, text: "A sense of place" };
  if (type === "subtitle") return { id, type, text: "Tailor made travel" };
  if (type === "paragraph")
    return {
      id,
      type,
      text: "Add the story, practical detail, or moment you want your traveler to remember.",
    };
  if (type === "list") return { id, type, items: ["Add a useful detail"] };
  if (type === "facts")
    return {
      id,
      type,
      title: "Day at a glance",
      items: [{ label: "Activities", value: "Game drive" }],
    };
  return { id, type, mediaIds: [] };
}
export function newSection(title = "New section"): ItinerarySection {
  return { id: randomUUID(), title, blocks: [newBlock("paragraph")] };
}
