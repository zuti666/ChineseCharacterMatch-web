// The module lives in <application>/js/, including on GitHub project Pages.
// Resolve authored /assets/... paths against that application directory rather
// than the hostname root. Keep external URLs intact and leave source data alone.
export const APP_BASE_URL = new URL('../', import.meta.url);

export function appUrl(path, baseUrl = APP_BASE_URL) {
  const relativePath = path.startsWith('/') && !path.startsWith('//') ? path.slice(1) : path;
  return new URL(relativePath, baseUrl).href;
}
