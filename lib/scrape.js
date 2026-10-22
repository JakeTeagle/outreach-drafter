// Runs inside the LinkedIn tab via chrome.scripting.executeScript.
// Recruiter's class names change often, so rather than parse fields we grab the
// visible text of the profile container and let Claude do the structuring.
// Must be self-contained: it is serialised and injected into the page.
export async function scrapeProfile() {
  const selectors = [
    '[data-test-profile-container]',
    '.profile__main-container',
    '[data-live-test-profile-container]',
    'section.profile',
    '.artdeco-modal [role="main"]',
    'main',
  ];

  let root = null;
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && el.innerText.trim().length > 300) {
      root = el;
      break;
    }
  }
  if (!root) root = document.body;

  // Expand "see more" truncations so we capture full descriptions.
  let expanded = 0;
  root.querySelectorAll('button').forEach((b) => {
    const t = (b.innerText || '').trim().toLowerCase();
    if (t === 'see more' || t === '…see more' || t === 'show more') {
      try { b.click(); expanded++; } catch (_) {}
    }
  });
  if (expanded) await new Promise((r) => setTimeout(r, 500));

  const heading = root.querySelector('h1, [data-test-row-lockup-full-name]');
  const text = root.innerText
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  return {
    url: location.href,
    name: heading ? heading.innerText.trim() : '',
    text: text.slice(0, 30000),
  };
}
