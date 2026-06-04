"use client";

import { useState } from "react";
import { useTheme } from "@/hooks/useTheme";
import Link from "next/link";

type Section = "overview" | "quickstart" | "features" | "migration" | "rules" | "batch" | "iac" | "shortcuts" | "api" | "troubleshooting";

const NAV_ITEMS: { id: Section; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4" },
  { id: "quickstart", label: "Quick Start", icon: "M13 10V3L4 14h7v7l9-11h-7z" },
  { id: "features", label: "Features", icon: "M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" },
  { id: "migration", label: "Migration Guide", icon: "M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" },
  { id: "rules", label: "Custom Rules", icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" },
  { id: "batch", label: "Batch Migration", icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
  { id: "iac", label: "IaC Export", icon: "M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" },
  { id: "shortcuts", label: "Keyboard Shortcuts", icon: "M3 5a2 2 0 012-2h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5z" },
  { id: "api", label: "Service Mappings", icon: "M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" },
  { id: "troubleshooting", label: "Troubleshooting", icon: "M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
];

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState<Section>("overview");
  const { theme, toggleTheme, mounted } = useTheme();

  return (
    <div className="flex min-h-screen" style={{ background: "var(--background)", color: "var(--foreground)" }}>
      {/* Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-[280px] shrink-0 overflow-y-auto border-r p-6 lg:block" style={{ borderColor: "var(--card-border)", background: "var(--card)" }}>
        <Link href="/" className="flex items-center gap-3 mb-8">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-purple-500 shadow-lg shadow-indigo-500/30">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><path d="M7 7h10v10" /><path d="M7 17 17 7" /></svg>
          </div>
          <div>
            <span className="text-[14px] font-bold" style={{ color: "var(--foreground)" }}>FlowMigrate</span>
            <span className="block text-[10px] font-medium" style={{ color: "var(--muted)" }}>Documentation</span>
          </div>
        </Link>

        <nav className="space-y-1">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-[13px] font-medium transition-all ${
                activeSection === item.id ? "text-white shadow-sm" : ""
              }`}
              style={
                activeSection === item.id
                  ? { background: "var(--primary)" }
                  : { color: "var(--muted)" }
              }
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d={item.icon} />
              </svg>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="mt-8 rounded-xl border p-4" style={{ borderColor: "var(--card-border)", background: "var(--subtle-bg)" }}>
          <p className="text-[11px] font-bold" style={{ color: "var(--muted)" }}>Version 2.0</p>
          <p className="mt-1 text-[10px]" style={{ color: "var(--muted)", opacity: 0.7 }}>Powered by Gemini 3.5 Flash</p>
          <div className="mt-3 flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] font-semibold text-emerald-500">All systems operational</span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        {/* Top bar */}
        <div className="sticky top-0 z-20 flex items-center justify-between border-b px-6 py-3 backdrop-blur-xl" style={{ borderColor: "var(--card-border)", background: "var(--glass)" }}>
          <div className="flex items-center gap-3 lg:hidden">
            <Link href="/" className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"><path d="M7 7h10v10" /><path d="M7 17 17 7" /></svg>
              </div>
              <span className="text-[13px] font-bold">Docs</span>
            </Link>
          </div>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-3">
            <Link href="/" className="rounded-lg border px-4 py-2 text-[12px] font-semibold transition-all hover:shadow-md" style={{ borderColor: "var(--card-border)", color: "var(--primary)", background: "var(--card)" }}>
              Open App
            </Link>
            <button onClick={toggleTheme} className="rounded-lg border p-2 transition-all" style={{ borderColor: "var(--card-border)", color: "var(--muted)" }} aria-label="Toggle theme">
              {(!mounted || theme === "light") ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
              )}
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="mx-auto max-w-[820px] px-6 py-10 sm:px-10">
          {activeSection === "overview" && <OverviewSection />}
          {activeSection === "quickstart" && <QuickStartSection />}
          {activeSection === "features" && <FeaturesSection />}
          {activeSection === "migration" && <MigrationGuideSection />}
          {activeSection === "rules" && <CustomRulesSection />}
          {activeSection === "batch" && <BatchSection />}
          {activeSection === "iac" && <IaCSection />}
          {activeSection === "shortcuts" && <ShortcutsSection />}
          {activeSection === "api" && <ServiceMappingsSection />}
          {activeSection === "troubleshooting" && <TroubleshootingSection />}
        </div>
      </main>
    </div>
  );
}

/* ─── Shared Components ─────────────────────────────────────── */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h1 className="text-[28px] font-extrabold tracking-tight mb-2" style={{ color: "var(--foreground)" }}>{children}</h1>;
}

function SectionSubtitle({ children }: { children: React.ReactNode }) {
  return <p className="text-[15px] mb-8 leading-relaxed" style={{ color: "var(--muted)" }}>{children}</p>;
}

function Card({ title, children, accent }: { title: string; children: React.ReactNode; accent?: string }) {
  return (
    <div className="rounded-xl border p-5 mb-4" style={{ borderColor: "var(--card-border)", background: "var(--card)" }}>
      <h3 className="text-[14px] font-bold mb-2" style={{ color: accent || "var(--foreground)" }}>{title}</h3>
      <div className="text-[13px] leading-relaxed" style={{ color: "var(--muted)" }}>{children}</div>
    </div>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="rounded-lg border p-4 overflow-x-auto my-3 font-mono text-[12px] leading-6" style={{ borderColor: "var(--card-border)", background: "var(--subtle-bg)", color: "var(--editor-text)" }}>
      {children}
    </pre>
  );
}

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  const colors: Record<string, string> = {
    indigo: "bg-indigo-100 text-indigo-700 border-indigo-200",
    emerald: "bg-emerald-100 text-emerald-700 border-emerald-200",
    amber: "bg-amber-100 text-amber-700 border-amber-200",
    red: "bg-red-100 text-red-700 border-red-200",
    violet: "bg-violet-100 text-violet-700 border-violet-200",
  };
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${colors[color] || colors.indigo}`}>{children}</span>;
}

function Kbd({ children }: { children: string }) {
  return <kbd className="rounded-md border px-2 py-0.5 text-[11px] font-mono font-semibold shadow-sm" style={{ borderColor: "var(--card-border)", background: "var(--subtle-bg)", color: "var(--foreground)" }}>{children}</kbd>;
}

/* ─── Sections ──────────────────────────────────────────────── */

function OverviewSection() {
  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-purple-500 shadow-lg shadow-indigo-500/20">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><path d="M7 7h10v10" /><path d="M7 17 17 7" /></svg>
        </div>
        <div>
          <SectionTitle>FlowMigrate</SectionTitle>
          <p className="text-[13px] font-semibold" style={{ color: "var(--primary)" }}>Enterprise Workflow Migration Bridge</p>
        </div>
      </div>
      <SectionSubtitle>
        FlowMigrate is an AI-powered platform that migrates cloud workflow definitions between AWS Step Functions (ASL) and Azure Logic Apps with enterprise-grade precision. Powered by Gemini 3.5 Flash, it delivers deployment-ready output with full schema validation, behavioral comparison, and visual workflow analysis.
      </SectionSubtitle>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 mb-8">
        {[
          { title: "AI-Powered Migration", desc: "Gemini 3.5 Flash translates complex workflow logic with full service mapping", badge: "Core" },
          { title: "Visual Workflow Graphs", desc: "Side-by-side interactive flow diagrams of source and migrated workflows", badge: "Visual" },
          { title: "Behavioral Comparison", desc: "Step-by-step analysis showing exact/review/gap status for each mapping", badge: "Analysis" },
          { title: "Schema Validation", desc: "Output validated against target platform schema before delivery", badge: "Quality" },
          { title: "Feedback Corrections", desc: "Edit output to teach the AI — corrections persist across sessions", badge: "Learning" },
          { title: "Custom Rules Engine", desc: "Pre/post-processing rules for deterministic overrides on every migration", badge: "Control" },
          { title: "Batch Migration", desc: "Migrate multiple workflow files at once with ZIP download", badge: "Scale" },
          { title: "IaC Export", desc: "Generate Terraform HCL or CloudFormation templates from migrated output", badge: "Deploy" },
        ].map((item, i) => (
          <div key={i} className="rounded-xl border p-4" style={{ borderColor: "var(--card-border)", background: "var(--card)" }}>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[13px] font-bold" style={{ color: "var(--foreground)" }}>{item.title}</span>
              <Badge color="indigo">{item.badge}</Badge>
            </div>
            <p className="text-[12px]" style={{ color: "var(--muted)" }}>{item.desc}</p>
          </div>
        ))}
      </div>

      <Card title="Architecture">
        <p><strong>Frontend:</strong> Next.js 16 (App Router) + React 19 + Tailwind CSS 4 + ReactFlow</p>
        <p><strong>AI Engine:</strong> Google Gemini 3.5 Flash via @google/generative-ai SDK</p>
        <p><strong>Storage:</strong> IndexedDB (version history), localStorage (corrections, rules, theme)</p>
        <p><strong>Export:</strong> JSZip for batch downloads, Gemini for IaC generation</p>
      </Card>
    </div>
  );
}

function QuickStartSection() {
  return (
    <div>
      <SectionTitle>Quick Start</SectionTitle>
      <SectionSubtitle>Get up and running with FlowMigrate in under 2 minutes.</SectionSubtitle>

      <Card title="Step 1 — Load a Workflow">
        <p>Paste your AWS Step Functions (ASL) or Azure Logic Apps JSON into the <strong>Source Workflow</strong> editor. The platform is auto-detected.</p>
        <p className="mt-2">Alternatively:</p>
        <ul className="list-disc pl-5 mt-1 space-y-1">
          <li>Click <strong>AWS Sample</strong> or <strong>Azure Sample</strong> to load a demo workflow</li>
          <li>Drag &amp; drop a <code>.json</code> file onto the editor</li>
          <li>Use <strong>Smart Upload</strong> to extract workflows from screenshots or documents</li>
        </ul>
      </Card>

      <Card title="Step 2 — Configure Target">
        <p>The target platform is set automatically (opposite of detected source). You can override it with the <strong>Target</strong> dropdown.</p>
      </Card>

      <Card title="Step 3 — Migrate">
        <p>Click the <strong>Migrate Workflow</strong> button (or press <Kbd>Ctrl+Enter</Kbd>). The AI processes your workflow and generates the migrated output in seconds.</p>
      </Card>

      <Card title="Step 4 — Review &amp; Export">
        <p>Review the output in the <strong>Migrated Output</strong> editor. Use:</p>
        <ul className="list-disc pl-5 mt-1 space-y-1">
          <li><strong>Visual Workflow Graph</strong> — side-by-side flow diagrams</li>
          <li><strong>Behavioral Comparison</strong> — step-by-step mapping analysis</li>
          <li><strong>View Diff</strong> — source vs output diff viewer</li>
          <li><strong>Export IaC</strong> — generate Terraform or CloudFormation</li>
          <li><strong>Download</strong> — save the migrated JSON (or press <Kbd>Ctrl+S</Kbd>)</li>
        </ul>
      </Card>

      <Card title="Step 5 — Teach the AI (Optional)">
        <p>If the output needs corrections, edit it directly. A yellow banner appears — click <strong>Submit Corrections</strong> to teach the AI. Future migrations will apply your learned corrections automatically.</p>
      </Card>
    </div>
  );
}

function FeaturesSection() {
  return (
    <div>
      <SectionTitle>Features</SectionTitle>
      <SectionSubtitle>A comprehensive toolkit for enterprise workflow migration.</SectionSubtitle>

      {[
        { title: "Dark Mode", desc: "Full dark theme with system preference detection. Toggle via the moon/sun icon in the header. Persists across sessions via localStorage. Anti-FOUC protection ensures no flash on page load.", badge: "UI" },
        { title: "Undo / Redo", desc: "Per-editor undo/redo history (up to 100 entries). Use Ctrl+Z / Ctrl+Shift+Z or the toolbar buttons. Debounced at 400ms to avoid noise from rapid typing.", badge: "Editor" },
        { title: "Version History", desc: "Every migration is auto-saved to IndexedDB. Click the clock icon to browse, load, or delete past migrations. Survives page reload and browser restart.", badge: "Storage" },
        { title: "Feedback Corrections", desc: "Edit the migrated output, then submit corrections. The AI learns your preferences and applies them to future migrations. Corrections are grouped by pattern (wrong type, missing field, wrong expression, etc.).", badge: "Learning" },
        { title: "Smart Upload", desc: "Upload a screenshot of a workflow diagram or a document describing a workflow. AI extracts the structure and generates valid JSON.", badge: "Input" },
        { title: "AI Assistant", desc: "Floating chat panel for asking questions about your workflow, the migration, or the platforms. Context-aware — it sees your source, output, and comparison data.", badge: "AI" },
        { title: "Accessibility", desc: "Full ARIA attributes, role annotations, keyboard navigation, focus management, and prefers-reduced-motion support. Screen reader compatible.", badge: "A11y" },
        { title: "Responsive Design", desc: "Mobile-first layout with tab switcher for Source/Output on small screens. Compact controls, stacked layouts, and touch-friendly targets.", badge: "Mobile" },
      ].map((item, i) => (
        <Card key={i} title={item.title}>
          <Badge color="violet">{item.badge}</Badge>
          <p className="mt-2">{item.desc}</p>
        </Card>
      ))}
    </div>
  );
}

function MigrationGuideSection() {
  return (
    <div>
      <SectionTitle>Migration Guide</SectionTitle>
      <SectionSubtitle>Understanding how FlowMigrate converts workflows between platforms.</SectionSubtitle>

      <Card title="Full Azure-Native Migration" accent="var(--primary)">
        <p>FlowMigrate performs <strong>complete platform migration</strong>, not just orchestration wrapping. Every AWS service reference is replaced with its Azure-native equivalent:</p>
        <ul className="list-disc pl-5 mt-2 space-y-1.5">
          <li><strong>Lambda</strong> → Azure Functions</li>
          <li><strong>DynamoDB</strong> → Cosmos DB</li>
          <li><strong>SQS</strong> → Service Bus Queue</li>
          <li><strong>SNS</strong> → Service Bus Topic / Event Grid</li>
          <li><strong>S3</strong> → Azure Blob Storage / ADLS Gen2</li>
          <li><strong>Glue</strong> → Azure Data Factory</li>
          <li><strong>Athena</strong> → Azure Synapse Analytics</li>
          <li><strong>CloudWatch</strong> → Azure Monitor</li>
          <li><strong>SSM Parameter Store</strong> → Azure App Configuration / Key Vault</li>
          <li><strong>EventBridge</strong> → Event Grid</li>
          <li><strong>Kinesis</strong> → Event Hubs</li>
        </ul>
      </Card>

      <Card title="State Data Preservation (ResultPath)">
        <p>AWS Step Functions uses <code>ResultPath</code> to accumulate data through execution. FlowMigrate handles this by:</p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>Creating <strong>Compose</strong> actions to store intermediate results</li>
          <li>Using <strong>InitializeVariable / SetVariable</strong> for complex state accumulation</li>
          <li>Ensuring downstream actions reference results via <code>@body()</code> and <code>@outputs()</code></li>
        </ul>
        <p className="mt-2">All state variables (<code>build_result</code>, <code>validation_results</code>, etc.) are preserved through the migrated workflow.</p>
      </Card>

      <Card title="Map State Aggregation">
        <p>AWS Map states that collect results are migrated with <strong>proper result aggregation</strong>:</p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>Data transformation Maps → <strong>Select</strong> action (atomic, no race conditions)</li>
          <li>Side-effect Maps → <strong>Foreach</strong> with result collection via <strong>Compose</strong></li>
          <li>Results are always collected — no TODO placeholders left behind</li>
        </ul>
      </Card>

      <Card title="Conditional Branching">
        <p>AWS Choice states are precisely mapped:</p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li><strong>StringEquals on same variable</strong> → Switch action</li>
          <li><strong>Numeric / boolean / mixed</strong> → If action</li>
          <li>All branch actions are nested inside <code>actions</code> and <code>else.actions</code></li>
        </ul>
      </Card>

      <Card title="Error Handling &amp; Retry">
        <p>AWS Catch and Retry blocks are fully migrated:</p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li><strong>Catch</strong> → <code>runAfter: {`{"action": ["Failed", "TimedOut"]}`}</code></li>
          <li><strong>Retry with BackoffRate &gt; 1</strong> → Exponential retry policy</li>
          <li><strong>Retry with BackoffRate = 1</strong> → Fixed retry policy</li>
          <li>Parallel branches with Catch → Scope-wrapped branches</li>
        </ul>
      </Card>
    </div>
  );
}

function CustomRulesSection() {
  return (
    <div>
      <SectionTitle>Custom Rules</SectionTitle>
      <SectionSubtitle>Deterministic pre/post-processing rules that override or augment AI migration.</SectionSubtitle>

      <Card title="How Custom Rules Work">
        <p><strong>Pre-processing rules</strong> modify the source JSON <em>before</em> the AI sees it. Use these to normalize input.</p>
        <p className="mt-1"><strong>Post-processing rules</strong> modify the AI output <em>after</em> migration. Use these for deterministic overrides.</p>
        <p className="mt-2">Rules are applied client-side. The API stays stateless.</p>
      </Card>

      <Card title="Rule Types">
        <ul className="space-y-2 mt-1">
          <li><Badge color="indigo">Regex Replace</Badge> — Pattern-based find &amp; replace across the entire JSON string</li>
          <li><Badge color="emerald">JSON Path Replace</Badge> — Dot-separated path with wildcard support (e.g., <code>actions.*.type</code>)</li>
          <li><Badge color="amber">Field Rename</Badge> — Recursively rename a field throughout the JSON tree</li>
          <li><Badge color="red">Field Delete</Badge> — Recursively remove a field from the entire JSON tree</li>
        </ul>
      </Card>

      <Card title="Example: Fix Lambda ARN Format">
        <CodeBlock>{`Name: Fix Lambda ARN region
Type: Regex Replace
Stage: Post-Processing
Direction: Azure → AWS
Match: arn:aws:lambda:REGION:ACCOUNT
Replace: arn:aws:lambda:us-east-1:123456789012`}</CodeBlock>
      </Card>
    </div>
  );
}

function BatchSection() {
  return (
    <div>
      <SectionTitle>Batch Migration</SectionTitle>
      <SectionSubtitle>Migrate multiple workflow files in a single operation.</SectionSubtitle>

      <Card title="How It Works">
        <ol className="list-decimal pl-5 space-y-1.5 mt-1">
          <li><strong>Upload</strong> — Drop or browse multiple <code>.json</code> files. Platform is auto-detected per file.</li>
          <li><strong>Process</strong> — Files are migrated sequentially with 500ms delay between requests (rate limiting). Cancel anytime.</li>
          <li><strong>Results</strong> — View per-file status (success/error/skipped). Download individual files or all as a ZIP.</li>
        </ol>
      </Card>

      <Card title="Load Into Editor">
        <p>Click <strong>Open</strong> on any successful result to load it into the main editor for further review, diff viewing, or IaC export.</p>
      </Card>
    </div>
  );
}

function IaCSection() {
  return (
    <div>
      <SectionTitle>Infrastructure as Code Export</SectionTitle>
      <SectionSubtitle>Generate deployment-ready Terraform or CloudFormation from your migrated workflow.</SectionSubtitle>

      <Card title="Terraform (HCL)">
        <p>Generates complete HCL configuration with:</p>
        <ul className="list-disc pl-5 mt-1 space-y-1">
          <li><code>azurerm</code> provider block (for Azure output) or <code>aws</code> provider block (for AWS output)</li>
          <li>Resource group / IAM role definitions</li>
          <li>Workflow resource with embedded definition</li>
          <li>Appropriate tags and outputs</li>
        </ul>
      </Card>

      <Card title="CloudFormation (JSON)">
        <p>Generates complete CloudFormation template with:</p>
        <ul className="list-disc pl-5 mt-1 space-y-1">
          <li><code>AWS::StepFunctions::StateMachine</code> resource</li>
          <li><code>AWS::IAM::Role</code> for execution</li>
          <li>Parameters and Outputs sections</li>
          <li>Embedded definition via <code>Fn::Sub</code></li>
        </ul>
      </Card>

      <Card title="Usage">
        <p>After a successful migration, click the green <strong>Export IaC</strong> button in the output editor toolbar. Select your format, click <strong>Generate</strong>, then copy or download the result.</p>
      </Card>
    </div>
  );
}

function ShortcutsSection() {
  const shortcuts = [
    { keys: "Ctrl + Enter", action: "Run migration" },
    { keys: "Ctrl + S", action: "Download output" },
    { keys: "Ctrl + Shift + C", action: "Clear workspace" },
    { keys: "?", action: "Show shortcuts modal" },
    { keys: "Ctrl + Z", action: "Undo (in editor)" },
    { keys: "Ctrl + Shift + Z", action: "Redo (in editor)" },
  ];

  return (
    <div>
      <SectionTitle>Keyboard Shortcuts</SectionTitle>
      <SectionSubtitle>Power-user shortcuts for faster workflows. Press ? anytime to see the modal.</SectionSubtitle>

      <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--card-border)", background: "var(--card)" }}>
        {shortcuts.map((s, i) => (
          <div key={i} className="flex items-center justify-between border-b px-5 py-3.5 last:border-b-0" style={{ borderColor: "var(--card-border)" }}>
            <span className="text-[13px] font-medium" style={{ color: "var(--foreground)" }}>{s.action}</span>
            <Kbd>{s.keys}</Kbd>
          </div>
        ))}
      </div>
    </div>
  );
}

function ServiceMappingsSection() {
  const mappings = [
    { aws: "Lambda", azure: "Azure Functions", type: "Function" },
    { aws: "DynamoDB", azure: "Cosmos DB", type: "Http" },
    { aws: "SQS", azure: "Service Bus Queue", type: "ApiConnection" },
    { aws: "SNS", azure: "Service Bus Topic / Event Grid", type: "ApiConnection" },
    { aws: "S3", azure: "Blob Storage / ADLS Gen2", type: "Http" },
    { aws: "Glue", azure: "Azure Data Factory", type: "Http" },
    { aws: "Athena", azure: "Azure Synapse Analytics", type: "Http" },
    { aws: "CloudWatch", azure: "Azure Monitor", type: "Http" },
    { aws: "SSM Parameter Store", azure: "App Configuration / Key Vault", type: "Http" },
    { aws: "EventBridge", azure: "Event Grid", type: "ApiConnection" },
    { aws: "Kinesis", azure: "Event Hubs", type: "ApiConnection" },
    { aws: "Step Functions (nested)", azure: "Logic Apps (nested)", type: "Http" },
  ];

  return (
    <div>
      <SectionTitle>Service Mappings</SectionTitle>
      <SectionSubtitle>Complete AWS → Azure service equivalency table used during migration.</SectionSubtitle>

      <div className="rounded-xl border overflow-hidden overflow-x-auto" style={{ borderColor: "var(--card-border)", background: "var(--card)" }}>
        <table className="w-full text-[12px]">
          <thead>
            <tr style={{ background: "var(--subtle-bg)" }}>
              <th className="px-4 py-3 text-left font-bold" style={{ color: "var(--foreground)" }}>AWS Service</th>
              <th className="px-4 py-3 text-left font-bold" style={{ color: "var(--foreground)" }}>Azure Equivalent</th>
              <th className="px-4 py-3 text-left font-bold" style={{ color: "var(--foreground)" }}>Action Type</th>
            </tr>
          </thead>
          <tbody>
            {mappings.map((m, i) => (
              <tr key={i} className="border-t" style={{ borderColor: "var(--card-border)" }}>
                <td className="px-4 py-2.5 font-medium" style={{ color: "var(--aws-color)" }}>{m.aws}</td>
                <td className="px-4 py-2.5 font-medium" style={{ color: "var(--azure-color)" }}>{m.azure}</td>
                <td className="px-4 py-2.5 font-mono text-[11px]" style={{ color: "var(--muted)" }}>{m.type}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6">
        <Card title="State Type Mappings">
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 mt-1 text-[12px]">
            {[
              ["Pass", "Compose"], ["Wait", "Wait"], ["Succeed", "Terminate (Succeeded)"],
              ["Fail", "Terminate (Failed)"], ["Choice", "If / Switch"], ["Parallel", "Implicit (runAfter)"],
              ["Map (transform)", "Select"], ["Map (side-effects)", "Foreach"],
            ].map(([aws, azure], i) => (
              <div key={i} className="flex items-center gap-2 py-1">
                <span className="font-medium" style={{ color: "var(--aws-color)" }}>{aws}</span>
                <span style={{ color: "var(--muted)" }}>→</span>
                <span className="font-medium" style={{ color: "var(--azure-color)" }}>{azure}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function TroubleshootingSection() {
  return (
    <div>
      <SectionTitle>Troubleshooting</SectionTitle>
      <SectionSubtitle>Common issues and solutions.</SectionSubtitle>

      <Card title="503 Service Unavailable">
        <p>The Gemini API is experiencing high demand. FlowMigrate automatically falls back through multiple models (<code>gemini-3.5-flash</code> → <code>gemini-2.5-flash</code> → <code>gemini-2.0-flash</code>). If all fail, wait a few minutes and retry.</p>
      </Card>

      <Card title="Invalid JSON Output">
        <p>Occasionally the AI may produce JSON that needs manual tweaking. Check the <strong>Schema Validation</strong> panel in the Migration Log for specific errors and paths.</p>
      </Card>

      <Card title="Missing Service Mapping">
        <p>If a specialized AWS service (e.g., Textract, Rekognition) is not fully mapped, it will appear as an HTTP action with TODO placeholders. Use <strong>Custom Rules</strong> to add deterministic post-processing for these cases.</p>
      </Card>

      <Card title="Corrections Not Applying">
        <p>Corrections are direction-specific (AWS→Azure vs Azure→AWS). Ensure you have corrections for the migration direction you are running. Check the corrections panel — the badge shows the count for the active direction.</p>
      </Card>

      <Card title="Theme Not Persisting">
        <p>Theme is stored in <code>localStorage</code> under key <code>flowmigrate_theme</code>. If using incognito mode, the theme resets on each visit. Clear site data to reset.</p>
      </Card>

      <Card title="Version History Not Loading">
        <p>Version history uses IndexedDB (<code>flowmigrate_versions</code>). If the database is corrupted, open browser DevTools → Application → IndexedDB → delete <code>flowmigrate_versions</code> and reload.</p>
      </Card>
    </div>
  );
}
