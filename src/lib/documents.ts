import { randomUUID } from "node:crypto";
import { db } from "./db";
import type { ContentBlock, ItineraryDocument, ItinerarySection, MediaRecord, TemplateRecord } from "@/types";

type ItineraryRow = { id: string; slug: string; draft_revision_id: string; published_revision_id: string | null };
type RevisionRow = { id: string; itinerary_id: string; number: number; state: string; document_json: string; published_at: string | null; updated_at: string };
type MediaRow = { id: string; original_name: string; mime_type: string; width: number; height: number; tags_json: string; alt_text: string; created_at: string };
type TemplateRow = { id: string; name: string; description: string; blocks_json: string; updated_at: string };
const now = () => new Date().toISOString();

export function mediaIds(document: ItineraryDocument) {
  const ids = new Set<string>();
  for (const section of document.sections) {
    if (section.heroMediaId) ids.add(section.heroMediaId);
    for (const block of section.blocks) if (block.type === "gallery" || block.type === "imageGrid") block.mediaIds.forEach((id) => ids.add(id));
  }
  return [...ids];
}
export function validateDocument(value: unknown): asserts value is ItineraryDocument {
  const doc = value as ItineraryDocument;
  if (!doc || typeof doc.title !== "string" || !doc.title.trim()) throw new Error("An itinerary title is required.");
  if (!Array.isArray(doc.sections) || !doc.sections.length) throw new Error("Add at least one section before publishing.");
  const sectionIds = new Set<string>(); const blockIds = new Set<string>();
  for (const section of doc.sections) {
    if (!section.id || sectionIds.has(section.id) || !section.title?.trim()) throw new Error("Every section needs a unique stable ID and title.");
    sectionIds.add(section.id);
    if (!Array.isArray(section.blocks) || !section.blocks.length) throw new Error(`“${section.title}” needs at least one content block.`);
    for (const block of section.blocks) { if (!block.id || blockIds.has(block.id)) throw new Error("Every content block needs a unique stable ID."); blockIds.add(block.id); }
  }
  const ids = mediaIds(doc);
  if (ids.length) {
    const found = db().prepare(`SELECT COUNT(*) count FROM media WHERE id IN (${ids.map(() => "?").join(",")})`).get(...ids) as { count: number };
    if (found.count !== ids.length) throw new Error("The itinerary references media that no longer exists.");
  }
}
function syncRevisionMedia(revisionId: string, document: ItineraryDocument) {
  db().prepare("DELETE FROM revision_media WHERE revision_id=?").run(revisionId);
  const insert = db().prepare("INSERT INTO revision_media(revision_id,media_id) VALUES(?,?)"); mediaIds(document).forEach((id) => insert.run(revisionId, id));
}
export function listItineraries() {
  return db().prepare(`SELECT i.id,i.slug,i.updated_at,r.document_json,p.published_at FROM itineraries i JOIN revisions r ON r.id=i.draft_revision_id LEFT JOIN revisions p ON p.id=i.published_revision_id ORDER BY i.updated_at DESC`).all()
    .map((row) => { const item = row as { id: string; slug: string; updated_at: string; document_json: string; published_at: string | null }; const doc = JSON.parse(item.document_json) as ItineraryDocument; return { id: item.id, slug: item.slug, title: doc.title, subtitle: doc.subtitle, sectionCount: doc.sections.length, updatedAt: item.updated_at, publishedAt: item.published_at }; });
}
export function getItinerary(id: string, mode: "draft" | "published") {
  const pointer = mode === "draft" ? "draft_revision_id" : "published_revision_id";
  const row = db().prepare(`SELECT i.id,i.slug,r.* FROM itineraries i JOIN revisions r ON r.id=i.${pointer} WHERE i.id=?`).get(id) as (RevisionRow & { slug: string }) | undefined;
  return row ? { id: row.itinerary_id, slug: row.slug, revisionId: row.id, revisionNumber: row.number, publishedAt: row.published_at, updatedAt: row.updated_at, document: JSON.parse(row.document_json) as ItineraryDocument } : null;
}
export function getPublishedBySlug(slug?: string) {
  const row = db().prepare(`SELECT i.id,i.slug,r.* FROM itineraries i JOIN revisions r ON r.id=i.published_revision_id ${slug ? "WHERE i.slug=?" : "ORDER BY r.published_at DESC LIMIT 1"}`).get(...(slug ? [slug] : [])) as (RevisionRow & { slug: string }) | undefined;
  return row ? { id: row.itinerary_id, slug: row.slug, revisionId: row.id, revisionNumber: row.number, publishedAt: row.published_at, document: JSON.parse(row.document_json) as ItineraryDocument } : null;
}
export function saveDraft(id: string, document: ItineraryDocument) {
  validateDocument(document); const itinerary = db().prepare("SELECT * FROM itineraries WHERE id=?").get(id) as ItineraryRow | undefined; if (!itinerary) throw new Error("Itinerary not found.");
  db().transaction(() => { db().prepare("UPDATE revisions SET document_json=?,updated_at=? WHERE id=? AND state='DRAFT'").run(JSON.stringify(document), now(), itinerary.draft_revision_id); syncRevisionMedia(itinerary.draft_revision_id, document); db().prepare("UPDATE itineraries SET updated_at=? WHERE id=?").run(now(), id); })();
  return getItinerary(id, "draft");
}
export function publish(id: string) {
  const itinerary = db().prepare("SELECT * FROM itineraries WHERE id=?").get(id) as ItineraryRow | undefined; if (!itinerary) throw new Error("Itinerary not found.");
  const draft = db().prepare("SELECT * FROM revisions WHERE id=?").get(itinerary.draft_revision_id) as RevisionRow; const document = JSON.parse(draft.document_json) as ItineraryDocument; validateDocument(document);
  const publishedAt = now(); const nextId = randomUUID();
  db().transaction(() => {
    if (itinerary.published_revision_id) db().prepare("UPDATE revisions SET state='RETIRED' WHERE id=?").run(itinerary.published_revision_id);
    db().prepare("UPDATE revisions SET state='PUBLISHED',published_at=?,updated_at=? WHERE id=?").run(publishedAt, publishedAt, draft.id);
    db().prepare("INSERT INTO revisions(id,itinerary_id,number,state,document_json,created_at,updated_at) VALUES(?,?,?,'DRAFT',?,?,?)").run(nextId, id, draft.number + 1, draft.document_json, publishedAt, publishedAt);
    syncRevisionMedia(nextId, document); db().prepare("UPDATE itineraries SET draft_revision_id=?,published_revision_id=?,updated_at=? WHERE id=?").run(nextId, draft.id, publishedAt, id);
  })();
  return getItinerary(id, "published");
}
export function unpublish(id: string) {
  db().transaction(() => { const row = db().prepare("SELECT published_revision_id FROM itineraries WHERE id=?").get(id) as { published_revision_id: string | null } | undefined; if (!row) throw new Error("Itinerary not found."); if (row.published_revision_id) db().prepare("UPDATE revisions SET state='RETIRED' WHERE id=?").run(row.published_revision_id); db().prepare("UPDATE itineraries SET published_revision_id=NULL,updated_at=? WHERE id=?").run(now(), id); })();
}
export function listMedia(): MediaRecord[] { return (db().prepare("SELECT * FROM media ORDER BY created_at DESC").all() as MediaRow[]).map((r) => ({ id:r.id,originalName:r.original_name,mimeType:r.mime_type,width:r.width,height:r.height,tags:JSON.parse(r.tags_json),altText:r.alt_text,createdAt:r.created_at })); }
export function getMediaRow(id: string) { return db().prepare("SELECT * FROM media WHERE id=?").get(id) as (MediaRow & { storage_key:string;thumbnail_key:string;size_bytes:number;sha256:string }) | undefined; }
export function mediaIsPublished(id: string) { return Boolean(db().prepare(`SELECT 1 FROM revision_media rm JOIN itineraries i ON i.published_revision_id=rm.revision_id WHERE rm.media_id=? LIMIT 1`).get(id)); }
export function updateMedia(id: string, tags: string[], altText: string) { db().prepare("UPDATE media SET tags_json=?,alt_text=? WHERE id=?").run(JSON.stringify([...new Set(tags.map((t)=>t.trim().toLowerCase()).filter(Boolean))]), altText.trim(), id); return getMediaRow(id); }
export function listTemplates(): TemplateRecord[] { return (db().prepare("SELECT * FROM templates ORDER BY name").all() as TemplateRow[]).map((r)=>({id:r.id,name:r.name,description:r.description,blocks:JSON.parse(r.blocks_json),updatedAt:r.updated_at})); }
export function saveTemplate(input: Omit<TemplateRecord,"updatedAt">) { const stamp=now(); db().prepare(`INSERT INTO templates(id,name,description,blocks_json,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,blocks_json=excluded.blocks_json,updated_at=excluded.updated_at`).run(input.id,input.name,input.description,JSON.stringify(input.blocks),stamp,stamp); return listTemplates().find((t)=>t.id===input.id); }
export function newBlock(type: ContentBlock["type"]): ContentBlock { const id=randomUUID(); if(type==="heading")return{id,type,text:"A sense of place"}; if(type==="paragraph")return{id,type,text:"Add the story, practical detail, or moment you want your traveler to remember."}; if(type==="list")return{id,type,items:["Add a useful detail"]}; if(type==="facts")return{id,type,title:"Day at a glance",items:[{label:"Activities",value:"Game drive"}]}; return{id,type,mediaIds:[]}; }
export function newSection(title="New section"): ItinerarySection { return {id:randomUUID(),title,blocks:[newBlock("paragraph")]}; }
