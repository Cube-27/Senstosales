import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Joins class names; a later Tailwind utility replaces an earlier one of the same kind. */
export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));
