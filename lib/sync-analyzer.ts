export type SyncPatternType =
  | "synchronous-job"
  | "long-running-job"
  | "polling-pattern"
  | "completion-check"
  | "wait-state"
  | "barrier-sync"
  | "callback-wait"
  | "timeout-guard";

export type CompletionSemantics =
  | "block-until-done"
  | "poll-until-done"
  | "callback-on-done"
  | "fire-and-forget"
  | "timeout-with-fallback";

export interface SyncConstruct {
  id: string;
  name: string;
  patternType: SyncPatternType;
  completionSemantics: CompletionSemantics;
  sourceExpression: string;
  upstreamDeps: string[];
  downstreamDeps: string[];
  estimatedDuration: "fast" | "medium" | "long" | "unbounded";
  timeoutSeconds: number | null;
  pollingIntervalSeconds: number | null;
  completionCondition: string;
  confidence: number;
  notes: string[];
}

export interface PollingRequirement {
  id: string;
  constructId: string;
  actionName: string;
  endpoint: string;
  method: string;
  intervalSeconds: number;
  maxAttempts: number;
  timeoutSeconds: number;
  successCondition: string;
  failureCondition: string;
  backoffStrategy: "fixed" | "linear" | "exponential";
  code: string;
}

export interface CompletionValidation {
  id: string;
  constructId: string;
  name: string;
  description: string;
  expression: string;
  severity: "critical" | "warning" | "info";
  autoEnforce: boolean;
  enforcementCode?: string;
}

export interface SyncStrategy {
  constructId: string;
  name: string;
  sourcePattern: string;
  targetPattern: string;
  preservesSemantics: boolean;
  riskLevel: "low" | "medium" | "high";
  explanation: string;
  targetCode: string;
}

export interface SyncAnalysisResult {
  constructs: SyncConstruct[];
  strategies: SyncStrategy[];
  pollingRequirements: PollingRequirement[];
  completionValidations: CompletionValidation[];
  executionOrder: string[];
  summary: SyncSummary;
  overallConfidence: number;
}

export interface SyncSummary {
  totalConstructs: number;
  byPattern: Record<SyncPatternType, number>;
  synchronousCount: number;
  longRunningCount: number;
  pollingRequired: number;
  barrierPoints: number;
  maxChainDepth: number;
  warnings: string[];
}

const PATTERN_LABELS: Record<SyncPatternType, string> = {
  "synchronous-job": "Synchronous Job",
  "long-running-job": "Long-Running Job",
  "polling-pattern": "Polling Pattern",
  "completion-check": "Completion Check",
  "wait-state": "Wait State",
  "barrier-sync": "Barrier Sync",
  "callback-wait": "Callback Wait",
  "timeout-guard": "Timeout Guard",
};

export { PATTERN_LABELS };

// ── Pattern detection ───────────────────────────────────────────────────────

interface SyncPatternDef {
  regex: RegExp;
  patternType: SyncPatternType;
  semantics: CompletionSemantics;
  descTemplate: string;
  duration: "fast" | "medium" | "long" | "unbounded";
}

const ASL_SYNC_PATTERNS: SyncPatternDef[] = [
  { regex: /"Type"\s*:\s*"Task"[^}]*"Resource"\s*:\s*"arn:aws:states:::(\w+):(\w+)\.sync"/gi, patternType: "synchronous-job", semantics: "block-until-done", descTemplate: "Sync task — $1:$2 (blocks until complete)", duration: "long" },
  { regex: /"Type"\s*:\s*"Task"[^}]*"Resource"\s*:\s*"arn:aws:states:::(\w+):(\w+)\.waitForTaskToken"/gi, patternType: "callback-wait", semantics: "callback-on-done", descTemplate: "Callback wait — $1:$2 (waits for token)", duration: "unbounded" },
  { regex: /"Type"\s*:\s*"Task"[^}]*"Resource"\s*:\s*"arn:aws:states:::(\w+):(\w+)"/gi, patternType: "synchronous-job", semantics: "fire-and-forget", descTemplate: "Async task — $1:$2 (fire-and-forget)", duration: "fast" },
  { regex: /"Type"\s*:\s*"Wait"[^}]*"Seconds"\s*:\s*(\d+)/gi, patternType: "wait-state", semantics: "block-until-done", descTemplate: "Wait state — $1 seconds", duration: "medium" },
  { regex: /"Type"\s*:\s*"Wait"[^}]*"Timestamp"/gi, patternType: "wait-state", semantics: "block-until-done", descTemplate: "Wait until timestamp", duration: "unbounded" },
  { regex: /"Type"\s*:\s*"Wait"[^}]*"SecondsPath"/gi, patternType: "wait-state", semantics: "block-until-done", descTemplate: "Dynamic wait (SecondsPath)", duration: "long" },
  { regex: /"TimeoutSeconds"\s*:\s*(\d+)/gi, patternType: "timeout-guard", semantics: "timeout-with-fallback", descTemplate: "Timeout guard — $1s", duration: "long" },
  { regex: /"HeartbeatSeconds"\s*:\s*(\d+)/gi, patternType: "timeout-guard", semantics: "timeout-with-fallback", descTemplate: "Heartbeat check — every $1s", duration: "long" },
  { regex: /"MaxConcurrency"\s*:\s*(\d+)/gi, patternType: "barrier-sync", semantics: "block-until-done", descTemplate: "Concurrency barrier — max $1", duration: "long" },
  { regex: /"Retry"\s*:\s*\[/gi, patternType: "completion-check", semantics: "block-until-done", descTemplate: "Retry policy with completion check", duration: "medium" },
  { regex: /"Catch"\s*:\s*\[/gi, patternType: "completion-check", semantics: "timeout-with-fallback", descTemplate: "Error catch with fallback", duration: "fast" },
];

const LOGIC_APPS_SYNC_PATTERNS: SyncPatternDef[] = [
  { regex: /"type"\s*:\s*"Until"[^}]*"limit"[^}]*"timeout"\s*:\s*"([^"]+)"/gi, patternType: "polling-pattern", semantics: "poll-until-done", descTemplate: "Until loop polling — timeout $1", duration: "long" },
  { regex: /"type"\s*:\s*"Until"/gi, patternType: "polling-pattern", semantics: "poll-until-done", descTemplate: "Until loop polling pattern", duration: "long" },
  { regex: /"operationOptions"\s*:\s*"DisableAsyncPattern"/gi, patternType: "synchronous-job", semantics: "block-until-done", descTemplate: "Synchronous execution (DisableAsyncPattern)", duration: "medium" },
  { regex: /"runAfter"\s*:\s*\{[^}]*"Succeeded"[^}]*\}/gi, patternType: "completion-check", semantics: "block-until-done", descTemplate: "RunAfter completion gate — Succeeded", duration: "fast" },
  { regex: /"runAfter"\s*:\s*\{[^}]*"Failed"[^}]*\}/gi, patternType: "completion-check", semantics: "timeout-with-fallback", descTemplate: "RunAfter failure handler", duration: "fast" },
  { regex: /"type"\s*:\s*"Wait"/gi, patternType: "wait-state", semantics: "block-until-done", descTemplate: "Delay/Wait action", duration: "medium" },
  { regex: /"type"\s*:\s*"ApiConnectionWebhook"/gi, patternType: "callback-wait", semantics: "callback-on-done", descTemplate: "Webhook callback wait", duration: "unbounded" },
  { regex: /"retryPolicy"\s*:\s*\{/gi, patternType: "completion-check", semantics: "block-until-done", descTemplate: "Retry policy on action", duration: "medium" },
  { regex: /"type"\s*:\s*"Scope"[^}]*"runAfter"/gi, patternType: "barrier-sync", semantics: "block-until-done", descTemplate: "Scope barrier — all children must complete", duration: "long" },
  { regex: /azure-api-management|functions|service-bus/gi, patternType: "long-running-job", semantics: "poll-until-done", descTemplate: "Azure long-running service call", duration: "long" },
];

const GENERAL_SYNC_PATTERNS: SyncPatternDef[] = [
  { regex: /(?:poll|polling|check_status|get_status|wait_for)[\w_]*/gi, patternType: "polling-pattern", semantics: "poll-until-done", descTemplate: "Polling function call", duration: "long" },
  { regex: /(?:submit|start|trigger|launch|invoke)[\w_]*(?:job|task|run|pipeline|workflow)/gi, patternType: "long-running-job", semantics: "fire-and-forget", descTemplate: "Long-running job submission", duration: "long" },
  { regex: /(?:wait_for_completion|await_result|block_until|synchronous)/gi, patternType: "synchronous-job", semantics: "block-until-done", descTemplate: "Explicit synchronous wait", duration: "long" },
  { regex: /(?:callback|webhook|notify_on_complete|on_success|on_failure)/gi, patternType: "callback-wait", semantics: "callback-on-done", descTemplate: "Callback/webhook completion", duration: "unbounded" },
  { regex: /(?:timeout|deadline|max_wait|time_limit)\s*[=:]\s*(\d+)/gi, patternType: "timeout-guard", semantics: "timeout-with-fallback", descTemplate: "Timeout setting — $1", duration: "long" },
  { regex: /(?:barrier|gate|checkpoint|milestone|sync_point)/gi, patternType: "barrier-sync", semantics: "block-until-done", descTemplate: "Synchronization barrier", duration: "medium" },
  { regex: /(?:life_cycle_state|execution_state|run_state|job_status)\s*[=!]=\s*["'](\w+)["']/gi, patternType: "completion-check", semantics: "poll-until-done", descTemplate: "Status check — expect '$1'", duration: "fast" },
  { regex: /(?:sleep|delay|pause)\s*\(\s*(\d+)/gi, patternType: "wait-state", semantics: "block-until-done", descTemplate: "Explicit delay — $1 units", duration: "medium" },
];

// ── Main analysis ───────────────────────────────────────────────────────────

export function analyzeSynchronization(
  sourceCode: string,
  outputCode: string,
  direction: "aws-to-azure" | "azure-to-aws"
): SyncAnalysisResult {
  const constructs = extractSyncConstructs(sourceCode, outputCode, direction);
  const executionOrder = deriveExecutionOrder(constructs);
  const strategies = generateStrategies(constructs, direction);
  const pollingRequirements = generatePollingRequirements(constructs, direction);
  const completionValidations = generateCompletionValidations(constructs);
  const overallConfidence = computeSyncConfidence(constructs, strategies);

  const byPattern: Record<SyncPatternType, number> = {
    "synchronous-job": 0, "long-running-job": 0, "polling-pattern": 0,
    "completion-check": 0, "wait-state": 0, "barrier-sync": 0,
    "callback-wait": 0, "timeout-guard": 0,
  };
  for (const c of constructs) byPattern[c.patternType]++;

  const warnings: string[] = [];
  if (byPattern["long-running-job"] > 0 && byPattern["polling-pattern"] === 0 && byPattern["callback-wait"] === 0)
    warnings.push("Long-running jobs detected without polling or callback patterns — downstream steps may execute before completion");
  if (byPattern["timeout-guard"] === 0 && constructs.length > 0)
    warnings.push("No timeout guards found — long-running operations risk indefinite hangs");
  if (byPattern["barrier-sync"] > 0 && byPattern["completion-check"] === 0)
    warnings.push("Barrier sync points lack explicit completion checks — verify all branches complete before barrier");

  const chainDepth = computeMaxChainDepth(constructs);

  return {
    constructs,
    strategies,
    pollingRequirements,
    completionValidations,
    executionOrder,
    overallConfidence,
    summary: {
      totalConstructs: constructs.length,
      byPattern,
      synchronousCount: constructs.filter((c) => c.completionSemantics === "block-until-done").length,
      longRunningCount: constructs.filter((c) => c.estimatedDuration === "long" || c.estimatedDuration === "unbounded").length,
      pollingRequired: pollingRequirements.length,
      barrierPoints: byPattern["barrier-sync"],
      maxChainDepth: chainDepth,
      warnings,
    },
  };
}

function extractSyncConstructs(
  source: string,
  output: string,
  direction: "aws-to-azure" | "azure-to-aws"
): SyncConstruct[] {
  const constructs: SyncConstruct[] = [];
  const seen = new Set<string>();

  const sourcePatterns = direction === "aws-to-azure" ? ASL_SYNC_PATTERNS : LOGIC_APPS_SYNC_PATTERNS;
  const allPatterns = [...sourcePatterns, ...GENERAL_SYNC_PATTERNS];

  for (const pattern of allPatterns) {
    let match: RegExpExecArray | null;
    const re = new RegExp(pattern.regex.source, pattern.regex.flags);
    while ((match = re.exec(source)) !== null) {
      const key = `${pattern.patternType}:${match[0].slice(0, 60)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      let desc = pattern.descTemplate;
      for (let i = 1; i <= 3; i++) {
        if (match[i]) desc = desc.replace(`$${i}`, match[i]);
      }

      const name = extractConstructName(match[0], source, match.index);
      const timeout = extractTimeout(match[0], source);
      const interval = extractPollingInterval(match[0], source);

      constructs.push({
        id: `sync-${constructs.length + 1}`,
        name: name || `construct_${constructs.length + 1}`,
        patternType: pattern.patternType,
        completionSemantics: pattern.semantics,
        sourceExpression: match[0].slice(0, 200),
        upstreamDeps: [],
        downstreamDeps: [],
        estimatedDuration: pattern.duration,
        timeoutSeconds: timeout,
        pollingIntervalSeconds: interval,
        completionCondition: deriveCompletionCondition(pattern, match[0]),
        confidence: computePatternConfidence(pattern, match[0]),
        notes: [desc],
      });
    }
  }

  // Also scan output for sync patterns in target
  const targetPatterns = direction === "aws-to-azure" ? LOGIC_APPS_SYNC_PATTERNS : ASL_SYNC_PATTERNS;
  for (const pattern of targetPatterns) {
    let match: RegExpExecArray | null;
    const re = new RegExp(pattern.regex.source, pattern.regex.flags);
    while ((match = re.exec(output)) !== null) {
      const key = `target:${pattern.patternType}:${match[0].slice(0, 40)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const existing = constructs.find((c) => c.patternType === pattern.patternType);
      if (existing) {
        existing.notes.push(`Target also has: ${pattern.descTemplate}`);
      }
    }
  }

  resolveDependencies(constructs, source);
  return constructs;
}

function extractConstructName(expr: string, fullSource: string, index: number): string | null {
  const context = fullSource.slice(Math.max(0, index - 200), index + expr.length);
  const nameMatch = context.match(/"(\w[\w\s-]{2,40}?)"\s*:\s*\{/) || context.match(/"name"\s*:\s*"(\w[\w\s-]{2,40}?)"/i);
  return nameMatch ? nameMatch[1] : null;
}

function extractTimeout(expr: string, fullSource: string): number | null {
  const m = expr.match(/(?:timeout|TimeoutSeconds|deadline|max_wait)\D*?(\d+)/i)
    || fullSource.match(/(?:timeout|TimeoutSeconds)\D*?(\d+)/i);
  return m ? parseInt(m[1]) : null;
}

function extractPollingInterval(expr: string, fullSource: string): number | null {
  const m = expr.match(/(?:interval|frequency|every|period)\D*?(\d+)/i);
  return m ? parseInt(m[1]) : null;
}

function deriveCompletionCondition(pattern: SyncPatternDef, matched: string): string {
  switch (pattern.patternType) {
    case "synchronous-job": return "Job returns terminal status (SUCCEEDED/FAILED)";
    case "long-running-job": return "Status endpoint returns COMPLETED/TERMINATED";
    case "polling-pattern": return "Poll response matches success condition";
    case "completion-check": return "All predecessor actions reach terminal state";
    case "wait-state": return "Timer expires or timestamp reached";
    case "barrier-sync": return "All parallel branches complete successfully";
    case "callback-wait": return "External system sends callback/task token";
    case "timeout-guard": return "Operation completes within timeout window";
  }
}

function computePatternConfidence(p: SyncPatternDef, matched: string): number {
  let base = 0.7;
  if (matched.length > 40) base += 0.1;
  if (p.patternType === "synchronous-job" || p.patternType === "polling-pattern") base += 0.05;
  if (/\.sync|waitForTaskToken|Until|DisableAsync/i.test(matched)) base += 0.08;
  return Math.min(base, 0.97);
}

function resolveDependencies(constructs: SyncConstruct[], source: string): void {
  for (let i = 0; i < constructs.length; i++) {
    for (let j = i + 1; j < constructs.length; j++) {
      const a = constructs[i];
      const b = constructs[j];
      if (a.completionSemantics === "block-until-done" || a.completionSemantics === "poll-until-done") {
        a.downstreamDeps.push(b.id);
        b.upstreamDeps.push(a.id);
      }
    }
  }
}

function deriveExecutionOrder(constructs: SyncConstruct[]): string[] {
  const order: string[] = [];
  const visited = new Set<string>();

  const visit = (id: string) => {
    if (visited.has(id)) return;
    visited.add(id);
    const c = constructs.find((x) => x.id === id);
    if (!c) return;
    for (const dep of c.upstreamDeps) visit(dep);
    order.push(c.name);
  };

  for (const c of constructs) visit(c.id);
  return order;
}

function computeMaxChainDepth(constructs: SyncConstruct[]): number {
  let maxDepth = 0;
  const memo = new Map<string, number>();

  const depth = (id: string): number => {
    if (memo.has(id)) return memo.get(id)!;
    const c = constructs.find((x) => x.id === id);
    if (!c || c.upstreamDeps.length === 0) { memo.set(id, 1); return 1; }
    const d = 1 + Math.max(...c.upstreamDeps.map(depth));
    memo.set(id, d);
    return d;
  };

  for (const c of constructs) maxDepth = Math.max(maxDepth, depth(c.id));
  return maxDepth;
}

// ── Strategy generation ─────────────────────────────────────────────────────

function generateStrategies(
  constructs: SyncConstruct[],
  direction: "aws-to-azure" | "azure-to-aws"
): SyncStrategy[] {
  const strategies: SyncStrategy[] = [];
  const isToAzure = direction === "aws-to-azure";

  for (const c of constructs) {
    switch (c.patternType) {
      case "synchronous-job":
        strategies.push({
          constructId: c.id, name: c.name,
          sourcePattern: isToAzure ? "Step Functions .sync integration" : "Logic Apps synchronous action",
          targetPattern: isToAzure ? "Logic Apps Until loop with status polling" : "Step Functions .sync resource",
          preservesSemantics: true,
          riskLevel: "medium",
          explanation: `Synchronous job '${c.name}' blocks until completion. Target uses ${isToAzure ? "Until polling loop with configurable interval" : ".sync integration pattern"} to preserve blocking semantics.`,
          targetCode: isToAzure ? genAzureSyncJob(c) : genAwsSyncJob(c),
        });
        break;

      case "long-running-job":
        strategies.push({
          constructId: c.id, name: c.name,
          sourcePattern: isToAzure ? "Step Functions async task" : "Logic Apps async action",
          targetPattern: isToAzure ? "Logic Apps HTTP + Until polling" : "Step Functions .sync or activity",
          preservesSemantics: true,
          riskLevel: "high",
          explanation: `Long-running job '${c.name}' requires polling or callback. ${isToAzure ? "Target generates HTTP trigger + Until loop with exponential backoff." : "Target uses .sync or .waitForTaskToken pattern."}`,
          targetCode: isToAzure ? genAzureLongRunning(c) : genAwsLongRunning(c),
        });
        break;

      case "polling-pattern":
        strategies.push({
          constructId: c.id, name: c.name,
          sourcePattern: isToAzure ? "Step Functions Wait + Task loop" : "Logic Apps Until loop",
          targetPattern: isToAzure ? "Logic Apps Until with HTTP status check" : "Step Functions Wait + Choice loop",
          preservesSemantics: true,
          riskLevel: "low",
          explanation: `Polling pattern '${c.name}' maps directly. Interval: ${c.pollingIntervalSeconds || 60}s, timeout: ${c.timeoutSeconds || 3600}s.`,
          targetCode: isToAzure ? genAzurePolling(c) : genAwsPolling(c),
        });
        break;

      case "wait-state":
        strategies.push({
          constructId: c.id, name: c.name,
          sourcePattern: isToAzure ? "Step Functions Wait state" : "Logic Apps Delay action",
          targetPattern: isToAzure ? "Logic Apps Delay action" : "Step Functions Wait state",
          preservesSemantics: true,
          riskLevel: "low",
          explanation: `Wait state '${c.name}' is a direct 1:1 mapping. Duration preserved exactly.`,
          targetCode: isToAzure ? genAzureWait(c) : genAwsWait(c),
        });
        break;

      case "callback-wait":
        strategies.push({
          constructId: c.id, name: c.name,
          sourcePattern: isToAzure ? "Step Functions .waitForTaskToken" : "Logic Apps webhook action",
          targetPattern: isToAzure ? "Logic Apps ApiConnectionWebhook or HTTP webhook" : "Step Functions .waitForTaskToken",
          preservesSemantics: true,
          riskLevel: "high",
          explanation: `Callback pattern '${c.name}' requires external system to signal completion. ${isToAzure ? "Target uses webhook trigger or Service Bus with session-based correlation." : "Target uses .waitForTaskToken with SendTaskSuccess callback."}`,
          targetCode: isToAzure ? genAzureCallback(c) : genAwsCallback(c),
        });
        break;

      case "barrier-sync":
        strategies.push({
          constructId: c.id, name: c.name,
          sourcePattern: isToAzure ? "Step Functions Parallel state" : "Logic Apps Scope/Join",
          targetPattern: isToAzure ? "Logic Apps Scope with runAfter on all branches" : "Step Functions Parallel with ResultPath",
          preservesSemantics: true,
          riskLevel: "medium",
          explanation: `Barrier '${c.name}' ensures all parallel branches complete before continuing. ${isToAzure ? "Target uses Scope with runAfter dependencies on every branch." : "Target uses Parallel state with implicit barrier."}`,
          targetCode: isToAzure ? genAzureBarrier(c) : genAwsBarrier(c),
        });
        break;

      case "completion-check":
        strategies.push({
          constructId: c.id, name: c.name,
          sourcePattern: "Completion validation logic",
          targetPattern: isToAzure ? "Logic Apps runAfter + condition action" : "Step Functions Retry/Catch",
          preservesSemantics: true,
          riskLevel: "low",
          explanation: `Completion check '${c.name}' validates predecessor status before proceeding.`,
          targetCode: isToAzure ? genAzureCompletionCheck(c) : genAwsCompletionCheck(c),
        });
        break;

      case "timeout-guard":
        strategies.push({
          constructId: c.id, name: c.name,
          sourcePattern: isToAzure ? "TimeoutSeconds / HeartbeatSeconds" : "Logic Apps action timeout",
          targetPattern: isToAzure ? "Logic Apps action timeout + Until limit" : "Step Functions TimeoutSeconds",
          preservesSemantics: true,
          riskLevel: "medium",
          explanation: `Timeout guard '${c.name}' prevents indefinite execution. Timeout: ${c.timeoutSeconds || "inherited"}s.`,
          targetCode: isToAzure ? genAzureTimeout(c) : genAwsTimeout(c),
        });
        break;
    }
  }

  return strategies;
}

// ── Target code generators ──────────────────────────────────────────────────

function genAzureSyncJob(c: SyncConstruct): string {
  const timeout = c.timeoutSeconds || 3600;
  const interval = c.pollingIntervalSeconds || 60;
  return `// Logic Apps — Synchronous job: ${c.name}
// Pattern: HTTP trigger → Until polling → completion gate
{
  "Submit_${c.name.replace(/\s/g, "_")}": {
    "type": "Http",
    "inputs": {
      "method": "POST",
      "uri": "@{parameters('serviceEndpoint')}/${c.name.replace(/\s/g, "-")}",
      "body": "@triggerBody()",
      "authentication": { "type": "ManagedServiceIdentity" }
    }
  },
  "Poll_${c.name.replace(/\s/g, "_")}_Status": {
    "type": "Until",
    "expression": "@or(equals(body('Check_Status')?['status'], 'Succeeded'), equals(body('Check_Status')?['status'], 'Failed'))",
    "limit": { "count": ${Math.ceil(timeout / interval)}, "timeout": "PT${Math.ceil(timeout / 60)}M" },
    "actions": {
      "Delay_Poll": {
        "type": "Wait",
        "inputs": { "interval": { "count": ${interval}, "unit": "Second" } }
      },
      "Check_Status": {
        "type": "Http",
        "inputs": {
          "method": "GET",
          "uri": "@{parameters('serviceEndpoint')}/${c.name.replace(/\s/g, "-")}/status/@{body('Submit_${c.name.replace(/\s/g, "_")}')?['runId']}",
          "authentication": { "type": "ManagedServiceIdentity" }
        },
        "runAfter": { "Delay_Poll": ["Succeeded"] }
      }
    },
    "runAfter": { "Submit_${c.name.replace(/\s/g, "_")}": ["Succeeded"] }
  },
  "Validate_${c.name.replace(/\s/g, "_")}_Completion": {
    "type": "If",
    "expression": { "and": [{ "equals": ["@body('Check_Status')?['status']", "Succeeded"] }] },
    "actions": {},
    "else": { "actions": { "Terminate_On_Failure": { "type": "Terminate", "inputs": { "runStatus": "Failed", "runError": { "code": "JobFailed", "message": "${c.name} did not complete successfully" } } } } },
    "runAfter": { "Poll_${c.name.replace(/\s/g, "_")}_Status": ["Succeeded"] }
  }
}`;
}

function genAwsSyncJob(c: SyncConstruct): string {
  return `// Step Functions — Synchronous job: ${c.name}
{
  "${c.name.replace(/\s/g, "_")}": {
    "Type": "Task",
    "Resource": "arn:aws:states:::service:action.sync",
    "Parameters": { "Input.$": "$" },
    "TimeoutSeconds": ${c.timeoutSeconds || 3600},
    "HeartbeatSeconds": ${Math.min(c.pollingIntervalSeconds || 60, 300)},
    "Retry": [{ "ErrorEquals": ["States.TaskFailed"], "IntervalSeconds": 10, "MaxAttempts": 3, "BackoffRate": 2.0 }],
    "Catch": [{ "ErrorEquals": ["States.ALL"], "Next": "${c.name.replace(/\s/g, "_")}_FailHandler" }],
    "Next": "Next_Step"
  }
}`;
}

function genAzureLongRunning(c: SyncConstruct): string {
  const timeout = c.timeoutSeconds || 7200;
  const interval = c.pollingIntervalSeconds || 60;
  return `// Logic Apps — Long-running job: ${c.name}
// Pattern: Submit → Poll Until complete → Validate
{
  "Submit_${c.name.replace(/\s/g, "_")}": {
    "type": "Http",
    "inputs": {
      "method": "POST",
      "uri": "@{parameters('databricksWorkspaceUrl')}/api/2.1/jobs/runs/submit",
      "body": { "run_name": "${c.name}", "tasks": [{ "task_key": "main" }] },
      "authentication": { "type": "ManagedServiceIdentity" }
    }
  },
  "Wait_For_${c.name.replace(/\s/g, "_")}": {
    "type": "Until",
    "expression": "@or(equals(body('Get_Run_Status')?['state']?['life_cycle_state'], 'TERMINATED'), equals(body('Get_Run_Status')?['state']?['life_cycle_state'], 'INTERNAL_ERROR'))",
    "limit": { "count": ${Math.ceil(timeout / interval)}, "timeout": "PT${Math.ceil(timeout / 3600)}H" },
    "actions": {
      "Delay_Between_Polls": {
        "type": "Wait",
        "inputs": { "interval": { "count": ${interval}, "unit": "Second" } }
      },
      "Get_Run_Status": {
        "type": "Http",
        "inputs": {
          "method": "GET",
          "uri": "@{parameters('databricksWorkspaceUrl')}/api/2.1/jobs/runs/get?run_id=@{body('Submit_${c.name.replace(/\s/g, "_")}')?['run_id']}",
          "authentication": { "type": "ManagedServiceIdentity" }
        },
        "runAfter": { "Delay_Between_Polls": ["Succeeded"] }
      }
    },
    "runAfter": { "Submit_${c.name.replace(/\s/g, "_")}": ["Succeeded"] }
  }
}`;
}

function genAwsLongRunning(c: SyncConstruct): string {
  return `// Step Functions — Long-running job with .sync
{
  "${c.name.replace(/\s/g, "_")}": {
    "Type": "Task",
    "Resource": "arn:aws:states:::service:action.sync",
    "TimeoutSeconds": ${c.timeoutSeconds || 7200},
    "HeartbeatSeconds": ${c.pollingIntervalSeconds || 300},
    "Retry": [{ "ErrorEquals": ["States.Timeout"], "MaxAttempts": 2 }],
    "Next": "Next_Step"
  }
}`;
}

function genAzurePolling(c: SyncConstruct): string {
  const interval = c.pollingIntervalSeconds || 60;
  const timeout = c.timeoutSeconds || 3600;
  return `// Logic Apps — Polling pattern: ${c.name}
{
  "Poll_${c.name.replace(/\s/g, "_")}": {
    "type": "Until",
    "expression": "@equals(body('Check_Completion')?['status'], 'Complete')",
    "limit": { "count": ${Math.ceil(timeout / interval)}, "timeout": "PT${Math.ceil(timeout / 60)}M" },
    "actions": {
      "Delay": { "type": "Wait", "inputs": { "interval": { "count": ${interval}, "unit": "Second" } } },
      "Check_Completion": {
        "type": "Http",
        "inputs": { "method": "GET", "uri": "@{variables('statusEndpoint')}", "authentication": { "type": "ManagedServiceIdentity" } },
        "runAfter": { "Delay": ["Succeeded"] }
      }
    }
  }
}`;
}

function genAwsPolling(c: SyncConstruct): string {
  return `// Step Functions — Polling loop
{
  "Wait_${c.name.replace(/\s/g, "_")}": {
    "Type": "Wait",
    "Seconds": ${c.pollingIntervalSeconds || 60},
    "Next": "Check_${c.name.replace(/\s/g, "_")}"
  },
  "Check_${c.name.replace(/\s/g, "_")}": {
    "Type": "Task",
    "Resource": "arn:aws:states:::apigateway:invoke",
    "Next": "Is_${c.name.replace(/\s/g, "_")}_Done"
  },
  "Is_${c.name.replace(/\s/g, "_")}_Done": {
    "Type": "Choice",
    "Choices": [{ "Variable": "$.status", "StringEquals": "Complete", "Next": "Continue" }],
    "Default": "Wait_${c.name.replace(/\s/g, "_")}"
  }
}`;
}

function genAzureWait(c: SyncConstruct): string {
  const secs = c.timeoutSeconds || 60;
  return `// Logic Apps — Wait/Delay: ${c.name}
{
  "Delay_${c.name.replace(/\s/g, "_")}": {
    "type": "Wait",
    "inputs": { "interval": { "count": ${secs}, "unit": "Second" } }
  }
}`;
}

function genAwsWait(c: SyncConstruct): string {
  return `// Step Functions — Wait state
{ "${c.name.replace(/\s/g, "_")}": { "Type": "Wait", "Seconds": ${c.timeoutSeconds || 60}, "Next": "Continue" } }`;
}

function genAzureCallback(c: SyncConstruct): string {
  return `// Logic Apps — Webhook callback: ${c.name}
{
  "Wait_For_Callback_${c.name.replace(/\s/g, "_")}": {
    "type": "ApiConnectionWebhook",
    "inputs": {
      "host": { "connection": { "name": "@parameters('$connections')['servicebus']['connectionId']" } },
      "body": { "SessionId": "@{workflow().run.name}", "ContentType": "application/json" },
      "path": "/@{encodeURIComponent('completion-queue')}/messages/head/peek",
      "queries": { "sessionId": "@{workflow().run.name}", "timeout": ${c.timeoutSeconds || 3600} }
    }
  }
}`;
}

function genAwsCallback(c: SyncConstruct): string {
  return `// Step Functions — waitForTaskToken
{
  "${c.name.replace(/\s/g, "_")}": {
    "Type": "Task",
    "Resource": "arn:aws:states:::sqs:sendMessage.waitForTaskToken",
    "Parameters": { "QueueUrl.$": "$.callbackQueue", "MessageBody": { "taskToken.$": "$$.Task.Token" } },
    "TimeoutSeconds": ${c.timeoutSeconds || 3600},
    "Next": "Continue"
  }
}`;
}

function genAzureBarrier(c: SyncConstruct): string {
  return `// Logic Apps — Barrier sync: ${c.name}
// All parallel branches must complete before downstream continues
{
  "Barrier_${c.name.replace(/\s/g, "_")}": {
    "type": "Scope",
    "actions": {
      "Validate_All_Complete": {
        "type": "Compose",
        "inputs": "All branches completed successfully"
      }
    },
    "runAfter": {
      "Branch_A": ["Succeeded"],
      "Branch_B": ["Succeeded"],
      "Branch_C": ["Succeeded"]
    }
  }
}`;
}

function genAwsBarrier(c: SyncConstruct): string {
  return `// Step Functions — Parallel barrier
{ "${c.name.replace(/\s/g, "_")}": { "Type": "Parallel", "Branches": [], "ResultPath": "$.barrierResult", "Next": "Continue" } }`;
}

function genAzureCompletionCheck(c: SyncConstruct): string {
  return `// Logic Apps — Completion check: ${c.name}
{
  "Verify_${c.name.replace(/\s/g, "_")}": {
    "type": "If",
    "expression": { "and": [{ "equals": ["@actions('Previous_Step')?['status']", "Succeeded"] }] },
    "actions": { "Continue_Flow": { "type": "Compose", "inputs": "Predecessor validated" } },
    "else": { "actions": { "Handle_Incomplete": { "type": "Terminate", "inputs": { "runStatus": "Failed" } } } },
    "runAfter": { "Previous_Step": ["Succeeded", "Failed", "Skipped", "TimedOut"] }
  }
}`;
}

function genAwsCompletionCheck(c: SyncConstruct): string {
  return `// Step Functions — Completion check with Retry/Catch
{
  "${c.name.replace(/\s/g, "_")}": {
    "Type": "Task",
    "Retry": [{ "ErrorEquals": ["States.TaskFailed"], "IntervalSeconds": 5, "MaxAttempts": 3, "BackoffRate": 2.0 }],
    "Catch": [{ "ErrorEquals": ["States.ALL"], "Next": "FailHandler" }],
    "Next": "Continue"
  }
}`;
}

function genAzureTimeout(c: SyncConstruct): string {
  const t = c.timeoutSeconds || 3600;
  return `// Logic Apps — Timeout guard: ${c.name}
// Applied as action-level timeout + Until loop limit
{
  "action_timeout_config": {
    "limit": { "timeout": "PT${Math.ceil(t / 60)}M" },
    "runtimeConfiguration": { "actionTimeout": "PT${Math.ceil(t / 60)}M" }
  }
}`;
}

function genAwsTimeout(c: SyncConstruct): string {
  return `// Step Functions — Timeout guard
{ "TimeoutSeconds": ${c.timeoutSeconds || 3600}, "HeartbeatSeconds": ${Math.min((c.pollingIntervalSeconds || 60), 300)} }`;
}

// ── Polling requirements ────────────────────────────────────────────────────

function generatePollingRequirements(
  constructs: SyncConstruct[],
  direction: "aws-to-azure" | "azure-to-aws"
): PollingRequirement[] {
  const reqs: PollingRequirement[] = [];
  const isToAzure = direction === "aws-to-azure";

  const needsPolling = constructs.filter((c) =>
    c.patternType === "long-running-job" ||
    c.patternType === "polling-pattern" ||
    (c.patternType === "synchronous-job" && c.completionSemantics === "block-until-done")
  );

  for (const c of needsPolling) {
    const interval = c.pollingIntervalSeconds || 60;
    const timeout = c.timeoutSeconds || 3600;

    reqs.push({
      id: `poll-${reqs.length + 1}`,
      constructId: c.id,
      actionName: c.name,
      endpoint: isToAzure
        ? `@{parameters('serviceEndpoint')}/${c.name.replace(/\s/g, "-")}/status`
        : `arn:aws:states:::service:describeExecution`,
      method: "GET",
      intervalSeconds: interval,
      maxAttempts: Math.ceil(timeout / interval),
      timeoutSeconds: timeout,
      successCondition: isToAzure
        ? "body('Check_Status')?['status'] == 'Succeeded'"
        : "$.status == 'SUCCEEDED'",
      failureCondition: isToAzure
        ? "body('Check_Status')?['status'] == 'Failed'"
        : "$.status == 'FAILED'",
      backoffStrategy: interval < 30 ? "exponential" : "fixed",
      code: isToAzure
        ? `// Polling: ${c.name}\n// Interval: ${interval}s | Max attempts: ${Math.ceil(timeout / interval)} | Timeout: ${timeout}s\n// Backoff: ${interval < 30 ? "exponential" : "fixed"}\n// Success: status == 'Succeeded'\n// Failure: status == 'Failed' || attempts exhausted`
        : `// Polling: ${c.name}\n// Using .sync integration (managed by Step Functions)\n// Timeout: ${timeout}s | Heartbeat: ${Math.min(interval, 300)}s`,
    });
  }

  return reqs;
}

// ── Completion validations ──────────────────────────────────────────────────

function generateCompletionValidations(constructs: SyncConstruct[]): CompletionValidation[] {
  const validations: CompletionValidation[] = [];

  validations.push({
    id: "cv-1", constructId: "global", name: "execution_order_preserved",
    description: "Downstream actions must not execute before all upstream sync points complete",
    expression: "for each sync_construct: all(upstream.status == 'Succeeded') before downstream.start",
    severity: "critical", autoEnforce: true,
    enforcementCode: `// Enforce via runAfter dependencies\n// Every downstream action must include runAfter on its sync predecessor\n"runAfter": { "Sync_Predecessor": ["Succeeded"] }`,
  });

  validations.push({
    id: "cv-2", constructId: "global", name: "timeout_coverage",
    description: "Every long-running or polling construct must have an explicit timeout",
    expression: "for each construct where duration in ('long', 'unbounded'): timeout != null",
    severity: "critical", autoEnforce: true,
    enforcementCode: `// Default timeout: 1 hour for long-running, 2 hours for unbounded\n"limit": { "timeout": "PT1H" }`,
  });

  validations.push({
    id: "cv-3", constructId: "global", name: "polling_interval_bounded",
    description: "Polling intervals must be between 10s and 300s to avoid throttling or excessive delay",
    expression: "for each polling_construct: 10 <= interval_seconds <= 300",
    severity: "warning", autoEnforce: true,
    enforcementCode: `// Clamp polling interval\ninterval = Math.max(10, Math.min(interval, 300));`,
  });

  for (const c of constructs) {
    if (c.patternType === "synchronous-job" || c.patternType === "long-running-job") {
      validations.push({
        id: `cv-${validations.length + 1}`, constructId: c.id,
        name: `${c.name.replace(/\s/g, "_")}_completion_gate`,
        description: `Verify '${c.name}' reaches terminal state before downstream execution`,
        expression: `actions('${c.name}').status in ('Succeeded', 'Failed', 'Cancelled')`,
        severity: "critical", autoEnforce: true,
        enforcementCode: `"runAfter": { "${c.name.replace(/\s/g, "_")}": ["Succeeded"] }`,
      });
    }

    if (c.patternType === "callback-wait") {
      validations.push({
        id: `cv-${validations.length + 1}`, constructId: c.id,
        name: `${c.name.replace(/\s/g, "_")}_callback_timeout`,
        description: `Callback wait '${c.name}' must have a timeout to prevent indefinite hang`,
        expression: `timeout != null && timeout <= 86400`,
        severity: "critical", autoEnforce: true,
        enforcementCode: `// Max callback wait: 24 hours\n"limit": { "timeout": "PT24H" }`,
      });
    }

    if (c.patternType === "barrier-sync") {
      validations.push({
        id: `cv-${validations.length + 1}`, constructId: c.id,
        name: `${c.name.replace(/\s/g, "_")}_all_branches`,
        description: `Barrier '${c.name}' must wait for ALL parallel branches, not just the first`,
        expression: `runAfter includes every branch action`,
        severity: "critical", autoEnforce: false,
      });
    }
  }

  return validations;
}

// ── Confidence ──────────────────────────────────────────────────────────────

function computeSyncConfidence(constructs: SyncConstruct[], strategies: SyncStrategy[]): number {
  if (constructs.length === 0) return 0.35;

  const avgConf = constructs.reduce((s, c) => s + c.confidence, 0) / constructs.length;
  const preservedRatio = strategies.filter((s) => s.preservesSemantics).length / Math.max(strategies.length, 1);
  const hasTimeouts = constructs.some((c) => c.timeoutSeconds !== null) ? 0.08 : 0;
  const patternCoverage = new Set(constructs.map((c) => c.patternType)).size / 8;
  const lowRisk = strategies.filter((s) => s.riskLevel === "low").length / Math.max(strategies.length, 1);

  const raw = avgConf * 0.3 + preservedRatio * 0.25 + patternCoverage * 0.15 + hasTimeouts + lowRisk * 0.1 + 0.05;
  return Math.round(Math.min(raw, 0.97) * 100) / 100;
}
