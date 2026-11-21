import { spawn } from "node:child_process";
import { db } from "../src/lib/db";
import { createPage,getPage,publishPage } from "../src/lib/pages";
import { randomToken,secretHash } from "../src/lib/auth-core";
import { config } from "../src/lib/config";
import type { Role,SafariPageDocument } from "../src/types";

const origin=new URL(config.siteUrl).origin;
function provision(role:Role){const token=randomToken(),stamp=new Date().toISOString();db().prepare("INSERT INTO credentials(role,token_hash,version,rotated_at) VALUES(?,?,1,?)").run(role,secretHash(token),stamp);return `${origin}/access/${role.toLowerCase()}?token=${token}`}
function cookies(headers:Headers){return headers.getSetCookie().map(value=>value.split(';',1)[0]).join('; ')}
function cookieValue(header:string,name:string){return header.split('; ').find(part=>part.startsWith(`${name}=`))?.slice(name.length+1)||''}
async function page(url:string,cookie=''){const response=await fetch(url,{headers:cookie?{Cookie:cookie}:{}});return{response,body:await response.text()}}
async function ready(){for(let attempt=0;attempt<40;attempt++){try{if((await fetch(origin)).ok)return}catch{}await new Promise(resolve=>setTimeout(resolve,250))}throw new Error('Server did not become ready')}
const content=(title:string,text:string):SafariPageDocument=>({leftPanel:{eyebrow:'Safari journal',title,startDate:'2027-01-01',location:'Serengeti',overlayPosition:'bottom-left'},rightPanel:{blocks:[{id:crypto.randomUUID(),type:'subtitle',text:'Tailor made travel'},{id:crypto.randomUUID(),type:'paragraph',text}]}});
const created=createPage(),initial=getPage(created.id,'draft')!;publishPage(created.id,content('Safari Note','Published opening'),initial.revisionId,initial.revisionVersion);
const second=createPage(),secondDraft=getPage(second.id,'draft')!;publishPage(second.id,content('Safari Day','Second published page'),secondDraft.revisionId,secondDraft.revisionVersion);
const adminUrl=provision('ADMIN'),travelerUrl=provision('TRAVELER');
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p',new URL(origin).port||'3000'],{cwd:process.cwd(),env:process.env,stdio:'ignore',windowsHide:true});
try{
 await ready();
 const signedOut=await page(`${origin}/trip`),adminExchange=await fetch(adminUrl,{redirect:'manual'}),travelerExchange=await fetch(travelerUrl,{redirect:'manual'}),adminCookie=cookies(adminExchange.headers),travelerCookie=cookies(travelerExchange.headers);
 const admin=await page(`${origin}/admin`,adminCookie),traveler=await page(`${origin}/trip`,travelerCookie),travelerAdmin=await page(`${origin}/admin`,travelerCookie);
 const draft=await (await fetch(`${origin}/api/admin/pages/${created.id}`,{headers:{Cookie:adminCookie}})).json() as {revisionId:string;revisionVersion:number;document:SafariPageDocument};draft.document.rightPanel.blocks.push({id:crypto.randomUUID(),type:'paragraph',text:'DRAFT VISIBILITY MARKER'});
 const csrf=decodeURIComponent(cookieValue(adminCookie,'safariforge_admin_csrf')),headers={Cookie:adminCookie,Origin:origin,'X-CSRF-Token':csrf,'Content-Type':'application/json'};
 const save=await fetch(`${origin}/api/admin/pages/${created.id}`,{method:'PUT',headers,body:JSON.stringify({document:draft.document,revisionId:draft.revisionId,revisionVersion:draft.revisionVersion})}),saved=await save.json() as {revisionVersion:number};
 const before=await page(`${origin}/trip`,travelerCookie),publish=await fetch(`${origin}/api/admin/pages/${created.id}/publish`,{method:'POST',headers,body:JSON.stringify({document:draft.document,revisionId:draft.revisionId,revisionVersion:saved.revisionVersion})}),after=await page(`${origin}/trip`,travelerCookie);
 const csrfDenied=await fetch(`${origin}/api/admin/pages`,{method:'POST',headers:{Cookie:adminCookie,Origin:origin,'Content-Type':'application/json'},body:'{}'}),travelerMutation=await fetch(`${origin}/api/admin/pages`,{method:'POST',headers:{Cookie:travelerCookie,Origin:origin,'Content-Type':'application/json'},body:'{}'});
 const checks={ServerReady:true,SignedOutDenied:signedOut.body.includes('access link is the key'),AdminStudio:admin.body.includes('Your shared journal'),SharedJournal:traveler.body.includes('Safari Note')&&traveler.body.includes('Safari Day'),RoleIsolation:travelerAdmin.body.includes('admin session is missing'),DraftSaved:save.ok,DraftHiddenUntilPublish:!before.body.includes('DRAFT VISIBILITY MARKER'),PublishedAtomically:publish.ok&&after.body.includes('DRAFT VISIBILITY MARKER'),CsrfEnforced:csrfDenied.status===403,VisitorCannotMutateAdmin:travelerMutation.status===401};
 console.log(JSON.stringify(checks,null,2));if(Object.values(checks).some(value=>value!==true))process.exitCode=1;
}finally{child.kill()}
