"use client";

import dynamic from "next/dynamic";
import { useCinematicStore } from "@/store/cinematic";

const CinematicBackground = dynamic(
  () => import("./three-background").then((m) => m.ThreeBackground),
  { ssr: false }
);

export function SiteBackground() {
  const glowIntensity = useCinematicStore((s) => s.glowIntensity);

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 opacity-80">
      <CinematicBackground glowIntensity={glowIntensity} />
    </div>
  );
}
