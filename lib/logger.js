function normalizeError(error) {
  if (!error) return null;

  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack,
      status: typeof error.status === "number" ? error.status : undefined,
      code: error.code,
    };
  }

  if (typeof error === "object") {
    return error;
  }

  return { message: String(error) };
}

function buildPayload(module, action, error, details) {
  return {
    module,
    action,
    error: normalizeError(error),
    ...(details && typeof details === "object" ? { details } : {}),
  };
}

export function logError(module, action, error, details) {
  console.error(`[${module}] ${action}`, buildPayload(module, action, error, details));
}

export function logWarn(module, action, error, details) {
  console.warn(`[${module}] ${action}`, buildPayload(module, action, error, details));
}
