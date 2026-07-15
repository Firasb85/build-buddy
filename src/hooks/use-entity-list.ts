// Generic hook for an entity list page: load + create + update + delete
// using TanStack Query. The user supplies the plain async functions and a
// query key.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";

export interface UseEntityListOpts<T> {
  queryKey: readonly unknown[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  listFn: () => Promise<T[]>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  saveFn: (input: any) => Promise<T>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deleteFn: (input: { id: string }) => Promise<{ ok: true }>;
}

export function useEntityList<T extends { id?: string | null }>(opts: UseEntityListOpts<T>) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");

  const query = useQuery({ queryKey: opts.queryKey, queryFn: opts.listFn });

  const save = useMutation({
    mutationFn: (row: Partial<T> & { id?: string | null }) => opts.saveFn(row),
    onSuccess: () => qc.invalidateQueries({ queryKey: opts.queryKey }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => opts.deleteFn({ id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: opts.queryKey }),
  });

  const filtered = useMemo(() => {
    const rows = (query.data ?? []) as T[];
    if (!search.trim()) return rows;
    const needle = search.toLowerCase();
    return rows.filter((r) => {
      const obj = r as unknown as Record<string, unknown>;
      return Object.values(obj).some((v) =>
        typeof v === "string" ? v.toLowerCase().includes(needle) :
        typeof v === "number" ? String(v).includes(needle) : false,
      );
    });
  }, [query.data, search]);

  return { query, save, remove, filtered, search, setSearch };
}
