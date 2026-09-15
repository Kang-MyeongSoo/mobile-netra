import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

const POLL_MS = 60 * 1000;
const VISIBILITY_DEBOUNCE_MS = 2 * 1000;
const NAV_DEBOUNCE_MS = 30 * 1000;

const SESSION_KEY = "app-initial-build-id";

export function useUpdateChecker() {
  const pathname = usePathname();
  const initialId = useRef<string | null>(
    typeof sessionStorage !== "undefined" ? sessionStorage.getItem(SESSION_KEY) : null,
  );
  const lastCheck = useRef(0);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  async function check() {
    try {
      const res = await fetch(`/api/build-id?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) return;
      const { buildId } = await res.json() as { buildId: string };
      lastCheck.current = Date.now();
      if (!initialId.current) {
        initialId.current = buildId;
        try { sessionStorage.setItem(SESSION_KEY, buildId); } catch { /* 무시 */ }
      } else if (buildId !== initialId.current) {
        setUpdateAvailable(true);
      }
    } catch {
      // 무시
    }
  }

  useEffect(() => {
    check();
    const interval = setInterval(check, POLL_MS);

    function onVisible() {
      if (document.visibilityState === "visible" && Date.now() - lastCheck.current > VISIBILITY_DEBOUNCE_MS) {
        check();
      }
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (Date.now() - lastCheck.current > NAV_DEBOUNCE_MS) {
      check();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return updateAvailable;
}
