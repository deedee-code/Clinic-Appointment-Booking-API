import type { FastifyReply, FastifyRequest } from "fastify";
import { parseInput } from "../../utils/validation.js";
import { listSlotsQuerySchema, resetSlotsSchema } from "./slots.schema.js";
import { SlotsService } from "./slots.service.js";

export class SlotsController {
  constructor(private readonly service: SlotsService) {}

  async list(request: FastifyRequest, reply: FastifyReply) {
    const query = parseInput(listSlotsQuerySchema, request.query);
    const slots = await this.service.list(query);
    return reply.send({ slots });
  }

  async reset(request: FastifyRequest, reply: FastifyReply) {
    const input = parseInput(resetSlotsSchema, request.body);
    await this.service.replace(input);
    return reply.code(200).send();
  }
}
