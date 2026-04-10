import { NextResponse } from "next/server";
import { generateText } from "@/lib/server/ai/service";
import { AiServiceError } from "@/lib/server/ai/errors";
import { getVertexAiConfig } from "@/lib/server/ai/config";

function isAuthorized(request: Request): boolean {
  if (process.env.NODE_ENV !== "production") {
    return true;
  }

  const token = process.env.AI_HEALTHCHECK_TOKEN;

  if (!token) {
    return false;
  }

  const headerToken = request.headers.get("x-ai-healthcheck-token") ?? "";
  return headerToken === token;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      {
        errorCode: "FORBIDDEN",
        message: "AI health endpoint er sperret.",
      },
      { status: 403 }
    );
  }

  try {
    const config = getVertexAiConfig();
    const result = await generateText({
      systemInstruction: "Du er en kortfattet assistent.",
      prompt: "Skriv en kort norsk setning om fotball.",
      maxOutputTokens: 80,
      temperature: 0.2,
    });

    return NextResponse.json({
      ok: true,
      project: config.project,
      location: config.location,
      model: config.model,
      sample: result.text,
    });
  } catch (error) {
    if (error instanceof AiServiceError) {
      console.error("[ai] health check failed", {
        code: error.code,
        message: error.message,
      });

      return NextResponse.json(
        {
          ok: false,
          errorCode: error.code,
          message: error.message,
        },
        { status: error.status }
      );
    }

    const message = error instanceof Error ? error.message : "Ukjent feil.";

    console.error("[ai] health check failed (unexpected)", {
      message,
    });

    return NextResponse.json(
      {
        ok: false,
        errorCode: "INTERNAL_ERROR",
        message,
      },
      { status: 500 }
    );
  }
}
