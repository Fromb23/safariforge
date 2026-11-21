import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { db,migrate } from "../src/lib/db";
import { createPage,getPage,migrateLegacyPages,publishPage } from "../src/lib/pages";
import { randomToken,secretHash } from "../src/lib/auth-core";
import { config } from "../src/lib/config";
import type { Role,SafariPageDocument } from "../src/types";

const origin=new URL(config.siteUrl).origin;
migrate();migrateLegacyPages();
function fixtureMedia(name:string){const id=crypto.randomUUID(),storageKey=`${crypto.randomUUID()}.jpg`,thumbnailKey=`${crypto.randomUUID()}.webp`,stamp=new Date().toISOString();fs.mkdirSync(config.mediaDir,{recursive:true});fs.writeFileSync(path.join(config.mediaDir,storageKey),Buffer.from('public-media-fixture'));fs.writeFileSync(path.join(config.mediaDir,thumbnailKey),Buffer.from('thumbnail-fixture'));db().prepare("INSERT INTO media(id,storage_key,thumbnail_key,original_name,mime_type,size_bytes,sha256,width,height,tags_json,alt_text,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(id,storageKey,thumbnailKey,name,'image/jpeg',20,crypto.randomUUID(),10,10,'[\"fixture\"]',name,stamp);return id}
function provision(role:Role){const token=randomToken(),stamp=new Date().toISOString();db().prepare("INSERT INTO credentials(role,token_hash,version,rotated_at) VALUES(?,?,1,?)").run(role,secretHash(token),stamp);return `${origin}/access/${role.toLowerCase()}?token=${token}`}
function cookies(headers:Headers){return headers.getSetCookie().map(value=>value.split(';',1)[0]).join('; ')}
function cookieValue(header:string,name:string){return header.split('; ').find(part=>part.startsWith(`${name}=`))?.slice(name.length+1)||''}
async function page(url:string,cookie=''){const response=await fetch(url,{headers:cookie?{Cookie:cookie}:{}});return{response,body:await response.text()}}
async function ready(){for(let attempt=0;attempt<40;attempt++){try{if((await fetch(origin)).ok)return}catch{}await new Promise(resolve=>setTimeout(resolve,250))}throw new Error('Server did not become ready')}
const content=(title:string,text:string,heroMediaId?:string):SafariPageDocument=>({leftPanel:{eyebrow:'Safari journal',title,startDate:'2027-01-01',location:'Serengeti',overlayPosition:'bottom-left',heroMediaId},rightPanel:{blocks:[{id:crypto.randomUUID(),type:'subtitle',text:'Tailor made travel'},{id:crypto.randomUUID(),type:'paragraph',text}]}});
const publicMediaId=fixtureMedia('published.jpg'),privateMediaId=fixtureMedia('draft-only.jpg');
const created=createPage(),initial=getPage(created.id,'draft')!;publishPage(created.id,content('Safari Note','Published opening',publicMediaId),initial.revisionId,initial.revisionVersion);
const second=createPage(),secondDraft=getPage(second.id,'draft')!;publishPage(second.id,content('Safari Day','Second published page'),secondDraft.revisionId,secondDraft.revisionVersion);
const adminUrl=provision('ADMIN');
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p',new URL(origin).port||'3000'],{cwd:process.cwd(),env:process.env,stdio:'ignore',windowsHide:true});
try{
 await ready();
 const publicJournal=await page(origin),adminExchange=await fetch(adminUrl,{redirect:'manual'}),adminCookie=cookies(adminExchange.headers);
 const admin=await page(`${origin}/admin`,adminCookie),signedOutAdmin=await page(`${origin}/admin`),legacyTraveler=await fetch(`${origin}/access/traveler?token=obsolete`,{redirect:'manual'});
 const draft=await (await fetch(`${origin}/api/admin/pages/${created.id}`,{headers:{Cookie:adminCookie}})).json() as {revisionId:string;revisionVersion:number;document:SafariPageDocument};draft.document.rightPanel.blocks.push({id:crypto.randomUUID(),type:'paragraph',text:'DRAFT VISIBILITY MARKER'});
 const csrf=decodeURIComponent(cookieValue(adminCookie,'safariforge_admin_csrf')),headers={Cookie:adminCookie,Origin:origin,'X-CSRF-Token':csrf,'Content-Type':'application/json'};
 const save=await fetch(`${origin}/api/admin/pages/${created.id}`,{method:'PUT',headers,body:JSON.stringify({document:draft.document,revisionId:draft.revisionId,revisionVersion:draft.revisionVersion})}),saved=await save.json() as {revisionVersion:number};
 const before=await page(origin),publish=await fetch(`${origin}/api/admin/pages/${created.id}/publish`,{method:'POST',headers,body:JSON.stringify({document:draft.document,revisionId:draft.revisionId,revisionVersion:saved.revisionVersion})}),after=await page(origin);
 const csrfDenied=await fetch(`${origin}/api/admin/pages`,{method:'POST',headers:{Cookie:adminCookie,Origin:origin,'Content-Type':'application/json'},body:'{}'}),visitorMutation=await fetch(`${origin}/api/admin/pages`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'}),publicMedia=await fetch(`${origin}/api/media/${publicMediaId}/original`),privateMedia=await fetch(`${origin}/api/media/${privateMediaId}/original`);
 const checks={ServerReady:true,RootIsPublic:publicJournal.response.ok&&publicJournal.body.includes('Safari Note')&&publicJournal.body.includes('Safari Day'),AdminStudio:admin.body.includes('Your public journal'),DesktopAdminNotice:admin.body.includes('available on desktop'),AdminStillPrivate:signedOutAdmin.body.includes('admin session is missing'),LegacyTravelerLinkRetired:legacyTraveler.status===303&&legacyTraveler.headers.get('location')===`${origin}/`,DraftSaved:save.ok,DraftHiddenUntilPublish:!before.body.includes('DRAFT VISIBILITY MARKER'),PublishedAtomically:publish.ok&&after.body.includes('DRAFT VISIBILITY MARKER'),PublishingPreservesOtherPages:after.body.includes('Safari Day'),CsrfEnforced:csrfDenied.status===403,VisitorCannotMutateAdmin:visitorMutation.status===401,PublishedMediaPublic:publicMedia.status===200,UnpublishedMediaHidden:privateMedia.status===404};
 console.log(JSON.stringify(checks,null,2));if(Object.values(checks).some(value=>value!==true))process.exitCode=1;
}finally{child.kill()}
