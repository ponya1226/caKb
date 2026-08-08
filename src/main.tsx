import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { hasEntryScriptChanged } from "./lib/appUpdate";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>,
);

async function checkForAppUpdate(): Promise<void> {
  const currentScriptUrl = document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.src;
  if (!currentScriptUrl) {
    return;
  }

  try {
    const appUrl = new URL(import.meta.env.BASE_URL, document.baseURI).href;
    const response = await fetch(appUrl, { cache: "no-store", headers: { Accept: "text/html" } });
    if (!response.ok) {
      return;
    }

    if (hasEntryScriptChanged(currentScriptUrl, await response.text(), appUrl)) {
      window.dispatchEvent(new Event("cakb:update-available"));
    }
  } catch {
    // オフライン時の更新確認失敗は、現在のアプリ利用を妨げない。
  }
}

if (import.meta.env.PROD) {
  window.addEventListener("load", () => {
    let isChecking = false;
    const requestUpdateCheck = () => {
      if (isChecking) {
        return;
      }

      isChecking = true;
      void checkForAppUpdate().finally(() => {
        isChecking = false;
      });
    };

    requestUpdateCheck();
    window.addEventListener("focus", requestUpdateCheck);
    window.setInterval(requestUpdateCheck, 5 * 60 * 1000);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        requestUpdateCheck();
      }
    });

    if (!("serviceWorker" in navigator)) {
      return;
    }

    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: "none" })
      .then((registration) => {
        const announceUpdate = () => window.dispatchEvent(new Event("cakb:update-available"));

        if (registration.waiting) {
          announceUpdate();
        }

        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          worker?.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              announceUpdate();
            }
          });
        });

        void registration.update();
      })
      .catch(() => {
        // PWA登録失敗はアプリ本体の利用を妨げない。
      });
  });
}
