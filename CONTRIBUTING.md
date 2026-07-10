# Contributing to VKAnalyze

Thanks for considering a contribution. This project has one non-negotiable design constraint that shapes how contributions are reviewed: **raw dataset content stays in the browser unless the user explicitly opts in to sharing it.** Keep that in mind for anything touching file parsing, the Supabase client, or dashboard sharing.

## Before you start

- For anything beyond a small fix, please open an issue first to discuss the approach.
- Check the [Roadmap](/roadmap) page to see if what you're proposing is already planned or in progress.

## Development setup

```bash
git clone https://github.com/VIKASKT1/vkanalyze.git
cd vkanalyze
npm install
cp .env.example .env.local   # fill in your own Supabase project values
npm run dev
```

See the main [README](README.md) for full Supabase and Gemini setup instructions.

## Before opening a pull request

Run the full verification pipeline locally and make sure it's clean:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

All four must pass. A PR that fails any of these won't be merged as-is.

## Code style

- TypeScript strict mode — avoid `any`; prefer precise types.
- Match the existing patterns in the file you're editing rather than introducing a new style locally.
- Keep components focused; extract shared UI into `src/components/ui/` if it's used in more than one place.
- No `console.log` in committed code — use it for local debugging only, then remove it.

## Privacy-sensitive changes

If your change affects what data is sent to Supabase, an Edge Function, or the Gemini API, please explain in the PR description:

1. What data now leaves the browser that didn't before (if anything).
2. Why it's necessary.
3. Whether it's gated behind explicit user consent (it should be, in almost all cases).

## Database migrations

New migrations go in `supabase/migrations/` with a timestamp-prefixed filename matching the existing convention. Every new table needs Row Level Security enabled and explicit policies — no table should be created without RLS.

## Reporting bugs

Please include:
- Steps to reproduce
- The file format/shape involved, if data-related (a redacted sample structure, not real data)
- Browser and OS
- Console errors, if any

## Reporting security issues

Please do **not** open a public issue for security vulnerabilities — see [SECURITY.md](SECURITY.md) instead.

## License

By contributing, you agree that your contributions will be licensed under the project's [MIT License](LICENSE).
