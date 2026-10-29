import {APP_BASE_URL} from './paths.mjs';

export const mobileState = {
  supported: 'serviceWorker' in navigator && window.isSecureContext,
  ready:false, installed:window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
  canPrompt:false, updateReady:false, failed:false,
};
let installPrompt, onChange = () => {}, registration;

export function installPlatform() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ? 'ios' : 'other';
}

export async function requestInstall() {
  if (!installPrompt) return 'manual';
  const prompt = installPrompt; installPrompt = null; mobileState.canPrompt = false;
  onChange();
  try {await prompt.prompt(); return (await prompt.userChoice).outcome;}
  catch {return 'manual';}
}

function queryOfflineStatus(worker = navigator.serviceWorker.controller || registration?.active) {
  worker?.postMessage({type:'ZIYU_OFFLINE_STATUS'});
}

export async function initMobile(change) {
  if (window.HANZI_ANDROID_APP === true) return;
  onChange = change;
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); installPrompt = event; mobileState.canPrompt = true; onChange();
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null; mobileState.canPrompt = false; mobileState.installed = true; onChange();
  });
  if (!mobileState.supported) {onChange(); return;}
  navigator.serviceWorker.addEventListener('message', event => {
    if (!['ZIYU_OFFLINE_READY','ZIYU_OFFLINE_STATUS'].includes(event.data?.type)) return;
    const worker = event.source;
    if (!worker || !worker.scriptURL || new URL(worker.scriptURL).href !== new URL('service-worker.js',APP_BASE_URL).href) return;
    const controller = navigator.serviceWorker.controller;
    const controlled = controller && new URL(controller.scriptURL).href === new URL('service-worker.js',APP_BASE_URL).href;
    mobileState.ready = !!controlled && (event.data.type === 'ZIYU_OFFLINE_READY' || event.data.ready === true);
    onChange();
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => {queryOfflineStatus();});
  try {
    registration = await navigator.serviceWorker.register(new URL('service-worker.js',APP_BASE_URL),
      {scope:APP_BASE_URL.pathname,updateViaCache:'none'});
    mobileState.updateReady = !!registration.waiting;
    queryOfflineStatus();
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed') {
          mobileState.updateReady = !!registration.waiting && !!navigator.serviceWorker.controller;
          queryOfflineStatus(registration.active || worker); onChange();
        }
        if (worker.state === 'activated') queryOfflineStatus(worker);
        if (worker.state === 'redundant' && !registration.active) {mobileState.failed = true; onChange();}
      });
    });
    onChange();
  } catch {mobileState.failed = true; onChange();}
}
