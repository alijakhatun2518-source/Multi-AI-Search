import React, { useState } from 'react';
import {
  MessageSquare,
  Clock,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Trash2,
  Sparkles,
  Copy,
  Check,
  AlertCircle,
  RefreshCw,
  X,
  Star,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import AICard from './AICard';

export interface CardResult {
  content: string;
  reasoning?: string;
  timeTaken?: number;
  error?: string;
  url?: string;
  loading?: boolean;
  statusMessage?: string;
  fallbackModel?: string;
}

export interface CombinedResult {
  loading?: boolean;
  content?: string;
  error?: string;
  copied?: boolean;
}

export interface ChatSet {
  id: string;
  prompt: string;
  customTitle?: string;
  timestamp: number;
  folderId?: string | null;
  pinned?: boolean;
  collapsed?: boolean;
  activeProviders: ('chatgpt' | 'claude' | 'gemini')[];
  results: Record<'chatgpt' | 'claude' | 'gemini', CardResult>;
  combinedResult?: CombinedResult;
}

interface Props {
  set: ChatSet;
  config: any;
  showReasoning: boolean;
  toggles: { chatgpt: boolean; claude: boolean; gemini: boolean };
  isHighlighted?: boolean;
  onToggleCollapse: (setId: string) => void;
  onDeleteSet: (setId: string) => void;
  onReAsk: (prompt: string) => void;
  onRetryProvider: (setId: string, provider: 'chatgpt' | 'claude' | 'gemini') => void;
  onGenerateCombined: (setId: string) => void;
  onDismissCombined: (setId: string) => void;
  onExpandCard: (content: string, name: string) => void;
}

export function formatTimestamp(ts: number): string {
  try {
    const d = new Date(ts);
    const time = d.toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit', hour12: true });
    const date = d.toLocaleDateString('bn-BD', { day: 'numeric', month: 'short' });
    return `${time} • ${date}`;
  } catch {
    return new Date(ts).toLocaleTimeString();
  }
}

export default function ChatSetGroup({
  set,
  config,
  showReasoning,
  toggles,
  isHighlighted = false,
  onToggleCollapse,
  onDeleteSet,
  onReAsk,
  onRetryProvider,
  onGenerateCombined,
  onDismissCombined,
  onExpandCard,
}: Props) {
  const [copiedCombined, setCopiedCombined] = useState(false);

  const isCollapsed = Boolean(set.collapsed);
  const activeProviders = set.activeProviders || ['chatgpt', 'claude', 'gemini'];

  // Check if Base URL is not official API for badge check
  const gptBase = (config.chatgpt?.baseURL || '').trim();
  const claudeBase = (config.claude?.baseURL || '').trim();

  const isGptAlternative = Boolean(gptBase && !gptBase.includes('api.openai.com'));
  const isClaudeAlternative = Boolean(claudeBase && !claudeBase.includes('api.anthropic.com'));

  return (
    <div
      id={`set-${set.id}`}
      className={`scroll-mt-20 transition-all duration-300 rounded-3xl border bg-white/80 dark:bg-zinc-900/70 backdrop-blur-xs p-4 sm:p-6 mb-7 shadow-xs ${
        isHighlighted
          ? 'border-blue-500 ring-2 ring-blue-500/50 dark:border-blue-400 dark:ring-blue-400/50 shadow-md'
          : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700/80'
      }`}
    >
      {/* Set Header: Question + Timestamp + Set Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-200/80 dark:border-zinc-800">
        {/* Left: Question info */}
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
            <MessageSquare className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-md border border-blue-200/60 dark:border-blue-900/60">
                প্রশ্ন
              </span>
              {set.pinned && (
                <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 rounded-md border border-amber-200/60 dark:border-amber-900/60">
                  <Star className="w-3 h-3 fill-amber-400 text-amber-500" />
                  পিন করা
                </span>
              )}
              <span className="flex items-center gap-1 text-[11px] text-zinc-400 dark:text-zinc-500 font-mono">
                <Clock className="w-3 h-3" />
                {formatTimestamp(set.timestamp)}
              </span>
            </div>
            <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100 whitespace-pre-wrap break-words leading-relaxed">
              {set.customTitle || set.prompt}
            </h2>
            {set.customTitle && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 italic">
                মূল প্রশ্ন: {set.prompt}
              </p>
            )}
          </div>
        </div>

        {/* Right: Actions (Collapse, Re-ask, Delete) */}
        <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
          {/* Re-ask button */}
          <button
            onClick={() => onReAsk(set.prompt)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 transition-colors cursor-pointer"
            title="এই প্রশ্নটি আবার জিজ্ঞাসা করো"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">আবার জিজ্ঞাসা করো</span>
          </button>

          {/* Collapse/Expand button */}
          <button
            onClick={() => onToggleCollapse(set.id)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 transition-colors cursor-pointer"
            title={isCollapsed ? 'উত্তরগুলো দেখুন' : 'উত্তরগুলো ভাঁজ করুন'}
          >
            {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            <span>{isCollapsed ? 'খোলো' : 'ভাঁজ করো'}</span>
          </button>

          {/* Delete this set button */}
          <button
            onClick={() => onDeleteSet(set.id)}
            className="flex items-center gap-1 p-1.5 sm:px-2 sm:py-1.5 rounded-lg text-xs font-medium text-red-500 hover:text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 border border-zinc-200 dark:border-zinc-700 hover:border-red-200 dark:hover:border-red-900 transition-colors cursor-pointer"
            title="শুধু এই সেটটি মুছে ফেলো"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden md:inline">মুছে ফেলো</span>
          </button>
        </div>
      </div>

      {/* Set Body: Cards or Collapsed View */}
      {isCollapsed ? (
        <div
          onClick={() => onToggleCollapse(set.id)}
          className="mt-3.5 p-3 rounded-2xl bg-zinc-100/70 dark:bg-zinc-800/40 border border-dashed border-zinc-300 dark:border-zinc-700 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800/70 transition-colors"
        >
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            ৩টি AI-র উত্তর ভাঁজ করা আছে — বিস্তারিত দেখতে ক্লিক করুন
          </span>
          <span className="text-blue-600 dark:text-blue-400 font-semibold flex items-center gap-1">
            খোলো <ChevronDown className="w-3.5 h-3.5" />
          </span>
        </div>
      ) : (
        <div className="mt-4 space-y-5">
          {/* 3 AI Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-start">
            {activeProviders.includes('chatgpt') && (
              <AICard
                id="chatgpt"
                name={config.chatgpt?.displayName || 'ChatGPT'}
                model={config.chatgpt?.model || ''}
                fallbackModel={set.results?.chatgpt?.fallbackModel}
                isAlternativeModel={isGptAlternative}
                loading={Boolean(set.results?.chatgpt?.loading)}
                statusMessage={set.results?.chatgpt?.statusMessage}
                content={set.results?.chatgpt?.content || ''}
                reasoning={set.results?.chatgpt?.reasoning}
                error={set.results?.chatgpt?.error}
                timeTaken={set.results?.chatgpt?.timeTaken}
                url={set.results?.chatgpt?.url}
                showReasoning={showReasoning}
                onRetry={() => onRetryProvider(set.id, 'chatgpt')}
                onExpand={onExpandCard}
              />
            )}

            {activeProviders.includes('claude') && (
              <AICard
                id="claude"
                name={config.claude?.displayName || 'Claude'}
                model={config.claude?.model || 'google/gemma-4-31b-it:free'}
                fallbackModel={set.results?.claude?.fallbackModel}
                isAlternativeModel={isClaudeAlternative}
                loading={Boolean(set.results?.claude?.loading)}
                statusMessage={set.results?.claude?.statusMessage}
                content={set.results?.claude?.content || ''}
                reasoning={set.results?.claude?.reasoning}
                error={set.results?.claude?.error}
                timeTaken={set.results?.claude?.timeTaken}
                url={set.results?.claude?.url}
                showReasoning={showReasoning}
                onRetry={() => onRetryProvider(set.id, 'claude')}
                onExpand={onExpandCard}
              />
            )}

            {activeProviders.includes('gemini') && (
              <AICard
                id="gemini"
                name={config.gemini?.displayName || 'Gemini'}
                model={config.gemini?.model || 'gemini-3.1-flash-lite'}
                fallbackModel={set.results?.gemini?.fallbackModel}
                isAlternativeModel={false}
                loading={Boolean(set.results?.gemini?.loading)}
                statusMessage={set.results?.gemini?.statusMessage}
                content={set.results?.gemini?.content || ''}
                reasoning={set.results?.gemini?.reasoning}
                error={set.results?.gemini?.error}
                timeTaken={set.results?.gemini?.timeTaken}
                url={set.results?.gemini?.url}
                showReasoning={showReasoning}
                onRetry={() => onRetryProvider(set.id, 'gemini')}
                onExpand={onExpandCard}
              />
            )}
          </div>

          {/* Combined Best Answer Section for THIS set */}
          {set.combinedResult && (
            <div className="mt-4 p-5 rounded-2xl bg-purple-50/70 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/60 shadow-xs transition-all">
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-purple-200/70 dark:border-purple-900/50 mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-purple-600 text-white flex items-center justify-center shadow-xs">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                      সম্মিলিত সেরা উত্তর ও মডেল তুলনা
                    </h3>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      এই সেটের সকল AI-র উত্তরের সমন্বিত সেরা রূপ (আসল মডেলের নামসহ)
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {set.combinedResult.content && (
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(set.combinedResult?.content || '');
                        setCopiedCombined(true);
                        setTimeout(() => setCopiedCombined(false), 2000);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 rounded-lg text-xs font-semibold border border-purple-200 dark:border-purple-800 transition-colors cursor-pointer"
                    >
                      {copiedCombined ? (
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>{copiedCombined ? 'কপি হয়েছে!' : 'কপি করো'}</span>
                    </button>
                  )}
                  <button
                    onClick={() => onDismissCombined(set.id)}
                    className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-purple-100/50 dark:hover:bg-purple-900/40 rounded-lg transition-colors cursor-pointer"
                    title="এই সেকশনটি বন্ধ করুন"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Loading State */}
              {set.combinedResult.loading && (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <RefreshCw className="w-7 h-7 animate-spin text-purple-600 mb-2.5" />
                  <p className="text-xs sm:text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    তিনটি AI-র উত্তর পর্যালোচনা ও তুলনা করে সমন্বিত উত্তর তৈরি হচ্ছে...
                  </p>
                  <p className="text-[11px] text-zinc-400 mt-1">
                    সবচেয়ে নির্ভরযোগ্য ও তথ্যবহুল অংশগুলো একত্রিত করা হচ্ছে
                  </p>
                </div>
              )}

              {/* Error State */}
              {set.combinedResult.error && (
                <div className="p-3.5 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 rounded-xl text-xs sm:text-sm border border-red-200 dark:border-red-900/50 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <strong>সমন্বিত উত্তর তৈরি ব্যর্থ হয়েছে:</strong>
                    <p className="text-xs font-mono mt-1">{set.combinedResult.error}</p>
                  </div>
                </div>
              )}

              {/* Rendered Markdown Content */}
              {!set.combinedResult.loading &&
                !set.combinedResult.error &&
                set.combinedResult.content && (
                  <div className="prose dark:prose-invert max-w-none text-xs sm:text-sm leading-relaxed">
                    <ReactMarkdown
                      components={{
                        code({ className, children, ...props }) {
                          const match = /language-(\w+)/.exec(className || '');
                          const { node, inline, ...rest } = props as any;
                          return match ? (
                            <SyntaxHighlighter
                              style={vscDarkPlus as any}
                              language={match[1]}
                              PreTag="div"
                              {...rest}
                            >
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
                      {set.combinedResult.content}
                    </ReactMarkdown>
                  </div>
                )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
