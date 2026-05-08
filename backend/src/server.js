import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { apiErrorHandler } from "./apiError.js";
import { authenticateRequest, bootstrapAuth, getAuthStatus } from "./auth.js";
import { corsOptions, serverHost, serverPort, validateRuntimeConfig } from "./config.js";
import authRouter from "./routes/auth.js";
import calculationsRouter from "./routes/calculations.js";
import usersRouter from "./routes/users.js";
import { securityHeaders } from "./security.js";

dotenv.config();

const app = express();
const port = serverPort();
const host = serverHost();

validateRuntimeConfig();
await bootstrapAuth();

app.disable("x-powered-by");
app.use(securityHeaders);
app.use(cors(corsOptions()));
app.use(express.json({ limit: "1mb" }));

app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && "body" in error) {
    res.status(400).json({
      error: {
        code: "INVALID_JSON",
        message: "Request body must be valid JSON",
        field: "body"
      }
    });
    return;
  }

  next(error);
});

app.get("/api/health", async (req, res, next) => {
  try {
    const auth = await getAuthStatus();
    res.json({
      ok: true,
      service: "transport-break-even-engine",
      databaseConfigured: Boolean(process.env.DATABASE_URL),
      auth
    });
  } catch (error) {
    next(error);
  }
});

app.use("/api/auth", authRouter);
app.use("/api/users", authenticateRequest, usersRouter);
app.use("/api", authenticateRequest);
app.use("/api", calculationsRouter);

app.get("/", (req, res) => {
  res.send("transport break-even engine backend is running");
});

app.use(apiErrorHandler);

app.listen(port, host, () => {
  console.log(
    `transport break-even engine backend listening on http://${host}:${port}`
  );
});
