import "server-only";
import { getVertexAiConfig } from "@/lib/server/ai/config";
import { AiServiceError } from "@/lib/server/ai/errors";
import { createVertexAiClient, getVertexAiClient } from "@/lib/server/ai/vertex";

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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function getHeaderCaseInsensitive(headers: Record<string, unknown>, key: string): string | null {
  const direct = headers[key];
  if (typeof direct === "string") return direct;

  const lowerKey = key.toLowerCase();
  for (const [headerName, headerValue] of Object.entries(headers)) {
    if (headerName.toLowerCase() === lowerKey && typeof headerValue === "string") {
      return headerValue;
    }
  }

  return null;
}

function extractVertexFailureDetails(error: unknown): Record<string, unknown> {
  const details: Record<string, unknown> = {
    stage: "vertex_generate_content",
  };

  const err = asRecord(error);
  const message = error instanceof Error ? error.message : String(error);
  details.message = message;

  if (typeof message === "string" && message.includes("Unexpected token '<'")) {
    details.stage = "google_response_json_parse";
    details.reason = "html_instead_of_json";
  }

  const response = asRecord(err?.response) ?? asRecord(asRecord(err?.cause)?.response);

  if (response) {
    const status = response.status;
    if (typeof status === "number") {
      details.status = status;
    }

    const headers = asRecord(response.headers);
    if (headers) {
      const contentType = getHeaderCaseInsensitive(headers, "content-type");
      if (contentType) {
        details.contentType = contentType;
      }
    }

    const data = response.data;
    if (typeof data === "string") {
      details.snippet = data.slice(0, 200);
    } else if (data && typeof data === "object") {
      details.snippet = JSON.stringify(data).slice(0, 200);
    }
  }

  return details;
}

function isHtmlJsonParseFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("Unexpected token '<'");
}

export async function generateText(input: GenerateTextInput): Promise<GenerateTextResult> {
  if (!input.prompt || !input.prompt.trim()) {
    throw new AiServiceError("VERTEX_INVALID_PROMPT", "Prompt kan ikke være tom.", 400);
  }

  const config = getVertexAiConfig();

  try {
    console.log("[ai] generateText stage", {
      stage: "vertex_client",
      project: config.project,
      location: config.location,
      model: config.model,
    });

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
    console.log("[ai] generateText stage", {
      stage: "vertex_response_received",
    });

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
    if (config.location === "global" && isHtmlJsonParseFailure(error)) {
      console.warn("[ai] Retrying Vertex call with regional fallback", {
        stage: "vertex_generate_content_fallback",
        fallbackLocation: "us-central1",
        fallbackApiEndpoint: "us-central1-aiplatform.googleapis.com",
      });

      try {
        const fallback = createVertexAiClient({
          location: "us-central1",
          apiEndpoint: "us-central1-aiplatform.googleapis.com",
        });

        const fallbackModel = fallback.client.getGenerativeModel({
          model: config.model,
          generationConfig: {
            temperature: normalizeTemperature(input.temperature),
            maxOutputTokens: normalizeMaxOutputTokens(input.maxOutputTokens),
          },
        });

        const fallbackResult = await fallbackModel.generateContent({
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

        const fallbackResponse = await fallbackResult.response;
        const fallbackText = responseToText(fallbackResponse);

        if (!fallbackText) {
          throw new AiServiceError(
            "VERTEX_EMPTY_RESPONSE",
            "Vertex AI returnerte tom tekst for foresporselen.",
            502,
            {
              stage: "vertex_generate_content_fallback",
              fallbackLocation: fallback.runtimeInfo.effectiveLocation,
              fallbackApiEndpoint: fallback.runtimeInfo.apiEndpoint,
            }
          );
        }

        return {
          text: fallbackText,
          model: config.model,
          location: fallback.runtimeInfo.effectiveLocation,
          project: config.project,
        };
      } catch (fallbackError) {
        error = fallbackError;
      }
    }

    if (error instanceof AiServiceError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : "Ukjent Vertex AI-feil.";
    const details = extractVertexFailureDetails(error);

    console.error("[ai] Vertex AI generateText failed", {
      message,
      project: config.project,
      location: config.location,
      model: config.model,
      details,
    });

    const hasStatus = typeof details.status === "number";
    const contentType = typeof details.contentType === "string" ? details.contentType : null;
    const snippet = typeof details.snippet === "string" ? details.snippet : null;
    const nonJsonResponseHint =
      hasStatus && contentType && !contentType.toLowerCase().includes("application/json")
        ? ` Oppstrøm-svar var ikke JSON (status=${details.status}, content-type=${contentType}, snippet=${snippet ?? ""}).`
        : "";

    const possibleModelHint =
      typeof message === "string" && message.includes("Publisher Model")
        ? " Sjekk VERTEX_AI_MODEL og prosjekt-tilgang i Vertex AI. Modellen finnes ikke i valgt prosjekt/lokasjon eller er ikke tilgjengelig for prosjektet."
        : "";

    throw new AiServiceError(
      "VERTEX_CALL_FAILED",
      `Klarte ikke kalle Vertex AI. Sjekk ADC og IAM. Detalj: ${message}${nonJsonResponseHint}${possibleModelHint}`,
      502,
      details
    );
  }
}
