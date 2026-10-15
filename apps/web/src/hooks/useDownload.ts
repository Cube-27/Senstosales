import type { Download } from "@senstosales/schemas";
import { useState } from "react";

import { useToast } from "../components/common/index.ts";
import { getPlatform } from "../platform/index.ts";

/** Saves a downloaded file under the name the server gave it: Save-as in the desktop shell, else a download. */
export async function saveDownload({ fileName, bytes }: Download): Promise<"saved" | "cancelled"> {
  const platform = await getPlatform();
  // A copy into a plain ArrayBuffer: Blob takes no view over a shared buffer.
  return platform.saveFile({ name: fileName, data: new Blob([bytes.slice()]) });
}

/**
 * An export button's download (SPEC-17 §1): fetches the file, saves it through the platform, and says how it went in
 * a toast as the legacy exports did. `busy` is true while one runs; a second press meanwhile does nothing.
 */
export function useDownload() {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  async function run(fetchFile: () => Promise<Download>): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      const file = await fetchFile();
      if ((await saveDownload(file)) === "saved") toast("Export successful", file.fileName, "success");
    } catch (error) {
      toast("Export failed", error instanceof Error ? error.message : "Try again.", "error");
    } finally {
      setBusy(false);
    }
  }
  return { busy, run };
}
