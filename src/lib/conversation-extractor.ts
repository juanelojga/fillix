import type { ConversationMessage } from '../types';

export function detectPlatform(): string | null {
  const { hostname } = window.location;
  if (hostname === 'web.whatsapp.com') return 'whatsapp';
  if (hostname === 'www.linkedin.com' || hostname === 'linkedin.com') return 'linkedin';
  return null;
}

function extractWhatsapp(): ConversationMessage[] {
  const elements = Array.from(
    document.querySelectorAll<HTMLElement>('div.message-out, div.message-in'),
  );
  const messages: ConversationMessage[] = [];
  for (const el of elements) {
    const text = el.querySelector('.copyable-text')?.textContent?.trim() ?? '';
    if (!text) continue;
    messages.push({ sender: el.classList.contains('message-out') ? 'me' : 'them', text });
  }
  return messages.slice(-20);
}

function extractLinkedIn(): ConversationMessage[] {
  const elements = Array.from(document.querySelectorAll<HTMLElement>('.msg-s-event-listitem'));
  const messages: ConversationMessage[] = [];
  for (const el of elements) {
    const text = el.querySelector('.msg-s-event-listitem__body')?.textContent?.trim() ?? '';
    if (!text) continue;
    messages.push({ sender: el.closest('.msg-s-message-group--from-me') ? 'me' : 'them', text });
  }
  return messages.slice(-20);
}

export function extractConversation(): ConversationMessage[] {
  try {
    const platform = detectPlatform();
    if (platform === 'whatsapp') return extractWhatsapp();
    if (platform === 'linkedin') return extractLinkedIn();
    return [];
  } catch {
    return [];
  }
}
