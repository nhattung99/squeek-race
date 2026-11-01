"use client";
import { useEffect, useState } from "react";
import { fetchDirectWheel } from "@/lib/direct-wheel";
export function useDirectWheel(enabled: boolean) {
  const [wheel, setWheel] = useState<Awaited<
    ReturnType<typeof fetchDirectWheel>
  > | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let pending = false;
    let controller: AbortController | null = null;
    const poll = async () => {
      if (pending) return;
      pending = true;
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 10000);
      try {
        const result = await fetchDirectWheel(controller.signal);
        if (active) setWheel(result);
      } catch {
        if (active) setWheel(null);
      } finally {
        clearTimeout(timeout);
        pending = false;
      }
    };
    const initial = setTimeout(() => void poll(), 0);
    const timer = setInterval(() => void poll(), 15000);
    return () => {
      active = false;
      controller?.abort();
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [enabled]);
  return enabled ? wheel : null;
}
