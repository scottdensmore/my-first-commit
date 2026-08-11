"use client";

import { Analytics } from "@vercel/analytics/next";
import { redactAnalyticsEvent } from "./home/analytics";

export default function PrivacySafeAnalytics() {
  return <Analytics beforeSend={redactAnalyticsEvent} />;
}
