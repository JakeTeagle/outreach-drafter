import { listPlaybooks, fetchPlaybookText } from './lib/notion.js';
import { draftOutreach } from './lib/claude.js';
import { scrapeProfile } from './lib/scrape.js';
import { listJobs, matchJob } from './lib/ashby.js';
import { LENGTHS } from './lib/style.js';

const $ = (id) => document.getElementById(id);
const DEFAULTS = { model: 'claude-opus-5-5', titleFilter: 'playbook', ashbyBoard: 'v7labs.com' };
const INMAIL_CHAR_LIMIT = 1900;
const LENGTH_HINTS = {
  short: 'Up to about 100 words. Best for a first InMail.',
  medium: 'Up to 750 characters, with a link to the job advert.',
  long: 'Up to 1,100 characters, with a link to the job advert.',
};

let settings = {};
let variants = [];
let active = 0;
let limit = LENGTHS.short;
let length = 'short';
let jobs = [];

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
  pickJobForPlaybook();
}

function setLength(next, save = true) {
  length = LENGTHS[next] ? next : 'short';
  const keys = Object.keys(LENGTHS);
  const seg = $('length');
  seg.querySelector('.thumb').style.transform = `translateX(${keys.indexOf(length) * 100}%)`;
  seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.length === length)));
  $('length-hint').textContent = LENGTH_HINTS[length];
  $('job-section').hidden = length === 'short';
  if (length !== 'short' && !jobs.length) loadJobs();
  if (save) chrome.storage.local.set({ lastLength: length });
}

async function loadJobs(force = false) {
  const select = $('job');
  try {
    jobs = await listJobs(settings.ashbyBoard, { force });
  } catch (e) {
    jobs = [];
    setStatus(e.message, { error: true });
  }
  select.innerHTML = '<option value="">No link</option>' +
    jobs.map((j) => `<option value="${j.id}">${escapeHtml(j.title)}${j.location ? ` · ${escapeHtml(j.location)}` : ''}</option>`).join('');
  pickJobForPlaybook();
}

function pickJobForPlaybook() {
  const option = $('playbook').selectedOptions[0];
  if (!option?.value || !jobs.length) return;
  $('job').value = matchJob(option.textContent, jobs)?.id || '';
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
      length,
      job: jobs.find((j) => j.id === $('job').value),
      onStatus: (msg) => setStatus(msg, { busy: true }),
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
  limit = r.limit || LENGTHS.short;
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
      <div class="draft-footer" style="padding:6px 0 2px"><span></span><span style="display:flex;gap:6px"><span class="pill" id="char-count"></span><span class="pill" id="word-count"></span></span></div>
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
  const body = variants[active]?.body || '';
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  const chars = body.length;
  const byWords = limit.unit === 'words';
  const wordPill = $('word-count');
  const charPill = $('char-count');
  wordPill.textContent = byWords ? `${words} / ${limit.limit} words` : `${words} words`;
  charPill.textContent = byWords ? `${chars.toLocaleString()} chars` : `${chars.toLocaleString()} / ${limit.limit.toLocaleString()} chars`;
  wordPill.classList.toggle('over', byWords && words > limit.limit * 1.1);
  charPill.classList.toggle('over', chars > (byWords ? INMAIL_CHAR_LIMIT : limit.limit * 1.1));
  charPill.title = chars > INMAIL_CHAR_LIMIT ? `Longer than LinkedIn's InMail limit of about ${INMAIL_CHAR_LIMIT.toLocaleString()} characters` : '';
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
$('refresh-playbooks').addEventListener('click', () => { loadPlaybooks(true); if (length !== 'short') loadJobs(true); });
$('draft').addEventListener('click', draft);
$('playbook').addEventListener('change', pickJobForPlaybook);
$('length').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => setLength(b.dataset.length)));
$('copy-body').addEventListener('click', (e) => copy(variants[active]?.body || '', e.currentTarget));
$('copy-subject').addEventListener('click', (e) => copy(variants[active]?.subject || '', e.currentTarget));
window.addEventListener('scroll', () => $('navbar').classList.toggle('scrolled', window.scrollY > 4), { passive: true });

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'sync') return;
  if (await loadSettings()) loadPlaybooks(!!(changes.notionToken || changes.titleFilter));
  if (changes.ashbyBoard) { jobs = []; if (length !== 'short') loadJobs(true); }
});

(async () => {
  const ready = await loadSettings();
  const { lastLength } = await chrome.storage.local.get('lastLength');
  setLength(lastLength || 'short', false);
  if (ready) loadPlaybooks();
  else $('playbook').innerHTML = '<option value="">Not set up</option>';
})();
