import { BarChart2, Sparkles, Wand2, Shield, FileText, Zap, Github, ArrowRight, CheckCircle2 } from 'lucide-react';

interface Props {
  onGetStarted: () => void;
}

export default function HomePage({ onGetStarted }: Props) {
  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* NAVBAR */}
      <nav className="border-b border-slate-800 bg-slate-950/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart2 className="w-6 h-6 text-blue-400" />
            <span className="font-bold text-white text-lg tracking-tight">VKAnalyze</span>
          </div>
          <div className="hidden md:flex items-center gap-6">
            <button onClick={() => scrollTo('features')} className="text-sm text-slate-400 hover:text-white transition">Features</button>
            <button onClick={() => scrollTo('how-it-works')} className="text-sm text-slate-400 hover:text-white transition">How It Works</button>
            <button onClick={() => scrollTo('about')} className="text-sm text-slate-400 hover:text-white transition">About</button>
          </div>
          <button
            onClick={onGetStarted}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition shadow-lg shadow-blue-600/20"
          >
            Get Started <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </nav>

      {/* HERO */}
      <section className="relative overflow-hidden pt-24 pb-20 px-4 sm:px-6">
        <div className="absolute inset-0 bg-gradient-to-b from-blue-950/20 to-transparent pointer-events-none" />
        <div className="max-w-4xl mx-auto text-center relative">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-medium mb-6">
            <Sparkles className="w-3.5 h-3.5" />
            Built with Gemini AI
          </div>
          <h1 className="text-5xl sm:text-6xl font-bold text-white leading-tight mb-6">
            Analyze Your Spreadsheets<br />
            <span className="text-blue-400">with AI</span>
          </h1>
          <p className="text-lg sm:text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Upload any CSV or Excel file. Get instant statistics, AI-powered insights, beautiful charts, and clean exports — all in your browser.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-8">
            <button
              onClick={onGetStarted}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl transition shadow-lg shadow-blue-600/25 text-base"
            >
              Start Analyzing Free <ArrowRight className="w-5 h-5" />
            </button>
            <button
              onClick={() => scrollTo('how-it-works')}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold rounded-xl transition text-base"
            >
              See How It Works
            </button>
          </div>
          <p className="text-xs text-slate-500">No installation · No server uploads · Your data stays in your browser</p>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="py-20 px-4 sm:px-6 bg-slate-900/40">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-3">Everything You Need to Analyze Data</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: BarChart2, title: 'Smart Visualizations', desc: 'Bar, line, pie, scatter, and histogram charts generated automatically from your data.' },
              { icon: Sparkles, title: 'Gemini AI Chat', desc: 'Ask questions about your dataset in plain English. Get instant accurate answers.' },
              { icon: Wand2, title: 'Data Cleaning', desc: 'Remove duplicates, fill missing values, trim whitespace — with one click.' },
              { icon: Shield, title: '100% Private', desc: 'Your files never leave your browser. No server uploads. No data collection.' },
              { icon: FileText, title: 'PDF Reports', desc: 'Export professional PDF reports with statistics and insights included.' },
              { icon: Zap, title: 'Instant Profiling', desc: 'Automatic column type detection, null counts, unique values, and quality scoring.' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="p-6 rounded-2xl bg-slate-800/50 border border-slate-700/50 hover:border-blue-500/30 hover:bg-slate-800 transition-all group">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center mb-4 group-hover:bg-blue-500/20 transition-colors">
                  <Icon className="w-5 h-5 text-blue-400" />
                </div>
                <h3 className="text-base font-semibold text-white mb-2">{title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="py-20 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-3">How It Works</h2>
            <p className="text-slate-400">Three steps to data insights</p>
          </div>
          <div className="flex flex-col md:flex-row gap-8 items-start">
            {[
              { step: '1', title: 'Upload Your File', desc: 'Drag and drop any CSV or Excel file. Up to 50MB supported.' },
              { step: '2', title: 'Explore and Clean', desc: 'View statistics, generate charts, clean your data, and chat with AI.' },
              { step: '3', title: 'Export Insights', desc: 'Download cleaned data as CSV or export a full PDF report.' },
            ].map(({ step, title, desc }) => (
              <div key={step} className="flex-1">
                <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center text-white font-bold text-xl mb-4 shadow-lg shadow-blue-600/20">
                  {step}
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ABOUT */}
      <section id="about" className="py-20 px-4 sm:px-6 bg-slate-900/40">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-3">About This Project</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-start">
            <div className="space-y-5 text-slate-300 leading-relaxed">
              <p>VKAnalyze is an open-source data analytics platform built to make spreadsheet analysis accessible to everyone — not just data scientists.</p>
              <p>Upload any CSV or Excel file and immediately get statistics, visualizations, AI-powered insights, and cleaning tools — all running entirely in your browser.</p>
              <p>Built as a portfolio project by Vikas, a self-taught developer and BCA student from Karnataka, India. Developed using AI-assisted tools including Bolt.new and Claude.</p>
            </div>
            <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-6">
              <h3 className="text-base font-semibold text-white mb-4">Built With</h3>
              <ul className="space-y-2.5">
                {[
                  { dot: 'bg-blue-400', label: 'React + TypeScript' },
                  { dot: 'bg-emerald-400', label: 'Supabase (Auth + Database)' },
                  { dot: 'bg-amber-400', label: 'Google Gemini AI' },
                  { dot: 'bg-sky-400', label: 'Recharts (Visualizations)' },
                  { dot: 'bg-red-400', label: 'jsPDF (Report Export)' },
                  { dot: 'bg-teal-400', label: 'Tailwind CSS' },
                  { dot: 'bg-slate-400', label: 'Deployed on Netlify/Vercel' },
                ].map(({ dot, label }) => (
                  <li key={label} className="flex items-center gap-3 text-sm text-slate-300">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
                    {label}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-slate-800 py-8 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-500">
          <span>© 2026 VKAnalyze. Built by Vikas.</span>
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            Your data never leaves your browser.
          </span>
          <a href="#" className="flex items-center gap-1.5 hover:text-white transition">
            <Github className="w-4 h-4" />
            Open Source
          </a>
        </div>
      </footer>
    </div>
  );
}
