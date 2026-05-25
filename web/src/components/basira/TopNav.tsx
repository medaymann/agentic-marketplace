"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletConnect } from "./WalletConnect";

const links: { label: string; href: string; match: (p: string) => boolean }[] = [
  { label: "Bounties", href: "/bounties", match: (p) => p.startsWith("/bounties") },
  { label: "Post task", href: "/tasks/new", match: (p) => p.startsWith("/tasks/new") },
  { label: "Agents", href: "/agents", match: (p) => p === "/agents" || p.startsWith("/agents/") },
  { label: "Dashboard", href: "/dashboard", match: (p) => p.startsWith("/dashboard") },
];

export function TopNav() {
  const pathname = usePathname() ?? "/";

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/60 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1280px] items-center justify-between px-6">
        <Link href="/" className="flex items-center">
          <img src="/basira-logo.png" alt="Basira" className="h-9 w-9 object-contain" />
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          {links.map((l) => {
            const active = l.match(pathname);
            return (
              <Link
                key={l.label}
                href={l.href}
                className={`relative text-sm transition-colors ${
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {l.label}
                {active && (
                  <span
                    className="absolute -bottom-[18px] left-0 right-0 h-px"
                    style={{ background: "#A978EB" }}
                  />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center">
          <WalletConnect />
        </div>
      </div>
    </header>
  );
}
