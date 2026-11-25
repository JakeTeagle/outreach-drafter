// Public job adverts from an Ashby job board (jobs.ashbyhq.com/<board>). No key needed.
const CACHE_MS = 60 * 60 * 1000;
const MAX_ADVERT_CHARS = 8000;

export async function listJobs(board, { force = false } = {}) {
  if (!board) return [];
  const { ashbyCache } = await chrome.storage.local.get('ashbyCache');
  if (!force && ashbyCache?.board === board && Date.now() - ashbyCache.at < CACHE_MS) return ashbyCache.jobs;

  const res = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board)}`);
  if (!res.ok) throw new Error(`Couldn't load job adverts from Ashby (${res.status}). Check the job board name in Settings.`);
  const data = await res.json();
  const jobs = (data.jobs || [])
    .filter((j) => j.isListed !== false)
    .map((j) => ({
      id: j.id,
      title: j.title.trim(),
      location: j.location || '',
      url: j.jobUrl,
      description: (j.descriptionPlain || '').slice(0, MAX_ADVERT_CHARS),
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
  await chrome.storage.local.set({ ashbyCache: { board, at: Date.now(), jobs } });
  return jobs;
}

const STOP = new Set(['hiring', 'playbook', 'the', 'and', 'of', 'for', 'senior', 'staff', 'lead', 'principal', 'junior', 'go']);
const words = (s) => s.toLowerCase().split(/[^a-z]+/)
  .filter((w) => w.length > 1 && !STOP.has(w))
  .map((w) => w.replace(/s$/, ''));

// Best job for a playbook title by shared words, e.g. "Backend Engineers" -> "Product Engineer (Backend)".
export function matchJob(playbookTitle, jobs) {
  const want = new Set(words(playbookTitle));
  let best = null;
  let bestScore = 0;
  for (const job of jobs) {
    const have = words(job.title);
    const shared = have.filter((w) => want.has(w)).length;
    const score = shared / Math.max(want.size, have.length, 1);
    if (score > bestScore) { best = job; bestScore = score; }
  }
  return bestScore >= 0.5 ? best : null;
}
