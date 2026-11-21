import { listMedia } from "@/lib/documents";
import { listPublishedPages, pageMediaIds } from "@/lib/pages";
import { SafariJournalRenderer } from "@/components/SafariJournalRenderer";

export const dynamic = "force-dynamic";

export default function Home(){
  const pages=listPublishedPages();
  if(!pages.length)return <main className="empty-state"><p className="eyebrow">SafariForge</p><h1>The safari journal is being prepared.</h1><p>Published pages will appear here soon.</p></main>;
  const ids=new Set(pages.flatMap(page=>pageMediaIds(page.document)));
  return <SafariJournalRenderer pages={pages.map(page=>({id:page.id,document:page.document}))} media={listMedia().filter(item=>ids.has(item.id))}/>;
}
