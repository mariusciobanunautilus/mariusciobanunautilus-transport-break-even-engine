const developmentOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174"
];

export function validateRuntimeConfig(env = process.env) {
  if (env.NODE_ENV === "production" && !env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required when NODE_ENV=production.");
  }
}

export function serverHost(env = process.env) {
  return env.HOST || "0.0.0.0";
}

export function serverPort(env = process.env) {
  return Number(env.PORT || 10000);
}

export function corsOrigins(env = process.env) {
  const configured = String(env.CORS_ORIGIN || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const renderOrigin = String(env.RENDER_EXTERNAL_URL || "").trim();
  const productionOrigins = renderOrigin
    ? [...configured, renderOrigin]
    : configured;

  if (env.NODE_ENV === "production") {
    return [...new Set(productionOrigins)];
  }

  return [...new Set([...configured, ...developmentOrigins])];
}

export function corsOptions(env = process.env) {
  const allowedOrigins = corsOrigins(env);

  return {
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("CORS origin is not allowed."));
    }
  };
}
