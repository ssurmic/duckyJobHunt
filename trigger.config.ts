import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  // Replace with your Trigger.dev project ref (from https://cloud.trigger.dev)
  project: "proj_YOUR_PROJECT_REF",
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
  maxDuration: 900, // 15 minutes — scraping 6 titles takes ~6-8 min, plus filter/tailor
  build: {
    autoDetectExternal: true,
    extensions: [],
  },
});
