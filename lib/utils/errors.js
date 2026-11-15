export function errorMessage(error) {
    if (error instanceof Error)
        return error.message;
    if (error && typeof error === 'object') {
        const message = 'message' in error ? error.message : 'msg' in error ? error.msg : undefined;
        if (typeof message === 'string') {
            const code = errorCode(error);
            return typeof code === 'string' || typeof code === 'number'
                ? `${message} (code=${code})`
                : message;
        }
        try {
            return JSON.stringify(error) ?? String(error);
        }
        catch {
            return String(error);
        }
    }
    return String(error);
}
export function errorCode(error) {
    return error && typeof error === 'object' && 'code' in error ? error.code : undefined;
}
export function errorStatus(error) {
    return error && typeof error === 'object' && 'status' in error && typeof error.status === 'number'
        ? error.status
        : 502;
}
