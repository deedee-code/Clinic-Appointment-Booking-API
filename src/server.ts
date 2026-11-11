import { buildApp } from "./app.js";
import { loadConfig } from "./config/env.js";

async function start(): Promise<void> {
  const config = loadConfig();
  const app = await buildApp({ config });
  try {
    await app.listen({ port: config.port, host: "0.0.0.0" });
  } catch (error) {
    app.log.error({ err: error }, "Failed to start server");
    await app.close();
    process.exitCode = 1;
  }
}

start().catch((error: unknown) => {
  console.error("Application startup failed", error);
  process.exitCode = 1;
});
