import { track } from "@vercel/analytics";

type AppEventProperties = Record<string, string | number | boolean>;

export function trackAppEvent(name: string, properties?: AppEventProperties) {
  try {
    track(name, properties);
  } catch {
    return;
  }
}
