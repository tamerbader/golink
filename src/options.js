import { normalizeName, entryUrl } from './resolver.js';

const rowsEl = document.getElementById('rows');
const emptyEl = document.getElementById('empty');
const searchEl = document.getElementById('search');
const toastEl = document.getElementById('toast');
const addForm = document.getElementById('add-form');
const nameInput = document.getElementById('name');
const urlInput = document.getElementById('url');

let shortcuts = {};
let toastTimer = null;

async function getShortcuts() {
  try {
    const { shortcuts: s } = await chrome.storage.sync.get('shortcuts');
    return s || {};
  } catch {
    const { shortcuts: s } = await chrome.storage.local.get('shortcuts');
    return s || {};
  }
}

async function saveShortcuts() {
  try {
    await chrome.storage.sync.set({ shortcuts });
  } catch {
    await chrome.storage.local.set({ shortcuts });
  }
}

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastEl.hidden = true), 2200);
}

function render() {
  const q = normalizeName(searchEl.value);
  const names = Object.keys(shortcuts)
    .filter((n) => !q || n.includes(q) || entryUrl(shortcuts[n]).toLowerCase().includes(q))
    .sort();

  rowsEl.textContent = '';
  emptyEl.hidden = names.length !== 0;

  for (const name of names) {
    const url = entryUrl(shortcuts[name]);
    const hits = (shortcuts[name] && shortcuts[name].hits) || 0;
    const tr = document.createElement('tr');
    tr.dataset.name = name;

    const nameTd = document.createElement('td');
    nameTd.className = 'name-cell';
    nameTd.textContent = `go/${name}`;

    const urlTd = document.createElement('td');
    urlTd.className = 'url-cell';
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noreferrer';
    a.textContent = url;
    urlTd.appendChild(a);

    const hitsTd = document.createElement('td');
    hitsTd.className = 'hits';
    hitsTd.textContent = String(hits);

    const actionsTd = document.createElement('td');
    actionsTd.className = 'actions';
    const wrap = document.createElement('div');
    wrap.className = 'row-actions';
    const editBtn = document.createElement('button');
    editBtn.className = 'btn';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => editRow(tr, name));
    const delBtn = document.createElement('button');
    delBtn.className = 'btn danger';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', () => removeShortcut(name));
    wrap.append(editBtn, delBtn);
    actionsTd.appendChild(wrap);

    tr.append(nameTd, urlTd, hitsTd, actionsTd);
    rowsEl.appendChild(tr);
  }
}

function editRow(tr, name) {
  const url = entryUrl(shortcuts[name]);
  tr.innerHTML = '';

  const nameTd = document.createElement('td');
  const nameField = document.createElement('input');
  nameField.className = 'edit-input';
  nameField.value = name;
  nameTd.appendChild(nameField);

  const urlTd = document.createElement('td');
  const urlField = document.createElement('input');
  urlField.className = 'edit-input';
  urlField.value = url;
  urlTd.appendChild(urlField);

  const hitsTd = document.createElement('td');
  hitsTd.className = 'hits';

  const actionsTd = document.createElement('td');
  actionsTd.className = 'actions';
  const wrap = document.createElement('div');
  wrap.className = 'row-actions';
  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn primary';
  saveBtn.textContent = 'Save';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn';
  cancelBtn.textContent = 'Cancel';
  saveBtn.addEventListener('click', async () => {
    const newName = normalizeName(nameField.value);
    const newUrl = urlField.value.trim();
    if (!newName || !newUrl) return toast('Name and URL are required');
    if (newName !== name && shortcuts[newName]) return toast(`go/${newName} already exists`);
    const prev = shortcuts[name] || {};
    delete shortcuts[name];
    shortcuts[newName] = { url: newUrl, hits: prev.hits || 0, created: prev.created || Date.now() };
    await saveShortcuts();
    render();
    toast('Saved');
  });
  cancelBtn.addEventListener('click', render);
  wrap.append(saveBtn, cancelBtn);
  actionsTd.appendChild(wrap);

  tr.append(nameTd, urlTd, hitsTd, actionsTd);
  nameField.focus();
}

async function removeShortcut(name) {
  if (!confirm(`Delete go/${name}?`)) return;
  delete shortcuts[name];
  await saveShortcuts();
  render();
  toast('Deleted');
}

async function addShortcut(name, url) {
  const key = normalizeName(name);
  const dest = url.trim();
  if (!key || !dest) return toast('Name and URL are required');
  shortcuts[key] = {
    url: dest,
    hits: (shortcuts[key] && shortcuts[key].hits) || 0,
    created: Date.now(),
  };
  await saveShortcuts();
  render();
  toast(`Saved go/${key}`);
}

addForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  await addShortcut(nameInput.value, urlInput.value);
  nameInput.value = '';
  urlInput.value = '';
  nameInput.focus();
});

searchEl.addEventListener('input', render);

document.getElementById('export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ shortcuts }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'golinks.json';
  a.click();
  URL.revokeObjectURL(url);
});

const importFile = document.getElementById('import-file');
document.getElementById('import').addEventListener('click', () => importFile.click());
importFile.addEventListener('change', async () => {
  const file = importFile.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const incoming = data.shortcuts || data;
    let count = 0;
    for (const [rawName, val] of Object.entries(incoming)) {
      const key = normalizeName(rawName);
      const url = entryUrl(val);
      if (!key || !url) continue;
      shortcuts[key] = {
        url,
        hits: (val && val.hits) || 0,
        created: (val && val.created) || Date.now(),
      };
      count++;
    }
    await saveShortcuts();
    render();
    toast(`Imported ${count} shortcut${count === 1 ? '' : 's'}`);
  } catch {
    toast('Could not parse JSON file');
  } finally {
    importFile.value = '';
  }
});

// Re-render live if shortcuts change in another tab/popup.
chrome.storage.onChanged.addListener((changes, area) => {
  if ((area === 'sync' || area === 'local') && changes.shortcuts) {
    shortcuts = changes.shortcuts.newValue || {};
    render();
  }
});

async function init() {
  shortcuts = await getShortcuts();
  render();
  // Prefill the add form when launched from an unknown go/{name}.
  const prefill = new URLSearchParams(location.search).get('add');
  if (prefill) {
    nameInput.value = normalizeName(prefill);
    urlInput.focus();
  }
}

init();
