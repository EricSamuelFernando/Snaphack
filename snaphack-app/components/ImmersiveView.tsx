"use client";

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { Property } from "@/types";

const PanoViewer = dynamic(() => import("@/components/PanoViewer"), { ssr: false });
const WorldViewer = dynamic(() => import("@/components/WorldViewer"), { ssr: false });

interface ImmersiveViewProps {
  property: Property;
}

type DepthState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; depthMapUrl: string }
  | { status: "error"; message: string };

type VideoState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "polling"; requestId: string; statusUrl: string | null; elapsed: number }
  | { status: "ready"; videoUrl: string }
  | { status: "error"; message: string };

type MarbleState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "polling"; operationId: string; elapsed: number }
  | { status: "ready"; splatUrl: string | null; panoUrl: string | null; metricScaleFactor: number; groundPlaneOffset: number }
  | { status: "error"; message: string };

interface WorldEntry {
  worldId: string;
  displayName: string;
  createdAt: string | null;
  thumbnailUrl: string | null;
}

// ─── WebGL shaders ────────────────────────────────────────────────────────────

const VERT_SRC = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = vec2(a_position.x * 0.5 + 0.5, 0.5 - a_position.y * 0.5);
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

// Reads depth (0=far, 1=near) and displaces UV coords so close surfaces
// shift more than distant ones, producing a parallax illusion.
// 8% zoom-in gives the edges headroom so displaced UVs don't sample outside [0,1].
const FRAG_SRC = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_photo;
uniform sampler2D u_depth;
uniform vec2 u_offset;
void main() {
  vec2 uv = (v_uv - 0.5) * 0.92 + 0.5;
  float depth = texture2D(u_depth, uv).r;
  vec2 displaced = uv - u_offset * depth;
  gl_FragColor = texture2D(u_photo, clamp(displaced, 0.0, 1.0));
}`;

// ─── Helpers (module-level, no closures) ─────────────────────────────────────

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function buildProgram(
  gl: WebGLRenderingContext,
  vertSrc: string,
  fragSrc: string
): WebGLProgram | null {
  const compile = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, vertSrc));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fragSrc));
  gl.linkProgram(prog);
  return gl.getProgramParameter(prog, gl.LINK_STATUS) ? prog : null;
}

function bindTexture(
  gl: WebGLRenderingContext,
  prog: WebGLProgram,
  img: HTMLImageElement,
  name: string,
  unit: number
) {
  gl.activeTexture(gl.TEXTURE0 + unit);
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.uniform1i(gl.getUniformLocation(prog, name), unit);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ImmersiveView({ property }: ImmersiveViewProps) {
  const [selectedPhoto, setSelectedPhoto] = useState(
    property.primaryPhoto ?? property.photos[0] ?? ""
  );
  const [activeView, setActiveView] = useState<"living" | "walkthrough" | "world">("living");
  const [depthState, setDepthState] = useState<DepthState>({ status: "idle" });
  const [videoState, setVideoState] = useState<VideoState>({ status: "idle" });
  const [marbleState, setMarbleState] = useState<MarbleState>({ status: "idle" });
  const [canvasAspect, setCanvasAspect] = useState<number | null>(null);
  const [worlds, setWorlds] = useState<WorldEntry[]>([]);
  const [worldsLoading, setWorldsLoading] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mouseRef = useRef({ x: 0, y: 0, active: false });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const marblePollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-fetch depth map whenever the selected photo changes
  useEffect(() => {
    setDepthState({ status: "loading" });
    setVideoState({ status: "idle" });
    setMarbleState({ status: "idle" });
    setCanvasAspect(null);

    fetch("/api/depth-map", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl: selectedPhoto }),
    })
      .then((r) => r.json())
      .then((data: { depthMapUrl?: string; error?: string }) => {
        if (data.depthMapUrl) {
          setDepthState({ status: "ready", depthMapUrl: data.depthMapUrl });
        } else {
          setDepthState({ status: "error", message: data.error ?? "Depth model failed" });
        }
      })
      .catch((err: Error) => setDepthState({ status: "error", message: err.message }));
  }, [selectedPhoto]);

  // Spin up the WebGL parallax once the depth map URL is ready
  useEffect(() => {
    if (depthState.status !== "ready") return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const gl = canvas.getContext("webgl");
    if (!gl) return;

    let cancelled = false;
    let rafId = 0;

    const proxyPhoto = `/api/proxy-image?url=${encodeURIComponent(selectedPhoto)}`;
    const proxyDepth = `/api/proxy-image?url=${encodeURIComponent(depthState.depthMapUrl)}`;

    Promise.all([loadImg(proxyPhoto), loadImg(proxyDepth)]).then(([photoImg, depthImg]) => {
      if (cancelled) return;

      const w = container.offsetWidth;
      const aspect = photoImg.naturalWidth / photoImg.naturalHeight;
      const h = Math.round(w / aspect);

      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      setCanvasAspect(aspect);

      const prog = buildProgram(gl, VERT_SRC, FRAG_SRC);
      if (!prog) return;
      gl.useProgram(prog);

      // Full-screen quad
      const buf = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
        gl.STATIC_DRAW
      );
      const aPos = gl.getAttribLocation(prog, "a_position");
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

      bindTexture(gl, prog, photoImg, "u_photo", 0);
      bindTexture(gl, prog, depthImg, "u_depth", 1);

      const uOffset = gl.getUniformLocation(prog, "u_offset");
      let t = 0;

      const draw = () => {
        if (cancelled) return;
        t += 0.007;
        // Mouse overrides auto-animation; auto-animation gives life to the photo
        // on touch/no-hover devices
        const ox = mouseRef.current.active
          ? mouseRef.current.x * 0.035
          : Math.sin(t) * 0.02;
        const oy = mouseRef.current.active
          ? mouseRef.current.y * 0.018
          : Math.cos(t * 0.65) * 0.01;
        gl.uniform2f(uOffset, ox, oy);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        rafId = requestAnimationFrame(draw);
      };
      draw();
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [depthState, selectedPhoto]);

  // Stop polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (marblePollRef.current) clearInterval(marblePollRef.current);
    };
  }, []);

  function handleSelectPhoto(photo: string) {
    if (photo === selectedPhoto) return;
    if (pollRef.current) clearInterval(pollRef.current);
    if (marblePollRef.current) clearInterval(marblePollRef.current);
    setSelectedPhoto(photo);
  }

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    mouseRef.current = {
      x: ((e.clientX - rect.left) / rect.width - 0.5) * 2,
      y: -((e.clientY - rect.top) / rect.height - 0.5) * 2,
      active: true,
    };
  }

  function handleMouseLeave() {
    mouseRef.current = { x: 0, y: 0, active: false };
  }

  async function handleGenerateVideo() {
    setVideoState({ status: "submitting" });
    try {
      const res = await fetch("/api/dolly-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: selectedPhoto }),
      });
      const data = (await res.json()) as { requestId?: string; statusUrl?: string | null; error?: string };
      if (!res.ok || !data.requestId) {
        setVideoState({ status: "error", message: data.error ?? "Submission failed" });
        return;
      }
      setVideoState({ status: "polling", requestId: data.requestId, statusUrl: data.statusUrl ?? null, elapsed: 0 });
      startPolling(data.requestId, data.statusUrl ?? null);
    } catch {
      setVideoState({ status: "error", message: "Network error" });
    }
  }

  function startPolling(requestId: string, statusUrl: string | null = null) {
    let elapsed = 0;
    const MAX_WAIT = 180; // 3 min — abort after this
    pollRef.current = setInterval(async () => {
      elapsed += 4;
      setVideoState((s) => (s.status === "polling" ? { ...s, elapsed } : s));

      if (elapsed > MAX_WAIT) {
        clearInterval(pollRef.current!);
        setVideoState({ status: "error", message: "Timed out after 3 minutes — try again or use a different photo." });
        return;
      }

      try {
        const qs = new URLSearchParams({ id: requestId });
        if (statusUrl) qs.set("statusUrl", statusUrl);
        const res = await fetch(`/api/dolly-video/status?${qs}`);
        const data = (await res.json()) as {
          status: string;
          videoUrl?: string;
          error?: string;
        };
        if (data.status === "COMPLETED" && data.videoUrl) {
          clearInterval(pollRef.current!);
          setVideoState({ status: "ready", videoUrl: data.videoUrl });
          try {
            const entry = {
              id: `${Date.now()}`,
              videoUrl: data.videoUrl,
              propertyAddress: property.address,
              city: property.city,
              state: property.state,
              photoUrl: selectedPhoto,
              createdAt: new Date().toISOString(),
            };
            const prev = JSON.parse(localStorage.getItem("snaphack_walkthroughs") ?? "[]");
            localStorage.setItem("snaphack_walkthroughs", JSON.stringify([entry, ...prev].slice(0, 50)));
          } catch { /* localStorage unavailable */ }
        } else if (data.status === "FAILED") {
          clearInterval(pollRef.current!);
          setVideoState({ status: "error", message: data.error ?? "Generation failed" });
        }
      } catch {
        // transient error — keep polling
      }
    }, 4000);
  }

  // Fetch worlds list whenever the 3D World tab is opened
  useEffect(() => {
    if (activeView !== "world") return;
    setWorldsLoading(true);
    fetch("/api/marble/worlds")
      .then((r) => r.json())
      .then((d: { worlds?: WorldEntry[]; error?: string }) => {
        if (d.worlds) setWorlds(d.worlds);
      })
      .finally(() => setWorldsLoading(false));
  }, [activeView]);

  async function handleLoadWorld(worldId: string) {
    setMarbleState({ status: "submitting" });
    try {
      const res = await fetch(`/api/marble/world?id=${worldId}`);
      const data = (await res.json()) as { panoUrl?: string | null; splatUrl?: string | null; metricScaleFactor?: number; groundPlaneOffset?: number; error?: string };
      if (!res.ok || data.error) {
        setMarbleState({ status: "error", message: data.error ?? "Failed to load world" });
        return;
      }
      setMarbleState({ status: "ready", panoUrl: data.panoUrl ?? null, splatUrl: data.splatUrl ?? null, metricScaleFactor: data.metricScaleFactor ?? 1, groundPlaneOffset: data.groundPlaneOffset ?? 0 });
    } catch {
      setMarbleState({ status: "error", message: "Network error" });
    }
  }

  async function handleGenerateWorld() {
    setMarbleState({ status: "submitting" });
    try {
      const res = await fetch("/api/marble", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: selectedPhoto,
          displayName: [property.address, property.city, property.state].filter(Boolean).join(", "),
        }),
      });
      const data = (await res.json()) as { operationId?: string; error?: string };
      if (!res.ok || !data.operationId) {
        setMarbleState({ status: "error", message: data.error ?? "Submission failed" });
        return;
      }
      setMarbleState({ status: "polling", operationId: data.operationId, elapsed: 0 });
      startMarblePolling(data.operationId);
    } catch {
      setMarbleState({ status: "error", message: "Network error" });
    }
  }

  function startMarblePolling(operationId: string) {
    let elapsed = 0;
    marblePollRef.current = setInterval(async () => {
      elapsed += 5;
      setMarbleState((s) => (s.status === "polling" ? { ...s, elapsed } : s));
      try {
        const res = await fetch(`/api/marble/status?id=${operationId}`);
        const data = (await res.json()) as {
          status: string;
          splatUrl?: string | null;
          panoUrl?: string | null;
          metricScaleFactor?: number;
          groundPlaneOffset?: number;
          error?: string;
        };
        if (data.status === "COMPLETED") {
          clearInterval(marblePollRef.current!);
          setMarbleState({ status: "ready", splatUrl: data.splatUrl ?? null, panoUrl: data.panoUrl ?? null, metricScaleFactor: data.metricScaleFactor ?? 1, groundPlaneOffset: data.groundPlaneOffset ?? 0 });
        } else if (data.status === "FAILED") {
          clearInterval(marblePollRef.current!);
          setMarbleState({ status: "error", message: data.error ?? "Generation failed" });
        }
      } catch {
        // transient error — keep polling
      }
    }, 5000);
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* Photo strip */}
      {property.photos.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-2 mb-6">
          {property.photos.map((photo, i) => (
            <button
              key={i}
              onClick={() => handleSelectPhoto(photo)}
              className={`relative h-16 w-24 flex-shrink-0 overflow-hidden rounded-lg border-2 transition-all ${
                selectedPhoto === photo
                  ? "border-blue-500"
                  : "border-transparent opacity-60 hover:opacity-100"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {/* Sub-tabs */}
      <div className="flex gap-1 mb-6 rounded-xl bg-gray-100 p-1 w-fit">
        {(["living", "walkthrough", "world"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setActiveView(v)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeView === v
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {v === "living" ? "Living Photo" : v === "walkthrough" ? "Walk-Through" : "3D World"}
          </button>
        ))}
      </div>

      {/* ── Living Photo ── */}
      {activeView === "living" && (
        <div
          ref={containerRef}
          className="relative w-full overflow-hidden rounded-2xl bg-gray-900"
          style={canvasAspect ? { aspectRatio: String(canvasAspect) } : { minHeight: "360px" }}
        >
          {/* Blurred photo shown while depth loads */}
          {depthState.status === "loading" && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selectedPhoto}
                alt=""
                className="absolute inset-0 h-full w-full object-cover opacity-40 blur-sm"
              />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white">
                <svg className="h-10 w-10 animate-spin text-blue-400" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
                </svg>
                <p className="text-sm font-medium">Reading depth…</p>
              </div>
            </>
          )}

          {depthState.status === "error" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-gray-400">
              <p className="text-sm">Depth unavailable</p>
              <p className="text-xs text-gray-500">{depthState.message}</p>
            </div>
          )}

          {/* Canvas — always mounted when depth is loading/ready so the ref is available */}
          {(depthState.status === "loading" || depthState.status === "ready") && (
            <canvas
              ref={canvasRef}
              className={`w-full transition-opacity duration-700 ${
                depthState.status === "ready" ? "opacity-100" : "opacity-0"
              }`}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
            />
          )}

          {depthState.status === "ready" && (
            <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg bg-black/50 px-3 py-1.5 text-xs text-white/80 backdrop-blur-sm">
              Move cursor to explore depth
            </div>
          )}
        </div>
      )}

      {/* ── Walk-Through ── */}
      {activeView === "walkthrough" && (
        <div className="flex flex-col gap-6 lg:flex-row">
          {/* Original */}
          <div className="flex-1">
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-400">
              Room Photo
            </p>
            <div className="h-64 overflow-hidden rounded-2xl bg-gray-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={selectedPhoto} alt="Selected room" className="h-full w-full object-cover" />
            </div>
          </div>

          {/* Video panel */}
          <div className="flex-1">
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-400">
              Walk-Through Video
            </p>
            <div className="relative h-64 overflow-hidden rounded-2xl bg-gray-900 flex items-center justify-center">
              {videoState.status === "idle" && (
                <div className="flex flex-col items-center gap-4 text-center px-6">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10">
                    <svg
                      className="h-8 w-8 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M4 6h8a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2z"
                      />
                    </svg>
                  </div>
                  <p className="text-sm text-white/60">5-second cinematic dolly shot</p>
                  <button
                    onClick={handleGenerateVideo}
                    className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
                  >
                    Generate Walk-Through
                  </button>
                  <p className="text-xs text-white/40">~1–2 minutes</p>
                </div>
              )}

              {(videoState.status === "submitting" || videoState.status === "polling") && (
                <div className="flex flex-col items-center gap-3 text-white">
                  <svg className="h-10 w-10 animate-spin text-blue-400" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
                  </svg>
                  <p className="text-sm font-medium">Generating cinematic shot…</p>
                  {videoState.status === "polling" && (
                    <p className="text-xs text-white/50">{videoState.elapsed}s elapsed</p>
                  )}
                </div>
              )}

              {videoState.status === "error" && (
                <div className="flex flex-col items-center gap-3 px-6 text-center">
                  <p className="text-sm font-semibold text-red-400">Generation failed</p>
                  <p className="text-xs text-white/50">{videoState.message}</p>
                  <button
                    onClick={() => setVideoState({ status: "idle" })}
                    className="rounded-lg bg-gray-700 px-3 py-1.5 text-xs text-white hover:bg-gray-600 transition-colors"
                  >
                    Try Again
                  </button>
                </div>
              )}

              {videoState.status === "ready" && (
                <video
                  src={videoState.videoUrl}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="h-full w-full object-cover"
                />
              )}
            </div>

            {videoState.status === "ready" && (
              <div className="mt-2 flex justify-end gap-2">
                <button
                  onClick={() => setVideoState({ status: "idle" })}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Regenerate
                </button>
                <a
                  href={videoState.videoUrl}
                  download="walkthrough.mp4"
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
                >
                  Download
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 3D World ── */}
      {activeView === "world" && (
        <div className="flex flex-col gap-4">
          {marbleState.status === "idle" && (
            <div className="flex flex-col gap-5">
              {/* History grid */}
              {worldsLoading && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="aspect-video animate-pulse rounded-xl bg-gray-200" />
                  ))}
                </div>
              )}

              {!worldsLoading && worlds.length > 0 && (
                <div>
                  <p className="mb-3 text-sm font-semibold text-gray-700">Previously generated worlds</p>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {worlds.map((w) => (
                      <button
                        key={w.worldId}
                        onClick={() => handleLoadWorld(w.worldId)}
                        className="group relative aspect-video overflow-hidden rounded-xl bg-gray-900 text-left shadow-sm ring-1 ring-gray-200 hover:ring-blue-500 transition-all"
                      >
                        {w.thumbnailUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={w.thumbnailUrl} alt={w.displayName} className="h-full w-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                        ) : (
                          <div className="flex h-full items-center justify-center">
                            <svg className="h-8 w-8 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
                            </svg>
                          </div>
                        )}
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2.5 py-2">
                          <p className="truncate text-xs font-medium text-white">{w.displayName}</p>
                          {w.createdAt && (
                            <p className="text-[10px] text-white/50">
                              {new Date(w.createdAt).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow">Load</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Generate strip */}
              <div className="relative overflow-hidden rounded-2xl bg-gray-900">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={selectedPhoto} alt="Selected room" className="h-48 w-full object-cover opacity-40" />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                  <p className="text-sm text-white/70">Generate new world from this photo</p>
                  <button
                    onClick={handleGenerateWorld}
                    className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors shadow-lg"
                  >
                    + Generate 3D World
                  </button>
                  <p className="text-xs text-white/40">~5 min · uses ~1,500 credits</p>
                </div>
              </div>
            </div>
          )}

          {(marbleState.status === "submitting" || marbleState.status === "polling") && (
            <div className="flex h-80 flex-col items-center justify-center gap-4 rounded-2xl bg-gray-900">
              <div className="relative flex h-20 w-20 items-center justify-center">
                <svg className="absolute h-20 w-20 animate-spin text-blue-500/30" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                </svg>
                <svg className="h-10 w-10 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
                </svg>
              </div>
              <p className="text-sm font-medium text-white">Building your 3D world…</p>
              {marbleState.status === "polling" && (
                <p className="text-xs text-white/40">{marbleState.elapsed}s elapsed</p>
              )}
            </div>
          )}

          {marbleState.status === "error" && (
            <div className="flex h-80 flex-col items-center justify-center gap-3 rounded-2xl bg-gray-900 px-6 text-center">
              <p className="text-sm font-semibold text-red-400">Generation failed</p>
              <p className="text-xs text-white/50">{marbleState.message}</p>
              <button
                onClick={() => setMarbleState({ status: "idle" })}
                className="rounded-lg bg-gray-700 px-3 py-1.5 text-xs text-white hover:bg-gray-600 transition-colors"
              >
                Try Again
              </button>
            </div>
          )}

          {marbleState.status === "ready" && (
            <>
              <div className="overflow-hidden rounded-2xl bg-gray-900" style={{ height: "520px" }}>
                {marbleState.splatUrl ? (
                  <WorldViewer
                    splatUrl={marbleState.splatUrl}
                    metricScaleFactor={marbleState.metricScaleFactor}
                    groundPlaneOffset={marbleState.groundPlaneOffset}
                  />
                ) : marbleState.panoUrl ? (
                  <PanoViewer imageUrl={marbleState.panoUrl} />
                ) : (
                  <div className="flex h-full items-center justify-center text-white/40 text-sm">
                    No viewer available for this world.
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-400">
                  {marbleState.splatUrl
                    ? "WASD move · E/Q up/down · Shift fast · drag look"
                    : "Drag to look around · auto-rotates when idle"}
                </p>
                <button
                  onClick={() => setMarbleState({ status: "idle" })}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Back
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
