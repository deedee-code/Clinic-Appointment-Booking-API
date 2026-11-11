import type { FastifyError, FastifyInstance } from "fastify";
import { AppError } from "../errors/app-error.js";

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof AppError) {
      if (error.retryAfterSeconds !== undefined) {
        reply.header("Retry-After", String(error.retryAfterSeconds));
      }
      return reply.code(error.statusCode).send({ error: error.message });
    }

    if (error.statusCode !== undefined && error.statusCode >= 400 && error.statusCode < 500) {
      return reply.code(error.statusCode).send({
        error: error.statusCode === 413 ? "Request body is too large" : "Invalid request",
      });
    }

    request.log.error({ err: error, requestId: request.id }, "Unhandled request error");
    return reply.code(500).send({ error: "Internal server error" });
  });
}
