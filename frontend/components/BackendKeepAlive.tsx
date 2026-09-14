"use client";

import { useEffect } from "react";
import { warmupBackend, startKeepAlive } from "@/lib/api";

export default function BackendKeepAlive() {
  useEffect(() => {
    // 1. Initial warmup ping on app mount
    warmupBackend();

    // 2. Active 40-second interval keep-alive while site is open
    const stopKeepAlive = startKeepAlive();

    // 3. Extra ping whenever user refocuses / switches back to the tab
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        warmupBackend();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stopKeepAlive();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return null;
}
