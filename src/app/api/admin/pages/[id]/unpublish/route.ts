import { requireAdminMutation } from "@/lib/auth";import { unpublishPage } from "@/lib/pages";import { apiError,privateJson } from "@/lib/http";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{await requireAdminMutation(request);unpublishPage((await params).id);return privateJson({ok:true});}catch(error){return apiError(error)}}
