import { chatStream } from './ollama';
import { getOllamaConfig } from './storage';
import { getSystemPrompt } from './system-prompt';
import { dispatchTool } from './tools/registry';
import type { Message, PortMessage } from '../types';

export const TOOL_SYSTEM_PROMPT = `
## Tools Available
You have real-time web access via tool dispatch. When you need information from a URL or any external source, emit a tool call on its own line — never say you cannot access URLs or external resources:
{"tool":"<name>","args":{...}}
Stop generating. A result will be appended as a user message. Then continue.
Available tools (use exact argument keys):
- wikipedia  → {"tool":"wikipedia","args":{"title":"<article title>"}}
- news_feed  → {"tool":"news_feed","args":{"topic":"<topic>"}}
- fetch_url  → {"tool":"fetch_url","args":{"url":"<full URL>"}}
Only call one tool per turn. Never fabricate tool results.
`.trim();

export function detectToolCall(
  line: string,
): { toolName: string; args: Record<string, string> } | null {
  if (!line.trimStart().startsWith('{')) return null;
  try {
    const parsed = JSON.parse(line) as unknown;
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as Record<string, unknown>)['tool'] !== 'string'
    )
      return null;
    const { tool, args } = parsed as { tool: string; args: Record<string, string> };
    return { toolName: tool, args: args ?? {} };
  } catch {
    return null;
  }
}

/**
 * Runs one chat turn: stream, dispatch any tool call, repeat until the model
 * answers without one.
 */
async function runChat(
  msg: Extract<Message, { type: 'CHAT_START' }>,
  signal: AbortSignal,
  post: (msg: PortMessage) => void,
): Promise<void> {
  const ollamaConfig = await getOllamaConfig();
  const config = { ...ollamaConfig, model: msg.model ?? ollamaConfig.model };

  const systemPrompt = `${TOOL_SYSTEM_PROMPT}\n\n${await getSystemPrompt()}`;
  const messages = [...msg.messages];
  const MAX_ITERATIONS = 8;

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    if (signal.aborted) return;

    let accumulated = '';
    let streamDone = false;

    await chatStream(config, messages, systemPrompt, {
      signal,
      onToken: (value) => {
        accumulated += value;
        post({ type: 'token', value });
      },
      onThinking: (value) => post({ type: 'thinking', value }),
      onDone: () => {
        streamDone = true;
      },
      onError: (error) => {
        post({ type: 'error', error });
      },
    });

    if (signal.aborted) return;

    let detectedTool: ReturnType<typeof detectToolCall> = null;
    for (const line of accumulated.split('\n')) {
      detectedTool = detectToolCall(line.trim());
      if (detectedTool) break;
    }

    if (!detectedTool) {
      if (streamDone) post({ type: 'done' });
      return;
    }

    post({ type: 'tool-call', toolName: detectedTool.toolName, args: detectedTool.args });

    const result = await dispatchTool(detectedTool.toolName, detectedTool.args);

    post({ type: 'tool-result', toolName: detectedTool.toolName, result });

    messages.push(
      {
        role: 'assistant',
        content: `{"tool":"${detectedTool.toolName}","args":${JSON.stringify(detectedTool.args)}}`,
      },
      {
        role: 'user',
        content: `[Tool: ${detectedTool.toolName}]\nResult:\n${result}`,
      },
    );
  }

  post({ type: 'done' });
}

export function handleChatPort(port: chrome.runtime.Port): void {
  let controller: AbortController | null = null;

  // The side panel can close mid-stream, and posting to a closed port throws.
  // The run is over at that point, so swallow it rather than take down the
  // listener with an unhandled rejection.
  const post = (msg: PortMessage): void => {
    try {
      port.postMessage(msg);
    } catch {
      controller?.abort();
    }
  };

  port.onMessage.addListener(async (msg: Message) => {
    if (msg.type === 'CHAT_START') {
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      try {
        await runChat(msg, signal, post);
      } catch (err) {
        // Anything thrown in here — a storage read, a tool that rejects — used
        // to leave the panel streaming forever with no reply and no error.
        if (signal.aborted) return;
        post({ type: 'error', error: err instanceof Error ? err.message : String(err) });
      }
    } else if (msg.type === 'CHAT_STOP') {
      controller?.abort();
      post({ type: 'done' });
    }
  });

  port.onDisconnect.addListener(() => controller?.abort());
}
