// The panels the dialog's toggles open over the panes (legacy): the filters (document types, date range, amount
// range, Clear all and Save Search) and the saved searches; and the box that names a search to save.
import { useState } from "react";

import { cn } from "../../../lib/cn.ts";
import { Bookmark, X } from "../../../lib/icons.ts";
import { Button, DatePicker, Input } from "../../common/index.ts";
import { amount, DOC_TYPES, type DocType, type Filters, hasActiveFilters } from "./filters.ts";
import type { SavedSearch } from "./history.ts";
import { DOC } from "../documents.ts";

export function FiltersPanel({
  filters,
  onChange,
  onClear,
  onSave,
}: {
  readonly filters: Filters;
  onChange(filters: Filters): void;
  onClear(): void;
  onSave(): void;
}) {
  const toggle = (type: DocType): void =>
    onChange({
      ...filters,
      types: filters.types.includes(type)
        ? filters.types.filter((t) => t !== type)
        : DOC_TYPES.filter((t) => t === type || filters.types.includes(t)),
    });
  const active = hasActiveFilters(filters);
  const amountField = (key: "amountMin" | "amountMax", placeholder: string) => (
    <Input
      inputMode="decimal"
      aria-label={`Amount ${placeholder}`}
      placeholder={placeholder}
      value={filters[key]}
      aria-invalid={filters[key] !== "" && amount(filters[key]) === undefined ? true : undefined}
      onChange={(e) => onChange({ ...filters, [key]: e.target.value })}
    />
  );
  return (
    <div className="bg-surface-sunken/30 px-4 py-3">
      <span className="mb-2 block role-field-label">Document Types</span>
      <div className="mb-4 flex flex-wrap gap-2">
        {DOC_TYPES.map((type) => {
          const on = filters.types.includes(type);
          const Icon = DOC[type].icon;
          return (
            <Button
              key={type}
              type="button"
              size="sm"
              variant="ghost"
              aria-pressed={on}
              onClick={() => toggle(type)}
              className={cn(
                on ? "bg-primary text-primary-contrast hover:bg-primary-hover" : "border-border bg-surface",
              )}
            >
              <Icon className="size-3" />
              {DOC[type].plural}
            </Button>
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <span className="mb-2 block role-field-label">Date Range</span>
          <div className="flex items-center gap-2">
            <DatePicker
              aria-label="From date"
              placeholder="From"
              value={filters.dateFrom}
              onChange={(dateFrom) => onChange({ ...filters, dateFrom })}
            />
            <span className="text-tertiary">-</span>
            <DatePicker
              aria-label="To date"
              placeholder="To"
              value={filters.dateTo}
              onChange={(dateTo) => onChange({ ...filters, dateTo })}
            />
          </div>
        </div>
        <div>
          <span className="mb-2 block role-field-label">Amount Range (₹)</span>
          <div className="flex items-center gap-2">
            {amountField("amountMin", "Min")}
            <span className="text-tertiary">-</span>
            {amountField("amountMax", "Max")}
          </div>
        </div>
      </div>
      {/* The actions keep their row whether or not a filter is set (C8). */}
      <div
        className={cn("mt-3 flex justify-end gap-2 border-t border-border pt-3", !active && "invisible")}
        aria-hidden={!active}
      >
        <Button type="button" size="sm" variant="ghost" onClick={onClear} className="text-accent">
          Clear all
          <X className="size-4" />
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onSave}>
          <Bookmark className="size-4" />
          Save Search
        </Button>
      </div>
    </div>
  );
}

export function SavedPanel({
  saved,
  onLoad,
  onDelete,
}: {
  readonly saved: readonly SavedSearch[];
  onLoad(saved: SavedSearch): void;
  onDelete(id: string): void;
}) {
  return (
    <div className="bg-surface-sunken/30 px-4 py-3">
      <span className="mb-2 flex items-center gap-1.5 role-section-title">
        <Bookmark className="size-4" />
        Saved Searches
      </span>
      {saved.length === 0 ? (
        <p className="py-2 role-empty-text">No saved searches yet</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {saved.map((s) => (
            <div key={s.id} className="flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1">
              <Button type="button" variant="ghost" size="sm" onClick={() => onLoad(s)}>
                {s.name}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => onDelete(s.id)}
                aria-label={`Delete saved search "${s.name}"`}
                className="hover:bg-error/10 hover:text-error"
              >
                <X className="size-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function SaveSearchBox({ onSave, onCancel }: { onSave(name: string): void; onCancel(): void }) {
  const [name, setName] = useState("");
  return (
    <div className="w-80 rounded-lg border border-border bg-surface p-4 shadow-xl">
      <h3 className="mb-3 role-section-title">Save Search</h3>
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Enter search name..."
        aria-label="Search name"
        className="mb-3"
        autoFocus
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter" && name.trim() !== "") onSave(name);
          else if (e.key === "Escape") onCancel();
        }}
      />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" onClick={() => onSave(name)} disabled={name.trim() === ""}>
          Save
        </Button>
      </div>
    </div>
  );
}
