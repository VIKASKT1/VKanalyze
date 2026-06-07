import { useState, useCallback } from 'react';
import { Upload, FileSpreadsheet, AlertCircle, Loader2, CheckCircle2, X } from 'lucide-react';
import { parseFile, profileData } from '../lib/data-processing';
import { formatBytes } from '../lib/utils';
import AppHeader from './AppHeader';
import type { ParsedData } from '../lib/data-processing';
import type { ProfileData } from '../lib/types';

interface Props {
  onDataLoaded: (
    file: File,
    parsed: ParsedData,
    profile: ProfileData
  ) => void;
}

const ACCEPTED = ['.csv', '.xlsx', '.xls'];
const MAX_SIZE_MB = 50;

export default function UploadScreen({ onDataLoaded }: Props) {
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const [progress, setProgress] = useState(0);

  const processFile = useCallback(async (file: File) => {
    setError('');
    setFileName(file.name);
    setProgress(0);

    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`File is too large. Maximum allowed size is ${MAX_SIZE_MB}MB.`);
      return;
    }

    const ext = '.' + (file.name.split('.').pop()?.toLowerCase() ?? '');
    if (!ACCEPTED.includes(ext)) {
      setError(`Unsupported file type "${ext}". Please upload a CSV, XLSX, or XLS file.`);
      return;
    }

    setLoading(true);
    setProgress(20);
    try {
      const parsed = await parseFile(file);
      setProgress(60);
      const profile = profileData(parsed.columns, parsed.rows) as ProfileData;
      setProgress(100);
      onDataLoaded(file, parsed, profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse file. Please check the file format.');
    } finally {
      setLoading(false);
    }
  }, [onDataLoaded]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 flex flex-col">
      <AppHeader />
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-2xl">
          {/* Hero */}
          <div className="text-center mb-10">
            <h2 className="text-4xl font-bold text-white mb-3">Upload your dataset</h2>
            <p className="text-slate-400 text-lg">
              CSV, Excel (.xlsx, .xls) up to {MAX_SIZE_MB}MB — all processing happens in your browser
            </p>
          </div>

          {/* Drop zone */}
          <label
            htmlFor="file-input"
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`
              group flex flex-col items-center justify-center gap-5 p-16 rounded-2xl border-2 border-dashed cursor-pointer
              transition-all duration-200
              ${dragging
                ? 'border-blue-400 bg-blue-500/10 scale-[1.01]'
                : 'border-slate-600 hover:border-blue-500 hover:bg-slate-800/50 bg-slate-800/30'
              }
            `}
          >
            <div className={`p-5 rounded-2xl transition-colors ${dragging ? 'bg-blue-500/20' : 'bg-slate-700/50 group-hover:bg-blue-500/10'}`}>
              {loading ? (
                <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
              ) : (
                <Upload className={`w-10 h-10 transition-colors ${dragging ? 'text-blue-400' : 'text-slate-400 group-hover:text-blue-400'}`} />
              )}
            </div>

            {loading ? (
              <div className="text-center">
                <p className="text-white font-medium text-lg mb-1">Processing {fileName}…</p>
                <div className="w-48 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-white font-semibold text-lg">
                  {dragging ? 'Drop your file here' : 'Drag & drop or click to browse'}
                </p>
                <p className="text-slate-500 text-sm mt-1">Supported: CSV, XLSX, XLS</p>
              </div>
            )}

            <input
              id="file-input"
              type="file"
              accept={ACCEPTED.join(',')}
              onChange={handleFileInput}
              className="hidden"
              disabled={loading}
            />
          </label>

          {/* Error */}
          {error && (
            <div className="mt-4 flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400">
              <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
              <span className="text-sm">{error}</span>
              <button onClick={() => setError('')} className="ml-auto">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Feature cards */}
          <div className="grid grid-cols-3 gap-4 mt-10">
            {[
              { icon: FileSpreadsheet, title: 'Parse & Profile', desc: 'Automatic column type detection and statistics' },
              { icon: CheckCircle2, title: 'Clean & Transform', desc: 'Remove duplicates, fill nulls, normalize values' },
              { icon: Upload, title: 'AI Insights', desc: 'Gemini-powered analysis and recommendations' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="p-5 rounded-xl bg-slate-800/40 border border-slate-700/50">
                <Icon className="w-5 h-5 text-blue-400 mb-3" />
                <p className="text-white font-medium text-sm mb-1">{title}</p>
                <p className="text-slate-500 text-xs leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
