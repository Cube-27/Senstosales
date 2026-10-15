// Light or dark (legacy: light by default, the choice remembered under `theme`). The `.dark` class on <html> switches
// the `globals.css` tokens.
export type Theme = "light" | "dark";

const KEY = "theme";

export function storedTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light"; // storage blocked: the default
  }
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // storage blocked: the theme holds until the page reloads
  }
}
