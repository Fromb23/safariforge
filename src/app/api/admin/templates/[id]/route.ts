import { requireAdminMutation } from "@/lib/auth";
import { deleteTemplate } from "@/lib/documents";
import { apiError, privateJson } from "@/lib/http";
export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}){try{await requireAdminMutation(request);deleteTemplate((await params).id);return privateJson({ok:true});}catch(error){return apiError(error)}}
