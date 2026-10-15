// Login, onboarding, the supplier profile, settings and buyers (SPEC-07). Simplicity beats security (A-17): no
// complexity rule on any password (C11), and the BHEL password is write-only (INV-81).
import { z } from "zod";

import { zBuyer, zSupplier } from "../entities/supplier.ts";
import { zGstPct, zTextMap } from "../primitives.ts";

/** The user is always `admin` (INV-80), so the form sends only the password. */
export const zLoginBody = z.object({ password: z.string().min(1), rememberMe: z.boolean() });

export const zSession = z.object({ authenticated: z.boolean(), isDefaultPassword: z.boolean() });

export const zChangePasswordBody = z
  .object({ currentPassword: z.string(), newPassword: z.string().min(1), confirmPassword: z.string() })
  .refine((b) => b.newPassword === b.confirmPassword, {
    path: ["confirmPassword"],
    message: "The two new passwords do not match.",
  });

/** The legacy reset asks for the confirmation phrase, and the current password once it was changed (EC-08). */
export const zResetDefaultsBody = z.object({ confirmation: z.string() });

export const zOnboardingStatus = z.object({ required: z.boolean() });

export const zSupplierBody = zSupplier.omit({ id: true });

/** GST percentages copied onto each invoice (A2-4) and the other settings-page preferences, by key. */
export const zSettings = z.object({ cgstPct: zGstPct, sgstPct: zGstPct, preferences: zTextMap });

/** Onboarding creates the supplier and the GST rates in one batch (INV-78). */
export const zOnboardingBody = zSupplierBody.extend(zSettings.pick({ cgstPct: true, sgstPct: true }).shape);

export const zBhelPasswordStatus = z.object({ saved: z.boolean() });

export const zBhelPasswordBody = z.object({ password: z.string().min(1) });

export const zBuyerBody = zBuyer.omit({ id: true });

/** A database backup in Settings (SPEC-21): `daily` copies rotate; `pre-upgrade` and `safety` (taken before a
 * restore) are kept. */
export const zBackup = z.object({ name: z.string(), kind: z.enum(["daily", "pre-upgrade", "safety"]) });

/** Restore names one of the listed backups; the API never takes a path (C17). */
export const zRestoreBody = z.object({ name: z.string().min(1) });

/** The backup restored, and the safety copy of the data from before it. */
export const zRestored = z.object({ restored: z.string(), safety: z.string() });
