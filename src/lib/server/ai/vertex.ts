import "server-only";
import { VertexAI } from "@google-cloud/vertexai";
import { getVertexAiConfig } from "@/lib/server/ai/config";
import { AiServiceError } from "@/lib/server/ai/errors";

type AuthSource = "env_credentials" | "adc";

interface ServiceAccountCredentials {
  client_email?: string;
  private_key?: string;
  [key: string]: unknown;
}

interface VertexRuntimeInfo {
  authSource: AuthSource;
  project: string;
  location: string;
}

let cachedClient: VertexAI | null = null;
let cachedRuntimeInfo: VertexRuntimeInfo | null = null;

function parseEnvCredentialsJson(): ServiceAccountCredentials | null {
  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;

  if (!raw || !raw.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as ServiceAccountCredentials;
    const privateKey =
      typeof parsed.private_key === "string"
        ? parsed.private_key.replace(/\\n/g, "\n")
        : undefined;

    return {
      ...parsed,
      private_key: privateKey,
    };
  } catch {
    throw new AiServiceError(
      "VERTEX_CONFIG_INVALID_CREDENTIALS_JSON",
      "Invalid GOOGLE_APPLICATION_CREDENTIALS_JSON",
      500
    );
  }
}

function resolveAuthSource(): {
  authSource: AuthSource;
  googleAuthOptions?: { credentials: ServiceAccountCredentials };
} {
  const credentials = parseEnvCredentialsJson();

  if (credentials) {
    return {
      authSource: "env_credentials",
      googleAuthOptions: { credentials },
    };
  }

  return {
    authSource: "adc",
  };
}

export function getVertexRuntimeInfo(): VertexRuntimeInfo {
  if (cachedRuntimeInfo) {
    return cachedRuntimeInfo;
  }

  const config = getVertexAiConfig();
  const { authSource } = resolveAuthSource();

  cachedRuntimeInfo = {
    authSource,
    project: config.project,
    location: config.location,
  };

  return cachedRuntimeInfo;
}

export function getVertexAiClient(): VertexAI {
  if (cachedClient) {
    return cachedClient;
  }

  const config = getVertexAiConfig();
  const { authSource, googleAuthOptions } = resolveAuthSource();

  console.log("[ai] Vertex client init", {
    hasEnvCredentials: Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON),
    authSource,
    project: config.project,
    location: config.location,
  });

  cachedClient = new VertexAI({
    project: config.project,
    location: config.location,
    googleAuthOptions,
  });

  cachedRuntimeInfo = {
    authSource,
    project: config.project,
    location: config.location,
  };

  return cachedClient;
}
