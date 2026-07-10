import { FileText } from 'lucide-react';
import { PageShell, PageHero } from '../ui/PageShell';
import { Reveal, Stagger, StaggerItem } from '../ui/motion';

interface Props {
  onNavigate: (page: string) => void;
  onGetStarted?: () => void;
  page: 'privacy' | 'terms' | 'cookies';
}

const CONTENT = {
  privacy: {
    title: 'Privacy Policy',
    updated: 'June 2026',
    sections: [
      {
        heading: 'Information We Collect',
        body: `When you create an account, we collect your email address and full name. When you use VKAnalyze, we store analysis session metadata (dataset names, column statistics, chat messages, and dashboard configurations) in our database. We do NOT collect, upload, or store the actual files you analyze — file processing happens entirely in your browser.`,
      },
      {
        heading: 'How We Use Your Information',
        body: `Your information is used solely to provide the VKAnalyze service: authenticating your account, saving your analysis sessions for future access, and personalizing your experience. We do not sell, share, or rent your personal information to third parties for marketing purposes.`,
      },
      {
        heading: 'Data Storage and Security',
        body: `All data is stored in Supabase, a secure cloud database with Row Level Security (RLS). This means your data is strictly isolated from other users. All connections are encrypted via HTTPS/TLS. We follow industry-standard security practices.`,
      },
      {
        heading: 'AI Processing',
        body: `When you use AI features, your dataset metadata (column names, statistics, row counts) and chat messages are sent to Google's Gemini AI API via a secure Edge Function. Raw file data is never sent to any AI service. Google's Privacy Policy governs data processed through the Gemini API.`,
      },
      {
        heading: 'Cookies',
        body: `We use essential cookies and browser storage (localStorage and IndexedDB) to maintain your authentication session and persist your current analysis — including parsed dataset rows — across page refreshes. No tracking or advertising cookies are used.`,
      },
      {
        heading: 'Your Rights',
        body: `You may request deletion of all your data at any time by contacting vikasvikki010@gmail.com. You may also delete individual sessions, chat messages, and versions within the application.`,
      },
      {
        heading: 'Contact',
        body: `For privacy-related questions, contact: vikasvikki010@gmail.com`,
      },
    ],
  },
  terms: {
    title: 'Terms of Service',
    updated: 'June 2026',
    sections: [
      {
        heading: 'Acceptance of Terms',
        body: `By accessing or using VKAnalyze, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the service.`,
      },
      {
        heading: 'Use of the Service',
        body: `VKAnalyze is provided for lawful data analysis purposes. You agree not to use the service to process data you do not have the right to analyze, to attempt to circumvent security measures, to disrupt or harm the service, or to violate any applicable laws or regulations.`,
      },
      {
        heading: 'Your Data',
        body: `You retain all ownership rights to the data you upload and analyze. By using VKAnalyze, you grant us a limited license to process your data solely to provide the service. Raw files are processed locally in your browser and never transmitted to our servers.`,
      },
      {
        heading: 'AI Features',
        body: `AI-generated content (insights, SQL queries, chat responses) is provided for informational purposes only and may not always be accurate. You are responsible for verifying AI-generated outputs before making decisions based on them.`,
      },
      {
        heading: 'Service Availability',
        body: `VKAnalyze is provided "as is" without warranties of any kind. We do not guarantee uninterrupted availability. We reserve the right to modify, suspend, or discontinue any part of the service at any time.`,
      },
      {
        heading: 'Limitation of Liability',
        body: `To the maximum extent permitted by law, VKAnalyze and its developer shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the service.`,
      },
      {
        heading: 'Changes to Terms',
        body: `We may update these terms from time to time. Continued use of the service after changes constitutes acceptance of the updated terms.`,
      },
      {
        heading: 'Contact',
        body: `For questions about these terms, contact: vikasvikki010@gmail.com`,
      },
    ],
  },
  cookies: {
    title: 'Cookie Policy',
    updated: 'June 2026',
    sections: [
      {
        heading: 'What Are Cookies?',
        body: `Cookies are small text files stored in your browser. VKAnalyze uses browser localStorage, IndexedDB, and session storage (similar to cookies) to provide core functionality.`,
      },
      {
        heading: 'Essential Storage',
        body: `We use the following essential browser storage:\n\n• Authentication tokens — stored by Supabase Auth to keep you logged in\n• Active session (IndexedDB) — stores your current parsed dataset, including row-level data, entirely in your browser so you don't lose work on page refresh. This data is cleared when you log out, reset your session, or after 24 hours.\n• Privacy preferences (IndexedDB) — stores your Local Only Mode setting, AI consent choice, and per-dataset privacy levels.\n\nThese are required for the service to function and cannot be disabled.`,
      },
      {
        heading: 'No Tracking',
        body: `We do not use any advertising, analytics, or tracking cookies. No third-party cookies are set. We do not use Google Analytics, Facebook Pixel, or any similar tracking technology.`,
      },
      {
        heading: 'Managing Storage',
        body: `You can clear all stored data by clearing your browser's site data (localStorage, IndexedDB, and cookies) for this site, or by using the "Clear Data" controls in the in-app Privacy Dashboard. This will log you out and clear your current session. Individual analysis sessions can also be deleted within the application.`,
      },
      {
        heading: 'Contact',
        body: `For questions about our cookie practices, contact: vikasvikki010@gmail.com`,
      },
    ],
  },
};

export default function LegalPage({ onNavigate, onGetStarted, page }: Props) {
  const content = CONTENT[page];

  return (
    <PageShell currentPage={page} onNavigate={onNavigate} onGetStarted={onGetStarted}>
      <PageHero
        eyebrow="Legal"
        icon={<FileText className="w-8 h-8 text-accent-bright" />}
        align="left"
        title={content.title}
        description={`Last updated: ${content.updated}`}
      />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-24">
        <Reveal className="flex items-center gap-1 mb-8 p-1 bg-ink-surface border border-ink-border rounded-xl w-fit">
          {(['privacy', 'terms', 'cookies'] as const).map(p => (
            <button
              key={p}
              onClick={() => onNavigate(p)}
              className={`text-sm transition-colors px-4 py-2 rounded-lg ${p === page ? 'text-ink bg-paper font-medium' : 'text-paper-dim hover:text-paper'}`}
            >
              {p === 'privacy' ? 'Privacy' : p === 'terms' ? 'Terms' : 'Cookies'}
            </button>
          ))}
        </Reveal>

        <Stagger className="space-y-4">
          {content.sections.map(section => (
            <StaggerItem key={section.heading} className="bg-ink-surface border border-ink-border rounded-xl p-6">
              <h2 className="text-lg font-semibold text-paper mb-3">{section.heading}</h2>
              <p className="text-paper-dim leading-relaxed text-sm whitespace-pre-line">{section.body}</p>
            </StaggerItem>
          ))}
        </Stagger>

        <Reveal className="mt-10 flex gap-3 flex-wrap">
          <button onClick={() => onNavigate('home')} className="px-5 py-2.5 bg-ink-raised hover:bg-ink-borderStrong text-paper/90 text-sm rounded-xl transition-colors">
            Back to home
          </button>
          <button onClick={() => onNavigate('contact')} className="px-5 py-2.5 bg-accent hover:bg-accent-bright text-ink text-sm font-semibold rounded-xl transition-colors">
            Contact us
          </button>
        </Reveal>
      </div>
    </PageShell>
  );
}
