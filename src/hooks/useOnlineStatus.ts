import { useEffect, useState } from "react";

export function readBrowserOnlineStatus(source: Pick<Navigator, "onLine"> | undefined): boolean {
  return source?.onLine ?? true;
}

export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(() =>
    readBrowserOnlineStatus(typeof navigator === "undefined" ? undefined : navigator),
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return isOnline;
}
