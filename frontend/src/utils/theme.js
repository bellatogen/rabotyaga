// Управление темой приложения (auto / light / dark)

const TG = (typeof window !== 'undefined' && window.Telegram) ? window.Telegram.WebApp : null;

/** Ключ хранилища для настройки темы */
export const THEME_KEY = 'rab:theme_pref';

/** Определяет, предпочитает ли система/Telegram светлую тему */
export function systemPrefersLight() {
  try {
    if (TG?.colorScheme) return TG.colorScheme === 'light';
    return window.matchMedia('(prefers-color-scheme: light)').matches;
  } catch {
    return false;
  }
}

/**
 * Применяет тему к документу.
 * pref: "auto" | "light" | "dark"
 */
export function applyTheme(pref) {
  const resolved = pref === 'auto' ? (systemPrefersLight() ? 'light' : 'dark') : pref;
  try {
    document.documentElement.setAttribute('data-theme', resolved);
  } catch {}
}
