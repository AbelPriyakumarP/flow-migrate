import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { SYSTEM_PROMPT, IMAGE_ANALYSIS_PROMPT } from "@/lib/prompts";
import { detectPlatform } from "@/lib/detect-platform";

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function POST(request: NextRequest) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY is not set. Add it to .env.local and restart the server." },
        { status: 500 }
      );
    }

    const { mimeType, imageData } = (await request.json()) as {
      mimeType: string;
      imageData: string;
    };

    if (!mimeType || !imageData) {
      return NextResponse.json(
        { error: "Missing mimeType or imageData" },
        { status: 400 }
      );
    }

    const allowedTypes = ["image/png", "image/jpeg", "image/webp", "image/gif"];
    if (!allowedTypes.includes(mimeType)) {
      return NextResponse.json(
        { error: `Unsupported image type: ${mimeType}. Use PNG, JPEG, WEBP, or GIF.` },
        { status: 400 }
      );
    }

    const parts = [
      { text: IMAGE_ANALYSIS_PROMPT },
      {
        inlineData: {
          mimeType,
          data: imageData,
        },
      },
    ];

    const models = ["gemini-2.5-flash", "gemini-3.5-flash", "gemini-2.0-flash"];
    let result;
    let lastError: unknown;

    for (const modelName of models) {
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const response = await genAI.models.generateContent({
            model: modelName,
            contents: [
              { role: "user", parts: [
                { text: IMAGE_ANALYSIS_PROMPT },
                { inlineData: { mimeType, data: imageData } },
              ]},
            ],
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
        { error: "AI generated invalid JSON. Try a clearer screenshot.", generatedCode },
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
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Image analysis failed";
    console.error("Image analysis error:", err);
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
