import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { SYSTEM_PROMPT, IMAGE_ANALYSIS_PROMPT } from "@/lib/prompts";
import { detectPlatform } from "@/lib/detect-platform";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

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

    const models = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
    let result;
    let lastError: unknown;

    for (const modelName of models) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: SYSTEM_PROMPT,
        });
        result = await model.generateContent(parts);
        break;
      } catch (e) {
        lastError = e;
        continue;
      }
    }

    if (!result) {
      throw lastError || new Error("All models failed");
    }

    let generatedCode = result.response.text().trim();

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
