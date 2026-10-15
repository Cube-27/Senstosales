// SPEC-21 PR 1: the backup names and the rotation plan (INV-103). Rotation keeps the newest 14 daily backups and the
// newest backup of each of the 12 newest months that have one; pre-upgrade and safety backups are never rotated.
import { describe, expect, it } from "vite-plus/test";

import { planRotation } from "../src/services/backup.ts";

/** `daily-<date>.db` for each day `from`..`to` of one month. */
const days = (month: string, from: number, to: number): string[] =>
  Array.from({ length: to - from + 1 }, (_, i) => `daily-${month}-${String(from + i).padStart(2, "0")}.db`);

describe("INV-103 planRotation", () => {
  it.each([
    { name: "no backups", files: [], removed: [] },
    { name: "14 daily backups are all kept", files: days("2025-06", 1, 14), removed: [] },
    {
      // The 15th-newest is the newest of May, so May's monthly keeps it; the oldest two of May go.
      name: "a 17th daily backup in an older month keeps only that month's newest",
      files: [...days("2025-05", 29, 31), ...days("2025-06", 1, 14)],
      removed: ["daily-2025-05-29.db", "daily-2025-05-30.db"],
    },
    {
      name: "within one month only the newest 14 are kept",
      files: days("2025-06", 1, 20),
      removed: days("2025-06", 1, 6),
    },
    {
      // 13 months with one backup each, then 14 dailies in the newest month: the oldest month is the 13th and goes.
      name: "monthly backups beyond 12 months go",
      files: [
        "daily-2024-04-30.db",
        "daily-2024-05-31.db",
        "daily-2024-06-30.db",
        "daily-2024-07-31.db",
        "daily-2024-08-31.db",
        "daily-2024-09-30.db",
        "daily-2024-10-31.db",
        "daily-2024-11-30.db",
        "daily-2024-12-31.db",
        "daily-2025-01-31.db",
        "daily-2025-02-28.db",
        "daily-2025-03-31.db",
        "daily-2025-04-30.db",
        ...days("2025-05", 18, 31),
      ],
      removed: ["daily-2024-04-30.db", "daily-2024-05-31.db"],
    },
    {
      // Months without a backup do not count: the app was not used from July 2024 to March 2025, so June 2024 stays.
      name: "gaps between months do not shorten the 12",
      files: ["daily-2024-06-30.db", "daily-2025-04-30.db", ...days("2025-05", 1, 15)],
      removed: ["daily-2025-05-01.db"],
    },
    {
      name: "pre-upgrade, safety and unknown files are never removed",
      files: [
        "pre-upgrade-3-20240101T053000Z.db",
        "safety-20240102T053000Z.db",
        "notes.txt",
        "daily-2025-06-01.db.partial",
        ...days("2025-06", 1, 15),
      ],
      removed: ["daily-2025-06-01.db"],
    },
  ])("$name", ({ files, removed }) => {
    expect(planRotation(files)).toEqual(removed);
  });
});
