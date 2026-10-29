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

export function deriveLessons(characters) {
  const records = new Map(), identities = new Set(characters.map(c=>c.id));
  for (const character of characters) {
    for (const assignment of character.lessonAssignments || []) {
      const {id,titleZh,titleEn,titleEs,order,position} = assignment;
      if (!/^lesson[1-9][0-9]*$/.test(id) ||
          ![titleZh,titleEn,titleEs].every(v=>typeof v==='string' && v.trim()) ||
          !Number.isSafeInteger(order) || order<0 ||
          !Number.isInteger(position) || position<0 || position>3 || character.practiceEligible===false) {
        throw new Error('Invalid lesson assignment');
      }
      const known=records.get(id);
      if (known && [titleZh,titleEn,titleEs,order].some((v,i)=>v!==[known.titleZh,known.titleEn,known.titleEs,known.order][i])) {
        throw new Error('Inconsistent lesson titles');
      }
      const lesson=known || {id,titleZh,titleEn,titleEs,order,members:[]};
      lesson.members.push({id:character.id,position});records.set(id,lesson);
    }
  }
  const lessons=[...records.values()].sort((a,b)=>a.order-b.order);
  const covered=new Set();
  if (!lessons.length || new Set(lessons.map(l=>l.order)).size!==lessons.length) throw new Error('Invalid lesson order');
  for (const lesson of lessons) {
    if (lesson.members.length!==4 || new Set(lesson.members.map(m=>m.id)).size!==4 ||
        new Set(lesson.members.map(m=>m.position)).size!==4) throw new Error('A lesson requires four targets');
    lesson.characterIds=lesson.members.sort((a,b)=>a.position-b.position).map(m=>m.id);
    delete lesson.members;
    for (const id of lesson.characterIds) {
      if (!identities.has(id)) throw new Error('Unknown lesson target');
      covered.add(id);
    }
  }
  if (characters.some(c=>c.practiceEligible!==false && !covered.has(c.id))) throw new Error('Incomplete lesson coverage');
  return lessons;
}
