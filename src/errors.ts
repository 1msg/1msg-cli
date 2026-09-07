export const EXIT_OK = 0;
export const EXIT_USAGE = 1;
export const EXIT_API_4XX = 2;
export const EXIT_API_5XX = 3;
export const EXIT_NETWORK = 4;
export const EXIT_NOT_CONFIGURED = 5;

export class CliExit extends Error {
  readonly exitCode: number;
  constructor(exitCode: number, message = '') {
    super(message);
    this.name = 'CliExit';
    this.exitCode = exitCode;
  }
}

export class UsageError extends Error {
  readonly exitCode = EXIT_USAGE;
  readonly see?: string;
  constructor(message: string, see?: string) {
    super(message);
    this.name = 'UsageError';
    this.see = see;
  }
}

export class NotConfiguredError extends Error {
  readonly exitCode = EXIT_NOT_CONFIGURED;
  constructor(message = 'no channel configured — run 1msg init') {
    super(message);
    this.name = 'NotConfiguredError';
  }
}

export class ApiError extends Error {
  readonly status: number;
  readonly rawBody: string;
  readonly jsonBody: unknown;
  constructor(status: number, rawBody: string, jsonBody: unknown, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.rawBody = rawBody;
    this.jsonBody = jsonBody;
  }

  get exitCode(): number {
    return this.status >= 500 ? EXIT_API_5XX : EXIT_API_4XX;
  }
}

export class NetworkError extends Error {
  readonly exitCode = EXIT_NETWORK;
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

export function usage(message: string, see?: string): never {
  throw new UsageError(message, see);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function extractErrorMessage(jsonBody: unknown, rawBody: string, status: number): string {
  if (isRecord(jsonBody) && typeof jsonBody.error === 'string' && jsonBody.error.trim()) {
    return jsonBody.error;
  }
  if (
    isRecord(jsonBody) &&
    isRecord(jsonBody.response) &&
    typeof jsonBody.response.error === 'string'
  ) {
    return jsonBody.response.error;
  }
  const trimmed = rawBody.trim();
  if (trimmed && trimmed.length < 400) return trimmed;
  return `request failed`;
}

export async function normalizeThrown(error: unknown): Promise<Error> {
  if (
    error instanceof UsageError ||
    error instanceof NotConfiguredError ||
    error instanceof ApiError ||
    error instanceof NetworkError ||
    error instanceof CliExit
  ) {
    return error;
  }

  if (isRecord(error) && isRecord(error.response) && typeof error.response.status === 'number') {
    const response = error.response as {
      status: number;
      text?: () => Promise<string>;
      json?: () => Promise<unknown>;
    };
    let rawBody = '';
    try {
      if (typeof response.text === 'function') {
        rawBody = await response.text();
      }
    } catch {
      rawBody = '';
    }
    let jsonBody: unknown;
    try {
      jsonBody = rawBody ? JSON.parse(rawBody) : undefined;
    } catch {
      jsonBody = undefined;
    }
    const message = extractErrorMessage(jsonBody, rawBody, response.status);
    return new ApiError(response.status, rawBody, jsonBody, message);
  }

  const err = error instanceof Error ? error : new Error(String(error));
  const name = err.name || '';
  const msg = err.message || String(error);
  const cause = isRecord(error) ? error.cause : undefined;
  const causeMsg =
    cause instanceof Error
      ? cause.message
      : isRecord(cause) && typeof cause.message === 'string'
        ? cause.message
        : '';
  const combined = `${name} ${msg} ${causeMsg}`.toLowerCase();
  if (
    name === 'FetchError' ||
    /enotfound|econnrefused|econnreset|etimedout|network|fetch failed|socket/.test(combined)
  ) {
    return new NetworkError(msg || 'network error');
  }
  return err;
}

export function hintFor(error: Error): string | undefined {
  if (error instanceof ApiError && error.status === 401) {
    return 'set ONE_MSG_TOKEN or run `1msg init`';
  }
  if (error instanceof UsageError) {
    return error.see ? undefined : undefined;
  }
  return undefined;
}
