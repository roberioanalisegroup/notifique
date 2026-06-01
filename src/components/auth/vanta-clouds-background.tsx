"use client";

import { useTheme } from "@/components/theme-provider";
import { useEffect, useRef } from "react";
import * as THREE from "three";

type VantaEffect = {
  destroy: () => void;
  setOptions: (opts: Record<string, unknown>) => void;
};

const LIGHT = {
  skyColor: 0x5ca6ca,
  cloudColor: 0x334d80,
  backgroundColor: 0x87b8d4,
} as const;

const DARK = {
  skyColor: 0x1a3a52,
  cloudColor: 0x0f1f3d,
  backgroundColor: 0x0a0a0c,
} as const;

function shouldSkipEffect(): boolean {
  if (typeof window === "undefined") return true;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return true;
  return (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    ) || window.innerWidth < 768
  );
}

export function VantaCloudsBackground() {
  const containerRef = useRef<HTMLDivElement>(null);
  const effectRef = useRef<VantaEffect | null>(null);
  const { resolved } = useTheme();

  useEffect(() => {
    const el = containerRef.current;
    if (!el || shouldSkipEffect()) return;

    let cancelled = false;
    const palette = resolved === "dark" ? DARK : LIGHT;

    void (async () => {
      if (effectRef.current) {
        effectRef.current.setOptions(palette);
        return;
      }
      const VANTA = (await import("vanta/dist/vanta.clouds2.min")).default;
      if (cancelled || !containerRef.current) return;

      effectRef.current = VANTA({
        el: containerRef.current,
        THREE,
        mouseControls: true,
        touchControls: true,
        gyroControls: false,
        minHeight: 200,
        minWidth: 200,
        speed: 1,
        scale: 1,
        scaleMobile: 4,
        texturePath: "/vanta/noise.png",
        ...palette,
      }) as VantaEffect;
    })();

    return () => {
      cancelled = true;
    };
  }, [resolved]);

  useEffect(() => {
    return () => {
      effectRef.current?.destroy();
      effectRef.current = null;
    };
  }, []);

  const fallback =
    resolved === "dark"
      ? "bg-gradient-to-b from-[#1a3a52] to-[#0a0a0c]"
      : "bg-gradient-to-b from-[#5ca6ca] to-[#87b8d4]";

  return (
    <div
      ref={containerRef}
      className={`fixed inset-0 z-0 ${fallback}`}
      aria-hidden="true"
    />
  );
}
