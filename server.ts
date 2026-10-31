import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Server-side initialization of GoogleGenAI SDK with user-agent header
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
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

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // Health check endpoint
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, status: 'ready', time: new Date().toISOString() });
  });

  // Streaming & standard chat endpoint
  app.post('/api/chat', async (req, res) => {
    const {
      provider: rawProvider,
      messages,
      model,
      systemPrompt,
      apiKey,
      baseURL,
      stream = true,
      maxTokens,
      reasoningEffort,
    } = req.body;

    const provider = rawProvider === 'openai' ? 'chatgpt' : rawProvider === 'anthropic' ? 'claude' : rawProvider;
    const userKey = apiKey?.trim();
    const cleanBaseURL = baseURL?.trim().replace(/\/+$/, '');

    try {
      // 1. ChatGPT & Claude
      if (provider === 'chatgpt' || provider === 'claude') {
        const effectiveKey = userKey || (provider === 'chatgpt' ? process.env.OPENAI_API_KEY : process.env.ANTHROPIC_API_KEY);

        if (!effectiveKey) {
          return res.status(401).json({
            error: `API Key দেওয়া হয়নি। সেটিংসে গিয়ে ${provider === 'chatgpt' ? 'ChatGPT' : 'Claude'}-এর জন্য API key বসান।`,
          });
        }

        const isAnthropicNative =
          (provider === 'claude' && (!cleanBaseURL || cleanBaseURL.includes('api.anthropic.com'))) ||
          Boolean(cleanBaseURL && cleanBaseURL.includes('api.anthropic.com'));

        if (isAnthropicNative) {
          // Native Anthropic Messages API (POST https://api.anthropic.com/v1/messages)
          const targetUrl = 'https://api.anthropic.com/v1/messages';

          // Format messages for Anthropic Messages API
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

          if (userMessages.length === 0) {
            userMessages = [{ role: 'user', content: 'Hello' }];
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
            signal: AbortSignal.timeout(180000), // 180-second timeout
          });

          if (!response.ok) {
            const rawText = await response.text();
            let errJson: any = null;
            try {
              errJson = JSON.parse(rawText);
            } catch {}
            const errDetail = errJson?.error?.message || errJson?.error || rawText.slice(0, 300);
            const detailStr = typeof errDetail === 'string' ? errDetail : JSON.stringify(errDetail);
            return res.status(response.status).json({
              error: sanitize(`HTTP ${response.status}: ${detailStr}`, effectiveKey),
              targetUrl,
            });
          }

          const data: any = await response.json();
          const answer =
            data?.content?.[0]?.text ||
            (Array.isArray(data?.content) ? data.content.find((b: any) => b?.type === 'text')?.text : '') ||
            '';
          const thinkingBlock = Array.isArray(data?.content) ? data.content.find((b: any) => b?.type === 'thinking') : null;

          return res.json({
            content: answer,
            reasoning: thinkingBlock?.thinking || '',
            targetUrl,
          });
        }

        // OpenAI-compatible endpoint (OpenRouter, Groq, custom Base URL, or official OpenAI)
        let targetUrl = 'https://api.openai.com/v1/chat/completions';
        if (cleanBaseURL) {
          targetUrl = cleanBaseURL.endsWith('/chat/completions')
            ? cleanBaseURL
            : `${cleanBaseURL}/chat/completions`;
        }

        // If reasoning effort is set to 'low', guide the model to be concise
        let effectiveSystemPrompt = systemPrompt || '';
        if (reasoningEffort === 'low') {
          const concisenessDirective = 'Direct and concise response. Minimize internal reasoning and state the final answer directly.';
          effectiveSystemPrompt = effectiveSystemPrompt ? `${effectiveSystemPrompt}\n${concisenessDirective}` : concisenessDirective;
        }

        const allMessages = [
          ...(effectiveSystemPrompt ? [{ role: 'system', content: effectiveSystemPrompt }] : []),
          ...(Array.isArray(messages) ? messages : [{ role: 'user', content: String(messages || '') }]),
        ];

        const requestBody: any = {
          model: model || (provider === 'claude' ? 'google/gemma-4-31b-it:free' : 'openai/gpt-4o-mini'),
          messages: allMessages,
          stream: Boolean(stream),
        };

        if (maxTokens) {
          requestBody.max_tokens = Number(maxTokens);
        }

        if (reasoningEffort && reasoningEffort !== 'default') {
          requestBody.reasoning_effort = reasoningEffort;
          requestBody.reasoning = { effort: reasoningEffort };
        }

        const response = await fetch(targetUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${effectiveKey}`,
            'HTTP-Referer': 'https://ai.studio',
            'X-Title': 'Multi-AI Search',
          },
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(180000), // 180-second timeout
        });

        if (!response.ok) {
          const rawText = await response.text();
          let errJson: any = null;
          try {
            errJson = JSON.parse(rawText);
          } catch {}
          const errDetail = errJson?.error?.message || errJson?.error || rawText.slice(0, 300);
          return res.status(response.status).json({
            error: sanitize(typeof errDetail === 'string' ? errDetail : JSON.stringify(errDetail), effectiveKey),
            targetUrl: sanitize(targetUrl, effectiveKey),
          });
        }

        // Live stream parsing
        if (stream && response.body) {
          res.setHeader('Content-Type', 'text/event-stream');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Connection', 'keep-alive');

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith('data:')) continue;
                const dataStr = trimmed.slice(5).trim();
                if (dataStr === '[DONE]') continue;

                try {
                  const parsed = JSON.parse(dataStr);
                  const delta = parsed.choices?.[0]?.delta || {};
                  const text = delta.content || '';
                  const reasoning = delta.reasoning_content || delta.reasoning || '';

                  if (text || reasoning) {
                    res.write(
                      `data: ${JSON.stringify({
                        content: text,
                        reasoning,
                        targetUrl: sanitize(targetUrl, effectiveKey),
                      })}\n\n`
                    );
                  }
                } catch {}
              }
            }
            res.write('data: [DONE]\n\n');
            return res.end();
          } catch (streamErr: any) {
            res.write(`data: ${JSON.stringify({ error: streamErr.message })}\n\n`);
            return res.end();
          }
        } else {
          const data: any = await response.json();
          const content = data?.choices?.[0]?.message?.content || '';
          const reasoning = data?.choices?.[0]?.message?.reasoning_content || '';
          return res.json({ content, reasoning, targetUrl: sanitize(targetUrl, effectiveKey) });
        }
      }

      // 2. Gemini (Server-side @google/genai SDK with streaming & token/thinking limits)
      if (provider === 'gemini') {
        if (!process.env.GEMINI_API_KEY) {
          return res.status(503).json({
            error: 'সার্ভারে GEMINI_API_KEY পাওয়া যায়নি। দয়া করে Settings > Secrets প্যানেল চেক করুন।',
          });
        }

        const selectedModel = (model || 'gemini-3.1-flash-lite').trim();

        let userPrompt = '';
        if (Array.isArray(messages)) {
          userPrompt = messages.map((m: any) => m.content).join('\n\n');
        } else {
          userPrompt = String(messages || '');
        }

        const geminiConfig: any = {
          systemInstruction: systemPrompt || undefined,
        };

        if (maxTokens) {
          geminiConfig.maxOutputTokens = Number(maxTokens);
        }

        if (reasoningEffort === 'low') {
          geminiConfig.thinkingConfig = { thinkingBudget: 0 };
        }

        if (stream) {
          res.setHeader('Content-Type', 'text/event-stream');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Connection', 'keep-alive');

          try {
            const responseStream = await ai.models.generateContentStream({
              model: selectedModel,
              contents: userPrompt,
              config: geminiConfig,
            });

            for await (const chunk of responseStream) {
              if (chunk.text) {
                res.write(
                  `data: ${JSON.stringify({
                    content: chunk.text,
                    targetUrl: `Google GenAI (${selectedModel})`,
                  })}\n\n`
                );
              }
            }
            res.write('data: [DONE]\n\n');
            return res.end();
          } catch (geminiErr: any) {
            res.write(`data: ${JSON.stringify({ error: geminiErr.message })}\n\n`);
            return res.end();
          }
        } else {
          const response = await ai.models.generateContent({
            model: selectedModel,
            contents: userPrompt,
            config: geminiConfig,
          });
          const content = response.text || '';
          return res.json({ content, targetUrl: `Google GenAI (${selectedModel})` });
        }
      }

      return res.status(400).json({ error: `অজানা প্রোভাইডার: ${provider}` });
    } catch (err: any) {
      console.error(`Error in /api/chat (${provider}):`, err);
      const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError';
      const msg = isTimeout ? 'সময় শেষ, মডেলটি খুব ধীর' : (err.message || 'সার্ভার প্রক্রিয়াকরণে সমস্যা হয়েছে');
      return res.status(isTimeout ? 504 : 500).json({ error: sanitize(msg, userKey) });
    }
  });

  // Vite middleware in dev or static files in production
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
