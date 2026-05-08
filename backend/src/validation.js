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
  if (password.length < 8) {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "Password must be at least 8 characters",
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
