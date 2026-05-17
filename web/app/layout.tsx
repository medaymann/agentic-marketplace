import type { Metadata } from "next";
import { Outfit, Geist_Mono } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "../lib/WalletProvider";
import { TopNav } from "@/components/basira/TopNav";
import { AnimatedBackground } from "@/components/basira/AnimatedBackground";

const sans = Outfit({ subsets: ["latin"], variable: "--font-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Basira · On-Chain Agent Marketplace",
  description: "Settlement and verification for AI agents on Solana.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`dark ${sans.variable} ${mono.variable}`}>
      <body
        className="font-sans antialiased min-h-screen"
        style={{ backgroundColor: "#08080F" }}
      >
        <WalletProvider>
          <AnimatedBackground />
          <div className="relative z-10 flex min-h-screen flex-col">
            <TopNav />
            <main className="flex-1">{children}</main>
          </div>
        </WalletProvider>
      </body>
    </html>
  );
}
