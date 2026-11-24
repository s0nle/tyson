import { z } from "zod";

export const ErrorCode = z.enum([
  "bad_request",
  "unauthorized",
  "forbidden",
  "not_found",
  "conflict",
  "insufficient_credits",
  "approval_required",
  "rate_limited",
  "internal",
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ApiErrorBody = z.object({
  error: z.object({ code: ErrorCode, message: z.string(), details: z.unknown().optional() }),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBody>;

export const STATUS_FOR: Record<ErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  insufficient_credits: 402,
  approval_required: 409,
  rate_limited: 429,
  internal: 500,
};

export class ContractError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly status = STATUS_FOR[code],
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ContractError";
  }
  toBody(): ApiErrorBody {
    return { error: { code: this.code, message: this.message, details: this.details } };
  }
}
