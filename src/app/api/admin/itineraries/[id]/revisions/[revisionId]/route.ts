import { requireAdminMutation } from "@/lib/auth";
import { deletePublication, editPublication } from "@/lib/documents";
import { apiError, privateJson } from "@/lib/http";
export async function POST(request:Request,{params}:{params:Promise<{id:string;revisionId:string}>}){try{await requireAdminMutation(request);const body=await request.json() as {draftRevisionId:string;draftRevisionVersion:number};const {id,revisionId}=await params;return privateJson(editPublication(id,revisionId,body.draftRevisionId,body.draftRevisionVersion));}catch(error){return apiError(error)}}
export async function DELETE(request:Request,{params}:{params:Promise<{id:string;revisionId:string}>}){try{await requireAdminMutation(request);const {id,revisionId}=await params;deletePublication(id,revisionId);return privateJson({ok:true});}catch(error){return apiError(error)}}
