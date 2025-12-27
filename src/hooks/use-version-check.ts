"use client";

import { useCallback, useEffect, useState } from "react";

import {
  getClientCommitSha,
  isVersionMismatch,
  LOCAL_DEV_SHA,
  parseVersionResponse,
} from "@/lib/system/version";

const POLLING_INTERVAL_MS = 60_000;

export function useVersionCheck() {
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);

  useEffect(() => {
    const currentVersion = getClientCommitSha();
    if (currentVersion === LOCAL_DEV_SHA) return;

    let isActive = true;

    const checkForUpdate = async () => {
      try {
        const res = await fetch("/api/system/version", { cache: "no-store" });
        if (!res.ok) {
          throw new Error(`Version check failed with status ${res.status}.`);
        }

        const data = parseVersionResponse(await res.json());
        if (isActive && isVersionMismatch({ clientSha: currentVersion, serverSha: data.sha })) {
          setIsUpdateAvailable(true);
        }
      } catch (error) {
        console.error("Failed to check version", error);
      }
    };

    const intervalId = window.setInterval(checkForUpdate, POLLING_INTERVAL_MS);
    window.addEventListener("focus", checkForUpdate);
    void checkForUpdate();

    return () => {
      isActive = false;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", checkForUpdate);
    };
  }, []);

  const reload = useCallback(() => window.location.reload(), []);

  return { isUpdateAvailable, reload };
}
