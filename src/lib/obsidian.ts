import type { ObsidianConfig } from '../types';

function baseUrl(config: ObsidianConfig): string {
  return `http://${config.host}:${config.port}`;
}

function headers(config: ObsidianConfig): Record<string, string> {
  return { Authorization: `Bearer ${config.apiKey}` };
}

export async function testConnection(config: ObsidianConfig): Promise<void> {
  const res = await fetch(`${baseUrl(config)}/`, {
    headers: headers(config),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Obsidian API returned ${res.status}`);
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
