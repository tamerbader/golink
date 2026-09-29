// Safari service worker: wires storage + go/ navigation interception + omnibox.
// Mirrors the Chrome background, but stores shortcuts privately in
// storage.local (never synced) and feature-detects Safari-unsupported APIs.
import {
  parseGoUrl,
  parseInput,
  parseSearchRedirect,
  resolve,
  normalizeName,
  entryUrl,
} from './resolver.js';

// Safari exposes the promise-based `browser` namespace; Chromium exposes
// `chrome`. Using whichever is present keeps this file identical across both.
const api = globalThis.browser ?? globalThis.chrome;

// In-memory cache so the navigation handler can resolve without awaiting
// storage on the hot path; kept in sync via storage.onChanged.
let cache = null;

async function getShortcuts() {
  if (cache) return cache;
  const { shortcuts } = await api.storage.local.get('shortcuts');
  cache = shortcuts || {};
  return cache;
}

async function setShortcuts(shortcuts) {
  cache = shortcuts;
  await api.storage.local.set({ shortcuts });
}

api.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.shortcuts) {
    cache = changes.shortcuts.newValue || {};
  }
});

// Warm the cache as soon as the worker spins up.
getShortcuts();

function optionsUrl(prefill) {
  const base = api.runtime.getURL('options.html');
  return prefill ? `${base}?add=${encodeURIComponent(prefill)}` : base;
}

/** Guard against shortcuts that resolve back to a go-link (redirect loops). */
function isGoUrl(url) {
  try {
    return new URL(url).hostname.toLowerCase() === 'go';
  } catch {
    return false;
  }
}

// Best-effort usage counter; never blocks navigation.
function bumpHits(name) {
  const shortcuts = cache;
  const entry = shortcuts && shortcuts[name];
  if (entry && typeof entry === 'object') {
    entry.hits = (entry.hits || 0) + 1;
    setShortcuts(shortcuts);
  }
}

async function destinationFor(command, rest) {
  const shortcuts = await getShortcuts();
  if (!command) return { url: optionsUrl(), matched: false, name: '' };
  const name = normalizeName(command);
  const url = resolve(command, rest, shortcuts);
  if (url && !isGoUrl(url)) return { url, matched: true, name };
  // Unknown command or a loop-y destination: send to options to fix it.
  return { url: optionsUrl(command), matched: false, name };
}

// --- go/{command} navigation interception ---------------------------------
api.webNavigation.onBeforeNavigate.addListener(
  async (details) => {
    if (details.frameId !== 0) return;
    const parsed = parseGoUrl(details.url);
    if (!parsed) return;
    const { url, matched, name } = await destinationFor(parsed.command, parsed.rest);
    if (matched) bumpHits(name);
    await api.tabs.update(details.tabId, { url });
  },
  { url: [{ hostEquals: 'go' }] }
);

// --- Rescue accidental "go/foo" web searches ------------------------------
// If the address bar searched (instead of navigating) for a go-link, catch the
// search-results navigation and redirect it. This is the primary way go-links
// work on Safari, which has no omnibox keyword. Only known shortcuts are
// rescued, so ordinary searches like "go pro camera" are never hijacked.
api.webNavigation.onBeforeNavigate.addListener(
  async (details) => {
    if (details.frameId !== 0) return;
    const parsed = parseSearchRedirect(details.url);
    if (!parsed) return;
    const shortcuts = await getShortcuts();
    const dest = resolve(parsed.command, parsed.rest, shortcuts);
    if (!dest || isGoUrl(dest)) return; // unknown shortcut or loop: leave the search alone
    bumpHits(normalizeName(parsed.command));
    await api.tabs.update(details.tabId, { url: dest });
  },
  {
    url: [
      { hostContains: '.google.' },
      { hostSuffix: 'bing.com' },
      { hostSuffix: 'duckduckgo.com' },
      { hostSuffix: 'yahoo.com' },
      { hostSuffix: 'ecosia.org' },
      { hostSuffix: 'brave.com' },
      { hostSuffix: 'startpage.com' },
      { hostSuffix: 'yandex.com' },
    ],
  }
);

// --- Omnibox keyword "go" (fallback) --------------------------------------
// Safari does not implement the omnibox API. Feature-detect so the extension
// still loads and the go/ redirect keeps working on Safari; on browsers that
// support omnibox (or future Safari versions) the keyword works as usual.
function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

if (api.omnibox) {
  api.omnibox.setDefaultSuggestion({
    description: 'Go link — type a shortcut name (e.g. calendar)',
  });

  api.omnibox.onInputChanged.addListener(async (text, suggest) => {
    const shortcuts = await getShortcuts();
    const { command, rest } = parseInput(text);
    const q = normalizeName(command);
    const names = Object.keys(shortcuts).sort();
    const ranked = names
      .filter((n) => !q || n.includes(q))
      .sort((a, b) => (a.startsWith(q) === b.startsWith(q) ? 0 : a.startsWith(q) ? -1 : 1))
      .slice(0, 8);
    suggest(
      ranked.map((n) => ({
        // Preserve typed args so selecting a suggestion keeps them.
        content: rest ? `${n} ${rest}` : n,
        description: `go/${escapeXml(n)} — ${escapeXml(entryUrl(shortcuts[n]))}`,
      }))
    );
  });

  api.omnibox.onInputEntered.addListener(async (text, disposition) => {
    const { command, rest } = parseInput(text);
    const { url, matched, name } = await destinationFor(command, rest);
    if (matched) bumpHits(name);
    if (disposition === 'newForegroundTab') {
      await api.tabs.create({ url });
    } else if (disposition === 'newBackgroundTab') {
      await api.tabs.create({ url, active: false });
    } else {
      const [tab] = await api.tabs.query({ active: true, currentWindow: true });
      if (tab) await api.tabs.update(tab.id, { url });
      else await api.tabs.create({ url });
    }
  });
}
