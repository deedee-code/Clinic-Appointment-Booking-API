import type { FastifyReply, FastifyRequest } from "fastify";
import { BadRequestError } from "../../errors/app-error.js";
import { parseInput } from "../../utils/validation.js";
import {
  bookingIdParamsSchema,
  createBookingSchema,
  idempotencyKeySchema,
  listBookingsQuerySchema,
} from "./bookings.schema.js";
import { BookingsService } from "./bookings.service.js";

export class BookingsController {
  constructor(private readonly service: BookingsService) {}

  async create(request: FastifyRequest, reply: FastifyReply) {
    const input = parseInput(createBookingSchema, request.body);
    const rawKey = request.headers["idempotency-key"];
    if (Array.isArray(rawKey)) {
      throw new BadRequestError("Idempotency-Key must be a single value");
    }
    const idempotencyKey = rawKey === undefined
      ? undefined
      : parseInput(idempotencyKeySchema, rawKey);
    const apiKey = request.headers["x-api-key"];
    if (typeof apiKey !== "string") {
      throw new BadRequestError("Invalid API key header");
    }
    const result = await this.service.create(input, idempotencyKey, apiKey);
    return reply.code(result.status).send(result.body);
  }

  async find(request: FastifyRequest, reply: FastifyReply) {
    const { id } = parseInput(bookingIdParamsSchema, request.params);
    const booking = await this.service.find(id);
    return reply.send(booking);
  }

  async list(request: FastifyRequest, reply: FastifyReply) {
    const query = parseInput(listBookingsQuerySchema, request.query);
    return reply.send(await this.service.list(query));
  }

  async cancel(request: FastifyRequest, reply: FastifyReply) {
    const { id } = parseInput(bookingIdParamsSchema, request.params);
    return reply.send(await this.service.cancel(id));
  }
}
