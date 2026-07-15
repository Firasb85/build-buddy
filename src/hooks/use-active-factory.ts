// Hook: tracks the currently active factory id (persisted in localStorage).
// Use `useQuery` to refresh the React tree when the user switches.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { db } from "@/lib/local-db";
import { ACTIVE_FACTORY_KEY } from "@/lib/local-db";

export function useActiveFactory() {
  const qc = useQueryClient();

  // Read & watch the active factory id.
  const query = useQuery({
    queryKey: ["active-factory"],
    queryFn: async () => {
      // Get id from localStorage
      const id = typeof window === "undefined" ? null : window.localStorage.getItem(ACTIVE_FACTORY_KEY);
      if (!id) return null;
      // Verify it still exists in the DB
      const factory = await db().factories.get(id);
      return factory ?? null;
    },
  });

  // Also fetch all factories so the switcher has the list
  const factories = useQuery({
    queryKey: ["factories"],
    queryFn: async () => (await db().factories.toArray()).sort((a, b) => a.name_en.localeCompare(b.name_en)),
  });

  // Helper to switch factory
  function setFactory(id: string) {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(ACTIVE_FACTORY_KEY, id);
    }
    // Invalidate every query so they refetch for the new factory
    qc.invalidateQueries();
  }

  return {
    factory: query.data ?? null,
    factories: factories.data ?? [],
    isLoading: query.isLoading || factories.isLoading,
    setFactory,
  };
}
