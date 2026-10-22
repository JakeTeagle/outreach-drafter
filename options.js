import { connectNotion } from './lib/notion.js';

const FIELDS = ['senderName', 'notionClientId', 'notionClientSecret', 'notionToken', 'titleFilter', 'anthropicKey', 'model'];
const DEFAULTS = { model: 'claude-opus-5-5', titleFilter: 'playbook' };
const $ = (id) => document.getElementById(id);

function readForm() {
  return Object.fromEntries(FIELDS.map((f) => [f, $(f).value.trim()]));
}

function showNotionStatus({ notionToken, notionWorkspace }) {
  const connected = !!notionToken;
  $('notion-status').textContent = connected ? `Connected · ${notionWorkspace || 'API token'}` : 'Not connected';
  $('notion-status').style.color = connected ? 'var(--green)' : 'var(--label-2)';
  $('notion-status-icon').className = 'symbol ' + (connected ? 'green' : 'gray');
  $('connect-notion').textContent = connected ? 'Reconnect Notion' : 'Connect Notion';
}

async function load() {
  const values = { ...DEFAULTS, ...(await chrome.storage.sync.get(null)) };
  for (const f of FIELDS) $(f).value = values[f] || '';
  showNotionStatus(values);
}

$('redirect-uri').textContent = chrome.identity.getRedirectURL();
$('copy-redirect').addEventListener('click', async (e) => {
  await navigator.clipboard.writeText(chrome.identity.getRedirectURL());
  e.target.textContent = 'Copied';
  setTimeout(() => { e.target.textContent = 'Copy'; }, 1400);
});

$('connect-notion').addEventListener('click', async () => {
  const { notionClientId, notionClientSecret } = readForm();
  const status = $('connect-status');
  status.className = 'status';
  if (!notionClientId || !notionClientSecret) {
    status.className = 'status error';
    status.textContent = 'Add the client ID and secret first.';
    return;
  }
  await chrome.storage.sync.set({ notionClientId, notionClientSecret });
  status.innerHTML = '<span class="spinner"></span><span>Waiting for Notion…</span>';
  try {
    await connectNotion(notionClientId, notionClientSecret);
    status.textContent = '';
    await load();
  } catch (err) {
    status.className = 'status error';
    status.textContent = err.message;
  }
});

$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  await chrome.storage.sync.set(readForm());
  const saved = $('saved');
  saved.textContent = '✓ Saved';
  saved.style.opacity = 1;
  setTimeout(() => { saved.style.opacity = 0; }, 1600);
  showNotionStatus(await chrome.storage.sync.get(null));
});

load();
