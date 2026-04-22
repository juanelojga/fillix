import DOMPurify from 'dompurify';
import { marked } from 'marked';

marked.use({ breaks: true, gfm: true, async: false });

function preprocessMarkdown(raw: string): string {
  // GFM tables require a blank line before the first pipe row.
  // LLMs often omit it when a table immediately follows a heading or paragraph.
  return raw.replace(/([^\n])\n(\|)/g, '$1\n\n$2');
}

export function renderMarkdown(raw: string): string {
  const html = marked.parse(preprocessMarkdown(raw)) as string;
  return DOMPurify.sanitize(html);
}
