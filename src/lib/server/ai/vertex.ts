import "server-only";
import { VertexAI } from "@google-cloud/vertexai";
import { getVertexAiConfig } from "@/lib/server/ai/config";

let cachedClient: VertexAI | null = null;

export function getVertexAiClient(): VertexAI {
  if (cachedClient) {
    return cachedClient;
  }

  const config = getVertexAiConfig();

  cachedClient = new VertexAI({
    project: config.project,
    location: config.location,
  });

  return cachedClient;
}
