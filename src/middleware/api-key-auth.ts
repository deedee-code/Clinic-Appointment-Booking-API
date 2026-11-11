import type { FastifyReply, FastifyRequest } from "fastify";
import { UnauthorizedError } from "../errors/app-error.js";
import { constantTimeEqual } from "../utils/crypto.js";

export function apiKeyAuth(expectedApiKey: string) {
  return async function authenticate(request: FastifyRequest, _reply: FastifyReply) {
    const supplied = request.headers["x-api-key"];
    if (typeof supplied !== "string" || !constantTimeEqual(supplied, expectedApiKey)) {
      throw new UnauthorizedError();
    }
  };
}
