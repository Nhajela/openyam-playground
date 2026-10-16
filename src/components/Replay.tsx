"use client";
import ArmViewer from "./ArmViewer";
import type { Playable } from "@/lib/arm/playable";

export default function Replay({ playable, bad }: { playable: Playable; bad?: string[] }) {
  return <ArmViewer playable={playable} badJoints={bad} />;
}
