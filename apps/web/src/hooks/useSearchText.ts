import { useEffect, useRef, useState } from "react";

/** The legacy lists searched 300 ms after the last keystroke. */
export const SEARCH_DELAY_MS = 300;

/**
 * A list's search box: the text shows as typed and reaches `commit` once typing pauses. A new value from outside
 * (a link, Back) replaces the text.
 */
export function useSearchText(current: string | undefined, commit: (q: string | undefined) => void) {
  const [text, setText] = useState(current ?? "");
  const [seen, setSeen] = useState(current);
  if (current !== seen) {
    setSeen(current);
    setText(current ?? "");
  }
  // The latest `commit`, so a caller's new function identity on each render does not restart the delay.
  const latest = useRef(commit);
  useEffect(() => {
    latest.current = commit;
  });
  useEffect(() => {
    if (text === (current ?? "")) return;
    const timer = setTimeout(() => latest.current(text === "" ? undefined : text), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text, current]);
  return { value: text, onChange: setText };
}
