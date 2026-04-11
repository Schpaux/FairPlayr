import "server-only";
import { NextResponse } from "next/server";
import { generateText } from "@/lib/server/ai/service";

const REQUIRED_VERTEX_ENV = [
  "GOOGLE_CLOUD_PROJECT",
  "VERTEX_AI_LOCATION",
  "VERTEX_AI_MODEL",
] as const;

function getRequiredEnv(name: (typeof REQUIRED_VERTEX_ENV)[number]): string {
  const value = process.env[name];

  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value.trim();
}

function validateVertexEnv(): void {
  for (const envName of REQUIRED_VERTEX_ENV) {
    getRequiredEnv(envName);
  }
}

export async function GET() {
  console.log("AI health check started");
  console.log("Project:", process.env.GOOGLE_CLOUD_PROJECT);
  console.log(
    "Has credentials:",
    Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON)
  );

  try {
    validateVertexEnv();

    const result = await generateText({
      prompt: "Skriv en kort og enkel setning om fotball pa norsk.",
      maxOutputTokens: 80,
      temperature: 0.2,
    });

    return NextResponse.json({
      success: true,
      result: result.text,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
