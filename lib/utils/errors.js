export function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
export function errorCode(error) {
    return error && typeof error === 'object' && 'code' in error ? error.code : undefined;
}
export function errorStatus(error) {
    return error && typeof error === 'object' && 'status' in error && typeof error.status === 'number'
        ? error.status
        : 502;
}
