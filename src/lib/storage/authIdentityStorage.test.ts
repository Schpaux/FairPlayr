import { afterEach, describe, expect, it } from "vitest";
import {
  AUTH_IDENTITY_KEY,
  clearStoredAuthIdentity,
  decideSessionLoss,
  getStoredAuthIdentity,
  isNetworkAuthError,
  saveStoredAuthIdentity,
} from "@/lib/storage/authIdentityStorage";

const IDENTITY = { userId: "user-1", email: "coach@example.com", savedAt: "2026-10-20T10:00:00.000Z" };

describe("authIdentityStorage", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("stores the id and e-mail only, never a token", () => {
    saveStoredAuthIdentity("user-1", "coach@example.com");

    const raw = JSON.parse(window.localStorage.getItem(AUTH_IDENTITY_KEY)!);
    expect(Object.keys(raw).sort()).toEqual(["email", "savedAt", "userId", "version"]);
    expect(getStoredAuthIdentity()?.userId).toBe("user-1");

    clearStoredAuthIdentity();
    expect(getStoredAuthIdentity()).toBeNull();
  });

  it("tells network failures from invalid sessions", () => {
    expect(isNetworkAuthError({ name: "AuthRetryableFetchError", message: "Failed to fetch" })).toBe(true);
    expect(isNetworkAuthError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkAuthError({ name: "AuthApiError", status: 400, message: "Invalid Refresh Token" })).toBe(false);
    expect(isNetworkAuthError(null)).toBe(false);
  });

  describe("decideSessionLoss (B10)", () => {
    const base = { identity: IDENTITY, explicitSignOut: false, error: null, isOnline: true, hasActiveMatch: false };

    it("stays signed in (deferred) when the refresh failed for lack of network", () => {
      expect(decideSessionLoss({ ...base, error: { name: "AuthRetryableFetchError" } })).toBe("deferred");
      expect(decideSessionLoss({ ...base, isOnline: false })).toBe("deferred");
    });

    it("never drops to guest while a match is active", () => {
      expect(
        decideSessionLoss({ ...base, error: { name: "AuthApiError", status: 400 }, hasActiveMatch: true })
      ).toBe("deferred");
    });

    it("is a guest after an explicit sign-out, without a known identity, or when the server ended the session", () => {
      expect(decideSessionLoss({ ...base, explicitSignOut: true, isOnline: false, hasActiveMatch: true })).toBe(
        "guest"
      );
      expect(decideSessionLoss({ ...base, identity: null, isOnline: false })).toBe("guest");
      expect(decideSessionLoss({ ...base, error: { name: "AuthApiError", status: 400 } })).toBe("guest");
    });
  });
});
