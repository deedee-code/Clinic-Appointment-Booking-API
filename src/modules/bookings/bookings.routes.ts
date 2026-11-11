import type { FastifyInstance } from "fastify";
import { BookingsController } from "./bookings.controller.js";

export async function registerBookingsRoutes(
  app: FastifyInstance,
  controller: BookingsController,
): Promise<void> {
  app.post("/bookings", (request, reply) => controller.create(request, reply));
  app.get("/bookings", (request, reply) => controller.list(request, reply));
  app.get("/bookings/:id", (request, reply) => controller.find(request, reply));
  app.delete("/bookings/:id", (request, reply) => controller.cancel(request, reply));
}
