import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { SYSTEM_PROMPT, DOCUMENT_ANALYSIS_PROMPT } from "@/lib/prompts";
import { detectPlatform } from "@/lib/detect-platform";

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

async function extractText(
  mimeType: string,
  fileData: string
): Promise<string> {
  const buffer = Buffer.from(fileData, "base64");

  if (mimeType === "application/pdf") {
    try {
      // pdf-parse v2 uses named export PDFParse class
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      const textResult = await parser.getText();
      await parser.destroy();
      return textResult.text;
    } catch {
      // Fallback: try to extract any readable text from the buffer
      const rawText = buffer.toString("utf-8").replace(/[^\x20-\x7E\n\r\t]/g, " ");
      if (rawText.trim().length > 50) return rawText;
      throw new Error("Could not extract text from PDF. Try a text-based PDF (not scanned).");
    }
  }

  if (
    mimeType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  if (mimeType === "text/plain" || mimeType === "text/markdown") {
    return buffer.toString("utf-8");
  }

  throw new Error(`Unsupported document type: ${mimeType}`);
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        {
          error:
            "GEMINI_API_KEY is not set. Add it to .env.local and restart the server.",
        },
        { status: 500 }
      );
    }

    const { mimeType, fileData, fileName } = (await request.json()) as {
      mimeType: string;
      fileData: string;
      fileName: string;
    };

    if (!mimeType || !fileData) {
      return NextResponse.json(
        { error: "Missing mimeType or fileData" },
        { status: 400 }
      );
    }

    // Extract text from the document
    let extractedText: string;
    try {
      extractedText = await extractText(mimeType, fileData);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to extract text";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    if (!extractedText.trim()) {
      return NextResponse.json(
        { error: "Document appears to be empty or could not be read." },
        { status: 400 }
      );
    }

    // Truncate very long documents to stay within token limits
    const maxChars = 15000;
    const truncated =
      extractedText.length > maxChars
        ? extractedText.slice(0, maxChars) +
          "\n\n[... document truncated for processing ...]"
        : extractedText;

    const userPrompt =
      DOCUMENT_ANALYSIS_PROMPT +
      `\n\n=== DOCUMENT: ${fileName || "uploaded document"} ===\n` +
      truncated +
      "\n=== END DOCUMENT ===";

    const models = ["gemini-3.1-pro-preview", "gemini-2.5-pro", "gemini-2.5-flash"];
    let result;
    let lastError: unknown;

    for (const modelName of models) {
      try {
        const response = await genAI.models.generateContent({
          model: modelName,
          contents: userPrompt,
          config: {
            systemInstruction: SYSTEM_PROMPT,
            thinkingConfig: { thinkingBudget: 0 },
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

    let generatedCode = (result.text ?? "").trim();

    // Strip code fences if present
    const fenceMatch = generatedCode.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      generatedCode = fenceMatch[1].trim();
    }

    // Validate JSON
    try {
      const parsed = JSON.parse(generatedCode);
      generatedCode = JSON.stringify(parsed, null, 2);
    } catch {
      return NextResponse.json(
        {
          error: "AI generated invalid JSON. The document may be too ambiguous.",
          generatedCode,
        },
        { status: 422 }
      );
    }

    // Detect platform from generated code
    const detection = detectPlatform(generatedCode);

    return NextResponse.json({
      success: true,
      generatedCode,
      detectedPlatform: detection.platform,
      detectedLabel: detection.label,
      extractedTextLength: extractedText.length,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Document analysis failed";
    console.error("Document analysis error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
