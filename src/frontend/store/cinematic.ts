"use client";

import { create } from "zustand";

type CinematicState = {
  glowIntensity: number;
  setGlowIntensity: (value: number) => void;
};

export const useCinematicStore = create<CinematicState>((set) => ({
  glowIntensity: 0.18,
  setGlowIntensity: (value) =>
    set({
      glowIntensity: Math.max(0.08, Math.min(1, value))
    })
}));
