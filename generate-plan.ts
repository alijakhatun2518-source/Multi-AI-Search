import { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY!,
  httpOptions: {
    headers: { 'User-Agent': 'aistudio-build' },
  },
});

function sanitize(text: string, key?: string): string {
  if (!text) return '';
  let sanitized = text;
  if (key && key.length > 5) {
    sanitized = sanitized.replaceAll(key, '***');
  }
  sanitized = sanitized.replace(/key=[a-zA-Z0-9_\-]+/gi, 'key=***');
  sanitized = sanitized.replace(/Bearer\s+[a-zA-Z0-9_\-]+/gi, 'Bearer ***');
  sanitized = sanitized.replace(/"(api_key|apiKey|key)":\s*"[^"]+"/gi, '"$1":"***"');
  return sanitized;
}

function extractReasoningAndContent(rawContent: string, rawReasoning?: string) {
  let reasoning = (rawReasoning || '').trim();
  let content = rawContent || '';

  const thinkMatch =
    content.match(/<think>([\s\S]*?)<\/think>/i) || content.match(/<thought>([\s\S]*?)<\/thought>/i);
  if (thinkMatch) {
    reasoning = (reasoning ? reasoning + '\n\n' : '') + thinkMatch[1].trim();
    content = content.replace(/<think>[\s\S]*?<\/think>/i, '').replace(/<thought>[\s\S]*?<\/thought>/i, '').trim();
  } else if (content.startsWith('<think>') || content.startsWith('<thought>')) {
    const tag = content.startsWith('<think>') ? '<think>' : '<thought>';
    reasoning = (reasoning ? reasoning + '\n' : '') + content.slice(tag.length).trim();
    content = '';
  }

  return { reasoning, content };
}

export const handler: Handler = async (event: HandlerEvent, _context: HandlerContext) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const {
    provider: rawProvider,
    messages,
    model,
    systemPrompt,
    apiKey,
    baseURL,
    maxTokens,
    reasoningEffort,
  } = JSON.parse(event.body || '{}');

  const provider = rawProvider === 'openai' ? 'chatgpt' : rawProvider === 'anthropic' ? 'claude' : rawProvider;
  const userKey = apiKey?.trim();
  const cleanBaseURL = baseURL?.trim().replace(/\/+$/, '');

  try {
    if (provider === 'chatgpt' || provider === 'claude') {
      const effectiveKey = userKey || (provider === 'chatgpt' ? process.env.OPENAI_API_KEY : process.env.ANTHROPIC_API_KEY);

      if (!effectiveKey) {
        return {
          statusCode: 401,
          body: JSON.stringify({ error: `API Key দেওয়া হয়নি।` }),
        };
      }

      const isAnthropicNative =
        (provider === 'claude' && (!cleanBaseURL || cleanBaseURL.includes('api.anthropic.com'))) ||
        Boolean(cleanBaseURL && cleanBaseURL.includes('api.anthropic.com'));

      if (isAnthropicNative) {
        const targetUrl = 'https://api.anthropic.com/v1/messages';
        let userMessages: { role: 'user' | 'assistant'; content: string }[] = [];
        if (Array.isArray(messages)) {
          userMessages = messages
            .filter((m: any) => m && m.role !== 'system')
            .map((m: any) => ({
              role: m.role === 'assistant' ? 'assistant' : 'user',
              content: typeof m.content === 'string' ? m.content : String(m.content ?? ''),
            }));
        } else if (typeof messages === 'string' && messages.trim()) {
          userMessages = [{ role: 'user', content: messages.trim() }];
        }

        const requestBody: any = {
          model: model || 'claude-3-5-sonnet-20241022',
          max_tokens: maxTokens ? Number(maxTokens) : 4096,
          messages: userMessages,
        };

        if (systemPrompt && typeof systemPrompt === 'string' && systemPrompt.trim()) {
          requestBody.system = systemPrompt.trim();
        }

        const response = await fetch(targetUrl, {
          method: 'POST',
          headers: {
            'x-api-key': effectiveKey,
            'anthropic-version': '2026-10-21',
            'content-type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });

        const data: any = await response.json();
        return {
            statusCode: response.status,
            body: JSON.stringify({
                content: data?.content?.[0]?.text || '',
                reasoning: data?.content?.find((b: any) => b?.type === 'thinking')?.thinking || '',
                targetUrl
            })
        };
      }

      let targetUrl = 'https://api.openai.com/v1/chat/completions';
      if (cleanBaseURL) {
        targetUrl = cleanBaseURL.endsWith('/chat/completions')
          ? cleanBaseURL
          : `${cleanBaseURL}/chat/completions`;
      }

      const allMessages = [
        ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
        ...(Array.isArray(messages) ? messages : [{ role: 'user', content: String(messages || '') }]),
      ];

      const requestBody: any = {
        model: model || (provider === 'claude' ? 'google/gemma-4-31b-it:free' : 'openai/gpt-4o-mini'),
        messages: allMessages,
        max_tokens: Number(maxTokens) || 4096,
      };

      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${effectiveKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      const data: any = await response.json();
      return {
          statusCode: response.status,
          body: JSON.stringify({
              content: data?.choices?.[0]?.message?.content || '',
              reasoning: data?.choices?.[0]?.message?.reasoning_content || '',
              targetUrl: sanitize(targetUrl, effectiveKey)
          })
      };
    }

    if (provider === 'gemini') {
      if (!process.env.GEMINI_API_KEY) {
        return { statusCode: 503, body: JSON.stringify({ error: 'সার্ভারে API Key পাওয়া যায়নি।' }) };
      }

      const selectedModel = (model || 'gemini-3.1-flash-lite').trim();
      let userPrompt = '';
      if (Array.isArray(messages)) {
        userPrompt = messages.map((m: any) => m.content).join('\n\n');
      } else {
        userPrompt = String(messages || '');
      }

      const geminiConfig: any = { systemInstruction: systemPrompt || undefined };
      if (maxTokens) geminiConfig.maxOutputTokens = Number(maxTokens);

      const response = await ai.models.generateContent({
        model: selectedModel,
        contents: userPrompt,
        config: geminiConfig,
      });

      return {
          statusCode: 200,
          body: JSON.stringify({ content: response.text || '', targetUrl: `Google GenAI (${selectedModel})` })
      };
    }

    return { statusCode: 400, body: JSON.stringify({ error: `অজানা প্রোভাইডার` }) };
  } catch (err: any) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
