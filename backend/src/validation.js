import { ApiError } from "./apiError.js";

export function requireObjectBody(body, field = "body") {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError(400, "VALIDATION_ERROR", `${field} must be an object`, field);
  }

  return body;
}

export function requirePositiveId(value, field = "id") {
  const text = String(value || "");
  if (!/^\d+$/.test(text) || Number(text) <= 0) {
    throw new ApiError(400, "VALIDATION_ERROR", `${field} must be a positive integer`, field);
  }

  return text;
}

export function validateTaxProfileQuery(query = {}) {
  const allowedFields = new Set([
    "countryId",
    "countryCode",
    "code",
    "companyTypeId",
    "companyTypeName"
  ]);

  for (const field of Object.keys(query)) {
    if (!allowedFields.has(field)) {
      throw new ApiError(400, "VALIDATION_ERROR", `${field} is not supported`, field);
    }
  }

  if (query.countryId !== undefined) requirePositiveId(query.countryId, "countryId");
  if (query.companyTypeId !== undefined) {
    requirePositiveId(query.companyTypeId, "companyTypeId");
  }

  return query;
}

export function validateCalculationPayload(body) {
  const payload = requireObjectBody(body);

  if (payload.input !== undefined) requireObjectBody(payload.input, "input");
  if (payload.taxProfile !== undefined) requireObjectBody(payload.taxProfile, "taxProfile");
  if (payload.periods !== undefined && !Array.isArray(payload.periods)) {
    throw new ApiError(400, "VALIDATION_ERROR", "periods must be an array", "periods");
  }
  if (payload.vehicleGroups !== undefined && !Array.isArray(payload.vehicleGroups)) {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "vehicleGroups must be an array",
      "vehicleGroups"
    );
  }

  return payload;
}

export function validateAgentAnalysisPayload(body) {
  const payload = requireObjectBody(body);
  const agent = String(payload.agent || "cost-intelligence").trim();
  const allowedAgents = new Set(["cost-intelligence", "history-visual"]);

  if (!allowedAgents.has(agent)) {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "agent must be cost-intelligence or history-visual",
      "agent"
    );
  }

  const question = String(
    payload.question || "Explain this transport break-even result."
  ).trim();

  if (question.length > 2000) {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "question must be 2000 characters or fewer",
      "question"
    );
  }

  const calculationRunId =
    payload.calculationRunId == null || payload.calculationRunId === ""
      ? null
      : requirePositiveId(payload.calculationRunId, "calculationRunId");

  if (payload.inputs !== undefined) requireObjectBody(payload.inputs, "inputs");
  if (payload.outputs !== undefined) requireObjectBody(payload.outputs, "outputs");

  return {
    agent,
    question,
    calculationRunId,
    vehicleCode: String(payload.vehicleCode || "").trim() || null,
    inputs: payload.inputs || {},
    outputs: payload.outputs || {}
  };
}

export function validateUserCreatePayload(body) {
  const payload = requireObjectBody(body);
  return validateUserPayload(payload);
}

export function validateFirstAdminSetupPayload(body) {
  const payload = validateUserPayload(requireObjectBody(body));
  const workspaceName = String(body.workspaceName || "").trim();

  if (!workspaceName) {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "Workspace name is required",
      "workspaceName"
    );
  }

  return {
    ...payload,
    role: "admin",
    workspaceName
  };
}

function validateUserPayload(payload) {
  const email = normalizeEmail(payload.email);
  const password = String(payload.password || "");

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError(400, "VALIDATION_ERROR", "A valid email is required", "email");
  }
  const passwordErrors = passwordValidationErrors(password);
  if (passwordErrors.length > 0) {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      `Password must ${passwordErrors.join(", ")}`,
      "password"
    );
  }

  const role = payload.role === "admin" ? "admin" : "member";

  return {
    email,
    name: String(payload.name || email).trim(),
    password,
    role
  };
}

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function passwordValidationErrors(password) {
  const checks = [
    [password.length >= 12, "be at least 12 characters"],
    [/[a-z]/.test(password), "include a lowercase letter"],
    [/[A-Z]/.test(password), "include an uppercase letter"],
    [/\d/.test(password), "include a number"],
    [/[^A-Za-z0-9\s]/.test(password), "include a symbol"],
    [!/\s/.test(password), "not contain spaces"]
  ];

  return checks
    .filter(([isValid]) => !isValid)
    .map(([, message]) => message);
}
