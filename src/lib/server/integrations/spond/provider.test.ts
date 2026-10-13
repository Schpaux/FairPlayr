// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IntegrationError } from "@/lib/server/integrations/spond/errors";
import {
  classifyLoginFailure,
  extractAccessToken,
  spondProvider,
} from "@/lib/server/integrations/spond/provider";

const CREDENTIALS = { email: "coach@example.com", password: "s3cret-password" };
const ACCESS_TOKEN = "access-token-value";
const REFRESH_TOKEN = "refresh-token-value";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function textResponse(body: string, status: number): Response {
  return new Response(body, { status });
}

function loginOk(): Response {
  return jsonResponse({
    accessToken: { token: ACCESS_TOKEN, expiration: "2026-10-15T00:00:00Z" },
    refreshToken: { token: REFRESH_TOKEN, expiration: "2027-10-15T00:00:00Z" },
  });
}

async function captureError(promise: Promise<unknown>): Promise<IntegrationError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(IntegrationError);
    return error as IntegrationError;
  }

  throw new Error("Expected promise to reject");
}

function expectNoSecrets(error: IntegrationError) {
  for (const secret of [CREDENTIALS.password, ACCESS_TOKEN, REFRESH_TOKEN, "challenge-token-value"]) {
    expect(error.message).not.toContain(secret);
  }
}

describe("spondProvider", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("login", () => {
    it("posts credentials to the auth2 login endpoint", async () => {
      fetchMock.mockResolvedValueOnce(loginOk()).mockResolvedValueOnce(jsonResponse([]));

      await spondProvider.getGroups(CREDENTIALS);

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://api.spond.com/core/v1/auth2/login");
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual(CREDENTIALS);
    });

    it("uses accessToken.token as the bearer token", async () => {
      fetchMock
        .mockResolvedValueOnce(loginOk())
        .mockResolvedValueOnce(jsonResponse({ id: "p1", firstName: "Kari", lastName: "Trener" }));

      const result = await spondProvider.verifyCredentials(CREDENTIALS);

      expect(result.token).toBe(ACCESS_TOKEN);
      expect(result.profile.firstName).toBe("Kari");

      const [url, init] = fetchMock.mock.calls[1];
      expect(url).toBe("https://api.spond.com/core/v1/profile");
      expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${ACCESS_TOKEN}`);
    });

    it.each([
      ["missing accessToken", { refreshToken: { token: REFRESH_TOKEN } }],
      ["legacy loginToken only", { loginToken: "legacy-token" }],
      ["non-string token", { accessToken: { token: 12345 } }],
      ["empty token", { accessToken: { token: "" } }],
      ["whitespace token", { accessToken: { token: "   " } }],
      ["accessToken as string", { accessToken: ACCESS_TOKEN }],
      ["array body", [ACCESS_TOKEN]],
    ])("rejects a 200 response with %s as SPOND_BAD_RESPONSE", async (_label, body) => {
      fetchMock.mockResolvedValueOnce(jsonResponse(body));

      const error = await captureError(spondProvider.getGroups(CREDENTIALS));

      expect(error.code).toBe("SPOND_BAD_RESPONSE");
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expectNoSecrets(error);
    });

    it("rejects a non-JSON 200 response as SPOND_BAD_RESPONSE", async () => {
      fetchMock.mockResolvedValueOnce(textResponse("<html>ok</html>", 200));

      const error = await captureError(spondProvider.getGroups(CREDENTIALS));

      expect(error.code).toBe("SPOND_BAD_RESPONSE");
    });

    it("classifies a 200 two-factor challenge as SPOND_2FA_REQUIRED", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ twoFactorRequired: true, challengeToken: "challenge-token-value" })
      );

      const error = await captureError(spondProvider.getGroups(CREDENTIALS));

      expect(error.code).toBe("SPOND_2FA_REQUIRED");
      expectNoSecrets(error);
    });

    it("classifies a network failure as SPOND_UNAVAILABLE", async () => {
      fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));

      const error = await captureError(spondProvider.getGroups(CREDENTIALS));

      expect(error.code).toBe("SPOND_UNAVAILABLE");
    });

    it.each([
      [404, "SPOND_UNAVAILABLE"],
      [500, "SPOND_UNAVAILABLE"],
      [502, "SPOND_UNAVAILABLE"],
      [503, "SPOND_UNAVAILABLE"],
      [429, "SPOND_RATE_LIMITED"],
      [401, "INVALID_CREDENTIALS"],
      [400, "SPOND_AUTH_FAILED"],
      [403, "SPOND_AUTH_FAILED"],
    ])("classifies login HTTP %i without a recognised body as %s", async (status, code) => {
      fetchMock.mockResolvedValueOnce(textResponse("<html>error</html>", status));

      const error = await captureError(spondProvider.getGroups(CREDENTIALS));

      expect(error.code).toBe(code);
      expectNoSecrets(error);
    });

    it("never logs credentials or tokens", async () => {
      const spies = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
        vi.spyOn(console, method).mockImplementation(() => {})
      );

      fetchMock.mockResolvedValueOnce(loginOk()).mockResolvedValueOnce(jsonResponse([]));
      await spondProvider.getGroups(CREDENTIALS);

      fetchMock.mockResolvedValueOnce(jsonResponse({ error: "invalid password" }, 400));
      await captureError(spondProvider.getGroups(CREDENTIALS));

      for (const spy of spies) {
        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
      }
    });
  });

  describe("getGroups", () => {
    it("returns groups fetched with the bearer token", async () => {
      const groups = [{ id: "g1", name: "G2014", members: [{ id: "m1", firstName: "Ola" }] }];
      fetchMock.mockResolvedValueOnce(loginOk()).mockResolvedValueOnce(jsonResponse(groups));

      await expect(spondProvider.getGroups(CREDENTIALS)).resolves.toEqual(groups);

      const [url, init] = fetchMock.mock.calls[1];
      expect(url).toBe("https://api.spond.com/core/v1/groups/");
      expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${ACCESS_TOKEN}`);
    });

    it.each([
      ["object body", { groups: [] }],
      ["empty body", ""],
    ])("rejects a non-array groups response (%s) as SPOND_BAD_RESPONSE", async (_label, body) => {
      fetchMock
        .mockResolvedValueOnce(loginOk())
        .mockResolvedValueOnce(typeof body === "string" ? textResponse(body, 200) : jsonResponse(body));

      const error = await captureError(spondProvider.getGroups(CREDENTIALS));

      expect(error.code).toBe("SPOND_BAD_RESPONSE");
    });

    it("rejects malformed JSON as SPOND_BAD_RESPONSE", async () => {
      fetchMock.mockResolvedValueOnce(loginOk()).mockResolvedValueOnce(textResponse("{not json", 200));

      const error = await captureError(spondProvider.getGroups(CREDENTIALS));

      expect(error.code).toBe("SPOND_BAD_RESPONSE");
    });

    it.each([
      [429, "SPOND_RATE_LIMITED"],
      [500, "SPOND_UNAVAILABLE"],
      [503, "SPOND_UNAVAILABLE"],
      [401, "SPOND_REQUEST_FAILED"],
      [404, "SPOND_REQUEST_FAILED"],
    ])("classifies groups HTTP %i as %s", async (status, code) => {
      fetchMock.mockResolvedValueOnce(loginOk()).mockResolvedValueOnce(textResponse("", status));

      const error = await captureError(spondProvider.getGroups(CREDENTIALS));

      expect(error.code).toBe(code);
    });
  });
});

describe("extractAccessToken", () => {
  it("returns a non-empty string token", () => {
    expect(extractAccessToken({ accessToken: { token: "abc" } })).toBe("abc");
  });

  it.each([null, undefined, "abc", 42, {}, { accessToken: null }, { accessToken: { token: null } }])(
    "returns null for %j",
    (body) => {
      expect(extractAccessToken(body)).toBeNull();
    }
  );
});

describe("classifyLoginFailure", () => {
  it.each([
    [400, { errorKey: "twoFactorRequired" }, "SPOND_2FA_REQUIRED"],
    [403, { message: "Two-factor authentication required" }, "SPOND_2FA_REQUIRED"],
    [401, { otpRequired: true }, "SPOND_2FA_REQUIRED"],
    [400, { error: "MFA_REQUIRED" }, "SPOND_2FA_REQUIRED"],
    [400, { error: "TOO_MANY_REQUESTS" }, "SPOND_RATE_LIMITED"],
    [403, { message: "Rate limit exceeded" }, "SPOND_RATE_LIMITED"],
    [400, { errorKey: "outOfLoginAttempts" }, "SPOND_RATE_LIMITED"],
    [400, { errorKey: "invalidEmailOrPassword" }, "INVALID_CREDENTIALS"],
    [400, { message: "Wrong password" }, "INVALID_CREDENTIALS"],
    [401, {}, "INVALID_CREDENTIALS"],
    [400, { error: "something unexpected" }, "SPOND_AUTH_FAILED"],
    [418, null, "SPOND_AUTH_FAILED"],
    [404, { error: "invalid password" }, "SPOND_UNAVAILABLE"],
    [503, { error: "two factor" }, "SPOND_UNAVAILABLE"],
  ])("HTTP %i with %j -> %s", (status, body, code) => {
    expect(classifyLoginFailure(status, body).code).toBe(code);
  });

  it("does not treat token-like values as 2FA indicators", () => {
    // Hex/opaque values outside known error fields are never inspected.
    const body = { session: "a82fa0otp9mfa", footprint: "x" };
    expect(classifyLoginFailure(400, body).code).toBe("SPOND_AUTH_FAILED");
  });

  it("never includes body values in the error message", () => {
    const body = { message: "Invalid password for coach@example.com", token: "challenge-token-value" };
    const error = classifyLoginFailure(400, body);

    expect(error.code).toBe("INVALID_CREDENTIALS");
    expect(error.message).not.toContain("coach@example.com");
    expectNoSecrets(error);
  });
});
