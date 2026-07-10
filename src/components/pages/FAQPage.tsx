import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Search, HelpCircle } from 'lucide-react';
import { PageShell, PageHero } from '../ui/PageShell';
import { Reveal } from '../ui/motion';

interface Props {
  onNavigate: (page: string) => void;
  onGetStarted?: () => void;
}

const FAQ_ITEMS = [
  {
    category: 'File Formats',
    questions: [
      { q: 'What file formats does VKAnalyze support?', a: 'VKAnalyze supports CSV (.csv), TSV (.tsv), Excel (.xlsx, .xls), and JSON files. Any spreadsheet software can export to these formats.' },
      { q: 'What is the maximum file size?', a: 'Files up to 50MB are supported. For very large files, we recommend splitting them into smaller chunks for best performance.' },
      { q: 'Does my data need to have headers?', a: 'Yes. VKAnalyze expects the first row to contain column names. Files without headers will be treated as having column names like "Column1", "Column2", etc.' },
    ],
  },
  {
    category: 'Privacy & Security',
    questions: [
      { q: 'Does VKAnalyze upload my data to a server?', a: 'No. File parsing happens entirely in your browser using JavaScript. Your raw data never leaves your device. By default, new datasets are set to "Local Only" — chat history and saved sessions stay in your browser\'s storage. You can opt a specific dataset into "Cloud Sync Enabled" in the Privacy Dashboard if you want that dataset\'s session metadata and chat history backed up to the cloud.' },
      { q: 'How is my account secured?', a: 'Authentication is handled by Supabase Auth with industry-standard JWT tokens. All database access is protected by Row Level Security — your data is isolated from other users.' },
      { q: 'Can VKAnalyze see my data?', a: 'No. The developer has no access to files you analyze since they stay in your browser. Chat messages stored in the database are protected by RLS policies.' },
    ],
  },
  {
    category: 'AI Features',
    questions: [
      { q: 'What AI model powers VKAnalyze?', a: 'VKAnalyze uses Google Gemini 2.0 Flash via a secure Edge Function proxy. The AI has access to your dataset metadata and statistics — not the raw rows.' },
      { q: 'What happens if the AI is unavailable?', a: 'VKAnalyze has built-in local fallback logic that can answer common questions (row counts, averages, min/max, top records) without AI when the API is unreachable.' },
      { q: 'Is the AI SQL generator accurate?', a: 'The SQL generator uses Gemini AI to translate plain English to SQL. Results are best-effort — complex queries may need manual adjustments. The fallback SQL generator handles common patterns when AI is unavailable.' },
    ],
  },
  {
    category: 'SQL & Analysis',
    questions: [
      { q: 'Can I run real SQL on my data?', a: 'Yes! The SQL tab runs queries directly against your in-browser dataset. It supports SELECT, WHERE, GROUP BY, HAVING, ORDER BY, LIMIT, and aggregate functions (COUNT, SUM, AVG, MIN, MAX).' },
      { q: 'Can I modify my data with SQL?', a: 'No. Only SELECT queries are supported for safety. Use the Clean tab for data modifications like removing duplicates or filling nulls.' },
      { q: 'How does the correlation analysis work?', a: 'VKAnalyze computes Pearson correlation coefficients between all numeric columns. Values close to 1 or -1 indicate strong correlations.' },
    ],
  },
  {
    category: 'Reports & Exports',
    questions: [
      { q: 'What does the PDF report include?', a: 'PDF reports contain 5 pages: a cover page, dataset summary, KPI dashboard, column statistics table, and AI insights. They can be shared as standalone documents.' },
      { q: 'Can I export my cleaned data?', a: 'Yes. After cleaning, you can download the processed data as a CSV file from the Clean tab.' },
      { q: 'Can I export charts?', a: 'Yes. Charts can be exported as PNG images or SVG vector files using the export buttons in the Visualize tab.' },
    ],
  },
  {
    category: 'Account & Data Storage',
    questions: [
      { q: 'Do I need an account to use VKAnalyze?', a: 'An account is required to save analysis sessions, chat history, version snapshots, and dashboard widgets. Basic file analysis does not require an account.' },
      { q: 'How long is my data stored?', a: 'Session metadata is stored indefinitely until you delete it. Raw file data is never stored — only statistics and metadata.' },
      { q: 'Can I delete my account and data?', a: 'Yes. Contact us at vikasvikki010@gmail.com with your account email and we\'ll delete all your data promptly.' },
    ],
  },
];

function FAQItem({ q, a, isOpen, onToggle, panelId }: { q: string; a: string; isOpen: boolean; onToggle: () => void; panelId: string }) {
  return (
    <div className="bg-ink-surface border border-ink-border rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={panelId}
        className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-ink-raised/50 transition-colors"
      >
        <span className="text-sm font-medium text-paper">{q}</span>
        <motion.span animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }} className="flex-shrink-0">
          <ChevronDown className="w-4 h-4 text-paper-dim" aria-hidden="true" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            id={panelId}
            role="region"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-4 text-sm text-paper-dim leading-relaxed border-t border-ink-border pt-3">{a}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function FAQPage({ onNavigate, onGetStarted }: Props) {
  const [openItem, setOpenItem] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const filtered = FAQ_ITEMS.map(cat => ({
    ...cat,
    questions: cat.questions.filter(q =>
      q.q.toLowerCase().includes(searchTerm.toLowerCase()) ||
      q.a.toLowerCase().includes(searchTerm.toLowerCase())
    ),
  })).filter(cat => cat.questions.length > 0);

  return (
    <PageShell currentPage="faq" onNavigate={onNavigate} onGetStarted={onGetStarted}>
      <PageHero
        eyebrow="Help center"
        icon={<HelpCircle className="w-8 h-8 text-accent-bright" />}
        title="Frequently asked questions"
        description="Everything you need to know about formats, privacy, AI, and exports."
      />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-24">
        <Reveal className="relative max-w-md mx-auto mb-10">
          <Search className="w-4 h-4 text-paper-dim absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search questions…"
            className="w-full bg-ink-surface border border-ink-borderStrong text-paper text-sm rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-accent placeholder-paper-dimmer transition-shadow"
          />
        </Reveal>

        {filtered.length === 0 ? (
          <div className="text-center py-12 text-paper-dim">
            <p>No results found for "{searchTerm}"</p>
            <button onClick={() => onNavigate('support')} className="text-accent-bright hover:underline mt-2 block mx-auto text-sm">
              Submit a support ticket instead
            </button>
          </div>
        ) : (
          <div className="space-y-9">
            {filtered.map(cat => (
              <Reveal key={cat.category}>
                <h2 className="text-xs font-mono font-semibold text-accent-bright uppercase tracking-[0.14em] mb-3">{cat.category}</h2>
                <div className="space-y-2">
                  {cat.questions.map(item => {
                    const key = `${cat.category}-${item.q}`;
                    return (
                      <FAQItem key={key} q={item.q} a={item.a} isOpen={openItem === key} onToggle={() => setOpenItem(openItem === key ? null : key)} panelId={`faq-panel-${key.replace(/[^a-zA-Z0-9]+/g, '-')}`} />
                    );
                  })}
                </div>
              </Reveal>
            ))}
          </div>
        )}

        <Reveal className="mt-14 text-center p-8 bg-ink-surface border border-ink-border rounded-2xl">
          <p className="text-paper/90 mb-4">Didn't find what you were looking for?</p>
          <div className="flex flex-wrap gap-3 justify-center">
            <button onClick={() => onNavigate('support')} className="px-5 py-2.5 bg-accent hover:bg-accent-bright text-ink text-sm font-semibold rounded-xl transition-colors">
              Open support ticket
            </button>
            <button onClick={() => onNavigate('contact')} className="px-5 py-2.5 bg-ink-raised hover:bg-ink-borderStrong text-paper/90 text-sm rounded-xl transition-colors">
              Contact us
            </button>
          </div>
        </Reveal>
      </div>
    </PageShell>
  );
}
