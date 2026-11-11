import type { AppConfig } from "../../config/env.js";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  RateLimitError,
  UnprocessableEntityError,
} from "../../errors/app-error.js";
import { newId, sha256 } from "../../utils/crypto.js";
import { decodeCursor, encodeCursor } from "../../utils/pagination.js";
import type { CreateBookingInput, ListBookingsQuery } from "./bookings.schema.js";
import { BookingsRepository } from "./bookings.repository.js";

export class BookingsService {
  constructor(
    private readonly repository: BookingsRepository,
    private readonly config: AppConfig,
  ) {}

  async create(
    input: CreateBookingInput,
    idempotencyKey: string | undefined,
    apiKey: string,
  ) {
    const callerHash = sha256(apiKey);
    const fingerprint = sha256(
      JSON.stringify({ method: "POST", path: "/bookings", body: input }),
    );
    if (idempotencyKey !== undefined) {
      const saved = await this.repository.findIdempotent(idempotencyKey, callerHash);
      if (saved !== null) {
        if (saved.fingerprint !== fingerprint) {
          await this.repository.recordAttempt(
            input.email,
            new Date(),
            this.config.rateLimitWindowSeconds,
          );
          throw new UnprocessableEntityError(
            "Idempotency-Key was already used with a different request",
          );
        }
        return saved.response;
      }
    }

    const attempt = await this.repository.recordAttempt(
      input.email,
      new Date(),
      this.config.rateLimitWindowSeconds,
    );
    if (attempt.attempts > this.config.rateLimitMax) {
      throw new RateLimitError(attempt.retryAfterSeconds);
    }

    const outcome = idempotencyKey === undefined
      ? await this.repository.create(input, newId())
      : await this.repository.createIdempotent(
          input,
          newId(),
          idempotencyKey,
          callerHash,
          fingerprint,
        );

    if ("kind" in outcome && outcome.kind === "key_reused") {
      throw new UnprocessableEntityError("Idempotency-Key was already used with a different request");
    }
    if ("kind" in outcome && outcome.kind === "complete") {
      return outcome.response;
    }

    switch (outcome.kind) {
      case "created":
        return { status: 201, body: outcome.booking };
      case "slot_missing":
        throw new NotFoundError("Slot not found");
      case "slot_started":
        throw new BadRequestError("Slot has already started");
      case "slot_booked":
        throw new ConflictError("Slot is already booked");
    }
  }

  async find(id: string) {
    const booking = await this.repository.findById(id);
    if (booking === null) {
      throw new NotFoundError("Booking not found");
    }
    return booking;
  }

  async list(query: ListBookingsQuery) {
    const cursor = decodeCursor(query.cursor);
    const page = await this.repository.listByEmail(query.email, query.limit, cursor);
    return {
      bookings: page.bookings,
      next_cursor: page.nextCursor === null ? null : encodeCursor(page.nextCursor),
    };
  }

  async cancel(id: string) {
    const result = await this.repository.cancel(id);
    if (result === "not_found") {
      throw new NotFoundError("Booking not found");
    }
    if (result === "already_cancelled") {
      throw new ConflictError("Booking is already cancelled");
    }
    const booking = await this.repository.findById(id);
    if (booking === null) {
      throw new NotFoundError("Booking not found");
    }
    return booking;
  }
}
