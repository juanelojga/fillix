import type { ObsidianConfig } from '../types';

function baseUrl(config: ObsidianConfig): string {
  return `http://${config.host}:${config.port}`;
}

function headers(config: ObsidianConfig): Record<string, string> {
  if (!/^[\x20-\x7E]+$/.test(config.apiKey)) {
    throw new Error(
      'API key contains invalid characters. Re-enter it directly from Obsidian Settings → Local REST API.',
    );
  }
  return { Authorization: `Bearer ${config.apiKey}` };
}

export async function testConnection(config: ObsidianConfig): Promise<void> {
  const res = await fetch(`${baseUrl(config)}/`, {
    headers: headers(config),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Obsidian API returned ${res.status}`);
  const data = (await res.json()) as { authenticated?: boolean };
  if (data.authenticated !== true) {
    throw new Error('Invalid API key — Obsidian returned authenticated: false');
  }
}

export async function listFiles(config: ObsidianConfig): Promise<string[]> {
  const res = await fetch(`${baseUrl(config)}/vault/`, {
    headers: headers(config),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Obsidian /vault/ returned ${res.status}`);
  const data: unknown = await res.json();
  if (
    typeof data !== 'object' ||
    data === null ||
    !Array.isArray((data as { files?: unknown }).files)
  ) {
    throw new Error('Obsidian /vault/ returned unexpected shape');
  }
  return (data as { files: unknown[] }).files.filter(
    (f): f is string => typeof f === 'string' && f.endsWith('.md'),
  );
}

export async function getFile(config: ObsidianConfig, path: string): Promise<string> {
  const res = await fetch(`${baseUrl(config)}/vault/${encodeURIComponent(path)}`, {
    headers: { ...headers(config), Accept: 'text/markdown' },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Obsidian /vault/${path} returned ${res.status}`);
  return res.text();
}

export async function writeFile(
  config: ObsidianConfig,
  path: string,
  content: string,
): Promise<void> {
  const res = await fetch(`${baseUrl(config)}/vault/${encodeURIComponent(path)}`, {
    method: 'PUT',
    headers: { ...headers(config), 'Content-Type': 'text/markdown' },
    body: content,
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Obsidian PUT /vault/${path} returned ${res.status}`);
}

export async function appendToFile(
  config: ObsidianConfig,
  path: string,
  newContent: string,
): Promise<void> {
  const getRes = await fetch(`${baseUrl(config)}/vault/${encodeURIComponent(path)}`, {
    headers: { ...headers(config), Accept: 'text/markdown' },
    signal: AbortSignal.timeout(5000),
  });
  const existing = getRes.ok ? await getRes.text() : '';
  const combined = existing ? `${existing}\n\n${newContent}` : newContent;
  await writeFile(config, path, combined);
}

const TRUNCATE_LIMIT_CHARS = 8000;

export function truncateDocument(content: string): string {
  if (content.length <= TRUNCATE_LIMIT_CHARS) return content;
  return (
    content.slice(0, TRUNCATE_LIMIT_CHARS) +
    `\n\n[Document truncated at ${TRUNCATE_LIMIT_CHARS} characters]`
  );
}
