const NOTION_VERSION = '2022-06-28';
const MAX_PLAYBOOK_CHARS = 40000;

// OAuth: for workspaces where members can't create internal (API token) connections.
// Redirect URI to register on the Notion connection: chrome.identity.getRedirectURL().
async function exchangeToken(clientId, clientSecret, body) {
  const res = await fetch('https://api.notion.com/v1/oauth/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Notion sign-in failed: ${data.error_description || data.message || res.status}`);
  return data;
}

export async function connectNotion(clientId, clientSecret) {
  const redirectUri = chrome.identity.getRedirectURL();
  const state = crypto.randomUUID();
  const authUrl = 'https://api.notion.com/v1/oauth/authorize?' + new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    owner: 'user',
    redirect_uri: redirectUri,
    state,
  });

  const returned = new URL(await chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }));
  if (returned.searchParams.get('error')) throw new Error(`Notion sign-in: ${returned.searchParams.get('error')}`);
  if (returned.searchParams.get('state') !== state) throw new Error('Notion sign-in: state mismatch, try again.');

  const data = await exchangeToken(clientId, clientSecret, {
    grant_type: 'authorization_code',
    code: returned.searchParams.get('code'),
    redirect_uri: redirectUri,
  });
  await chrome.storage.sync.set({
    notionToken: data.access_token,
    notionRefreshToken: data.refresh_token || '',
    notionWorkspace: data.workspace_name || 'Notion',
  });
  return data.workspace_name;
}

async function refreshToken() {
  const s = await chrome.storage.sync.get(['notionClientId', 'notionClientSecret', 'notionRefreshToken']);
  if (!s.notionRefreshToken || !s.notionClientId || !s.notionClientSecret) return null;
  const data = await exchangeToken(s.notionClientId, s.notionClientSecret, {
    grant_type: 'refresh_token',
    refresh_token: s.notionRefreshToken,
  });
  await chrome.storage.sync.set({
    notionToken: data.access_token,
    notionRefreshToken: data.refresh_token || s.notionRefreshToken,
  });
  return data.access_token;
}

async function notion(token, path, { method = 'GET', body } = {}, retried = false) {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && !retried) {
    const fresh = await refreshToken().catch(() => null);
    if (fresh) return notion(fresh, path, { method, body }, true);
    throw new Error('Notion access expired. Reconnect in Settings.');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Notion ${res.status}: ${err.message || res.statusText}`);
  }
  return res.json();
}

function pageTitle(page) {
  const prop = Object.values(page.properties || {}).find((p) => p.type === 'title');
  return prop ? prop.title.map((t) => t.plain_text).join('') : 'Untitled';
}

// Lists every page shared with the integration whose title matches the filter.
export async function listPlaybooks(token, titleFilter = 'playbook') {
  const results = [];
  let cursor;
  do {
    const data = await notion(token, '/search', {
      method: 'POST',
      body: {
        query: titleFilter,
        filter: { property: 'object', value: 'page' },
        sort: { direction: 'descending', timestamp: 'last_edited_time' },
        page_size: 100,
        start_cursor: cursor,
      },
    });
    results.push(...data.results);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);

  const needle = titleFilter.toLowerCase();
  return results
    .map((p) => ({ id: p.id, title: pageTitle(p), url: p.url, edited: p.last_edited_time }))
    .filter((p) => p.title.toLowerCase().includes(needle))
    .sort((a, b) => a.title.localeCompare(b.title));
}

function richText(rt = []) {
  return rt.map((t) => t.plain_text).join('');
}

function blockToText(block) {
  const b = block[block.type] || {};
  switch (block.type) {
    case 'heading_1': return `\n# ${richText(b.rich_text)}`;
    case 'heading_2': return `\n## ${richText(b.rich_text)}`;
    case 'heading_3': return `\n### ${richText(b.rich_text)}`;
    case 'bulleted_list_item': return `- ${richText(b.rich_text)}`;
    case 'numbered_list_item': return `1. ${richText(b.rich_text)}`;
    case 'to_do': return `[${b.checked ? 'x' : ' '}] ${richText(b.rich_text)}`;
    case 'quote': return `> ${richText(b.rich_text)}`;
    case 'code': return richText(b.rich_text);
    case 'table_row': return `| ${b.cells.map(richText).join(' | ')} |`;
    case 'paragraph':
    case 'toggle':
    case 'callout':
      return richText(b.rich_text);
    default:
      return '';
  }
}

async function collectBlocks(token, blockId, depth, out) {
  let cursor;
  do {
    const qs = new URLSearchParams({ page_size: '100' });
    if (cursor) qs.set('start_cursor', cursor);
    const data = await notion(token, `/blocks/${blockId}/children?${qs}`);
    for (const block of data.results) {
      const line = blockToText(block);
      if (line) out.push('  '.repeat(depth) + line);
      // Don't descend into sub-pages; each playbook should stand on its own.
      const nested = block.has_children && !['child_page', 'child_database'].includes(block.type);
      if (nested && depth < 3) await collectBlocks(token, block.id, depth + 1, out);
      if (out.join('\n').length > MAX_PLAYBOOK_CHARS) return;
    }
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
}

export async function fetchPlaybookText(token, pageId) {
  const out = [];
  await collectBlocks(token, pageId, 0, out);
  return out.join('\n').slice(0, MAX_PLAYBOOK_CHARS);
}
