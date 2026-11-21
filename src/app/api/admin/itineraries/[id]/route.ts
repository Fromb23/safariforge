import { requireAdminMutation, requireSession } from "@/lib/auth";
import { deleteItinerary, getItinerary, saveDraft } from "@/lib/documents";
import { apiError, privateJson } from "@/lib/http";
export async function GET(_r:Request,{params}:{params:Promise<{id:string}>}){try{await requireSession("ADMIN");const item=getItinerary((await params).id,"draft");return item?privateJson(item):privateJson({error:"Not found"},{status:404});}catch(e){return apiError(e)}}
export async function PUT(request:Request,{params}:{params:Promise<{id:string}>}){try{await requireAdminMutation(request);const body=await request.json() as {document:unknown;revisionId:string;revisionVersion:number};const item=saveDraft((await params).id,body.document as never,body.revisionId,body.revisionVersion);return privateJson(item);}catch(e){return apiError(e)}}
export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}){try{await requireAdminMutation(request);deleteItinerary((await params).id);return privateJson({ok:true});}catch(e){return apiError(e)}}
