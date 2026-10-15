// What the browser platform saved: each download link's file name, as a click on it would download it.
import { vi } from "vite-plus/test";

export function captureDownloads(): string[] {
  const names: string[] = [];
  URL.createObjectURL = () => "blob:download";
  URL.revokeObjectURL = () => {};
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    names.push(this.download);
  });
  return names;
}
