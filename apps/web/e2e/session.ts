// Signing in for a screen spec: the default password through the login API, so the page's cookies hold the session.
import type { Page } from "@playwright/test";

export async function signIn(page: Page, password = "admin"): Promise<void> {
  const res = await page.request.post("/api/auth/login", { data: { password, rememberMe: true } });
  if (!res.ok()) throw new Error(`login answered ${res.status()}`);
}
