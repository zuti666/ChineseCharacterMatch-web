export const TYPES = Object.freeze(['picture', 'ancient', 'modern']);
export const QUAD_TYPES = Object.freeze(['picture', 'ancient', 'simplified', 'traditional']);

export function shuffle(items, random = Math.random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function createRound(characters, random = Math.random, options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(options)) ||
      Object.keys(options).some(key => key !== 'types')) throw new Error('Invalid round options');
  const requested = options.types === undefined ? TYPES : options.types;
  if (!Array.isArray(requested) || ![TYPES, QUAD_TYPES].some(allowed =>
      requested.length === allowed.length && allowed.every((type, index) => requested[index] === type))) {
    throw new Error('A round requires the triple or quadruple card columns');
  }
  const types = [...requested];
  const ids = characters.map(c => c.id);
  if (new Set(ids).size !== ids.length || !ids.length) throw new Error('A round requires unique character IDs');
  const columns = types.map(type => shuffle(ids, random).map(id => ({key: `${id}:${type}`, id, type})));
  const cards = ids.flatMap((_, row) => columns.map(column => column[row]));
  return {cards, ids, types, selected: [], matched: [], attempts: 0, correct: 0, hints: 0, locked: false};
}

export function selectCard(round, key) {
  if (round.locked) return {round, kind: 'ignored'};
  const card = round.cards.find(c => c.key === key);
  if (!card || round.matched.includes(card.id)) return {round, kind: 'ignored'};
  if (round.selected.includes(key)) {
    return {round: {...round, selected: round.selected.filter(k => k !== key)}, kind: 'deselected'};
  }
  const selected = round.selected.filter(k => round.cards.find(c => c.key === k).type !== card.type).concat(key);
  if (selected.length < (round.types || TYPES).length) return {round: {...round, selected}, kind: 'selected'};
  const same = selected.every(k => round.cards.find(c => c.key === k).id === card.id);
  return {round: {...round, selected, locked: true, attempts: round.attempts + 1,
    correct: round.correct + (same ? 1 : 0), matched: same ? [...round.matched, card.id] : round.matched},
    kind: same ? 'correct' : 'incorrect', characterId: same ? card.id : null,
    attemptedIds: [...new Set(selected.map(k => round.cards.find(c => c.key === k).id))]};
}

export function settleSelection(round) {
  return {...round, selected: [], locked: false};
}

export function hintFor(round) {
  const first = round.selected.map(k => round.cards.find(c => c.key === k)).find(c => !round.matched.includes(c.id));
  const id = first ? first.id : round.ids.find(id => !round.matched.includes(id));
  return id ? {id, keys: round.cards.filter(c => c.id === id).map(c => c.key)} : null;
}

export function emptyProgress() {
  return {mastered: [], mistakes: {}, favorites: [], sessions: [], dailyGoal: 4, language: 'zh'};
}

export function normalizeProgress(value, validIds) {
  const base = emptyProgress();
  if (!value || typeof value !== 'object') return base;
  const list = array => Array.isArray(array) ? [...new Set(array.filter(id => validIds.includes(id)))] : [];
  return {...base, mastered: list(value.mastered), favorites: list(value.favorites),
    mistakes: Object.fromEntries(Object.entries(value.mistakes || {}).filter(([id, n]) => validIds.includes(id) && Number.isInteger(n) && n > 0)),
    sessions: Array.isArray(value.sessions) ? [...new Map(value.sessions.filter(s => s && typeof s.id === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(s.id) &&
      Array.isArray(s.characterIds) && s.characterIds.length > 0 && s.characterIds.length <= 100 &&
      s.characterIds.every(id => validIds.includes(id)) && new Set(s.characterIds).size === s.characterIds.length &&
      Number.isInteger(s.correct) && s.correct >= 0 && s.correct <= 10000 && Number.isInteger(s.attempts) && s.attempts >= s.correct && s.attempts <= 10000 &&
      Number.isInteger(s.seconds) && s.seconds >= 0 && s.seconds <= 86400 && typeof s.completedAt === 'string' &&
      /(?:Z|[+-]\d{2}:\d{2})$/.test(s.completedAt) && !Number.isNaN(Date.parse(s.completedAt))).map(s => [s.id, {
        id:s.id,completedAt:s.completedAt,correct:s.correct,attempts:s.attempts,seconds:s.seconds,characterIds:[...s.characterIds],
        ...(['triple', 'quad'].includes(s.matchMode) ? {matchMode:s.matchMode} : {}),
        ...(['simplified', 'traditional'].includes(s.script) ? {script:s.script} : {})
      }])).values()].slice(-200) : [],
    dailyGoal: [4, 8, 12].includes(value.dailyGoal) ? value.dailyGoal : 4,
    language: ['zh', 'en', 'es'].includes(value.language) ? value.language : 'zh'};
}
