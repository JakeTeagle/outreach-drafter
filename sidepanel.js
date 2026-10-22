import { listPlaybooks, fetchPlaybookText } from './lib/notion.js';
import { draftOutreach } from './lib/claude.js';
import { scrapeProfile } from './lib/scrape.js';

const $ = (id) => document.getElementById(id);
const DEFAULTS = { model: 'claude-opus-5-5', titleFilter: 'playbook' };
const WORD_LIMIT = 100;

let settings = {};
let variants = [];
let active = 0;

async function loadSettings() {
  settings = { ...DEFAULTS, ...(await chrome.storage.sync.get(null)) };
  const ready = settings.notionToken && settings.anthropicKey;
  $('setup-warning').hidden = !!ready;
  return ready;
}

function setStatus(msg, { busy = false, error = false } = {}) {
  const el = $('status');
  el.className = 'status' + (error ? ' error' : '');
  el.innerHTML = (busy ? '<span class="spinner"></span>' : '') + `<span>${escapeHtml(msg)}</span>`;
}

async function loadPlaybooks(force = false) {
  const select = $('playbook');
  const { playbookCache, lastPlaybook } = await chrome.storage.local.get(['playbookCache', 'lastPlaybook']);
  let playbooks = playbookCache;

  if (force || !playbooks) {
    select.innerHTML = '<option value="">Loading…</option>';
    try {
      playbooks = await listPlaybooks(settings.notionToken, settings.titleFilter);
      await chrome.storage.local.set({ playbookCache: playbooks });
    } catch (e) {
      select.innerHTML = '<option value="">Unavailable</option>';
      setStatus(e.message, { error: true });
      return;
    }
  }

  select.innerHTML = playbooks.length
    ? '<option value="" disabled>Choose…</option>' +
      playbooks.map((p) => `<option value="${p.id}">${escapeHtml(shortTitle(p.title))}</option>`).join('')
    : '<option value="">None shared</option>';
  select.value = lastPlaybook && playbooks.some((p) => p.id === lastPlaybook) ? lastPlaybook : '';
}

// "Account Executive - Hiring Playbook 2026" -> "Account Executive"
function shortTitle(title) {
  return title.split(/\s+[-–—]\s+hiring playbook/i)[0].trim() || title;
}

async function getProfile() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url?.startsWith('https://www.linkedin.com/')) {
    throw new Error('Open a LinkedIn Recruiter profile in this tab first.');
  }
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: scrapeProfile,
  });
  if (!result || result.text.length < 200) {
    throw new Error("Couldn't find a profile on this page.");
  }
  return result;
}

async function draft() {
  const playbookId = $('playbook').value;
  if (!playbookId) return setStatus('Choose a playbook first.', { error: true });

  const button = $('draft');
  button.disabled = true;
  $('results').hidden = true;

  try {
    setStatus('Reading profile…', { busy: true });
    const profile = await getProfile();

    setStatus('Opening playbook…', { busy: true });
    const title = $('playbook').selectedOptions[0].textContent;
    const text = await fetchPlaybookText(settings.notionToken, playbookId);
    await chrome.storage.local.set({ lastPlaybook: playbookId });

    setStatus(`Writing to ${profile.name || 'candidate'}…`, { busy: true });
    const result = await draftOutreach({
      apiKey: settings.anthropicKey,
      model: settings.model,
      senderName: settings.senderName,
      notes: $('notes').value.trim(),
      profile,
      playbook: { title, text },
    });

    render(result);
    setStatus('');
  } catch (e) {
    setStatus(e.message, { error: true });
  } finally {
    button.disabled = false;
  }
}

function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
}

function render(r) {
  const hooks = (r.hooks || []).map((h) => `
    <div class="row hook"><span class="dot"></span><span>${escapeHtml(h)}</span></div>`).join('');
  $('candidate').innerHTML = `
    <div class="candidate">
      <div class="avatar">${escapeHtml(initials(r.candidate?.name))}</div>
      <div>
        <div class="candidate-name">${escapeHtml(r.candidate?.name || 'Candidate')}</div>
        <div class="candidate-role">${escapeHtml(r.candidate?.current_role || '')}</div>
      </div>
    </div>
    ${hooks ? `<div class="row stack" style="padding-bottom:0"><span class="row-caption">Why them</span></div>${hooks}` : ''}`;

  variants = (r.variants || []).map((v) => ({ ...v }));
  const recommended = (r.recommended || '').trim().charAt(0).toUpperCase();
  const seg = $('segmented');
  seg.innerHTML = '<div class="thumb"></div>' + variants.map((v, i) => {
    const letter = v.label?.trim().charAt(0) || String.fromCharCode(65 + i);
    const name = letter === 'A' ? 'Their Work' : letter === 'B' ? 'The Role' : `Option ${letter}`;
    const star = letter === recommended ? '<span class="star">★</span>' : '';
    return `<button role="tab" data-i="${i}">${star}${name}</button>`;
  }).join('');
  seg.querySelector('.thumb').style.width = `calc((100% - 4px) / ${variants.length || 1})`;
  seg.querySelectorAll('button').forEach((b) =>
    b.addEventListener('click', () => selectVariant(Number(b.dataset.i))));

  const recIndex = variants.findIndex((v) => v.label?.trim().charAt(0).toUpperCase() === recommended);
  selectVariant(recIndex >= 0 ? recIndex : 0);

  let reason = (r.recommended || '').replace(/^[AB]\b[\s,.:—-]*/i, '');
  reason = reason.charAt(0).toUpperCase() + reason.slice(1);
  const recName = recommended === 'A' ? 'Their Work' : recommended === 'B' ? 'The Role' : recommended;
  const warnings = (r.warnings || []).map((w) => `
    <div class="row warning">
      <div class="symbol orange"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"><path d="M12 6v8M12 18h.01"/></svg></div>
      <span>${escapeHtml(w)}</span>
    </div>`).join('');
  $('meta').innerHTML = `
    ${reason ? `<div class="section-header">Recommendation</div>
      <div class="group"><div class="row stack recommend"><b><span class="star">★</span> ${escapeHtml(recName)}</b><span>${escapeHtml(reason)}</span></div></div>` : ''}
    ${warnings ? `<div class="section-header">Check Before Sending</div><div class="group">${warnings}</div>` : ''}`;

  const results = $('results');
  results.hidden = false;
  autosize($('body-input'));
  results.querySelectorAll('.group, .segmented, .actions').forEach((el) => {
    el.classList.remove('appear');
    void el.offsetWidth;
    el.classList.add('appear');
  });
}

function selectVariant(i) {
  active = i;
  const v = variants[i];
  if (!v) return;

  const seg = $('segmented');
  seg.querySelector('.thumb').style.transform = `translateX(${i * 100}%)`;
  seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(Number(b.dataset.i) === i)));

  $('draft-card').innerHTML = `
    <div class="row stack">
      <span class="row-caption">Subject</span>
      <input class="draft-subject" id="subject-input" />
    </div>
    <div class="row stack">
      <span class="row-caption">Message</span>
      <textarea class="draft-body" id="body-input"></textarea>
      <div class="draft-footer" style="padding:6px 0 2px"><span></span><span class="pill" id="word-count"></span></div>
    </div>`;
  const subject = $('subject-input');
  const body = $('body-input');
  subject.value = v.subject || '';
  body.value = v.body || '';
  subject.addEventListener('input', () => { v.subject = subject.value; });
  body.addEventListener('input', () => { v.body = body.value; autosize(body); updateCount(); });
  autosize(body);
  updateCount();
}

function updateCount() {
  const words = (variants[active]?.body || '').trim().split(/\s+/).filter(Boolean).length;
  const pill = $('word-count');
  pill.textContent = `${words} / ${WORD_LIMIT} words`;
  pill.classList.toggle('over', words > WORD_LIMIT);
}

function autosize(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

async function copy(text, button) {
  await navigator.clipboard.writeText(text);
  const label = button.textContent;
  button.textContent = '✓ Copied';
  button.classList.add('done');
  setTimeout(() => { button.textContent = label; button.classList.remove('done'); }, 1400);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const openSettings = (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); };
$('open-settings').addEventListener('click', openSettings);
$('open-settings-2').addEventListener('click', openSettings);
$('refresh-playbooks').addEventListener('click', () => loadPlaybooks(true));
$('draft').addEventListener('click', draft);
$('copy-body').addEventListener('click', (e) => copy(variants[active]?.body || '', e.currentTarget));
$('copy-subject').addEventListener('click', (e) => copy(variants[active]?.subject || '', e.currentTarget));
window.addEventListener('scroll', () => $('navbar').classList.toggle('scrolled', window.scrollY > 4), { passive: true });

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'sync') return;
  if (await loadSettings()) loadPlaybooks(!!(changes.notionToken || changes.titleFilter));
});

(async () => {
  if (await loadSettings()) loadPlaybooks();
  else $('playbook').innerHTML = '<option value="">Not set up</option>';
})();
