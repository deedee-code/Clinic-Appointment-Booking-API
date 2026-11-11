import type { FastifyInstance } from "fastify";

export function registerRequestId(app: FastifyInstance): void {
  app.addHook("onRequest", async (request, reply) => {
    reply.header("X-Request-Id", request.id);
  });
}
