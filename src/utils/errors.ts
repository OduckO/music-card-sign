export function errorMessage (error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function errorCode (error: unknown): unknown {
  return error && typeof error === 'object' && 'code' in error ? error.code : undefined
}

export function errorStatus (error: unknown): number {
  return error && typeof error === 'object' && 'status' in error && typeof error.status === 'number'
    ? error.status
    : 502
}
