// The Platform adapter (ARCHITECTURE §12.4): the few things the desktop shell does differently from a browser.
// Chosen at runtime; the Tauri module loads only inside the shell, so a plain browser never fetches it.

/** A file the user saves: what a download route returned (SPEC-04 `Download`). */
export interface SaveFile {
  readonly name: string;
  readonly data: Blob;
}

export interface Platform {
  readonly kind: "web" | "tauri";
  /** Saves a file: Save-as where the platform has one, else a browser download. */
  saveFile(file: SaveFile): Promise<"saved" | "cancelled">;
  /** The files of a folder the user picks (each with its `webkitRelativePath`), or null when cancelled. */
  pickFolder(): Promise<File[] | null>;
  /** Files the user picks, filtered by `accept` (`".html,.htm"`), or null when cancelled. */
  pickFiles(options: { readonly accept: string; readonly multiple: boolean }): Promise<File[] | null>;
  /** A system notification; nothing where the platform has none or the user has not allowed them. */
  notify(title: string, body: string): Promise<void>;
  /** The tray icon's tooltip; nothing in a browser. */
  setTrayStatus(text: string): Promise<void>;
}

/** True inside the Tauri shell, which injects its IPC bridge into the page (`withGlobalTauri` stays off). */
export const inTauri = (): boolean => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

let chosen: Promise<Platform> | undefined;

/** The platform the app runs on, loaded once. */
export function getPlatform(): Promise<Platform> {
  chosen ??= inTauri()
    ? import("./tauri.ts").then((m) => m.tauriPlatform)
    : import("./web.ts").then((m) => m.webPlatform);
  return chosen;
}
