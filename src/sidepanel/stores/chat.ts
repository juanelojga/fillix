import { writable } from 'svelte/store';
import type { ChatMessage } from '../../types';

export type StreamingState = 'idle' | 'streaming';

export interface ActiveMessage {
  content: string;
  thinking: string;
  toolCalls: { toolName: string; args: Record<string, string>; result: string | null }[];
}

export const messages = writable<ChatMessage[]>([]);
export const streamingState = writable<StreamingState>('idle');
export const activeMessage = writable<ActiveMessage | null>(null);
