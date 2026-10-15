// The browser platform (ARCHITECTURE §12.4): downloads through a blob link, pickers through file inputs. Every flow
// works with it alone.
import type { Platform, SaveFile } from "./index.ts";

/** Downloads `file` under its name through a temporary blob link. */
export function downloadFile({ name, data }: SaveFile): void {
  const url = URL.createObjectURL(data);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  // The download has started from the click; revoking later lets slow browsers read the blob first.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Opens a hidden file input and resolves with what the user picked, or null on cancel. */
function pickWithInput(setUp: (input: HTMLInputElement) => void): Promise<File[] | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.hidden = true;
    setUp(input);
    const done = (files: File[] | null): void => {
      input.remove();
      resolve(files);
    };
    input.addEventListener("change", () => done(input.files && input.files.length > 0 ? [...input.files] : null));
    input.addEventListener("cancel", () => done(null));
    document.body.append(input);
    input.click();
  });
}

export const pickFolder = (): Promise<File[] | null> =>
  pickWithInput((input) => {
    input.webkitdirectory = true;
  });

export const pickFiles = ({ accept, multiple }: { accept: string; multiple: boolean }): Promise<File[] | null> =>
  pickWithInput((input) => {
    input.accept = accept;
    input.multiple = multiple;
  });

export const webPlatform: Platform = {
  kind: "web",
  saveFile(file) {
    downloadFile(file);
    return Promise.resolve("saved");
  },
  pickFolder,
  pickFiles,
  // Only when the user already allowed them: the app never asks (C11); toasts carry the message in the page.
  async notify(title, body) {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") new Notification(title, { body });
  },
  // A browser has no tray (SPEC-14 §9).
  async setTrayStatus() {},
};
