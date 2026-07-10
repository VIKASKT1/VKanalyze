/**
 * parse.worker.ts — Web Worker for large CSV/JSON dataset parsing.
 * Runs entirely off the main thread to prevent UI freezing.
 * Sends progress messages back via postMessage.
 */

import Papa from 'papaparse';
import { profileData } from '../lib/data-processing';
import type { ProfileData } from '../lib/types';

export type ParseWorkerMessage =
  | { type: 'progress'; stage: string; pct: number; rowsProcessed: number; totalRows: number }
  | { type: 'done'; columns: string[]; rows: Record<string, unknown>[]; rowCount: number; detectedTypes: Record<string, string>; processingMs: number; profile: ProfileData }
  | { type: 'error'; message: string };

function detectType(values: unknown[]): string {
  const nonNull = values.filter(v => v !== null && v !== undefined && v !== '');
  if (nonNull.length === 0) return 'string';
  const numericCount = nonNull.filter(v => !isNaN(Number(v)) && String(v).trim() !== '').length;
  if (numericCount / nonNull.length > 0.85) return 'number';
  const dateRe = /^\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}/;
  const dateCount = nonNull.filter(v => dateRe.test(String(v))).length;
  if (dateCount / nonNull.length > 0.7) return 'date';
  const boolCount = nonNull.filter(v => ['true','false','yes','no','1','0'].includes(String(v).toLowerCase())).length;
  if (boolCount / nonNull.length > 0.9) return 'boolean';
  return 'string';
}

self.onmessage = async (e: MessageEvent<{ file: File }>) => {
  const { file } = e.data;
  const start = Date.now();

  try {
    // Stage 1: Reading
    self.postMessage({ type: 'progress', stage: 'Reading File', pct: 5, rowsProcessed: 0, totalRows: 0 } satisfies ParseWorkerMessage);

    const text = await file.text();

    // Stage 2: Parsing
    self.postMessage({ type: 'progress', stage: 'Parsing Dataset', pct: 20, rowsProcessed: 0, totalRows: 0 } satisfies ParseWorkerMessage);

    let rows: Record<string, unknown>[] = [];
    let columns: string[] = [];

    if (file.name.endsWith('.json') || file.name.endsWith('.jsonl')) {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        rows = parsed.filter(r => r !== null && typeof r === 'object') as Record<string, unknown>[];
      } else if (parsed !== null && typeof parsed === 'object') {
        const obj = parsed as Record<string, unknown>;
        // Same fix as the main-thread parser: prefer the array key whose elements
        // are actual row objects over a metadata array of primitives that happens
        // to appear earlier in key order (see data-processing.ts for full context).
        const arrayKeys = Object.keys(obj).filter(k => Array.isArray(obj[k]));
        const objectArrayKey = arrayKeys.find(k => {
          const arr = obj[k] as unknown[];
          return arr.length > 0 && arr.every(r => r !== null && typeof r === 'object' && !Array.isArray(r));
        });
        const arrKey = objectArrayKey ?? arrayKeys[0];
        rows = arrKey
          ? (obj[arrKey] as unknown[]).filter(r => r !== null && typeof r === 'object') as Record<string, unknown>[]
          : [obj];
      }
      columns = rows.length > 0 ? Object.keys(rows[0]) : [];
    } else {
      // CSV — stream parse in chunks
      const totalEstimate = text.split('\n').length - 1;
      let processed = 0;
      const result = Papa.parse<Record<string, unknown>>(text, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false, // we do our own typing
        step: (row, parser) => {
          rows.push(row.data);
          processed++;
          if (processed % 5000 === 0) {
            const pct = Math.min(60, 20 + Math.round((processed / Math.max(totalEstimate, 1)) * 40));
            self.postMessage({ type: 'progress', stage: 'Parsing Dataset', pct, rowsProcessed: processed, totalRows: totalEstimate } satisfies ParseWorkerMessage);
          }
          void parser; // keep TS happy
        },
      });
      columns = result.meta.fields ?? (rows.length > 0 ? Object.keys(rows[0]) : []);
    }

    const totalRows = rows.length;

    // Stage 3: Detecting Types
    self.postMessage({ type: 'progress', stage: 'Detecting Types', pct: 65, rowsProcessed: totalRows, totalRows } satisfies ParseWorkerMessage);
    const detectedTypes: Record<string, string> = {};
    for (const col of columns) {
      const sample = rows.slice(0, 1000).map(r => r[col]);
      detectedTypes[col] = detectType(sample);
    }

    // Stage 4: Profiling
    self.postMessage({ type: 'progress', stage: 'Profiling', pct: 75, rowsProcessed: totalRows, totalRows } satisfies ParseWorkerMessage);
    await new Promise(r => setTimeout(r, 10)); // yield so the progress message paints

    // Stage 5: Generating Statistics — this used to be a fake `setTimeout`
    // placeholder while the REAL profileData() call ran synchronously on the
    // MAIN THREAD immediately after this worker finished (in UploadScreen).
    // For a 1,000,000-row dataset that main-thread call alone measured
    // ~5-7 seconds (computeStatistics + duplicate-row detection), which
    // blocked the entire UI — including the very progress bar claiming to
    // show this stage — right at the end of upload.
    // FIX: profileData now actually runs HERE, inside the worker, off the
    // main thread. UploadScreen receives the finished profile directly in
    // the `done` message and never needs to compute it again itself.
    self.postMessage({ type: 'progress', stage: 'Generating Statistics', pct: 85, rowsProcessed: totalRows, totalRows } satisfies ParseWorkerMessage);
    const profile = profileData(columns, rows) as ProfileData;

    self.postMessage({ type: 'progress', stage: 'Generating Recommendations', pct: 92, rowsProcessed: totalRows, totalRows } satisfies ParseWorkerMessage);
    await new Promise(r => setTimeout(r, 10));

    self.postMessage({ type: 'progress', stage: 'Opening Workspace', pct: 98, rowsProcessed: totalRows, totalRows } satisfies ParseWorkerMessage);

    const processingMs = Date.now() - start;
    self.postMessage({ type: 'done', columns, rows, rowCount: totalRows, detectedTypes, processingMs, profile } satisfies ParseWorkerMessage);

  } catch (err) {
    self.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) } satisfies ParseWorkerMessage);
  }
};
