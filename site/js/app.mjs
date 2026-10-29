import {QUAD_TYPES, createRound, selectCard, settleSelection, hintFor, shuffle, emptyProgress, normalizeProgress} from './engine.mjs';
import {dictionaries} from './i18n.mjs';
import {appUrl} from './paths.mjs';
import {LANGUAGE_KEY, LANGUAGE_NAMES, isLanguage, resolveLanguage} from './language.mjs';
import {mobileState, initMobile, requestInstall, installPlatform} from './mobile.mjs';
import {fetchAndroidRelease, websiteLink, accountWebsiteLink} from './downloads.mjs';
import {MATCH_PREFERENCES_KEY, normalizeMatchPreferences, characterForm, sameForms} from './matching.mjs';

const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const iconPaths = {
  settings:'<path d="m9 3-1 3-3 1v4l-2 1 2 1v4l3 1 1 3h6l1-3 3-1v-4l2-1-2-1V7l-3-1-1-3Z"/><circle cx="12" cy="12" r="3"/>',
  phone:'<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 18h4M10 5h4"/>',
  globe:'<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 6.5h14M5 17.5h14"/>',
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
let characters = [], progress = emptyProgress(), user = null, language = 'en', view = 'match';
let game, lesson = 'lesson1', featuredId = 'mountain', roundStarted = Date.now(), roundSaved = false;
let filter = 'all', search = '', accountAvailable = false, storageOK = true, feedbackKey = 'ready', feedbackKind = '';
let busyAnimation = false, roundVersion = 0, saveQueue = Promise.resolve(), syncError = false, pendingSaves = 0, toastTimer;
let serviceInfo = {storage:'sqlite', deploymentMode:'local', databaseExpiresAt:null};
let transientHistoryEntry = false;
let androidRelease = null, releaseLoading = false, releaseFailed = false;
let matchPreferences = normalizeMatchPreferences();
const VIEWS = ['match','atlas','progress','sources','settings'];
const cloudService = () => serviceInfo.storage === 'postgres' || serviceInfo.deploymentMode === 'trial';
const LESSONS = {lesson1:['sun','moon','mountain','wood'], lesson2:['fire','person','eye','mouth'], lesson3:['forest','big','martial','field'], lesson4:['gate','horse','bird','fish'], lesson5:['ox','sheep','tiger','bamboo'], lesson6:['cart','boat','knife','cowrie'], lesson7:['hand','foot','ear','rice'], lesson8:['dog','woman','rooster','cloud'], lesson9:['rest','gate','tiger','cowrie']};
const t = (key, values = {}) => Object.entries(values).reduce((text, [k, v]) => text.replaceAll(`{${k}}`, v), dictionaries[language][key] || dictionaries.en[key] || key);
const nativeApp = () => window.HANZI_ANDROID_APP === true;
const localized = (c, key) => language === 'zh' ? c[key] : c[key + (language === 'es' ? 'Es' : 'En')];
const byId = id => characters.find(c => c.id === id);
const validIds = () => characters.map(c => c.id);
const meaning = c => language === 'es' ? c.es : c.en;
const description = c => language === 'zh' ? c.description : language === 'es' ? c.descriptionEs || c.descriptionEn : c.descriptionEn;
const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const eligible = () => characters.filter(c => c.practiceEligible !== false);
const glyph = (c,script=matchPreferences.script) => characterForm(c,script);
const formLang = (script=matchPreferences.script) => script==='traditional'?'zh-Hant':'zh-Hans';
const isQuad = () => matchPreferences.mode === 'quad';
const libraryCounts = () => ({count:characters.length,practice:eligible().length});
const sourceLine = c => c.pptSlide ? `${c.pptSourceDeck || '汉字.pptx'} · ${t('pptPage',{n:c.pptSlide})}` : t('projectMaterial');

function matchSettingsMarkup() {
  return `<div class="match-controls"><label for="match-mode">${t('matchMode')}<select id="match-mode"><option value="triple" ${isQuad()?'':'selected'}>${t('modeTriple')}</option><option value="quad" ${isQuad()?'selected':''}>${t('modeQuad')}</option></select></label><label for="match-script">${t('scriptChoice')}<select id="match-script"><option value="simplified" ${matchPreferences.script==='simplified'?'selected':''}>${t('simplified')}</option><option value="traditional" ${matchPreferences.script==='traditional'?'selected':''}>${t('traditional')}</option></select></label></div>`;
}
function setMatchPreference(name,value) {
  if (!(['mode','script'].includes(name)) || !(name==='mode'?['triple','quad']:['simplified','traditional']).includes(value)) return;
  const changed = name==='mode' && value!==matchPreferences.mode;
  matchPreferences=normalizeMatchPreferences({...matchPreferences,[name]:value});
  try {localStorage.setItem(MATCH_PREFERENCES_KEY,JSON.stringify(matchPreferences));}catch{storageOK=false;}
  const url=new URL(location.href);
  if(url.searchParams.has(name)) {url.searchParams.set(name,value);history.replaceState(history.state,'',url);}
  if(changed)startRound();
  shell();toast(t(changed?'modeNewRound':'preferenceSaved'));
}

function initialLanguage(legacyLanguage) {
  let savedLanguage;
  try {savedLanguage = localStorage.getItem(LANGUAGE_KEY);} catch {}
  return resolveLanguage({urlLanguage:new URLSearchParams(location.search).get('lang'),
    savedLanguage, legacyLanguage, languages:navigator.languages || [navigator.language]});
}
function updateLanguageMetadata() {
  document.documentElement.lang = language === 'zh' ? 'zh-CN' : language;
  document.title = `${t('brandName')} · ${t(view)}`;
  document.querySelector('meta[name="description"]').content = t('appDescription');
}
function setLanguage(next) {
  if (!isLanguage(next)) return;
  language = next;
  let preferenceSaved = false;
  try {localStorage.setItem(LANGUAGE_KEY, language); preferenceSaved = true;} catch {storageOK = false;}
  const url = new URL(location.href);
  if (url.searchParams.has('lang')) {url.searchParams.set('lang',language); history.replaceState(history.state,'',url);}
  if (modal.open) closeModal();
  saveProgress(); shell(); toast(t(preferenceSaved?'languageSaved':'storageError'));
}
function showLanguageSettings() {
  openModal('languageSettings', `<p class="modal-lead">${t('interfaceLanguage')}</p><div class="language-options">${Object.entries(LANGUAGE_NAMES).map(([code,name])=>`<button class="${code===language?'primary-button':'secondary-button'}" data-set-language="${code}" lang="${code==='zh'?'zh-CN':code}" aria-pressed="${code===language}">${name}</button>`).join('')}</div><p class="modal-lead">${t('languagePreferenceNote')}</p><p class="source-small">${t('automaticLanguageNote')}</p>`);
}

function offlineStatus() {
  return t(mobileState.ready?'pwaOfflineReady':mobileState.failed?'pwaOfflineFailed':mobileState.supported?'pwaPreparing':'pwaUnsupported',libraryCounts());
}
function mobileMarkup() {
  if (nativeApp()) return '';
  return `<section class="record-panel mobile-app-panel"><h2>${t('pwaTitle')}</h2><p data-pwa-status role="status">${offlineStatus()}</p><button class="secondary-button" data-action="app-install">${icon('phone')}${t(mobileState.installed?'pwaAppInfo':'pwaInstall')}</button></section>`;
}
function networkMarkup() {
  if (navigator.onLine || nativeApp()) return '';
  return `<div class="info-banner offline-banner" role="status"><span>${t(user?'pwaOfflineAccount':'pwaOfflineGuest')}</span>${user?`<button class="text-button" data-action="export">${t('export')}</button>`:''}</div>`;
}
function refreshMobileStatus() {
  document.querySelectorAll('[data-pwa-status]').forEach(node=>{node.textContent=offlineStatus();});
  const network = $('#network-notice'); if (network) network.innerHTML = networkMarkup();
  updateSaveState();
  renderDownloadInfo();
}
function showInstallInfo() {
  openModal('pwaTitle', `<p class="modal-lead">${t(mobileState.installed?'pwaInstalled':'pwaInstallLead')}</p><p class="detail-source" data-pwa-status role="status">${offlineStatus()}</p><ol class="install-steps"><li>${t(installPlatform()==='ios'?'pwaIosStep':'pwaBrowserStep')}</li><li>${t('pwaLaunchStep')}</li></ol><p class="modal-lead">${t('pwaStorageNote')}</p>${mobileState.updateReady?`<p class="detail-source">${t('pwaUpdateReady')}</p>`:''}<div class="modal-actions">${mobileState.canPrompt&&!mobileState.installed?`<button class="primary-button" data-action="install-now">${t('pwaInstall')}</button>`:''}<button class="secondary-button" data-action="close">${t('continue')}</button></div>`);
}
async function installNow() {
  const result = await requestInstall();
  if (result === 'manual') showInstallInfo();
  else if (result === 'accepted') {closeModal();toast(t('pwaInstallAccepted'));}
}

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
  if (!response.ok) {
    const keys = {invalid_credentials:'authInvalidCredentials',username_taken:'authUsernameTaken',
      authentication_required:'authRequired',rate_limited:'authRateLimited',invalid_username:'authInvalidUsername',
      invalid_password:'authInvalidPassword',origin_forbidden:'requestForbidden',invalid_request:'requestInvalid',
      content_unavailable:'contentUnavailable',server_error:'serverError'};
    throw new Error(language === 'zh' ? data.error || t(keys[data.code] || 'networkError') : t(keys[data.code] || 'networkError'));
  }
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
function saveLabel() {return user ? !navigator.onLine?t('pwaAccountPending'):pendingSaves ? t('saving') : syncError ? t('saveError') : t(cloudService()?'syncedCloud':'synced') : storageOK ? t(nativeApp()?'mobileStorage':'storage') : t('storageError');}
function trialNotice() {
  if (serviceInfo.deploymentMode !== 'trial') return '';
  const date = serviceInfo.databaseExpiresAt ? new Date(serviceInfo.databaseExpiresAt) : null;
  const expiry = date && !Number.isNaN(date.getTime()) ? t('trialExpiry',{date:escape(date.toLocaleDateString(language==='zh'?'zh-CN':language))}) : t('trialDuration');
  return `<div class="info-banner trial-banner"><span><strong>${t('cloudTrial')}</strong> · ${expiry} ${t('trialExportNote')}</span><button class="text-button" data-action="export">${icon('export')}${t('export')}</button></div>`;
}
function updateSaveState() {
  const node = $('#save-state'); if (node) {node.innerHTML = `${icon(syncError ? 'refresh' : 'check')} ${escape(saveLabel())}`; node.dataset.action = syncError ? 'retry' : '';}
}
function startRound(ids) {
  roundVersion++; busyAnimation = false;
  const primary = ids ? ids.map(byId).filter(Boolean) : lesson==='review' ? shuffle(eligible()) : (LESSONS[lesson]||LESSONS.lesson1).map(byId).filter(Boolean);
  const candidates=[...new Map([...primary,...shuffle(eligible())].filter(c=>c.practiceEligible!==false).map(c=>[c.id,c])).values()];
  const unique=[];
  for(const c of candidates) {
    if(unique.every(other=>!(c.confusionGroups||[]).some(group=>(other.confusionGroups||[]).includes(group))))unique.push(c);
    if(unique.length===4)break;
  }
  if(unique.length<4)throw new Error('Not enough compatible practice targets');
  game = createRound(unique,Math.random,isQuad()?{types:QUAD_TYPES}:{}); roundStarted = Date.now(); roundSaved = false; feedbackKey = 'ready'; feedbackKind = '';
  featuredId = unique.find(c => c.id === 'mountain')?.id || unique[0].id;
}
function shell() {
  updateLanguageMetadata();
  const nav = [['match','grid'],['atlas','book'],['progress','chart'],['sources','source'],['settings','settings']];
  app.innerHTML = `<div class="shell">
    <aside class="sidebar"><div class="brand"><span class="brand-stamp" lang="zh">字</span><div class="brand-name">${t('brandName')}<small>${t('brandTagline')}</small></div></div>
    <div class="nav-label">${t('learning')}</div><nav class="nav" aria-label="${t('learning')}">${nav.map(([name,i])=>`<button data-view="${name}" class="${view===name?'active':''}" ${view===name?'aria-current="page"':''}>${icon(i)}<span>${t(name)}</span></button>`).join('')}</nav>
    <div class="sidebar-note">${icon('sprout')}<p>${t('sidebarTagline')}</p><small>${t('growthNote')}</small></div>
    <div class="user-box"><div class="avatar">${user?escape(user.username.slice(0,1)):icon('user')}</div><div class="user-text"><b>${escape(user?.username || t('guest'))}</b><small>${user?t(cloudService()?'serverSaveCloud':'serverSave'):t(nativeApp()?'mobileStorage':'localSave')}</small></div><button data-action="account" aria-label="${t('account')}">${icon('user')}</button></div></aside>
    <main class="main"><header class="topbar"><div class="mobile-brand"><span class="brand-stamp" lang="zh">字</span><span class="mobile-name">${t('brandName')}</span></div><div class="breadcrumb">${icon('leaf')}<span>${t('explore')}</span><span>/</span><span>${t(view)}</span></div><div class="top-tools"><span class="version">${t('prototypeVersion')}</span><div class="language-control"><button class="language-label" data-action="language-settings" aria-label="${t('languageSettings')}">${icon('globe')} <span>${t('language')}</span></button><select class="language" id="language" aria-label="${t('chooseLanguage')}">${Object.entries(LANGUAGE_NAMES).map(([code,name])=>`<option value="${code}" ${language===code?'selected':''}>${name}</option>`).join('')}</select></div>${nativeApp()?'':`<button class="round-icon app-install-button" data-action="app-install" aria-label="${t(mobileState.installed?'pwaAppInfo':'pwaInstall')}">${icon('phone')}</button>`}<button class="round-icon" data-action="account" aria-label="${user?t('account'):t('login')}">${icon('user')}</button></div></header>
    <div id="network-notice">${networkMarkup()}</div><div id="view-content"></div>${trialNotice()}<footer class="page-footer"><span>${icon('sprout')}${t('footer')}</span><button id="save-state" class="text-button" style="font-size:inherit;padding:0">${icon('check')}${escape(saveLabel())}</button></footer></main></div>`;
  renderView();
}
function renderView() {
  if (view === 'match') renderMatch();
  else if (view === 'atlas') renderAtlas();
  else if (view === 'progress') renderProgress();
  else if (view === 'settings') renderSettings();
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
  return `<div class="panel-eyebrow">${t('story')} · ${t('closerLook')}</div><div class="story-title"><div class="story-hanzi" lang="zh">${escape(glyph(c))}</div><button class="round-icon" data-speak="${c.id}" aria-label="${t('speak')} · ${escape(glyph(c))}">${icon('sound')}</button></div><div class="story-pinyin">${c.pinyin}</div><div class="story-meaning">${escape(meaning(c))}</div><div class="divider"></div><p>${escape(description(c))}</p><div class="source-small">${escape(sourceLine(c))} · ${t('reviewRequired')}</div><button class="text-button" data-detail="${c.id}">${t('detail')} ${icon('arrow')}</button>`;
}
function renderMatch() {
  $('#view-content').innerHTML = `<section class="hero"><div><div class="eyebrow">${t('eyebrow')}</div><h1>${t('hero1')}<br><em>${t('hero2')}</em></h1><p>${t('subtitle')}</p></div><div class="hero-art" aria-hidden="true"><div class="orbit"></div><img src="${escape(appUrl('/assets/ppt/mountain-picture.png'))}" alt=""><div class="hero-character">山</div><span class="tiny-seal">${t('characterLabel')}</span></div></section>
    <div class="workspace"><div><div class="lesson-tabs" aria-label="${t('learning')}">${[...Object.keys(LESSONS),'review'].map((name,i)=>`<button class="lesson-tab ${lesson===name?'active':''}" data-lesson="${name}" aria-pressed="${lesson===name}">${t(name)}<span>${name==='review'?'↻':String(i+1).padStart(2,'0')}</span></button>`).join('')}</div>
    ${matchSettingsMarkup()}<section class="play-area ${isQuad()?'quad-play':''}" aria-label="${t('match')}"><div class="play-heading"><div><h2><span class="desktop-game-title">${t(isQuad()?'quadTitle':'gameTitle')}</span><span class="mobile-game-title">${t(isQuad()?'quadShort':'mobileMatchTitle')}</span></h2><p class="desktop-game-sub">${t(isQuad()?'quadSub':'gameSub')}</p><p class="mobile-game-sub">${t(isQuad()?'quadSub':'mobileMatchSub')}</p></div><button class="quiet-button" data-action="guide">${icon('help')}${t('guide')}</button></div>
    <div class="round-meta"><strong id="round-count"></strong><div class="progress-track"><div id="round-fill" class="progress-fill"></div></div><span id="selection-count"></span></div>
    <div class="column-heads">${game.types.map((key,i)=>`<div><span>${i+1}</span>${t(key==='modern'?matchPreferences.script:key)}</div>`).join('')}</div>
    <div class="board" id="board">${game.cards.map(card=>{
      const c=byId(card.id), written=['modern','simplified','traditional'].includes(card.type);
      const script=card.type==='modern'?matchPreferences.script:card.type;
      const accessible=written?glyph(c,script):card.type==='picture'?meaning(c):localized(c,'hint');
      return `<button class="card ${card.type} ${written?'written-card':''}" data-card="${card.key}" aria-label="${t(card.type==='modern'?matchPreferences.script:card.type)} · ${escape(accessible)}">${written?`<span class="hanzi" lang="${formLang(script)}">${escape(glyph(c,script))}</span><span class="card-seal">${t(script)}</span>`:`<img src="${escape(appUrl(c[card.type]))}" alt="" draggable="false">`}</button>`;
    }).join('')}</div>
    <div class="board-footer"><div id="feedback" class="feedback" role="status" aria-live="polite"></div><button class="text-button" data-action="hint">${icon('bulb')}${t('hint')}</button></div></section><p class="board-caption">${t('caption')}${isQuad()?`<br>${t('sameFormsNote')}`:''}</p><button class="text-button" data-action="new-round" style="margin-top:5px">${icon('refresh')}${t('newRound')}</button></div>
    <aside class="right-column"><section class="story-panel" id="story-panel">${storyMarkup()}</section><section class="goal-panel" id="goal-panel">${goalMarkup()}</section><div class="tip-card">${icon('leaf')}<span>${t('tip')}</span></div><section class="feature-teaser"><small>${t('featureLabel')}</small><h3>${t('featureTitle')}</h3><p>${t('featureLead')}</p><button class="text-button" data-view="settings">${t('promoCta')}${icon('arrow')}</button></section></aside></div>`;
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
  $('#selection-count').textContent = t('selectedCount',{n:game.selected.length,total:game.types.length});
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
  progress.sessions.push({id:uid(),completedAt:new Date().toISOString(),correct:game.correct,attempts:game.attempts,seconds,characterIds:[...game.ids],matchMode:isQuad()?'quad':'triple',script:matchPreferences.script});
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
  const found = characters.filter(c => (filter === 'all' || (filter === 'favorites' ? progress.favorites.includes(c.id) : c.category === filter)) && [c.hanzi,c.simplified,c.traditional,c.pinyin,c.en,c.es,c.description,c.descriptionEn,c.descriptionEs].join(' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(query));
  $('#atlas-grid').innerHTML = found.length ? found.map(c=>`<article class="atlas-card"><button data-detail="${c.id}" aria-label="${t('detail')} · ${escape(glyph(c))}"><div class="atlas-images"><img src="${escape(appUrl(c.picture))}" alt=""><span>→</span><img src="${escape(appUrl(c.ancient))}" alt=""></div><div class="atlas-bottom"><strong lang="zh">${escape(glyph(c))}</strong><div>${c.pinyin}<small>${escape(meaning(c))}</small></div></div>${c.contentWarning?`<div class="source-small" style="margin-top:8px;color:#ab805c">${c.id==='water'?t('libraryWarning'):t('originalWarning')}</div>`:''}</button><button class="favorite-button ${progress.favorites.includes(c.id)?'on':''}" data-favorite="${c.id}" aria-label="${progress.favorites.includes(c.id)?t('unfavorite'):t('favorite')} · ${escape(glyph(c))}" aria-pressed="${progress.favorites.includes(c.id)}">${icon('star')}</button></article>`).join('') : `<div class="empty-state">${icon('search')}${t('noResults')}</div>`;
}
function renderProgress() {
  const attempts = progress.sessions.reduce((n,s)=>n+s.attempts,0), correct = progress.sessions.reduce((n,s)=>n+s.correct,0);
  const mistakes = Object.entries(progress.mistakes).sort((a,b)=>b[1]-a[1]).map(([id,n])=>({c:byId(id),n})).filter(x=>x.c);
  $('#view-content').innerHTML = `<section class="view-heading"><div><h1>${t('progressTitle')}</h1><p>${t('progressSub')}</p></div><button class="quiet-button" data-action="export">${icon('export')}${t('export')}</button></section>
    <div class="info-banner"><span>${t(user?'userNote':nativeApp()?'mobileGuestNote':cloudService()?'guestNoteCloud':'guestNote',{name:escape(user?.username)})}</span>${!user?`<button class="text-button" data-action="account">${t('login')} ${icon('arrow')}</button>`:''}</div>
    <div class="stats-grid">${[['practiced',progress.mastered.length,'characters'],['completed',progress.sessions.length,'completed'],['accuracy',attempts?`${Math.round(correct/attempts*100)}%`:'—','session'],['favoriteCount',progress.favorites.length,'characters']].map(([key,n])=>`<div class="stat-box"><small>${t(key)}</small><b>${n}</b><span>${key==='practiced'?t('practiceOnly'):key==='accuracy'?t('completed'):t('characters')}</span></div>`).join('')}</div>
    <section class="record-panel"><h2>${t('practiced')}</h2>${progress.mastered.length?`<div class="character-chips">${progress.mastered.map(id=>`<button class="character-chip" data-detail="${id}">${escape(glyph(byId(id)))}<small>${byId(id).pinyin}</small></button>`).join('')}</div><p>${t('notMastery')}</p>`:`<p>${t('noPractice')}</p><button class="primary-button" data-view="match">${t('practiceNow')}${icon('arrow')}</button>`}</section>
    <section class="record-panel"><h2>${t('mistakes')}</h2>${mistakes.length?`<div class="character-chips">${mistakes.map(({c,n})=>`<button class="character-chip" data-detail="${c.id}">${escape(glyph(c))}<small>× ${n}</small></button>`).join('')}</div><p>${t('mistakeNote')}</p><button class="quiet-button" data-action="review-mistakes">${icon('refresh')}${t('practiceMistakes')}</button>`:`<p>${t('noMistakes')}</p>`}</section>
    <section class="record-panel"><h2>${t('recent')}</h2>${progress.sessions.length ? [...progress.sessions].reverse().slice(0,15).map(s=>`<div class="history-row"><div>${t('session',{n:s.characterIds.length,a:s.attempts})}<small>${new Date(s.completedAt).toLocaleString(language==='zh'?'zh-CN':language)} · ${s.seconds} ${t('seconds')}</small></div><b>${s.characterIds.map(id=>glyph(byId(id))).join(' ')}</b></div>`).join('') : `<p>${t('historyEmpty')}</p>`}</section><section class="record-panel"><label for="goal-select" style="font-size:12px;margin-right:10px">${t('goal')}</label><select class="goal-select" id="goal-select">${[4,8,12].map(n=>`<option value="${n}" ${progress.dailyGoal===n?'selected':''}>${t('goalOption',{n})}</option>`).join('')}</select></section><section class="record-panel language-settings-panel"><h2>${t('languageSettings')}</h2><p>${t('languagePreferenceNote')}</p><button class="secondary-button" data-action="language-settings">${icon('globe')} ${t('chooseLanguage')} · ${LANGUAGE_NAMES[language]}</button></section>${mobileMarkup()}`;
}
function renderSources() {
  $('#view-content').innerHTML = `<section class="view-heading"><div><h1>${t('sourcesTitle')}</h1><p>${t('sourcesSub')}</p></div></section><div class="source-list"><section class="record-panel"><h2>${t('provided')}</h2><p>${t('providedText')}</p><div class="character-chips">${characters.map(c=>`<button class="character-chip" data-detail="${c.id}">${escape(glyph(c))}<small>${c.pptSlide?'P.'+c.pptSlide:t('detail')}</small></button>`).join('')}</div></section><section class="record-panel"><h2>${t('authority')}</h2><p>${t('authorityText')}</p><div class="source-links">${characters.map(c=>`<a href="${escape(c.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escape(glyph(c))} ↗</a>`).join('')}</div></section><section class="record-panel"><h2>${t('boundaries')}</h2><ul>${[1,2,3,4].map(n=>`<li>${t('boundary'+n)}</li>`).join('')}</ul></section><section class="record-panel"><h2>${t('ai')}</h2><p>${t('aiText')}</p></section></div>`;
}
function renderDownloadInfo() {
  const region = $('#android-release');
  if (!region || nativeApp()) return;
  if (!navigator.onLine) {region.innerHTML=`<p role="status">${t('androidOffline')}</p>`;return;}
  if (androidRelease) {
    region.innerHTML=`<p class="release-version">${t('androidVersion',{v:escape(androidRelease.version),size:(androidRelease.sizeBytes/1024/1024).toFixed(2)})}</p><a class="primary-button apk-download" href="${escape(appUrl(androidRelease.downloadUrl))}" download="ziyu-android.apk">${icon('export')}${t('androidDownload')}</a><p class="source-small">${t('androidTrial')}</p><details class="checksum"><summary>${t('androidChecksum')}</summary><code>${escape(androidRelease.sha256)}</code></details>`;
  } else {
    region.innerHTML=`<p role="status">${t(releaseLoading?'androidLoading':'androidUnavailable')}</p>${releaseLoading?'':`<button class="secondary-button" data-action="check-download">${t('androidRetry')}</button>`}`;
  }
}
async function checkDownload() {
  if (nativeApp() || !navigator.onLine || releaseLoading) return;
  releaseLoading=true;releaseFailed=false;renderDownloadInfo();
  try {androidRelease=await fetchAndroidRelease();}
  catch {releaseFailed=true;}
  finally {releaseLoading=false;renderDownloadInfo();}
}
function renderSettings() {
  const features=[['Match','grid'],['Language','globe'],['Progress','chart'],['Offline','phone']];
  $('#view-content').innerHTML=`<section class="view-heading"><div><h1>${t('settingsTitle')}</h1><p>${t('settingsSub')}</p></div></section>
    <div class="settings-grid"><section class="record-panel android-panel"><h2>${icon('phone')}${t('androidTitle')}</h2><p>${t(nativeApp()?'androidNative':'androidLead')}</p>${nativeApp()?`<a class="primary-button" href="${escape(accountWebsiteLink(language))}" rel="noopener noreferrer">${t('openWebsite')}${icon('arrow')}</a>`:'<div id="android-release" aria-live="polite"></div>'}<p>${t('androidScope',libraryCounts())}</p></section>
    <section class="record-panel"><h2>${t('androidInstallTitle')}</h2><ol class="install-steps"><li>${t('androidStep1')}</li><li>${t('androidStep2')}</li><li>${t('androidStep3')}</li></ol></section></div>
    <section class="feature-intro"><div><small>${t('featureLabel')}</small><h2>${t('featureTitle')}</h2><p>${t('featureLead')}</p><button class="primary-button" data-view="match">${t('practiceNow')}${icon('arrow')}</button></div><div class="feature-symbols" aria-hidden="true"><span>山</span><span>月</span><span>木</span></div></section>
    <div class="feature-grid">${features.map(([name,i])=>`<article>${icon(i)}<h3>${t('feature'+name+'Title')}</h3><p>${t('feature'+name+'Text')}</p></article>`).join('')}</div><p class="feature-note">${t('featureNote')}</p>
    <section class="record-panel"><h2>${t('matchPreferences')}</h2><p>${t('matchPreferenceNote')}</p>${matchSettingsMarkup()}<p>${t('sameFormsNote')}</p></section>${mobileMarkup()}<section class="record-panel"><h2>${t('languageSettings')}</h2><p>${t('languagePreferenceNote')}</p><button class="secondary-button" data-action="language-settings">${icon('globe')}${LANGUAGE_NAMES[language]}</button></section>
    <section class="record-panel"><h2>${t('supportTitle')}</h2><p>${t('supportRecords')}</p><p>${t('supportSpeech')}</p><button class="secondary-button" data-action="export">${icon('export')}${t('export')}</button></section>
    <section class="record-panel share-panel"><h2>${t('shareWebsite')}</h2><p>${t('copyLinkHelp')}</p><div class="share-actions"><button class="primary-button" data-action="share-website">${icon('arrow')}${t('shareWebsite')}</button><button class="secondary-button" data-action="copy-website">${t('copyWebsite')}</button></div><a class="share-link" href="${escape(websiteLink(language))}">${escape(websiteLink(language))}</a></section>`;
  renderDownloadInfo();
  if (!androidRelease && !releaseFailed) checkDownload();
}
async function copyWebsite() {
  const url=websiteLink(language);
  try {await navigator.clipboard.writeText(url);toast(t('linkCopied'));}
  catch {openModal('copyWebsite',`<p class="modal-lead">${t('copyLinkHelp')}</p><input class="share-link-input" readonly aria-label="${t('copyWebsite')}" value="${escape(url)}">`);$('.share-link-input')?.select();}
}
async function shareWebsite() {
  if (navigator.share && !nativeApp()) {
    try {await navigator.share({title:'Ziyu',text:t('featureLead'),url:websiteLink(language)});return;}
    catch (error) {if(error.name==='AbortError')return;}
  }
  await copyWebsite();
}
function retireModalRoute() {
  if (!nativeApp() && history.state?.ziyuDialog) {
    history.replaceState({...history.state,ziyuView:view,ziyuDialog:false,ziyuTransient:true},'',location.href);
    transientHistoryEntry = true;
  }
}
function closeModal() {
  retireModalRoute();
  if (modal.open) modal.close();
}
function openModal(titleKey, content) {
  if (modal.open) modal.close();
  if (!nativeApp() && !history.state?.ziyuDialog) {
    const state = {...history.state,ziyuView:view,ziyuDialog:true,ziyuTransient:false};
    if (history.state?.ziyuTransient) history.replaceState(state,'',location.href);
    else history.pushState(state,'',location.href);
  }
  transientHistoryEntry = false;
  modal.innerHTML = `<div class="modal-header"><h2 id="modal-title">${t(titleKey)}</h2><button class="close-modal" data-action="close" aria-label="${t('close')}">${icon('close')}</button></div>${content}`;
  modal.showModal();
}
function showDetail(id) {
  const c = byId(id); if (!c) return;
  const caseText = localized(c,'caseExplanation');
  const historical = localized(c,'historicalExplanation');
  const mnemonic = localized(c,'mnemonicExplanation');
  const relation = localized(c,'simplificationStory');
  const written = isQuad()?['simplified','traditional']:[matchPreferences.script];
  const credits = (c.assets||[]).filter(a=>a.attributionText||a.sourcePageUrl||a.licenseStatus);
  openModal('detail', `<div class="detail-pinyin"><span>${c.pinyin} · ${escape(meaning(c))}</span><button data-speak="${c.id}" aria-label="${t('speak')}">${icon('sound')}</button></div>
    <div class="detail-timeline ${isQuad()?'quad-detail':''}"><div class="detail-step"><img src="${escape(appUrl(c.picture))}" alt="${escape(meaning(c))}"><small>${t('picture')}</small></div><span class="timeline-arrow">↔</span><div class="detail-step"><img src="${escape(appUrl(c.ancient))}" alt="${escape(localized(c,'ancientLabel')||t('ancient'))}"><small>${t('ancient')}</small></div>${written.map(script=>`<span class="timeline-arrow">↔</span><div class="detail-step"><div class="hanzi" lang="${formLang(script)}">${escape(glyph(c,script))}</div><small>${t(script)}</small></div>`).join('')}</div>
    <p class="source-small">${t('notTimeline')}</p><div class="script-pair"><span lang="zh-Hans">${escape(glyph(c,'simplified'))}</span><span>↔</span><span lang="zh-Hant">${escape(glyph(c,'traditional'))}</span><small>${t(sameForms(c)?'sameForms':'differentForms')}</small></div>
    <p class="detail-description">${escape(description(c))}</p>${historical?`<section class="detail-source story-section"><strong>${t('referenceStory')}</strong><p>${escape(historical)}</p></section>`:''}${mnemonic?`<section class="detail-source story-section"><strong>${t('mnemonicStory')}</strong><p>${escape(mnemonic)}</p></section>`:''}${relation?`<section class="detail-source story-section"><strong>${t('simplificationStory')}</strong><p>${escape(relation)}</p></section>`:''}
    ${caseText?`<div class="detail-source"><strong>${escape(localized(c,'caseTitle') || t('case'))}</strong><span class="case-badge">${t(c.caseType||'mnemonic')}</span><br>${escape(caseText)}</div>`:''}
    <div class="detail-source" style="margin-top:12px"><strong>${t('warning')}</strong><br>${c.id==='water'?t('waterWarning'):escape(localized(c,'ancientLabel')||t('warningText'))}${c.contentWarning&&c.id!=='water'?`<br>${escape(localized(c,'contentWarning')||t('warningText'))}`:''}<br><span>${escape(sourceLine(c))}</span><a href="${escape(c.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escape(localized(c,'sourceTitle') || c.sourceTitle)} ↗</a><small>${escape(localized(c,'reviewScope')||t('reviewRequired'))}</small></div>
    ${credits.length?`<details class="asset-credits"><summary>${t('originLabel')}</summary>${credits.map(a=>`<p><b>${t(a.role==='form'?'ancient':a.role)}</b> · ${escape(a.attributionText||a.sourceTitle||'')}<br>${escape(a.licenseStatus||'')}${a.sourcePageUrl?` · <a href="${escape(a.sourcePageUrl)}" target="_blank" rel="noopener noreferrer">${t('openSource')} ↗</a>`:''}</p>`).join('')}</details>`:''}
    <div class="modal-actions"><button class="secondary-button" data-favorite="${c.id}" aria-pressed="${progress.favorites.includes(id)}">${icon('star')}${progress.favorites.includes(id)?t('unfavorite'):t('favorite')}</button><button class="primary-button" data-action="close">${t('continue')}${icon('arrow')}</button></div>`);
}
function showGuide() {
  openModal('guideTitle', `<p class="modal-lead">${t(isQuad()?'guideLeadQuad':'guideLead')}</p><div class="guide-steps">${(isQuad()?[1,2,3,4]:[1,2,3]).map(n=>`<div class="guide-step"><b>0${n}</b><strong>${t(n===3&&isQuad()?'simplified':'step'+n)}</strong>${t(n===3&&isQuad()?'quadStep3Text':'step'+n+'Text')}</div>`).join('')}</div><p class="modal-lead">${t('guideNote')}</p><div class="modal-actions"><button class="primary-button" data-action="close">${t('start')}${icon('arrow')}</button></div>`);
}
function showHint() {
  const hint = hintFor(game); if (!hint) return;
  const c = byId(hint.id);
  const clue = language==='zh'?c.hint:language==='es'?c.hintEs:c.hintEn;
  openModal('hint', `<p class="detail-description">${escape(clue)}</p><p class="source-small">${t('guideNote')}</p><div class="modal-actions"><button class="primary-button" data-action="close">${t('continue')}</button><button class="secondary-button" data-reveal="${hint.id}">${t('answer')}</button></div>`);
}
function reveal(id) {
  closeModal(); game.hints++;
  feedbackKey='answerShown'; feedbackKind=''; updateBoard();
  game.cards.filter(c=>c.id===id).forEach(card => {
    const button = document.querySelector(`[data-card="${card.key}"]`); if (button) {button.classList.remove('hinted'); void button.offsetWidth; button.classList.add('hinted');}
  });
}
function toggleFavorite(id) {
  const had = progress.favorites.includes(id); progress.favorites = had ? progress.favorites.filter(x=>x!==id) : [...progress.favorites,id];
  saveProgress(); toast(t(had?'removed':'added'));
  document.querySelectorAll(`[data-favorite="${id}"]`).forEach(button=>{
    button.classList.toggle('on',!had); button.setAttribute('aria-pressed',String(!had)); button.setAttribute('aria-label',`${t(had?'favorite':'unfavorite')} · ${escape(glyph(byId(id)))}`);
    if (button.closest('dialog')) button.innerHTML=`${icon('star')}${t(had?'favorite':'unfavorite')}`;
  });
  if (view==='atlas' && filter==='favorites') renderAtlasCards();
}
function speak(id) {
  if (nativeApp()) {
    try {if (!window.HanziAndroid?.speak(glyph(byId(id)))) toast(t('voiceMissing'));}
    catch {toast(t('pronunciationUnavailable'));}
    return;
  }
  if (!('speechSynthesis' in window)) return toast(t('speechUnavailable'));
  const voices = speechSynthesis.getVoices();
  const voice = voices.find(v=>/^zh(-CN|_CN|$)/i.test(v.lang)) || voices.find(v=>/^zh/i.test(v.lang));
  if (!voice) return toast(t('voiceMissing'));
  const utterance = new SpeechSynthesisUtterance(glyph(byId(id))); utterance.lang='zh-CN'; utterance.voice=voice; utterance.rate=.75;
  utterance.onerror=()=>toast(t('speechUnavailable')); speechSynthesis.cancel(); speechSynthesis.speak(utterance);
}
function showAccount(mode = 'login') {
  if (user) {
    return openModal('accountAbout', `<p class="detail-description">${escape(user.username)}</p><p class="modal-lead">${t(cloudService()?'accountDescriptionCloud':'accountDescription')}</p><div class="modal-actions"><button class="primary-button" data-action="close">${t('continue')}</button><button class="secondary-button" data-action="logout">${t('logout')}</button></div>`);
  }
  if (!accountAvailable) return openModal('account',`<p class="modal-lead">${t(nativeApp()?'mobileAccountUnavailable':window.HANZI_STATIC_PREVIEW?'accountUnavailable':'accountOffline')}</p><div class="modal-actions"><button class="primary-button" data-action="close">${t('continue')}</button></div>`);
  openModal(mode==='login'?'signIn':'signUp', `<p class="modal-lead">${t(cloudService()?'authLeadCloud':'authLead')}</p><div class="form-tabs"><button data-auth-mode="login" class="${mode==='login'?'active':''}">${t('signIn')}</button><button data-auth-mode="register" class="${mode==='register'?'active':''}">${t('signUp')}</button></div><form class="auth-form" id="auth-form" data-mode="${mode}"><label>${t('username')}<input name="username" autocomplete="username" required minlength="2" maxlength="32" placeholder="${t('userPlaceholder')}"></label><label>${t('password')}<input name="password" type="password" autocomplete="${mode==='login'?'current-password':'new-password'}" required minlength="8" maxlength="128" placeholder="${t('passwordPlaceholder')}"></label><label style="flex-direction:row;align-items:center;line-height:1.7"><input type="checkbox" name="merge" checked> ${t('merge')}</label><div class="form-error" role="alert" id="auth-error"></div><button class="primary-button" type="submit">${t(mode==='login'?'signIn':'signUp')}${icon('arrow')}</button></form>`);
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
    user=result.user; progress=loaded; syncError=false; await saveProgress(); closeModal(); startRound(); shell(); toast(t('loggedIn'));
  } catch (error) {if ($('#auth-error')) $('#auth-error').textContent=error.message;}
  finally {if (submit.isConnected) {submit.disabled=false; submit.textContent=t(form.dataset.mode==='login'?'signIn':'signUp');}}
}
async function logout() {
  await saveQueue;
  if (syncError) {toast(t('saveError')); return;}
  try {await api('logout',{method:'POST',body:'{}'}); user=null; progress=readGuest(); syncError=false; closeModal(); startRound(); shell(); toast(t('loggedOut'));}
  catch(error) {toast(error.message);}
}
function exportProgress() {
  progress.language = language;
  const text = JSON.stringify({app:'Ziyu',version:1,exportedAt:new Date().toISOString(),progress},null,2);
  const filename = `ziyu-progress-${new Date().toISOString().slice(0,10)}.json`;
  if (nativeApp()) {
    try {
      if (window.HanziAndroid?.exportProgress(text,filename)) toast(t('exportPending'));
      else toast(t('exportFailed'));
    } catch {toast(t('exportFailed'));}
    return;
  }
  const blob = new Blob([text],{type:'application/json'});
  const url=URL.createObjectURL(blob), link=document.createElement('a'); link.href=url; link.download=filename; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); toast(t('exported'));
}
window.addEventListener('hanzi-native-export', event => {
  if (!nativeApp()) return;
  const key = {saved:'exported',cancelled:'exportCancelled',error:'exportFailed'}[event.detail?.status];
  if (key) toast(t(key));
});
window.addEventListener('hanzi-native-speech', event => {
  if (!nativeApp()) return;
  if (event.detail?.status === 'unavailable') toast(t('voiceMissing'));
  if (event.detail?.status === 'error') toast(t('pronunciationUnavailable'));
});
window.HanziAndroidBack = () => {
  if (modal.open) {closeModal(); return true;}
  if (view !== 'match') {navigate('match'); return true;}
  return false;
};
function navigate(name) {
  if (!VIEWS.includes(name)) return;
  if (!nativeApp()) {
    const url=new URL(location.href);
    if (name==='settings') url.searchParams.set('page','app');
    else if (url.searchParams.get('page')==='app') url.searchParams.delete('page');
    const state = {...history.state,ziyuView:name,ziyuDialog:false,ziyuTransient:false};
    if (history.state?.ziyuDialog) history.replaceState(state,'',url);
    else if (view !== name) history.pushState(state,'',url);
  }
  transientHistoryEntry = !nativeApp() && !!history.state?.ziyuTransient;
  if (modal.open) closeModal();
  view=name; shell(); window.scrollTo({top:0,behavior:'instant'});
}
window.addEventListener('popstate',event=>{
  const state = event.state;
  if (nativeApp() || !VIEWS.includes(state?.ziyuView)) return;
  const skipClosedEntry = state.ziyuTransient || (transientHistoryEntry && state.ziyuView === view);
  transientHistoryEntry = !!state.ziyuTransient;
  if (skipClosedEntry) {history.back(); return;}
  // A manual language choice also applies when returning to an older URL.
  const url=new URL(location.href);
  if (url.searchParams.has('lang') && url.searchParams.get('lang')!==language) {
    url.searchParams.set('lang',language);history.replaceState(state,'',url);
  }
  for(const name of ['mode','script'])if(url.searchParams.has(name))url.searchParams.set(name,matchPreferences[name]);
  history.replaceState(history.state,'',url);
  if (modal.open) modal.close();
  // Forward navigation restores the view; dismissed dialog contents are ephemeral.
  if (state.ziyuDialog) history.replaceState({...state,ziyuDialog:false,ziyuTransient:false},'',location.href);
  if (view !== state.ziyuView) {view=state.ziyuView;shell();window.scrollTo({top:0,behavior:'instant'});}
});
modal.addEventListener('close',()=>{if (!modal.open) retireModalRoute();});
window.addEventListener('offline',refreshMobileStatus);
window.addEventListener('online',()=>{refreshMobileStatus();if(view==='settings'&&!androidRelease)checkDownload(); if(!nativeApp()&&!window.HANZI_STATIC_PREVIEW&&!accountAvailable) api('health').then(health=>{serviceInfo={...serviceInfo,...health};accountAvailable=true;}).catch(()=>{});});

document.addEventListener('click', event => {
  const button=event.target.closest('button'); if(!button || button.disabled) return;
  const d=button.dataset;
  if(d.setLanguage) return setLanguage(d.setLanguage);
  if(d.card) return handleCard(d.card);
  if(d.view) return navigate(d.view);
  if(d.detail) return showDetail(d.detail);
  if(d.speak) return speak(d.speak);
  if(d.favorite) return toggleFavorite(d.favorite);
  if(d.reveal) return reveal(d.reveal);
  if(d.authMode) return showAccount(d.authMode);
  if(d.lesson) {lesson=d.lesson; startRound(); renderMatch(); return;}
  if(d.filter) {filter=d.filter; renderAtlas(); return;}
  const actions={'app-install':showInstallInfo,'install-now':installNow,'language-settings':showLanguageSettings,guide:showGuide,hint:showHint,account:()=>showAccount(),close:()=>closeModal(),retry:saveProgress,export:exportProgress,logout,
    'check-download':checkDownload,'share-website':shareWebsite,'copy-website':copyWebsite,
    'new-round':()=>{startRound();renderMatch();},again:()=>{closeModal();startRound();view='match';shell();},
    'review-mistakes':()=>{const ids=Object.entries(progress.mistakes).sort((a,b)=>b[1]-a[1]).map(([id])=>id).filter(id=>byId(id)?.practiceEligible!==false);lesson='review';startRound(ids);navigate('match');}};
  actions[d.action]?.();
});
document.addEventListener('input',event=>{if(event.target.id==='search'){search=event.target.value;renderAtlasCards();}});
document.addEventListener('change',event=>{
  if(event.target.id==='match-mode')setMatchPreference('mode',event.target.value);
  if(event.target.id==='match-script')setMatchPreference('script',event.target.value);
  if(event.target.id==='language') setLanguage(event.target.value);
  if(event.target.id==='goal-select'){progress.dailyGoal=Number(event.target.value);saveProgress();}
});
document.addEventListener('submit',event=>{if(event.target.id==='auth-form'){event.preventDefault();submitAuth(event.target);}});
modal.addEventListener('click',event=>{if(event.target===modal){const r=modal.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeModal();}});

async function init() {
  const response=await fetch(appUrl('data/characters.json')); if(!response.ok)throw new Error('Unable to load character library');
  characters=await response.json();
  try {matchPreferences=normalizeMatchPreferences(JSON.parse(localStorage.getItem(MATCH_PREFERENCES_KEY)));}catch{}
  const linkedPreferences=new URLSearchParams(location.search);
  if(['triple','quad'].includes(linkedPreferences.get('mode')))matchPreferences.mode=linkedPreferences.get('mode');
  if(['simplified','traditional'].includes(linkedPreferences.get('script')))matchPreferences.script=linkedPreferences.get('script');
  if(Object.hasOwn(LESSONS,linkedPreferences.get('lesson')))lesson=linkedPreferences.get('lesson');
  progress=readGuest(); language=initialLanguage(progress.language);
  try {
    const linked = new URLSearchParams(location.search).get('lang');
    if (isLanguage(linked)) localStorage.setItem(LANGUAGE_KEY,linked);
  } catch {}
  try {if(!window.HANZI_STATIC_PREVIEW && navigator.onLine){const [result,health]=await Promise.all([api('me'),api('health')]);serviceInfo={...serviceInfo,...health};accountAvailable=true;user=result.user;if(user){progress=normalizeProgress(await api('progress'),validIds());language=initialLanguage(progress.language);}}}
  catch {if(user){user=null;toast(t('accountOffline'));}accountAvailable=false;}
  progress.language = language;
  if (!nativeApp()) {
    if(new URLSearchParams(location.search).get('page')==='app')view='settings';
    history.replaceState({...history.state,ziyuView:view,ziyuDialog:false,ziyuTransient:false},'',location.href);
  }
  startRound();shell(); if(!storageOK)toast(t('storageError'));
  initMobile(refreshMobileStatus);
}
language = initialLanguage();
updateLanguageMetadata();
app.innerHTML = `<div class="loading">${t('loading')}</div>`;
init().catch(()=>{
  updateLanguageMetadata();
  app.innerHTML=`<div class="error-screen"><h1>${t('brandName')}</h1><p>${t('loadError')}</p><button class="primary-button" id="reload-app">${t('reload')}</button></div>`;
  $('#reload-app').addEventListener('click',()=>location.reload());
});
