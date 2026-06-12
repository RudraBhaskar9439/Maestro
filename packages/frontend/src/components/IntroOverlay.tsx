"use client";

import { useEffect, useState } from "react";

/**
 * Full-screen splash that plays once when the page loads, then fades out.
 * Rendered on the server too, so the very first paint is the splash (no content flash).
 * Click anywhere to skip.
 */
export function IntroOverlay() {
  const [phase, setPhase] = useState<"show" | "leaving" | "done">("show");

  useEffect(() => {
    const leave = setTimeout(() => setPhase("leaving"), 2200);
    const done = setTimeout(() => setPhase("done"), 2900);
    return () => {
      clearTimeout(leave);
      clearTimeout(done);
    };
  }, []);

  if (phase === "done") return null;

  return (
    <div
      className={`intro-overlay ${phase === "leaving" ? "intro-leaving" : ""}`}
      onClick={() => setPhase("leaving")}
      role="presentation"
    >
      <div className="intro-glow" aria-hidden />
      <div className="intro-content">
        <div className="intro-logo">
          <span className="intro-diamond">◆</span>
          <span className="intro-word gradient-text">MAESTRO</span>
        </div>
        <p className="intro-tag">Auction-Managed AMM · Autonomous Cross-Chain Manager</p>
        <div className="intro-bar" aria-hidden>
          <span />
        </div>
        <p className="intro-skip">click to enter</p>
      </div>
    </div>
  );
}
