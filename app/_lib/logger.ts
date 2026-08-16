type LogLevel = "error" | "warn";

export type LogFields = Record<string, string | number | boolean | null | undefined>;

export type LogEvent = {
  event: string;
  fields?: LogFields;
};

function writeLog(level: LogLevel, { event, fields = {} }: LogEvent, error?: unknown) {
  const payload = {
    ...fields,
    event,
  };

  if (error === undefined) {
    console[level](payload);
    return;
  }

  console[level](payload, error);
}

export const logger = {
  warn(logEvent: LogEvent) {
    writeLog("warn", logEvent);
  },
  error(logEvent: LogEvent, error?: unknown) {
    writeLog("error", logEvent, error);
  },
};
