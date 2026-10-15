// The no-layout-shift check (C8, INV-70, INV-71): the boxes of the elements around a control are the same after the
// control is used.
import { expect, type Locator, type Page } from "@playwright/test";

type Box = { x: number; y: number; width: number; height: number };

/** Each locator's bounding box, to a tenth of a pixel; a missing or hidden element is `null`. */
export async function measure(locators: Record<string, Locator>): Promise<Record<string, Box | null>> {
  const entries = await Promise.all(
    Object.entries(locators).map(async ([name, locator]) => {
      const box = await locator.boundingBox();
      const round = (n: number): number => Math.round(n * 10) / 10;
      return [name, box && { x: round(box.x), y: round(box.y), width: round(box.width), height: round(box.height) }];
    }),
  );
  return Object.fromEntries(entries);
}

/** Waits for fonts and two animation frames, so layout has settled after a change. */
export async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

/** Runs `action` and fails when any of `locators` moved or changed size. The first locator is scrolled into view
 * first, as using a control below the fold would, so a scroll is never measured as a shift. */
export async function expectNoLayoutShift(
  page: Page,
  locators: Record<string, Locator>,
  action: () => Promise<void>,
): Promise<void> {
  await Object.values(locators)[0]?.scrollIntoViewIfNeeded();
  await settle(page);
  const before = await measure(locators);
  await action();
  await settle(page);
  expect(await measure(locators)).toEqual(before);
}
