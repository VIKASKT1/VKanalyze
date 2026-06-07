import type { ColumnStats } from './types';

export function exportToCSV(
  rows: Record<string, unknown>[],
  columns: string[],
  filename: string
): void {
  const header = columns.join(',');
  const body = rows.map(row =>
    columns.map(col => {
      const val = row[col];
      if (val === null || val === undefined) return '';
      const str = String(val);
      return str.includes(',') || str.includes('"') || str.includes('\n')
        ? `"${str.replace(/"/g, '""')}"`
        : str;
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

export async function exportToPDF(
  datasetName: string,
  columns: Array<{ name: string; type: string }>,
  statistics: Record<string, ColumnStats>,
  rows: Record<string, unknown>[],
  qualityScore: number
): Promise<void> {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();

  // Header
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageW, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('VKAnalyze', 14, 12);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Dataset Report: ${datasetName}`, 14, 20);
  doc.text(new Date().toLocaleDateString(), pageW - 14, 20, { align: 'right' });

  let y = 38;

  // Summary section
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('Dataset Summary', 14, y);
  y += 8;

  const summaryData = [
    ['Total Rows', rows.length.toLocaleString()],
    ['Total Columns', String(columns.length)],
    ['Quality Score', `${qualityScore}/100`],
    ['Numeric Columns', String(columns.filter(c => c.type === 'number').length)],
    ['Text Columns', String(columns.filter(c => c.type === 'string').length)],
    ['Generated', new Date().toLocaleString()],
  ];

  autoTable(doc, {
    startY: y,
    head: [['Metric', 'Value']],
    body: summaryData,
    theme: 'striped',
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 9 },
    margin: { left: 14, right: 14 },
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12;

  // Column statistics
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('Column Statistics', 14, y);
  y += 6;

  const statsHead = [['Column', 'Type', 'Count', 'Nulls', 'Unique', 'Mean', 'Min', 'Max']];
  const statsBody = columns.slice(0, 30).map(col => {
    const s = statistics[col.name];
    return [
      col.name,
      col.type,
      String(s?.count ?? 0),
      String(s?.nullCount ?? 0),
      String(s?.uniqueCount ?? 0),
      s?.mean !== undefined ? String(s.mean) : '-',
      s?.min !== undefined ? String(s.min) : '-',
      s?.max !== undefined ? String(s.max) : '-',
    ];
  });

  autoTable(doc, {
    startY: y,
    head: statsHead,
    body: statsBody,
    theme: 'striped',
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 8, overflow: 'ellipsize', cellWidth: 'wrap' },
    columnStyles: { 0: { cellWidth: 35 } },
    margin: { left: 14, right: 14 },
  });

  // Footer on each page
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(
      `VKAnalyze — Page ${i} of ${pageCount}`,
      pageW / 2,
      doc.internal.pageSize.getHeight() - 8,
      { align: 'center' }
    );
  }

  doc.save(`${datasetName.replace(/\s+/g, '_')}_report.pdf`);
}
