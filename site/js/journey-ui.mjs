import {nodeAccess,recommendedNode} from './journey.mjs';

const title=(node,language)=>node[language==='zh'?'titleZh':language==='es'?'titleEs':'titleEn'];

export function journeyMarkup(c) {
  const {t,icon,escape,glyph,byId,journey,journeyProgress,language,activeAttempt,showPast}=c;
  const main=journey.nodes.filter(n=>n.kind==='main');
  const completed=main.filter(n=>journeyProgress.completedNodes[n.id]).length;
  const next=recommendedNode(journeyProgress,journey);
  // A valid saved round remains resumable when another device changes the
  // recommended starting point. Starting a new locked round is still gated.
  const active=activeAttempt?journey.nodeById[activeAttempt.nodeId]:null;
  const current=active||next;
  const progress=completed/main.length*100;
  const words=node=>node.targetIds.map(id=>`<span lang="zh">${escape(glyph(byId(id)))}</span>`).join('');
  const nodeMarkup=node=>{
    const access=nodeAccess(node.id,journeyProgress,journey);
    const currentNode=current?.id===node.id;
    const status=access.completed?'journeyDone':currentNode?'journeyReady':
      access.canStart?'journeyReplay':'journeyLocked';
    return `<div class="journey-row ${access.completed?'journey-past':''}"><button class="journey-node ${access.state} ${currentNode?'current':''}"
      data-journey-node="${node.id}" aria-label="${escape(title(node,language))} · ${t(status)}">
      <span class="journey-circle">${access.completed?icon('check'):currentNode?escape(glyph(byId(node.targetIds[0]))):icon('leaf')}</span>
      <span><b>${escape(title(node,language))}</b><small>${t(status)}</small></span></button></div>`;
  };
  return `<div class="journey-layout"><section class="journey-main"><header class="journey-heading">
    <div class="eyebrow">${t('journeyEyebrow')}</div><h1>${t('journeyTitle')}</h1><p>${t('journeyIntro')}</p>
    <div class="journey-meter"><div class="progress-track"><div class="progress-fill" style="width:${progress}%"></div></div><span>${t('journeyCount',{n:completed,total:main.length})}</span></div>
    </header><section class="journey-continue"><div><small>${t(current?'journeyNext':'journeyComplete')}</small>
      <h2>${current?escape(title(current,language)):t('journeyComplete')}</h2><p>${current?t(current.lessonId==='lesson9'?'journeyMixed':'journeyTargets',{n:current.targetIds.length}):t('journeyCompleteText')}</p></div>
      <button class="primary-button" ${current?`data-journey-start="${current.id}"`:'data-view="personal"'}>${t(active?'journeyResume':current?completed?'journeyContinue':'journeyStart':'journeyExplore')}${icon('arrow')}</button></section>
    <div class="journey-legend"><span>${icon('check')}${t('journeyDone')}</span><span>${icon('sprout')}${t('journeyReady')}</span><span>${icon('leaf')}${t('journeyLocked')}</span></div>
    ${current?`<button class="text-button journey-locate" data-action="journey-locate">${icon('sprout')}${t('journeyLocate')}</button>`:''}
    <div class="journey-trail ${showPast?'show-past':''}">${completed?`<button class="text-button journey-toggle" data-action="journey-past">${t(showPast?'journeyHidePrevious':'journeyPrevious')}</button>`:''}
    ${journey.chapters.map(chapter=>`<section class="journey-chapter"><h2>${t('journeyChapter'+(chapter.order+1))}</h2>
      ${main.filter(node=>node.chapterId===chapter.id).map(nodeMarkup).join('')}</section>`).join('')}</div>
    <p class="journey-disclaimer">${t('journeyNote')}</p>
    <section class="journey-extras"><h2>${t('journeyOptional')}</h2>${journey.nodes.filter(n=>n.kind!=='main').map((node,index)=>{
      const access=nodeAccess(node.id,journeyProgress,journey);
      return `<button class="journey-extra ${access.completed?'completed':''}" data-journey-node="${node.id}"><span>${icon(access.completed?'check':node.kind==='tutorial'?'sprout':'refresh')}</span><span><b>${t(node.kind==='tutorial'?'journeyTutorial':'journeyCamp',{n:index})}</b><small>${t(node.kind==='tutorial'?'journeyTutorialText':'journeyCampText')}</small><em>${t(access.completed?'journeyDone':access.canStart?'journeyReady':'journeyLocked')}</em></span>${icon('arrow')}</button>`;
    }).join('')}</section></section>
    <aside class="journey-side"><section class="record-panel"><h2>${t('journeyDone')}</h2><div class="journey-tree" aria-hidden="true">${icon('sprout')}${Array.from({length:completed},()=>icon('leaf')).join('')}</div><p>${t('journeyCount',{n:completed,total:main.length})}</p><p>${t('journeyNote')}</p></section>
      <section class="record-panel"><h2>${t('personal')}</h2><p>${t('personalIntro')}</p><button class="text-button" data-view="personal">${t('personalTitle')}${icon('arrow')}</button></section>
      <section class="record-panel"><h2>${t('journeyBridge')}</h2><div class="journey-pair" lang="zh">门 <span>·</span> 門</div><p>${t('journeyBridgeText')}</p><button class="text-button" data-bridge>${t('modeQuad')}${icon('arrow')}</button></section>
    </aside></div>`;
}

export function personalMarkup(c) {
  const {t,icon,escape,glyph,byId,progress,journey,journeyProgress}=c;
  const count=journey.nodes.filter(n=>n.kind==='main'&&journeyProgress.completedNodes[n.id]).length;
  const favorites=progress.favorites.slice(0,8);
  return `<section class="view-heading personal-heading"><div><div class="eyebrow">${t('personalEyebrow')}</div><h1>${t('personalTitle')}</h1><p>${t('personalIntro')}</p></div><span class="personal-seal" lang="zh">字</span></section>
    <div class="stats-grid personal-stats"><div class="stat-box"><small>${t('practiced')}</small><b>${progress.mastered.length}</b><span>${t('practiceOnly')}</span></div><div class="stat-box"><small>${t('journey')}</small><b>${count}<small> / 13</small></b><span>${t('journeyDone')}</span></div><div class="stat-box"><small>${t('favoriteCount')}</small><b>${progress.favorites.length}</b><span>${t('characters')}</span></div></div>
    <section class="personal-warmup"><div><h2>${t('personalWarmup')}</h2><p>${t('personalWarmupText')}</p></div><button class="primary-button" data-view="match">${t('personalPractice')}${icon('arrow')}</button></section>
    <p class="journey-disclaimer">${t('personalNote')}</p>
    <div class="personal-links">${[['match','grid','personalPractice'],['atlas','book','atlas'],['progress','chart','progress'],['sources','source','sources'],['settings','settings','settings']].map(([view,i,key])=>`<button data-view="${view}">${icon(i)}<b>${t(key)}</b>${icon('arrow')}</button>`).join('')}</div>
    <section class="record-panel"><h2>${t('favoriteCount')}</h2>${favorites.length?`<div class="character-chips">${favorites.map(id=>`<button class="character-chip" data-detail="${id}">${escape(glyph(byId(id)))}<small>${escape(byId(id).pinyin)}</small></button>`).join('')}</div>`:`<p>${t('personalWarmupText')}</p>`}<button class="text-button" data-action="personal-favorites">${t('personalFavorites')}${icon('arrow')}</button></section>
    <section class="record-panel"><h2>${t('personalChooseStart')}</h2><p>${t('personalStartNote')}</p><button class="secondary-button" data-action="journey-placement">${t('personalChooseStart')}${icon('arrow')}</button></section>
    ${progress.mastered.length||progress.sessions.length?`<div class="info-banner">${t('personalOldRecords')}</div>`:''}`;
}

export function introductionMarkup(c,attempt) {
  const {t,icon,escape,glyph,byId,journey}=c;
  const node=journey.nodeById[attempt.nodeId];
  const index=Math.min(attempt.introductionIndex,node.targetIds.length-1);
  const character=byId(node.targetIds[index]);
  const text=c.description(character);
  const pictureSource=character.assets?.find(asset=>asset.role==='picture');
  const pictureLabel=pictureSource?.originKind==='ai-generated'?'assetAi':pictureSource?.originKind==='user-ppt'?'assetSlide':pictureSource?.originKind==='commons'?'assetPhoto':'assetOriginal';
  return `<section class="journey-intro"><div class="eyebrow">${t('journeyMeet')} · ${index+1} / ${node.targetIds.length}</div><h1>${escape(title(node,c.language))}</h1><p>${t('journeyMeetText')}</p>
    <article class="encounter-card"><div class="encounter-picture"><img src="${escape(c.appUrl(character.picture))}" alt="${escape(c.meaning(character))}"><small class="encounter-origin">${t(pictureLabel)}</small></div><div class="encounter-word"><strong lang="${attempt.script==='traditional'?'zh-Hant':'zh-Hans'}">${escape(glyph(character,attempt.script))}</strong><span>${escape(character.pinyin)}</span><b>${escape(c.language==='zh'?character.hanzi:c.meaning(character))}</b><button class="round-icon" data-speak="${character.id}" aria-label="${t('speak')}">${icon('sound')}</button></div><div class="encounter-clue"><img src="${escape(c.appUrl(character.ancient))}" alt="${escape(c.localized(character,'ancientLabel'))}"><p>${escape(text)}</p></div></article>
    <p class="source-small">${t('caption')}</p><div class="encounter-actions"><button class="secondary-button" data-detail="${character.id}">${t('detail')}</button><button class="primary-button" data-action="journey-intro-next">${t(index+1<node.targetIds.length?'journeyMeetNext':'journeyPlay')}${icon('arrow')}</button></div></section>`;
}
