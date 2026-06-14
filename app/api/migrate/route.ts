import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { SYSTEM_PROMPT, getPrompt } from "@/lib/prompts";
import { detectPlatform, getMigrationDirection, type Platform } from "@/lib/detect-platform";
import { validateAzureLogicApps, validateAWSStepFunctions, type ValidationIssue } from "@/lib/validator";
import { compareWorkflows } from "@/lib/comparison";
import { applyMigrationPostProcessing } from "@/lib/migration-post-processor";
import { applyAslPostProcessing } from "@/lib/asl-post-processor";
import { detectApplicableMappings, PRODUCTION_ASSESSMENT_30 } from "@/lib/service-registry";
import { sanitizeWorkflowPii, restorePiiFromPlaceholders } from "@/lib/pii-sanitizer";
import { sanitizeAiJson } from "@/lib/sanitize-json";

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function POST(request: NextRequest) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY is not set. Add it to .env.local and restart the server." },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { sourceCode, targetPlatform, corrections } = body as {
      sourceCode: string;
      targetPlatform: Platform;
      corrections?: string | null;
    };

    if (!sourceCode || !targetPlatform) {
      return NextResponse.json(
        { error: "Missing sourceCode or targetPlatform" },
        { status: 400 }
      );
    }

    const detection = detectPlatform(sourceCode);
    if (detection.platform === "unknown") {
      return NextResponse.json({ error: detection.reason }, { status: 400 });
    }

    const direction = getMigrationDirection(detection.platform, targetPlatform);
    if (!direction) {
      return NextResponse.json(
        { error: `Cannot migrate from ${detection.label} to ${targetPlatform}` },
        { status: 400 }
      );
    }

    // ── PII sanitization: strip personal data before sending to AI ──────────
    const piiResult = sanitizeWorkflowPii(sourceCode);
    const safeSourceCode = piiResult.sanitized;
    if (piiResult.totalRedactions > 0) {
      console.log(`[migrate] PII sanitizer: ${piiResult.totalRedactions} redaction(s) applied`);
      piiResult.redactionLog.forEach((l) => console.log(`[migrate]   ${l}`));
    }

    const basePrompt = getPrompt(direction);
    const correctionBlock = corrections
      ? `\n\n${corrections}\n\n=== SOURCE WORKFLOW TO CONVERT ===\n`
      : "\n\n";
    const userPrompt = basePrompt + correctionBlock + safeSourceCode;

    const models = ["gemini-2.5-flash", "gemini-3.5-flash", "gemini-2.0-flash"];
    let result;
    let lastError: unknown;

    let usedModel = "";
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 3000; // 3 seconds between retries for 503

    for (const modelName of models) {
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          console.log(`[migrate] Trying model: ${modelName} (attempt ${attempt}/${MAX_RETRIES})`);
          const response = await genAI.models.generateContent({
            model: modelName,
            contents: userPrompt,
            config: {
              systemInstruction: SYSTEM_PROMPT,
              // Only add thinkingConfig for models that support it
              ...(modelName.includes("2.5") ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
            },
          });
          result = response;
          usedModel = modelName;
          console.log(`[migrate] Model ${modelName} succeeded on attempt ${attempt}`);
          break;
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          console.error(`[migrate] Model ${modelName} attempt ${attempt} failed:`, errMsg.slice(0, 200));
          lastError = e;

          // Retry on 503 (high demand) — these are temporary
          const is503 = errMsg.includes("503") || errMsg.includes("UNAVAILABLE") || errMsg.includes("high demand");
          if (is503 && attempt < MAX_RETRIES) {
            console.log(`[migrate] 503 detected, retrying in ${RETRY_DELAY_MS}ms...`);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
            continue;
          }
          break; // Don't retry on 404, 429, or other errors — move to next model
        }
      }
      if (result) break; // Got a result, stop trying models
    }

    if (!result) {
      const errMsg = lastError instanceof Error ? lastError.message : "All models failed";
      console.error("[migrate] All models failed. Last error:", errMsg);
      // Return a user-friendly error based on the error type
      if (errMsg.includes("429") || errMsg.includes("quota")) {
        throw new Error("API quota exceeded. Please wait a few minutes or check your Gemini API billing plan.");
      }
      if (errMsg.includes("503") || errMsg.includes("UNAVAILABLE")) {
        throw new Error("All AI models are temporarily unavailable due to high demand. Please try again in a minute.");
      }
      throw new Error(`Migration failed: ${errMsg.slice(0, 200)}`);
    }

    let outputCode = (result.text ?? "").trim();

    // Debug: log raw output details
    console.log(`[migrate] Model ${usedModel} returned ${outputCode.length} chars`);
    console.log(`[migrate] First 200 chars: ${outputCode.slice(0, 200)}`);
    if (outputCode.length === 0) {
      console.error("[migrate] WARNING: Model returned empty text!");
      // Try candidates if available
      try {
        const raw = result as unknown as Record<string, unknown>;
        const candidates = raw.candidates as Array<Record<string, unknown>> | undefined;
        if (candidates && candidates.length > 0) {
          const content = candidates[0].content as Record<string, unknown> | undefined;
          const parts = content?.parts as Array<Record<string, unknown>> | undefined;
          if (parts) {
            const textParts = parts.filter(p => p.text).map(p => p.text as string);
            if (textParts.length > 0) {
              outputCode = textParts.join("").trim();
              console.log(`[migrate] Recovered ${outputCode.length} chars from candidates`);
            }
          }
        }
      } catch { /* best-effort candidate recovery */ }
    }

    // ── Robust JSON extraction from AI output ─────────────────────────────
    outputCode = extractJsonFromAiOutput(outputCode);

    // ── Repair common LLM escaping errors (over-escaped backslash runs and
    //    raw control characters in long string values). Without this, large
    //    workflows with multi-line message bodies fail JSON.parse, which blanks
    //    the graph, the step-mapping summary, validation, and comparison. ────
    if (outputCode) {
      try {
        JSON.parse(outputCode);
      } catch {
        const repaired = sanitizeAiJson(outputCode);
        try {
          JSON.parse(repaired);
          outputCode = repaired;
          console.log("[migrate] Repaired malformed JSON escaping from AI output");
        } catch {
          // Leave as-is; the downstream try/catch will report it gracefully.
        }
      }
    }

    // ── Restore PII: put original values back into the migrated output ───
    if (piiResult.totalRedactions > 0) {
      outputCode = restorePiiFromPlaceholders(outputCode, piiResult.placeholderMap);
      console.log(`[migrate] PII restored: ${piiResult.totalRedactions} placeholder(s) replaced with originals`);
    }

    let migrationLog: string[] = [];
    let validationIssues: ValidationIssue[] = [];
    let comparison = null;
    let jsonParsed = false;

    try {
      let parsed = JSON.parse(outputCode);
      jsonParsed = true;

      // ── Apply programmatic post-processing ──────────────────────────────────
      if (direction === "aws-to-azure") {
        try {
          const sourceJson = JSON.parse(sourceCode);
          const { output: processed, changesApplied } =
            applyMigrationPostProcessing(parsed, sourceJson);
          parsed = processed;
          // Prepend post-processor results to migration log
          migrationLog = [
            `Post-processor applied ${changesApplied.filter(c => !c.includes("no issues found")).length} fix(es) across 30 categories`,
            ...changesApplied,
          ];
        } catch (ppErr) {
          migrationLog = [`Post-processor skipped — ${ppErr instanceof Error ? ppErr.message : "source JSON parse error"}`];
        }
      } else if (direction === "azure-to-aws") {
        // ── ASL post-processor: enforce valid Step Functions structure ──────
        try {
          const sourceJson = JSON.parse(sourceCode);
          const { output: processed, changesApplied } =
            applyAslPostProcessing(parsed, sourceJson);
          parsed = processed;
          migrationLog = [
            `ASL post-processor applied ${changesApplied.filter(c => !c.includes("no fixes needed")).length} fix(es)`,
            ...changesApplied,
          ];
        } catch (ppErr) {
          migrationLog = [`ASL post-processor skipped — ${ppErr instanceof Error ? ppErr.message : "error"}`];
        }
      }

      // Final sanitization: ensure only valid top-level keys for each platform
      if (direction === "azure-to-aws") {
        const validAslTopKeys = new Set(["Comment", "StartAt", "States", "Version", "TimeoutSeconds"]);
        for (const key of Object.keys(parsed)) {
          if (!validAslTopKeys.has(key)) {
            delete parsed[key];
            migrationLog.push(`Removed invalid top-level field "${key}" from ASL output`);
          }
        }
        // Ensure StartAt and States always exist
        if (!parsed.States || typeof parsed.States !== "object") {
          parsed.States = {};
          migrationLog.push("⚠ MANUAL: No States found — output needs manual review");
        }
        if (!parsed.StartAt) {
          const firstState = Object.keys(parsed.States as Record<string, unknown>)[0];
          if (firstState) parsed.StartAt = firstState;
        }

        // State-level sanitization pass
        const states = parsed.States as Record<string, Record<string, unknown>>;
        const validStateTypes = new Set(["Task", "Pass", "Choice", "Wait", "Succeed", "Fail", "Parallel", "Map"]);
        for (const [stateName, state] of Object.entries(states)) {
          // Fix invalid or missing Type
          if (!state.Type || !validStateTypes.has(state.Type as string)) {
            if (state.Resource) {
              state.Type = "Task";
              migrationLog.push(`Fixed invalid Type in state "${stateName}" → Task (has Resource)`);
            } else if (state.Choices) {
              state.Type = "Choice";
              migrationLog.push(`Fixed invalid Type in state "${stateName}" → Choice (has Choices)`);
            } else if (state.Branches) {
              state.Type = "Parallel";
              migrationLog.push(`Fixed invalid Type in state "${stateName}" → Parallel (has Branches)`);
            } else if (state.Result !== undefined && !state.Resource) {
              state.Type = "Pass";
              migrationLog.push(`Fixed invalid Type in state "${stateName}" → Pass (has Result)`);
            } else if (!state.Type) {
              state.Type = "Pass";
              migrationLog.push(`⚠ State "${stateName}" had no Type — defaulted to Pass`);
            }
          }

          // Ensure Task states have a Resource
          if (state.Type === "Task" && !state.Resource) {
            state.Resource = `arn:aws:lambda:us-east-1:ACCOUNT_ID:function:${stateName.replace(/\s+/g, "_")}`;
            migrationLog.push(`⚠ MANUAL: Added placeholder Lambda ARN to Task state "${stateName}"`);
          }

          // Remove empty or null fields
          for (const [k, v] of Object.entries(state)) {
            if (v === null || v === undefined || v === "") {
              delete state[k];
            }
          }
        }
      }

      outputCode = JSON.stringify(parsed, null, 2);

      if (direction === "aws-to-azure") {
        validationIssues = validateAzureLogicApps(parsed);
      } else {
        validationIssues = validateAWSStepFunctions(parsed);
      }

      migrationLog = [
        ...migrationLog,
        ...buildMigrationLog(sourceCode, outputCode, direction),
      ];

      // Run behavioral comparison
      try {
        const sourceJson = JSON.parse(sourceCode);
        comparison = compareWorkflows(sourceJson, parsed, direction);
      } catch {
        // Comparison is best-effort — don't fail the migration
      }
    } catch (parseErr) {
      const preview = outputCode.slice(0, 300).replace(/\n/g, " ");
      console.error(`[migrate] JSON parse failed. Preview: ${preview}`);
      console.error(`[migrate] Parse error:`, parseErr instanceof Error ? parseErr.message : parseErr);
      migrationLog = [
        "Warning: Output may not be valid JSON. Review manually.",
        `Model used: ${usedModel}`,
        `Raw output length: ${outputCode.length} chars`,
        `Preview: ${outputCode.slice(0, 150).replace(/\n/g, " ")}...`,
      ];
    }

    // ── Add PII protection info to migration log ───────────────────────────
    if (piiResult.totalRedactions > 0) {
      migrationLog.unshift(
        `🛡 PII Protection: ${piiResult.totalRedactions} sensitive value(s) were redacted before AI processing`,
        ...piiResult.redactionLog.map((l) => `  ${l}`),
        `  All original values restored in final output`
      );
    }

    const errors = validationIssues.filter((i) => i.severity === "error");
    const warnings = validationIssues.filter((i) => i.severity === "warning");

    if (!jsonParsed) {
      // Don't claim validation passed when JSON didn't even parse
      migrationLog.push("⚠ JSON parse failed — schema validation skipped");
    } else if (errors.length > 0) {
      migrationLog.push(`${errors.length} schema error(s) detected — see validation details`);
    } else if (warnings.length > 0) {
      migrationLog.push(`${warnings.length} warning(s) — review recommended`);
      migrationLog.push("Schema validation passed with warnings");
    } else {
      migrationLog.push("Schema validation passed — output is deployment-ready");
    }

    return NextResponse.json({
      success: true,
      sourcePlatform: detection.label,
      targetPlatform:
        targetPlatform === "aws-step-functions"
          ? "AWS Step Functions (ASL)"
          : "Azure Logic Apps",
      outputCode,
      migrationLog,
      validationIssues,
      direction,
      comparison,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Migration failed";
    console.error("Migration error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ─── Robust JSON extraction from AI output ──────────────────────────────────
// The AI may wrap JSON in markdown fences, add commentary, or return partial text.
// This function tries multiple strategies to extract valid JSON.

function extractJsonFromAiOutput(raw: string): string {
  let text = raw.trim();

  // Strategy 1: Strip markdown code fences (```json ... ``` or ``` ... ```)
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }

  // Strategy 2: If it starts with valid JSON, try parsing directly
  if (text.startsWith("{") || text.startsWith("[")) {
    try {
      JSON.parse(text);
      return text;
    } catch {
      // May have trailing text after the JSON — try to find the matching brace
    }
  }

  // Strategy 3: Find the first { and last matching } to extract the JSON object
  const firstBrace = text.indexOf("{");
  if (firstBrace >= 0) {
    // Find the matching closing brace by counting
    let depth = 0;
    let inString = false;
    let escape = false;
    let lastBrace = -1;

    for (let i = firstBrace; i < text.length; i++) {
      const ch = text[i];
      if (escape) { escape = false; continue; }
      if (ch === "\\") { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === "{") depth++;
      if (ch === "}") {
        depth--;
        if (depth === 0) { lastBrace = i; break; }
      }
    }

    if (lastBrace > firstBrace) {
      const candidate = text.slice(firstBrace, lastBrace + 1);
      try {
        JSON.parse(candidate);
        return candidate;
      } catch {
        // Fall through
      }
    }
  }

  // Strategy 4: Try common AI patterns — "Here is the JSON:\n{...}"
  const jsonStart = text.search(/\n\s*\{/);
  if (jsonStart >= 0) {
    const fromBrace = text.slice(jsonStart).trim();
    try {
      JSON.parse(fromBrace);
      return fromBrace;
    } catch {
      // Fall through
    }
  }

  // Strategy 5: Return whatever we have — the caller will handle the parse error
  return text;
}

// 30-point assessment is now imported from service-registry.ts

function buildMigrationLog(
  source: string,
  output: string,
  direction: string
): string[] {
  const log: string[] = [];

  try {
    const src = JSON.parse(source);
    const out = JSON.parse(output);

    if (direction === "aws-to-azure") {
      const stateCount = src.States ? Object.keys(src.States).length : 0;
      log.push(`Source: ${stateCount} states detected in Step Functions`);

      const actionCount = countActionsDeep(out);
      log.push(`Target: ${actionCount} actions generated in Logic Apps`);

      if (src.States) {
        const types = Object.values(src.States as Record<string, { Type: string }>).map((s) => s.Type);
        const taskCount = types.filter((t) => t === "Task").length;
        const choiceCount = types.filter((t) => t === "Choice").length;
        const parallelCount = types.filter((t) => t === "Parallel").length;
        const catchCount = Object.values(src.States as Record<string, { Catch?: unknown[] }>)
          .filter((s) => s.Catch && Array.isArray(s.Catch)).length;
        const retryCount = Object.values(src.States as Record<string, { Retry?: unknown[] }>)
          .filter((s) => s.Retry && Array.isArray(s.Retry)).length;

        if (taskCount) log.push(`Mapped ${taskCount} Task state(s) to Logic Apps actions`);
        if (choiceCount) log.push(`Mapped ${choiceCount} Choice state(s) to Condition actions`);
        if (parallelCount) log.push(`Mapped ${parallelCount} Parallel state(s) to implicit parallel branches`);
        if (catchCount) log.push(`Mapped ${catchCount} Catch block(s) to failure runAfter handlers`);
        if (retryCount) log.push(`Mapped ${retryCount} Retry config(s) to retry policies`);
      }

      // Detect CAT-level issues in output
      if (output.includes("SCHEDULE_PENDING"))   log.push("⚠ CAT-1: Recurrence trigger schedule needs manual configuration (SCHEDULE_PENDING found)");
      if (output.includes("MIGRATED_FROM_SSM"))  log.push("⚠ CAT-3: SSM parameter references converted to Azure App Configuration");
      if (output.includes("AZURE_CONTAINER_NAME_REPLACE")) log.push("⚠ CAT-4: S3 bucket references replaced — storage mapping required");
      if (output.includes("GAP_NOTICE"))         log.push("⚠ CAT-5: Glue/Iceberg job requires manual reimplementation in Databricks or Synapse");
      if (output.includes("AZURE_CDN_ENDPOINT_REPLACE") || output.includes("AZURE_APIM_ENDPOINT_REPLACE")) log.push("⚠ CAT-8/14: AWS URLs replaced with Azure placeholders — update before deployment");
      if (output.includes("URL_MIGRATION_REQUIRED")) log.push("⚠ CAT-8: AWS service URLs found — see URL_MIGRATION_REQUIRED section");
      if (output.includes("S3_TO_AZURE_STORAGE_MAPPING_REQUIRED")) log.push("⚠ CAT-4: S3 buckets need Azure Storage mapping — see top-level field");
      if (output.includes("ManagedServiceIdentity")) log.push("✓ CAT-10: Managed identity authentication added to ADF HTTP actions");
      if (output.includes("RENAMED_FROM_AWS_SERVICE")) log.push("✓ CAT-7: AWS service names replaced with Azure equivalents");

    } else {
      // azure-to-aws direction
      const actionCount = countActionsDeep(src);
      const stateCount = out.States ? Object.keys(out.States).length : 0;
      log.push(`Source: ${actionCount} actions detected in Logic Apps`);
      log.push(`Target: ${stateCount} states generated in Step Functions`);

      // Detect AWS-specific placeholders that need manual configuration
      if (output.includes("REGION") || output.includes("us-east-1")) {
        const regionMatches = output.match(/REGION|us-east-1/g);
        log.push(`⚠ MANUAL: ${regionMatches?.length || 0} AWS region placeholder(s) need your actual region (e.g., us-west-2)`);
      }
      if (output.includes("ACCOUNT") || output.includes("ACCOUNT_ID") || output.includes("123456789")) {
        const accountMatches = output.match(/ACCOUNT_ID|ACCOUNT|123456789/g);
        log.push(`⚠ MANUAL: ${accountMatches?.length || 0} AWS account ID placeholder(s) need your actual account ID`);
      }
      if (output.includes("TODO_REPLACE") || output.includes("TODO")) {
        const todoMatches = output.match(/TODO_REPLACE|TODO/g);
        log.push(`⚠ TODO: ${todoMatches?.length || 0} item(s) need manual configuration`);
      }
      // Check for Lambda function placeholders
      if (output.includes("arn:aws:lambda")) {
        const lambdaMatches = output.match(/arn:aws:lambda[^"]+/g) || [];
        const placeholders = lambdaMatches.filter(a => a.includes("REGION") || a.includes("ACCOUNT"));
        if (placeholders.length > 0) {
          log.push(`⚠ REPLACE: ${placeholders.length} Lambda ARN(s) need real AWS account/region values`);
        }
      }
      // Check for SQS/SNS/DynamoDB/S3 placeholders
      if (output.includes("arn:aws:states:::sqs")) log.push("⚠ MANUAL: SQS queue URL placeholder needs your actual queue URL");
      if (output.includes("arn:aws:states:::sns")) log.push("⚠ MANUAL: SNS topic ARN placeholder needs your actual topic ARN");
      if (output.includes("arn:aws:states:::dynamodb")) log.push("⚠ MANUAL: DynamoDB table name/parameters need verification");
      if (output.includes("arn:aws:states:::s3")) log.push("⚠ MANUAL: S3 bucket/key parameters need your actual bucket name");
    }

    if (output.includes("TODO") && direction === "aws-to-azure") {
      const todoMatches = output.match(/TODO/g);
      log.push(`${todoMatches?.length || 0} item(s) need manual configuration (marked TODO)`);
    }

    log.push("Valid JSON generated");

    // Always append the 30-point production assessment for aws-to-azure
    if (direction === "aws-to-azure") {
      // Detect which of the 30 service mappings apply to this specific migration
      try {
        const srcJson = JSON.parse(source);
        const applicable = detectApplicableMappings(JSON.stringify(srcJson));
        if (applicable.length > 0) {
          log.push(`── ${applicable.length} service mapping(s) detected in source ──`);
          applicable.forEach(m => {
            log.push(`  ${m.requiresManualWork ? "⚠ MANUAL" : "✓ AUTO"} [${m.group}] ${m.awsPattern} → ${m.azureEquivalent}`);
          });
        }
      } catch { /* best-effort */ }
      log.push("── Production Assessment (30-point standard check) ──");
      log.push(...PRODUCTION_ASSESSMENT_30);
    }

  } catch {
    log.push("Migration completed — review output for accuracy");
  }

  return log;
}

function countActionsDeep(obj: Record<string, unknown>): number {
  let count = 0;
  // Handle both flat { actions } and nested { definition: { actions } }
  const definition = (obj.definition as Record<string, unknown>) || obj;
  const actions = (definition.actions as Record<string, Record<string, unknown>>) || (obj.actions as Record<string, Record<string, unknown>>) || undefined;
  if (!actions) return 0;

  for (const action of Object.values(actions)) {
    count++;
    if (action.actions) count += countActionsDeep(action as Record<string, unknown>);
    const elseBlock = action.else as Record<string, unknown> | undefined;
    if (elseBlock?.actions) count += countActionsDeep(elseBlock as Record<string, unknown>);
  }
  return count;
}
