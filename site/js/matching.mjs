export const MATCH_PREFERENCES_KEY = 'ziyu-match-preferences-v1';
export function normalizeMatchPreferences(value) {
  return {mode:value?.mode === 'quad' ? 'quad' : 'triple',
    script:value?.script === 'traditional' ? 'traditional' : 'simplified'};
}
export function characterForm(character, script = 'simplified') {
  return character?.[script] || character?.hanzi || '';
}
export function sameForms(character) {
  return characterForm(character,'simplified') === characterForm(character,'traditional');
}
