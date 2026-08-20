interface CurrentGoogleMapsPlace {
  title: string;
  sourceUrl: string;
}

function titleFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const match = /\/maps\/place\/([^/]+)/.exec(parsed.pathname);
    if (!match?.[1]) return '';
    return decodeURIComponent(match[1].replaceAll('+', ' ')).trim();
  } catch {
    return '';
  }
}

function currentPlace(): CurrentGoogleMapsPlace | null {
  const sourceUrl = window.location.href;
  const heading = document.querySelector<HTMLElement>('h1.DUwDvf')
    ?? document.querySelector<HTMLElement>('main h1')
    ?? document.querySelector<HTMLElement>('h1');
  const title = heading?.textContent?.trim() || titleFromUrl(sourceUrl);
  if (!title || !/\/maps\/(place|search|dir)\//.test(window.location.pathname)) return null;
  return { title, sourceUrl };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== 'object') return;
  if ((message as { type?: string }).type !== 'OWNLY_GET_CURRENT_PLACE') return;
  sendResponse({ place: currentPlace() });
});
