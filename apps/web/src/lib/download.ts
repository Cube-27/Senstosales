// Downloads (SPEC-12 documents, SPEC-13 list CSVs): the route's file, saved through the platform: Save-as in the
// desktop shell, a browser download otherwise (ARCHITECTURE §12.4). The toasts are the legacy download messages.
import type { Download } from "@senstosales/schemas";
import { useState } from "react";

import { useToast } from "../components/common/index.ts";
import { getPlatform } from "../platform/index.ts";

/** Saves a downloaded file under the name the API gave it. */
async function saveDownload(file: Download): Promise<"saved" | "cancelled"> {
  const platform = await getPlatform();
  return platform.saveFile({ name: file.fileName, data: new Blob([file.bytes.slice()]) });
}

/**
 * A screen's downloads: `run(key, label, request)` fetches and saves one file and toasts the outcome; `busy` is the
 * key of the download in progress, for its button's loading state.
 */
export function useDownload() {
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  async function run(key: string, label: string, request: () => Promise<Download>): Promise<void> {
    setBusy(key);
    try {
      if ((await saveDownload(await request())) === "saved") {
        toast("Download Complete", `${label} downloaded`, "success");
      }
    } catch (error) {
      toast("Download Failed", error instanceof Error ? error.message : "Unknown error", "error");
    } finally {
      setBusy(null);
    }
  }
  return { busy, run };
}
