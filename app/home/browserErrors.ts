export function isRecoverableStorageReadError(
  error: unknown,
): error is DOMException | SyntaxError {
  return error instanceof DOMException || error instanceof SyntaxError;
}

export function isRecoverableStorageWriteError(
  error: unknown,
): error is DOMException {
  return error instanceof DOMException;
}

export function isRecoverableClipboardWriteError(
  error: unknown,
): error is DOMException {
  return error instanceof DOMException;
}
