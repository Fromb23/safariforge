import { requireAdminMutation } from "@/lib/auth";import { duplicatePage } from "@/lib/pages";import { apiError,privateJson } from "@/lib/http";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{await requireAdminMutation(request);return privateJson(duplicatePage((await params).id),{status:201});}catch(error){return apiError(error)}}
