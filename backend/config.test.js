import assert from "node:assert/strict";
import { test } from "node:test";
import { corsOrigins, serverHost, validateRuntimeConfig } from "./src/config.js";

test("production refuses to start without database and CORS origin", () => {
  assert.throws(
    () => validateRuntimeConfig({ NODE_ENV: "production" }),
    /DATABASE_URL/
  );
  assert.throws(
    () =>
      validateRuntimeConfig({
        NODE_ENV: "production",
        DATABASE_URL: "postgres://example"
      }),
    /CORS_ORIGIN/
  );
});

test("runtime config keeps Render-compatible host and restricted origins", () => {
  assert.equal(serverHost({}), "0.0.0.0");
  assert.deepEqual(
    corsOrigins({
      NODE_ENV: "production",
      CORS_ORIGIN: "https://app.example.com"
    }),
    ["https://app.example.com"]
  );
});
