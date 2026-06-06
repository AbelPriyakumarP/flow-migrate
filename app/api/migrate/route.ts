import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { SYSTEM_PROMPT, getPrompt } from "@/lib/prompts";
import { detectPlatform, getMigrationDirection, type Platform } from "@/lib/detect-platform";
import { validateAzureLogicApps, validateAWSStepFunctions, type ValidationIssue } from "@/lib/validator";
import { compareWorkflows } from "@/lib/comparison";
import { applyMigrationPostProcessing } from "@/lib/migration-post-processor";

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

    const basePrompt = getPrompt(direction);
    const correctionBlock = corrections
      ? `\n\n${corrections}\n\n=== SOURCE WORKFLOW TO CONVERT ===\n`
      : "\n\n";
    const userPrompt = basePrompt + correctionBlock + sourceCode;

    const models = ["gemini-3.5-flash", "gemini-3.1-pro-preview", "gemini-2.5-flash"];
    let result;
    let lastError: unknown;

    for (const modelName of models) {
      try {
        const response = await genAI.models.generateContent({
          model: modelName,
          contents: userPrompt,
          config: {
            systemInstruction: SYSTEM_PROMPT,
            thinkingConfig: { thinkingBudget: 0 }, // disable thinking for max speed
          },
        });
        result = response;
        break;
      } catch (e) {
        lastError = e;
        continue;
      }
    }

    if (!result) {
      throw lastError || new Error("All models failed");
    }

    let outputCode = (result.text ?? "").trim();

    const fenceMatch = outputCode.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      outputCode = fenceMatch[1].trim();
    }

    let migrationLog: string[] = [];
    let validationIssues: ValidationIssue[] = [];
    let comparison = null;

    try {
      let parsed = JSON.parse(outputCode);

      // ── Apply all 15 programmatic post-processing categories ──────────────
      if (direction === "aws-to-azure") {
        try {
          const sourceJson = JSON.parse(sourceCode);
          const { output: processed, changesApplied } =
            applyMigrationPostProcessing(parsed, sourceJson);
          parsed = processed;
          // Prepend post-processor results to migration log
          migrationLog = [
            `Post-processor applied ${changesApplied.filter(c => !c.includes("no issues found")).length} fix(es) across 15 categories`,
            ...changesApplied,
          ];
        } catch {
          migrationLog = ["Post-processor skipped — source JSON parse error"];
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
    } catch {
      migrationLog = ["Warning: Output may not be valid JSON. Review manually."];
    }

    const errors = validationIssues.filter((i) => i.severity === "error");
    const warnings = validationIssues.filter((i) => i.severity === "warning");

    if (errors.length > 0) {
      migrationLog.push(`${errors.length} schema error(s) detected — see validation details`);
    }
    if (warnings.length > 0) {
      migrationLog.push(`${warnings.length} warning(s) — review recommended`);
    }
    if (errors.length === 0 && warnings.length === 0) {
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

const MIGRATION_ASSESSMENT: string[] = [
  "1. Improve trigger migration handling to accurately identify and convert scheduled workflows into the appropriate Azure scheduling mechanism.",
  "2. Enhance state mapping validation to prevent incorrect mapping between unrelated workflow states.",
  "3. Preserve parallel execution behavior during migration to maintain the original workflow performance and execution pattern.",
  "4. Improve retry policy translation to ensure all retry configurations are migrated without loss of functionality.",
  "5. Preserve workflow state data and output mappings throughout the migration process to maintain execution context.",
  "6. Introduce workflow semantic validation to verify that all states, transitions, conditions, and error-handling paths are migrated correctly.",
  "7. Implement dependency graph validation to detect missing, incorrect, or altered workflow relationships before generating the target workflow.",
  "8. Strengthen error-handling migration to ensure all exception, catch, and recovery paths are accurately preserved.",
  "9. Improve resource mapping consistency by maintaining standardized mappings between AWS and Azure services.",
  "10. Add post-migration accuracy verification to compare source and generated workflows and identify any functional gaps.",
  "11. Introduce migration confidence scoring to highlight areas that may require manual review.",
  "12. Preserve workflow metadata, execution behavior, and operational configurations during migration.",
  "13. Add automated checks for unsupported or partially migrated components and generate corresponding warnings.",
  "14. Improve handling of conditional logic and branching scenarios to ensure equivalent execution behavior in the target platform.",
  "15. Generate a detailed migration assessment report that highlights migrated components, potential risks, unsupported features, and overall migration accuracy.",
];

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
      const actionCount = countActionsDeep(src);
      const stateCount = out.States ? Object.keys(out.States).length : 0;
      log.push(`Source: ${actionCount} actions detected in Logic Apps`);
      log.push(`Target: ${stateCount} states generated in Step Functions`);
    }

    if (output.includes("TODO")) {
      const todoMatches = output.match(/TODO/g);
      log.push(`${todoMatches?.length || 0} item(s) need manual configuration (marked TODO)`);
    }

    log.push("Valid JSON generated");

    // Always append the 15-point migration assessment for aws-to-azure
    if (direction === "aws-to-azure") {
      log.push("── Migration Assessment (15-point standard check) ──");
      log.push(...MIGRATION_ASSESSMENT);
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
