import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import { randomToken,secretHash } from "../src/lib/auth-core";
import { config } from "../src/lib/config";

const origin=new URL(config.siteUrl).origin;
function provision(role:"ADMIN"|"TRAVELER"){const token=randomToken(),stamp=new Date().toISOString();const itinerary=role==="TRAVELER"?(db().prepare("SELECT id FROM itineraries WHERE published_revision_id IS NOT NULL ORDER BY created_at LIMIT 1").get() as {id:string}|undefined):undefined;db().prepare("INSERT INTO credentials(role,token_hash,version,rotated_at,itinerary_id) VALUES(?,?,1,?,?)").run(role,secretHash(token),stamp,itinerary?.id||null);return `${origin}/access/${role.toLowerCase()}?token=${token}`}
function cookieHeader(headers:Headers){return headers.getSetCookie().map((value)=>value.split(";",1)[0]).join("; ")}
function cookieValue(header:string,name:string){return header.split("; ").find((part)=>part.startsWith(`${name}=`))?.slice(name.length+1)||""}
async function text(url:string,cookie=""){const response=await fetch(url,{headers:cookie?{Cookie:cookie}:{}});return{response,body:await response.text()}}
async function ready(){for(let i=0;i<40;i++){try{const response=await fetch(origin);if(response.ok)return}catch{}await new Promise((resolve)=>setTimeout(resolve,250))}throw new Error("Server did not become ready")}
const adminUrl=provision("ADMIN"),travelerUrl=provision("TRAVELER");
const child=spawn(process.execPath,["node_modules/next/dist/bin/next","start","-p",new URL(origin).port||"3000"],{cwd:process.cwd(),env:process.env,stdio:"ignore",windowsHide:true});
try{
  await ready();
  const signedOut=await text(`${origin}/trip`);
  const adminExchange=await fetch(adminUrl,{redirect:"manual"}),travelerExchange=await fetch(travelerUrl,{redirect:"manual"});
  const adminCookie=cookieHeader(adminExchange.headers),travelerCookie=cookieHeader(travelerExchange.headers);
  const admin=await text(`${origin}/admin`,adminCookie),traveler=await text(`${origin}/trip`,travelerCookie),travelerAdmin=await text(`${origin}/admin`,travelerCookie);
  const itineraryResponse=await fetch(`${origin}/api/admin/itineraries`,{headers:{Cookie:adminCookie}});const itineraryJson=await itineraryResponse.json() as {itineraries:Array<{id:string}>};const id=itineraryJson.itineraries[0].id;
  const draft=await (await fetch(`${origin}/api/admin/itineraries/${id}`,{headers:{Cookie:adminCookie}})).json() as {revisionId:string;revisionVersion:number;document:{title:string;sections:Array<{heroMediaId?:string}>}};const publishedRow=db().prepare("SELECT r.document_json FROM revisions r JOIN itineraries i ON i.published_revision_id=r.id WHERE i.id=?").get(id) as {document_json:string};draft.document=JSON.parse(publishedRow.document_json) as typeof draft.document;const mediaId=draft.document.sections[0].heroMediaId!;
  const signedOutMedia=await fetch(`${origin}/api/media/${mediaId}/original`),travelerMedia=await fetch(`${origin}/api/media/${mediaId}/thumbnail`,{headers:{Cookie:travelerCookie}});
  const csrf=decodeURIComponent(cookieValue(adminCookie,"safariforge_admin_csrf"));const mutationHeaders={Cookie:adminCookie,Origin:origin,"X-CSRF-Token":csrf,"Content-Type":"application/json"};
  draft.document.title="DRAFT VISIBILITY MARKER";const save=await fetch(`${origin}/api/admin/itineraries/${id}`,{method:"PUT",headers:mutationHeaders,body:JSON.stringify({document:draft.document,revisionId:draft.revisionId,revisionVersion:draft.revisionVersion})});const saved=await save.json() as {revisionVersion:number};const before=await text(`${origin}/trip`,travelerCookie);const promote=await fetch(`${origin}/api/admin/itineraries/${id}/publish`,{method:"POST",headers:mutationHeaders,body:JSON.stringify({document:draft.document,revisionId:draft.revisionId,revisionVersion:saved.revisionVersion})});const after=await text(`${origin}/trip`,travelerCookie);
  const storage=db().prepare("SELECT storage_key FROM media LIMIT 1").get() as {storage_key:string};const upload=await fetch(`${origin}/api/admin/media`,{method:"POST",headers:{Cookie:adminCookie,Origin:origin,"X-CSRF-Token":csrf,"X-File-Name":"verification-upload.jpg","X-Tags":"verification,reuse","X-Alt-Text":"Verification safari photograph","Content-Type":"application/octet-stream"},body:fs.readFileSync(path.join(config.mediaDir,storage.storage_key))});
  db().transaction(()=>{db().prepare("UPDATE credentials SET token_hash=?,version=version+1,rotated_at=? WHERE role='ADMIN'").run(secretHash(randomUUID()),new Date().toISOString());db().prepare("DELETE FROM sessions WHERE role='ADMIN'").run()})();
  const rotatedAdmin=await fetch(`${origin}/api/admin/itineraries`,{headers:{Cookie:adminCookie}}),travelerAfterRotation=await text(`${origin}/trip`,travelerCookie);
  const mediaCount=(db().prepare("SELECT COUNT(*) count FROM media").get() as {count:number}).count;
  const checks={ServerReady:true,SignedOutDenied:signedOut.body.includes("access link is the key"),AdminLink:admin.body.includes("Shape the journey"),TravelerLink:traveler.body.includes("Tanzania, Written in the Wild"),RoleIsolation:travelerAdmin.body.includes("admin session is missing"),SignedOutMediaDenied:signedOutMedia.status===401,TravelerPublishedMedia:travelerMedia.ok,DraftSaved:save.ok,DraftHiddenUntilPublish:!before.body.includes("DRAFT VISIBILITY MARKER"),PublishedAtomically:promote.ok&&after.body.includes("DRAFT VISIBILITY MARKER"),UploadAccepted:upload.status===201,RotatedAdminInvalidated:rotatedAdmin.status===401,TravelerUnaffectedByAdminRotation:travelerAfterRotation.body.includes("DRAFT VISIBILITY MARKER"),ImportedOriginalRecords:mediaCount-1};
  console.log(JSON.stringify(checks,null,2));if(Object.entries(checks).some(([key,value])=>key==="ImportedOriginalRecords"?value!==43:value!==true))process.exitCode=1;
}finally{child.kill()}
