import "server-only";
import { AiServiceError } from "@/lib/server/ai/errors";

export interface VertexAiConfig {
  project: string;
  location: string;
  model: string;
}

let cachedConfig: VertexAiConfig | null = null;

function readRequiredEnv(name: "GOOGLE_CLOUD_PROJECT" | "VERTEX_AI_LOCATION" | "VERTEX_AI_MODEL"): string {
  const value = process.env[name];

  if (!value || !value.trim()) {
    throw new AiServiceError(
      "VERTEX_CONFIG_MISSING_ENV",
      `Mangler miljoverdi for Vertex AI: ${name}. Legg den til i .env.local eller runtime-konfigurasjon.`,
      500
    );
  }

  return value.trim();
}

export function getVertexAiConfig(): VertexAiConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  cachedConfig = {
    project: readRequiredEnv("GOOGLE_CLOUD_PROJECT"),
    location: readRequiredEnv("VERTEX_AI_LOCATION"),
    model: readRequiredEnv("VERTEX_AI_MODEL"),
  };

  return cachedConfig;
}
