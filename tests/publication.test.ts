import { beforeEach,describe,expect,it } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { getItinerary,publish,saveDraft,validateDocument } from "@/lib/documents";
import type { ItineraryDocument } from "@/types";

const document=(title="Original"):ItineraryDocument=>({title,subtitle:"Private safari",travelerName:"Traveler",sections:[{id:"stable-section-a",title:"Lodge Stay",location:"Serengeti",blocks:[{id:"stable-block-a",type:"paragraph",text:"An immutable published story."}]}]});
beforeEach(()=>{db().exec("DELETE FROM revision_media; DELETE FROM revisions; DELETE FROM itineraries;")});
describe("revision publication",()=>{
  it("keeps duplicate display names safe through distinct stable anchors",()=>{const doc=document();doc.sections.push({...doc.sections[0],id:"stable-section-b",blocks:[{...doc.sections[0].blocks[0],id:"stable-block-b"}]});expect(()=>validateDocument(doc)).not.toThrow();expect(doc.sections.map((s)=>s.id)).toEqual(["stable-section-a","stable-section-b"])});
  it("publishes atomically and leaves later draft edits invisible",()=>{const itineraryId=randomUUID(),revisionId=randomUUID(),stamp=new Date().toISOString();db().prepare("INSERT INTO itineraries(id,slug,draft_revision_id,created_at,updated_at) VALUES(?,?,?,?,?)").run(itineraryId,"test",revisionId,stamp,stamp);db().prepare("INSERT INTO revisions(id,itinerary_id,number,state,document_json,created_at,updated_at) VALUES(?,?,1,'DRAFT',?,?,?)").run(revisionId,itineraryId,JSON.stringify(document()),stamp,stamp);const live=publish(itineraryId);expect(live?.document.title).toBe("Original");saveDraft(itineraryId,document("Unpublished change"));expect(getItinerary(itineraryId,"draft")?.document.title).toBe("Unpublished change");expect(getItinerary(itineraryId,"published")?.document.title).toBe("Original")});
  it("refuses to publish an empty itinerary",()=>{expect(()=>validateDocument({...document(),sections:[]})).toThrow(/at least one section/i)});
});
