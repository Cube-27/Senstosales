// Writes the shell page (kept out of git: the real-data scan rejects HTML outside fixture folders).
import { writeFileSync } from "node:fs";

writeFileSync(
  "shell/ui/dist/index.html",
  '<!doctype html><html lang="en"><meta charset="utf-8"><title>Starting…</title><p id="status">Starting…</p>' +
    '<script type="module" src="./main.js"></script></html>\n',
);
