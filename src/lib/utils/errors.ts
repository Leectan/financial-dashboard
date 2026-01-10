/**
 * Custom error classes for better error handling
 */
export class APIError extends Error {
  constructor(message: string, public statusCode: number, public provider: string) {
    super(message)
    this.name = 'APIError'
  }
}

export class CacheError extends Error {
  constructor(message: string, public operation: 'get' | 'set' | 'delete') {
    super(message)
    this.name = 'CacheError'
  }
}

export class ValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

/**
 * Extract user-friendly error message from error object
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'An unknown error occurred'
}

/**
 * Check if error is due to rate limiting
 */
export function isRateLimitError(error: unknown): boolean {
  if (error instanceof APIError) return error.statusCode === 429
  if (error instanceof Error) return error.message.toLowerCase().includes('rate limit')
  return false
}






