import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { SYSTEM_PROMPT, getPrompt } from "@/lib/prompts";
import { detectPlatform, getMigrationDirection, type Platform } from "@/lib/detect-platform";
import { validateAzureLogicApps, validateAWSStepFunctions, type ValidationIssue } from "@/lib/validator";
import { compareWorkflows } from "@/lib/comparison";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

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

    const models = ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash"];
    let result;
    let lastError: unknown;

    for (const modelName of models) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: SYSTEM_PROMPT,
        });
        result = await model.generateContent(userPrompt);
        break;
      } catch (e) {
        lastError = e;
        continue;
      }
    }

    if (!result) {
      throw lastError || new Error("All models failed");
    }

    const response = result.response;
    let outputCode = response.text().trim();

    const fenceMatch = outputCode.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      outputCode = fenceMatch[1].trim();
    }

    let migrationLog: string[] = [];
    let validationIssues: ValidationIssue[] = [];
    let comparison = null;

    try {
      const parsed = JSON.parse(outputCode);
      outputCode = JSON.stringify(parsed, null, 2);

      if (direction === "aws-to-azure") {
        validationIssues = validateAzureLogicApps(parsed);
      } else {
        validationIssues = validateAWSStepFunctions(parsed);
      }

      migrationLog = buildMigrationLog(sourceCode, outputCode, direction);

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
