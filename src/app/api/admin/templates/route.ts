import { requireAdminMutation, requireSession } from "@/lib/auth";import { listTemplates, saveTemplate } from "@/lib/documents";import { apiError, privateJson } from "@/lib/http";
export async function GET(){try{await requireSession("ADMIN");return privateJson({templates:listTemplates()});}catch(e){return apiError(e)}}
export async function POST(request:Request){try{await requireAdminMutation(request);return privateJson(saveTemplate(await request.json()),{status:201});}catch(e){return apiError(e)}}
export async function PUT(request:Request){try{await requireAdminMutation(request);return privateJson(saveTemplate(await request.json()));}catch(e){return apiError(e)}}
