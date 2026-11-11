import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import pg from "pg";
import path from "node:path";
import type { AppConfig } from "./config/env.js";
import { createPool } from "./db/pool.js";
import { apiKeyAuth } from "./middleware/api-key-auth.js";
import { registerErrorHandler } from "./middleware/error-handler.js";
import { registerRequestId } from "./middleware/request-id.js";
import { BookingsController } from "./modules/bookings/bookings.controller.js";
import { BookingsRepository } from "./modules/bookings/bookings.repository.js";
import { registerBookingsRoutes } from "./modules/bookings/bookings.routes.js";
import { BookingsService } from "./modules/bookings/bookings.service.js";
import { SlotsController } from "./modules/slots/slots.controller.js";
import { registerSlotsRoutes } from "./modules/slots/slots.routes.js";
import { SlotsRepository } from "./modules/slots/slots.repository.js";
import { SlotsService } from "./modules/slots/slots.service.js";
import { registerWebProxyRoutes } from "./modules/web-proxy/web-proxy.routes.js";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { openApiDocument } from "./openapi.js";

export type AppOptions = {
  config: AppConfig;
  pool?: pg.Pool;
  publicDirectory?: string;
};

export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const { config } = options;
  const pool = options.pool ?? createPool(config);
  const app = Fastify({
    logger: config.nodeEnv !== "test",
    trustProxy: config.trustProxy,
    bodyLimit: 64 * 1024,
  });
  const slots = new SlotsController(new SlotsService(new SlotsRepository(pool)));
  const bookings = new BookingsController(
    new BookingsService(new BookingsRepository(pool), config),
  );

  registerErrorHandler(app);
  registerRequestId(app);
  app.setNotFoundHandler((_request, reply) => {
    return reply.code(404).send({ error: "Not found" });
  });
  app.addHook("onClose", async () => {
    await pool.end();
  });
  await app.register(swagger, {
    mode: "static",
    specification: {
      document: openApiDocument,
    },
  });
  await app.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: {
      docExpansion: "list",
      deepLinking: true,
    },
    staticCSP: true,
  });
  await app.register(fastifyStatic, {
    root: options.publicDirectory ?? path.resolve("public"),
    prefix: "/",
    index: ["index.html"],
    decorateReply: true,
  });
  await app.register(async (api: FastifyInstance) => {
    api.addHook("preHandler", apiKeyAuth(config.apiKey));
    await registerSlotsRoutes(api, slots);
    await registerBookingsRoutes(api, bookings);
  });
  await registerWebProxyRoutes(app, config.apiKey, slots, bookings);

  return app;
}
