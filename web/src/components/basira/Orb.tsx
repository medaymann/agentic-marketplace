import type { LucideIcon } from "lucide-react";

export function Orb({ size = 40, icon: Icon }: { size?: number; icon?: LucideIcon }) {
  return (
    <div
      aria-hidden
      className="shrink-0 rounded-full flex items-center justify-center"
      style={{
        width: size,
        height: size,
        background:
          "radial-gradient(circle at 30% 30%, #DA5BCB 0%, #A978EB 45%, #4a2a7a 100%)",
        boxShadow: "inset 0 0 8px rgba(0,0,0,0.4), 0 0 20px rgba(169,120,235,0.25)",
      }}
    >
      {Icon && (
        <Icon
          style={{
            width: size * 0.5,
            height: size * 0.5,
            color: "white",
            filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.4))",
          }}
          strokeWidth={2}
        />
      )}
    </div>
  );
}
