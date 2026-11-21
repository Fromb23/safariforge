import { PrivateAccess } from "@/components/PrivateAccess";
export default async function Home({searchParams}:{searchParams:Promise<{access?:string;role?:string}>}){const q=await searchParams;return <PrivateAccess role={q.access==="invalid"&&(q.role==="admin"||q.role==="traveler")?q.role:undefined}/>}
