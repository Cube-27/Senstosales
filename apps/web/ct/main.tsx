// The component-test page: the app's styles and fonts and the DataTable story, dark when the URL says `?theme=dark`.
import { createRoot } from "react-dom/client";

import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource-variable/public-sans";
import "./ct.css";

import { DataTableStory } from "./DataTableStory.tsx";

if (new URLSearchParams(location.search).get("theme") === "dark") document.documentElement.classList.add("dark");

createRoot(document.getElementById("root") as HTMLElement).render(<DataTableStory />);
