import type { ColumnStats } from './types';
import * as XLSX from 'xlsx';

// Phase 12 hardening: Excel/Sheets/LibreOffice treat a leading =, +, -, @, tab,
// or carriage return as the start of a formula. A malicious cell value like
// `=HYPERLINK(...)` or `@SUM(...)` re-opened from an exported CSV can execute
// in the spreadsheet app that opens it. Prefixing with a single quote is the
// standard OWASP mitigation — spreadsheet apps render it as plain text.
const FORMULA_INJECTION_PREFIX = /^[=+\-@\t\r]/;

function sanitizeCsvCell(value: string): string {
  return FORMULA_INJECTION_PREFIX.test(value) ? `'${value}` : value;
}

// Same formula-injection mitigation as CSV export, applied to string cells
// only — XLSX preserves numeric/boolean types natively, so only strings that
// look like formulas need the defensive prefix.
function sanitizeXlsxCell(value: unknown): unknown {
  if (typeof value === 'string' && FORMULA_INJECTION_PREFIX.test(value)) {
    return `'${value}`;
  }
  return value;
}

export function exportToXLSX(
  rows: Record<string, unknown>[],
  columns: string[],
  filename: string
): void {
  const sanitizedRows = rows.map(row => {
    const out: Record<string, unknown> = {};
    for (const col of columns) out[col] = sanitizeXlsxCell(row[col] ?? '');
    return out;
  });
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(sanitizedRows, { header: columns });
  XLSX.utils.book_append_sheet(wb, ws, 'Data');
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}

function csvEscape(str: string): string {
  return str.includes(',') || str.includes('"') || str.includes('\n')
    ? `"${str.replace(/"/g, '""')}"`
    : str;
}

export function exportToCSV(
  rows: Record<string, unknown>[],
  columns: string[],
  filename: string
): void {
  // Column names go through the same escaping as data cells — previously
  // only data cells were escaped, so a column name containing a comma or
  // quote (common with real-world messy headers) silently produced a
  // malformed header row while every data row below it was fine.
  const header = columns.map(col => csvEscape(sanitizeCsvCell(col))).join(',');
  const body = rows.map(row =>
    columns.map(col => {
      const val = row[col];
      if (val === null || val === undefined) return '';
      const str = sanitizeCsvCell(String(val));
      return csvEscape(str);
    }).join(',')
  ).join('\n');

  const blob = new Blob([`${header}\n${body}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportChartPNG(chartContainerId: string, filename: string): void {
  const container = document.getElementById(chartContainerId);
  const svg = container?.querySelector('svg');
  if (!svg) return;

  const svgData = new XMLSerializer().serializeToString(svg);
  const canvas = document.createElement('canvas');
  const bbox = svg.getBoundingClientRect();
  canvas.width = bbox.width || 800;
  canvas.height = bbox.height || 400;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const img = new Image();
  const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  img.onload = () => {
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = filename.endsWith('.png') ? filename : `${filename}.png`;
    a.click();
  };
  img.src = url;
}

export function exportChartSVG(chartContainerId: string, filename: string): void {
  const container = document.getElementById(chartContainerId);
  const svg = container?.querySelector('svg');
  if (!svg) return;

  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.style.background = '#0f172a';

  const svgData = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.svg') ? filename : `${filename}.svg`;
  a.click();
  URL.revokeObjectURL(url);
}

interface ReportOptions {
  datasetName: string;
  columns: Array<{ name: string; type: string }>;
  statistics: Record<string, ColumnStats>;
  rows: Record<string, unknown>[];
  qualityScore: number;
  duplicateRows?: number;
  insights?: Array<{ title: string; description: string; severity?: string; recommendation?: string }>;
  recommendations?: string[];
  summary?: string;
}

export async function exportProfessionalPDF(opts: ReportOptions): Promise<void> {
  const {
    datasetName, columns, statistics, rows,
    qualityScore, duplicateRows = 0,
    insights = [], recommendations = [], summary,
  } = opts;

  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;

  const numCols = columns.filter(c => c.type === 'number').length;
  const textCols = columns.filter(c => c.type === 'string').length;
  const totalMissing = Object.values(statistics).reduce((s, v) => s + (v?.nullCount ?? 0), 0);
  const now = new Date();

  // ── Cover Page ──────────────────────────────────────────────────────────────
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageW, pageH, 'F');

  // Accent bar
  doc.setFillColor(59, 130, 246);
  doc.rect(0, 0, 6, pageH, 'F');

  // Logo area
  doc.setFillColor(30, 41, 59);
  doc.roundedRect(margin + 6, 40, pageW - margin * 2 - 6, 24, 3, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('VKAnalyze', margin + 14, 56);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(148, 163, 184);
  doc.text('Professional Data Analysis Report', margin + 14, 62);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(28);
  doc.setFont('helvetica', 'bold');
  doc.text(datasetName, margin + 8, 100);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(148, 163, 184);
  doc.text(`Generated: ${now.toLocaleString()}`, margin + 8, 112);
  doc.text(`${rows.length.toLocaleString()} rows · ${columns.length} columns · Quality ${qualityScore}/100`, margin + 8, 120);

  // KPI grid on cover
  const kpis = [
    { label: 'Total Rows', value: rows.length.toLocaleString() },
    { label: 'Columns', value: String(columns.length) },
    { label: 'Quality Score', value: `${qualityScore}/100` },
    { label: 'Missing Values', value: totalMissing.toLocaleString() },
    { label: 'Duplicate Rows', value: duplicateRows.toLocaleString() },
    { label: 'Numeric Cols', value: String(numCols) },
    { label: 'Text Cols', value: String(textCols) },
    { label: 'File Date', value: now.toLocaleDateString() },
  ];

  const kpiX = margin + 8;
  const kpiY = 140;
  const kpiW = (pageW - margin * 2 - 8) / 4;
  const kpiH = 22;

  kpis.forEach((kpi, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const x = kpiX + col * kpiW;
    const y = kpiY + row * (kpiH + 4);
    doc.setFillColor(30, 41, 59);
    doc.roundedRect(x, y, kpiW - 3, kpiH, 2, 2, 'F');
    doc.setTextColor(148, 163, 184);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(kpi.label.toUpperCase(), x + 4, y + 7);
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(kpi.value, x + 4, y + 15);
  });

  // Quality bar on cover
  const barY = kpiY + 2 * (kpiH + 4) + 12;
  doc.setTextColor(148, 163, 184);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('DATA QUALITY SCORE', kpiX, barY);
  doc.setFillColor(30, 41, 59);
  doc.roundedRect(kpiX, barY + 4, pageW - margin * 2 - 8, 6, 3, 3, 'F');
  const qColor = qualityScore >= 80 ? [34, 197, 94] : qualityScore >= 60 ? [245, 158, 11] : [239, 68, 68];
  doc.setFillColor(qColor[0], qColor[1], qColor[2]);
  doc.roundedRect(kpiX, barY + 4, (pageW - margin * 2 - 8) * qualityScore / 100, 6, 3, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.text(`${qualityScore}/100`, pageW - margin - 8, barY + 11, { align: 'right' });

  // Cover footer
  doc.setTextColor(71, 85, 105);
  doc.setFontSize(7);
  doc.text('CONFIDENTIAL · VKAnalyze · ' + now.getFullYear(), pageW / 2, pageH - 10, { align: 'center' });

  // ── Page 2: Dataset Summary ─────────────────────────────────────────────────
  doc.addPage();

  function pageHeader(title: string) {
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageW, 22, 'F');
    doc.setFillColor(59, 130, 246);
    doc.rect(0, 0, 4, 22, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text(title, 12, 14);
    doc.setTextColor(148, 163, 184);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(datasetName, pageW - margin, 14, { align: 'right' });
  }

  pageHeader('Dataset Summary');

  if (summary) {
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    const lines = doc.splitTextToSize(summary, pageW - margin * 2) as string[];
    doc.text(lines, margin, 32);
  }

  autoTable(doc, {
    startY: summary ? 32 + 5 * (doc.splitTextToSize(summary, pageW - margin * 2) as string[]).length : 30,
    head: [['Metric', 'Value']],
    body: [
      ['Total Rows', rows.length.toLocaleString()],
      ['Total Columns', String(columns.length)],
      ['Numeric Columns', String(numCols)],
      ['Text Columns', String(textCols)],
      ['Quality Score', `${qualityScore}/100`],
      ['Missing Values', totalMissing.toLocaleString()],
      ['Duplicate Rows', duplicateRows.toLocaleString()],
      ['Report Generated', now.toLocaleString()],
    ],
    theme: 'striped',
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold', fontSize: 9 },
    styles: { fontSize: 9 },
    margin: { left: margin, right: margin },
  });

  // ── Page 3: KPI Dashboard ───────────────────────────────────────────────────
  doc.addPage();
  pageHeader('KPI Dashboard');

  const kpiData = columns.slice(0, 12).map(col => {
    const s = statistics[col.name];
    return [
      col.name,
      col.type,
      s ? String(s.count) : '-',
      s ? String(s.nullCount) : '-',
      s ? String(s.uniqueCount) : '-',
      s?.mean !== undefined ? s.mean.toFixed(2) : '-',
    ];
  });

  autoTable(doc, {
    startY: 30,
    head: [['Column', 'Type', 'Count', 'Nulls', 'Unique', 'Mean']],
    body: kpiData,
    theme: 'striped',
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold', fontSize: 9 },
    styles: { fontSize: 8 },
    margin: { left: margin, right: margin },
  });

  // ── Page 4: Column Statistics ───────────────────────────────────────────────
  doc.addPage();
  pageHeader('Column Statistics');

  autoTable(doc, {
    startY: 30,
    head: [['Column', 'Type', 'Count', 'Nulls', 'Unique', 'Mean', 'Min', 'Max', 'Std Dev']],
    body: columns.slice(0, 30).map(col => {
      const s = statistics[col.name];
      return [
        col.name, col.type,
        String(s?.count ?? 0), String(s?.nullCount ?? 0), String(s?.uniqueCount ?? 0),
        s?.mean !== undefined ? String(s.mean) : '-',
        s?.min !== undefined ? String(s.min) : '-',
        s?.max !== undefined ? String(s.max) : '-',
        s?.stdDev !== undefined ? String(s.stdDev) : '-',
      ];
    }),
    theme: 'striped',
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold', fontSize: 8 },
    styles: { fontSize: 7, overflow: 'ellipsize' },
    columnStyles: { 0: { cellWidth: 32 } },
    margin: { left: margin, right: margin },
  });

  // ── Page 5: AI Insights ─────────────────────────────────────────────────────
  if (insights.length > 0) {
    doc.addPage();
    pageHeader('AI Insights & Recommendations');

    let iy = 32;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('Insights', margin, iy);
    iy += 6;

    const severityColors: Record<string, [number, number, number]> = {
      critical: [239, 68, 68],
      warning: [245, 158, 11],
      info: [59, 130, 246],
    };

    for (const ins of insights.slice(0, 8)) {
      if (iy > pageH - 40) { doc.addPage(); pageHeader('AI Insights (cont.)'); iy = 32; }
      const sc = severityColors[ins.severity ?? 'info'] ?? severityColors['info'];
      doc.setFillColor(sc[0], sc[1], sc[2]);
      doc.rect(margin, iy, 2, 14, 'F');
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text(ins.title, margin + 5, iy + 5);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      const descLines = doc.splitTextToSize(ins.description, pageW - margin * 2 - 8) as string[];
      doc.text(descLines, margin + 5, iy + 10);
      iy += 10 + descLines.length * 4 + 4;
    }

    if (recommendations.length > 0) {
      if (iy > pageH - 60) { doc.addPage(); pageHeader('Recommendations'); iy = 32; }
      iy += 4;
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text('Recommendations', margin, iy);
      iy += 6;

      autoTable(doc, {
        startY: iy,
        head: [['#', 'Recommendation']],
        body: recommendations.slice(0, 10).map((r, i) => [String(i + 1), r]),
        theme: 'striped',
        headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold', fontSize: 9 },
        styles: { fontSize: 8 },
        columnStyles: { 0: { cellWidth: 10 } },
        margin: { left: margin, right: margin },
      });
    }
  }

  // ── Footer on all pages ─────────────────────────────────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    if (i > 1) {
      doc.setDrawColor(30, 41, 59);
      doc.setLineWidth(0.3);
      doc.line(margin, pageH - 12, pageW - margin, pageH - 12);
    }
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'normal');
    doc.text(`VKAnalyze — ${datasetName}`, margin, pageH - 7);
    doc.text(`Page ${i} of ${totalPages} · ${now.toLocaleString()}`, pageW - margin, pageH - 7, { align: 'right' });
  }

  doc.save(`VKAnalyze_Report_${datasetName.replace(/\s+/g, '_')}.pdf`);
}
