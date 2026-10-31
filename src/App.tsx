import React, { useState, useEffect, useRef } from 'react';
import {
  Settings,
  Sparkles,
  Moon,
  Sun,
  StopCircle,
  History,
  ArrowUp,
  Trash2,
  PlusCircle,
  AlertTriangle,
  X,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import ChatSetGroup, { ChatSet, CardResult } from './components/ChatSetGroup';
import HistorySidebar, { HistoryFolder, ChatSession, downloadFile } from './components/HistorySidebar';
import SettingsModal from './components/SettingsModal';

// Helper to separate explicit reasoning or embedded <think>...</think> / <thought>...</thought> tags
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

function saveToLocalStorage(key: string, data: any): { success: boolean; quotaEvicted: boolean } {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    return { success: true, quotaEvicted: false };
  } catch (err: any) {
    const isQuotaError =
      err?.name === 'QuotaExceededError' ||
      err?.code === 22 ||
      err?.name === 'NS_ERROR_DOM_QUOTA_REACHED';

    if (isQuotaError && Array.isArray(data)) {
      let trimmed = [...data];
      let evicted = false;
      while (trimmed.length > 1) {
        trimmed.shift();
        evicted = true;
        try {
          localStorage.setItem(key, JSON.stringify(trimmed));
          return { success: true, quotaEvicted: evicted };
        } catch {}
      }
    }
    return { success: false, quotaEvicted: false };
  }
}

export default function App() {
  const [prompt, setPrompt] = useState('');

  const [isHistoryOpen, setIsHistoryOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 768;
    }
    return true;
  });

  const [highlightedSetId, setHighlightedSetId] = useState<string | null>(null);

  // Folders state
  const [folders, setFolders] = useState<HistoryFolder[]>(() => {
    try {
      const saved = localStorage.getItem('ai_chat_folders');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Sessions state stored in localStorage (Requirement 1, 2, 5)
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    try {
      const saved = localStorage.getItem('ai_chat_sessions');
      if (saved) {
        return JSON.parse(saved);
      }
      return [];
    } catch {
      return [];
    }
  });

  // Requirement 1: Default active session is the most recent one if available
  const [currentSessionId, setCurrentSessionId] = useState<string>(() => {
    if (sessions.length > 0) {
      // Sort by timestamp desc to get most recent
      const sorted = [...sessions].sort((a, b) => b.timestamp - a.timestamp);
      return sorted[0].id;
    }
    return 'session_' + Date.now();
  });

  // Current session's chat sets (active feed starts with the most recent session's sets)
  const [chatSets, setChatSets] = useState<ChatSet[]>(() => {
    if (sessions.length > 0) {
        const sorted = [...sessions].sort((a, b) => b.timestamp - a.timestamp);
        return sorted[0].sets || [];
    }
    return [];
  });

  const [loading, setLoading] = useState(false);
  const [currentRunningSetId, setCurrentRunningSetId] = useState<string | null>(null);
  const [toggles, setToggles] = useState({ chatgpt: true, claude: true, gemini: true });
  const [expandedCard, setExpandedCard] = useState<{content: string, name: string} | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showClearConfirmModal, setShowClearConfirmModal] = useState(false);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);

  const [darkMode, setDarkMode] = useState(() => {
    return (
      localStorage.getItem('theme') === 'dark' ||
      (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)
    );
  });

  const [showReasoning, setShowReasoning] = useState<boolean>(() => {
    return localStorage.getItem('showReasoning') === 'true';
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const feedContainerRef = useRef<HTMLDivElement | null>(null);
  const bottomMarkerRef = useRef<HTMLDivElement | null>(null);

  // Sync folders to localStorage
  useEffect(() => {
    localStorage.setItem('ai_chat_folders', JSON.stringify(folders));
  }, [folders]);

  // Sync sessions to localStorage whenever they change
  useEffect(() => {
    const { quotaEvicted } = saveToLocalStorage('ai_chat_sessions', sessions);
    if (quotaEvicted) {
      setStorageWarning(
        'ব্রাউজারের স্টোরেজ পূর্ণ হয়ে গেছে। নতুন কথোপকথন সংরক্ষণ করতে সবচেয়ে পুরনো সেশনগুলো মুছে ফেলা হয়েছে।'
      );
    }
  }, [sessions]);

  // Requirement 4: ONLY save to history when responses are fully completed (no loading sets)
  useEffect(() => {
    if (chatSets.length === 0) return;

    // Check if any set in current feed is still loading
    const hasLoading = chatSets.some((set) =>
      Object.values(set.results || {}).some((res) => res?.loading)
    );

    if (hasLoading) {
      return; // Do not save while loading!
    }

    // Fully completed -> Save/Update in sessions list
    setSessions((prev) => {
      const title = chatSets[0]?.prompt || 'নতুন কথোপকথন';
      const existingIdx = prev.findIndex((s) => s.id === currentSessionId);

      if (existingIdx >= 0) {
        return prev.map((s) =>
          s.id === currentSessionId ? { ...s, title, sets: chatSets } : s
        );
      } else {
        const newSession: ChatSession = {
          id: currentSessionId,
          title,
          timestamp: Date.now(),
          folderId: null,
          pinned: false,
          sets: chatSets,
        };
        return [newSession, ...prev];
      }
    });
  }, [chatSets, currentSessionId]);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  useEffect(() => {
    localStorage.setItem('showReasoning', String(showReasoning));
  }, [showReasoning]);

  const handleCancelCurrentSearch = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setLoading(false);
    if (currentRunningSetId) {
      setChatSets((prev) =>
        prev.map((set) => {
          if (set.id !== currentRunningSetId) return set;
          const updatedResults = { ...set.results };
          Object.keys(updatedResults).forEach((k) => {
            const prov = k as 'chatgpt' | 'claude' | 'gemini';
            if (updatedResults[prov]?.loading) {
              updatedResults[prov] = {
                ...updatedResults[prov],
                loading: false,
                error: 'ব্যবহারকারী দ্বারা রিকোয়েস্ট বাতিল করা হয়েছে',
              };
            }
          });
          return { ...set, results: updatedResults };
        })
      );
      setCurrentRunningSetId(null);
    }
  };

  const executeProviderForSet = async (
    targetSetId: string,
    provider: 'chatgpt' | 'claude' | 'gemini',
    searchPrompt: string,
    parentSignal?: AbortSignal
  ) => {
    const config = JSON.parse(localStorage.getItem('aiConfig') || '{}');
    const systemPrompt = localStorage.getItem('systemPrompt') || '';
    const maxTokens = localStorage.getItem('maxTokens') || '4096';
    const reasoningEffort = localStorage.getItem('reasoningEffort') || 'medium';
    const provConfig = config[provider] || {};

    const startTime = Date.now();

    const primaryModel = (
      provConfig.model ||
      (provider === 'claude' ? 'google/gemma-4-31b-it:free' : '')
    ).trim();

    const candidateModels: { model: string; isFallback: boolean }[] = [
      { model: primaryModel, isFallback: false },
    ];
    if (provider === 'claude' && primaryModel !== 'nvidia/nemotron-3-ultra-550b-a55b:free') {
      candidateModels.push({ model: 'nvidia/nemotron-3-ultra-550b-a55b:free', isFallback: true });
    }

    let lastErrorText = '';

    for (let mIdx = 0; mIdx < candidateModels.length; mIdx++) {
      if (parentSignal?.aborted) return;
      const { model: modelToCall, isFallback } = candidateModels[mIdx];
      const hasNextCandidate = mIdx < candidateModels.length - 1;

      if (isFallback) {
        setChatSets((prev) =>
          prev.map((s) => {
            if (s.id !== targetSetId) return s;
            return {
              ...s,
              results: {
                ...s.results,
                [provider]: {
                  ...s.results[provider],
                  loading: true,
                  error: undefined,
                  fallbackModel: modelToCall,
                  statusMessage: `প্রথম মডেল সীমায় ঠেকেছে বা ব্যর্থ হয়েছে। বিকল্প মডেল (${modelToCall}) দিয়ে চেষ্টা করা হচ্ছে...`,
                },
              },
            };
          })
        );
      } else {
        setChatSets((prev) =>
          prev.map((s) => {
            if (s.id !== targetSetId) return s;
            return {
              ...s,
              results: {
                ...s.results,
                [provider]: {
                  ...s.results[provider],
                  fallbackModel: undefined,
                },
              },
            };
          })
        );
      }

      const maxAttempts = hasNextCandidate ? 2 : 3;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        if (parentSignal?.aborted) return;

        const singleController = new AbortController();
        let inactivityTimer: any = null;

        const resetInactivityTimer = () => {
          if (inactivityTimer) clearTimeout(inactivityTimer);
          inactivityTimer = setTimeout(() => {
            singleController.abort(new Error('TIMEOUT_INACTIVITY'));
          }, 180000);
        };

        const onParentAbort = () => {
          if (inactivityTimer) clearTimeout(inactivityTimer);
          singleController.abort();
        };
        if (parentSignal) parentSignal.addEventListener('abort', onParentAbort);

        resetInactivityTimer();

        try {
          if (attempt > 1) {
            setChatSets((prev) =>
              prev.map((s) => {
                if (s.id !== targetSetId) return s;
                return {
                  ...s,
                  results: {
                    ...s.results,
                    [provider]: {
                      ...s.results[provider],
                      loading: true,
                      error: undefined,
                      statusMessage:
                        attempt === 2
                          ? 'প্রথম প্রচেষ্টা ব্যর্থ, ২য় বার চেষ্টা করা হচ্ছে...'
                          : 'শেষ প্রচেষ্টা চলমান (৩/৩)...',
                    },
                  },
                };
              })
            );
          }

          const response = await fetch('/.netlify/functions/generate-plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              provider,
              messages: [{ role: 'user', content: searchPrompt }],
              model: modelToCall,
              apiKey: provConfig.apiKey,
              baseURL: provConfig.baseURL,
              systemPrompt,
              stream: true,
              maxTokens: Number(maxTokens) || 4096,
              reasoningEffort,
            }),
            signal: singleController.signal,
          });

          const contentType = response.headers.get('content-type') || '';

          if (contentType.includes('text/html') || [502, 503, 504].includes(response.status)) {
            throw new Error('503 Server Busy: অ্যাপের সার্ভার ব্যস্ত বা সময়সীমা পেরিয়েছে');
          }

          if (!response.ok) {
            const rawErr = await response.text();
            let errJson: any = null;
            try {
              errJson = JSON.parse(rawErr);
            } catch {}
            const errorMsg = errJson?.error || rawErr.slice(0, 250);

            if (errorMsg.startsWith('HTTP ')) {
              throw new Error(errorMsg);
            }
            if (response.status === 429) {
              throw new Error(`HTTP 429 Rate Limit: ${errorMsg}`);
            }
            if (response.status === 401 || response.status === 403) {
              throw new Error(`HTTP ${response.status} Unauthorized: ${errorMsg}`);
            }
            if (response.status === 503 || response.status === 502) {
              throw new Error(`HTTP ${response.status} Server Busy: ${errorMsg}`);
            }
            throw new Error(`HTTP ${response.status}: ${errorMsg}`);
          }

          if (response.body && contentType.includes('text/event-stream')) {
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let accumulatedContent = '';
            let accumulatedReasoning = '';
            let targetUrl = '';
            let buffer = '';

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              resetInactivityTimer();

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
                  if (parsed.error) {
                    throw new Error(parsed.error);
                  }
                  if (parsed.content) accumulatedContent += parsed.content;
                  if (parsed.reasoning) accumulatedReasoning += parsed.reasoning;
                  if (parsed.targetUrl) targetUrl = parsed.targetUrl;

                  const parsedState = extractReasoningAndContent(accumulatedContent, accumulatedReasoning);
                  const currentDuration = (Date.now() - startTime) / 1000;

                  setChatSets((prev) =>
                    prev.map((s) => {
                      if (s.id !== targetSetId) return s;
                      return {
                        ...s,
                        results: {
                          ...s.results,
                          [provider]: {
                            content: parsedState.content,
                            reasoning: parsedState.reasoning,
                            timeTaken: currentDuration,
                            url: targetUrl,
                            fallbackModel: isFallback ? modelToCall : undefined,
                            loading: true,
                            statusMessage: '',
                          },
                        },
                      };
                    })
                  );
                } catch (parseErr: any) {
                  if (parseErr.message && !parseErr.message.includes('JSON')) {
                    throw parseErr;
                  }
                }
              }
            }

            if (inactivityTimer) clearTimeout(inactivityTimer);
            const finalDuration = (Date.now() - startTime) / 1000;
            const finalState = extractReasoningAndContent(accumulatedContent, accumulatedReasoning);

            setChatSets((prev) =>
              prev.map((s) => {
                if (s.id !== targetSetId) return s;
                return {
                  ...s,
                  results: {
                    ...s.results,
                    [provider]: {
                      content: finalState.content ? finalState.content : 'কোনো উত্তর পাওয়া যায়নি',
                      reasoning: finalState.reasoning,
                      timeTaken: finalDuration,
                      url: targetUrl,
                      fallbackModel: isFallback ? modelToCall : undefined,
                      loading: false,
                    },
                  },
                };
              })
            );

            return;
          } else {
            const rawText = await response.text();
            if (inactivityTimer) clearTimeout(inactivityTimer);

            if (rawText.trim().startsWith('<!doctype') || rawText.trim().startsWith('<html')) {
              throw new Error('503 Server Busy: অ্যাপের সার্ভার ব্যস্ত বা সময়সীমা পেরিয়েছে');
            }
            let data: any = null;
            try {
              data = JSON.parse(rawText);
            } catch {
              throw new Error('503 Server Busy: অ্যাপের সার্ভার ব্যস্ত বা সময়সীমা পেরিয়েছে');
            }

            const duration = (Date.now() - startTime) / 1000;
            const parsedState = extractReasoningAndContent(data.content || '', data.reasoning || '');

            setChatSets((prev) =>
              prev.map((s) => {
                if (s.id !== targetSetId) return s;
                return {
                  ...s,
                  results: {
                    ...s.results,
                    [provider]: {
                      content: parsedState.content ? parsedState.content : 'কোনো উত্তর পাওয়া যায়নি',
                      reasoning: parsedState.reasoning,
                      timeTaken: duration,
                      url: data.targetUrl,
                      fallbackModel: isFallback ? modelToCall : undefined,
                      loading: false,
                    },
                  },
                };
              })
            );

            return;
          }
        } catch (err: any) {
          if (inactivityTimer) clearTimeout(inactivityTimer);
          if (parentSignal) parentSignal.removeEventListener('abort', onParentAbort);
          if (parentSignal?.aborted) return;

          let errorText = err.message || 'রিকোয়েস্ট ব্যর্থ হয়েছে';
          if (
            singleController.signal.aborted ||
            err.message === 'TIMEOUT_INACTIVITY' ||
            err.name === 'TimeoutError'
          ) {
            errorText = 'সময় শেষ (১৮০ সেকেন্ডে কোনো ডেটা পাওয়া যায়নি, মডেলটি খুব ধীর)';
          }

          lastErrorText = errorText;

          const isRateOrFatal =
            errorText.includes('429') ||
            errorText.includes('Rate Limit') ||
            errorText.includes('quota') ||
            errorText.includes('404') ||
            errorText.includes('400') ||
            errorText.includes('exhausted');

          if (hasNextCandidate && isRateOrFatal) {
            break;
          }

          if (attempt < maxAttempts) {
            const delayMs = attempt === 1 ? 2000 : 5000;
            const delaySec = attempt === 1 ? 2 : 5;

            setChatSets((prev) =>
              prev.map((s) => {
                if (s.id !== targetSetId) return s;
                return {
                  ...s,
                  results: {
                    ...s.results,
                    [provider]: {
                      ...s.results[provider],
                      loading: true,
                      statusMessage: `কল ব্যর্থ হয়েছে (${errorText})। ${delaySec} সেকেন্ড পর আবার চেষ্টা করা হচ্ছে (${attempt}/${maxAttempts - 1})...`,
                    },
                  },
                };
              })
            );

            await new Promise((r) => setTimeout(r, delayMs));
            continue;
          }
        }
      }
    }

    const duration = (Date.now() - startTime) / 1000;
    setChatSets((prev) =>
      prev.map((s) => {
        if (s.id !== targetSetId) return s;
        return {
          ...s,
          results: {
            ...s.results,
            [provider]: {
              content: s.results[provider]?.content || '',
              reasoning: s.results[provider]?.reasoning || '',
              error: lastErrorText,
              timeTaken: duration,
              loading: false,
            },
          },
        };
      })
    );
  };

  const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(Math.max(40, scrollHeight), 160)}px`;
    }
  };

  // Requirement 3: New question adds ONLY to currently open conversation feed
  const handleSearch = async (overridePrompt?: string) => {
    const query = (overridePrompt ?? prompt).trim();
    if (!query || loading) return;

    const activeProviders = (['chatgpt', 'claude', 'gemini'] as const).filter((p) => toggles[p]);
    if (activeProviders.length === 0) {
      alert('অনুগ্রহ করে অন্তত একটি AI সক্রিয় করুন।');
      return;
    }

    const setId = Date.now().toString();

    const initialResults: Record<'chatgpt' | 'claude' | 'gemini', CardResult> = {
      chatgpt: { content: '', loading: activeProviders.includes('chatgpt'), statusMessage: '' },
      claude: { content: '', loading: activeProviders.includes('claude'), statusMessage: '' },
      gemini: { content: '', loading: activeProviders.includes('gemini'), statusMessage: '' },
    };

    const newSet: ChatSet = {
      id: setId,
      prompt: query,
      timestamp: Date.now(),
      collapsed: false,
      activeProviders,
      results: initialResults,
    };

    setChatSets((prev) => [...prev, newSet]);

    setPrompt('');
    if (textareaRef.current) {
      textareaRef.current.style.height = '40px';
    }

    setLoading(true);
    setCurrentRunningSetId(setId);

    setTimeout(() => {
      const el = document.getElementById(`set-${setId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        bottomMarkerRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    }, 100);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    await Promise.allSettled(
      activeProviders.map((p) => executeProviderForSet(setId, p, query, controller.signal))
    );

    setLoading(false);
    setCurrentRunningSetId(null);
    abortControllerRef.current = null;
  };

  const handleToggleCollapse = (setId: string) => {
    setChatSets((prev) =>
      prev.map((s) => (s.id === setId ? { ...s, collapsed: !s.collapsed } : s))
    );
  };

  const handleDeleteSet = (setId: string) => {
    setChatSets((prev) => prev.filter((s) => s.id !== setId));
  };

  const handleReAsk = (questionText: string) => {
    setPrompt(questionText);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
    handleSearch(questionText);
  };

  const handleRetryProvider = (setId: string, provider: 'chatgpt' | 'claude' | 'gemini') => {
    const targetSet = chatSets.find((s) => s.id === setId);
    if (!targetSet) return;

    setChatSets((prev) =>
      prev.map((s) => {
        if (s.id !== setId) return s;
        return {
          ...s,
          results: {
            ...s.results,
            [provider]: {
              content: '',
              reasoning: '',
              loading: true,
              error: undefined,
              statusMessage: '',
            },
          },
        };
      })
    );

    executeProviderForSet(setId, provider, targetSet.prompt);
  };

  const handleGenerateCombined = async (setId: string) => {
    const targetSet = chatSets.find((s) => s.id === setId);
    if (!targetSet) return;

    const config = JSON.parse(localStorage.getItem('aiConfig') || '{}');
    const validAnswers = Object.entries(targetSet.results || {}).filter(
      ([_, res]) =>
        res?.content &&
        res.content !== 'কোনো উত্তর পাওয়া যায়নি' &&
        !res.loading &&
        !res.error
    );

    if (validAnswers.length === 0) {
      alert('আগে অন্তত একটি AI থেকে সফল উত্তর আসতে হবে, তারপর সমন্বয় করা যাবে।');
      return;
    }

    setChatSets((prev) =>
      prev.map((s) => {
        if (s.id !== setId) return s;
        return {
          ...s,
          combinedResult: {
            loading: true,
            content: '',
            error: '',
          },
        };
      })
    );

    setTimeout(() => {
      const el = document.getElementById(`set-${setId}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 150);

    const answersSummary = validAnswers
      .map(([p, res]) => {
        const name =
          config[p]?.displayName || (p === 'chatgpt' ? 'ChatGPT' : p === 'claude' ? 'Claude' : 'Gemini');
        const cleanContent = (res.content || '')
          .replace(/<think>[\s\S]*?<\/think>/gi, '')
          .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
          .trim();
        return `### ${name} এর চূড়ান্ত উত্তর:\n${cleanContent}\n`;
      })
      .join('\n---\n');

    const comparisonPrompt = `ব্যবহারকারীর মূল প্রশ্ন ছিল: "${targetSet.prompt}"\n\nনিচে বিভিন্ন AI মডেলের চূড়ান্ত উত্তর দেওয়া হলো (কোনো রিজনিং বা চিন্তাভাবনা ছাড়া):\n\n${answersSummary}\n\nদয়া করে এই চূড়ান্ত উত্তরগুলো গভীরভাবে তুলনা করো:\n১. কোন AI কোন নির্দিষ্ট পয়েন্টে সবচেয়ে ভালো বলেছে এবং কোথায় ঘাটতি ছিল তা সংক্ষেপে বিশ্লেষণ করো।\n২. সবগুলোর তথ্য সমন্বয় করে একটি পরিপূর্ণ, তথ্যবহুল ও সেরা সমন্বিত উত্তর তৈরি করো (বাংলায়)।`;

    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), 180000);

    try {
      const response = await fetch('/.netlify/functions/generate-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'gemini',
          messages: [{ role: 'user', content: comparisonPrompt }],
          model: config.gemini?.model || 'gemini-3.1-flash-lite',
          stream: false,
          maxTokens: 4096,
        }),
        signal: timeoutController.signal,
      });

      const text = await response.text();
      if (text.trim().startsWith('<!doctype') || text.trim().startsWith('<html')) {
        throw new Error('অ্যাপের সার্ভার ব্যস্ত বা সময়সীমা পেরিয়েছে');
      }

      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error('অ্যাপের সার্ভার ব্যস্ত বা সময়সীমা পেরিয়েছে');
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${data?.error || text.slice(0, 200)}`);
      }

      setChatSets((prev) =>
        prev.map((s) => {
          if (s.id !== setId) return s;
          return {
            ...s,
            combinedResult: {
              loading: false,
              content: data.content || 'কোনো উত্তর পাওয়া যায়নি',
            },
          };
        })
      );
    } catch (err: any) {
      let msg = err.message || 'তুলনা সম্পন্ন করা সম্ভব হয়নি';
      if (timeoutController.signal.aborted || msg.includes('timeout')) {
        msg = 'সময় শেষ (১৮০ সেকেন্ডে কোনো ডেটা আসেনি)';
      }
      setChatSets((prev) =>
        prev.map((s) => {
          if (s.id !== setId) return s;
          return {
            ...s,
            combinedResult: {
              loading: false,
              error: msg,
            },
          };
        })
      );
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const handleDismissCombined = (setId: string) => {
    setChatSets((prev) =>
      prev.map((s) => {
        if (s.id !== setId) return s;
        return {
          ...s,
          combinedResult: undefined,
        };
      })
    );
  };

  const handleTriggerLatestCombined = () => {
    const latestEligibleSet = [...chatSets].reverse().find((s) =>
      Object.values(s.results || {}).some(
        (res) =>
          res &&
          res.content &&
          res.content !== 'কোনো উত্তর পাওয়া যায়নি' &&
          !res.loading &&
          !res.error
      )
    );

    if (!latestEligibleSet) {
      alert('সম্মিলিত সেরা উত্তর তৈরি করার জন্য অন্তত একটি সেটে পূর্ণাঙ্গ উত্তর প্রয়োজন।');
      return;
    }

    handleGenerateCombined(latestEligibleSet.id);
  };

  // Requirement 2: Clicking sidebar session loads ONLY that conversation's sets into main feed
  const handleSelectSession = (sessionId: string) => {
    const targetSession = sessions.find((s) => s.id === sessionId);
    if (targetSession) {
      setCurrentSessionId(targetSession.id);
      setChatSets(targetSession.sets || []);
    }
    if (window.innerWidth < 768) {
      setIsHistoryOpen(false);
    }
  };

  // Requirement 1: "নতুন কথোপকথন" button -> creates a brand new blank session and clears main feed
  const handleNewConversation = () => {
    const newId = 'session_' + Date.now();
    setCurrentSessionId(newId);
    setChatSets([]);
    setPrompt('');
  };

  // Requirement 5: Delete individual session from history via delete icon (🗑)
  const handleDeleteSession = (sessionId: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    if (sessionId === currentSessionId) {
      handleNewConversation();
    }
  };

  const handleBatchDeleteSessions = (sessionIds: string[]) => {
    setSessions((prev) => prev.filter((s) => !sessionIds.includes(s.id)));
    if (sessionIds.includes(currentSessionId)) {
      handleNewConversation();
    }
  };

  const handleClearAllHistory = () => {
    if (window.confirm('আপনি কি সমস্ত কথোপকথনের ইতিহাস মুছে ফেলতে চান?')) {
      setSessions([]);
      localStorage.removeItem('ai_chat_sessions');
      handleNewConversation();
    }
  };

  // Folder actions
  const handleCreateFolder = (name: string, color: string) => {
    const newFolder: HistoryFolder = {
      id: 'f_' + Date.now().toString(),
      name,
      color,
      collapsed: false,
    };
    setFolders((prev) => [...prev, newFolder]);
  };

  const handleUpdateFolder = (folderId: string, name: string, color: string) => {
    setFolders((prev) =>
      prev.map((f) => (f.id === folderId ? { ...f, name, color } : f))
    );
  };

  const handleDeleteFolder = (folderId: string) => {
    setFolders((prev) => prev.filter((f) => f.id !== folderId));
    setSessions((prev) =>
      prev.map((s) => (s.folderId === folderId ? { ...s, folderId: null } : s))
    );
  };

  const handleToggleFolderCollapse = (folderId: string) => {
    setFolders((prev) =>
      prev.map((f) => (f.id === folderId ? { ...f, collapsed: !f.collapsed } : f))
    );
  };

  const handleMoveToFolder = (sessionId: string, folderId: string | null) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, folderId } : s))
    );
  };

  const handleBatchMoveToFolder = (sessionIds: string[], folderId: string | null) => {
    setSessions((prev) =>
      prev.map((s) => (sessionIds.includes(s.id) ? { ...s, folderId } : s))
    );
  };

  const handleTogglePin = (sessionId: string) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, pinned: !s.pinned } : s))
    );
  };

  const handleRenameSession = (sessionId: string, newTitle: string) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, title: newTitle } : s))
    );
  };

  const handleExportAll = () => {
    const payload = {
      version: 2,
      appName: 'Multi-AI Search Chat Sessions',
      exportedAt: new Date().toISOString(),
      folders,
      sessions,
    };
    const dateStr = new Date().toISOString().split('T')[0];
    downloadFile(
      JSON.stringify(payload, null, 2),
      `multi-ai-sessions-${dateStr}.json`,
      'application/json'
    );
  };

  const handleImportData = (
    data: { folders?: HistoryFolder[]; sessions?: ChatSession[]; sets?: any[] },
    mode: 'merge' | 'replace'
  ) => {
    let importedSessions: ChatSession[] = [];
    if (Array.isArray(data.sessions)) {
      importedSessions = data.sessions;
    } else if (Array.isArray(data.sets)) {
      importedSessions = [
        {
          id: 'session_' + Date.now(),
          title: data.sets[0]?.prompt || 'ইম্পোর্ট করা সেশন',
          timestamp: Date.now(),
          folderId: null,
          pinned: false,
          sets: data.sets,
        },
      ];
    }

    if (mode === 'replace') {
      if (Array.isArray(data.folders)) setFolders(data.folders);
      setSessions(importedSessions);
      handleNewConversation();
    } else {
      if (Array.isArray(data.folders)) {
        setFolders((prev) => {
          const existingIds = new Set(prev.map((f) => f.id));
          const newFolders = data.folders!.filter((f) => !existingIds.has(f.id));
          return [...prev, ...newFolders];
        });
      }
      setSessions((prev) => {
        const existingIds = new Set(prev.map((s) => s.id));
        const newItems = importedSessions.filter((s) => !existingIds.has(s.id));
        return [...newItems, ...prev];
      });
    }
  };

  const config = JSON.parse(localStorage.getItem('aiConfig') || '{}');

  return (
    <div className="flex h-screen h-[100dvh] w-full bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans overflow-hidden transition-colors duration-200">
      {/* Sidebar for Sessions History */}
      <HistorySidebar
        sessions={sessions}
        currentSessionId={currentSessionId}
        folders={folders}
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        onSelectSession={handleSelectSession}
        onDeleteSession={handleDeleteSession}
        onBatchDeleteSessions={handleBatchDeleteSessions}
        onClearHistory={handleClearAllHistory}
        onCreateFolder={handleCreateFolder}
        onUpdateFolder={handleUpdateFolder}
        onDeleteFolder={handleDeleteFolder}
        onToggleFolderCollapse={handleToggleFolderCollapse}
        onMoveToFolder={handleMoveToFolder}
        onBatchMoveToFolder={handleBatchMoveToFolder}
        onTogglePin={handleTogglePin}
        onRenameSession={handleRenameSession}
        onExportAll={handleExportAll}
        onImportData={handleImportData}
        config={config}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        showReasoning={showReasoning}
        setShowReasoning={setShowReasoning}
      />

      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden relative">
        <header className="sticky top-0 z-20 backdrop-blur-md bg-white/90 dark:bg-zinc-900/90 border-b border-zinc-200 dark:border-zinc-800 px-3 sm:px-6 py-2.5 sm:py-3 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => setIsHistoryOpen(!isHistoryOpen)}
              className={`p-2 rounded-xl transition-colors cursor-pointer ${
                isHistoryOpen
                  ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400'
                  : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
              title={isHistoryOpen ? 'ইতিহাস লুকান' : 'ইতিহাস দেখুন'}
            >
              <History className="w-5 h-5" />
            </button>

            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-md">
              <Sparkles className="w-4.5 h-4.5" />
            </div>

            <div>
              <h1 className="text-sm sm:text-base font-bold tracking-tight text-zinc-900 dark:text-white leading-none">
                Multi-AI Chat Feed
              </h1>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 hidden sm:block">
                ChatGPT, Claude ও Gemini-র সমান্তরাল সেশন ভিত্তিক চ্যাট
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Requirement 1: New Conversation Button */}
            <button
              onClick={handleNewConversation}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 transition-colors cursor-pointer shadow-2xs"
              title="নতুন খালি কথোপকথন শুরু করুন"
            >
              <PlusCircle className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span className="hidden sm:inline">নতুন কথোপকথন</span>
            </button>

            {chatSets.length > 0 && (
              <button
                onClick={() => {
                  if (window.confirm('আপনি কি বর্তমান ফিডের সকল প্রশ্ন ও উত্তর মুছে ফেলতে চান?')) {
                    setChatSets([]);
                  }
                }}
                className="flex items-center gap-1 p-2 sm:px-2.5 sm:py-1.5 rounded-xl text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 border border-zinc-200 dark:border-zinc-700 transition-colors cursor-pointer"
                title="বর্তমান ফিড পরিষ্কার করুন"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">সব মুছে ফেলো</span>
              </button>
            )}

            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 rounded-xl text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              title="ডার্ক মোড"
            >
              {darkMode ? <Sun className="w-4.5 h-4.5" /> : <Moon className="w-4.5 h-4.5" />}
            </button>

            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 rounded-xl text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              title="সেটিংস"
            >
              <Settings className="w-4.5 h-4.5" />
            </button>
          </div>
        </header>

        {storageWarning && (
          <div className="bg-amber-50 dark:bg-amber-950/60 border-b border-amber-200 dark:border-amber-900/60 px-4 py-2 flex items-center justify-between text-xs text-amber-800 dark:text-amber-200">
            <span className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {storageWarning}
            </span>
            <button onClick={() => setStorageWarning(null)} className="p-1 hover:bg-amber-100 rounded-md">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Middle Scrollable Feed */}
        <div ref={feedContainerRef} className="flex-1 overflow-y-auto min-h-0 px-3 sm:px-6 py-4 md:py-6">
          <div className="max-w-6xl mx-auto w-full">
            {chatSets.length === 0 && (
              <div className="py-14 sm:py-24 text-center max-w-lg mx-auto px-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-500 via-indigo-500 to-purple-600 flex items-center justify-center text-white mx-auto mb-4 shadow-lg">
                  <Sparkles className="w-7 h-7" />
                </div>
                <h2 className="text-lg sm:text-xl font-bold text-zinc-800 dark:text-zinc-200">
                  নতুন কথোপকথন শুরু করুন
                </h2>
                <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-2 leading-relaxed">
                  নিচের বক্সে আপনার প্রশ্ন লিখুন। উত্তর সম্পূর্ণরূপে আসার পর তা ইতিহাসে সংরক্ষিত হবে।
                </p>

                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  {[
                    'কোয়ান্টাম কম্পিউটিং কীভাবে কাজ করে?',
                    'Python বনাম JavaScript: ২০২৬ সালে কোনটি সেরা?',
                    'জলবায়ু পরিবর্তন মোকাবেলায় আধুনিক প্রযুক্তির ভূমিকা',
                  ].map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => {
                        setPrompt(suggestion);
                        if (textareaRef.current) textareaRef.current.focus();
                      }}
                      className="text-xs px-3 py-1.5 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-blue-400 text-zinc-600 dark:text-zinc-400 transition-colors shadow-2xs cursor-pointer"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {chatSets.map((set) => (
              <ChatSetGroup
                key={set.id}
                set={set}
                config={config}
                showReasoning={showReasoning}
                toggles={toggles}
                isHighlighted={highlightedSetId === set.id}
                onToggleCollapse={handleToggleCollapse}
                onDeleteSet={handleDeleteSet}
                onReAsk={handleReAsk}
                onRetryProvider={handleRetryProvider}
                onGenerateCombined={handleGenerateCombined}
                onDismissCombined={handleDismissCombined}
                onExpandCard={(content, name) => setExpandedCard({content, name})}
              />
            ))}

            <div ref={bottomMarkerRef} className="h-2" />
          </div>
        </div>

        {/* Expand Card Modal */}
        {expandedCard && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-zinc-900 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl border border-zinc-200 dark:border-zinc-800">
              <div className="flex justify-between items-center p-5 border-b border-zinc-200 dark:border-zinc-800">
                <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
                  {expandedCard.name} এর উত্তর
                </h2>
                <button
                  onClick={() => setExpandedCard(null)}
                  className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 overflow-y-auto flex-grow prose dark:prose-invert max-w-none">
                <ReactMarkdown
                  components={{
                    code({ className, children, ...props }) {
                      const match = /language-(\w+)/.exec(className || '');
                      const { node, inline, ...rest } = props as any;
                      return match ? (
                        <SyntaxHighlighter style={vscDarkPlus as any} language={match[1]} PreTag="div" {...rest}>
                          {String(children).replace(/\n$/, '')}
                        </SyntaxHighlighter>
                      ) : (
                        <code className={className} {...props}>
                          {children}
                        </code>
                      );
                    },
                  }}
                >
                  {expandedCard.content}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        )}

        {/* Bottom Fixed Input Bar */}
        <div className="shrink-0 border-t border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md px-3 sm:px-6 py-2.5 sm:py-3.5 shadow-lg z-20">
          <div className="max-w-6xl mx-auto w-full space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <span className="text-[11px] text-zinc-400 hidden sm:inline mr-1 font-medium select-none">
                  সক্রিয় AI:
                </span>
                {(['chatgpt', 'claude', 'gemini'] as const).map((p) => {
                  const active = toggles[p];
                  const label =
                    config[p]?.displayName || (p === 'chatgpt' ? 'ChatGPT' : p === 'claude' ? 'Claude' : 'Gemini');
                  return (
                    <label
                      key={p}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs transition-all cursor-pointer select-none ${
                        active
                          ? 'bg-blue-50/90 dark:bg-blue-950/50 border-blue-300 dark:border-blue-800 text-blue-700 dark:text-blue-300 font-semibold'
                          : 'bg-zinc-100/70 dark:bg-zinc-800/40 border-zinc-200 dark:border-zinc-800 text-zinc-400 opacity-60'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={() => setToggles((prev) => ({ ...prev, [p]: !prev[p] }))}
                        className="sr-only"
                      />
                      <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-blue-500' : 'bg-zinc-400'}`} />
                      {label}
                    </label>
                  );
                })}
              </div>

              <button
                onClick={handleTriggerLatestCombined}
                disabled={loading || chatSets.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 active:bg-purple-800 disabled:opacity-40 text-white rounded-lg text-xs font-semibold shadow-xs transition-all cursor-pointer shrink-0"
                title="সম্মিলিত সেরা উত্তর"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>সম্মিলিত সেরা উত্তর</span>
              </button>
            </div>

            <div className="flex items-end gap-2 bg-zinc-100 dark:bg-zinc-800/80 p-2 rounded-2xl border border-zinc-200 dark:border-zinc-700/80 focus-within:ring-2 focus-within:ring-blue-500 transition-all">
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={handlePromptChange}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSearch();
                  }
                }}
                rows={1}
                placeholder="আপনার নতুন প্রশ্ন লিখুন... (Enter চাপুন, নতুন লাইনের জন্য Shift+Enter)"
                className="flex-1 bg-transparent border-0 resize-none text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-hidden px-2 py-1 max-h-[160px] min-h-[40px] leading-relaxed"
              />

              {loading ? (
                <button
                  onClick={handleCancelCurrentSearch}
                  className="p-2 sm:px-3 sm:py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold shadow-xs flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer"
                  title="থামাও"
                >
                  <StopCircle className="w-4 h-4" />
                  <span className="hidden sm:inline">থামাও</span>
                </button>
              ) : (
                <button
                  onClick={() => handleSearch()}
                  disabled={!prompt.trim()}
                  className="p-2 sm:px-4 sm:py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl text-xs font-semibold shadow-xs flex items-center gap-1.5 shrink-0 transition-all cursor-pointer"
                  title="জিজ্ঞাসা করো"
                >
                  <ArrowUp className="w-4 h-4" />
                  <span className="hidden sm:inline">জিজ্ঞাসা করো</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
