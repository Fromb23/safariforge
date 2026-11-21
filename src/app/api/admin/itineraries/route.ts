import { randomUUID } from "node:crypto";
import { requireAdminMutation, requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { listItineraries } from "@/lib/documents";
import { apiError, privateJson } from "@/lib/http";
import type { ItineraryDocument } from "@/types";
export async function GET(){try{await requireSession("ADMIN");return privateJson({itineraries:listItineraries()});}catch(e){return apiError(e)}}
export async function POST(request:Request){try{await requireAdminMutation(request);const body=await request.json() as {title?:string};const stamp=new Date().toISOString(),id=randomUUID(),revisionId=randomUUID();const title=body.title?.trim()||"Untitled journey";const document:ItineraryDocument={title,subtitle:"A private journey",travelerName:"Traveler",sections:[]};const slug=`${title.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"")||"journey"}-${id.slice(0,6)}`;db().transaction(()=>{db().prepare("INSERT INTO itineraries(id,slug,draft_revision_id,created_at,updated_at) VALUES(?,?,?,?,?)").run(id,slug,revisionId,stamp,stamp);db().prepare("INSERT INTO revisions(id,itinerary_id,number,state,document_json,created_at,updated_at) VALUES(?,?,1,'DRAFT',?,?,?)").run(revisionId,id,JSON.stringify(document),stamp,stamp)})();return privateJson({id},{status:201});}catch(e){return apiError(e)}}
