import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { IAC_SYSTEM_PROMPT, getIaCPrompt, getIaCFilename, type IaCFormat } from "@/lib/prompts-iac";

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function POST(request: NextRequest) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY is not set." },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { workflowJson, direction, format } = body as {
      workflowJson: string;
      direction: "aws-to-azure" | "azure-to-aws";
      format: IaCFormat;
    };

    if (!workflowJson || !direction || !format) {
      return NextResponse.json(
        { error: "Missing workflowJson, direction, or format" },
        { status: 400 }
      );
    }

    const userPrompt = getIaCPrompt(direction, format, workflowJson);

    const models = ["gemini-2.5-flash", "gemini-3.5-flash", "gemini-2.0-flash"];
    let result;
    let lastError: unknown;

    for (const modelName of models) {
      try {
        console.log(`[iac-export] Trying model: ${modelName}`);
        const response = await genAI.models.generateContent({
          model: modelName,
          contents: userPrompt,
          config: {
            systemInstruction: IAC_SYSTEM_PROMPT,
            ...(modelName.includes("2.5") ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
          },
        });
        result = response;
        console.log(`[iac-export] Model ${modelName} succeeded`);
        break;
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        console.error(`[iac-export] Model ${modelName} failed:`, errMsg.slice(0, 200));
        lastError = e;

        // Retry on 503 once
        const is503 = errMsg.includes("503") || errMsg.includes("UNAVAILABLE");
        if (is503) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          try {
            const retryResponse = await genAI.models.generateContent({
              model: modelName,
              contents: userPrompt,
              config: {
                systemInstruction: IAC_SYSTEM_PROMPT,
                ...(modelName.includes("2.5") ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
              },
            });
            result = retryResponse;
            console.log(`[iac-export] Model ${modelName} succeeded on retry`);
            break;
          } catch (retryErr) {
            lastError = retryErr;
          }
        }
        continue;
      }
    }

    if (!result) {
      throw lastError || new Error("All models failed");
    }

    let content = (result.text ?? "").trim();

    // Strip markdown fences if present
    const fenceMatch = content.match(/```(?:(?:hcl|terraform|json|yaml)\s*)?([\s\S]*?)```/);
    if (fenceMatch) {
      content = fenceMatch[1].trim();
    }

    // For CloudFormation, try to pretty-print the JSON
    if (format === "cloudformation") {
      try {
        const parsed = JSON.parse(content);
        content = JSON.stringify(parsed, null, 2);
      } catch {
        // Keep as-is if not valid JSON
      }
    }

    const filename = getIaCFilename(format);

    return NextResponse.json({
      content,
      filename,
      format,
    });
  } catch (error) {
    console.error("[iac-export] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Export failed" },
      { status: 500 }
    );
  }
}
