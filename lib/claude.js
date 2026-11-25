import { LENGTHS, lint, tidy } from './style.js';

const HELPER_URL = 'http://127.0.0.1:8787';

const LENGTH_GUIDE = {
  short: 'Up to about 100 words. Two to four short paragraphs. No job link.',
  medium: 'Up to 750 characters in the body, counting spaces, line breaks and the job link (roughly 100 to 110 words). Three or four short paragraphs. Include the job advert link.',
  long: 'Up to 1,100 characters in the body, counting spaces, line breaks and the job link (roughly 150 to 160 words). Four or five short paragraphs. Include the job advert link.',
};

const WRITING_RULES = `How to write:
- Write like one person typing to another. Plain, warm, direct. Vary sentence length. Use UK English.
- Be upfront that the sender is recruiting.
- End with a firm but small call to action proposing a concrete next step, ideally with a loose timeframe (e.g. "Free for 15 minutes this week so I can talk you through it?"). Not "let me know if you're interested", and not presumptuous ("I'll send an invite").

Formatting (the body is plain text pasted into LinkedIn, so no markdown):
- Line 1 is the greeting on its own, e.g. "Hi Priya,". Then a blank line.
- Paragraphs are one to three sentences, separated by exactly one blank line ("\\n\\n" in the JSON string). Never run two paragraphs together.
- One space after a full stop. No double spaces.
- The sign-off is the recruiter's first name on its own line, after a blank line.
- No bold, headings, emojis or hashtags.

Never:
- Em dashes (—) or en dashes (–), anywhere, including the subject line. Use a comma, a full stop or brackets. Write number ranges as "10 to 20".
- Contrast framing of any kind: "It's not X, it's Y", "This isn't about X, it's about Y", "Not just X, but Y", "Less X, more Y", "X? Not quite.", "Not X. Y.". Say the positive thing directly.
- Other tells of AI writing: rhetorical-question openers ("Ever wondered…?"), "Imagine…", "Here's the thing", "Let's be honest", "The best part?", colon reveals, padded lists of three adjectives, exclamation marks, and the words delve, tapestry, landscape, realm, elevate, unlock, harness, seamless, robust, cutting-edge, world-class, thrilled, journey, resonate, navigate.
- Recruiter clichés: "I hope this finds you well", "I wanted to reach out", "I came across your profile", flattery openers ("I was impressed by…"), résumé summaries ("With your X years of experience in Y…"), and the words synergy, leverage, touch base, circle back, deep dive, game-changer, disruptive, innovative, passionate, rockstar, ninja, guru, exciting opportunity.
- Assumptions about how they feel about their current job.
- Internal playbook details that shouldn't go to a candidate (interview scorecards, backfill names, internal comp bands unless explicitly marked shareable, red flags).`;

function systemPrompt(length, job) {
  const link = length === 'short'
    ? ''
    : job
      ? `\n- Include this exact job advert link once, on its own line, introduced naturally (e.g. "The full job description is here:"): ${job.url}`
      : '\n- No job advert was provided. Put the placeholder [job advert link] on its own line where the link should go, and add a warning saying so.';

  return `You are an expert recruiter copywriter specialising in passive candidate outreach. You write LinkedIn Recruiter InMails FROM a recruiter TO a passive candidate that feel human, specific and worth replying to.

You are given:
1. The raw text of a LinkedIn Recruiter profile (scraped from the page; it may include UI noise like buttons, nav labels or "similar candidates", so ignore anything that isn't about this person).
2. A hiring playbook for the role, from Notion (role scope, must-haves, selling points, team, comp signals, interview process).
3. Sometimes the public job advert for the role.
4. Optional extra notes from the recruiter.

Your job:
- Identify the two to four most specific, observable facts about this candidate that map to what the playbook says the role needs. Prefer concrete things: named products or projects they shipped, scale and numbers, domain, a career move that mirrors the role, a company type the playbook targets. Never invent facts that aren't in the profile text.
- Pick the strongest selling points for THIS person (what about the role would matter given their trajectory).
- Write exactly two variants. Length for each: ${LENGTH_GUIDE[length]} Treat the limit as a ceiling, not a target, and count carefully.
  A: Lead with their work. Open with a specific, named thing from their profile.
  B: Lead with the opportunity. Open with one concrete detail about the role or company (stage, team, mission, comp signal) and tie it to them.${link}

${WRITING_RULES}

If the profile text is too thin or clearly not a single candidate profile, say so in "warnings" and still do your best.

Label the variants "A: Lead with their work" and "B: Lead with the opportunity". "recommended" starts with A or B, followed by a one-sentence reason.`;
}

const str = { type: 'string' };
const VARIANTS = {
  type: 'array',
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['label', 'subject', 'body'],
    properties: { label: str, subject: str, body: str },
  },
};
const DRAFT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['candidate', 'hooks', 'variants', 'recommended', 'warnings'],
  properties: {
    candidate: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'current_role'],
      properties: { name: str, current_role: str },
    },
    hooks: { type: 'array', items: str },
    variants: VARIANTS,
    recommended: str,
    warnings: { type: 'array', items: str },
  },
};
const REPAIR_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['variants'],
  properties: { variants: VARIANTS },
};

async function callClaude({ apiKey, model, system, content, schema, effort }) {
  // Goes via the local helper (helper/outreach_helper.py): some Anthropic orgs block direct browser calls.
  let res;
  try {
    res = await fetch(`${HELPER_URL}/v1/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'server-side-fallback-2026-07-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        // Opus 5.5 always thinks before answering, so leave room for both.
        max_tokens: 16000,
        output_config: { effort, format: { type: 'json_schema', schema } },
        fallbacks: 'default',
        system,
        messages: [{ role: 'user', content }],
      }),
    });
  } catch {
    throw new Error("The Outreach helper isn't running on this Mac. Double-click \"Start Helper\" in the extension's helper folder, then try again.");
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Claude ${res.status}: ${err.error?.message || res.statusText}`);
  }

  const data = await res.json();
  if (data.stop_reason === 'refusal') {
    throw new Error('Claude declined to draft this one. Try again, or adjust your notes.');
  }
  if (data.stop_reason === 'max_tokens') {
    throw new Error('Claude ran out of room before finishing. Try again, or pick a shorter length.');
  }
  const text = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  try {
    return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  } catch {
    throw new Error('Could not parse the draft. Raw output:\n' + text);
  }
}

const tidyAll = (variants) =>
  variants.map((v) => ({ ...v, subject: tidy(v.subject).replace(/\n+/g, ' '), body: tidy(v.body) }));

export async function draftOutreach({ apiKey, model, profile, playbook, notes, senderName, length = 'short', job, onStatus }) {
  const withJob = length !== 'short' && job ? job : null;
  const content = [
    `<recruiter>${senderName || '[your name]'}</recruiter>`,
    `<playbook title="${playbook.title}">\n${playbook.text}\n</playbook>`,
    withJob ? `<job_advert title="${withJob.title}" url="${withJob.url}">\n${withJob.description}\n</job_advert>` : '',
    `<profile url="${profile.url}">\n${profile.text}\n</profile>`,
    notes ? `<recruiter_notes>\n${notes}\n</recruiter_notes>` : '',
  ].filter(Boolean).join('\n\n');

  const system = systemPrompt(length, withJob);
  const result = await callClaude({ apiKey, model, system, content, schema: DRAFT_SCHEMA, effort: 'medium' });
  result.variants = tidyAll(result.variants || []);
  const noDashes = (s) => tidy(s).replace(/\n+/g, ' ');
  result.hooks = (result.hooks || []).map(noDashes);
  result.warnings = (result.warnings || []).map(noDashes);
  result.recommended = noDashes(result.recommended || '');

  // One rewrite pass for anything the tidy-up can't fix on its own (contrast framing, stock phrases, length).
  const check = (v) => lint(v, { length, jobUrl: withJob?.url });
  if (result.variants.some((v) => check(v).length)) {
    onStatus?.('Polishing the wording…');
    const problems = result.variants
      .map((v, i) => `Variant ${i + 1}:\n${(check(v).map((p) => `- ${p}`).join('\n')) || '- No problems.'}`)
      .join('\n\n');
    try {
      const fixed = await callClaude({
        apiKey,
        model,
        effort: 'low',
        schema: REPAIR_SCHEMA,
        system: `You edit recruiter InMails so they follow the house style below. Fix only the listed problems and keep everything else, including facts, structure, links and labels, as close to the original as you can.\n\n${WRITING_RULES}`,
        content: `Problems found:\n\n${problems}\n\nDrafts (JSON):\n${JSON.stringify({ variants: result.variants }, null, 2)}`,
      });
      if (fixed.variants?.length === result.variants.length) result.variants = tidyAll(fixed.variants);
    } catch {
      // Keep the first drafts; the remaining issues are listed as warnings below.
    }
    result.variants.forEach((v, i) => {
      check(v).forEach((p) => result.warnings.push(`${i === 0 ? 'Their Work' : 'The Role'}: ${p}`));
    });
  }

  result.length = length;
  result.limit = LENGTHS[length];
  return result;
}
