import { IntegrationError } from "@/lib/server/integrations/spond/errors";
import type {
  SpondCredentials,
  SpondEvent,
  SpondGroup,
  SpondProfile,
} from "@/lib/server/integrations/spond/types";

const SPOND_BASE_URL = "https://api.spond.com/core/v1/";

interface LoginResponse {
  loginToken?: string;
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();

  if (!text) {
    return {} as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new IntegrationError("SPOND_BAD_RESPONSE", "Ugyldig respons fra Spond.", 502);
  }
}

async function login(credentials: SpondCredentials): Promise<string> {
  const response = await fetch(`${SPOND_BASE_URL}login`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      email: credentials.email,
      password: credentials.password,
    }),
    cache: "no-store",
  });

  const data = await readJsonResponse<LoginResponse>(response);

  if (!response.ok || !data.loginToken) {
    throw new IntegrationError("INVALID_CREDENTIALS", "Ugyldig Spond-bruker eller passord.", 401);
  }

  return data.loginToken;
}

async function getWithToken<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${SPOND_BASE_URL}${path}`, {
    method: "GET",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new IntegrationError("SPOND_REQUEST_FAILED", "Feil ved henting av data fra Spond.", 502);
  }

  return readJsonResponse<T>(response);
}

function formatDateForSpond(date: Date): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T00:00:00.000Z`;
}

async function getEventsWithToken(token: string, groupId: string): Promise<SpondEvent[]> {
  const today = new Date();
  const params = new URLSearchParams({
    max: "100",
    scheduled: "false",
    groupId,
    minStartTimestamp: formatDateForSpond(today),
  });

  const response = await fetch(`${SPOND_BASE_URL}sponds/?${params.toString()}`, {
    method: "GET",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new IntegrationError("SPOND_REQUEST_FAILED", "Feil ved henting av data fra Spond.", 502);
  }

  return readJsonResponse<SpondEvent[]>(response);
}

export const spondProvider = {
  async verifyCredentials(credentials: SpondCredentials): Promise<{ token: string; profile: SpondProfile }> {
    const token = await login(credentials);
    const profile = await getWithToken<SpondProfile>("profile", token);
    return { token, profile };
  },

  async getGroups(credentials: SpondCredentials): Promise<SpondGroup[]> {
    const token = await login(credentials);
    return getWithToken<SpondGroup[]>("groups/", token);
  },

  async getUpcomingEvents(credentials: SpondCredentials, groupId: string): Promise<SpondEvent[]> {
    const token = await login(credentials);
    return getEventsWithToken(token, groupId);
  },
};
