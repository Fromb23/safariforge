import type { Metadata } from "next";
import "./globals.css";
export const metadata:Metadata={title:"SafariForge — Safari Journal",description:"A public journal of published safari stories.",robots:{index:true,follow:true}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
