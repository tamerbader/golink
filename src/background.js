// Service worker: wires storage + go/ navigation interception + omnibox.
import {
  parseGoUrl,
  parseInput,
  resolve,
  normalizeName,
  entryUrl,
} from './resolver.js';

// In-memory cache so the navigation handler can resolve without awaiting
// storage on the hot path; kept in sync via chrome.storage.onChanged.
let cache = null;

async function getShortcuts() {
  if (cache) return cache;
  try {
    const { shortcuts } = await chrome.storage.sync.get('shortcuts');
    cache = shortcuts || {};
  } catch {
    const { shortcuts } = await chrome.storage.local.get('shortcuts');
    cache = shortcuts || {};
  }
  return cache;
}

async function setShortcuts(shortcuts) {
  cache = shortcuts;
  try {
    await chrome.storage.sync.set({ shortcuts });
  } catch {
    await chrome.storage.local.set({ shortcuts });
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if ((area === 'sync' || area === 'local') && changes.shortcuts) {
    cache = changes.shortcuts.newValue || {};
  }
});

// Warm the cache as soon as the worker spins up.
getShortcuts();

function optionsUrl(prefill) {
  const base = chrome.runtime.getURL('options.html');
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
chrome.webNavigation.onBeforeNavigate.addListener(
  async (details) => {
    if (details.frameId !== 0) return;
    const parsed = parseGoUrl(details.url);
    if (!parsed) return;
    const { url, matched, name } = await destinationFor(parsed.command, parsed.rest);
    if (matched) bumpHits(name);
    await chrome.tabs.update(details.tabId, { url });
  },
  { url: [{ hostEquals: 'go' }] }
);

// --- Omnibox keyword "go" (fallback) --------------------------------------
function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

chrome.omnibox.setDefaultSuggestion({
  description: 'Go link — type a shortcut name (e.g. calendar)',
});

chrome.omnibox.onInputChanged.addListener(async (text, suggest) => {
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

chrome.omnibox.onInputEntered.addListener(async (text, disposition) => {
  const { command, rest } = parseInput(text);
  const { url, matched, name } = await destinationFor(command, rest);
  if (matched) bumpHits(name);
  if (disposition === 'newForegroundTab') {
    await chrome.tabs.create({ url });
  } else if (disposition === 'newBackgroundTab') {
    await chrome.tabs.create({ url, active: false });
  } else {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) await chrome.tabs.update(tab.id, { url });
    else await chrome.tabs.create({ url });
  }
});
