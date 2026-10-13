import { IntegrationError } from "@/lib/server/integrations/spond/errors";
import type {
  SpondCredentials,
  SpondEvent,
  SpondGroup,
  SpondProfile,
} from "@/lib/server/integrations/spond/types";

const SPOND_BASE_URL = "https://api.spond.com/core/v1/";
const SPOND_LOGIN_PATH = "auth2/login";

// Only the fields we read. The full login body also carries refresh tokens and
// possibly challenge tokens; it must never be logged or echoed in errors.
interface LoginResponse {
  accessToken?: {
    token?: unknown;
  };
}

const ERROR_TEXT_FIELDS = ["error", "errorKey", "errorCode", "code", "message", "type", "reason"];

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

async function readJsonBodySafely(response: Response): Promise<unknown> {
  try {
    const text = await response.text();
    return text ? (JSON.parse(text) as unknown) : null;
  } catch {
    return null;
  }
}

// Splits identifiers and short messages into lower-case words, so that
// "twoFactorRequired", "TOO_MANY_REQUESTS" and "Invalid password" all tokenise
// cleanly. Only keys and known error fields are inspected; other values (which
// may be tokens) are never read, matched or surfaced.
function toWords(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function collectErrorWords(body: unknown): Set<string>[] {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return [];
  }

  const record = body as Record<string, unknown>;
  const phrases = Object.keys(record).map((key) => new Set(toWords(key)));

  for (const field of ERROR_TEXT_FIELDS) {
    const value = record[field];

    if (typeof value === "string" && value.length <= 200) {
      phrases.push(new Set(toWords(value)));
    }
  }

  return phrases;
}

function hasAll(phrase: Set<string>, words: string[]): boolean {
  return words.every((word) => phrase.has(word));
}

function indicatesTwoFactor(phrases: Set<string>[]): boolean {
  return phrases.some(
    (phrase) =>
      hasAll(phrase, ["two", "factor"]) || phrase.has("2fa") || phrase.has("mfa") || phrase.has("otp")
  );
}

function indicatesRateLimit(phrases: Set<string>[]): boolean {
  return phrases.some(
    (phrase) =>
      hasAll(phrase, ["rate", "limit"]) ||
      hasAll(phrase, ["rate", "limited"]) ||
      hasAll(phrase, ["too", "many", "requests"]) ||
      hasAll(phrase, ["too", "many", "attempts"]) ||
      // Spond's known lockout key: errorKey "outOfLoginAttempts".
      hasAll(phrase, ["out", "of", "login", "attempts"])
  );
}

function indicatesInvalidCredentials(phrases: Set<string>[]): boolean {
  return phrases.some(
    (phrase) =>
      (phrase.has("invalid") || phrase.has("wrong") || phrase.has("incorrect")) &&
      (phrase.has("password") || phrase.has("credentials") || phrase.has("email") || phrase.has("login"))
  );
}

function spondUnavailableError(): IntegrationError {
  return new IntegrationError("SPOND_UNAVAILABLE", "Spond er ikke tilgjengelig akkurat nå.", 503);
}

function spondRateLimitedError(): IntegrationError {
  return new IntegrationError("SPOND_RATE_LIMITED", "For mange forsøk mot Spond. Vent litt og prøv igjen.", 429);
}

export function classifyLoginFailure(status: number, body: unknown): IntegrationError {
  const phrases = collectErrorWords(body);

  if (status === 429 || indicatesRateLimit(phrases)) {
    return spondRateLimitedError();
  }

  if (status === 404 || status >= 500) {
    return spondUnavailableError();
  }

  if (indicatesTwoFactor(phrases)) {
    return new IntegrationError(
      "SPOND_2FA_REQUIRED",
      "Spond-kontoen krever totrinnsbekreftelse, som ikke støttes ennå.",
      403
    );
  }

  if (status === 401 || indicatesInvalidCredentials(phrases)) {
    return new IntegrationError("INVALID_CREDENTIALS", "Ugyldig Spond-bruker eller passord.", 401);
  }

  return new IntegrationError("SPOND_AUTH_FAILED", "Kunne ikke logge inn på Spond.", 502);
}

export function extractAccessToken(body: unknown): string | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }

  const token = (body as LoginResponse).accessToken?.token;
  return typeof token === "string" && token.trim().length > 0 ? token : null;
}

async function login(credentials: SpondCredentials): Promise<string> {
  let response: Response;

  try {
    response = await fetch(`${SPOND_BASE_URL}${SPOND_LOGIN_PATH}`, {
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
  } catch {
    throw spondUnavailableError();
  }

  const body = await readJsonBodySafely(response);

  if (!response.ok) {
    throw classifyLoginFailure(response.status, body);
  }

  const token = extractAccessToken(body);

  if (token) {
    return token;
  }

  // A 200 without an access token is either an explicit challenge we cannot
  // complete, or a response shape we do not recognise.
  if (indicatesTwoFactor(collectErrorWords(body))) {
    throw classifyLoginFailure(response.status, body);
  }

  throw new IntegrationError("SPOND_BAD_RESPONSE", "Ugyldig respons fra Spond.", 502);
}

function dataRequestError(status: number): IntegrationError {
  if (status === 429) {
    return spondRateLimitedError();
  }

  if (status >= 500) {
    return spondUnavailableError();
  }

  return new IntegrationError("SPOND_REQUEST_FAILED", "Feil ved henting av data fra Spond.", 502);
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
    throw dataRequestError(response.status);
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
    throw dataRequestError(response.status);
  }

  return readJsonResponse<SpondEvent[]>(response);
}

async function getEventWithToken(token: string, eventId: string): Promise<SpondEvent> {
  const response = await fetch(`${SPOND_BASE_URL}sponds/${encodeURIComponent(eventId)}`, {
    method: "GET",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw dataRequestError(response.status);
  }

  return readJsonResponse<SpondEvent>(response);
}

export const spondProvider = {
  async verifyCredentials(credentials: SpondCredentials): Promise<{ token: string; profile: SpondProfile }> {
    const token = await login(credentials);
    const profile = await getWithToken<SpondProfile>("profile", token);
    return { token, profile };
  },

  async getGroups(credentials: SpondCredentials): Promise<SpondGroup[]> {
    const token = await login(credentials);
    const groups = await getWithToken<unknown>("groups/", token);

    if (!Array.isArray(groups)) {
      throw new IntegrationError("SPOND_BAD_RESPONSE", "Ugyldig respons fra Spond.", 502);
    }

    return groups as SpondGroup[];
  },

  async getUpcomingEvents(credentials: SpondCredentials, groupId: string): Promise<SpondEvent[]> {
    const token = await login(credentials);
    return getEventsWithToken(token, groupId);
  },

  async getEvent(credentials: SpondCredentials, eventId: string): Promise<SpondEvent> {
    const token = await login(credentials);
    return getEventWithToken(token, eventId);
  },
};
