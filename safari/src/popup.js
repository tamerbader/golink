import { normalizeName } from './resolver.js';

// Safari exposes promise-based `browser`; Chromium exposes `chrome`.
const api = globalThis.browser ?? globalThis.chrome;

const urlEl = document.getElementById('current-url');
const nameEl = document.getElementById('name');
const statusEl = document.getElementById('status');

let currentUrl = '';

async function getShortcuts() {
  const { shortcuts } = await api.storage.local.get('shortcuts');
  return shortcuts || {};
}

async function setShortcuts(shortcuts) {
  await api.storage.local.set({ shortcuts });
}

/** Suggest a short name from the page's hostname (e.g. outlook.cloud.microsoft -> outlook). */
function suggestName(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return host.split('.')[0] || '';
  } catch {
    return '';
  }
}

async function init() {
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  currentUrl = (tab && tab.url) || '';
  urlEl.textContent = currentUrl || 'No active tab';
  nameEl.value = suggestName(currentUrl);
  nameEl.focus();
  nameEl.select();
}

async function save() {
  const key = normalizeName(nameEl.value);
  if (!key) {
    statusEl.style.color = '#f87171';
    statusEl.textContent = 'Enter a shortcut name';
    return;
  }
  if (!/^https?:|^ftp:|^file:/i.test(currentUrl)) {
    statusEl.style.color = '#f87171';
    statusEl.textContent = 'This page cannot be saved';
    return;
  }
  const shortcuts = await getShortcuts();
  const existed = Boolean(shortcuts[key]);
  shortcuts[key] = {
    url: currentUrl,
    hits: (shortcuts[key] && shortcuts[key].hits) || 0,
    created: Date.now(),
  };
  await setShortcuts(shortcuts);
  statusEl.style.color = '#34d399';
  statusEl.textContent = `${existed ? 'Updated' : 'Saved'} go/${key}`;
}

document.getElementById('save').addEventListener('click', save);
nameEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') save();
});
document.getElementById('manage').addEventListener('click', () => {
  api.runtime.openOptionsPage();
});

init();
