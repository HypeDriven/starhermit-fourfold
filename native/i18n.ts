// Localization: assets/strings.json, nine locales keyed by the US-English text,
// on the engine's string tables. The engine follows the runtime's interface
// language (the player's choice in Options › Language, else the device's) along
// its locale chain; account lines are its built-in `starhermit.*` strings. A
// change re-renders everything next frame (the UI is immediate mode).
import { strings } from "starhermit:engine";
import * as ui from "starhermit:ui";

/** Translates an English source string ({name} placeholders from vars), or a `starhermit.*` key. */
export function T(key: string, vars?: Record<string, string | number>): string { return strings.t(key, vars); }
/** Marks English text translated where it is drawn (keeps the key visible to tests/i18n.test.mjs). */
export const N = (key: string): string => key;
export function lang(): string { return strings.locale; }

/** Wires the language (from onStart). */
export function initLanguage(): void {
  strings.load("assets/strings.json");
  strings.defaultLocale = "en-US";
  ui.setLanguage(strings.locale);
  strings.onChange((locale) => ui.setLanguage(locale));
}
