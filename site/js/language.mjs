export const LANGUAGE_KEY = 'ziyu-ui-language-v1';
export const LANGUAGE_NAMES = {en:'English', es:'Español', zh:'中文'};

export const isLanguage = value => Object.hasOwn(LANGUAGE_NAMES, value);

export function browserLanguage(languages = []) {
  for (const tag of languages) {
    const language = String(tag).toLowerCase().split(/[-_]/)[0];
    if (language === 'es' || language === 'en') return language;
  }
  return 'en';
}

export function resolveLanguage({urlLanguage, savedLanguage, legacyLanguage, languages = []} = {}) {
  if (isLanguage(urlLanguage)) return urlLanguage;
  if (isLanguage(savedLanguage)) return savedLanguage;
  // The old app defaulted records to Chinese. Only an old EN/ES value reliably
  // indicates a choice. This migration leaves actual learning records intact.
  if (legacyLanguage === 'en' || legacyLanguage === 'es') return legacyLanguage;
  return browserLanguage(languages);
}
