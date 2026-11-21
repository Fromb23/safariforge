import { requireSession } from "@/lib/auth";
import { listRevisions } from "@/lib/documents";
import { apiError, privateJson } from "@/lib/http";
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){try{await requireSession("ADMIN");return privateJson({revisions:listRevisions((await params).id)});}catch(error){return apiError(error)}}
