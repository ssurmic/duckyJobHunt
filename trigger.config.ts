import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  project: "proj_duckyJobHunt",
  dirs: ["./src/trigger"],
  runtime: "node",
  logLevel: "info",
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 30_000,
      factor: 2,
      randomize: true,
    },
  },
  maxDuration: 300,
  build: {
    autoDetectExternal: true,
    extensions: [],
  },
});
