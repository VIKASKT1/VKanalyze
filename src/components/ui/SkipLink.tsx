/**
 * Visually hidden until focused (e.g. via Tab from the top of the page),
 * then jumps keyboard/screen-reader users straight past the navbar to the
 * page's main content. Paired with `<main id="main-content">` in PageShell,
 * HomePage, NotFoundPage, and SharedDashboardView.
 */
export default function SkipLink() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:px-4 focus:py-2.5 focus:rounded-lg focus:bg-paper focus:text-ink focus:font-semibold focus:text-sm focus:outline-none focus:ring-2 focus:ring-accent-bright"
    >
      Skip to main content
    </a>
  );
}
