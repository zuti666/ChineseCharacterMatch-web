import {createRound, selectCard, settleSelection, hintFor, shuffle, emptyProgress, normalizeProgress} from './engine.mjs';
import {dictionaries} from './i18n.mjs';
import {appUrl} from './paths.mjs';

const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const iconPaths = {
  grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  book:'<path d="M12 6c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1Z"/><path d="M12 6v15"/>',
  chart:'<path d="M4 4v16h17M8 15v-4m5 4V7m5 8v-6"/>',
  leaf:'<path d="M19 4C8 2 3 7 5 15c7 5 16 0 14-11Z"/><path d="M3 21 15 9"/>',
  sprout:'<path d="M12 21V10M12 14C5 15 3 11 3 7c7-1 10 3 9 7ZM12 10c0-6 4-8 9-7 0 6-3 9-9 7Z"/>',
  source:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h6m-6 5h6m-6 5h3"/>',
  help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4m0 3h.01"/>',
  arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',
  refresh:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a8 8 0 0 1 14 5M4 12a8 8 0 0 0 14 5"/>',
  sound:'<path d="m11 4-6 5H2v6h3l6 5V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  star:'<path d="m12 3 2.8 5.8 6.4.9-4.6 4.5 1.1 6.3L12 17.5l-5.7 3 1.1-6.3-4.6-4.5 6.4-.9L12 3Z"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  bulb:'<path d="M9 18h6m-5 3h4M8 14a6 6 0 1 1 8 0l-1 2H9l-1-2Z"/>',
  export:'<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${iconPaths[name] || iconPaths.leaf}</svg>`;
const app = $('#app');
const modal = $('#modal');
let characters = [], progress = emptyProgress(), user = null, language = 'zh', view = 'match';
let game, lesson = 'lesson1', featuredId = 'mountain', roundStarted = Date.now(), roundSaved = false;
let filter = 'all', search = '', accountAvailable = false, storageOK = true, feedbackKey = 'ready', feedbackKind = '';
let busyAnimation = false, roundVersion = 0, saveQueue = Promise.resolve(), syncError = false, pendingSaves = 0, toastTimer;
const LESSONS = {lesson1:['sun','moon','mountain','wood'], lesson2:['fire','person','eye','mouth'], lesson3:['forest','big','martial','field']};
const t = (key, values = {}) => Object.entries(values).reduce((text, [k, v]) => text.replaceAll(`{${k}}`, v), dictionaries[language][key] || dictionaries.zh[key] || key);
const byId = id => characters.find(c => c.id === id);
const validIds = () => characters.map(c => c.id);
const meaning = c => language === 'es' ? c.es : c.en;
const description = c => language === 'zh' ? c.description : language === 'es' ? c.descriptionEs || c.descriptionEn : c.descriptionEn;
const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const eligible = () => characters.filter(c => c.practiceEligible !== false);

function readGuest() {
  try {return normalizeProgress(JSON.parse(localStorage.getItem('ziyu-progress-v1')), validIds());}
  catch {storageOK = false; return emptyProgress();}
}
function toast(message) {
  clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').classList.add('visible');
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 4300);
}
async function api(path, options = {}) {
  const response = await fetch(appUrl(`api/${path}`), {credentials:'same-origin', headers:{'Content-Type':'application/json'}, ...options});
  let data;
  try {data = await response.json();} catch {throw new Error(t('networkError'));}
  if (!response.ok) throw new Error(language === 'zh' ? data.error || t('networkError') : `${t('networkError')} (${data.code || response.status})`);
  return data;
}
function saveProgress() {
  progress.language = language;
  if (!user) {
    try {localStorage.setItem('ziyu-progress-v1', JSON.stringify(progress)); storageOK = true;}
    catch {storageOK = false; toast(t('storageError'));}
    updateSaveState(); return Promise.resolve();
  }
  const snapshot = JSON.stringify(progress), accountId = user.id;
  pendingSaves++; updateSaveState();
  saveQueue = saveQueue.catch(() => {}).then(async () => {
    if (user?.id !== accountId) return;
    try {await api('progress', {method:'PUT', body:snapshot}); syncError = false;}
    catch (error) {syncError = true; toast(`${t('saveError')} · ${error.message}`);}
    finally {pendingSaves--; updateSaveState();}
  });
  return saveQueue;
}
function saveLabel() {return user ? pendingSaves ? t('saving') : syncError ? t('saveError') : t('synced') : storageOK ? t('storage') : t('storageError');}
function updateSaveState() {
  const node = $('#save-state'); if (node) {node.innerHTML = `${icon(syncError ? 'refresh' : 'check')} ${escape(saveLabel())}`; node.dataset.action = syncError ? 'retry' : '';}
}
function startRound(ids) {
  roundVersion++; busyAnimation = false;
  const chosen = ids ? ids.map(byId).filter(c => c && c.practiceEligible !== false) : lesson === 'review' ? shuffle(eligible()).slice(0,4) : (LESSONS[lesson] || LESSONS.lesson1).map(byId).filter(Boolean);
  const unique = [...new Map(chosen.map(c => [c.id,c])).values()].slice(0,4);
  if (unique.length < 4) {
    for (const c of shuffle(eligible())) if (!unique.some(x => x.id === c.id) && unique.length < 4) unique.push(c);
  }
  game = createRound(unique); roundStarted = Date.now(); roundSaved = false; feedbackKey = 'ready'; feedbackKind = '';
  featuredId = unique.find(c => c.id === 'mountain')?.id || unique[0].id;
}
function shell() {
  document.documentElement.lang = language === 'zh' ? 'zh-CN' : language;
  document.title = `字遇 · ${t(view)}`;
  const nav = [['match','grid'],['atlas','book'],['progress','chart'],['sources','source']];
  app.innerHTML = `<div class="shell">
    <aside class="sidebar"><div class="brand"><span class="brand-stamp">字</span><div class="brand-name">字遇<small>HANZI ENCOUNTERS</small></div></div>
    <div class="nav-label">${t('learning')}</div><nav class="nav" aria-label="${t('learning')}">${nav.map(([name,i])=>`<button data-view="${name}" class="${view===name?'active':''}" ${view===name?'aria-current="page"':''}>${icon(i)}<span>${t(name)}</span></button>`).join('')}</nav>
    <div class="sidebar-note">${icon('sprout')}<p>${language==='zh'?'一笔一画，<br>遇见汉字的来处。':language==='es'?'Cada trazo,<br>un descubrimiento.':'Every little stroke,<br>a new discovery.'}</p><small>GROW A LITTLE, EVERY DAY</small></div>
    <div class="user-box"><div class="avatar">${user?escape(user.username.slice(0,1)):'初'}</div><div class="user-text"><b>${escape(user?.username || t('guest'))}</b><small>${user?t('serverSave'):t('localSave')}</small></div><button data-action="account" aria-label="${t('account')}">${icon('user')}</button></div></aside>
    <main class="main"><header class="topbar"><div class="mobile-brand"><span class="brand-stamp">字</span>字遇</div><div class="breadcrumb">${icon('leaf')}<span>${t('explore')}</span><span>/</span><span>${t(view)}</span></div><div class="top-tools"><span class="version">PPT · PROTOTYPE 0.1</span><select class="language" id="language" aria-label="Language / 语言"><option value="zh" ${language==='zh'?'selected':''}>中文</option><option value="en" ${language==='en'?'selected':''}>English</option><option value="es" ${language==='es'?'selected':''}>Español</option></select><button class="round-icon" data-action="account" aria-label="${user?t('account'):t('login')}">${icon('user')}</button></div></header>
    <div id="view-content"></div><footer class="page-footer"><span>${icon('sprout')}${t('footer')}</span><button id="save-state" class="text-button" style="font-size:inherit;padding:0">${icon('check')}${escape(saveLabel())}</button></footer></main></div>`;
  renderView();
}
function renderView() {
  if (view === 'match') renderMatch();
  else if (view === 'atlas') renderAtlas();
  else if (view === 'progress') renderProgress();
  else renderSources();
}
function todayIds() {
  const today = new Date().toDateString();
  return new Set(progress.sessions.filter(s => new Date(s.completedAt).toDateString() === today).flatMap(s => s.characterIds));
}
function goalMarkup() {
  const count = todayIds().size;
  return `<div class="goal-head">${t('daily')}${icon('sun')}</div><div class="goal-count">${count}<span>/ ${progress.dailyGoal} ${t('characters')}</span></div><div class="progress-track"><div class="progress-fill" style="width:${Math.min(100,count/progress.dailyGoal*100)}%"></div></div><p>${t('dailyNote')}</p>`;
}
function storyMarkup() {
  const c = byId(featuredId);
  return `<div class="panel-eyebrow">${t('story')} · A CLOSER LOOK</div><div class="story-title"><div class="story-hanzi">${c.hanzi}</div><button class="round-icon" data-speak="${c.id}" aria-label="${t('speak')} · ${c.hanzi}">${icon('sound')}</button></div><div class="story-pinyin">${c.pinyin}</div><div class="story-meaning">${escape(meaning(c))}</div><div class="divider"></div><p>${escape(description(c))}</p><div class="source-small">${t('pptPage',{n:c.pptSlide})} · ${t('reviewRequired')}</div><button class="text-button" data-detail="${c.id}">${t('detail')} ${icon('arrow')}</button>`;
}
function renderMatch() {
  $('#view-content').innerHTML = `<section class="hero"><div><div class="eyebrow">${t('eyebrow')}</div><h1>${t('hero1')}<br><em>${t('hero2')}</em></h1><p>${t('subtitle')}</p></div><div class="hero-art" aria-hidden="true"><div class="orbit"></div><img src="${escape(appUrl('/assets/ppt/mountain-picture.png'))}" alt=""><div class="hero-character">山</div><span class="tiny-seal">以形会意</span></div></section>
    <div class="workspace"><div><div class="lesson-tabs" aria-label="${t('learning')}">${['lesson1','lesson2','lesson3','review'].map((name,i)=>`<button class="lesson-tab ${lesson===name?'active':''}" data-lesson="${name}" aria-pressed="${lesson===name}">${t(name)}<span>${i===3?'↻':String(i+1).padStart(2,'0')}</span></button>`).join('')}</div>
    <section class="play-area" aria-label="${t('match')}"><div class="play-heading"><div><h2>${t('gameTitle')}</h2><p>${t('gameSub')}</p></div><button class="quiet-button" data-action="guide">${icon('help')}${t('guide')}</button></div>
    <div class="round-meta"><strong id="round-count"></strong><div class="progress-track"><div id="round-fill" class="progress-fill"></div></div><span id="selection-count"></span></div>
    <div class="column-heads">${['picture','ancient','modern'].map((key,i)=>`<div><span>${i+1}</span>${t(key)}</div>`).join('')}</div>
    <div class="board" id="board">${game.cards.map(card=>{const c=byId(card.id);const accessible=card.type==='modern'?c.hanzi:card.type==='picture'?(language==='zh'?c.description:c[language==='es'?'es':'en']):(language==='zh'?c.hint:c[language==='es'?'hintEs':'hintEn']);return `<button class="card ${card.type}" data-card="${card.key}" aria-label="${t(card.type)} · ${escape(accessible)}">${card.type==='modern'?`<span class="hanzi" lang="zh">${c.hanzi}</span><span class="card-seal">HANZI</span>`:`<img src="${escape(appUrl(c[card.type]))}" alt="" draggable="false">`}</button>`;}).join('')}</div>
    <div class="board-footer"><div id="feedback" class="feedback" role="status" aria-live="polite"></div><button class="text-button" data-action="hint">${icon('bulb')}${t('hint')}</button></div></section><p class="board-caption">${t('caption')}</p><button class="text-button" data-action="new-round" style="margin-top:5px">${icon('refresh')}${t('newRound')}</button></div>
    <aside class="right-column"><section class="story-panel" id="story-panel">${storyMarkup()}</section><section class="goal-panel" id="goal-panel">${goalMarkup()}</section><div class="tip-card">${icon('leaf')}<span>${t('tip')}</span></div></aside></div>`;
  updateBoard();
}
function updateBoard(kind = '') {
  if (view !== 'match' || !$('#board')) return;
  document.querySelectorAll('[data-card]').forEach(button => {
    const key = button.dataset.card, card = game.cards.find(c => c.key === key), selected = game.selected.includes(key), matched = game.matched.includes(card.id);
    button.classList.toggle('selected', selected); button.classList.toggle('matched', matched && !selected);
    button.classList.toggle('correct', selected && kind === 'correct'); button.classList.toggle('wrong', selected && kind === 'incorrect');
    button.disabled = matched && !selected; button.setAttribute('aria-pressed', selected ? 'true' : 'false');
  });
  $('#round-count').textContent = `${game.matched.length} / ${game.ids.length} ${t('groups')}`;
  $('#round-fill').style.width = `${game.matched.length / game.ids.length * 100}%`;
  $('#selection-count').textContent = t('selectedCount',{n:game.selected.length});
  $('#feedback').textContent = t(feedbackKey); $('#feedback').className = `feedback ${feedbackKind}`;
}
function handleCard(key) {
  if (busyAnimation) return;
  const result = selectCard(game,key); game = result.round;
  if (result.kind === 'ignored') return;
  feedbackKey = ['correct','incorrect'].includes(result.kind) ? result.kind : game.selected.length ? 'selected' : 'ready';
  feedbackKind = result.kind === 'correct' ? 'good' : result.kind === 'incorrect' ? 'bad' : '';
  updateBoard(result.kind);
  if (!['correct','incorrect'].includes(result.kind)) return;
  busyAnimation = true;
  if (result.kind === 'correct') {
    if (!progress.mastered.includes(result.characterId)) progress.mastered.push(result.characterId);
    featuredId = result.characterId; if ($('#story-panel')) $('#story-panel').innerHTML = storyMarkup();
  } else result.attemptedIds.forEach(id => {progress.mistakes[id] = (progress.mistakes[id] || 0) + 1;});
  saveProgress();
  const version = roundVersion;
  setTimeout(() => {
    if (version !== roundVersion) return;
    game = settleSelection(game); busyAnimation = false; updateBoard();
    if (game.matched.length === game.ids.length) finishRound();
  }, 650);
}
function finishRound() {
  if (roundSaved) return; roundSaved = true;
  const seconds = Math.max(1,Math.round((Date.now()-roundStarted)/1000));
  progress.sessions.push({id:uid(),completedAt:new Date().toISOString(),correct:game.correct,attempts:game.attempts,seconds,characterIds:[...game.ids]});
  progress.sessions = progress.sessions.slice(-200); saveProgress();
  if ($('#goal-panel')) $('#goal-panel').innerHTML = goalMarkup();
  openModal('resultTitle', `<div class="result-summary"><div class="success-art">${icon('sprout')}</div><h3>${t('resultTitle')}</h3><p>${t('resultSub',{n:game.ids.length})}</p></div><div class="result-stats"><div><b>${game.ids.length}</b><small>${t('characters')}</small></div><div><b>${Math.round(game.correct/game.attempts*100)}%</b><small>${t('accuracy')}</small></div><div><b>${game.hints}</b><small>${t('roundHints')}</small></div></div><p class="modal-lead">${t('resultNote')}</p><div class="modal-actions"><button class="primary-button" data-action="again">${t('again')}${icon('arrow')}</button><button class="secondary-button" data-view="progress">${t('seeProgress')}</button></div>`);
}
function renderAtlas() {
  $('#view-content').innerHTML = `<section class="view-heading"><div><h1>${t('atlasTitle')}</h1><p>${t('atlasSub')}</p></div><label class="search">${icon('search')}<input id="search" type="search" value="${escape(search)}" placeholder="${t('search')}" aria-label="${t('search')}"></label></section><div class="filter-row">${['all','nature','body','life','meaning','favorites'].map(name=>`<button data-filter="${name}" class="${filter===name?'active':''}" aria-pressed="${filter===name}">${t(name)}${name==='all'?` · ${characters.length}`:''}</button>`).join('')}</div><div class="atlas-grid" id="atlas-grid"></div>`;
  renderAtlasCards();
}
function renderAtlasCards() {
  const query = search.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const found = characters.filter(c => (filter === 'all' || (filter === 'favorites' ? progress.favorites.includes(c.id) : c.category === filter)) && [c.hanzi,c.pinyin,c.en,c.es,c.description].join(' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(query));
  $('#atlas-grid').innerHTML = found.length ? found.map(c=>`<article class="atlas-card"><button data-detail="${c.id}" aria-label="${t('detail')} · ${c.hanzi}"><div class="atlas-images"><img src="${escape(appUrl(c.picture))}" alt=""><span>→</span><img src="${escape(appUrl(c.ancient))}" alt=""></div><div class="atlas-bottom"><strong lang="zh">${c.hanzi}</strong><div>${c.pinyin}<small>${escape(meaning(c))}</small></div></div>${c.contentWarning?`<div class="source-small" style="margin-top:8px;color:#ab805c">${c.id==='water'?t('libraryWarning'):t('originalWarning')}</div>`:''}</button><button class="favorite-button ${progress.favorites.includes(c.id)?'on':''}" data-favorite="${c.id}" aria-label="${progress.favorites.includes(c.id)?t('unfavorite'):t('favorite')} · ${c.hanzi}" aria-pressed="${progress.favorites.includes(c.id)}">${icon('star')}</button></article>`).join('') : `<div class="empty-state">${icon('search')}${t('noResults')}</div>`;
}
function renderProgress() {
  const attempts = progress.sessions.reduce((n,s)=>n+s.attempts,0), correct = progress.sessions.reduce((n,s)=>n+s.correct,0);
  const mistakes = Object.entries(progress.mistakes).sort((a,b)=>b[1]-a[1]).map(([id,n])=>({c:byId(id),n})).filter(x=>x.c);
  $('#view-content').innerHTML = `<section class="view-heading"><div><h1>${t('progressTitle')}</h1><p>${t('progressSub')}</p></div><button class="quiet-button" data-action="export">${icon('export')}${t('export')}</button></section>
    <div class="info-banner"><span>${t(user?'userNote':'guestNote',{name:escape(user?.username)})}</span>${!user?`<button class="text-button" data-action="account">${t('login')} ${icon('arrow')}</button>`:''}</div>
    <div class="stats-grid">${[['practiced',progress.mastered.length,'characters'],['completed',progress.sessions.length,'completed'],['accuracy',attempts?`${Math.round(correct/attempts*100)}%`:'—','session'],['favoriteCount',progress.favorites.length,'characters']].map(([key,n])=>`<div class="stat-box"><small>${t(key)}</small><b>${n}</b><span>${key==='practiced'?t('practiceOnly'):key==='accuracy'?t('completed'):t('characters')}</span></div>`).join('')}</div>
    <section class="record-panel"><h2>${t('practiced')}</h2>${progress.mastered.length?`<div class="character-chips">${progress.mastered.map(id=>`<button class="character-chip" data-detail="${id}">${byId(id).hanzi}<small>${byId(id).pinyin}</small></button>`).join('')}</div><p>${t('notMastery')}</p>`:`<p>${t('noPractice')}</p><button class="primary-button" data-view="match">${t('practiceNow')}${icon('arrow')}</button>`}</section>
    <section class="record-panel"><h2>${t('mistakes')}</h2>${mistakes.length?`<div class="character-chips">${mistakes.map(({c,n})=>`<button class="character-chip" data-detail="${c.id}">${c.hanzi}<small>× ${n}</small></button>`).join('')}</div><p>${t('mistakeNote')}</p><button class="quiet-button" data-action="review-mistakes">${icon('refresh')}${t('practiceMistakes')}</button>`:`<p>${t('noMistakes')}</p>`}</section>
    <section class="record-panel"><h2>${t('recent')}</h2>${progress.sessions.length ? [...progress.sessions].reverse().slice(0,15).map(s=>`<div class="history-row"><div>${t('session',{n:s.characterIds.length,a:s.attempts})}<small>${new Date(s.completedAt).toLocaleString(language==='zh'?'zh-CN':language)} · ${s.seconds} ${t('seconds')}</small></div><b>${s.characterIds.map(id=>byId(id)?.hanzi||'').join(' ')}</b></div>`).join('') : `<p>${t('historyEmpty')}</p>`}</section><section class="record-panel"><label for="goal-select" style="font-size:12px;margin-right:10px">${t('goal')}</label><select class="goal-select" id="goal-select">${[4,8,12].map(n=>`<option value="${n}" ${progress.dailyGoal===n?'selected':''}>${t('goalOption',{n})}</option>`).join('')}</select></section>`;
}
function renderSources() {
  $('#view-content').innerHTML = `<section class="view-heading"><div><h1>${t('sourcesTitle')}</h1><p>${t('sourcesSub')}</p></div></section><div class="source-list"><section class="record-panel"><h2>${t('provided')}</h2><p>${t('providedText')}</p><div class="character-chips">${characters.map(c=>`<button class="character-chip" data-detail="${c.id}">${c.hanzi}<small>P.${c.pptSlide}</small></button>`).join('')}</div></section><section class="record-panel"><h2>${t('authority')}</h2><p>${t('authorityText')}</p><div class="source-links">${characters.map(c=>`<a href="${escape(c.sourceUrl)}" target="_blank" rel="noopener noreferrer">${c.hanzi} ↗</a>`).join('')}</div></section><section class="record-panel"><h2>${t('boundaries')}</h2><ul>${[1,2,3,4].map(n=>`<li>${t('boundary'+n)}</li>`).join('')}</ul></section><section class="record-panel"><h2>${t('ai')}</h2><p>${t('aiText')}</p></section></div>`;
}
function openModal(titleKey, content) {
  if (modal.open) modal.close();
  modal.innerHTML = `<div class="modal-header"><h2 id="modal-title">${t(titleKey)}</h2><button class="close-modal" data-action="close" aria-label="${t('close')}">${icon('close')}</button></div>${content}`;
  modal.showModal();
}
function showDetail(id) {
  const c = byId(id); if (!c) return;
  const caseText = language==='zh'?c.caseExplanation:language==='es'?c.caseExplanationEs:c.caseExplanationEn;
  openModal('detail', `<div class="detail-pinyin"><span>${c.pinyin} · ${escape(meaning(c))}</span><button data-speak="${c.id}" aria-label="${t('speak')}">${icon('sound')}</button></div><div class="detail-timeline"><div class="detail-step"><img src="${escape(appUrl(c.picture))}" alt="${escape(meaning(c))}"><small>${t('picture')}</small></div><span class="timeline-arrow">→</span><div class="detail-step"><img src="${escape(appUrl(c.ancient))}" alt="${t('ancient')} · ${c.hanzi}"><small>${t('ancient')}</small></div><span class="timeline-arrow">→</span><div class="detail-step"><div class="hanzi" lang="zh">${c.hanzi}</div><small>${t('modern')}</small></div></div><p class="source-small">${t('notTimeline')}</p><p class="detail-description">${escape(description(c))}</p>${caseText?`<div class="detail-source"><strong>${t('case')}</strong><span class="case-badge">${t(c.caseType||'mnemonic')}</span><br>${escape(caseText)}</div>`:''}<div class="detail-source" style="margin-top:12px"><strong>${t('warning')}</strong><br>${c.id==='water'?t('waterWarning'):t('warningText')}${c.contentWarning&&c.id!=='water'?`<br>${escape(language==='zh'?c.contentWarning:(language==='es'?c.contentWarningEs:c.contentWarningEn)||t('warningText'))}`:''}<br><span>${t('pptPage',{n:c.pptSlide})}</span><a href="${escape(c.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escape(c.sourceTitle)} ↗</a><small>${t('reviewRequired')}</small></div><div class="modal-actions"><button class="secondary-button" data-favorite="${c.id}" aria-pressed="${progress.favorites.includes(id)}">${icon('star')}${progress.favorites.includes(id)?t('unfavorite'):t('favorite')}</button><button class="primary-button" data-action="close">${t('continue')}${icon('arrow')}</button></div>`);
}
function showGuide() {
  openModal('guideTitle', `<p class="modal-lead">${t('guideLead')}</p><div class="guide-steps">${[1,2,3].map(n=>`<div class="guide-step"><b>0${n}</b><strong>${t('step'+n)}</strong>${t('step'+n+'Text')}</div>`).join('')}</div><p class="modal-lead">${t('guideNote')}</p><div class="modal-actions"><button class="primary-button" data-action="close">${t('start')}${icon('arrow')}</button></div>`);
}
function showHint() {
  const hint = hintFor(game); if (!hint) return;
  const c = byId(hint.id);
  const clue = language==='zh'?c.hint:language==='es'?c.hintEs:c.hintEn;
  openModal('hint', `<p class="detail-description">${escape(clue)}</p><p class="source-small">${t('guideNote')}</p><div class="modal-actions"><button class="primary-button" data-action="close">${t('continue')}</button><button class="secondary-button" data-reveal="${hint.id}">${t('answer')}</button></div>`);
}
function reveal(id) {
  modal.close(); game.hints++;
  feedbackKey='answerShown'; feedbackKind=''; updateBoard();
  game.cards.filter(c=>c.id===id).forEach(card => {
    const button = document.querySelector(`[data-card="${card.key}"]`); if (button) {button.classList.remove('hinted'); void button.offsetWidth; button.classList.add('hinted');}
  });
}
function toggleFavorite(id) {
  const had = progress.favorites.includes(id); progress.favorites = had ? progress.favorites.filter(x=>x!==id) : [...progress.favorites,id];
  saveProgress(); toast(t(had?'removed':'added'));
  document.querySelectorAll(`[data-favorite="${id}"]`).forEach(button=>{
    button.classList.toggle('on',!had); button.setAttribute('aria-pressed',String(!had)); button.setAttribute('aria-label',`${t(had?'favorite':'unfavorite')} · ${byId(id).hanzi}`);
    if (button.closest('dialog')) button.innerHTML=`${icon('star')}${t(had?'favorite':'unfavorite')}`;
  });
  if (view==='atlas' && filter==='favorites') renderAtlasCards();
}
function speak(id) {
  if (!('speechSynthesis' in window)) return toast(t('speechUnavailable'));
  const voices = speechSynthesis.getVoices();
  const voice = voices.find(v=>/^zh(-CN|_CN|$)/i.test(v.lang)) || voices.find(v=>/^zh/i.test(v.lang));
  if (!voice) return toast(t('voiceMissing'));
  const utterance = new SpeechSynthesisUtterance(byId(id).hanzi); utterance.lang='zh-CN'; utterance.voice=voice; utterance.rate=.75;
  utterance.onerror=()=>toast(t('speechUnavailable')); speechSynthesis.cancel(); speechSynthesis.speak(utterance);
}
function showAccount(mode = 'login') {
  if (user) {
    return openModal('accountAbout', `<p class="detail-description">${escape(user.username)}</p><p class="modal-lead">${t('accountDescription')}</p><div class="modal-actions"><button class="primary-button" data-action="close">${t('continue')}</button><button class="secondary-button" data-action="logout">${t('logout')}</button></div>`);
  }
  if (!accountAvailable) return openModal('account',`<p class="modal-lead">${t('accountUnavailable')}</p><div class="modal-actions"><button class="primary-button" data-action="close">${t('continue')}</button></div>`);
  openModal(mode==='login'?'signIn':'signUp', `<p class="modal-lead">${t('authLead')}</p><div class="form-tabs"><button data-auth-mode="login" class="${mode==='login'?'active':''}">${t('signIn')}</button><button data-auth-mode="register" class="${mode==='register'?'active':''}">${t('signUp')}</button></div><form class="auth-form" id="auth-form" data-mode="${mode}"><label>${t('username')}<input name="username" autocomplete="username" required minlength="2" maxlength="32" placeholder="${t('userPlaceholder')}"></label><label>${t('password')}<input name="password" type="password" autocomplete="${mode==='login'?'current-password':'new-password'}" required minlength="8" maxlength="128" placeholder="${t('passwordPlaceholder')}"></label><label style="flex-direction:row;align-items:center;line-height:1.7"><input type="checkbox" name="merge" checked> ${t('merge')}</label><div class="form-error" role="alert" id="auth-error"></div><button class="primary-button" type="submit">${t(mode==='login'?'signIn':'signUp')}${icon('arrow')}</button></form>`);
}
function mergeProgress(a,b) {
  return normalizeProgress({...a,mastered:[...a.mastered,...b.mastered],favorites:[...a.favorites,...b.favorites],
    mistakes:Object.fromEntries([...new Set([...Object.keys(a.mistakes),...Object.keys(b.mistakes)])].map(id=>[id,Math.max(a.mistakes[id]||0,b.mistakes[id]||0)])),
    sessions:[...new Map([...a.sessions,...b.sessions].map(s=>[s.id,s])).values()].sort((x,y)=>Date.parse(x.completedAt)-Date.parse(y.completedAt)).slice(-200)},validIds());
}
async function submitAuth(form) {
  const submit = form.querySelector('[type="submit"]'); submit.disabled=true; submit.textContent=t('submitting');
  try {
    const guest = readGuest();
    const result = await api(form.dataset.mode,{method:'POST',body:JSON.stringify({username:form.elements.username.value.trim(),password:form.elements.password.value})});
    // Do not replace guest records until the authenticated record is available.
    let loaded;
    try {loaded = normalizeProgress(await api('progress'),validIds());}
    catch (error) {await api('logout',{method:'POST',body:'{}'}).catch(()=>{}); throw error;}
    if (form.elements.merge.checked) loaded=mergeProgress(loaded,guest);
    user=result.user; progress=loaded; syncError=false; await saveProgress(); modal.close(); startRound(); shell(); toast(t('loggedIn'));
  } catch (error) {if ($('#auth-error')) $('#auth-error').textContent=error.message;}
  finally {if (submit.isConnected) {submit.disabled=false; submit.textContent=t(form.dataset.mode==='login'?'signIn':'signUp');}}
}
async function logout() {
  await saveQueue;
  if (syncError) {toast(t('saveError')); return;}
  try {await api('logout',{method:'POST',body:'{}'}); user=null; progress=readGuest(); syncError=false; modal.close(); startRound(); shell(); toast(t('loggedOut'));}
  catch(error) {toast(error.message);}
}
function exportProgress() {
  const blob = new Blob([JSON.stringify({app:'字遇',version:1,exportedAt:new Date().toISOString(),progress},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob), link=document.createElement('a'); link.href=url; link.download=`ziyu-progress-${new Date().toISOString().slice(0,10)}.json`; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); toast(t('exported'));
}
function navigate(name) {if (!['match','atlas','progress','sources'].includes(name)) return; if (modal.open) modal.close(); view=name; shell(); window.scrollTo({top:0,behavior:'instant'});}

document.addEventListener('click', event => {
  const button=event.target.closest('button'); if(!button || button.disabled) return;
  const d=button.dataset;
  if(d.card) return handleCard(d.card);
  if(d.view) return navigate(d.view);
  if(d.detail) return showDetail(d.detail);
  if(d.speak) return speak(d.speak);
  if(d.favorite) return toggleFavorite(d.favorite);
  if(d.reveal) return reveal(d.reveal);
  if(d.authMode) return showAccount(d.authMode);
  if(d.lesson) {lesson=d.lesson; startRound(); renderMatch(); return;}
  if(d.filter) {filter=d.filter; renderAtlas(); return;}
  const actions={guide:showGuide,hint:showHint,account:()=>showAccount(),close:()=>modal.close(),retry:saveProgress,export:exportProgress,logout,
    'new-round':()=>{startRound();renderMatch();},again:()=>{modal.close();startRound();view='match';shell();},
    'review-mistakes':()=>{const ids=Object.entries(progress.mistakes).sort((a,b)=>b[1]-a[1]).map(([id])=>id).filter(id=>byId(id)?.practiceEligible!==false);lesson='review';startRound(ids);navigate('match');}};
  actions[d.action]?.();
});
document.addEventListener('input',event=>{if(event.target.id==='search'){search=event.target.value;renderAtlasCards();}});
document.addEventListener('change',event=>{
  if(event.target.id==='language'){language=event.target.value;saveProgress();shell();}
  if(event.target.id==='goal-select'){progress.dailyGoal=Number(event.target.value);saveProgress();}
});
document.addEventListener('submit',event=>{if(event.target.id==='auth-form'){event.preventDefault();submitAuth(event.target);}});
modal.addEventListener('click',event=>{if(event.target===modal){const r=modal.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)modal.close();}});

async function init() {
  const response=await fetch(appUrl('data/characters.json')); if(!response.ok)throw new Error('Unable to load character library');
  characters=await response.json(); progress=readGuest(); language=progress.language;
  try {if(!window.HANZI_STATIC_PREVIEW){const result=await api('me');accountAvailable=true;user=result.user;if(user){progress=normalizeProgress(await api('progress'),validIds());language=progress.language;}}}
  catch {if(user){user=null;toast(t('accountOffline'));}accountAvailable=false;}
  startRound();shell(); if(!storageOK)toast(t('storageError'));
}
init().catch(error=>{app.innerHTML=`<div class="error-screen"><h1>字遇</h1><p>字库暂时未能加载。请用 <code>python server.py</code> 启动项目后访问网页。</p><p>${escape(error.message)}</p><button class="primary-button" onclick="location.reload()">重新加载 / Reload</button></div>`;});
