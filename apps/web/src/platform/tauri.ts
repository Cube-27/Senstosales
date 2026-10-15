// The desktop shell's platform (ARCHITECTURE §12.4, SPEC-20): system notifications and the tray tooltip through
// the Tauri plugins the shell grants the loopback origin (notification:default, tray get-by-id and set-tooltip).
// Files never cross the IPC bridge (§13.1): Save-as is WebView2's own save picker, and pickers are file inputs.
import { TrayIcon } from "@tauri-apps/api/tray";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";

import type { Platform, SaveFile } from "./index.ts";
import { downloadFile, pickFiles, pickFolder } from "./web.ts";

/** The tray icon the shell creates (SPEC-20). */
const TRAY_ID = "main";

/** The File System Access save picker, which WebView2 (Chromium) has on the secure loopback origin. */
type SavePicker = (options: { suggestedName: string }) => Promise<{
  createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }>;
}>;

function savePicker(): SavePicker | undefined {
  const picker: unknown = Reflect.get(window, "showSaveFilePicker");
  return typeof picker === "function" ? (options) => Reflect.apply(picker, window, [options]) : undefined;
}

/** Save-as: the native picker, then the bytes written by the page; a browser download when there is no picker. */
export async function saveAs(file: SaveFile, picker = savePicker()): Promise<"saved" | "cancelled"> {
  if (picker) {
    try {
      const writable = await (await picker({ suggestedName: file.name })).createWritable();
      await writable.write(file.data);
      await writable.close();
      return "saved";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
      // Any other failure (a blocked picker, a write error): the download still gets the file to the user.
    }
  }
  downloadFile(file);
  return "saved";
}

export const tauriPlatform: Platform = {
  kind: "tauri",
  saveFile: (file) => saveAs(file),
  pickFolder,
  pickFiles,
  async notify(title, body) {
    const allowed = (await isPermissionGranted()) || (await requestPermission()) === "granted";
    if (allowed) sendNotification({ title, body });
  },
  async setTrayStatus(text) {
    await (await TrayIcon.getById(TRAY_ID))?.setTooltip(text);
  },
};
