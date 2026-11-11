import { Buffer } from "node:buffer";
import { z } from "zod";
import { BadRequestError } from "../errors/app-error.js";

const cursorPayloadSchema = z.object({
  created_at: z.iso.datetime({ offset: true }),
  id: z.string().min(1),
}).strict();

export type BookingCursor = z.infer<typeof cursorPayloadSchema>;

export function encodeCursor(cursor: BookingCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export function decodeCursor(value: string | undefined): BookingCursor | undefined {
  if (value === undefined) {
    return undefined;
  }

  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    const result = cursorPayloadSchema.safeParse(JSON.parse(decoded));
    if (result.success) {
      return result.data;
    }
  } catch {
    // The cursor is untrusted input; return the contract's standard validation error.
  }
  throw new BadRequestError("Invalid cursor");
}
