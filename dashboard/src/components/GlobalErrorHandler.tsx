"use client";

import { useEffect } from "react";

export default function GlobalErrorHandler() {
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      console.error("[GlobalErrorHandler]", event.error || event.message);
    };
    const handleRejection = (event: PromiseRejectionEvent) => {
      console.error("[GlobalErrorHandler] Unhandled rejection:", event.reason);
    };
    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);
    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  return null;
}
