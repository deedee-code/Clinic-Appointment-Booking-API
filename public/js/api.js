const BASE_URL = "/web";
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * @typedef {{ status: number, code: string, message: string, fieldErrors: Record<string, string>, retryAfter: number | null }} ApiFailure
 */

export class ApiError extends Error {
  /** @param {ApiFailure} failure */
  constructor(failure) {
    super(failure.message);
    this.name = "ApiError";
    Object.assign(this, failure);
  }
}

/**
 * @param {string} path
 * @param {{ method?: string, body?: unknown, idempotencyKey?: string, signal?: AbortSignal }} [options]
 * @returns {Promise<any>}
 */
export async function request(path, options = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const abortFromCaller = () => controller.abort();
  options.signal?.addEventListener("abort", abortFromCaller, { once: true });

  try {
    let response;
    try {
      response = await fetch(`${BASE_URL}${path}`, {
        method: options.method ?? "GET",
        headers: {
          ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      });
    } catch {
      throw new ApiError({
        status: 0,
        code: "NETWORK_ERROR",
        message: "We couldn't reach the booking service. Your details are saved. Try again.",
        fieldErrors: {},
        retryAfter: null,
      });
    }

    let text;
    try {
      text = await response.text();
    } catch {
      throw new ApiError({
        status: 0,
        code: "NETWORK_ERROR",
        message: "We couldn't reach the booking service. Your details are saved. Try again.",
        fieldErrors: {},
        retryAfter: null,
      });
    }
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }
    }

    if (!response.ok) {
      throw new ApiError({
        status: response.status,
        code: typeof data?.code === "string" ? data.code : "API_ERROR",
        message: failureMessage(response.status, path),
        fieldErrors: isRecord(data?.fieldErrors) ? data.fieldErrors : {},
        retryAfter: parseRetryAfter(response.headers.get("Retry-After")),
      });
    }
    if (text && data === null) {
      throw new ApiError({
        status: response.status,
        code: "INVALID_RESPONSE",
        message: "We couldn't reach the booking service. Your details are saved. Try again.",
        fieldErrors: {},
        retryAfter: null,
      });
    }
    return data;
  } finally {
    window.clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abortFromCaller);
  }
}

/**
 * @param {number} status
 * @param {string} path
 */
function failureMessage(status, path) {
  if (status === 401 || status === 403) return "Booking is temporarily unavailable.";
  if (status === 404 && path.startsWith("/slots")) return "We couldn't load appointment times. Please try again.";
  if (status === 404) return "We couldn't find that booking.";
  if (status === 409) return "That request conflicts with the booking's current status.";
  if (status === 422) return "This request conflicts with an earlier attempt. Review your details and try again.";
  if (status === 429) return "Too many booking attempts. Please wait before trying again.";
  if (status >= 500) return "We couldn't reach the booking service. Your details are saved. Try again.";
  return "Please check your details and try again.";
}

/**
 * @param {string | null} value
 */
function parseRetryAfter(value) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, Math.ceil(seconds));
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, Math.ceil((date - Date.now()) / 1000));
}

/** @param {unknown} value */
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
