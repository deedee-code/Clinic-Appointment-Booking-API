import type { FastifyInstance } from "fastify";
import { SlotsController } from "./slots.controller.js";

export async function registerSlotsRoutes(
  app: FastifyInstance,
  controller: SlotsController,
): Promise<void> {
  app.get("/slots", (request, reply) => controller.list(request, reply));
  app.post("/reset", (request, reply) => controller.reset(request, reply));
}
