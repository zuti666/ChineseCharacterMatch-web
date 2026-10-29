import {appUrl} from './paths.mjs';

// Downloads stay online-only and outside the learning-content cache.
export async function fetchAndroidRelease() {
  const controller = new AbortController();
  const timeout = setTimeout(()=>controller.abort(),12000);
  try {
    const response = await fetch(appUrl('app-release.json'), {cache:'no-store',signal:controller.signal});
    if (!response.ok) throw new Error('Release unavailable');
    const release = await response.json();
    if (release.schemaVersion !== 1 || release.downloadUrl !== 'downloads/ziyu-android.apk' ||
        release.fileName !== 'ziyu-android.apk' || !/^[a-f0-9]{64}$/.test(release.sha256) ||
        !/^[0-9]+\.[0-9]+\.[0-9]+$/.test(release.version) ||
        !Number.isSafeInteger(release.sizeBytes) || release.sizeBytes <= 0 ||
        release.debug !== true || release.deviceTested !== false) throw new Error('Invalid release');
    return release;
  } finally {clearTimeout(timeout);}
}

export function websiteLink(language) {
  const local = /^(localhost|127\.0\.0\.1|appassets\.androidplatform\.net)$/.test(location.hostname);
  const url = new URL(local ? 'https://zuti666.github.io/ChineseCharacterMatch-web/' : appUrl('./'));
  url.searchParams.set('page','app');
  url.searchParams.set('lang',language);
  return url.href;
}

export function accountWebsiteLink(language) {
  const url = new URL('https://chinesecharactermatch.onrender.com/');
  url.searchParams.set('page','app');
  url.searchParams.set('lang',language);
  return url.href;
}
