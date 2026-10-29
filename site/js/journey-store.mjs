import {emptyJourneyProgress, normalizeJourneyProgress, mergeJourneyProgress, applyCompletion,
  normalizeCompletionEvent, normalizeActiveAttempt, placeAtNode, nodeAccess, journeyStorageKey,
  isJourneyCompatible} from './journey.mjs';

const clone=value=>JSON.parse(JSON.stringify(value));
const freshId=()=>globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;
// Only names migration records. A collision is detected before writing, never overwritten.
function fingerprint(value){let h=2166136261;for(const c of value){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return `${value.length}-${h>>>0}`;}
const recordState=()=>({ops:new Map(),acks:new Map(),bases:new Map(),servers:new Map(),clock:0,active:undefined,activeDirty:false});

// Immutable per-operation keys are the durable source. The old single envelope is
// only a convenient projection; another tab overwriting it cannot erase events.
export class JourneyStore {
  constructor(journey,{storage,api,onChange=()=>{},locks=globalThis.navigator?.locks,events=globalThis.window}={}) {
    this.journey=journey;this.storage=storage;this.api=api;this.onChange=onChange;this.locks=locks;
    this.error=false;this.storageOK=true;this.synced=false;this.readBlocked=new Set();
    this.memory=new Map();this.writer=freshId();this.sequence=0;
    this.scope='guest';this.envelope=this.read('guest');this.running=null;this.runToken=null;
    this.events=events;this.storageListener=event=>{
      if(event.key===journeyStorageKey(this.scope)||event.key?.startsWith(this.prefix(this.scope))){
        this.refresh();if(this.pending.length)this.synced=false;this.onChange();
      }
    };
    events?.addEventListener?.('storage',this.storageListener);
  }
  state(scope){if(!this.memory.has(scope))this.memory.set(scope,recordState());return this.memory.get(scope);}
  prefix(scope){return `${journeyStorageKey(scope)}:journal:`;}
  fail(scope){this.readBlocked.add(scope);this.storageOK=false;this.synced=false;}
  validPlacement(id){return id===null||this.journey.nodeById[id]?.kind==='main';}
  validRemote(value){
    if(!isJourneyCompatible(value,this.journey)||!Number.isSafeInteger(value.revision)||value.revision<0||
      !value.completedNodes||typeof value.completedNodes!=='object'||Array.isArray(value.completedNodes))throw new Error('Invalid remote journey');
    const result=normalizeJourneyProgress(value,this.journey);
    if(Object.keys(result.completedNodes).length!==Object.keys(value.completedNodes).length||value.placementNodeId!==result.placementNodeId)throw new Error('Invalid remote journey state');
    return result;
  }
  operation(kind,value,scope=this.scope){
    const state=this.state(scope);state.clock=Math.max(Date.now(),state.clock+1);
    const opId=`${this.writer}-${++this.sequence}`;
    return {opId,order:`${String(state.clock).padStart(16,'0')}:${opId}`,kind,...value};
  }
  normalizedOperation(raw){
    if(!raw||typeof raw!=='object'||typeof raw.opId!=='string'||!/^[A-Za-z0-9_-]{1,200}$/.test(raw.opId)||
      typeof raw.order!=='string'||!/^\d{16}:/.test(raw.order)||raw.order.slice(17)!==raw.opId||
      !Number.isSafeInteger(Number(raw.order.slice(0,16))))return null;
    if(raw.kind==='completion'){
      const event=normalizeCompletionEvent(raw.event,this.journey);return event?{opId:raw.opId,order:raw.order,kind:'completion',event}:null;
    }
    return raw.kind==='placement'&&this.validPlacement(raw.nodeId)?{opId:raw.opId,order:raw.order,kind:'placement',nodeId:raw.nodeId}:null;
  }
  putImmutable(key,value){
    const text=JSON.stringify(value),known=this.storage.getItem(key);
    if(known!==null&&known!==text)throw new Error('Conflicting immutable journey record');
    if(known===null)this.storage.setItem(key,text);
  }
  flush(scope){
    if(this.readBlocked.has(scope))return false;
    const state=this.state(scope),prefix=this.prefix(scope);
    try{
      for(const [id,value] of state.bases)this.putImmutable(`${prefix}base:${id}`,value);
      for(const [id,value] of state.servers)this.putImmutable(`${prefix}server:${id}`,value);
      for(const [id,value] of state.ops)this.putImmutable(`${prefix}op:${id}`,value);
      for(const [id,value] of state.acks)this.putImmutable(`${prefix}ack:${id}`,value);
      if(state.activeDirty){this.storage.setItem(`${prefix}active`,JSON.stringify(state.active));state.activeDirty=false;}
      this.storageOK=true;return true;
    }catch{this.storageOK=false;this.synced=false;return false;}
  }
  importLegacy(raw,scope){
    if(!raw||raw.journalVersion===1)return;
    const state=this.state(scope),snapshot=normalizeJourneyProgress(raw.snapshot,this.journey);
    const source=JSON.stringify({snapshot,pending:raw.pending||[]}),sourceId=fingerprint(source);
    state.bases.set(sourceId,snapshot);
    let time=0;
    for(const [index,item] of (Array.isArray(raw.pending)?raw.pending:[]).entries()){
      const opId=item?.kind==='completion'&&normalizeCompletionEvent(item.event,this.journey)
        ?`legacy-completion-${item.event.eventId}`
        :`legacy-placement-${fingerprint(JSON.stringify(raw.pending.slice(0,index+1)))}-${index}`;
      const normalized=this.normalizedOperation({...item,opId,order:`${String(++time).padStart(16,'0')}:${opId}`});
      if(normalized&&!state.ops.has(opId))state.ops.set(opId,normalized);
    }
  }
  scan(scope){
    const state=this.state(scope),prefix=this.prefix(scope);
    let raw;
    try{
      raw=JSON.parse(this.storage.getItem(journeyStorageKey(scope)));
      if(raw?.snapshot&&!isJourneyCompatible(raw.snapshot,this.journey))throw new Error('Journey migration required');
      if(raw?.journalVersion!==undefined&&raw.journalVersion!==1)throw new Error('Journal migration required');
      if(typeof this.storage.key!=='function'||!Number.isSafeInteger(this.storage.length))throw new Error('Storage enumeration unavailable');
      const keys=[];
      for(let i=0;i<this.storage.length;i++){const key=this.storage.key(i);if(typeof key==='string'&&key.startsWith(prefix))keys.push(key);}
      let activeFound=false;
      for(const key of keys){
        const value=JSON.parse(this.storage.getItem(key)),name=key.slice(prefix.length);
        if(name==='active'){
          activeFound=true;if(!state.activeDirty)state.active=normalizeActiveAttempt(value,this.journey);
        }else if(name.startsWith('op:')){
          const op=this.normalizedOperation(value);
          if(!op||name!==`op:${op.opId}`)throw new Error('Invalid journey operation journal');
          state.ops.set(op.opId,op);state.clock=Math.max(state.clock,Number(op.order.slice(0,16)));
        }else if(name.startsWith('ack:')){
          if(!value||name!==`ack:${value.opId}`)throw new Error('Invalid journey acknowledgment');
          state.acks.set(value.opId,{opId:value.opId});
        }else if(name.startsWith('server:')){
          const snapshot=this.validRemote(value);
          if(name!==`server:${snapshot.revision}`)throw new Error('Invalid server checkpoint');
          state.servers.set(String(snapshot.revision),snapshot);
        }else if(name.startsWith('base:')){
          if(!isJourneyCompatible(value,this.journey))throw new Error('Invalid journey migration base');
          state.bases.set(name.slice(5),normalizeJourneyProgress(value,this.journey));
        }
      }
      this.importLegacy(raw,scope);
      if(!activeFound&&state.active===undefined){state.active=normalizeActiveAttempt(raw?.activeAttempt,this.journey);state.activeDirty=true;}
      this.readBlocked.delete(scope);
      this.flush(scope);
    }catch{this.fail(scope);}
    return this.project(scope);
  }
  project(scope){
    const state=this.state(scope);
    const servers=[...state.servers.values()].sort((a,b)=>b.revision-a.revision);
    const bases=[...state.bases.values()].sort((a,b)=>b.revision-a.revision);
    const snapshots=[...servers,...bases].sort((a,b)=>b.revision-a.revision);
    let snapshot=snapshots[0]||emptyJourneyProgress(this.journey);
    snapshot=clone(snapshot);
    for(const candidate of snapshots)snapshot=mergeJourneyProgress(snapshot,candidate,this.journey);
    const operations=[...state.ops.values()].sort((a,b)=>a.order<b.order?-1:a.order>b.order?1:0);
    for(const op of operations){
      if(op.kind==='completion'&&!Object.hasOwn(snapshot.completedNodes,op.event.nodeId)){
        snapshot.completedNodes[op.event.nodeId]=clone(op.event);
      }
    }
    const pending=operations.filter(op=>!state.acks.has(op.opId));
    const placement=pending.filter(op=>op.kind==='placement').at(-1);
    snapshot=placeAtNode(snapshot,placement?placement.nodeId:snapshot.placementNodeId,this.journey);
    return {journalVersion:1,snapshot,pending,activeAttempt:state.active||null};
  }
  read(scope){return this.scan(scope);}
  refresh(){const next=this.read(this.scope);Object.assign(this.envelope,next);return this.envelope;}
  get progress(){return this.envelope.snapshot;}
  get activeAttempt(){return this.envelope.activeAttempt;}
  get pending(){return this.envelope.pending;}
  get account(){return this.scope.startsWith('user:');}
  write(){
    // Read first, then write only append-only facts. No pending union can resurrect an ACK.
    this.refresh();if(this.pending.length)this.synced=false;const durable=this.flush(this.scope);
    try{
      if(!durable)throw new Error('Journey journal not saved');
      this.storage.setItem(journeyStorageKey(this.scope),JSON.stringify(this.envelope));this.storageOK=true;
    }catch{this.storageOK=false;this.synced=false;}
    this.onChange();return this.storageOK;
  }
  switchScope(scope){
    journeyStorageKey(scope);this.scope=scope;this.storageOK=true;this.envelope=this.read(scope);
    this.running=null;this.runToken=null;this.error=false;this.synced=false;this.onChange();
  }
  setAttempt(attempt){
    const normalized=attempt===null?null:normalizeActiveAttempt(attempt,this.journey);
    if(attempt!==null&&!normalized)throw new Error('Invalid journey draft');
    const state=this.state(this.scope);state.active=normalized;state.activeDirty=true;this.write();
  }
  hasStartGrant(nodeId){
    const state=this.state(this.scope);
    return this.journey.nodeById[nodeId]?.kind==='main'&&(
      [...state.ops.values()].some(op=>op.kind==='placement'&&op.nodeId===nodeId)||
      [...state.servers.values(),...state.bases.values()].some(snapshot=>snapshot.placementNodeId===nodeId)||
      state.active?.nodeId===nodeId);
  }
  complete(raw){
    this.refresh();const event=normalizeCompletionEvent(raw,this.journey);
    if(!event)throw new Error('Invalid journey completion');
    const existing=this.progress.completedNodes[event.nodeId];
    // Another tab may have finished this exact draft with a different final timestamp.
    // Its immutable first completion wins; a replay does not create another outbox event.
    if(!existing){
      // A different device may change the recommendation after this station was
      // legitimately started. Validate with its retained grant without emitting
      // a placement operation or changing the current recommendation.
      const validation=nodeAccess(event.nodeId,this.progress,this.journey).canStart||!this.hasStartGrant(event.nodeId)
        ?this.progress:placeAtNode(this.progress,event.nodeId,this.journey);
      applyCompletion(validation,event,this.journey);
      const op=this.operation('completion',{event});this.state(this.scope).ops.set(op.opId,op);
    }
    const state=this.state(this.scope);
    if(!state.active||state.active.attemptId===event.attemptId){state.active=null;state.activeDirty=true;}
    this.synced=false;this.write();
  }
  place(nodeId){
    this.refresh();placeAtNode(this.progress,nodeId,this.journey);
    const op=this.operation('placement',{nodeId});this.state(this.scope).ops.set(op.opId,op);
    this.synced=false;this.write();
  }
  mergeGuest(){
    if(!this.account)return;
    this.refresh();const guest=this.read('guest');
    if(this.readBlocked.has('guest')){this.onChange();return;}
    const originalPlacement=this.progress.placementNodeId;let snapshot=this.progress,temporarilyPlaced=false;
    const operations=[];
    for(const node of this.journey.nodes){
      const event=guest.snapshot.completedNodes[node.id];if(!event||snapshot.completedNodes[node.id])continue;
      if(!nodeAccess(node.id,snapshot,this.journey).canStart&&node.kind==='main'){
        snapshot=placeAtNode(snapshot,node.id,this.journey);operations.push(this.operation('placement',{nodeId:node.id}));temporarilyPlaced=true;
      }
      if(nodeAccess(node.id,snapshot,this.journey).canStart){snapshot=applyCompletion(snapshot,event,this.journey);operations.push(this.operation('completion',{event}));}
    }
    if(temporarilyPlaced)operations.push(this.operation('placement',{nodeId:originalPlacement}));
    for(const op of operations)this.state(this.scope).ops.set(op.opId,op);
    this.synced=false;this.write();
  }
  mergeRemote(remote){
    const normalized=this.validRemote(remote);
    this.state(this.scope).servers.set(String(normalized.revision),normalized);
    this.refresh();return normalized;
  }
  acknowledge(op){this.state(this.scope).acks.set(op.opId,{opId:op.opId});this.write();}
  async sync(){
    if(!this.account)return;if(this.running)return this.running;
    const owner=this.scope,envelope=this.envelope,token={};this.runToken=token;
    const stillOwner=()=>owner===this.scope&&envelope===this.envelope&&token===this.runToken;
    const work=async()=>{
      if(!stillOwner())return;
      try{
        const initial=await this.api('journey/v2');
        if(!stillOwner())return;
        let acknowledged=this.mergeRemote(initial);
        this.write();this.refresh();
        while(this.pending.length&&stillOwner()){
          const op=this.pending[0];
          const response=op.kind==='placement'?await this.api('journey/v2/placement',{method:'PUT',body:JSON.stringify({nodeId:op.nodeId})}):await this.api('journey/v2/events',{method:'POST',body:JSON.stringify(op.event)});
          if(!stillOwner())return;
          const normalized=this.mergeRemote(response);
          if(op.kind==='placement'?normalized.placementNodeId!==op.nodeId:!Object.hasOwn(normalized.completedNodes,op.event.nodeId))throw new Error('Journey operation not acknowledged');
          if(normalized.revision>=acknowledged.revision)acknowledged=normalized;
          this.acknowledge(op);this.refresh();
        }
        if(stillOwner()){
          // Another tab's newer durable server checkpoint is authoritative too.
          const checkpoints=[...this.state(owner).servers.values()].sort((a,b)=>b.revision-a.revision);
          if(checkpoints[0]?.revision>=acknowledged.revision)acknowledged=checkpoints[0];
          const all=acknowledged.revision>=this.progress.revision&&acknowledged.placementNodeId===this.progress.placementNodeId&&Object.keys(this.progress.completedNodes).every(id=>Object.hasOwn(acknowledged.completedNodes,id));
          this.error=!all;this.synced=all&&this.pending.length===0;this.write();
        }
      }catch{if(stillOwner()){this.error=true;this.synced=false;this.write();}}
    };
    this.running=(async()=>{try{
      if(this.locks?.request)await this.locks.request(`ziyu-journey-sync:${owner}`,work);else await work();
    }finally{if(this.runToken===token){this.running=null;this.runToken=null;this.onChange();}}})();
    return this.running;
  }
  export(){this.refresh();return clone(this.envelope);}
  destroy(){this.events?.removeEventListener?.('storage',this.storageListener);this.runToken=null;}
}
