"use client";

import { useEffect } from "react";
import mixpanel from "mixpanel-browser";

const MIXPANEL_TOKEN = "c4c6970ea649d1a205fbf340cdbb97d7";

let hasInitialized = false;

export function MixpanelInit() {
  useEffect(() => {
    if (hasInitialized) return;
    mixpanel.init(MIXPANEL_TOKEN, {
      autocapture: true,
      record_sessions_percent: 100,
    });
    hasInitialized = true;
  }, []);

  return null;
}
