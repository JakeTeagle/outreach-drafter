// House style for drafts: fixes what can be fixed mechanically, flags what needs a rewrite.

export const LENGTHS = {
  short: { label: 'Short', limit: 100, unit: 'words' },
  medium: { label: 'Medium', limit: 750, unit: 'chars' },
  long: { label: 'Long', limit: 1100, unit: 'chars' },
};

// Phrases that read as machine-written or as recruiter boilerplate.
const BANNED = [
  'synergy', 'leverage', 'touch base', 'circle back', 'deep dive', 'game-changer', 'game changer',
  'disruptive', 'innovative', 'passionate', 'rockstar', 'ninja', 'guru', 'exciting opportunity',
  'delve', 'tapestry', 'landscape', 'realm', 'elevate', 'unlock', 'harness', 'seamless', 'robust',
  'cutting-edge', 'cutting edge', 'world-class', 'thrilled', 'journey', 'resonate', 'navigate',
  'in today\'s', 'fast-paced', 'i hope this finds you', 'i hope this message finds you',
  'i wanted to reach out', 'reaching out because', 'i came across your profile', 'look no further',
  'here\'s the thing', 'let\'s be honest', 'the best part', 'buckle up', 'imagine a',
  'ever wondered', 'what if i told you', 'without further ado', 'at the end of the day',
];

// "It's not X, it's Y" and its relatives.
const CONTRAST = [
  /\b(it'?s|it is|this is|that'?s|that is)\s+not\b[^.!?\n]{0,80}?[,;.:]\s*(it'?s|it is|this is|that'?s|but|instead)\b/i,
  /\b(it|this|that|they|we)\s+(isn'?t|aren'?t|is not|are not)\b[^.!?\n]{0,80}?[,;.:]\s*(it'?s|it is|this is|that'?s|they'?re|we'?re|but|instead)\b/i,
  /\bnot\s+(just|only|merely)\b[^.!?\n]{0,80}?\b(but|it'?s)\b/i,
  /\bless\s+(about\s+)?[\w-]+[^.!?\n]{0,40}?,\s*more\s+(about\s+)?/i,
];

const DASH_WORDS = /\s*[—–]\s*/g;   // em or en dash used as punctuation
const DASH_RANGE = /(\d)\s*[–—]\s*(\d)/g;

const wordCount = (s) => (s || '').trim().split(/\s+/).filter(Boolean).length;

export function tidy(text) {
  let t = (text || '').replace(/\r\n?/g, '\n');
  t = t.replace(DASH_RANGE, '$1 to $2').replace(DASH_WORDS, ', ').replace(/,\s*,/g, ',');
  t = t.replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1').replace(/^#+\s*/gm, '');
  t = t.replace(/[ \t]+/g, ' ').replace(/ +\n/g, '\n').replace(/\n /g, '\n');
  t = t.replace(/ ([,.!?;:])/g, '$1');
  t = t.replace(/\n{3,}/g, '\n\n').trim();

  // Paragraphs always get a blank line between them. Single line breaks are kept only
  // inside lists, before a link introduced with a colon, and in sign-offs like "Best,\nJake".
  const isList = (l) => /^\s*([-•*]|\d+[.)])\s/.test(l);
  const isUrl = (l) => /^\s*https?:\/\/\S+$/.test(l);
  const raw = t.split('\n');
  const lines = [];
  raw.forEach((line, i) => {
    const prev = raw[i - 1];
    if (i > 0 && line.trim() && prev.trim()) {
      const keep = (isList(line) && (isList(prev) || /:$/.test(prev.trim())))
        || (isUrl(line) && /:$/.test(prev.trim()))
        || (i > 1 && i === raw.length - 1 && /,$/.test(prev.trim())
            && line.trim().split(/\s+/).length <= 4 && !/[.?!]$/.test(line.trim()));
      if (!keep) lines.push('');
    }
    lines.push(line);
  });
  return lines.join('\n');
}

export function lint(variant, { length, jobUrl }) {
  const issues = [];
  const all = `${variant.subject}\n${variant.body}`;
  if (/[—–]/.test(all)) issues.push('Uses an em or en dash.');
  for (const re of CONTRAST) {
    const m = all.match(re);
    if (m) { issues.push(`Uses "it's not X, it's Y" style framing: "${m[0].trim()}"`); break; }
  }
  const lower = all.toLowerCase();
  const hits = BANNED.filter((p) => lower.includes(p));
  if (hits.length) issues.push(`Uses stock phrases: ${hits.map((h) => `"${h}"`).join(', ')}.`);
  if (/!/.test(variant.body)) issues.push('Uses an exclamation mark.');
  const { limit, unit } = LENGTHS[length];
  const size = unit === 'words' ? wordCount(variant.body) : variant.body.length;
  if (size > limit * 1.1) issues.push(`Too long: ${size} ${unit === 'words' ? 'words' : 'characters'}, aim for ${limit} or fewer.`);
  if (jobUrl && length !== 'short' && !variant.body.includes(jobUrl)) issues.push(`Missing the job advert link: ${jobUrl}`);
  const paragraphs = variant.body.split(/\n\s*\n/);
  if (paragraphs.some((p) => (p.match(/[.!?](\s|$)/g) || []).length > 4)) {
    issues.push('Has a paragraph with more than four sentences; break it up.');
  }
  return issues;
}
