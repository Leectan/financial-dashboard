/**
 * Execute a function with exponential backoff retry
 */
export async function fetchWithRetry<T>(fetchFn: () => Promise<T>, maxRetries: number = 3, baseDelayMs: number = 1000): Promise<T> {
  let lastError: Error | undefined

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fetchFn()
    } catch (error) {
      lastError = error as Error
      if (attempt < maxRetries - 1) {
        const delay = baseDelayMs * Math.pow(2, attempt)
        console.warn(`Attempt ${attempt + 1}/${maxRetries} failed, retrying in ${delay}ms...`, error)
        await sleep(delay)
      }
    }
  }

  throw lastError || new Error('All retry attempts failed')
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}





