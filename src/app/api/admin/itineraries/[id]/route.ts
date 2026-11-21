import { requireAdminMutation, requireSession } from "@/lib/auth";
import { getItinerary, saveDraft } from "@/lib/documents";
import { apiError, privateJson } from "@/lib/http";
export async function GET(_r:Request,{params}:{params:Promise<{id:string}>}){try{await requireSession("ADMIN");const item=getItinerary((await params).id,"draft");return item?privateJson(item):privateJson({error:"Not found"},{status:404});}catch(e){return apiError(e)}}
export async function PUT(request:Request,{params}:{params:Promise<{id:string}>}){try{await requireAdminMutation(request);const item=saveDraft((await params).id,await request.json());return privateJson(item);}catch(e){return apiError(e)}}
