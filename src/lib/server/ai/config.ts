import "server-only";
import { AiServiceError } from "@/lib/server/ai/errors";

export interface VertexAiConfig {
  project: string;
  location: string;
  model: string;
}

const DEFAULT_VERTEX_LOCATION = "global";
const DEFAULT_VERTEX_MODEL = "gemini-2.5-flash";

let cachedConfig: VertexAiConfig | null = null;

export function getVertexAiConfig(): VertexAiConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const project =
    process.env.GOOGLE_CLOUD_PROJECT ??
    process.env.GCLOUD_PROJECT ??
    process.env.GCP_PROJECT ??
    "";

  if (!project.trim()) {
    throw new AiServiceError(
      "VERTEX_CONFIG_MISSING_PROJECT",
      "Mangler GOOGLE_CLOUD_PROJECT for Vertex AI. Sett prosjekt-id i miljøvariabler.",
      500
    );
  }

  cachedConfig = {
    project: project.trim(),
    location: (process.env.VERTEX_AI_LOCATION ?? DEFAULT_VERTEX_LOCATION).trim(),
    model: (process.env.VERTEX_AI_MODEL ?? DEFAULT_VERTEX_MODEL).trim(),
  };

  return cachedConfig;
}
