import { normalizeName } from './resolver.js';

const urlEl = document.getElementById('current-url');
const nameEl = document.getElementById('name');
const statusEl = document.getElementById('status');

let currentUrl = '';

async function getShortcuts() {
  try {
    const { shortcuts } = await chrome.storage.sync.get('shortcuts');
    return shortcuts || {};
  } catch {
    const { shortcuts } = await chrome.storage.local.get('shortcuts');
    return shortcuts || {};
  }
}

async function setShortcuts(shortcuts) {
  try {
    await chrome.storage.sync.set({ shortcuts });
  } catch {
    await chrome.storage.local.set({ shortcuts });
  }
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
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
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
  chrome.runtime.openOptionsPage();
});

init();
