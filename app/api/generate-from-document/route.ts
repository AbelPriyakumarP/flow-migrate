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
              systemInstruction: SYSTEM_PROMPT,
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

    let generatedCode = (result.text ?? "").trim();

    // Robust JSON extraction from AI output
    generatedCode = extractJsonFromAiOutput(generatedCode);

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

// ─── Robust JSON extraction from AI output ──────────────────────────────────
function extractJsonFromAiOutput(raw: string): string {
  let text = raw.trim();
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) text = fenceMatch[1].trim();
  if (text.startsWith("{") || text.startsWith("[")) {
    try { JSON.parse(text); return text; } catch { /* continue */ }
  }
  const firstBrace = text.indexOf("{");
  if (firstBrace >= 0) {
    let depth = 0, inStr = false, esc = false, last = -1;
    for (let i = firstBrace; i < text.length; i++) {
      const ch = text[i];
      if (esc) { esc = false; continue; }
      if (ch === "\\") { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === "{") depth++;
      if (ch === "}") { depth--; if (depth === 0) { last = i; break; } }
    }
    if (last > firstBrace) {
      const candidate = text.slice(firstBrace, last + 1);
      try { JSON.parse(candidate); return candidate; } catch { /* continue */ }
    }
  }
  return text;
}
