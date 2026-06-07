# VKAnalyze – AI-Powered Spreadsheet Analytics Platform

Upload any CSV or Excel file and get instant AI-powered analysis, beautiful charts, data cleaning tools, and PDF reports — all running in your browser.

**Live Demo:** [Add your URL after deployment]

## Features

- Upload CSV, XLSX, XLS files up to 50MB
- Automatic data profiling — column types, statistics, quality score
- AI chat powered by Google Gemini — ask questions in plain English
- Data cleaning — remove duplicates, fill nulls, trim whitespace
- 5 chart types — bar, line, pie, scatter, histogram
- AI-generated insights and recommendations
- PDF report export with statistics
- 100% browser-based — your data never leaves your device
- Mobile responsive

## Tech Stack

- **Frontend:** React 18 + TypeScript + Vite
- **Styling:** Tailwind CSS
- **Auth + Database:** Supabase
- **AI:** Google Gemini 2.0 Flash via Supabase Edge Functions
- **Charts:** Recharts
- **PDF:** jsPDF + jspdf-autotable
- **Deployment:** Netlify / Vercel

## Quick Start

1. Clone the repo
2. Run: npm install
3. Copy .env.example to .env.local and fill in your Supabase keys
4. Run: npm run dev
5. Open http://localhost:5173

## Environment Variables

```
VITE_SUPABASE_URL=your-supabase-project-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

## Deployment

Deploy on Netlify or Vercel. Add the environment variables in the dashboard. Deploy the Supabase Edge Function with your GEMINI_API_KEY secret.

## About

Built by **Vikas** — self-taught developer and BCA student from Karnataka, India.

Developed using AI-assisted tools (Bolt.new, Claude) as a portfolio project demonstrating full-stack development, AI integration, and data engineering concepts.

## Note on AI-Assisted Development

This project was designed, architected, and quality-reviewed by the developer. AI coding tools were used for implementation acceleration. All product decisions, feature priorities, and technical choices were made by the developer.
