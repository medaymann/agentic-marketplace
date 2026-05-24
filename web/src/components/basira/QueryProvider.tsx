"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * App-wide TanStack Query provider. The QueryClient is created per-mount via
 * useState (not at module scope) so each browser client gets its own cache and
 * server renders never share state across requests.
 *
 * Defaults: 30s staleTime keeps quick re-navigations from refetching, while
 * refetchOnWindowFocus pulls fresh data when the user returns to the tab.
 * Pages that need it (e.g. the live task page) override per-query.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: true,
            retry: 1,
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
