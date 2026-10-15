// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { saveAs } from "../src/platform/tauri.ts";
import { pickFiles, pickFolder, webPlatform } from "../src/platform/web.ts";

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  document.body.innerHTML = "";
});

const file = (name: string, text = "x"): File => new File([text], name, { type: "text/html" });

/** Captures what a click on a download link would download. */
function captureDownloads(): Array<{ href: string; download: string }> {
  const downloads: Array<{ href: string; download: string }> = [];
  URL.createObjectURL = () => "blob:report";
  URL.revokeObjectURL = () => {};
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push({ href: this.href, download: this.download });
  });
  return downloads;
}

/** Makes the next file input the page opens report `files` (or a cancel) once clicked. */
function answerFileInput(files: File[] | "cancel"): () => HTMLInputElement | undefined {
  let opened: HTMLInputElement | undefined;
  vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {
    // The page appends its hidden input before clicking it.
    const input = document.querySelector("input");
    if (!input) return;
    opened = input;
    if (files === "cancel") {
      input.dispatchEvent(new Event("cancel"));
      return;
    }
    Object.defineProperty(input, "files", { value: files });
    input.dispatchEvent(new Event("change"));
  });
  return () => opened;
}

describe("web platform", () => {
  it("saves a file as a browser download of a blob under its name", async () => {
    const downloads = captureDownloads();
    const result = await webPlatform.saveFile({ name: "DC-12.xlsx", data: new Blob(["x"]) });
    expect([result, downloads]).toEqual(["saved", [{ href: "blob:report", download: "DC-12.xlsx" }]]);
    expect(document.querySelector("a")).toBeNull();
  });

  it("picks a folder through a webkitdirectory input and returns its files", async () => {
    const opened = answerFileInput([file("a.html"), file("b.html")]);
    const files = await pickFolder();
    expect([files?.map((f) => f.name), opened()?.webkitdirectory, document.querySelector("input")]).toEqual([
      ["a.html", "b.html"],
      true,
      null,
    ]);
  });

  it("picks files filtered by type and reads a cancel as null", async () => {
    const opened = answerFileInput("cancel");
    expect(await pickFiles({ accept: ".html,.htm", multiple: true })).toBeNull();
    expect([opened()?.accept, opened()?.multiple, Boolean(opened()?.webkitdirectory)]).toEqual([
      ".html,.htm",
      true,
      false,
    ]);
  });

  it("has no tray", async () => {
    await expect(webPlatform.setTrayStatus("Syncing")).resolves.toBeUndefined();
    expect(webPlatform.kind).toBe("web");
  });
});

describe("getPlatform", () => {
  it("is the web platform in a browser and the Tauri platform inside the shell", async () => {
    const browser = await (await import("../src/platform/index.ts")).getPlatform();
    vi.resetModules();
    Reflect.set(window, "__TAURI_INTERNALS__", { invoke: vi.fn() });
    const shell = await (await import("../src/platform/index.ts")).getPlatform();
    expect([browser.kind, shell.kind]).toEqual(["web", "tauri"]);
  });
});

describe("Tauri platform", () => {
  it("writes the file through the native save picker", async () => {
    const written: unknown[] = [];
    const data = new Blob(["xlsx"]);
    const picker = vi.fn(async () => ({
      createWritable: async () => ({
        write: async (d: Blob) => void written.push(d),
        close: async () => void written.push("closed"),
      }),
    }));
    expect(await saveAs({ name: "Invoice-7.xlsx", data }, picker)).toBe("saved");
    expect([picker.mock.calls, written]).toEqual([[[{ suggestedName: "Invoice-7.xlsx" }]], [data, "closed"]]);
  });

  it("reads a dismissed picker as cancelled, without a download", async () => {
    const downloads = captureDownloads();
    const picker = async () => Promise.reject(new DOMException("dismissed", "AbortError"));
    expect([await saveAs({ name: "a.xlsx", data: new Blob() }, picker), downloads]).toEqual(["cancelled", []]);
  });

  it("falls back to a download when there is no picker or it fails", async () => {
    const downloads = captureDownloads();
    const broken = async () => Promise.reject(new DOMException("blocked", "SecurityError"));
    await saveAs({ name: "a.xlsx", data: new Blob() }, broken);
    await saveAs({ name: "b.xlsx", data: new Blob() }, undefined);
    expect(downloads.map((d) => d.download)).toEqual(["a.xlsx", "b.xlsx"]);
  });

  it("sets the tooltip of the shell's tray icon", async () => {
    const invoke = vi.fn(async (cmd: string, _args?: unknown) => (cmd === "plugin:tray|get_by_id" ? 7 : null));
    Reflect.set(window, "__TAURI_INTERNALS__", { invoke });
    const { tauriPlatform } = await import("../src/platform/tauri.ts");
    await tauriPlatform.setTrayStatus("Importing 3 of 10");
    expect(invoke.mock.calls.map(([cmd, args]) => [cmd, args])).toEqual([
      ["plugin:tray|get_by_id", { id: "main" }],
      ["plugin:tray|set_tooltip", { rid: 7, tooltip: "Importing 3 of 10" }],
    ]);
  });

  it("sends a notification once allowed", async () => {
    const shown: unknown[] = [];
    class FakeNotification {
      static permission = "granted";
      constructor(title: string, options: unknown) {
        shown.push([title, options]);
      }
    }
    vi.stubGlobal("Notification", FakeNotification);
    const { tauriPlatform } = await import("../src/platform/tauri.ts");
    await tauriPlatform.notify("Import finished", "10 POs imported");
    expect(shown).toEqual([["Import finished", { title: "Import finished", body: "10 POs imported" }]]);
    vi.unstubAllGlobals();
  });
});
