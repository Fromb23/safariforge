import { requireAdminMutation, requireSession } from "@/lib/auth";
import { createPage, listPages } from "@/lib/pages";
import { listTemplates } from "@/lib/documents";
import { apiError, privateJson } from "@/lib/http";
export async function GET(){try{await requireSession("ADMIN");return privateJson({pages:listPages()});}catch(error){return apiError(error)}}
export async function POST(request:Request){try{await requireAdminMutation(request);const body=await request.json() as {title?:string;presetId?:string};const preset=body.presetId?listTemplates().find(item=>item.id===body.presetId):undefined;return privateJson(createPage(body.title?.trim()||preset?.name||"Untitled Safari Page",preset?.blocks||[]),{status:201});}catch(error){return apiError(error)}}
