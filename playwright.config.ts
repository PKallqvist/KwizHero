import { defineConfig, devices } from "@playwright/test";

const PORT = 5183;
const AUTH_EMULATOR_PORT = 9099;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      // Auth-only: Firestore/Functions are intentionally NOT emulated (no Java on this
      // machine for the Firestore emulator). Tests must stay within sign-in/sign-up flows
      // and UI that doesn't persist to Firestore — see src/platform/firebase/firebase.ts.
      command: "firebase emulators:start --only auth --project demo-kwizhero-e2e",
      url: `http://127.0.0.1:${AUTH_EMULATOR_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      stdout: "pipe",
    },
    {
      command: `npm run dev -- --port ${PORT} --strictPort --host 127.0.0.1`,
      url: `http://127.0.0.1:${PORT}`,
      env: { VITE_USE_FIREBASE_EMULATORS: "true" },
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      stdout: "pipe",
    },
  ],
});
