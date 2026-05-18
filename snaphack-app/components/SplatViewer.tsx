"use client";

import { useEffect, useRef } from "react";

interface SplatViewerProps {
  splatUrl: string;
}

export default function SplatViewer({ splatUrl }: SplatViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let viewer: any = null;
    let cancelled = false;

    import("@mkkellogg/gaussian-splats-3d").then((mod) => {
      if (cancelled) return;

      // Package may export as default or named
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const GS: any = (mod as any).default ?? mod;

      viewer = new GS.Viewer({
        rootElement: container,
        selfDrivenMode: true,
        useBuiltInControls: true,
        gpuAcceleratedSort: true,
        sharedMemoryForWorkers: false,
        integerBasedSort: true,
        halfPrecisionCovariancesOnGPU: true,
        dynamicScene: false,
        webXRMode: GS.WebXRMode?.None,
      });

      viewer
        .addSplatScene(splatUrl, {
          splatAlphaRemovalThreshold: 5,
          showLoadingUI: false,
        })
        .then(() => {
          if (!cancelled) viewer.start();
        })
        .catch(console.error);
    });

    return () => {
      cancelled = true;
      try {
        viewer?.stop();
        viewer?.dispose?.();
      } catch {
        // viewer may not be fully initialised — safe to ignore
      }
    };
  }, [splatUrl]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ minHeight: "400px" }}
    />
  );
}
