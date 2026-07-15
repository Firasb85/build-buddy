// Generic hook for an entity list page: load + create + update + delete
// using TanStack Query + a server fn pair. The user only supplies the
// server functions and a query key.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";

export interface UseEntityListOpts<T> {
  queryKey: readonly unknown[];
  // Server-fn types are complex; use any to avoid coupling this hook to the generated types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  listFn: (...args: any[]) => Promise<T[]>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  saveFn: (data: { data: any }) => Promise<T | null>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deleteFn: (data: { data: { id: string } }) => Promise<{ ok: true }>;
}

export function useEntityList<T extends { id?: string | null }>(opts: UseEntityListOpts<T>) {
  const qc = useQueryClient();
  // useServerFn is generic and infers from the wrapped function; we pass `as any` to decouple.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const listServer = useServerFn(opts.listFn as any) as unknown as () => Promise<T[]>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const saveServer = useServerFn(opts.saveFn as any) as unknown as (input: { data: Partial<T> }) => Promise<T | null>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const delServer = useServerFn(opts.deleteFn as any) as unknown as (input: { data: { id: string } }) => Promise<{ ok: true }>;
  const [search, setSearch] = useState("");

  const query = useQuery({ queryKey: opts.queryKey, queryFn: () => listServer() });

  const save = useMutation({
    mutationFn: (row: Partial<T> & { id?: string | null }) => saveServer({ data: row }),
    onSuccess: () => qc.invalidateQueries({ queryKey: opts.queryKey }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => delServer({ data: { id } }),
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
