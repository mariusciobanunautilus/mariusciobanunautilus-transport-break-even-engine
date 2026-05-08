export class ApiError extends Error {
  constructor(status, code, message, field = undefined) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

export function sendApiError(res, error) {
  const status =
    error.status ||
    (error.code === "VALIDATION_ERROR" ? 400 : 500);

  res.status(status).json({
    error: {
      code: error.code || "INTERNAL_ERROR",
      message: error.message || "Unexpected server error",
      field: error.field
    }
  });
}

export function apiErrorHandler(error, req, res, next) {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (!error.status || error.status >= 500) {
    console.error(error);
  }

  sendApiError(res, error);
}
