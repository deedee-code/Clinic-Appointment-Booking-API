import type { FastifyInstance } from "fastify";
import { BookingsController } from "../bookings/bookings.controller.js";
import { SlotsController } from "../slots/slots.controller.js";

export async function registerWebProxyRoutes(
  app: FastifyInstance,
  apiKey: string,
  slots: SlotsController,
  bookings: BookingsController,
): Promise<void> {
  await app.register(async (web) => {
    web.addHook("preHandler", async (request) => {
      request.headers["x-api-key"] = apiKey;
    });

    web.get("/slots", (request, reply) => slots.list(request, reply));
    web.post("/bookings", (request, reply) => bookings.create(request, reply));
    web.get("/bookings", (request, reply) => bookings.list(request, reply));
    web.get("/bookings/:id", (request, reply) => bookings.find(request, reply));
    web.delete("/bookings/:id", (request, reply) => bookings.cancel(request, reply));
  }, { prefix: "/web" });
}
