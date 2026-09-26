import { useSyncExternalStore } from 'react';
import { translations } from './translations';
export type Locale = 'zh-CN' | 'en';
const key = 'vitrip.locale';
let locale: Locale = 'zh-CN';
try {
  if (localStorage.getItem(key) === 'en') locale = 'en';
} catch {
  /* unavailable storage */
}
const listeners = new Set<() => void>();
export function setLocale(value: Locale) {
  locale = value;
  try {
    localStorage.setItem(key, value);
  } catch {
    /* session preference still works */
  }
  document.documentElement.lang = value;
  listeners.forEach((listener) => listener());
}
export function useLocale() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => locale,
  );
}
export function t(text: string, params: Record<string, string | number> = {}): string {
  const translated = locale === 'en' ? (translations[text] ?? text) : text;
  return translated.replace(/\{(\w+)\}/g, (match, name: string) => String(params[name] ?? match));
}
if (typeof document !== 'undefined') document.documentElement.lang = locale;
