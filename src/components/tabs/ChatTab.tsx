import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Bot, User, AlertCircle, Trash2 } from 'lucide-react';
import { chatWithData } from '../../lib/ai';
import { checkRateLimit } from '../../lib/rate-limit';
import { clearChatHistory, saveChatMessage, loadChatHistory } from '../../lib/supabase';
import { usePrivacy } from '../../lib/PrivacyContext';
import LocalOnlyNotice from '../LocalOnlyNotice';
import type { ChatMessage, ColumnStats } from '../../lib/types';

interface Props {
  datasetName: string;
  columns: Array<{ name: string; type: string }>;
  statistics: Record<string, ColumnStats>;
  rowCount: number;
  qualityScore: number;
  rows: Record<string, unknown>[];
}

const SUGGESTIONS = [
  'Summarize this dataset for me.',
  'Which column has the most missing values?',
  'What are the top 5 highest values?',
  'Are there any unusual patterns?',
];

export default function ChatTab({
  datasetName,
  columns,
  statistics,
  rowCount,
  qualityScore,
  rows,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { ensureAIConsent, settings } = usePrivacy();

  useEffect(() => {
    async function fetchHistory() {
      setLoadingHistory(true);
      const history = await loadChatHistory(datasetName);
      setMessages(
        history.map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
          timestamp: m.timestamp,
        }))
      );
      setLoadingHistory(false);
    }
    fetchHistory();
  }, [datasetName]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function handleSend(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;

    const { allowed, retryAfter } = checkRateLimit('chat', 20, 60_000);
    if (!allowed) {
      setError(`Rate limit reached. Try again in ${retryAfter}s.`);
      return;
    }

    setError('');
    setInput('');

    const userMsg: ChatMessage = {
      role: 'user',
      content: msg,
      timestamp: new Date().toISOString(),
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setLoading(true);

    await saveChatMessage(datasetName, 'user', msg);

    try {
      if (!settings.localOnlyMode) await ensureAIConsent(datasetName);
      const response = await chatWithData(
        datasetName,
        columns,
        statistics,
        rowCount,
        qualityScore,
        msg,
        newMessages.map(m => ({ role: m.role, content: m.content })),
        rows
      );

      const aiMsg: ChatMessage = {
        role: 'assistant',
        content: response,
        timestamp: new Date().toISOString(),
      };

      setMessages(prev => [...prev, aiMsg]);
      await saveChatMessage(datasetName, 'assistant', response);
    } catch {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.',
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function handleClearHistory() {
    setMessages([]);
    try {
      await clearChatHistory(datasetName);
    } catch {
      // Non-critical — UI already cleared
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  if (loadingHistory) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-accent-bright" />
        <span className="ml-2 text-paper-dim text-sm">Loading chat history…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[600px]">
      {settings.localOnlyMode && <LocalOnlyNotice feature="AI Chat" />}
      {messages.length > 0 && (
        <div className="flex items-center justify-between pb-3 border-b border-ink-borderStrong/50 mb-3">
          <span className="text-xs text-paper-dim">
            {messages.length} message{messages.length !== 1 ? 's' : ''} in this conversation
          </span>
          <button
            onClick={handleClearHistory}
            aria-label="Clear chat history"
            className="flex items-center gap-1.5 text-xs text-paper-dim hover:text-red-400 transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-4 pr-1 pb-2">
        {messages.length === 0 && (
          <div className="py-8 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-accent/10 mb-3">
              <Bot className="w-6 h-6 text-accent-bright" />
            </div>
            <p className="text-paper/90 font-medium">
              Ask anything about "{datasetName}"
            </p>
            <p className="text-paper-dim text-sm mt-1">
              {rowCount.toLocaleString()} rows · {columns.length} columns
            </p>
            <div className="flex flex-wrap gap-2 justify-center mt-5">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => handleSend(s)}
                  className="px-3 py-1.5 text-xs bg-ink-raised hover:bg-ink-borderStrong border border-ink-borderStrong rounded-lg text-paper/90 transition"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${msg.role === 'user' ? 'bg-accent' : 'bg-ink-raised'}`}>
              {msg.role === 'user' ? <User className="w-4 h-4 text-paper" /> : <Bot className="w-4 h-4 text-paper/90" />}
            </div>
            <div className={`max-w-[80%] px-4 py-3 rounded-xl text-sm leading-relaxed whitespace-pre-wrap ${msg.role === 'user' ? 'bg-accent text-ink' : 'bg-ink-raised text-paper border border-ink-borderStrong/50'}`}>
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-ink-raised flex items-center justify-center">
              <Bot className="w-4 h-4 text-paper/90" />
            </div>
            <div className="px-4 py-3 rounded-xl bg-ink-raised border border-ink-borderStrong/50">
              <Loader2 className="w-4 h-4 animate-spin text-accent-bright" />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs mb-2">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="flex gap-2 pt-3 border-t border-ink-borderStrong/50">
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          aria-label="Chat message input"
          placeholder="Ask a question… (Enter to send, Shift+Enter for new line)"
          rows={1}
          disabled={loading}
          className="flex-1 resize-none px-4 py-2.5 bg-ink-raised border border-ink-borderStrong rounded-xl text-paper text-sm placeholder-paper-dimmer focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
          style={{ maxHeight: 120, overflowY: 'auto' }}
        />
        <button
          onClick={() => handleSend()}
          disabled={loading || !input.trim()}
          aria-label="Send message"
          className="flex-shrink-0 w-10 h-10 rounded-xl bg-accent hover:bg-accent-bright disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition"
        >
          <Send className="w-4 h-4 text-paper" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
