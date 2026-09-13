# FlowMigrate — Pipeline Migrator

An AI-assisted migration workbench for converting workflows between **AWS Step Functions (ASL)** and **Azure Logic Apps** — bidirectionally, with schema validation, behavioral comparison, IaC export, and a learning correction loop.

## Features

- **AI-powered migration** — Gemini-backed translation between ASL and Logic Apps definitions, auto-detecting the source platform and direction.
- **30+ enterprise migration rules** — programmatic post-processing for service mappings, PII redaction, region/account placeholders, and known AWS↔Azure gaps.
- **Schema validation** — deployment-readiness checks against both platforms' schemas, with errors/warnings surfaced inline.
- **Workflow graph view** — visual diff of source vs. migrated resource topology.
- **Corrections engine** — edit the AI output and submit corrections; they're learned and applied to future migrations.
- **Medallion analysis** — Silver/Gold layer spec and codegen panels, semantic migration engine, transformation pattern analyzer, platform dependency and sync analysis.
- **IaC export** — generate Terraform/CloudFormation/Bicep from a migrated workflow.
- **Version history, diff viewer, batch migration, multi-workflow dashboard, keyboard shortcuts.**
- **Smart upload** — generate a source workflow from a document or screenshot.

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure your API key

Copy the key into `.env.local` (already gitignored):

```bash
GEMINI_API_KEY=your-key-here
```

Get a free key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey). Every AI-backed route (`/api/migrate`, `/api/assistant`, `/api/export-iac`, `/api/generate-from-document`, `/api/generate-from-image`) requires this.

### 3. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · `@google/genai` (Gemini) · `@xyflow/react` (workflow graph) · `jszip`, `mammoth`, `pdf-parse` (document ingestion).

## Deployment

Deploy on [Vercel](https://vercel.com/new) or any Node host that supports Next.js. Set `GEMINI_API_KEY` in the target environment's secrets/config — it is never bundled into the client.
