import type { Metadata } from "next";
import { Libre_Baskerville, Montserrat, Source_Serif_4 } from "next/font/google";
import "./globals.css";

const montserrat = Montserrat({ subsets: ["latin"], variable: "--font-montserrat", display: "swap" });
const libreBaskerville = Libre_Baskerville({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-libre-baskerville", display: "swap" });
const sourceSerif = Source_Serif_4({ subsets: ["latin"], variable: "--font-source-serif", display: "swap" });

export const metadata: Metadata = {
  title: "SafariForge — Safari Journal",
  description: "A public journal of published safari stories.",
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body className={`${montserrat.variable} ${libreBaskerville.variable} ${sourceSerif.variable}`}>{children}</body></html>;
}
