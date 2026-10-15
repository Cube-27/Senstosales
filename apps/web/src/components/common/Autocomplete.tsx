import { type KeyboardEvent, useId, useState } from "react";

import { Check, Loading, Search, X } from "../../lib/icons.ts";
import { cn } from "../../lib/cn.ts";
import { Button } from "../ui/button.tsx";
import { Input } from "../ui/input.tsx";

export interface AutocompleteOption {
  readonly value: string;
  readonly label: string;
  readonly subLabel?: string;
}

export interface AutocompleteProps {
  readonly options: readonly AutocompleteOption[];
  /** The chosen option's value, or `""`. */
  readonly value: string;
  onChange(value: string, option?: AutocompleteOption): void;
  /** Called with the typed text, for options loaded by query. */
  onSearch?(query: string): void;
  readonly loading?: boolean;
  readonly placeholder?: string;
  readonly disabled?: boolean;
  readonly id?: string;
  readonly "aria-label"?: string;
  /** Set by FormField: the help or error text, and the field state. */
  readonly "aria-describedby"?: string;
  readonly "aria-invalid"?: boolean;
  readonly "aria-required"?: boolean;
  readonly className?: string;
}

/**
 * The legacy autocomplete: a search field that lists the given options under it (a caller filters them through `onSearch`), with a clear button. Keyboard:
 * ArrowUp/ArrowDown move through the list, Enter picks, Escape closes. Leaving the field without picking restores the
 * chosen option's label. The list floats over the page, so opening it moves nothing (C8).
 */
export function Autocomplete({
  options,
  value,
  onChange,
  onSearch,
  loading = false,
  placeholder = "Select...",
  disabled = false,
  id,
  "aria-label": ariaLabel,
  className,
  ...field
}: AutocompleteProps) {
  const listId = useId();
  const chosen = options.find((o) => o.value === value);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(chosen?.label ?? "");
  const [active, setActive] = useState(-1);
  // Outside a search the field shows the chosen option's label.
  const text = open ? query : (chosen?.label ?? value);

  const pick = (option: AutocompleteOption): void => {
    onChange(option.value, option);
    setQuery(option.label);
    setOpen(false);
  };
  const move = (step: number): void => {
    setOpen(true);
    if (options.length > 0) setActive((i) => (i + step + options.length) % options.length);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      move(e.key === "ArrowDown" ? 1 : -1);
    } else if (e.key === "Enter" && open && options[active]) {
      e.preventDefault();
      pick(options[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className={cn("relative w-full", className)}>
      <Input
        {...field}
        id={id}
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        disabled={disabled}
        value={text}
        placeholder={placeholder}
        className="pr-8 pl-9"
        onFocus={() => {
          setQuery(text);
          setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(-1);
          setOpen(true);
          onSearch?.(e.target.value);
        }}
        onKeyDown={onKeyDown}
      />
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-tertiary"
        aria-hidden
      />
      <Trailing
        loading={loading}
        hidden={text === ""}
        disabled={disabled}
        onClear={() => {
          setQuery("");
          onChange("");
        }}
      />
      <OptionList
        id={listId}
        aria-label={ariaLabel}
        open={open}
        options={options}
        value={value}
        active={active}
        emptyText={loading ? null : query ? "No results found." : "Type to search..."}
        onPick={pick}
      />
    </div>
  );
}

interface OptionListProps {
  readonly id: string;
  readonly "aria-label": string | undefined;
  readonly open: boolean;
  readonly options: readonly AutocompleteOption[];
  readonly value: string;
  readonly active: number;
  /** Shown when there are no options; none while they load. */
  readonly emptyText: string | null;
  onPick(option: AutocompleteOption): void;
}

/** The floating listbox under the field; option ids are `<id>-<index>` for `aria-activedescendant`. */
function OptionList({ id, "aria-label": ariaLabel, open, options, value, active, emptyText, onPick }: OptionListProps) {
  return (
    <ul
      id={id}
      role="listbox"
      aria-label={ariaLabel}
      hidden={!open}
      className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-border/50 bg-surface p-1 shadow-dropdown"
    >
      {options.length === 0 && emptyText && <li className="py-6 text-center role-helper-text">{emptyText}</li>}
      {options.map((option, i) => (
        <li
          key={option.value}
          id={`${id}-${i}`}
          role="option"
          aria-selected={option.value === value}
          className={cn(
            "flex cursor-pointer items-center rounded-lg px-3 py-2 select-none hover:bg-primary/10",
            i === active && "bg-primary/10",
            option.value === value && "bg-primary/5 text-accent",
          )}
          // Picks on press and keeps the field focused, so blur does not close the list first; the keyboard picks
          // through the field (aria-activedescendant).
          onMouseDown={(e) => {
            e.preventDefault();
            onPick(option);
          }}
        >
          <span className="flex flex-col gap-0.5">
            <span className="role-body-text">{option.label}</span>
            {option.subLabel && <span className="role-metadata">{option.subLabel}</span>}
          </span>
          {option.value === value && <Check className="ml-auto size-4" aria-hidden />}
        </li>
      ))}
    </ul>
  );
}

interface TrailingProps {
  readonly loading: boolean;
  /** Keeps the clear button's slot while there is nothing to clear (C8). */
  readonly hidden: boolean;
  readonly disabled: boolean;
  onClear(): void;
}

/** The field's right end: a spinner while options load, else the clear button. */
function Trailing({ loading, hidden, disabled, onClear }: TrailingProps) {
  return (
    <span className="absolute top-1/2 right-1 flex size-6 -translate-y-1/2 items-center justify-center">
      {loading ? (
        <Loading className="size-4 animate-spin text-accent" aria-label="Loading" />
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Clear"
          className={cn("rounded-full", hidden && "invisible")}
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onClear}
        >
          <X className="size-3 text-tertiary" aria-hidden />
        </Button>
      )}
    </span>
  );
}
