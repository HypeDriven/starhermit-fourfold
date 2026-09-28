/* Fourfold — Graphics section of the Settings screen.
 *
 * Builds the controls into #set-gfx-fieldset, persists choices under the
 * `fourfold.gfx` localStorage key (device-specific, so not cloud-synced with
 * progress) and applies them live through view.setGraphics(). The rest of the
 * game ships in English; this panel is localized from navigator.language.
 */
import { PRESETS, CATEGORIES, presetTier, choosePreset } from './gfx.js';
import { loadGraphics, saveGraphics } from './view3d.js';

const STRINGS = {
  'en-US': {
    legend: 'Graphics', quality: 'Quality', auto: 'Auto (detected: {t})', scale: 'Render scale',
    fromPreset: 'From preset ({t})', adaptive: 'Adaptive resolution (lower it when frames are slow)',
    fps: 'Show frame rate', postFailed: 'Post-processing is unavailable on this device; rendering without effects.',
    no3d: '3D board unavailable; the 2D board ignores graphics settings.',
    msaaReload: 'Switching away from MSAA takes full effect after a reload.',
    cats: { shadows: 'Shadows', ao: 'Ambient occlusion', bloom: 'Bloom', grade: 'Color grade', antialias: 'Anti-aliasing', reflections: 'Reflections', detail: 'Board detail', particles: 'Particles' },
    tiers: { low: 'Low', balanced: 'Balanced', high: 'High', ultra: 'Ultra', off: 'Off', on: 'On', medium: 'Medium', plain: 'Plain', detailed: 'Detailed', fxaa: 'FXAA', smaa: 'SMAA', msaa: 'MSAA' },
    noShadows: 'no shadows', noAA: 'no anti-aliasing',
  },
  'en-GB': {
    legend: 'Graphics', quality: 'Quality', auto: 'Auto (detected: {t})', scale: 'Render scale',
    fromPreset: 'From preset ({t})', adaptive: 'Adaptive resolution (lower it when frames are slow)',
    fps: 'Show frame rate', postFailed: 'Post-processing is unavailable on this device; rendering without effects.',
    no3d: '3D board unavailable; the 2D board ignores graphics settings.',
    msaaReload: 'Switching away from MSAA takes full effect after a reload.',
    cats: { shadows: 'Shadows', ao: 'Ambient occlusion', bloom: 'Bloom', grade: 'Colour grade', antialias: 'Anti-aliasing', reflections: 'Reflections', detail: 'Board detail', particles: 'Particles' },
    tiers: { low: 'Low', balanced: 'Balanced', high: 'High', ultra: 'Ultra', off: 'Off', on: 'On', medium: 'Medium', plain: 'Plain', detailed: 'Detailed', fxaa: 'FXAA', smaa: 'SMAA', msaa: 'MSAA' },
    noShadows: 'no shadows', noAA: 'no anti-aliasing',
  },
  'es-419': {
    legend: 'Gráficos', quality: 'Calidad', auto: 'Automática (detectada: {t})', scale: 'Escala de renderizado',
    fromPreset: 'Según el ajuste ({t})', adaptive: 'Resolución adaptativa (la baja si los fotogramas van lentos)',
    fps: 'Mostrar fotogramas por segundo', postFailed: 'El posprocesado no está disponible en este dispositivo; se renderiza sin efectos.',
    no3d: 'Tablero 3D no disponible; el tablero 2D ignora los ajustes de gráficos.',
    msaaReload: 'Dejar MSAA surte efecto completo después de recargar.',
    cats: { shadows: 'Sombras', ao: 'Oclusión ambiental', bloom: 'Resplandor', grade: 'Corrección de color', antialias: 'Antialiasing', reflections: 'Reflejos', detail: 'Detalle del tablero', particles: 'Partículas' },
    tiers: { low: 'Baja', balanced: 'Equilibrada', high: 'Alta', ultra: 'Ultra', off: 'No', on: 'Sí', medium: 'Media', plain: 'Simple', detailed: 'Detallado', fxaa: 'FXAA', smaa: 'SMAA', msaa: 'MSAA' },
    noShadows: 'sin sombras', noAA: 'sin antialiasing',
  },
  'es-ES': {
    legend: 'Gráficos', quality: 'Calidad', auto: 'Automática (detectada: {t})', scale: 'Escala de renderizado',
    fromPreset: 'Según el ajuste ({t})', adaptive: 'Resolución adaptativa (la reduce si los fotogramas van lentos)',
    fps: 'Mostrar fotogramas por segundo', postFailed: 'El posprocesado no está disponible en este dispositivo; se renderiza sin efectos.',
    no3d: 'Tablero 3D no disponible; el tablero 2D ignora los ajustes de gráficos.',
    msaaReload: 'Desactivar MSAA surte efecto completo tras recargar.',
    cats: { shadows: 'Sombras', ao: 'Oclusión ambiental', bloom: 'Resplandor', grade: 'Corrección de color', antialias: 'Antialiasing', reflections: 'Reflejos', detail: 'Detalle del tablero', particles: 'Partículas' },
    tiers: { low: 'Baja', balanced: 'Equilibrada', high: 'Alta', ultra: 'Ultra', off: 'No', on: 'Sí', medium: 'Media', plain: 'Sencillo', detailed: 'Detallado', fxaa: 'FXAA', smaa: 'SMAA', msaa: 'MSAA' },
    noShadows: 'sin sombras', noAA: 'sin antialiasing',
  },
  'de-DE': {
    legend: 'Grafik', quality: 'Qualität', auto: 'Automatisch (erkannt: {t})', scale: 'Renderskalierung',
    fromPreset: 'Laut Voreinstellung ({t})', adaptive: 'Adaptive Auflösung (senkt sie bei langsamen Bildern)',
    fps: 'Bildrate anzeigen', postFailed: 'Nachbearbeitung ist auf diesem Gerät nicht verfügbar; es wird ohne Effekte gerendert.',
    no3d: '3D-Brett nicht verfügbar; das 2D-Brett ignoriert Grafikeinstellungen.',
    msaaReload: 'Das Abschalten von MSAA wirkt vollständig erst nach dem Neuladen.',
    cats: { shadows: 'Schatten', ao: 'Umgebungsverdeckung', bloom: 'Bloom', grade: 'Farbkorrektur', antialias: 'Kantenglättung', reflections: 'Spiegelungen', detail: 'Brettdetails', particles: 'Partikel' },
    tiers: { low: 'Niedrig', balanced: 'Ausgewogen', high: 'Hoch', ultra: 'Ultra', off: 'Aus', on: 'An', medium: 'Mittel', plain: 'Schlicht', detailed: 'Detailliert', fxaa: 'FXAA', smaa: 'SMAA', msaa: 'MSAA' },
    noShadows: 'keine Schatten', noAA: 'keine Kantenglättung',
  },
  'fr-FR': {
    legend: 'Graphismes', quality: 'Qualité', auto: 'Automatique (détectée : {t})', scale: 'Échelle de rendu',
    fromPreset: 'Selon le préréglage ({t})', adaptive: 'Résolution adaptative (baisse si les images ralentissent)',
    fps: 'Afficher les images par seconde', postFailed: 'Le post-traitement est indisponible sur cet appareil ; rendu sans effets.',
    no3d: 'Plateau 3D indisponible ; le plateau 2D ignore les réglages graphiques.',
    msaaReload: 'Quitter le MSAA prend pleinement effet après rechargement.',
    cats: { shadows: 'Ombres', ao: 'Occlusion ambiante', bloom: 'Halo lumineux', grade: 'Étalonnage des couleurs', antialias: 'Anticrénelage', reflections: 'Reflets', detail: 'Détail du plateau', particles: 'Particules' },
    tiers: { low: 'Basse', balanced: 'Équilibrée', high: 'Haute', ultra: 'Ultra', off: 'Non', on: 'Oui', medium: 'Moyennes', plain: 'Simple', detailed: 'Détaillé', fxaa: 'FXAA', smaa: 'SMAA', msaa: 'MSAA' },
    noShadows: 'sans ombres', noAA: 'sans anticrénelage',
  },
  'fr-CA': {
    legend: 'Graphiques', quality: 'Qualité', auto: 'Automatique (détectée : {t})', scale: 'Échelle de rendu',
    fromPreset: 'Selon le préréglage ({t})', adaptive: 'Résolution adaptative (baisse si les images ralentissent)',
    fps: 'Afficher la fréquence d’images', postFailed: 'Le post-traitement n’est pas offert sur cet appareil; rendu sans effets.',
    no3d: 'Plateau 3D non disponible; le plateau 2D ignore les réglages graphiques.',
    msaaReload: 'Quitter le MSAA prend pleinement effet après le rechargement.',
    cats: { shadows: 'Ombres', ao: 'Occlusion ambiante', bloom: 'Halo lumineux', grade: 'Étalonnage des couleurs', antialias: 'Anticrénelage', reflections: 'Reflets', detail: 'Détail du plateau', particles: 'Particules' },
    tiers: { low: 'Basse', balanced: 'Équilibrée', high: 'Haute', ultra: 'Ultra', off: 'Non', on: 'Oui', medium: 'Moyennes', plain: 'Simple', detailed: 'Détaillé', fxaa: 'FXAA', smaa: 'SMAA', msaa: 'MSAA' },
    noShadows: 'sans ombres', noAA: 'sans anticrénelage',
  },
  'pt-BR': {
    legend: 'Gráficos', quality: 'Qualidade', auto: 'Automática (detectada: {t})', scale: 'Escala de renderização',
    fromPreset: 'Conforme a predefinição ({t})', adaptive: 'Resolução adaptativa (reduz quando os quadros ficam lentos)',
    fps: 'Mostrar taxa de quadros', postFailed: 'O pós-processamento não está disponível neste dispositivo; renderizando sem efeitos.',
    no3d: 'Tabuleiro 3D indisponível; o tabuleiro 2D ignora as configurações gráficas.',
    msaaReload: 'Sair do MSAA só tem efeito completo após recarregar.',
    cats: { shadows: 'Sombras', ao: 'Oclusão de ambiente', bloom: 'Brilho', grade: 'Correção de cor', antialias: 'Antisserrilhamento', reflections: 'Reflexos', detail: 'Detalhe do tabuleiro', particles: 'Partículas' },
    tiers: { low: 'Baixa', balanced: 'Equilibrada', high: 'Alta', ultra: 'Ultra', off: 'Não', on: 'Sim', medium: 'Médias', plain: 'Simples', detailed: 'Detalhado', fxaa: 'FXAA', smaa: 'SMAA', msaa: 'MSAA' },
    noShadows: 'sem sombras', noAA: 'sem antisserrilhamento',
  },
  'it-IT': {
    legend: 'Grafica', quality: 'Qualità', auto: 'Automatica (rilevata: {t})', scale: 'Scala di rendering',
    fromPreset: 'Dal preset ({t})', adaptive: 'Risoluzione adattiva (la abbassa se i fotogrammi rallentano)',
    fps: 'Mostra frequenza fotogrammi', postFailed: 'La post-elaborazione non è disponibile su questo dispositivo; rendering senza effetti.',
    no3d: 'Tabellone 3D non disponibile; il tabellone 2D ignora le impostazioni grafiche.',
    msaaReload: 'Lasciare l’MSAA ha pieno effetto dopo il ricaricamento.',
    cats: { shadows: 'Ombre', ao: 'Occlusione ambientale', bloom: 'Bagliore', grade: 'Correzione colore', antialias: 'Antialiasing', reflections: 'Riflessi', detail: 'Dettaglio del tabellone', particles: 'Particelle' },
    tiers: { low: 'Bassa', balanced: 'Bilanciata', high: 'Alta', ultra: 'Ultra', off: 'No', on: 'Sì', medium: 'Medie', plain: 'Semplice', detailed: 'Dettagliato', fxaa: 'FXAA', smaa: 'SMAA', msaa: 'MSAA' },
    noShadows: 'senza ombre', noAA: 'senza antialiasing',
  },
};

/** Locale for the panel: exact tag, then the language's regional default. */
export function pickLocale(tags) {
  const list = (tags && tags.length ? tags : ['en-US']).map(String);
  for (const t of list) {
    const hit = Object.keys(STRINGS).find((k) => k.toLowerCase() === t.toLowerCase());
    if (hit) return hit;
    const lang = t.slice(0, 2).toLowerCase();
    if (lang === 'en') return /^en-(us)?$/i.test(t) || t.length === 2 ? 'en-US' : 'en-GB';
    if (lang === 'es') return /^es(-es)?$/i.test(t) ? 'es-ES' : 'es-419';
    if (lang === 'fr') return /-ca$/i.test(t) ? 'fr-CA' : 'fr-FR';
    if (lang === 'pt') return 'pt-BR';
    if (lang === 'de') return 'de-DE';
    if (lang === 'it') return 'it-IT';
  }
  return 'en-US';
}

export const LOCALES = Object.keys(STRINGS);
export function stringsFor(locale) { return STRINGS[locale] || STRINGS['en-US']; }

function el(tag, attrs, kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'text') e.textContent = v; else e.setAttribute(k, v);
  }
  for (const k of kids || []) e.appendChild(k);
  return e;
}

export function initGraphicsPanel(getView) {
  const box = document.getElementById('set-gfx-fieldset');
  if (!box) return;
  const langs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
  const locale = pickLocale(langs);
  const S = stringsFor(locale);
  const tier = (t) => S.tiers[t] || t;
  const fill = (s, t) => s.replace('{t}', t);
  let saved = loadGraphics();

  box.lang = locale;
  box.textContent = '';
  box.appendChild(el('legend', { text: S.legend }));

  const preset = el('select', { id: 'gfx-preset', 'data-gfx': 'preset' });
  box.appendChild(el('label', { class: 'field', for: 'gfx-preset' }, [el('span', { text: S.quality }), preset]));

  const scale = el('input', { type: 'range', id: 'gfx-scale', min: '50', max: '200', step: '5', 'data-gfx': 'render_scale' });
  const scaleOut = el('output', { id: 'gfx-scale-out', for: 'gfx-scale' });
  box.appendChild(el('label', { class: 'slider', for: 'gfx-scale' }, [
    el('span', { class: 'slider-head' }, [el('span', { text: S.scale }), scaleOut]), scale]));

  const catSel = {};
  const grid = el('div', { class: 'gfx-cats' });
  for (const cat of Object.keys(CATEGORIES)) {
    const sel = el('select', { id: 'gfx-cat-' + cat, 'data-gfx-cat': cat });
    catSel[cat] = sel;
    grid.appendChild(el('label', { class: 'field', for: sel.id }, [el('span', { text: S.cats[cat] }), sel]));
  }
  box.appendChild(grid);

  const adaptive = el('input', { type: 'checkbox', id: 'gfx-adaptive', 'data-gfx': 'adaptive' });
  const fps = el('input', { type: 'checkbox', id: 'gfx-fps', 'data-gfx': 'show_fps' });
  box.appendChild(el('label', { class: 'opt' }, [adaptive, document.createTextNode(' ' + S.adaptive)]));
  box.appendChild(el('label', { class: 'opt' }, [fps, document.createTextNode(' ' + S.fps)]));
  const summary = el('p', { class: 'status-line', id: 'gfx-summary', 'aria-live': 'polite' });
  const note = el('p', { class: 'status-line gfx-note', id: 'gfx-note' });
  note.hidden = true;
  box.appendChild(summary);
  box.appendChild(note);

  function info() {
    const v = getView();
    return v && v.graphicsInfo ? v.graphicsInfo() : null;
  }

  function refresh() {
    const i = info();
    const detected = i ? i.detected : 'balanced';
    const r = i ? i.resolved : null;
    const cur = PRESETS.includes(saved.preset) ? saved.preset : 'auto';
    preset.textContent = '';
    preset.appendChild(el('option', { value: 'auto', text: fill(S.auto, tier(detected)) }));
    for (const p of PRESETS) preset.appendChild(el('option', { value: p, text: tier(p) }));
    preset.value = cur;
    const active = r ? r.preset : (cur === 'auto' ? detected : cur);
    for (const [cat, tiers] of Object.entries(CATEGORIES)) {
      const sel = catSel[cat];
      sel.textContent = '';
      sel.appendChild(el('option', { value: 'preset', text: fill(S.fromPreset, tier(presetTier(active, cat))) }));
      for (const t of tiers) sel.appendChild(el('option', { value: t, text: tier(t) }));
      sel.value = tiers.includes(saved[cat]) ? saved[cat] : 'preset';
    }
    const pct = Math.round((Number(saved.render_scale) || 1) * 100);
    scale.value = String(pct);
    scaleOut.textContent = pct + '%';
    adaptive.checked = saved.adaptive !== false;
    fps.checked = !!saved.show_fps;
    summary.textContent = i ? summarize(i) : '';
    const notes = [];
    if (i && i.kind === '2d') notes.push(S.no3d);
    else if (i && i.postFailed) notes.push(S.postFailed);
    if (i && i.kind === '3d' && r && r.antialias !== 'msaa' && i.nativeAA) notes.push(S.msaaReload);
    note.textContent = notes.join(' ');
    note.hidden = !notes.length;
  }

  function summarize(i) {
    const r = i.resolved;
    const parts = [i.gpu];
    parts.push(r.shadows === 'off' ? S.noShadows : `${S.cats.shadows} ${tier(r.shadows).toLowerCase()}`);
    for (const cat of ['ao', 'bloom', 'reflections', 'particles']) if (r[cat] !== 'off') parts.push(S.cats[cat]);
    parts.push(r.antialias === 'off' ? S.noAA : tier(r.antialias));
    if (i.pixels && i.pixels[0] > 1) parts.push(`${i.pixels[0]}×${i.pixels[1]} px`);
    return parts.join(' · ');
  }

  function commit() {
    saveGraphics(saved);
    const v = getView();
    if (v && v.setGraphics) v.setGraphics(saved);
    refresh();
  }

  preset.addEventListener('change', () => { saved = choosePreset(saved, preset.value); commit(); });
  scale.addEventListener('input', () => {
    saved.render_scale = Math.round(Number(scale.value)) / 100;
    scaleOut.textContent = scale.value + '%';
    commit();
  });
  for (const [cat, sel] of Object.entries(catSel)) {
    sel.addEventListener('change', () => {
      if (sel.value === 'preset') delete saved[cat]; else saved[cat] = sel.value;
      commit();
    });
  }
  adaptive.addEventListener('change', () => { saved.adaptive = adaptive.checked; commit(); });
  fps.addEventListener('change', () => { saved.show_fps = fps.checked; commit(); });

  // Keep the GPU/cost line current whenever the Settings screen is shown.
  const screen = document.getElementById('screen-settings');
  if (screen && window.MutationObserver) {
    new MutationObserver(() => { if (screen.classList.contains('active')) refresh(); })
      .observe(screen, { attributes: true, attributeFilter: ['class'] });
  }
  refresh();
}
