import { app } from "./app.js";
import { connectDatabase } from "./config/database.js";
import { env } from "./config/env.js";
import { markInterruptedAiJobsFailed } from "./controllers/ai-generation.controller.js";

try {
  await connectDatabase();
  await markInterruptedAiJobsFailed();
  app.listen(env.PORT, () => {
    console.info(`LearnGate API listening on port ${env.PORT}`);
  });
} catch (error) {
  console.error("LearnGate failed to start. Verify MONGODB_URI and database availability.");
  console.error(error instanceof Error ? error.message : "Unknown startup error");
  process.exitCode = 1;
}
