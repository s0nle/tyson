import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import { Shell } from "@/components/Shell";
import "./globals.css";

const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-archivo" });

export const metadata: Metadata = {
  icons: { icon: "/tyson-radar.svg" },
  title: "Tyson — your personal sales agent",
  description: "Find contractors collecting supplier quotes right now, with the deadline that applies to you.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={archivo.variable}>
      <body className="font-sans antialiased">
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
