import React, { useState, useEffect } from 'react';
import { X, Loader2, CheckCircle2, AlertTriangle, ShieldCheck, Sparkles, Brain, Cpu } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  showReasoning?: boolean;
  setShowReasoning?: (val: boolean) => void;
}

const DEFAULT_MODELS: Record<string, string> = {
  chatgpt: '',
  claude: 'google/gemma-4-31b-it:free',
  gemini: 'gemini-3.1-flash-lite',
};

const PROVIDER_TITLES: Record<string, string> = {
  chatgpt: 'ChatGPT (OpenAI / OpenRouter / Groq)',
  claude: 'Claude (Anthropic / OpenRouter)',
  gemini: 'Gemini (Google GenAI সার্ভার ইন্টিগ্রেশন)',
};

export default function SettingsModal({ isOpen, onClose, showReasoning, setShowReasoning }: Props) {
  const [internalShowReasoning, setInternalShowReasoning] = useState<boolean>(() => {
    return localStorage.getItem('showReasoning') === 'true';
  });
  const [config, setConfig] = useState(() => JSON.parse(localStorage.getItem('aiConfig') || '{}'));
  const [systemPrompt, setSystemPrompt] = useState(() => localStorage.getItem('systemPrompt') || '');
  const [maxTokens, setMaxTokens] = useState(() => localStorage.getItem('maxTokens') || '4096');
  const [reasoningEffort, setReasoningEffort] = useState(() => localStorage.getItem('reasoningEffort') || 'medium');
  const [testStatus, setTestStatus] = useState<Record<string, { loading: boolean; message: string; ok?: boolean }>>({});

  useEffect(() => {
    localStorage.setItem('aiConfig', JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    localStorage.setItem('systemPrompt', systemPrompt);
  }, [systemPrompt]);

  useEffect(() => {
    localStorage.setItem('maxTokens', maxTokens);
  }, [maxTokens]);

  useEffect(() => {
    localStorage.setItem('reasoningEffort', reasoningEffort);
  }, [reasoningEffort]);

  if (!isOpen) return null;

  const updateConfig = (key: string, field: string, value: string) => {
    setConfig((prev: any) => ({ ...prev, [key]: { ...(prev[key] || {}), [field]: value } }));
  };

  const testConnection = async (provider: string) => {
    setTestStatus((prev) => ({ ...prev, [provider]: { loading: true, message: 'পরীক্ষা চলছে...' } }));

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          messages: [{ role: 'user', content: 'Hi' }],
          apiKey: config[provider]?.apiKey,
          baseURL: config[provider]?.baseURL,
          model: config[provider]?.model || DEFAULT_MODELS[provider],
          systemPrompt,
          stream: false,
          maxTokens: Number(maxTokens) || 4096,
          reasoningEffort,
        }),
      });

      const rawText = await response.text();
      let data: any = null;
      try {
        data = JSON.parse(rawText);
      } catch {}

      if (response.ok) {
        setTestStatus((prev) => ({
          ...prev,
          [provider]: { loading: false, ok: true, message: `সফল! (HTTP ${response.status})` },
        }));
      } else {
        const errDetail = data?.error || rawText.slice(0, 100);
        setTestStatus((prev) => ({
          ...prev,
          [provider]: { loading: false, ok: false, message: `ব্যর্থ (HTTP ${response.status}): ${errDetail}` },
        }));
      }
    } catch (e: any) {
      setTestStatus((prev) => ({
        ...prev,
        [provider]: { loading: false, ok: false, message: `ব্যর্থ: ${e.message}` },
      }));
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl w-full max-w-lg border border-zinc-200 dark:border-zinc-800 flex flex-col max-h-[90vh] shadow-2xl">
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-white">API সেটিংস ও কন্ট্রোল প্যানেল</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">সব তথ্য নিরাপদভাবে আপনার ডিভাইসের localStorage-এ সেভ থাকবে</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-5 overflow-y-auto flex-grow space-y-6">
          {/* Security Notice */}
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 text-xs text-amber-800 dark:text-amber-300">
            <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
            <p className="leading-relaxed">
              <strong>নিরাপত্তা সতর্কতা:</strong> আপনার গোপন API key সুরক্ষিত সার্ভার প্রক্সির মাধ্যমে হ্যান্ডেল করা হয়।
            </p>
          </div>

          {/* Reasoning & Token Controls (Requirement 6) */}
          <div className="bg-purple-50/50 dark:bg-purple-950/20 p-4 rounded-xl border border-purple-200/80 dark:border-purple-900/50 space-y-3.5">
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              <h3 className="text-xs font-bold text-purple-900 dark:text-purple-200 uppercase tracking-wider">
                রিজনিং ও টোকেন নিয়ন্ত্রণ (Reasoning & Tokens)
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  রিজনিং মাত্রা (Reasoning Effort)
                </label>
                <select
                  value={reasoningEffort}
                  onChange={(e) => setReasoningEffort(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 focus:outline-hidden focus:ring-1 focus:ring-purple-500 cursor-pointer"
                >
                  <option value="low">কম / দ্রুত উত্তর (রিজনিং কমাবে)</option>
                  <option value="medium">মাঝারি / স্ট্যান্ডার্ড (ডিফল্ট)</option>
                  <option value="high">উচ্চ / গভীর চিন্তাভাবনা</option>
                </select>
                <span className="text-[10px] text-zinc-400 mt-1 block">
                  'কম' রাখলে অযথা লম্বা চেইন-অব-থট হবে না এবং দ্রুত উত্তর আসবে।
                </span>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  সর্বোচ্চ টোকেন সীমা (Max Tokens)
                </label>
                <input
                  type="number"
                  min="256"
                  max="16384"
                  step="512"
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(e.target.value)}
                  placeholder="ডিফল্ট: 4096"
                  className="w-full text-xs p-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-mono text-zinc-800 dark:text-zinc-200 focus:outline-hidden focus:ring-1 focus:ring-purple-500"
                />
                <span className="text-[10px] text-zinc-400 mt-1 block">
                  মডেল থেকে সর্বোচ্চ কত বড় উত্তর আসতে পারবে।
                </span>
              </div>
            </div>

            {/* Toggle: চিন্তাভাবনা দেখাও (Requirement 2) */}
            <div className="pt-3 border-t border-purple-200/60 dark:border-purple-900/40 flex items-center justify-between">
              <div>
                <label htmlFor="show-reasoning-toggle" className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 block cursor-pointer">
                  চিন্তাভাবনা দেখাও
                </label>
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  চালু করলে কার্ডে উত্তরের উপরে রিজনিং / চিন্তাভাবনা বক্স দেখা যাবে (ডিফল্ট বন্ধ)।
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-3">
                <input
                  id="show-reasoning-toggle"
                  type="checkbox"
                  checked={showReasoning !== undefined ? showReasoning : internalShowReasoning}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setInternalShowReasoning(checked);
                    localStorage.setItem('showReasoning', String(checked));
                    if (setShowReasoning) {
                      setShowReasoning(checked);
                    }
                  }}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-zinc-300 peer-focus:outline-hidden rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-zinc-600 peer-checked:bg-purple-600"></div>
              </label>
            </div>
          </div>

          {/* System Prompt (Optional) */}
          <div className="bg-zinc-50 dark:bg-zinc-800/40 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800">
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
              সিস্টেম প্রম্পট / System Prompt (ঐচ্ছিক)
            </label>
            <textarea
              placeholder="যেমন: 'সব প্রশ্নের উত্তর বাংলায় ও সংক্ষেপে বুলেট পয়েন্টে দেবে।'"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={2}
              className="w-full text-xs p-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1 block">
              এই নির্দেশনাটি তিনটি AI-র কাছেই প্রতিবার একসাথে পাঠানো হবে।
            </span>
          </div>

          {/* AI Providers */}
          {(['chatgpt', 'claude', 'gemini'] as const).map((p) => {
            const status = testStatus[p];
            const isGemini = p === 'gemini';

            return (
              <div
                key={p}
                className="bg-zinc-50/70 dark:bg-zinc-800/30 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800/80 space-y-3"
              >
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-1.5">
                    {isGemini && <Sparkles className="w-4 h-4 text-purple-500" />}
                    <h3 className="font-bold text-sm text-zinc-800 dark:text-zinc-200">{PROVIDER_TITLES[p]}</h3>
                  </div>
                  <button
                    onClick={() => testConnection(p)}
                    disabled={status?.loading}
                    className="text-xs font-semibold px-2.5 py-1 rounded-md bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-zinc-800 dark:text-zinc-100 transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-60"
                  >
                    {status?.loading && <Loader2 className="w-3 h-3 animate-spin" />}
                    কানেকশন টেস্ট
                  </button>
                </div>

                {/* Gemini built-in server badge */}
                {isGemini && (
                  <div className="p-2.5 rounded-lg bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-900/50 text-[11px] text-purple-700 dark:text-purple-300 flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 shrink-0 text-purple-600 dark:text-purple-400" />
                    <span>সার্ভার-সাইডে প্ল্যাটফর্মের ডিফল্ট Gemini API Key সুরক্ষিতভাবে ব্যবহৃত হচ্ছে। কোনো আলাদা কী প্রয়োজন নেই।</span>
                  </div>
                )}

                {status && (
                  <div
                    className={`text-xs p-2 rounded-lg flex items-center gap-1.5 ${
                      status.ok
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/50'
                        : 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900/50'
                    }`}
                  >
                    {status.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
                    <span className="break-words">{status.message}</span>
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                    কার্ডের নাম (Display Name)
                  </label>
                  <input
                    type="text"
                    placeholder={`ডিফল্ট: ${p === 'chatgpt' ? 'ChatGPT' : p === 'claude' ? 'Claude' : 'Gemini'}`}
                    value={config[p]?.displayName || ''}
                    onChange={(e) => updateConfig(p, 'displayName', e.target.value)}
                    className="w-full text-xs p-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {/* API Key only for ChatGPT and Claude */}
                {!isGemini && (
                  <div>
                    <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                      API Key <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="password"
                      placeholder={p === 'chatgpt' ? 'sk-... বা sk-or-...' : 'sk-ant-...'}
                      value={config[p]?.apiKey || ''}
                      onChange={(e) => updateConfig(p, 'apiKey', e.target.value)}
                      className="w-full text-xs p-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-mono focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                    মডেলের নাম (Model Name)
                  </label>
                  <input
                    type="text"
                    placeholder={DEFAULT_MODELS[p] ? `ডিফল্ট: ${DEFAULT_MODELS[p]}` : 'যেমন: openai/gpt-4o বা meta-llama/llama-3-8b'}
                    value={config[p]?.model || ''}
                    onChange={(e) => updateConfig(p, 'model', e.target.value)}
                    className="w-full text-xs p-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-mono focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {/* Base URL only for ChatGPT and Claude */}
                {!isGemini && (
                  <div>
                    <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                      Base URL {p === 'claude' ? '(ঐচ্ছিক — ডিফল্ট বা https://api.anthropic.com)' : '(ঐচ্ছিক — যেমন OpenRouter বা Groq)'}
                    </label>
                    <input
                      type="text"
                      placeholder={p === 'claude' ? 'https://api.anthropic.com বা https://openrouter.ai/api/v1' : 'https://openrouter.ai/api/v1 বা https://api.groq.com/openai/v1'}
                      value={config[p]?.baseURL || ''}
                      onChange={(e) => updateConfig(p, 'baseURL', e.target.value)}
                      className="w-full text-xs p-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-mono focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Sticky Footer */}
        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 shrink-0 bg-white dark:bg-zinc-900 rounded-b-2xl">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl font-semibold text-sm transition-colors shadow-sm cursor-pointer"
          >
            সেভ করো ও বন্ধ করো
          </button>
        </div>
      </div>
    </div>
  );
}
