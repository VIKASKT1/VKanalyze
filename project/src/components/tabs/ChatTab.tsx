import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Bot, User, AlertCircle, Trash2 } from 'lucide-react';
import { chatWithData } from '../../lib/ai';
import { checkRateLimit } from '../../lib/rate-limit';
import { saveChatMessage, loadChatHistory } from '../../lib/supabase';
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

  function handleClearHistory() {
    setMessages([]);
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
        <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
        <span className="ml-2 text-slate-400 text-sm">Loading chat history…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[600px]">
      {messages.length > 0 && (
        <div className="flex items-center justify-between pb-3 border-b border-slate-700/50 mb-3">
          <span className="text-xs text-slate-500">
            {messages.length} message{messages.length !== 1 ? 's' : ''} in this conversation
          </span>
          <button
            onClick={handleClearHistory}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-red-400 transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-4 pr-1 pb-2">
        {messages.length === 0 && (
          <div className="py-8 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-500/10 mb-3">
              <Bot className="w-6 h-6 text-blue-400" />
            </div>
            <p className="text-slate-300 font-medium">
              Ask anything about "{datasetName}"
            </p>
            <p className="text-slate-500 text-sm mt-1">
              {rowCount.toLocaleString()} rows · {columns.length} columns
            </p>
            <div className="flex flex-wrap gap-2 justify-center mt-5">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => handleSend(s)}
                  className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-300 transition"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${msg.role === 'user' ? 'bg-blue-600' : 'bg-slate-700'}`}>
              {msg.role === 'user' ? <User className="w-4 h-4 text-white" /> : <Bot className="w-4 h-4 text-slate-300" />}
            </div>
            <div className={`max-w-[80%] px-4 py-3 rounded-xl text-sm leading-relaxed whitespace-pre-wrap ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-200 border border-slate-700/50'}`}>
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center">
              <Bot className="w-4 h-4 text-slate-300" />
            </div>
            <div className="px-4 py-3 rounded-xl bg-slate-800 border border-slate-700/50">
              <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
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

      <div className="flex gap-2 pt-3 border-t border-slate-700/50">
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question… (Enter to send, Shift+Enter for new line)"
          rows={1}
          disabled={loading}
          className="flex-1 resize-none px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          style={{ maxHeight: 120, overflowY: 'auto' }}
        />
        <button
          onClick={() => handleSend()}
          disabled={loading || !input.trim()}
          className="flex-shrink-0 w-10 h-10 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition"
        >
          <Send className="w-4 h-4 text-white" />
        </button>
      </div>
    </div>
  );
}
