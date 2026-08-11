import { track } from "@vercel/analytics";
import type { BeforeSendEvent } from "@vercel/analytics/next";

type AppEventProperties = Record<string, string | number | boolean>;

export function redactAnalyticsEvent(event: BeforeSendEvent): BeforeSendEvent {
  const url = new URL(event.url);
  url.searchParams.delete("user");

  return {
    ...event,
    url: url.toString(),
  };
}

export function trackAppEvent(name: string, properties?: AppEventProperties) {
  try {
    track(name, properties);
  } catch {
    return;
  }
}
