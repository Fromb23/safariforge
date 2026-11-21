import { requireAdminMutation } from "@/lib/auth";
import { apiError, privateJson } from "@/lib/http";
export async function POST(request:Request){try{await requireAdminMutation(request);return privateJson({error:"Traveler assignment is retired. The shared visitor link sees every included published Safari Page.",code:"ASSIGNMENT_RETIRED"},{status:410});}catch(error){return apiError(error)}}
