// The look of the menus, HUD and sheets: the browser build's css/app.css,
// rewritten class-based in tools/ui-style.css and converted once with
// `starhermit css` into assets/ui-style.json (`npm run css`), registered at
// start with the theme the runtime's own widgets (dialogs, scroll bars) take.
// High contrast, larger text and reduced motion are the runtime's options
// (they apply over these styles).
import { files } from "starhermit:engine";
import * as ui from "starhermit:ui";

export const PAGE_BG = "#0e1424";

export function initStyles(): void {
  const css = files.readJson("assets/ui-style.json") as unknown as ui.CssStyles;
  ui.setTokens(css.tokens);
  ui.setAnimations(css.animations);
  ui.setStyles({
    ...css.styles,
    label: { text: { color: "$ink" } },
    paragraph: { text: { color: "$ink" } },
    heading: { text: { color: "$ink" } },
    widget: { focusRing: { color: "$accent", width: 3, offset: 2 } },
    button: { focusRing: { color: "$accent", width: 3, offset: 2 } },
    dialog: {
      background: "$panel", radius: 16, padding: 18, border: { width: 1, color: "$line" },
      parts: { backdrop: { background: "$veil" } },
    },
    scrollArea: { parts: { bar: { background: "#7fb0ff59", radius: 4 } } },
    // The board's column targets: transparent, a 2 px border on hover (and the hint's in your colour).
    ".col-target": { radius: 8, focusRing: { color: "$accent", width: 3, offset: -3 } },
    // The title key art and the results illustrations (the old <img>s), with the well colour under them.
    ".title-art-img": { extends: [".title-art"], background: [{ image: "assets/key-art.webp", size: "cover", position: { x: 0.5, y: 0.4 } }, "#0a0f1e"] },
    ".results-win-img": { extends: [".results-art"], background: [{ image: "assets/results-win.webp", size: "cover" }, "#0a0f1e"] },
    ".results-lose-img": { extends: [".results-art"], background: [{ image: "assets/results-lose.webp", size: "cover" }, "#0a0f1e"] },
  });
  ui.setTheme({
    fontSize: 16, headingSize: 25, smallSize: 14, padding: 8, spacing: 10, radius: 12,
    text: "#e8ecf5", muted: "#a4b0c8", panel: "#161e33", control: "#1e2842", hovered: "#26324f",
    pressed: "#2c3a5e", field: "#1e2842", accent: "#7fb0ff", focus: "#7fb0ff", outline: "#2c3a5e",
  });
}
