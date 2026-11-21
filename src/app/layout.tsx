import type { Metadata } from "next";
import "./globals.css";
export const metadata:Metadata={title:"SafariForge — Private Journey Journal",description:"Private, beautifully crafted safari itineraries.",robots:{index:false,follow:false}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
