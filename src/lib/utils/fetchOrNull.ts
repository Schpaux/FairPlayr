/**
 * True for the errors fetch() rejects with when the request never produced a
 * response: offline, DNS failure, connection reset (TypeError per the Fetch
 * spec) or an aborted / timed-out request (AbortError / TimeoutError).
 */
export function isConnectivityError(error: unknown): boolean {
  if (error instanceof TypeError) {
    return true;
  }

  // DOMException is not an Error subclass in every runtime, so check the name
  // structurally rather than with instanceof.
  const name =
    typeof error === "object" && error !== null && "name" in error ? error.name : null;

  return name === "AbortError" || name === "TimeoutError";
}

/**
 * fetch() that resolves to null instead of rejecting when the request could
 * not reach the server.
 *
 * Use for best-effort server sync where local state is the source of truth —
 * e.g. the live match view — so callers can treat "no network" the same way
 * they already treat a non-OK response, without unhandled rejections.
 *
 * Connectivity failures are expected and resolve to null quietly. Anything
 * else (a bug, a broken fetch polyfill) also resolves to null so fire-and-forget
 * callers never produce an unhandled rejection, but is reported via
 * console.error so it still surfaces in the dev overlay and logs.
 */
export async function fetchOrNull(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response | null> {
  try {
    return await fetch(input, init);
  } catch (error) {
    if (!isConnectivityError(error)) {
      console.error("[fetchOrNull] unexpected fetch failure", error);
    }

    return null;
  }
}

/**
 * Parses a response body as JSON, resolving to null for an empty body,
 * non-JSON content (e.g. an HTML error page from a proxy) or a body that was
 * already consumed. Never rejects.
 */
export async function readJsonOrNull<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Extracts `{ message }` from an API error response, or null if the body is
 * missing, not JSON, or has no usable message. Callers supply their own
 * localised fallback.
 */
export async function readErrorMessage(response: Response): Promise<string | null> {
  const payload = await readJsonOrNull<unknown>(response);

  if (typeof payload !== "object" || payload === null || !("message" in payload)) {
    return null;
  }

  const { message } = payload as { message: unknown };

  return typeof message === "string" && message.trim().length > 0 ? message : null;
}
