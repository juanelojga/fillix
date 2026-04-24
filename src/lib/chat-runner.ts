import { resolveProvider } from './providers/index';
import { getProviderConfig, getObsidianConfig, getSearchConfig } from './storage';
import { dispatchTool } from './tools/registry';
import { redact } from './agent-log';
import type { Message, PortMessage } from '../types';

const DEFAULT_BEAUTIFIER_PROMPT =
  `You are a formatting assistant. Rewrite the text below to be clean, concise, ` +
  `and well-structured. Fix heading hierarchy, unify list styles, break up ` +
  `wall-of-text paragraphs, and remove filler phrases. Preserve all factual ` +
  `content and code blocks exactly. Return only the rewritten text — no ` +
  `explanations, no preamble.`;

export const TOOL_SYSTEM_PROMPT = `
## Tools Available
You have real-time web access via tool dispatch. When you need information from a URL or any external source, emit a tool call on its own line — never say you cannot access URLs or external resources:
{"tool":"<name>","args":{...}}
Stop generating. A result will be appended as a user message. Then continue.
Available tools (use exact argument keys):
- web_search → {"tool":"web_search","args":{"query":"<search terms>"}}
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

function sanitizeError(error: string, apiKey: string): string {
  if (!apiKey) return error;
  return error.split(apiKey).join('[REDACTED]');
}

export function handleChatPort(port: chrome.runtime.Port): void {
  let controller: AbortController | null = null;

  port.onMessage.addListener(async (msg: Message) => {
    if (msg.type === 'CHAT_START') {
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;

      const providerConfig = await getProviderConfig();
      const searchConfig = await getSearchConfig();
      const effectiveModel = msg.model ?? providerConfig.model;
      const provider = resolveProvider({ ...providerConfig, model: effectiveModel });

      const systemPrompt = `${TOOL_SYSTEM_PROMPT}\n\n${msg.systemPrompt}`;
      const messages = [...msg.messages];
      const MAX_ITERATIONS = 8;

      for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
        if (signal.aborted) return;

        let accumulated = '';
        let streamDone = false;

        await provider.chatStream(messages, systemPrompt, {
          signal,
          onToken: (value) => {
            accumulated += value;
            port.postMessage({ type: 'token', value } satisfies PortMessage);
          },
          onThinking: (value) =>
            port.postMessage({ type: 'thinking', value } satisfies PortMessage),
          onDone: () => {
            streamDone = true;
          },
          onError: (error) => {
            const sanitized = sanitizeError(error, providerConfig.apiKey ?? '');
            port.postMessage({ type: 'error', error: sanitized } satisfies PortMessage);
          },
        });

        if (signal.aborted) return;

        let detectedTool: ReturnType<typeof detectToolCall> = null;
        for (const line of accumulated.split('\n')) {
          detectedTool = detectToolCall(line.trim());
          if (detectedTool) break;
        }

        if (!detectedTool) {
          if (streamDone) port.postMessage({ type: 'done' } satisfies PortMessage);
          return;
        }

        port.postMessage({
          type: 'tool-call',
          toolName: detectedTool.toolName,
          args: detectedTool.args,
        } satisfies PortMessage);

        const result = await dispatchTool(detectedTool.toolName, detectedTool.args, searchConfig);

        port.postMessage({
          type: 'tool-result',
          toolName: detectedTool.toolName,
          result,
        } satisfies PortMessage);

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

      port.postMessage({ type: 'done' } satisfies PortMessage);
    } else if (msg.type === 'CHAT_STOP') {
      controller?.abort();
      port.postMessage({ type: 'done' } satisfies PortMessage);
    } else if (msg.type === 'BEAUTIFY') {
      const beautifyController = new AbortController();
      const onPortDisconnect = () => beautifyController.abort();
      port.onDisconnect.addListener(onPortDisconnect);

      try {
        const obsidianConfig = await getObsidianConfig();
        let systemPrompt = DEFAULT_BEAUTIFIER_PROMPT;

        if (obsidianConfig.beautifierPromptPath) {
          const { host, port: obsPort, apiKey, beautifierPromptPath } = obsidianConfig;
          const url = `http://${host}:${obsPort}/vault/${encodeURIComponent(beautifierPromptPath)}`;
          const resp = await fetch(url, {
            headers: { Authorization: `Bearer ${apiKey}` },
            signal: AbortSignal.any([beautifyController.signal, AbortSignal.timeout(5000)]),
          });
          if (!resp.ok) {
            const reason = `Obsidian note unreachable (${resp.status})`;
            port.postMessage({ type: 'beautify-error', reason } satisfies PortMessage);
            return;
          }
          systemPrompt = await resp.text();
        }

        const provider = resolveProvider(msg.providerConfig);
        let accumulated = '';
        await new Promise<void>((resolve, reject) => {
          provider.chatStream([{ role: 'user', content: msg.content }], systemPrompt, {
            signal: beautifyController.signal,
            onToken: (token) => {
              accumulated += token;
            },
            onDone: resolve,
            onError: (error) => reject(new Error(error)),
          });
        });
        port.postMessage({ type: 'beautified', content: accumulated } satisfies PortMessage);
      } catch (err) {
        const reason = redact(err instanceof Error ? err.message : String(err));
        port.postMessage({ type: 'beautify-error', reason } satisfies PortMessage);
      } finally {
        port.onDisconnect.removeListener(onPortDisconnect);
      }
    }
  });

  port.onDisconnect.addListener(() => controller?.abort());
}
