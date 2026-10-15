import type { RouteOutput } from "@senstosales/schemas";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { apiQuery } from "../../lib/api.ts";
import { Autocomplete, Button } from "../common/index.ts";

export type SearchHit = RouteOutput<"search.query">[number];

export interface DocPickerProps {
  /** The document types offered: POs for a DC, DCs and POs for an invoice. */
  readonly types: readonly ("po" | "dc")[];
  readonly placeholder: string;
  onLink(hit: SearchHit): void;
}

/**
 * The create forms' source search (legacy header autocomplete and Link): the global search's hits of `types`; picking
 * one links it, as does Link after a pick.
 */
export function DocPicker({ types, placeholder, onLink }: DocPickerProps) {
  const [q, setQ] = useState("");
  const [chosen, setChosen] = useState<SearchHit | null>(null);
  const query = q.trim();
  const hits = useQuery({
    ...apiQuery("search.query", { query: { q: query, types: [...types] } }),
    enabled: query !== "",
  });
  const found = (hits.data ?? []).filter((hit) => types.some((type) => type === hit.type));
  const options = found.map((hit) => ({
    value: hit.id,
    label: hit.number,
    subLabel: [hit.type.toUpperCase(), hit.party].filter(Boolean).join(" • "),
  }));
  return (
    <div className="mr-2 flex items-center gap-2">
      <Autocomplete
        className="w-52"
        aria-label={placeholder}
        placeholder={placeholder}
        options={options}
        value={chosen?.id ?? ""}
        loading={hits.isFetching}
        onSearch={setQ}
        onChange={(id) => {
          const hit = found.find((h) => h.id === id) ?? null;
          setChosen(hit);
          if (hit) onLink(hit);
        }}
      />
      <Button variant="outline" size="sm" disabled={chosen === null} onClick={() => chosen && onLink(chosen)}>
        Link
      </Button>
    </div>
  );
}
