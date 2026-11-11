import { z } from "zod";

export const createBookingSchema = z.object({
  slot_id: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
}).strict();

export const listBookingsQuerySchema = z.object({
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  limit: z.string().regex(/^\d+$/).default("10").transform(Number).pipe(z.number().int().min(1).max(50)),
  cursor: z.string().min(1).max(1024).optional(),
}).strict();

export const bookingIdParamsSchema = z.object({
  id: z.string().min(1).max(200),
}).strict();

export const idempotencyKeySchema = z.string().trim().min(1).max(255);

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type ListBookingsQuery = z.infer<typeof listBookingsQuerySchema>;
