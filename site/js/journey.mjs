import {TYPES, QUAD_TYPES, settleSelection} from './engine.mjs';
import {deriveLessons} from './matching.mjs';

export const JOURNEY_SCHEMA_VERSION = 2;
export const ROUTE_ID = 'growth-tree-v1';
export const CURRICULUM_VERSION = 'journey-50-v1';
// This release identity is the source-file hash, not the reserialized HTTP JSON hash.
export const CONTENT_VERSION = 'bc62a904cfef2f76dc482dbf17a11032448bd5792034a16200427267df1fccbb';
export const REVIEW_TARGETS = Object.freeze({
  'review-3-v1': Object.freeze(['sun', 'person', 'forest', 'field']),
  'review-6-v1': Object.freeze(['gate', 'horse', 'fish', 'cart']),
  'review-9-v1': Object.freeze(['hand', 'rice', 'rest', 'cloud'])
});
const CHAPTERS = [
  ['shape', '看见形', 'Seeing shapes', 'Ver las formas', 0, 3],
  ['world', '走进世界', 'Into the world', 'Explorar el mundo', 3, 6],
  ['everyday', '人与生活', 'People and daily life', 'Personas y vida diaria', 6, 9],
  ['relations', '关系与变化', 'Connections and change', 'Relaciones y cambios', 9, 13]
];
const ID = /^[A-Za-z0-9_-]{1,80}$/;
const validId = value => typeof value === 'string' && ID.test(value);
const SHA = /^[a-f0-9]{64}$/;
const EVENT_KEYS = ['eventId', 'attemptId', 'nodeId', 'completedAt', 'contentVersion', 'curriculumVersion', 'targetIds', 'mode', 'script', 'hints', 'attempts'];
const object = value => !!value && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const unique = value => Array.isArray(value) && new Set(value).size === value.length;
const integer = value => Number.isSafeInteger(value) && value >= 0 && value <= 10000;
const timestamp = value => {
  if (typeof value !== 'string') return false;
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!parts) return false;
  const [, year, month, day, hour, minute, second] = parts.map(Number);
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 &&
    day <= new Date(Date.UTC(year, month, 0)).getUTCDate() && hour < 24 && minute < 60 && second < 60 &&
    Number.isFinite(Date.parse(value));
};
const copy = value => JSON.parse(JSON.stringify(value));
const nodeFor = (journey, id) => typeof id === 'string' && Object.hasOwn(journey.nodeById, id) ? journey.nodeById[id] : null;
const equalSet = (a, b) => unique(a) && a.length === b.length && a.every(id => b.includes(id));

/** Compile the approved release into a single route. This never changes the library. */
export function createJourney(characters, {contentVersion = CONTENT_VERSION} = {}) {
  if (!SHA.test(contentVersion)) throw new Error('Invalid journey content version');
  if (!Array.isArray(characters) || characters.length !== 50 ||
      new Set(characters.map(character => character.id)).size !== 50 ||
      characters.filter(character => character.practiceEligible !== false).length !== 49) {
    throw new Error('This curriculum requires the approved fifty-target library');
  }
  const lessons = deriveLessons(characters);
  if (lessons.length !== 13 || lessons.some((lesson, index) => lesson.id !== `lesson${index + 1}`)) {
    throw new Error('This curriculum requires the thirteen configured lessons');
  }
  const byId = new Map(characters.map(character => [character.id, character]));
  const chapters = CHAPTERS.map(([id, titleZh, titleEn, titleEs], order) =>
    ({id, titleZh, titleEn, titleEs, order, nodeIds: []}));
  const nodes = [];
  const add = node => {
    node.nodeId = node.id;
    node.order = nodes.length;
    const groups = new Set();
    for (const id of node.targetIds) {
      const character = byId.get(id);
      if (!character || character.practiceEligible === false) throw new Error('Ineligible journey target');
      for (const group of character.confusionGroups || []) {
        if (groups.has(group)) throw new Error('Conflicting journey targets');
        groups.add(group);
      }
    }
    chapters[node.chapterIndex].nodeIds.push(node.id);
    nodes.push(node);
  };
  add({id: 'tutorial-v1', kind: 'tutorial', chapterId: 'shape', chapterIndex: 0,
    lessonId: null, targetIds: ['sun'], prerequisiteNodeId: null,
    titleZh: '认识连接', titleEn: 'Your first connection', titleEs: 'Tu primera conexión'});
  const encountered = new Set();
  lessons.forEach((lesson, index) => {
    const chapterIndex = CHAPTERS.findIndex(([, , , , first, last]) => index >= first && index < last);
    const node = {id: `journey-${lesson.id}-v1`, kind: 'main', chapterId: chapters[chapterIndex].id,
      chapterIndex, lessonId: lesson.id, targetIds: [...lesson.characterIds],
      prerequisiteNodeId: index ? `journey-lesson${index}-v1` : null,
      titleZh: lesson.titleZh, titleEn: lesson.titleEn, titleEs: lesson.titleEs};
    add(node);
    for (const id of node.targetIds) encountered.add(id);
    const reviewId = `review-${index + 1}-v1`;
    if (Object.hasOwn(REVIEW_TARGETS, reviewId)) {
      const targetIds = [...REVIEW_TARGETS[reviewId]];
      if (targetIds.some(id => !encountered.has(id))) throw new Error('Review contains an unseen target');
      add({id: reviewId, kind: 'review', chapterId: node.chapterId, chapterIndex,
        lessonId: null, targetIds, prerequisiteNodeId: node.id,
        titleZh: '复习营地', titleEn: 'Review camp', titleEs: 'Campamento de repaso'});
    }
  });
  return {schemaVersion: JOURNEY_SCHEMA_VERSION, routeId: ROUTE_ID,
    curriculumVersion: CURRICULUM_VERSION, contentVersion, chapters, nodes,
    nodeById: Object.fromEntries(nodes.map(node => [node.id, node]))};
}

export function emptyJourneyProgress(journey) {
  return {schemaVersion: JOURNEY_SCHEMA_VERSION, routeId: ROUTE_ID,
    curriculumVersion: CURRICULUM_VERSION, contentVersion: journey.contentVersion,
    revision: 0, placementNodeId: null, recommendedNodeId: 'journey-lesson1-v1', completedNodes: {}};
}

export function isJourneyCompatible(value, journey) {
  return object(value) && value.schemaVersion === JOURNEY_SCHEMA_VERSION && value.routeId === ROUTE_ID &&
    value.curriculumVersion === CURRICULUM_VERSION && value.contentVersion === journey.contentVersion;
}

/** Invalid old/foreign records never manufacture completions; caller retains its original backup. */
export function normalizeJourneyProgress(value, journey) {
  const result = emptyJourneyProgress(journey);
  if (!isJourneyCompatible(value, journey)) return result;
  result.revision = Number.isSafeInteger(value.revision) && value.revision >= 0 ? value.revision : 0;
  if (nodeFor(journey, value.placementNodeId)?.kind === 'main') result.placementNodeId = value.placementNodeId;
  if (object(value.completedNodes)) {
    for (const [id, raw] of Object.entries(value.completedNodes)) {
      const event = normalizeCompletionEvent(raw, journey);
      if (event && event.nodeId === id) result.completedNodes[id] = event;
    }
  }
  result.recommendedNodeId = recommendedNode(result, journey)?.id || null;
  return result;
}

export function nodeAccess(nodeId, progress, journey) {
  const node = nodeFor(journey, nodeId);
  if (!node) return {state: 'locked', canStart: false, completed: false};
  const completed = object(progress?.completedNodes) && Object.hasOwn(progress.completedNodes, node.id);
  const available = completed || node.kind === 'tutorial' || !node.prerequisiteNodeId ||
    Object.hasOwn(progress?.completedNodes || {}, node.prerequisiteNodeId) ||
    node.kind === 'main' && progress?.placementNodeId === node.id;
  return {state: completed ? 'completed' : available ? 'available' : 'locked', canStart: !!available, completed: !!completed};
}

export function recommendedNode(progress, journey) {
  const main = journey.nodes.filter(node => node.kind === 'main');
  const placement = main.findIndex(node => node.id === progress?.placementNodeId);
  return main.slice(Math.max(placement, 0)).find(node => !Object.hasOwn(progress?.completedNodes || {}, node.id)) || null;
}

/** Placement authorizes only its selected station; it never lights earlier stations. */
export function placeAtNode(progress, nodeId, journey) {
  if (nodeId !== null && nodeFor(journey, nodeId)?.kind !== 'main') throw new Error('Invalid placement node');
  const result = normalizeJourneyProgress(progress, journey);
  result.placementNodeId = nodeId;
  result.recommendedNodeId = recommendedNode(result, journey)?.id || null;
  return result;
}

export function normalizeCompletionEvent(raw, journey) {
  if (!object(raw) || Object.keys(raw).length !== EVENT_KEYS.length || EVENT_KEYS.some(key => !Object.hasOwn(raw, key))) return null;
  const node = nodeFor(journey, raw.nodeId);
  if (!node || !validId(raw.eventId) || !validId(raw.attemptId) || !timestamp(raw.completedAt) ||
      raw.contentVersion !== journey.contentVersion || raw.curriculumVersion !== CURRICULUM_VERSION ||
      !equalSet(raw.targetIds, node.targetIds) || !['triple', 'quad'].includes(raw.mode) ||
      node.kind === 'tutorial' && raw.mode !== 'triple' || !['simplified', 'traditional'].includes(raw.script) ||
      !integer(raw.hints) || !integer(raw.attempts) || raw.attempts < node.targetIds.length) return null;
  return Object.fromEntries(EVENT_KEYS.map(key => [key, key === 'targetIds' ? [...node.targetIds] : raw[key]]));
}

/** Existing aggregate wins: local completion is optimistic, not a server revision acknowledgment. */
export function applyCompletion(progress, raw, journey) {
  const result = normalizeJourneyProgress(progress, journey);
  const event = normalizeCompletionEvent(raw, journey);
  if (!event) throw new Error('Invalid journey completion');
  const events = Object.values(result.completedNodes);
  const knownEvent = events.find(item => item.eventId === event.eventId);
  const knownAttempt = events.find(item => item.attemptId === event.attemptId);
  if (knownEvent || knownAttempt) {
    const withoutEventId = value => Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'eventId'));
    if (knownEvent && JSON.stringify(knownEvent) !== JSON.stringify(event) ||
        knownAttempt && JSON.stringify(withoutEventId(knownAttempt)) !== JSON.stringify(withoutEventId(event))) {
      throw new Error('Conflicting journey completion identity');
    }
    return result;
  }
  if (!nodeAccess(event.nodeId, result, journey).canStart) throw new Error('Journey prerequisite incomplete');
  if (!Object.hasOwn(result.completedNodes, event.nodeId)) result.completedNodes[event.nodeId] = event;
  result.recommendedNodeId = recommendedNode(result, journey)?.id || null;
  return result;
}

/** Pass the authoritative server snapshot FIRST; it keeps its first accepted completion. */
export function mergeJourneyProgress(authoritative, incoming, journey) {
  const result = normalizeJourneyProgress(authoritative, journey);
  const other = normalizeJourneyProgress(incoming, journey);
  for (const [nodeId, event] of Object.entries(other.completedNodes)) {
    if (!Object.hasOwn(result.completedNodes, nodeId)) result.completedNodes[nodeId] = copy(event);
  }
  result.revision = Math.max(result.revision, other.revision);
  result.recommendedNodeId = recommendedNode(result, journey)?.id || null;
  return result;
}

function normalizeRound(raw, node, mode) {
  const types = mode === 'quad' ? QUAD_TYPES : TYPES;
  if (!object(raw) || !equalSet(raw.ids, node.targetIds) || !Array.isArray(raw.types) ||
      JSON.stringify(raw.types) !== JSON.stringify(types) || !Array.isArray(raw.cards) ||
      raw.cards.length !== node.targetIds.length * types.length || !unique(raw.matched) ||
      raw.matched.some(id => !node.targetIds.includes(id)) || !integer(raw.attempts) ||
      !integer(raw.correct) || raw.correct !== raw.matched.length || raw.attempts < raw.correct ||
      !integer(raw.hints) || !unique(raw.selected) || raw.selected.length > types.length ||
      typeof raw.locked !== 'boolean') return null;
  const keys = new Set(), selectedTypes = new Set();
  for (const [index, card] of raw.cards.entries()) {
    if (!object(card) || !node.targetIds.includes(card.id) || card.type !== types[index % types.length] ||
        card.key !== `${card.id}:${card.type}` || keys.has(card.key)) return null;
    keys.add(card.key);
  }
  for (const key of raw.selected) {
    const card = raw.cards.find(item => item.key === key);
    if (!card || selectedTypes.has(card.type) || !raw.locked && raw.matched.includes(card.id)) return null;
    selectedTypes.add(card.type);
  }
  if (raw.locked !== (raw.selected.length === types.length) || raw.locked && raw.attempts < 1) return null;
  if (raw.locked) {
    const ids = raw.selected.map(key => raw.cards.find(card => card.key === key).id);
    const correct = new Set(ids).size === 1;
    if (correct !== raw.matched.includes(ids[0]) || !correct && ids.some(id => raw.matched.includes(id))) return null;
  }
  const clean = {cards: raw.cards.map(({key, id, type}) => ({key, id, type})), ids: [...node.targetIds],
    types: [...types], selected: [...raw.selected], matched: [...raw.matched], attempts: raw.attempts,
    correct: raw.correct, hints: raw.hints, locked: raw.locked};
  // A correct group is already applied by engine.selectCard before the animation starts.
  return raw.locked ? settleSelection(clean) : clean;
}

export function normalizeActiveAttempt(raw, journey) {
  if (!object(raw) || raw.schemaVersion !== JOURNEY_SCHEMA_VERSION || !validId(raw.attemptId) ||
      raw.contentVersion !== journey.contentVersion || raw.curriculumVersion !== CURRICULUM_VERSION ||
      !timestamp(raw.startedAt) || !timestamp(raw.updatedAt) || Date.parse(raw.updatedAt) < Date.parse(raw.startedAt) ||
      !['triple', 'quad'].includes(raw.mode) || !['simplified', 'traditional'].includes(raw.script) ||
      !['intro', 'game'].includes(raw.stage)) return null;
  const node = nodeFor(journey, raw.nodeId);
  if (!node || node.kind === 'tutorial' && raw.mode !== 'triple' ||
      !Number.isInteger(raw.introductionIndex) || raw.introductionIndex < 0 || raw.introductionIndex > node.targetIds.length) return null;
  const round = normalizeRound(raw.round, node, raw.mode);
  if (!round || raw.stage === 'intro' && (round.matched.length || round.attempts || round.selected.length)) return null;
  return {schemaVersion: JOURNEY_SCHEMA_VERSION, nodeId: node.id, attemptId: raw.attemptId,
    startedAt: raw.startedAt, updatedAt: raw.updatedAt, contentVersion: journey.contentVersion,
    curriculumVersion: CURRICULUM_VERSION, mode: raw.mode, script: raw.script, stage: raw.stage,
    introductionIndex: raw.introductionIndex, round};
}

export function createAttempt(nodeId, round, journey, options = {}) {
  const startedAt = options.startedAt || new Date().toISOString();
  const value = normalizeActiveAttempt({schemaVersion: JOURNEY_SCHEMA_VERSION, nodeId,
    attemptId: options.attemptId || globalThis.crypto.randomUUID(), startedAt, updatedAt: startedAt,
    contentVersion: journey.contentVersion, curriculumVersion: CURRICULUM_VERSION,
    mode: options.mode || 'triple', script: options.script || 'simplified', stage: options.stage || 'game',
    introductionIndex: options.introductionIndex ?? 0, round}, journey);
  if (!value) throw new Error('Invalid journey attempt');
  return value;
}

export function captureAttempt(attempt, round, journey, options = {}) {
  const value = normalizeActiveAttempt({...attempt, round,
    stage: options.stage ?? attempt.stage, introductionIndex: options.introductionIndex ?? attempt.introductionIndex,
    updatedAt: options.updatedAt || new Date().toISOString()}, journey);
  if (!value) throw new Error('Invalid journey attempt draft');
  return value;
}

export function restoreAttempt(raw, journey) {
  const attempt = normalizeActiveAttempt(raw, journey);
  return attempt ? {attempt, round: copy(attempt.round)} : null;
}

/** Free practice has no attempt/node identity, so it cannot produce a completion event. */
export function createCompletionEvent(attempt, round, journey, options = {}) {
  const draft = normalizeActiveAttempt({...attempt, round}, journey);
  if (!draft || draft.stage !== 'game' || draft.round.matched.length !== draft.round.ids.length) return null;
  return normalizeCompletionEvent({eventId: options.eventId || globalThis.crypto.randomUUID(),
    attemptId: draft.attemptId, nodeId: draft.nodeId,
    completedAt: options.completedAt || new Date().toISOString(), contentVersion: journey.contentVersion,
    curriculumVersion: CURRICULUM_VERSION, targetIds: [...draft.round.ids], mode: draft.mode, script: draft.script,
    hints: draft.round.hints, attempts: draft.round.attempts}, journey);
}

export function journeyStorageKey(scope = 'guest') {
  if (typeof scope !== 'string' || !/^(?:guest|user:[A-Za-z0-9_-]{1,80})$/.test(scope)) throw new Error('Invalid journey owner scope');
  return `ziyu-journey-v2:${scope}`;
}
