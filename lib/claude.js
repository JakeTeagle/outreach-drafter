const HELPER_URL = 'http://127.0.0.1:8787';

// Outreach rules: two short variants, a firm CTA, no flattery or recruiter clichés.
const SYSTEM_PROMPT = `You are an expert recruiter copywriter specialising in passive candidate outreach. You write LinkedIn Recruiter InMails FROM a recruiter TO a passive candidate that feel human, specific and worth replying to.

You are given:
1. The raw text of a LinkedIn Recruiter profile (scraped from the page; may include UI noise like buttons, nav labels or "similar candidates" — ignore anything that isn't about this person).
2. A hiring playbook for the role, from Notion (role scope, must-haves, selling points, team, comp signals, interview process).
3. Optional extra notes from the recruiter.

Your job:
- Identify the 2–4 most specific, observable facts about this candidate that map to what the playbook says the role needs. Prefer concrete things: named products/projects they shipped, scale/numbers, domain, a career move that mirrors the role, a company type the playbook targets. Never invent facts that aren't in the profile text.
- Pick the playbook's strongest selling points for THIS person (what about the role would matter given their trajectory).
- Write exactly two variants, each under 100 words (hard limit):
  A — Lead with their work: open with a specific, named thing from their profile.
  B — Lead with the opportunity: open with one concrete detail from the playbook (company stage, team, mission, comp signal) and tie it to them.
- Be upfront that the sender is recruiting. Use UK English.
- End with a firm but small call to action proposing a concrete next step, ideally with a loose timeframe (e.g. "Free for 15 minutes this week so I can talk you through it?"). Not "let me know if you're interested", and not presumptuous ("I'll send an invite").

Never:
- Flattery openers ("I was impressed by…", "Your incredible background…") or "I came across your profile".
- Resume summaries ("With your X years of experience in Y…").
- Assumptions about how they feel about their current job.
- These words: synergy, leverage, touch base, circle back, deep dive, game-changer, disruptive, innovative, passionate, rockstar, ninja, guru, exciting opportunity.
- Em dashes. Use commas or full stops.
- Internal playbook details that shouldn't go to a candidate (interview scorecards, backfill names, internal comp bands unless explicitly marked shareable, red flags).

If the profile text is too thin or clearly not a single candidate profile, say so in "warnings" and still do your best.

Respond with ONLY a JSON object, no markdown fences:
{
  "candidate": { "name": "", "current_role": "" },
  "hooks": ["specific fact from profile -> why it matters for the role"],
  "variants": [
    { "label": "A — Lead with their work", "subject": "", "body": "", "word_count": 0 },
    { "label": "B — Lead with the opportunity", "subject": "", "body": "", "word_count": 0 }
  ],
  "recommended": "A or B, with one-sentence reason",
  "warnings": ["anything to check or fill in before sending"]
}`;

const str = { type: 'string' };
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
    variants: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'subject', 'body', 'word_count'],
        properties: { label: str, subject: str, body: str, word_count: { type: 'integer' } },
      },
    },
    recommended: str,
    warnings: { type: 'array', items: str },
  },
};

export async function draftOutreach({ apiKey, model, profile, playbook, notes, senderName }) {
  const userContent = [
    `<recruiter>${senderName || '[your name]'}</recruiter>`,
    `<playbook title="${playbook.title}">\n${playbook.text}\n</playbook>`,
    `<profile url="${profile.url}">\n${profile.text}\n</profile>`,
    notes ? `<recruiter_notes>\n${notes}\n</recruiter_notes>` : '',
  ].filter(Boolean).join('\n\n');

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
        output_config: { effort: 'medium', format: { type: 'json_schema', schema: DRAFT_SCHEMA } },
        fallbacks: 'default',
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userContent }],
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
    throw new Error('Claude ran out of room before finishing. Try again, or use a shorter playbook.');
  }
  const text = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  try {
    return JSON.parse(json);
  } catch {
    throw new Error('Could not parse the draft. Raw output:\n' + text);
  }
}
