export function isRecoverableStorageReadError(
  error: unknown,
): error is Error | DOMException {
  return error instanceof Error || error instanceof DOMException;
}

export function isRecoverableStorageWriteError(
  error: unknown,
): error is Error | DOMException {
  return error instanceof Error || error instanceof DOMException;
}

export function isRecoverableClipboardWriteError(
  error: unknown,
): error is Error | DOMException {
  return error instanceof Error || error instanceof DOMException;
}
