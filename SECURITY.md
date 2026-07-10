# Security Policy

## Our approach

VKAnalyze is built around a privacy-first architecture: dataset files are parsed client-side and never uploaded to any server by default. Security issues that could compromise this guarantee — or any other part of the platform — are taken seriously.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Instead, email **vikasvikki010@gmail.com** with:

- A description of the vulnerability and its potential impact
- Steps to reproduce (a minimal example is ideal)
- Any relevant logs, screenshots, or proof-of-concept code

You should receive an acknowledgment within 48 hours, and we aim to provide an initial assessment within 5 business days. We'll keep you updated as we work on a fix and will credit you (if you'd like) once it's resolved.

## Scope

In scope:
- The VKAnalyze web application (frontend)
- Supabase Edge Functions in `supabase/functions/`
- Database schema and Row Level Security policies in `supabase/migrations/`
- Authentication and session handling

Out of scope:
- Vulnerabilities in third-party dependencies (please report those upstream, though we'd appreciate a heads-up)
- Social engineering or physical attacks
- Denial-of-service attacks against shared infrastructure

## Supported versions

Security fixes are applied to the latest released version only. We recommend always running the most recent release.

## Known architecture notes for security researchers

- Raw file data is processed client-side; only column-level statistics, a quality score, and (only with explicit user opt-in) aggregated dashboard snapshots are ever persisted server-side.
- Every database table has Row Level Security enabled — if you find a table without an appropriate policy, that's a valid finding.
- The Gemini AI integration is proxied through a Supabase Edge Function; the API key never reaches the browser bundle.
