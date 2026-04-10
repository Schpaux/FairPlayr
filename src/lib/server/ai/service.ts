import "server-only";
import { getVertexAiConfig } from "@/lib/server/ai/config";
import { AiServiceError } from "@/lib/server/ai/errors";
import { getVertexAiClient } from "@/lib/server/ai/vertex";

export interface GenerateTextInput {
  systemInstruction?: string;
  prompt: string;
  maxOutputTokens?: number;
  temperature?: number;
}

export interface GenerateTextResult {
  text: string;
  model: string;
  location: string;
  project: string;
}

function normalizeTemperature(value: number | undefined): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0.3;
  }

  return Math.max(0, Math.min(1, value));
}

function normalizeMaxOutputTokens(value: number | undefined): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 256;
  }

  return Math.max(32, Math.min(2048, Math.floor(value)));
}

function responseToText(response: unknown): string {
  if (!response || typeof response !== "object") {
    return "";
  }

  const candidateText = (response as { text?: () => string }).text;
  if (typeof candidateText === "function") {
    const text = candidateText.call(response);
    if (typeof text === "string") {
      return text.trim();
    }
  }

  const objectResponse = response as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };

  const parts = objectResponse.candidates?.[0]?.content?.parts ?? [];

  return parts
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("\n")
    .trim();
}

export async function generateText(input: GenerateTextInput): Promise<GenerateTextResult> {
  if (!input.prompt || !input.prompt.trim()) {
    throw new AiServiceError("VERTEX_INVALID_PROMPT", "Prompt kan ikke være tom.", 400);
  }

  const config = getVertexAiConfig();

  try {
    const client = getVertexAiClient();
    const model = client.getGenerativeModel({
      model: config.model,
      generationConfig: {
        temperature: normalizeTemperature(input.temperature),
        maxOutputTokens: normalizeMaxOutputTokens(input.maxOutputTokens),
      },
    });

    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [{ text: input.prompt.trim() }],
        },
      ],
      systemInstruction: input.systemInstruction
        ? {
            role: "system",
            parts: [{ text: input.systemInstruction.trim() }],
          }
        : undefined,
    });

    const response = await result.response;
    const text = responseToText(response);

    if (!text) {
      throw new AiServiceError(
        "VERTEX_EMPTY_RESPONSE",
        "Vertex AI returnerte tom tekst for foresporselen.",
        502
      );
    }

    return {
      text,
      model: config.model,
      location: config.location,
      project: config.project,
    };
  } catch (error) {
    if (error instanceof AiServiceError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : "Ukjent Vertex AI-feil.";
    console.error("[ai] Vertex AI generateText failed", {
      message,
      project: config.project,
      location: config.location,
      model: config.model,
    });

    throw new AiServiceError(
      "VERTEX_CALL_FAILED",
      `Klarte ikke kalle Vertex AI. Sjekk ADC og IAM. Detalj: ${message}`,
      502
    );
  }
}
