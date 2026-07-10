# VKAnalyze V2 — React Rendering Performance Audit

**Scope:** rendering only. No worker architecture changes, no functionality changes, no business logic/calculation changes. All fixes verified with a static code audit plus a real syntax-level compile pass (esbuild); see "How this was verified" below for exactly what that does and doesn't cover.

---

## How this was verified (read this first)

This sandbox has no network access and no `node_modules` for this project, so **`npm install`, `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` could not be executed here.** That's a hard environment limitation, not a skipped step — I want to be upfront about it rather than claim those commands passed.

What I could and did do:

- **Full static code trace** of every tab in the requested workflow: read the actual render bodies, prop flows, `useMemo`/`useCallback` dependency arrays, and context/provider structure by hand.
- **Syntax verification with `esbuild`** (a real parser, globally available in this sandbox) against every `.ts`/`.tsx` file in `src/` after edits — not just the files I touched. Result: **zero syntax errors across the entire tree.** This did catch one real mistake I made mid-edit (a duplicated `const BarWidget = memo(...)` line), which is a good sign the check has teeth.
- **Cross-referencing** every changed component's prop interface against every call site by hand, since I don't have a working type checker to catch mismatches automatically.

What this does **not** cover: TypeScript type errors, ESLint rule violations, unit test correctness, or a real production bundle. **You should run `npm run typecheck && npm run lint && npm test && npm run build` yourself** before merging — I'd recommend doing that as the very next step. I'm not asserting they pass; I'm telling you they haven't been run.

I also don't have a browser, so I could not attach React DevTools Profiler or measure real millisecond timings. The tables in sections 7 and 8 below are **static-analysis-based**, not measured — each row is something I can point to in the code, not a stopwatch reading. Any numbers you see are order-of-magnitude reasoning from what the code does (e.g. "O(rows) scan" for a loop over the full array), not profiler output.

---

## 1. Summary of root causes found

| # | Location | Issue | Category |
|---|---|---|---|
| 1 | `DataFlowApp.tsx` (3 call sites) | `parsed={{ ...parsed, rows: currentRows, columns: currentColumns }}` built inline in JSX — new object reference every render | Reference instability |
| 2 | `DashboardTab.tsx` (9 widget components) | Widget renderers computed O(rows) aggregations directly in render body, unmemoized, no `React.memo` | Unnecessary rerender + no memoization |
| 3 | `VisualizeTab.tsx` | `numericCols`/`textCols` `useMemo` depended on whole `parsed` object instead of `parsed.columns` | Unstable `useMemo` deps |
| 4 | `PreviewTab.tsx` | `CellValue`/`DataRow`/`SortIcon` declared inside render body — new component identity every render, forcing full remount of visible rows | Component identity instability |
| 5 | `PivotTab.tsx` | Pivot result table body not virtualized — row count driven by field cardinality, can be thousands of `<tr>`s | Missing virtualization |
| 6 | `CleanTab.tsx` | `RecommendationCard` received fresh inline callback closures every render | Unnecessary rerender |
| 7 | `DataFlowApp.tsx` | `onContinueAnalysis={() => changeTab('preview')}` inline closure passed to `CleanTab` | Callback instability |
| 8 | Whole codebase | Zero uses of `React.memo` anywhere before this pass | Missing memoization |

---

## 2. Fixes applied, by file

### `src/components/DataFlowApp.tsx`
- Added a `currentParsed` `useMemo` keyed on `[parsed, currentRows, currentColumns]`, replacing the inline `{ ...parsed, rows: currentRows, columns: currentColumns }` spread that ran at 3 JSX call sites (Overview, Preview, Visualize). This was the single highest-impact fix: it made those three tabs immune to purely cosmetic parent re-renders (opening the user menu, notification bell, mobile tab dropdown).
- Added a stable `continueToPreview = useCallback(() => changeTab('preview'), [changeTab])`, replacing an inline arrow function passed to `CleanTab`, so `CleanTab`'s `React.memo` isn't defeated by that one prop.

### `src/components/tabs/OverviewTab.tsx`
- Wrapped in `React.memo`. No internal changes needed — it only reads column/profile metadata (O(columns), not O(rows)), so it was already cheap; the win here is purely skipping re-renders it doesn't need.

### `src/components/tabs/PreviewTab.tsx`
- Wrapped in `React.memo`.
- Hoisted `CellValue`, `SortIcon`, and `DataRow` from being declared *inside* the component body (recreated every render) to module scope, each wrapped in its own `React.memo`, with explicit props instead of closures over component state. This was necessary for the existing hand-rolled row virtualization to actually benefit from memoization — previously every visible row was fully unmounted and remounted on every render regardless of virtualization.
- Added a stable `handleSelectRow` `useCallback` so `DataRow`'s memo isn't defeated by the row-click handler.
- **Not changed, flagged instead:** the search/sort `useMemo` still runs `.filter()`/`.sort()` synchronously across the full `rows` array on the main thread. This is a plausible >50ms freeze source specifically when a user searches or sorts a 1,000,000-row dataset (as opposed to switching tabs, which this fix addresses). Moving it off-thread would need a worker round-trip and new loading-state UX — a functional change beyond "rendering only" scope, so it's documented as a known remaining risk rather than silently changed.

### `src/components/tabs/VisualizeTab.tsx`
- Wrapped in `React.memo`.
- Fixed `numericCols`/`textCols` `useMemo` dependency arrays from `[parsed, statistics]` to `[parsed.columns, statistics]` — depending on the whole `parsed` object invalidated the memo on every render regardless of whether columns actually changed.

### `src/components/tabs/DashboardTab.tsx`
- Wrapped all 10 widget renderers (`KPIWidget`, `BarWidget`, `LineWidget`, `AreaWidget`, `PieWidget`, `TableWidget`, `InsightWidget`, `TextWidget`, `MarkdownWidget`, `ImageWidget`) and `SortableWidget` in `React.memo`. This was the highest-impact dashboard fix: each widget does an O(rows) scan in its render body (`BarWidget`/`PieWidget` build frequency maps over every row), and with N widgets on screen, any unrelated dashboard state change (dragging a different widget, opening a dialog) previously re-ran every widget's full scan.
- Confirmed `filteredRows` (the `rows` prop each widget receives) is already a properly-memoized `useMemo` keyed on `[rows, crossFilters, active?.filters]`, so widgets already get a stable `rows` reference except when filters genuinely change.
- **Not changed, flagged instead:** `removeWidget`, `duplicateWidget`, and `updateWidgetSize` (passed to `SortableWidget` as `onRemove`/`onDuplicate`/`onResize`) are plain function declarations recreated every render, closing over several other non-memoized helpers (`pushUndo`, `handleSaveDashboard`) in this large, interdependent 1700+ line component. Converting all of them to `useCallback` with fully correct dependency arrays — verified by hand, since I have no working type checker or test suite here — carries real risk of silently breaking undo/redo or autosave behavior. Left as a documented known risk. Note this does **not** blunt the main fix: the widget body components (where the expensive O(rows) work actually happens) still correctly skip re-computation via `React.memo`'s comparison on `widget`/`rows`/`statistics`, even when the wrapping `SortableWidget` re-renders due to unstable callback identity.

### `src/components/tabs/PivotTab.tsx`
- Added windowed/virtual scrolling to the pivot result table body, matching the existing hand-rolled pattern already used in `PreviewTab` (no new dependency added, since installing `react-window` or `@tanstack/react-virtual` isn't possible without network access in this sandbox). Below a 200-row threshold it renders exactly as before (a single static table); above that, it switches to a scroll container that only mounts the visible row window plus overscan.
- `exportCSV` still uses the full, un-windowed `pivot.data` — export behavior is unaffected by the rendering change.
- Wrapped in `React.memo`.

### `src/components/tabs/CleanTab.tsx`
- Wrapped `RecommendationCard` in `React.memo`.
- Added a stable `dismissRecommendation` `useCallback` alongside the existing (already-stable) `applyRecommendation`, and changed `RecommendationCard`'s props to accept `rec` plus these two stable rec-taking functions directly, instead of the parent building a fresh inline closure per card per render. This was the actual fix needed for the memo to take effect — wrapping the card alone wasn't enough while its callbacks were unstable.
- Wrapped `CleanTab` itself in `React.memo`.

### `src/components/tabs/AdvancedStatsTab.tsx`
- Wrapped in `React.memo`.
- **Not changed, flagged instead:** `advStats` intentionally computes mean/variance/stdDev/percentiles/skewness/kurtosis over the full `rows` array (correctly — sampling would make these numbers wrong) every time the user selects a different column to inspect. Several full O(n) passes plus a `.sort()` for percentiles is a plausible freeze source in that specific interaction, not the tab-switch case this pass addresses. Flagged as a known risk rather than moved to the worker (a computation change, not a rendering one).

### `src/components/tabs/DataQualityTab.tsx`
- Wrapped in `React.memo`. Already fully worker-backed and dataset-cached from prior work — this fix just lets it also skip re-rendering on unrelated parent state.

### `src/components/tabs/AnalyticsTab.tsx`
- Wrapped in `React.memo`. Its 5 sub-panels (Outlier/Correlation/Trend/Dictionary/StatTests) already receive `{...props}` — the actual stable prop values from `DataFlowApp`, not a rebuilt wrapper object — so no reference-instability bug existed here.
- **Not changed, flagged instead:** `OutlierPanel`'s `summary` and `TrendPanel`'s `trendData` each do a synchronous full-`rows` scan on the main thread for good reason (documented in their own code comments — true outlier counts and time-bucketing both need the full dataset, not a sample). Both recompute on every fresh mount of their panel. Every other computation in this file already samples down first and is not a concern.

### `src/components/tabs/SqlTab.tsx`
- Wrapped in `React.memo`. Query execution only runs inside the explicit "Run Query" click handler, never in the render body, so it isn't a rerender-driven freeze source.
- **Not changed, flagged instead:** the result table (capped at 10,000 rows by default, more if the user writes an explicit larger `LIMIT`) uses ordinary scrolling rather than virtualization. Lower priority than Preview/Pivot since it requires deliberate user action to reach a large row count, and the per-cell copy-button hover interaction would need care in a windowing rewrite.

---

## 3. Context/provider audit

Searched for context providers wrapping tab content. `PrivacyContext` (used by `SqlTab`) is the only app-level context found; it holds settings/consent flags, not dataset rows, and none of the audited tabs re-render from unrelated context updates — each tab subscribes to its own local/prop state, not a shared dataset context. No cross-tab rerender leakage found here.

## 4. Table audit (requirement #10)

| Table | Row count in practice | Virtualized? |
|---|---|---|
| `PreviewTab` main grid | up to 1,000,000 | Already virtualized (pre-existing), now with a fixed component-identity bug |
| `PivotTab` result table | up to thousands (field-cardinality-dependent) | **Fixed this pass** — added windowed scrolling above 200 rows |
| `SqlTab` query result table | up to 10,000 by default, more with explicit `LIMIT` | Not virtualized — flagged as lower-priority known gap |
| `DashboardTab` per-widget mini tables | capped at 5 rows in-code | Not a concern — already bounded |

## 5. Widget rerender audit (requirement #11)

Confirmed: after this pass, each dashboard widget only recomputes its expensive aggregation when its own `widget`/`rows`/`statistics`/`qualityScore` props actually change (via `React.memo`'s shallow comparison), not when switching tabs or when unrelated dashboard UI state changes — with the one documented exception that the `SortableWidget` *wrapper* (not the expensive widget body) can still re-render due to unstabilized `onRemove`/`onDuplicate`/`onResize` callbacks (see DashboardTab section above).

## 6. Memory audit (requirement #19)

Traced the dataset caching layer (`dataset-cache.ts`) and the analysis worker registration (`useAnalysisWorker.ts`): both use `WeakMap`s keyed on the `rows` array's object identity. This means cache entries are automatically garbage-collected once a `rows` array is no longer referenced elsewhere — which happens correctly today, since every state setter for rows (`setCleanedRows`, `setMergedRows`, `setFilteredRows`) replaces the previous array wholesale rather than accumulating into it. Checked `DashboardTab`'s undo stack: it only stores widget *configuration* objects (capped at 20 entries), never dataset rows. No memory retention bug found; this appears to already have been handled correctly in prior work, and nothing needed to change here.

---

## 7. Component/render table (requirement #17)

React DevTools Profiler could not be run in this sandbox (no browser). This table is the static-analysis equivalent: what would show up as unnecessary work, traced by reading the code, not measured.

| Component | Rendered how often (before) | Why it rerendered | Fix applied | Rendered how often (after) |
|---|---|---|---|---|
| `OverviewTab` | Every `DataFlowApp` render | New `parsed` object each time | Stable `currentParsed` + `React.memo` | Only when data/profile actually changes |
| `PreviewTab` (+ every visible row) | Every `DataFlowApp` render; every row fully remounted | New `parsed` object + new `DataRow`/`CellValue` identity each render | Stable `currentParsed`, hoisted+memoized row components | Rows re-render (not remount) only on their own data change |
| `VisualizeTab` | Every `DataFlowApp` render + extra: `numericCols`/`textCols` recomputed every render | New `parsed` object; `useMemo` keyed on whole `parsed` | Stable `currentParsed`, fixed dep arrays, `React.memo` | Only when data/statistics actually change |
| `KPIWidget`/`BarWidget`/`LineWidget`/`AreaWidget`/`PieWidget`/`TableWidget`/`InsightWidget` | Every `DashboardTab` render, times N widgets | No memoization at all | `React.memo` per widget | Only when that widget's own props change |
| `SortableWidget` | Every `DashboardTab` render | No memoization; also unstable callback props | `React.memo` (partial — callback instability documented, not fully resolved) | Reduced but not eliminated |
| `RecommendationCard` | Every `CleanTab` render, times N recommendations | Fresh inline `onApply`/`onDismiss` closures per card | Stable rec-taking callbacks + `React.memo` | Only when that card's own `rec` changes |
| `PivotTab` result rows | All rows mounted at once | No virtualization | Windowed scroll above 200 rows | Only visible window + overscan mounted |
| `CleanTab`, `DataQualityTab`, `AdvancedStatsTab`, `AnalyticsTab`, `SqlTab` | Every `DataFlowApp` render | No memoization at the tab level | `React.memo` | Only when their own props change |

---

## 8. Before/after timing (requirement #18)

**I want to be direct about this table rather than fabricate numbers:** without a browser I cannot produce real millisecond measurements for Upload, first-visit-to-Cleaning, first-visit-to-Analytics, first-visit-to-Pivot, tab-switch-back, or Dashboard render. Any specific number I typed here would be invented, not measured, and I don't think that's actually useful to you — it would look authoritative while being fiction.

What I can tell you with confidence, grounded in the actual code:

- **Tab-switch smoothness** (the reported symptom) should improve materially for Overview, Preview, and Visualize specifically, because the root cause — a new object reference on every parent render defeating all memoization downstream — is now fixed at the source.
- **Dashboard rendering** should improve materially whenever there's more than one widget on screen, since every widget previously redid a full O(rows) scan on every unrelated dashboard interaction, and now does not.
- **First visit to Cleaning/Analytics/Pivot** — the actual heavy computation was already off-thread before this pass (per your "completed already" list), so this pass doesn't change first-visit cost; it changes what happens on *revisits* and *unrelated re-renders* while a tab is mounted.
- **Upload** — untouched by this pass; nothing here changes the upload/parse path.

If you're able to test in an actual browser, the single most informative measurement would be: open React DevTools Profiler, record a session that uploads a ~1M row file, then switches Overview → Preview → Visualize → Dashboard → back to Overview a few times, and check whether Overview/Preview/Visualize now show "did not render" (greyed out) on the switches where the underlying data didn't change. That's the direct, checkable signature of the primary fix in this pass.

---

## 9. Known remaining risks (consolidated)

These were found but deliberately **not** changed, because fixing them would cross from "rendering optimization" into "computation/behavior change," which was explicitly out of scope:

1. **`PreviewTab`**: synchronous full-array `.sort()`/`.filter()` on search/sort input, for 1,000,000 rows.
2. **`AdvancedStatsTab`**: synchronous full-array statistics computation on column selection.
3. **`AnalyticsTab`**: `OutlierPanel.summary` and `TrendPanel.trendData` — synchronous full-array scans, by design (need true, non-sampled values).
4. **`SqlTab`**: result table not virtualized (bounded by a 10,000-row default `LIMIT`, but a user-specified larger `LIMIT` would render that many DOM rows).
5. **`DashboardTab`**: `removeWidget`/`duplicateWidget`/`updateWidgetSize` remain unstabilized callbacks, meaning `SortableWidget`'s wrapper (not the expensive widget body) can still re-render on unrelated dashboard state changes. Fixing this fully would require converting ~15 interlocking helper functions in that file to `useCallback` with verified-correct dependency arrays — a change I did not have the tooling to verify safely in this sandbox.

Each of these is flagged in an inline code comment at its exact location as well, so it's discoverable directly while reading the source.

---

## 10. Required commands — status

```
npm run typecheck   — NOT RUN (no network access to install dependencies in this sandbox)
npm run lint        — NOT RUN (same reason)
npm test            — NOT RUN (same reason)
npm run build       — NOT RUN (same reason)
```

**Please run these four commands yourself before merging.** What I can substantiate instead: every `.ts`/`.tsx` file in `src/` (not just the ones I edited) was parsed with `esbuild` after all changes and produced zero syntax errors. That's a real, meaningful signal, but it is not equivalent to `tsc --noEmit`, ESLint, or a passing test suite, and I don't want to imply otherwise.
