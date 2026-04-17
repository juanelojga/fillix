import DOMPurify from 'dompurify';
import { marked } from 'marked';

marked.use({ breaks: true, gfm: true, async: false });

export function renderMarkdown(raw: string): string {
  const html = marked.parse(raw) as string;
  return DOMPurify.sanitize(html);
}
