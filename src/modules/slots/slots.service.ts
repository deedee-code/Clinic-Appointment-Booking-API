import type { ListSlotsQuery, ResetSlotsInput } from "./slots.schema.js";
import { SlotsRepository } from "./slots.repository.js";

export class SlotsService {
  constructor(private readonly repository: SlotsRepository) {}

  list(query: ListSlotsQuery) {
    return this.repository.list(query);
  }

  replace(input: ResetSlotsInput): Promise<void> {
    return this.repository.replace(input);
  }
}
