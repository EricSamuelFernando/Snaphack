"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Property } from "@/types";

interface FurnitureItem {
  id: string;
  localUrl: string;
  falUrl: string | null;
  bgRemovedUrl: string | null;
  uploading: boolean;
  processingBg: boolean;
}

type EditState =
  | { status: "idle" }
  | { status: "loading"; mode: "edit" | "furnish" }
  | { status: "success"; resultUrl: string; mode: "edit" | "furnish" }
  | { status: "error"; message: string };

const MAX_FURNITURE = 3;

const SUGGESTIONS = [
  "Paint the walls light blue",
  "Add modern minimalist furniture",
  "Golden hour sunset lighting",
  "Marble kitchen countertops",
  "Add lush green plants",
  "Cozy warm lighting",
];

interface Props {
  property: Property;
}

export default function UnifiedEditor({ property }: Props) {
  const [selectedPhoto, setSelectedPhoto] = useState(
    property.primaryPhoto ?? property.photos[0] ?? ""
  );
  const [prompt, setPrompt] = useState("");
  const [furnitureItems, setFurnitureItems] = useState<FurnitureItem[]>([]);
  const [editState, setEditState] = useState<EditState>({ status: "idle" });
  // Cache: only for text-only edits (key = original photo url)
  const [editCache, setEditCache] = useState<Map<string, string>>(new Map());
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  // "Use result as room" for iterative furnishing rounds
  const [roomBase, setRoomBase] = useState<string | null>(null);
  const [clearingRoom, setClearingRoom] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const closeLightbox = useCallback(() => setLightboxUrl(null), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLightbox();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeLightbox]);

  // Restore cached edit when switching photos (text-edit only)
  useEffect(() => {
    setRoomBase(null);
    const cached = editCache.get(selectedPhoto);
    if (cached && furnitureItems.length === 0) {
      setEditState({ status: "success", resultUrl: cached, mode: "edit" });
    } else {
      setEditState({ status: "idle" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPhoto]);

  useEffect(() => {
    return () => {
      furnitureItems.forEach((f) => URL.revokeObjectURL(f.localUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── File upload + bg-remove pipeline ─────────────────────────────────────

  async function uploadToFal(file: File): Promise<string> {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/fal-upload", { method: "POST", body: form });
    const data = (await res.json()) as { url?: string; error?: string };
    if (!res.ok || !data.url) throw new Error(data.error ?? "Upload failed");
    return data.url;
  }

  async function removeBackground(url: string): Promise<string | null> {
    try {
      const res = await fetch("/api/bg-remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: url }),
      });
      const data = (await res.json()) as { imageUrl?: string };
      return data.imageUrl ?? null;
    } catch {
      return null;
    }
  }

  function handleSlotClick(index: number) {
    if (furnitureItems[index]) return;
    if (fileInputRef.current) {
      fileInputRef.current.dataset.slotIndex = String(index);
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const id = `${Date.now()}-${Math.random()}`;
    const localUrl = URL.createObjectURL(file);
    const slotIndex = parseInt(fileInputRef.current?.dataset.slotIndex ?? "0", 10);

    const newItem: FurnitureItem = {
      id, localUrl, falUrl: null, bgRemovedUrl: null,
      uploading: true, processingBg: false,
    };

    setFurnitureItems((prev) => {
      const next = [...prev];
      next[slotIndex] = newItem;
      return next;
    });

    // Reset result when furniture changes
    setEditState({ status: "idle" });

    try {
      const falUrl = await uploadToFal(file);
      setFurnitureItems((prev) =>
        prev.map((f) => f.id === id ? { ...f, falUrl, uploading: false, processingBg: true } : f)
      );
      const bgRemovedUrl = await removeBackground(falUrl);
      setFurnitureItems((prev) =>
        prev.map((f) => f.id === id ? { ...f, bgRemovedUrl, processingBg: false } : f)
      );
    } catch {
      setFurnitureItems((prev) =>
        prev.map((f) => f.id === id ? { ...f, uploading: false, processingBg: false } : f)
      );
    }
  }

  function handleRemoveFurniture(id: string) {
    setFurnitureItems((prev) => {
      const item = prev.find((f) => f.id === id);
      if (item) URL.revokeObjectURL(item.localUrl);
      return prev.filter((f) => f.id !== id);
    });
    setEditState({ status: "idle" });
  }

  // ── Clear room ───────────────────────────────────────────────────────────

  async function handleClearRoom() {
    setClearingRoom(true);
    try {
      const res = await fetch("/api/edit-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: selectedPhoto,
          prompt:
            "Remove all furniture, rugs, curtains, decor, artwork, and personal items. Keep only the walls, floor, ceiling, windows, doors, and permanently fixed elements such as fireplace surround, built-in shelving, and kitchen cabinets. Leave the room completely empty and clean.",
        }),
      });
      const data = (await res.json()) as { editedImageUrl?: string; error?: string };
      if (res.ok && data.editedImageUrl) {
        setRoomBase(data.editedImageUrl);
        setEditState({ status: "idle" });
      }
    } catch {
      // silently fail — user keeps original
    } finally {
      setClearingRoom(false);
    }
  }

  // ── Generate ──────────────────────────────────────────────────────────────

  const hasFurniture = furnitureItems.length > 0;
  const isAnyProcessing = furnitureItems.some((f) => f.uploading || f.processingBg);
  const canGenerate =
    (prompt.trim() || hasFurniture) &&
    !isAnyProcessing &&
    editState.status !== "loading";

  async function handleGenerate(e?: React.FormEvent) {
    e?.preventDefault();
    if (!canGenerate) return;

    const roomUrl = roomBase ?? selectedPhoto;
    const mode: "edit" | "furnish" = hasFurniture ? "furnish" : "edit";
    setEditState({ status: "loading", mode });

    try {
      if (mode === "furnish") {
        const furnitureUrls = furnitureItems
          .map((f) => f.bgRemovedUrl ?? f.falUrl)
          .filter((u): u is string => Boolean(u));

        const res = await fetch("/api/furnish-room", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomImageUrl: roomUrl, furnitureUrls, customPrompt: prompt.trim() || undefined }),
        });
        const data = (await res.json()) as { resultImageUrl?: string; error?: string };
        if (!res.ok || data.error) {
          setEditState({ status: "error", message: data.error ?? "Generation failed" });
          return;
        }
        setEditState({ status: "success", resultUrl: data.resultImageUrl!, mode: "furnish" });
      } else {
        const res = await fetch("/api/edit-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageUrl: roomUrl, prompt: prompt.trim() }),
        });
        const data = (await res.json()) as { editedImageUrl?: string; error?: string };
        if (!res.ok || data.error) {
          setEditState({ status: "error", message: data.error ?? "Edit failed" });
          return;
        }
        // Cache text-only edits
        setEditCache((prev) => new Map(prev).set(selectedPhoto, data.editedImageUrl!));
        setEditState({ status: "success", resultUrl: data.editedImageUrl!, mode: "edit" });
      }
    } catch {
      setEditState({ status: "error", message: "Network error — please try again." });
    }
  }

  function handleReset() {
    setEditCache((prev) => {
      const next = new Map(prev);
      next.delete(selectedPhoto);
      return next;
    });
    setEditState({ status: "idle" });
    setRoomBase(null);
  }

  function handleUseAsRoom() {
    if (editState.status !== "success") return;
    setRoomBase(editState.resultUrl);
    setFurnitureItems([]);
    setEditState({ status: "idle" });
  }

  const isLoading = editState.status === "loading";
  const slots = Array.from({ length: MAX_FURNITURE }, (_, i) => furnitureItems[i] ?? null);

  return (
    <div className="max-w-7xl mx-auto p-6">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Photo strip */}
      {property.photos.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-2 mb-6">
          {property.photos.map((photo, i) => (
            <button
              key={i}
              onClick={() => { setSelectedPhoto(photo); setRoomBase(null); }}
              className={`relative h-16 w-24 flex-shrink-0 overflow-hidden rounded-lg border-2 transition-all ${
                selectedPhoto === photo ? "border-blue-500" : "border-transparent opacity-60 hover:opacity-100"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
              {editCache.has(photo) && (
                <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-green-500 ring-1 ring-white" />
              )}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Left — images */}
        <div className="flex-1 flex flex-col gap-4 sm:flex-row">
          {/* Original / room base */}
          <div className="flex-1">
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-400">
              {roomBase ? "Room base (result)" : "Original"}
            </p>
            <div className="h-64 overflow-hidden rounded-2xl bg-gray-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={roomBase ?? selectedPhoto}
                alt="Room photo"
                className="h-full w-full object-cover"
              />
            </div>
            <div className="mt-1.5 flex items-center gap-3">
              {!roomBase && (
                <button
                  onClick={handleClearRoom}
                  disabled={clearingRoom || isLoading}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50 transition-colors"
                >
                  {clearingRoom ? (
                    <>
                      <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
                      </svg>
                      Clearing…
                    </>
                  ) : (
                    <>
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Clear Room
                    </>
                  )}
                </button>
              )}
              {roomBase && (
                <button
                  onClick={() => { setRoomBase(null); setEditState({ status: "idle" }); }}
                  className="text-xs text-gray-400 hover:text-gray-600 underline"
                >
                  Reset to original
                </button>
              )}
            </div>
          </div>

          {/* Result */}
          <div className="flex-1">
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-400">Result</p>
            <div className="relative h-64 overflow-hidden rounded-2xl bg-gray-100 flex items-center justify-center">
              {editState.status === "idle" && (
                <div className="flex flex-col items-center gap-2 text-gray-400">
                  <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                  <p className="text-sm">Result appears here</p>
                </div>
              )}

              {editState.status === "loading" && (
                <div className="flex flex-col items-center gap-3 text-gray-500">
                  <svg className="h-10 w-10 animate-spin text-blue-500" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
                  </svg>
                  <p className="text-sm font-medium">
                    {editState.mode === "furnish" ? "Furnishing room…" : "Editing image…"}
                  </p>
                  <p className="text-xs text-gray-400">30–60 seconds</p>
                </div>
              )}

              {editState.status === "error" && (
                <div className="flex flex-col items-center gap-3 px-4 text-center">
                  <p className="text-sm font-semibold text-red-500">Failed</p>
                  <p className="text-xs text-gray-500">{editState.message}</p>
                  <button onClick={handleReset} className="rounded-lg bg-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-300">
                    Try Again
                  </button>
                </div>
              )}

              {editState.status === "success" && (
                <>
                  <button onClick={() => setLightboxUrl(editState.resultUrl)} className="h-full w-full cursor-zoom-in">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={editState.resultUrl} alt="Result" className="h-full w-full object-cover" />
                  </button>
                  <div className="absolute bottom-2 right-2 flex gap-1.5">
                    <button onClick={() => setLightboxUrl(editState.resultUrl)} className="rounded-lg bg-black/50 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-black/70 backdrop-blur-sm">Zoom</button>
                    <a href={editState.resultUrl} download="result.jpg" className="rounded-lg bg-black/50 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-black/70 backdrop-blur-sm">Download</a>
                  </div>
                </>
              )}
            </div>

            {editState.status === "success" && editState.mode === "furnish" && (
              <button
                onClick={handleUseAsRoom}
                className="mt-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
              >
                + Continue furnishing
              </button>
            )}
          </div>
        </div>

        {/* Right — controls */}
        <div className="w-full lg:w-96 flex flex-col gap-4">
          {/* Prompt */}
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
            <h3 className="mb-3 text-sm font-semibold text-gray-700">Edit Prompt</h3>
            <form onSubmit={handleGenerate} className="flex flex-col gap-3">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={hasFurniture ? 'Optional: describe additional changes…' : 'Describe what to change… e.g. "paint walls light blue"'}
                rows={3}
                disabled={isLoading}
                className="w-full resize-none rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50"
              />

              {/* Furniture slots */}
              <div>
                <p className="mb-2 text-xs font-medium text-gray-500">
                  Furniture references{" "}
                  <span className="text-gray-400">(optional — upload to place specific items)</span>
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {slots.map((item, i) => (
                    <div key={i} className="relative aspect-square">
                      {item ? (
                        <div className="relative h-full w-full overflow-hidden rounded-xl border border-gray-200 bg-white">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={item.localUrl} alt={`Furniture ${i + 1}`} className="h-full w-full object-cover" />
                          {(item.uploading || item.processingBg) && (
                            <div className="absolute inset-0 flex items-center justify-center bg-white/70">
                              <svg className={`h-4 w-4 animate-spin ${item.processingBg ? "text-amber-500" : "text-blue-500"}`} viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
                              </svg>
                            </div>
                          )}
                          {item.bgRemovedUrl && !item.uploading && !item.processingBg && (
                            <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-green-500 ring-1 ring-white" />
                          )}
                          {!item.uploading && !item.processingBg && (
                            <button
                              onClick={() => handleRemoveFurniture(item.id)}
                              className="absolute top-1 left-1 flex h-4 w-4 items-center justify-center rounded-full bg-black/60 text-white text-[9px] hover:bg-black/80"
                            >✕</button>
                          )}
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleSlotClick(i)}
                          disabled={furnitureItems.length >= MAX_FURNITURE || isLoading}
                          className="h-full w-full rounded-xl border-2 border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50 transition-colors flex flex-col items-center justify-center gap-1 text-gray-400 hover:text-blue-500 disabled:opacity-40"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                          <span className="text-[10px]">Add</span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {isAnyProcessing && (
                  <p className="mt-2 text-xs text-amber-600">
                    {furnitureItems.some(f => f.uploading) ? "Uploading…" : "Removing backgrounds…"}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={!canGenerate}
                className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
                    </svg>
                    {editState.status === "loading" && editState.mode === "furnish" ? "Furnishing…" : "Editing…"}
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                    </svg>
                    {hasFurniture ? "Generate Room" : "Edit Image"}
                  </>
                )}
              </button>
            </form>

            {editState.status === "success" && (
              <button onClick={handleReset} className="mt-2 w-full rounded-xl border border-gray-200 bg-white py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors">
                Clear &amp; Edit Again
              </button>
            )}
          </div>

          {/* Suggestions — only when no furniture */}
          {!hasFurniture && (
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
              <h3 className="mb-3 text-sm font-semibold text-gray-700">Suggestions</h3>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setPrompt(s)}
                    disabled={isLoading}
                    className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 hover:border-blue-500 hover:text-blue-600 hover:bg-blue-50 transition-all disabled:opacity-40"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Lightbox */}
      {lightboxUrl && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4" onClick={closeLightbox}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightboxUrl} alt="Zoomed" className="max-h-full max-w-full rounded-xl object-contain shadow-2xl" onClick={(e) => e.stopPropagation()} />
          <div className="absolute top-4 right-4 flex gap-2">
            <a href={lightboxUrl} download="result.jpg" onClick={(e) => e.stopPropagation()} className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20 backdrop-blur-sm">Download</a>
            <button onClick={closeLightbox} className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20 backdrop-blur-sm">✕ Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
