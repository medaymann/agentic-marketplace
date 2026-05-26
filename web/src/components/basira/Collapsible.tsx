"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

/**
 * A titled section that can collapse. Used on the task page to keep
 * supporting detail (criteria, brief, past deliverable) reachable without
 * stacking it all on screen at once. `defaultOpen` decides the initial state
 * per stage; the user can always toggle.
 */
export function Collapsible({
  title,
  defaultOpen = false,
  badge,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  badge?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card/40">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left transition-colors hover:bg-card/60"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
          {title}
          {badge && (
            <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
              {badge}
            </span>
          )}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open && <div className="border-t border-border px-5 py-4">{children}</div>}
    </div>
  );
}
