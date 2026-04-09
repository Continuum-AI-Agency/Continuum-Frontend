// Centralized error classifier for the organic module

export type ClassifiedError = {
  userMessage: string
  severity: "info" | "warning" | "error"
  action: "toast" | "inline" | "banner"
  retryable: boolean
}

export function classifyOrganicError(error: unknown, context: string): ClassifiedError {
  // Handle HTTP response errors
  if (error instanceof Response || (typeof error === "object" && error !== null && "status" in error)) {
    const status = (error as { status: number }).status
    switch (status) {
      case 401:
        return { userMessage: "Session expired. Please sign in again.", severity: "error", action: "toast", retryable: false }
      case 429:
        return { userMessage: "Too many requests. Please wait a moment.", severity: "warning", action: "toast", retryable: true }
      case 500:
      case 502:
      case 503:
        return { userMessage: "Something went wrong. Try again.", severity: "error", action: "toast", retryable: true }
      default:
        return { userMessage: `Request failed (${status}).`, severity: "error", action: "toast", retryable: false }
    }
  }

  // Handle DOMException (quota exceeded)
  if (error instanceof DOMException && error.name === "QuotaExceededError") {
    return { userMessage: "Storage full. Clearing old data...", severity: "warning", action: "toast", retryable: true }
  }

  // Handle network / TypeError errors
  if (error instanceof TypeError && error.message.toLowerCase().includes("fetch")) {
    return { userMessage: "Connection lost. Check your network.", severity: "error", action: "banner", retryable: true }
  }

  // Handle string errors with token/expired keywords
  const errorMessage = error instanceof Error ? error.message : String(error)
  const lower = errorMessage.toLowerCase()
  if (lower.includes("token") && (lower.includes("expired") || lower.includes("invalid"))) {
    return { userMessage: "Instagram connection expired. Reconnect in Settings.", severity: "error", action: "toast", retryable: false }
  }

  // Generic fallback
  return {
    userMessage: `${context}: ${errorMessage || "An unexpected error occurred."}`,
    severity: "error",
    action: "toast",
    retryable: false,
  }
}

export function isRetryableError(error: unknown): boolean {
  return classifyOrganicError(error, "").retryable
}
