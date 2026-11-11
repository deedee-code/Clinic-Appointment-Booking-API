import { z } from "zod";

const slotInputSchema = z.object({
  id: z.string().trim().min(1).max(100),
  provider: z.string().trim().min(1).max(200),
  start: z.iso.datetime({ offset: true }),
  end: z.iso.datetime({ offset: true }),
}).strict().refine((slot) => Date.parse(slot.start) < Date.parse(slot.end), {
  message: "start must be earlier than end",
  path: ["end"],
});

export const resetSlotsSchema = z.object({
  slots: z.array(slotInputSchema),
}).strict().superRefine(({ slots }, context) => {
  const seen = new Set<string>();
  for (const slot of slots) {
    if (seen.has(slot.id)) {
      context.addIssue({
        code: "custom",
        message: "slot ids must be unique",
        path: ["slots"],
      });
    }
    seen.add(slot.id);
  }
});

export const listSlotsQuerySchema = z.object({
  provider: z.string().optional(),
}).strict();

export type ResetSlotsInput = z.infer<typeof resetSlotsSchema>;
export type ListSlotsQuery = z.infer<typeof listSlotsQuerySchema>;
