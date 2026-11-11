import { z } from "zod";
import { BadRequestError } from "../errors/app-error.js";

export function parseInput<T extends z.ZodType>(
  schema: T,
  input: unknown,
): z.output<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".") || "request"}: ${issue.message}`)
      .join("; ");
    throw new BadRequestError(`Invalid request: ${details}`);
  }
  return result.data;
}
