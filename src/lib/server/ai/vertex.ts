import "server-only";
import { VertexAI } from "@google-cloud/vertexai";
import { getVertexAiConfig } from "@/lib/server/ai/config";
import { AiServiceError } from "@/lib/server/ai/errors";

type AuthSource = "env_credentials" | "adc";

interface ServiceAccountCredentials {
  type?: string;
  project_id?: string;
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

  console.log("[ai] Parsing GOOGLE_APPLICATION_CREDENTIALS_JSON", {
    length: raw.length,
    preview: raw.slice(0, 30),
  });

  try {
    const parsed = JSON.parse(raw) as unknown;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new AiServiceError(
        "VERTEX_CONFIG_INVALID_CREDENTIALS_JSON",
        "GOOGLE_APPLICATION_CREDENTIALS_JSON is not a valid service account JSON",
        500,
        {
          stage: "parse_env_credentials",
          reason: "parsed_value_not_object",
        }
      );
    }

    const credentials = parsed as ServiceAccountCredentials;
    const hasRequiredFields =
      typeof credentials.type === "string" && credentials.type.trim().length > 0 &&
      typeof credentials.project_id === "string" && credentials.project_id.trim().length > 0 &&
      typeof credentials.client_email === "string" && credentials.client_email.trim().length > 0 &&
      typeof credentials.private_key === "string" && credentials.private_key.trim().length > 0;

    if (!hasRequiredFields) {
      throw new AiServiceError(
        "VERTEX_CONFIG_INVALID_CREDENTIALS_JSON",
        "GOOGLE_APPLICATION_CREDENTIALS_JSON is not a valid service account JSON",
        500,
        {
          stage: "parse_env_credentials",
          reason: "missing_required_fields",
          hasType: typeof credentials.type === "string",
          hasProjectId: typeof credentials.project_id === "string",
          hasClientEmail: typeof credentials.client_email === "string",
          hasPrivateKey: typeof credentials.private_key === "string",
        }
      );
    }

    const privateKey =
      typeof credentials.private_key === "string"
        ? credentials.private_key.replace(/\\n/g, "\n")
        : undefined;

    return {
      ...credentials,
      private_key: privateKey,
    };
  } catch (error) {
    if (error instanceof AiServiceError) {
      throw error;
    }

    throw new AiServiceError(
      "VERTEX_CONFIG_INVALID_CREDENTIALS_JSON",
      "Invalid GOOGLE_APPLICATION_CREDENTIALS_JSON",
      500,
      {
        stage: "parse_env_credentials",
        reason: "json_parse_failed",
      }
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

  console.log("[ai] Vertex runtime info resolved", {
    authSource,
    project: config.project,
    location: config.location,
  });

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
    stage: "vertex_client_init",
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
