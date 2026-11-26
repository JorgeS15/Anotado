import { en } from './i18n-en';

/**
 * Interface language. Texts are written in Portuguese in the code and used as
 * keys: `t('Arquivo')`. Other languages map them in their dictionary; anything
 * missing falls back to Portuguese. `{name}` placeholders are filled from `vars`.
 */

export type Lang = 'pt' | 'en';
export type LangPref = 'auto' | Lang;

const KEY = 'anotado:lang';

export function langPref(): LangPref {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'pt' || value === 'en' ? value : 'auto';
  } catch {
    return 'auto';
  }
}

/** Changing the language reloads the app, so every text is built in it from the start. */
export function setLangPref(pref: LangPref) {
  try {
    if (pref === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {
    /* ignore */
  }
  location.reload();
}

function detect(): Lang {
  const pref = langPref();
  if (pref !== 'auto') return pref;
  const languages = typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language];
  return languages.some((l) => l?.toLowerCase().startsWith('pt')) || !languages.length ? 'pt' : 'en';
}

export const lang: Lang = detect();

/** For dates and numbers. */
export const locale = lang === 'pt' ? 'pt-PT' : navigator.languages?.find((l) => l.startsWith('en')) || 'en-GB';

const dictionaries: Record<Lang, Record<string, string> | null> = { pt: null, en };

export function t(text: string, vars?: Record<string, string | number>): string {
  const out = dictionaries[lang]?.[text] ?? text;
  return vars ? out.replace(/\{(\w+)\}/g, (match, key) => (key in vars ? String(vars[key]) : match)) : out;
}

/** `tn(n, '{n} nota', '{n} notas')` picks the form for `n` and fills `{n}`. */
export function tn(n: number, one: string, other: string, vars: Record<string, string | number> = {}): string {
  return t(n === 1 ? one : other, { n, ...vars });
}

if (typeof document !== 'undefined') document.documentElement.lang = lang === 'pt' ? 'pt-PT' : 'en';
