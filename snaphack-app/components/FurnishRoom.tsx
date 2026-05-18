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

interface FurnishRoomProps {
  property: Property;
}

const DEFAULT_PROMPT =
  "The first image is a room. The remaining images are furniture items with their backgrounds removed. Place each furniture item from those reference images into the room — position them naturally on the floor with correct scale, perspective, and lighting to match the room. Keep the exact appearance of each piece.";

const MAX_FURNITURE = 3; // model accepts max 4 images total (1 room + 3 furniture)

export default function FurnishRoom({ property }: FurnishRoomProps) {
  const [selectedRoom, setSelectedRoom] = useState<string>(
    property.primaryPhoto ?? property.photos[0] ?? ""
  );
  const [furnitureItems, setFurnitureItems] = useState<FurnitureItem[]>([]);
  const [customPrompt, setCustomPrompt] = useState(DEFAULT_PROMPT);
  const [isGenerating, setIsGenerating] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [round, setRound] = useState(1);
  const [roundResults, setRoundResults] = useState<string[]>([]); // URLs of past round results

  const fileInputRef = useRef<HTMLInputElement>(null);

  const closeLightbox = useCallback(() => setLightboxUrl(null), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLightbox();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeLightbox]);

  // Revoke object URLs on unmount to avoid memory leaks
  useEffect(() => {
    return () => {
      furnitureItems.forEach((item) => URL.revokeObjectURL(item.localUrl));
    };
    // intentionally run only on unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function uploadToFal(file: File): Promise<string> {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/fal-upload", { method: "POST", body: form });
    const data = (await res.json()) as { url?: string; error?: string };
    if (!res.ok || data.error || !data.url) {
      throw new Error(data.error ?? "Upload failed");
    }
    return data.url;
  }

  async function removeBackground(imageUrl: string): Promise<string> {
    const res = await fetch("/api/bg-remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl }),
    });
    const data = (await res.json()) as { imageUrl?: string; error?: string };
    if (!res.ok || data.error || !data.imageUrl) {
      throw new Error(data.error ?? "Background removal failed");
    }
    return data.imageUrl;
  }

  function handleSlotClick(index: number) {
    const existing = furnitureItems[index];
    if (existing) return; // slot is filled — don't re-open picker
    if (fileInputRef.current) {
      fileInputRef.current.dataset.slotIndex = String(index);
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  }

  function handleAddClick() {
    const emptyIndex = Array.from({ length: MAX_FURNITURE }, (_, i) => i).find(
      (i) => !furnitureItems[i]
    );
    if (emptyIndex === undefined) return;
    if (fileInputRef.current) {
      fileInputRef.current.dataset.slotIndex = String(emptyIndex);
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const id = `${Date.now()}-${Math.random()}`;
    const localUrl = URL.createObjectURL(file);

    const slotIndexStr = fileInputRef.current?.dataset.slotIndex;
    const slotIndex = slotIndexStr !== undefined ? parseInt(slotIndexStr, 10) : -1;

    const newItem: FurnitureItem = {
      id, localUrl, falUrl: null, bgRemovedUrl: null, uploading: true, processingBg: false,
    };

    setFurnitureItems((prev) => {
      const next = [...prev];
      if (slotIndex >= 0 && slotIndex < MAX_FURNITURE) {
        next[slotIndex] = newItem;
      } else {
        next.push(newItem);
      }
      return next;
    });

    try {
      // Step 1 — upload to fal storage
      const falUrl = await uploadToFal(file);
      setFurnitureItems((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, falUrl, uploading: false, processingBg: true } : item
        )
      );

      // Step 2 — remove background so the model sees a clean cutout
      try {
        const bgRemovedUrl = await removeBackground(falUrl);
        setFurnitureItems((prev) =>
          prev.map((item) =>
            item.id === id ? { ...item, bgRemovedUrl, processingBg: false } : item
          )
        );
      } catch {
        // bg removal failed — fall back silently to original
        setFurnitureItems((prev) =>
          prev.map((item) =>
            item.id === id ? { ...item, processingBg: false } : item
          )
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload error";
      console.error("fal upload error:", msg);
      setFurnitureItems((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, uploading: false, processingBg: false } : item
        )
      );
    }
  }

  function handleRemoveFurniture(id: string) {
    setFurnitureItems((prev) => {
      const item = prev.find((f) => f.id === id);
      if (item) URL.revokeObjectURL(item.localUrl);
      return prev.filter((f) => f.id !== id);
    });
  }

  const isAnyUploading = furnitureItems.some((f) => f.uploading);
  const isAnyProcessingBg = furnitureItems.some((f) => f.processingBg);
  const hasRoom = Boolean(selectedRoom);
  const hasFurniture = furnitureItems.length > 0;
  const canGenerate = hasRoom && hasFurniture && !isAnyUploading && !isAnyProcessingBg && !isGenerating;

  async function handleGenerate() {
    if (!canGenerate) return;
    setErrorMessage(null);
    setResultUrl(null);
    setIsGenerating(true);

    try {
      // Prefer bg-removed cutout; fall back to original upload if removal failed
      const furnitureUrls = furnitureItems
        .map((f) => f.bgRemovedUrl ?? f.falUrl)
        .filter((url): url is string => url !== null);

      if (furnitureUrls.length !== furnitureItems.length) {
        setErrorMessage("Some furniture images haven't finished uploading yet.");
        setIsGenerating(false);
        return;
      }

      const res = await fetch("/api/furnish-room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomImageUrl: selectedRoom,
          furnitureUrls,
          customPrompt,
        }),
      });

      const data = (await res.json()) as {
        resultImageUrl?: string;
        error?: string;
      };

      if (!res.ok || data.error) {
        setErrorMessage(data.error ?? "Generation failed");
        return;
      }

      if (data.resultImageUrl) {
        setResultUrl(data.resultImageUrl);
        setRoundResults((prev) => [...prev, data.resultImageUrl!]);
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Network error — please try again."
      );
    } finally {
      setIsGenerating(false);
    }
  }

  function handleContinue() {
    if (!resultUrl) return;
    // Use result as new room, clear furniture for next round
    setSelectedRoom(resultUrl);
    setFurnitureItems([]);
    setResultUrl(null);
    setErrorMessage(null);
    setRound((r) => r + 1);
  }

  // Build the 7-slot grid (filled or empty)
  const slots = Array.from({ length: MAX_FURNITURE }, (_, i) => furnitureItems[i] ?? null);

  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_24rem]">
        {/* Left column — Room selection */}
        <div className="min-w-0">
          <div className="mb-3 flex items-center gap-2">
            <p className="text-sm font-semibold text-gray-700">Select Room</p>
            {round > 1 && (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
                Round {round}
              </span>
            )}
          </div>

          {/* Scrollable photo strip — round results first, then listing photos */}
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin mb-4">
            {roundResults.map((url, i) => (
              <button
                key={`round-${i}`}
                onClick={() => setSelectedRoom(url)}
                className={`relative h-16 w-24 flex-shrink-0 overflow-hidden rounded-lg border-2 transition-all ${
                  selectedRoom === url ? "border-blue-500" : "border-transparent opacity-60 hover:opacity-100"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`Round ${i + 1} result`} className="h-full w-full object-cover" />
                <span className="absolute bottom-0 left-0 right-0 bg-blue-600/80 text-white text-[9px] font-bold text-center py-0.5">
                  R{i + 1}
                </span>
              </button>
            ))}
            {property.photos.map((photo, i) => (
              <button
                key={`photo-${i}`}
                onClick={() => setSelectedRoom(photo)}
                className={`relative h-16 w-24 flex-shrink-0 overflow-hidden rounded-lg border-2 transition-all ${
                  selectedRoom === photo ? "border-blue-500" : "border-transparent opacity-60 hover:opacity-100"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo} alt={`Room photo ${i + 1}`} className="h-full w-full object-cover" />
              </button>
            ))}
          </div>

          {/* Selected room preview */}
          <div className="overflow-hidden rounded-2xl bg-gray-100">
            {selectedRoom ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={selectedRoom}
                alt="Selected room"
                className="w-full h-auto"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-gray-400">
                <p className="text-sm">No room selected</p>
              </div>
            )}
          </div>
        </div>

        {/* Right column — Furniture upload + generate */}
        <div className="min-w-0">
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
            <p className="text-sm font-semibold text-gray-700">Add Furniture</p>
            <p className="mt-1 mb-4 text-xs text-gray-500">
              Upload up to {MAX_FURNITURE} photos of furniture or decor
            </p>

            {/* 3-col grid of 7 slots */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              {slots.map((item, i) => (
                <div key={i} className="relative aspect-square">
                  {item ? (
                    /* Filled slot */
                    <div className="relative h-full w-full overflow-hidden rounded-xl border border-gray-200 bg-white">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.localUrl}
                        alt={`Furniture ${i + 1}`}
                        className="h-full w-full object-cover"
                      />
                      {/* Upload spinner */}
                      {item.uploading && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-white/70">
                          <svg className="h-5 w-5 animate-spin text-blue-600" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
                          </svg>
                          <span className="text-[9px] font-medium text-blue-700">Uploading…</span>
                        </div>
                      )}
                      {/* Background removal spinner */}
                      {item.processingBg && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-white/70">
                          <svg className="h-5 w-5 animate-spin text-amber-500" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
                          </svg>
                          <span className="text-[9px] font-medium text-amber-700">Cutting out…</span>
                        </div>
                      )}
                      {/* Done badge */}
                      {!item.uploading && !item.processingBg && item.bgRemovedUrl && (
                        <span className="absolute bottom-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-green-500">
                          <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </span>
                      )}
                      {/* Remove button */}
                      {!item.uploading && !item.processingBg && (
                        <button
                          onClick={() => handleRemoveFurniture(item.id)}
                          className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors text-xs leading-none"
                          aria-label="Remove furniture photo"
                        >
                          &#x2715;
                        </button>
                      )}
                    </div>
                  ) : (
                    /* Empty slot */
                    <button
                      onClick={() => handleSlotClick(i)}
                      className="h-full w-full rounded-xl border-2 border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50 transition-colors flex flex-col items-center justify-center gap-1 text-gray-400 hover:text-blue-500"
                      aria-label={`Add furniture photo ${i + 1}`}
                      disabled={furnitureItems.length >= MAX_FURNITURE}
                    >
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 4v16m8-8H4"
                        />
                      </svg>
                      <span className="text-[10px]">Add</span>
                    </button>
                  )}
                </div>
              ))}
            </div>

            {furnitureItems.length < MAX_FURNITURE && (
              <button
                onClick={handleAddClick}
                className="mb-4 w-full rounded-xl border border-gray-200 bg-white py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
              >
                + Add Photo
              </button>
            )}

            {/* Custom prompt */}
            <div className="mb-4">
              <label className="mb-1.5 block text-xs font-medium text-gray-600">
                Prompt
              </label>
              <textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                rows={3}
                disabled={isGenerating}
                className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-xs text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50"
              />
            </div>

            {/* Processing notices */}
            {isAnyUploading && (
              <p className="mb-3 text-xs text-blue-600 font-medium">
                Uploading…
              </p>
            )}
            {!isAnyUploading && isAnyProcessingBg && (
              <p className="mb-3 text-xs text-amber-600 font-medium">
                Cutting out furniture — this makes placement much more accurate.
              </p>
            )}

            {/* Error message */}
            {errorMessage && (
              <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-600">
                {errorMessage}
              </div>
            )}

            {/* Generate button */}
            <button
              onClick={handleGenerate}
              disabled={!canGenerate}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isGenerating ? (
                <>
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"
                    />
                  </svg>
                  Generating…
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
                    />
                  </svg>
                  Generate Room
                </>
              )}
            </button>
          </div>

          {/* Result area */}
          {resultUrl && (
            <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 p-5">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-700">Result — Round {round}</p>
                <button
                  onClick={handleContinue}
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
                >
                  + Continue Furnishing
                </button>
              </div>
              <div className="relative h-64 overflow-hidden rounded-xl bg-gray-100">
                <button
                  onClick={() => setLightboxUrl(resultUrl)}
                  className="h-full w-full cursor-zoom-in"
                  aria-label="Zoom in"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={resultUrl}
                    alt="Furnished room result"
                    className="h-full w-full object-cover"
                  />
                </button>
                <div className="absolute bottom-2 right-2 flex gap-2">
                  <button
                    onClick={() => setLightboxUrl(resultUrl)}
                    className="rounded-lg bg-black/50 px-3 py-1.5 text-xs font-medium text-white hover:bg-black/70 backdrop-blur-sm"
                  >
                    Zoom
                  </button>
                  <a
                    href={resultUrl}
                    download="furnished-room.jpg"
                    className="rounded-lg bg-black/50 px-3 py-1.5 text-xs font-medium text-white hover:bg-black/70 backdrop-blur-sm"
                  >
                    Download
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4"
          onClick={closeLightbox}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt="Zoomed furnished room"
            className="max-h-full max-w-full rounded-xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <div className="absolute top-4 right-4 flex gap-2">
            <a
              href={lightboxUrl}
              download="furnished-room.jpg"
              onClick={(e) => e.stopPropagation()}
              className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20 backdrop-blur-sm"
            >
              Download
            </a>
            <button
              onClick={closeLightbox}
              className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20 backdrop-blur-sm"
            >
              &#x2715; Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
