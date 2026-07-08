"use client";

/**
 * Live camera QR scanner for the check-in desk.
 * Uses the built-in BarcodeDetector API (Chrome / Edge / Android).
 * On browsers without it (e.g. iOS Safari), scan with the phone camera app
 * instead — the QR opens the ticket page directly.
 */
import { useEffect, useRef, useState } from "react";

type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
};

export default function QrScanner({ onScan }: { onScan: (value: string) => void }) {
  const [active, setActive] = useState(false);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastValue = useRef("");

  useEffect(() => {
    setSupported("BarcodeDetector" in window);
  }, []);

  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let stopped = false;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();

        const Detector = (window as unknown as { BarcodeDetector: new (o: { formats: string[] }) => BarcodeDetectorLike }).BarcodeDetector;
        const detector = new Detector({ formats: ["qr_code"] });

        const tick = async () => {
          if (stopped) return;
          try {
            if (video.readyState >= 2) {
              const codes = await detector.detect(video);
              if (codes.length > 0) {
                const v = codes[0].rawValue;
                if (v && v !== lastValue.current) {
                  lastValue.current = v;
                  if (navigator.vibrate) navigator.vibrate(80);
                  onScan(v);
                  setTimeout(() => (lastValue.current = ""), 2500); // allow rescan after 2.5s
                }
              }
            }
          } catch {
            /* detection hiccup — keep scanning */
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch {
        setError("Camera unavailable — allow camera access, or scan with your phone's camera app instead.");
        setActive(false);
      }
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [active, onScan]);

  if (supported === false) {
    return (
      <p className="text-xs rounded-xl px-4 py-3 mb-4" style={{ background: "var(--accent-soft)", color: "var(--ink-soft)" }}>
        📷 This browser can&apos;t scan in-page — just point the phone&apos;s <strong>camera app</strong> at any ticket QR:
        it opens the ticket page with a check-in button.
      </p>
    );
  }

  return (
    <div className="mb-5">
      {!active ? (
        <button className="btn-secondary w-full justify-center !py-3" onClick={() => setActive(true)}>
          📷 Scan tickets with camera
        </button>
      ) : (
        <div className="relative rounded-2xl overflow-hidden" style={{ boxShadow: "var(--shadow)" }}>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video ref={videoRef} className="w-full aspect-[4/3] object-cover bg-black" playsInline muted />
          {/* aim frame */}
          <div className="absolute inset-0 grid place-items-center pointer-events-none">
            <div className="w-48 h-48 rounded-2xl" style={{ border: "3px solid var(--marigold-bright)", boxShadow: "0 0 0 2000px rgba(0,0,0,0.25)" }} />
          </div>
          <button
            className="absolute top-3 right-3 rounded-full px-4 py-2 text-sm font-bold"
            style={{ background: "var(--sindoor)", color: "var(--cream)" }}
            onClick={() => setActive(false)}
          >
            ✕ Stop
          </button>
        </div>
      )}
      {error && (
        <p className="text-xs mt-2 font-medium" style={{ color: "var(--sindoor)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
