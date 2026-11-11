import pg from "pg";
import { loadDatabaseUrl } from "../config/env.js";

const providers = ["Dr Ade", "Dr Okafor", "Dr Mensah"];

function futureWeekdays(): Date[] {
  const dates: Date[] = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  for (let offset = 1; offset <= 14; offset += 1) {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() + offset);
    const day = date.getUTCDay();
    if (day !== 0 && day !== 6) {
      dates.push(date);
    }
  }
  return dates;
}

async function seed(): Promise<void> {
  const pool = new pg.Pool({ connectionString: loadDatabaseUrl() });
  let inserted = 0;
  try {
    for (const date of futureWeekdays()) {
      const day = date.toISOString().slice(0, 10).replaceAll("-", "");
      for (let minute = 9 * 60; minute < 16 * 60; minute += 30) {
        const hour = Math.floor(minute / 60);
        const slotMinute = minute % 60;
        const startsAt = new Date(date);
        startsAt.setUTCHours(hour, slotMinute, 0, 0);
        const endsAt = new Date(startsAt.getTime() + 30 * 60_000);
        const id = `seed-${day}-${String(hour).padStart(2, "0")}${String(slotMinute).padStart(2, "0")}`;
        const provider = providers[Math.floor(minute / 30) % providers.length];
        const result = await pool.query(
          `INSERT INTO slots (id, provider, starts_at, ends_at)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (id) DO NOTHING`,
          [id, provider, startsAt, endsAt],
        );
        inserted += result.rowCount ?? 0;
      }
    }
    console.info(`Seeded ${inserted} new appointment slots`);
  } finally {
    await pool.end();
  }
}

seed().catch((error: unknown) => {
  console.error("Database seed failed", error);
  process.exitCode = 1;
});
