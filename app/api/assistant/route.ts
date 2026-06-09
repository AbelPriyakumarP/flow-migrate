import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

const ASSISTANT_SYSTEM = `You are FlowMigrate AI Assistant — an expert in AWS Step Functions (ASL) and Azure Logic Apps migration.

Your role:
- Help users understand their migration results
- Explain why specific steps were mapped a certain way
- Suggest fixes for amber/red items in the behavioral comparison
- Answer questions about AWS Step Functions and Azure Logic Apps differences
- Guide users on manual TODO items that need configuration
- Explain correction patterns that have been learned

Be concise, precise, and actionable. Use bullet points. Reference specific step names and action types from the user's workflow when relevant.

When suggesting fixes, provide the exact JSON snippet they should use.

CRITICAL: Keep responses under 200 words unless the user asks for detailed explanation.`;

export async function POST(request: NextRequest) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY is not set" },
        { status: 500 }
      );
    }

    const { message, context } = (await request.json()) as {
      message: string;
      context?: {
        sourceCode?: string;
        outputCode?: string;
        direction?: string;
        comparison?: unknown;
        corrections?: unknown[];
      };
    };

    if (!message?.trim()) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    // Build context block
    let contextBlock = "";
    if (context) {
      const parts: string[] = [];

      if (context.direction) {
        parts.push(`Migration direction: ${context.direction}`);
      }

      if (context.sourceCode) {
        const srcPreview = context.sourceCode.slice(0, 1500);
        parts.push(`Source workflow (preview):\n${srcPreview}`);
      }

      if (context.outputCode) {
        const outPreview = context.outputCode.slice(0, 1500);
        parts.push(`Migrated output (preview):\n${outPreview}`);
      }

      if (context.comparison) {
        const comp = context.comparison as Record<string, unknown>;
        parts.push(`Comparison summary: ${JSON.stringify(comp.summary || {})}`);
        const mappings = comp.mappings as Array<Record<string, unknown>> | undefined;
        if (mappings) {
          const summary = mappings.map(
            (m) =>
              `${m.sourceStep} (${m.sourceType}) → ${m.targetStep || "unmapped"} (${m.targetType || "?"}) [${m.status}]${m.needsManualConfig ? " [TODO]" : ""}`
          );
          parts.push(`Step mappings:\n${summary.join("\n")}`);
        }
      }

      if (context.corrections && context.corrections.length > 0) {
        parts.push(
          `Learned corrections (${context.corrections.length} total): ${JSON.stringify(context.corrections.slice(0, 5))}`
        );
      }

      if (parts.length > 0) {
        contextBlock = `\n\n=== CURRENT MIGRATION CONTEXT ===\n${parts.join("\n\n")}\n=== END CONTEXT ===\n\n`;
      }
    }

    const userPrompt = contextBlock + `User question: ${message}`;

    const models = ["gemini-2.5-flash", "gemini-3.5-flash", "gemini-2.0-flash"];
    let result;
    let lastError: unknown;

    for (const modelName of models) {
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const response = await genAI.models.generateContent({
            model: modelName,
            contents: userPrompt,
            config: {
              systemInstruction: ASSISTANT_SYSTEM,
              ...(modelName.includes("2.5") ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
            },
          });
          result = response;
          break;
        } catch (e) {
          lastError = e;
          const errMsg = e instanceof Error ? e.message : String(e);
          const is503 = errMsg.includes("503") || errMsg.includes("UNAVAILABLE");
          if (is503 && attempt < 3) {
            await new Promise(r => setTimeout(r, 3000));
            continue;
          }
          break;
        }
      }
      if (result) break;
    }

    if (!result) {
      throw lastError || new Error("All models failed");
    }

    const reply = (result.text ?? "").trim();

    return NextResponse.json({ reply });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Assistant failed";
    console.error("Assistant error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
