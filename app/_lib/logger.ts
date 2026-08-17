type LogLevel = "error" | "warn";

export type LogFields = Record<string, string | number | boolean | null | undefined>;

export type LogEvent = {
  event: string;
  fields?: LogFields;
};

function writeLog(level: LogLevel, { event, fields = {} }: LogEvent) {
  // `event` last, so a caller cannot rename the event by passing a field called `event`.
  console[level]({
    ...fields,
    event,
  });
}

/**
 * An event name plus scalar fields, and deliberately nothing else.
 *
 * `error` used to accept a second `unknown` argument and hand it straight to `console.error`. No
 * caller ever passed one, so it logged nothing this app produced -- but it stood as a supported way
 * to log a raw upstream error object, which is the one thing this module exists to prevent: an
 * Octokit error carries the request URL, and the search URL carries the username. Callers extract
 * the scalars they need (`status`, `errorKind`) and log those, so the parameter had no use that the
 * sanitizing rule permits.
 */
export const logger = {
  warn(logEvent: LogEvent) {
    writeLog("warn", logEvent);
  },
  error(logEvent: LogEvent) {
    writeLog("error", logEvent);
  },
};
