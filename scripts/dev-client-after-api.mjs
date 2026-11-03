import { spawn } from "node:child_process";

const healthUrl = "http://127.0.0.1:5000/api/v1/health";
const startupTimeoutMs = 120_000;
const retryIntervalMs = 500;
const startedAt = Date.now();

console.log("Waiting for the LearnGate API before opening the client...");

while (Date.now() - startedAt < startupTimeoutMs) {
  try {
    const response = await fetch(healthUrl, { signal: AbortSignal.timeout(2_000) });
    if (response.ok) break;
  } catch {
    // The API is expected to refuse connections while MongoDB and the server start.
  }
  await new Promise((resolve) => setTimeout(resolve, retryIntervalMs));
}

if (Date.now() - startedAt >= startupTimeoutMs) {
  console.error("LearnGate API did not become ready within 2 minutes. Check the server output and MongoDB connection.");
  process.exitCode = 1;
} else {
  const client = spawn("npm", ["run", "dev:client"], {
    shell: process.platform === "win32",
    stdio: "inherit",
  });

  const stopClient = () => client.kill("SIGTERM");
  process.once("SIGINT", stopClient);
  process.once("SIGTERM", stopClient);

  client.once("error", (error) => {
    console.error("Unable to start the LearnGate client.", error);
    process.exitCode = 1;
  });
  client.once("exit", (code, signal) => {
    process.exitCode = code ?? (signal ? 1 : 0);
  });
}
