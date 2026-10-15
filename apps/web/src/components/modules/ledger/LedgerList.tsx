import { fmtInstantDateTime } from "@senstosales/schemas";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { useListSearch } from "../../../hooks/useListSearch.ts";
import { useSearchText } from "../../../hooks/useSearchText.ts";
import { apiQuery } from "../../../lib/api.ts";
import { searchText } from "../../../lib/search.ts";
import { Eye } from "../../../lib/icons.ts";
import { titleCase } from "../../../lib/text.ts";
import {
  Badge,
  Button,
  type Column,
  DataTable,
  ListToolbar,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  tableQuery,
} from "../../common/index.ts";
import { type AuditRow, LogDetailDialog } from "./LogDetailDialog.tsx";
import { MODULES, moduleOf } from "./modules.ts";
import type { LedgerSearch } from "./search.ts";

/** The Module select's value for no filter (Radix Select takes no empty value). */
const ALL = "ALL";

const COLUMNS: Column<AuditRow>[] = [
  {
    key: "at",
    header: "Timestamp",
    width: "210px",
    sortable: true,
    render: (r) => <span className="tabular-nums">{fmtInstantDateTime(r.at)}</span>,
  },
  {
    key: "entityType",
    header: "Module",
    width: "160px",
    render: (r) => {
      const module = moduleOf(r.entityType);
      return <Badge color={module.color}>{module.label}</Badge>;
    },
  },
  {
    key: "action",
    header: "Event / Summary",
    width: "40%",
    sortable: true,
    title: (r) => titleCase(r.action),
    render: (r) => titleCase(r.action),
  },
  {
    key: "entityId",
    header: "Entity",
    width: "260px",
    title: (r) => r.entityId,
    render: (r) => <span className="role-reference-number">{r.entityId}</span>,
  },
  {
    key: "view",
    header: "",
    width: "60px",
    align: "right",
    render: () => (
      <Button variant="ghost" size="icon" aria-label="View log details">
        <Eye className="text-tertiary" aria-hidden />
      </Button>
    ),
  },
];

/**
 * `/system/ledger` (SPEC-17 §2): the audit log, newest first, filtered by module and search text, each row opening
 * its details. Read-only: no reset, delete or prune control (INV-83).
 */
export function LedgerList() {
  const list = useListSearch<LedgerSearch>();
  const { search, setFilters } = list;
  const query = {
    page: search.page,
    pageSize: search.pageSize,
    sort: search.sort,
    dir: search.dir,
    q: searchText(search.q),
    entityType: search.entityType,
  };
  const entries = useQuery(apiQuery("audit.list", { query }));
  const searchBox = useSearchText(search.q, (q) => setFilters({ q }));
  const [viewing, setViewing] = useState<AuditRow | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="System Audit Ledger" subtitle="Unified diagnostic trail for system events" />
      <div className="overflow-hidden rounded-md border border-border bg-surface">
        <ListToolbar search={{ ...searchBox, placeholder: "Search audit trail..." }}>
          <Select
            value={search.entityType ?? ALL}
            onValueChange={(v) => setFilters({ entityType: v === ALL ? undefined : v })}
          >
            <SelectTrigger aria-label="Module" className="h-8 w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All Categories</SelectItem>
              {Object.entries(MODULES).map(([type, { label }]) => (
                <SelectItem key={type} value={type}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </ListToolbar>
        <DataTable
          columns={COLUMNS}
          rows={entries.data?.items}
          {...tableQuery(entries)}
          {...list.table}
          emptyText="No audit entries found"
          onRowClick={setViewing}
        />
      </div>
      <LogDetailDialog entry={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}
