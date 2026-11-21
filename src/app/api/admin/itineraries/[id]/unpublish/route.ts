import { requireAdminMutation } from "@/lib/auth";import { unpublish } from "@/lib/documents";import { apiError, privateJson } from "@/lib/http";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{await requireAdminMutation(request);unpublish((await params).id);return privateJson({ok:true});}catch(e){return apiError(e)}}
