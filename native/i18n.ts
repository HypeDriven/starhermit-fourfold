// Localization: the browser build's tables (js/i18n/strings.js and
// strings-content.js, nine locales keyed by the US-English text) through the
// DOM-free lookup js/i18n/core.js, in the interface language the runtime
// reports (preferences().language: the player's choice in Options ›
// Language, else the device's). The browser build's own Language selector,
// its ?lang= override and the account's preferred-language lookup
// (sh-language.js) are the runtime's now. globalThis.FFI18N.lang is set so
// js/platform-i18n.js picks the same locale. A change re-renders everything
// next frame (the UI is immediate mode).
import { onPreferencesChange, preferences } from "starhermit:engine";
import * as ui from "starhermit:ui";
import { I18NCore, STRINGS } from "./classic.ts";

const I = I18NCore.createI18n(STRINGS);
(globalThis as unknown as { FFI18N: { readonly lang: string } }).FFI18N = { get lang() { return I.lang; } };

/** Translates an English source string ({name} placeholders from vars). */
export function T(key: string, vars?: Record<string, string | number>): string { return I.T(key, vars); }
/** Marks English text translated where it is drawn (keeps the key visible to tests/i18n.test.mjs). */
export const N = (key: string): string => key;
export function lang(): string { return I.lang; }

function apply(tag: string): void { ui.setLanguage(I.setLocale(tag)); }
/** Wires the language (from onStart). */
export function initLanguage(): void {
  apply(preferences().language);
  onPreferencesChange((p) => apply(p.language));
}
