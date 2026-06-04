import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { IAC_SYSTEM_PROMPT, getIaCPrompt, getIaCFilename, type IaCFormat } from "@/lib/prompts-iac";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

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

    const models = ["gemini-3.5-flash", "gemini-2.5-flash", "gemini-2.0-flash"];
    let result;
    let lastError: unknown;

    for (const modelName of models) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: IAC_SYSTEM_PROMPT,
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

    let content = result.response.text().trim();

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
    console.error("[IaC Export] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Export failed" },
      { status: 500 }
    );
  }
}
