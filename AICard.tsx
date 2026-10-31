import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Loader2, AlertCircle, Clock, Brain, ChevronDown, Check, RefreshCw, Star, Maximize2 } from 'lucide-react';

interface Props {
  id: 'chatgpt' | 'claude' | 'gemini';
  name: string;
  model: string;
  fallbackModel?: string;
  isAlternativeModel?: boolean;
  loading: boolean;
  statusMessage?: string;
  content: string;
  reasoning?: string;
  error?: string;
  timeTaken?: number;
  url?: string;
  showReasoning?: boolean;
  onRetry?: () => void;
  onExpand?: (content: string, name: string) => void;
}

// Requirement 1: Green logo for ChatGPT, Orange logo for Claude, Purple gradient for Gemini
const ICONS: Record<Props['id'], React.JSX.Element> = {
  chatgpt: (
    <div className="w-8 h-8 rounded-full bg-[#10A37F] flex items-center justify-center text-white font-bold text-xs shadow-sm shrink-0">
      <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
        <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 14.93V17a1 1 0 0 1-2 0v-.07A5 5 0 0 1 7.07 13H7a1 1 0 0 1 0-2h.07A5 5 0 0 1 11 7.07V7a1 1 0 0 1 2 0v.07A5 5 0 0 1 16.93 11H17a1 1 0 0 1 0 2h-.07A5 5 0 0 1 13 16.93z" />
      </svg>
    </div>
  ),
  claude: (
    <div className="w-8 h-8 rounded-full bg-[#D97757] flex items-center justify-center text-white font-bold text-xs shadow-sm shrink-0">
      <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
        <path d="M12 2l2.4 6.6L21 11l-5.6 4.4L17 22l-5-4-5 4 1.6-6.6L3 11l6.6-2.4L12 2z" />
      </svg>
    </div>
  ),
  gemini: (
    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#1B72E8] via-[#8E24AA] to-[#D96570] flex items-center justify-center text-white shadow-sm shrink-0">
      <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
        <path d="M12 2C12 7.5 7.5 12 2 12c5.5 0 10 4.5 10 10 0-5.5 4.5-10 10-10-5.5 0-10-4.5-10-10z" />
      </svg>
    </div>
  ),
};

const BORDER_COLORS: Record<Props['id'], string> = {
  chatgpt: 'border-t-[#10A37F]',
  claude: 'border-t-[#D97757]',
  gemini: 'border-t-[#8E24AA]',
};

function getErrorCategory(errorText: string) {
  const lower = (errorText || '').toLowerCase();
  if (lower.includes('429') || lower.includes('rate limit') || lower.includes('quota')) {
    return {
      category: 'রেট লিমিট (429 Rate Limit)',
      badgeClass:
        'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800',
      description: 'এই API-র ব্যবহারের কোটা বা রিকোয়েস্ট সীমা শেষ হয়েছে। কিছুক্ষণ অপেক্ষা করে আবার চেষ্টা করুন।',
    };
  }
  if (
    lower.includes('503') ||
    lower.includes('502') ||
    lower.includes('504') ||
    lower.includes('সার্ভার ব্যস্ত') ||
    lower.includes('service unavailable') ||
    lower.includes('high demand')
  ) {
    return {
      category: 'সার্ভার ব্যস্ত (503 Server Busy)',
      badgeClass:
        'bg-orange-100 dark:bg-orange-950/60 text-orange-800 dark:text-orange-300 border-orange-300 dark:border-orange-800',
      description: 'এআই প্রদানকারীর সার্ভার বর্তমানে অত্যন্ত ব্যস্ত বা সাময়িকভাবে ডাউন রয়েছে।',
    };
  }
  if (
    lower.includes('401') ||
    lower.includes('403') ||
    lower.includes('api key') ||
    lower.includes('unauthorized') ||
    lower.includes('কী দেওয়া হয়নি') ||
    lower.includes('invalid')
  ) {
    return {
      category: 'ভুল বা অনুপস্থিত API Key (401)',
      badgeClass:
        'bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300 border-red-300 dark:border-red-800',
      description: 'প্রদত্ত API কী-টি সঠিক নয় বা সেটিংসে প্রদান করা হয়নি। সেটিংসে গিয়ে কী যাচাই করুন।',
    };
  }
  if (lower.includes('সময় শেষ') || lower.includes('timeout') || lower.includes('ধীর') || lower.includes('১৮০')) {
    return {
      category: 'টাইমআউট (Timeout 180s)',
      badgeClass:
        'bg-yellow-100 dark:bg-yellow-950/60 text-yellow-800 dark:text-yellow-300 border-yellow-300 dark:border-yellow-800',
      description: '১৮০ সেকেন্ডের মধ্যে কোনো নতুন ডেটা আসেনি, মডেলটি অতিরিক্ত সময় নিচ্ছে।',
    };
  }
  return {
    category: 'কল ব্যর্থ হয়েছে',
    badgeClass:
      'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800',
    description: '',
  };
}

export default function AICard({
  id,
  name,
  model,
  fallbackModel,
  isAlternativeModel,
  loading,
  statusMessage,
  content,
  reasoning,
  error,
  timeTaken,
  url,
  showReasoning = false,
  onRetry,
  onExpand,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [reasoningExpanded, setReasoningExpanded] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isAutoScrolling, setIsAutoScrolling] = useState(true);

  // Auto-scroll logic
  useEffect(() => {
    if (loading && isAutoScrolling && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [content, loading, isAutoScrolling]);

  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      // If user scrolls up by more than 50px, disable auto-scroll
      if (scrollHeight - scrollTop - clientHeight > 50) {
        setIsAutoScrolling(false);
      } else {
        setIsAutoScrolling(true);
      }
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const hasLiveStreaming = loading && (Boolean(content) || (showReasoning && Boolean(reasoning)));
  const errCategory = error ? getErrorCategory(error) : null;

  return (
    <div
      className={`bg-white dark:bg-zinc-900 p-5 rounded-2xl shadow-md border border-zinc-200 dark:border-zinc-800 border-t-4 flex flex-col h-[65vh] min-h-[380px] max-h-[600px] overflow-hidden transition-all ${BORDER_COLORS[id]}`}
    >
      {/* Header */}
      <div className="flex justify-between items-start mb-4 border-b border-zinc-100 dark:border-zinc-800/80 pb-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {ICONS[id]}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-bold text-zinc-900 dark:text-white leading-tight break-words">
                {name}
              </h3>

              {isAlternativeModel && (
                <span className="text-[10px] font-medium text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-md border border-zinc-200 dark:border-zinc-700">
                  বিকল্প মডেল
                </span>
              )}

              {hasLiveStreaming && (
                <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-900">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  লাইভ
                </span>
              )}
            </div>

            <div className="mt-1">
              {fallbackModel ? (
                <p className="text-xs text-amber-600 dark:text-amber-400 font-mono font-semibold">
                  চলেছে: {fallbackModel} (ফলব্যাক)
                </p>
              ) : model ? (
                <p className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">
                  চলছে: {model}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end text-xs text-zinc-400 shrink-0 ml-2">
          {timeTaken !== undefined && (
            <span className="flex items-center text-zinc-500 dark:text-zinc-400 font-medium">
              <Clock className="w-3.5 h-3.5 mr-1 text-zinc-400" />
              {timeTaken.toFixed(2)}s
            </span>
          )}
          {url && (
            <span
              className="truncate max-w-[140px] text-[11px] text-zinc-400 dark:text-zinc-500 font-mono"
              title={url}
            >
              {url.replace(/^https?:\/\//, '')}
            </span>
          )}
        </div>
      </div>

      {/* Main Body */}
      <div className="flex-grow overflow-auto flex flex-col min-h-0 overscroll-contain [scrollbar-width:thin] [scrollbar-color:theme(colors.zinc.300)_transparent] dark:[scrollbar-color:theme(colors.zinc.700)_transparent]" ref={scrollRef} onScroll={handleScroll}>
        {/* Loading without tokens yet */}
        {loading && !content && (!showReasoning || !reasoning) && (
          <div className="flex flex-col items-center justify-center py-16 text-center my-auto">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-3" />
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {statusMessage || 'উত্তর তৈরি হচ্ছে...'}
            </p>
            {statusMessage && (
              <span className="text-xs text-amber-600 dark:text-amber-400 mt-1 font-medium animate-pulse">
                স্বয়ংক্রিয় রিট্রাই প্রসেস চলমান
              </span>
            )}
          </div>
        )}

        {/* Categorized Error Message */}
        {error && errCategory && (
          <div className="p-4 bg-red-50/80 dark:bg-red-950/40 rounded-xl text-sm border border-red-200 dark:border-red-900/60 my-auto">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold mb-1.5 border ${errCategory.badgeClass}`}>
                  {errCategory.category}
                </span>
                <p className="text-xs text-zinc-700 dark:text-zinc-300 font-mono break-words leading-relaxed">
                  {error}
                </p>
                {errCategory.description && (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2">
                    {errCategory.description}
                  </p>
                )}
                {onRetry && (
                  <button
                    onClick={onRetry}
                    className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition-colors cursor-pointer shadow-xs"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    আবার চেষ্টা করো
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Reasoning / Thinking Box */}
        {showReasoning && reasoning && !error && (
          <div className="mb-4 rounded-xl border border-purple-200 dark:border-purple-900/60 bg-purple-50/50 dark:bg-purple-950/20 overflow-hidden">
            <button
              onClick={() => setReasoningExpanded(!reasoningExpanded)}
              className="w-full flex items-center justify-between p-2.5 px-3 text-xs font-semibold text-purple-900 dark:text-purple-300 hover:bg-purple-100/50 dark:hover:bg-purple-900/30 transition-colors cursor-pointer select-none"
            >
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <span>চিন্তাভাবনা ও বিশ্লেষণ (Reasoning)</span>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-purple-600 dark:text-purple-400 transition-transform ${
                  reasoningExpanded ? 'rotate-180' : ''
                }`}
              />
            </button>
            {reasoningExpanded && (
              <div className="p-3 pt-0 text-xs text-zinc-600 dark:text-zinc-300 font-mono whitespace-pre-wrap border-t border-purple-100 dark:border-purple-900/40 max-h-48 overflow-y-auto leading-relaxed">
                {reasoning}
              </div>
            )}
          </div>
        )}

        {/* Markdown Content */}
        {content && !error && (
          <div className="prose dark:prose-invert max-w-none text-sm leading-relaxed">
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
              {content}
            </ReactMarkdown>
          </div>
        )}

        {/* Fallback status message / retry bar */}
        {statusMessage && loading && content && (
          <div className="mt-3 py-1.5 px-3 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900/60 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2 animate-pulse">
            <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
            <span className="truncate">{statusMessage}</span>
          </div>
        )}
      </div>

      {/* Card Footer: Expand and Copy buttons */}
      {!loading && content && !error && (
        <div className="pt-3 mt-3 border-t border-zinc-100 dark:border-zinc-800/80 flex justify-between items-center shrink-0">
            {onExpand && (
              <button
                onClick={() => onExpand(content, name)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 text-xs font-medium transition-colors cursor-pointer"
                title="বড় স্ক্রিনে দেখুন"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>বড় করো</span>
              </button>
            )}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 text-xs font-medium transition-colors cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'কপি হয়েছে!' : 'কপি করো'}</span>
          </button>
        </div>
      )}
    </div>
  );
}
