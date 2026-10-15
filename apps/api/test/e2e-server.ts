// The API for the web e2e run (SPEC-19 §6, §9): the node entry with the scripted fake scraper over synthetic pages
// (C1). Only the e2e harness (`apps/web/e2e/fixtures.ts`) starts this file; the sidecar entry never imports it, so no
// production build can select the fake.
import { fileURLToPath } from "node:url";

import { createFakeScraper } from "@senstosales/scraper";

import { run } from "../src/platform/node/main.ts";
import { createFsStorage } from "../src/platform/node/storage-fs.ts";
import { poPage } from "./po-pages.ts";
import { srvPage } from "./srv-pages.ts";

/** A 1×1 PNG, so the captcha image renders. */
const PNG = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="),
  (ch) => ch.charCodeAt(0),
);

const scraper = createFakeScraper({
  captchaPng: PNG,
  // The e2e specs type these into the wizard (`apps/web/e2e/bhel-sync.spec.ts`).
  captcha: "AB12C",
  otp: "123456",
  poPages: {
    "4500001": poPage({ number: "4500001", date: "10/04/2025", items: [{ no: 10 }] }),
    "4500002": poPage({ number: "4500002", date: "11/04/2025", items: [{ no: 10 }, { no: 20 }] }),
  },
  srvPages: { "4500001": srvPage("4500001", [{ srv: "7000001", date: "20/04/2025", item: 10 }]) },
  // 4500003 is listed but its page fails, so the summary shows a failed document.
  poIds: ["4500001", "4500002", "4500003"],
});

if (import.meta.main) run(createFsStorage(fileURLToPath(new URL("../../web/dist", import.meta.url))), scraper);
