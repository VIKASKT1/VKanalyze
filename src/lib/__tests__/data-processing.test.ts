import { describe, it, expect } from 'vitest';
import {
  applyCleaningRules,
  standardizeDateValue,
  profileData,
  getOutlierIndicesIQR,
  parseFile,
} from '../data-processing';

const baseRows = [
  { name: 'Alice', age: 30, salary: 50000 },
  { name: 'Bob', age: 25, salary: null },
  { name: 'Charlie', age: 35, salary: 70000 },
  { name: 'Alice', age: 30, salary: 50000 }, // duplicate
  { name: 'Dave', age: null, salary: 60000 },
];
const baseCols = ['name', 'age', 'salary'];

describe('fill_mode', () => {
  it('fills nulls with most frequent value', () => {
    const rows = [{ cat: 'A' }, { cat: 'B' }, { cat: 'A' }, { cat: null }, { cat: 'A' }];
    const { rows: result } = applyCleaningRules(rows, ['cat'], [
      { type: 'fill_mode', column: 'cat', enabled: true },
    ]);
    expect(result[3].cat).toBe('A');
  });
  it('does not change non-null values', () => {
    const rows = [{ x: 'B' }, { x: null }];
    const { rows: result } = applyCleaningRules(rows, ['x'], [
      { type: 'fill_mode', column: 'x', enabled: true },
    ]);
    expect(result[0].x).toBe('B');
  });
});

describe('fill_constant', () => {
  it('fills null with given constant', () => {
    const { rows: result } = applyCleaningRules(baseRows, baseCols, [
      { type: 'fill_constant', column: 'salary', value: -1, enabled: true },
    ]);
    expect(result[1].salary).toBe(-1);
  });
  it('does not change existing values', () => {
    const { rows: result } = applyCleaningRules(baseRows, baseCols, [
      { type: 'fill_constant', column: 'salary', value: -1, enabled: true },
    ]);
    expect(result[0].salary).toBe(50000);
  });
});

describe('forward_fill', () => {
  it('propagates last non-null value forward', () => {
    const rows = [{ x: 10 }, { x: null }, { x: null }, { x: 20 }];
    const { rows: result } = applyCleaningRules(rows, ['x'], [
      { type: 'forward_fill', column: 'x', enabled: true },
    ]);
    expect(result[1].x).toBe(10);
    expect(result[2].x).toBe(10);
    expect(result[3].x).toBe(20);
  });
  it('leaves leading nulls as null', () => {
    const rows = [{ x: null }, { x: 5 }];
    const { rows: result } = applyCleaningRules(rows, ['x'], [
      { type: 'forward_fill', column: 'x', enabled: true },
    ]);
    expect(result[0].x).toBeNull();
  });
});

describe('backward_fill', () => {
  it('propagates next non-null value backward', () => {
    const rows = [{ x: null }, { x: null }, { x: 10 }];
    const { rows: result } = applyCleaningRules(rows, ['x'], [
      { type: 'backward_fill', column: 'x', enabled: true },
    ]);
    expect(result[0].x).toBe(10);
    expect(result[1].x).toBe(10);
  });
  it('leaves trailing nulls', () => {
    const rows = [{ x: 5 }, { x: null }];
    const { rows: result } = applyCleaningRules(rows, ['x'], [
      { type: 'backward_fill', column: 'x', enabled: true },
    ]);
    expect(result[1].x).toBeNull();
  });
});

describe('standardizeDateValue', () => {
  it('converts MM/DD/YYYY', () => expect(standardizeDateValue('01/15/2023')).toBe('2023-01-15'));
  it('converts YYYY/MM/DD', () => expect(standardizeDateValue('2023/01/15')).toBe('2023-01-15'));
  it('converts Month DD YYYY', () => expect(standardizeDateValue('January 5 2023')).toBe('2023-01-05'));
  it('passes through YYYY-MM-DD', () => expect(standardizeDateValue('2023-01-15')).toBe('2023-01-15'));
  it('returns null for unrecognized', () => expect(standardizeDateValue('not-a-date')).toBeNull());
});

describe('outlier handling', () => {
  const rowsWithOutlier = [
    { val: 10 }, { val: 11 }, { val: 12 }, { val: 10 }, { val: 11 },
    { val: 11 }, { val: 12 }, { val: 10 }, { val: 1000 },
  ];

  it('getOutlierIndicesIQR detects extreme outlier', () => {
    const values = rowsWithOutlier.map(r => r.val as number);
    const indices = getOutlierIndicesIQR(values);
    expect(indices.has(8)).toBe(true);
  });
  it('remove_outliers removes outlier row', () => {
    const { rows: result } = applyCleaningRules(rowsWithOutlier, ['val'], [
      { type: 'remove_outliers', column: 'val', enabled: true },
    ]);
    expect(result.some(r => r.val === 1000)).toBe(false);
  });
  it('cap_outliers clamps the outlier', () => {
    const { rows: result } = applyCleaningRules(rowsWithOutlier, ['val'], [
      { type: 'cap_outliers', column: 'val', enabled: true },
    ]);
    const maxVal = Math.max(...result.map(r => r.val as number));
    expect(maxVal).toBeLessThan(100);
  });
});

describe('workflow rule application', () => {
  it('applies multiple rules as a workflow', () => {
    const workflowRules = [
      { type: 'trim_whitespace', enabled: true },
      { type: 'fill_median', column: 'age', enabled: true },
    ];
    const rows = [{ name: ' Alice ', age: null, salary: 0 }];
    const { rows: result } = applyCleaningRules(rows, ['name', 'age', 'salary'], workflowRules);
    expect(result[0].name).toBe('Alice');
  });
});

describe('profileData recompute after cleaning', () => {
  it('quality score improves after dedup', () => {
    const before = profileData(baseCols, baseRows);
    const { rows: cleaned } = applyCleaningRules(baseRows, baseCols, [
      { type: 'remove_duplicates', enabled: true },
    ]);
    const after = profileData(baseCols, cleaned);
    expect(after.qualityScore).toBeGreaterThanOrEqual(before.qualityScore);
    expect(after.duplicateRows).toBe(0);
  });
  it('missing value count updates after fill_median', () => {
    const { rows: cleaned } = applyCleaningRules(baseRows, baseCols, [
      { type: 'fill_median', column: 'salary', enabled: true },
      { type: 'fill_median', column: 'age', enabled: true },
    ]);
    const after = profileData(baseCols, cleaned);
    expect(after.missingValues['salary']).toBe(0);
    expect(after.missingValues['age']).toBe(0);
  });
});

describe('quality score cannot be 0% for a non-empty dataset', () => {
  it('the formula floor is 20, never 0, for any nullRatio/dupRatio combination', () => {
    // Worst case: every cell null AND every row an exact duplicate.
    const worstRows = Array.from({ length: 10 }, () => ({ a: null, b: null, c: null }));
    const profile = profileData(['a', 'b', 'c'], worstRows);
    expect(profile.qualityScore).toBeGreaterThan(0);
  });

  it('returns 0 only when there are truly no rows', () => {
    const profile = profileData(['a', 'b'], []);
    expect(profile.qualityScore).toBe(0);
  });

  it('a cascade of remove_nulls rules (one per sparse column) never empties a non-empty dataset', () => {
    // Root-cause regression test for "Apply All Smart Cleaning Recommendations
    // takes Quality Score from 68% to 0%". Each remove_nulls rule filters the
    // OUTPUT of the previous rule, so stacking one such rule per column whose
    // nulls don't fully overlap can compound down to zero rows even though the
    // dataset was never actually empty. applyCleaningRules must refuse to let
    // a rule zero out an otherwise non-empty result.
    const rows = [
      { a: null, b: 1, c: 1 },
      { a: 1, b: null, c: 1 },
      { a: 1, b: 1, c: null },
    ];
    const rules = [
      { id: '1', type: 'remove_nulls', column: 'a', enabled: true },
      { id: '2', type: 'remove_nulls', column: 'b', enabled: true },
      { id: '3', type: 'remove_nulls', column: 'c', enabled: true },
    ];
    const { rows: cleaned, changes } = applyCleaningRules(rows, ['a', 'b', 'c'], rules);
    expect(cleaned.length).toBeGreaterThan(0);
    expect(changes.some(c => c.toLowerCase().includes('skipped'))).toBe(true);

    const profile = profileData(['a', 'b', 'c'], cleaned);
    expect(profile.qualityScore).toBeGreaterThan(0);
  });

  it('generateCleaningRecommendations suggests dropping (not row-filtering) a column that is mostly empty', async () => {
    // With the fix, a >50%-null column is recommended for drop_column, which
    // can never cascade into deleting rows from other columns the way
    // remove_nulls recommendations used to.
    const { generateCleaningRecommendations } = await import('../ai');
    const rows = Array.from({ length: 10 }, (_, i) => ({
      id: i,
      sparse: i < 2 ? `val${i}` : null, // 80% null
    }));
    const profile = profileData(['id', 'sparse'], rows);
    const recs = generateCleaningRecommendations(['id', 'sparse'], rows, profile.statistics, profile.duplicateRows);
    const sparseRec = recs.find(r => r.column === 'sparse');
    expect(sparseRec?.type).toBe('drop_column');
  });
});

describe('parseFile — wrapped JSON with multiple array-valued keys', () => {
  function jsonFile(obj: unknown): File {
    const text = JSON.stringify(obj);
    return new File([text], 'dataset.json', { type: 'application/json' });
  }

  it('selects the records array, not a metadata array of primitives that appears first', async () => {
    // Root-cause regression test: "tags" (a primitives array) appears before
    // "records" (the real data) in key order. Before the fix, the parser picked
    // "tags", filtered out every non-object element, and returned rows = [] —
    // which is the only way profileData/calcQualityScore reports exactly 0%
    // for a dataset that visibly has real, dirty data.
    const file = jsonFile({
      tags: ['x', 'y', 'z'],
      records: [
        { id: 1, name: 'Alice', age: 30 },
        { id: 2, name: 'Bob', age: null },
        { id: 2, name: 'Bob', age: null },
      ],
    });
    const parsed = await parseFile(file);
    expect(parsed.rows.length).toBe(3);
    expect(parsed.columns).toEqual(['id', 'name', 'age']);

    const profile = profileData(parsed.columns, parsed.rows);
    expect(profile.qualityScore).toBeGreaterThan(0);
    expect(profile.qualityScore).toBeLessThan(100); // real dirty data — nulls + a duplicate
  });

  it('still works for the common { data: [...] } API export shape', async () => {
    const file = jsonFile({
      meta: { total: 2 },
      data: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }],
    });
    const parsed = await parseFile(file);
    expect(parsed.rows.length).toBe(2);
    expect(parsed.columns).toEqual(['id', 'name']);
  });

  it('falls back to the first array when no array holds row objects', async () => {
    const file = jsonFile({ tags: ['x', 'y', 'z'] });
    const parsed = await parseFile(file);
    // No object-array exists; falls back to the only array present, then
    // filters non-object elements (all of them) — this is a real "no tabular
    // data in this file" case, not the bug.
    expect(parsed.rows.length).toBe(0);
  });
});

describe('parseFile — TSV support', () => {
  it('parses .tsv files directly via parseFile (not just through the upload worker)', async () => {
    // Root-cause regression test: parseFile()'s allowedTypes never included
    // 'tsv', even though the upload UI advertises .tsv support and the Web
    // Worker parses it fine. Any code path that calls parseFile() directly
    // instead of going through the worker (e.g. DataComparisonTab) rejected
    // every .tsv file with "Unsupported file type: .tsv".
    const tsvText = 'id\tname\tage\n1\tAlice\t30\n2\tBob\t\n2\tBob\t\n';
    const file = new File([tsvText], 'dataset.tsv', { type: 'text/tab-separated-values' });
    const parsed = await parseFile(file);
    expect(parsed.rows.length).toBe(3);
    expect(parsed.columns).toEqual(['id', 'name', 'age']);

    const profile = profileData(parsed.columns, parsed.rows);
    expect(profile.qualityScore).toBeGreaterThan(0);
  });

  it('produces the same quality score as the equivalent CSV', async () => {
    const csvFile = new File(['id,name\n1,Alice\n2,\n'], 'd.csv', { type: 'text/csv' });
    const tsvFile = new File(['id\tname\n1\tAlice\n2\t\n'], 'd.tsv', { type: 'text/tab-separated-values' });
    const csvParsed = await parseFile(csvFile);
    const tsvParsed = await parseFile(tsvFile);
    const csvProfile = profileData(csvParsed.columns, csvParsed.rows);
    const tsvProfile = profileData(tsvParsed.columns, tsvParsed.rows);
    expect(tsvProfile.qualityScore).toBe(csvProfile.qualityScore);
  });
});
