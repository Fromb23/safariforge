import { requireAdminMutation } from "@/lib/auth";import { publish } from "@/lib/documents";import { apiError, privateJson } from "@/lib/http";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{await requireAdminMutation(request);return privateJson(publish((await params).id));}catch(e){return apiError(e)}}
