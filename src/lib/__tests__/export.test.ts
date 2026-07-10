import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportToCSV } from '../export';

describe('exportToCSV', () => {
  let blobContent = '';

  beforeEach(() => {
    blobContent = '';
    vi.stubGlobal('URL', { createObjectURL: (b: Blob) => { void b; return 'blob:mock'; }, revokeObjectURL: vi.fn() });
    const OriginalBlob = Blob;
    vi.stubGlobal('Blob', class extends OriginalBlob {
      constructor(parts: BlobPart[], opts?: BlobPropertyBag) {
        super(parts, opts);
        blobContent = parts.join('');
      }
    });
    vi.stubGlobal('document', {
      createElement: () => ({ href: '', download: '', click: () => {} }),
    });
  });

  it('escapes column names containing commas, quotes, or newlines in the header row', () => {
    // Root cause: previously only data cells were escaped, so a column name
    // like `Revenue, ($)` produced a malformed header row (an extra column)
    // even though every data row below it was correctly quoted.
    const columns = ['Revenue, ($)', 'Notes "internal"', 'name'];
    const rows = [{ 'Revenue, ($)': 100, 'Notes "internal"': 'ok', name: 'Alice' }];
    exportToCSV(rows, columns, 'test.csv');

    const headerLine = blobContent.split('\n')[0];
    expect(headerLine).toBe('"Revenue, ($)","Notes ""internal""",name');
  });

  it('still escapes data cells as before', () => {
    const columns = ['name', 'note'];
    const rows = [{ name: 'Alice', note: 'has, a comma' }];
    exportToCSV(rows, columns, 'test.csv');
    const dataLine = blobContent.split('\n')[1];
    expect(dataLine).toBe('Alice,"has, a comma"');
  });
});
