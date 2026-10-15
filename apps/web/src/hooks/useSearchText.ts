import { useCallback, useRef, useState } from "react";

/** The legacy lists searched 300 ms after the last keystroke. */
const SEARCH_DELAY_MS = 300;

/**
 * A list's search box: the text shows as typed and reaches `commit` once typing pauses. A new value from outside
 * (a link, Back) replaces the text. The pending commit is dropped when the input unmounts (its ref's cleanup), so
 * leaving the list mid-typing never navigates back to it.
 */
export function useSearchText(current: string | undefined, commit: (q: string | undefined) => void) {
  const [text, setText] = useState(current ?? "");
  const [seen, setSeen] = useState(current);
  if (current !== seen) {
    setSeen(current);
    setText(current ?? "");
  }
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onChange = (value: string) => {
    setText(value);
    clearTimeout(timer.current);
    if (value === (current ?? "")) return;
    timer.current = setTimeout(() => commit(value === "" ? undefined : value), SEARCH_DELAY_MS);
  };
  // One identity for the input's life: a new ref function each render would run the cleanup on every keystroke.
  const inputRef = useCallback(() => () => clearTimeout(timer.current), []);
  return { value: text, onChange, inputRef };
}
