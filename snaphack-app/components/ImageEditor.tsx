"use client";

import { useState, FormEvent, useEffect, useCallback } from "react";
import { Property } from "@/types";
import FurnishRoom from "@/components/FurnishRoom";

interface ImageEditorProps {
  property: Property;
  onClose: () => void;
}

const PROMPT_SUGGESTIONS = [
  "Paint the walls light blue",
  "Add modern minimalist furniture",
  "Make it look like a golden hour sunset",
  "Add lush green plants throughout",
  "Make the kitchen look renovated with marble countertops",
  "Add cozy warm lighting",
];

type EditState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "model_loading"; estimatedTime: number }
  | { status: "success"; editedImageUrl: string }
  | { status: "error"; message: string };

export default function ImageEditor({ property, onClose }: ImageEditorProps) {
  const [activeTab, setActiveTab] = useState<"edit" | "furnish">("edit");
  const [prompt, setPrompt] = useState("");
  const [selectedPhoto, setSelectedPhoto] = useState(
    property.primaryPhoto ?? property.photos[0] ?? ""
  );
  const [editState, setEditState] = useState<EditState>({ status: "idle" });
  // Cache: originalPhotoUrl → editedImageUrl
  const [editCache, setEditCache] = useState<Map<string, string>>(new Map());
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const closeLightbox = useCallback(() => setLightboxUrl(null), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (lightboxUrl) {
          closeLightbox();
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeLightbox, lightboxUrl, onClose]);

  // When switching photos, restore cached edit or reset
  useEffect(() => {
    const cached = editCache.get(selectedPhoto);
    if (cached) {
      setEditState({ status: "success", editedImageUrl: cached });
    } else {
      setEditState({ status: "idle" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPhoto]);

  async function handleEdit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!prompt.trim() || !selectedPhoto) return;

    setEditState({ status: "loading" });

    try {
      const res = await fetch("/api/edit-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: selectedPhoto, prompt: prompt.trim() }),
      });

      const data = (await res.json()) as {
        editedImageUrl?: string;
        error?: string;
        estimated_time?: number;
      };

      if (res.status === 503) {
        setEditState({ status: "model_loading", estimatedTime: data.estimated_time ?? 20 });
        return;
      }

      if (!res.ok || data.error) {
        setEditState({ status: "error", message: data.error ?? "Something went wrong" });
        return;
      }

      if (data.editedImageUrl) {
        setEditCache((prev) => new Map(prev).set(selectedPhoto, data.editedImageUrl!));
        setEditState({ status: "success", editedImageUrl: data.editedImageUrl });
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
  }

  function handleSelectPhoto(photo: string) {
    if (photo === selectedPhoto) return;
    setSelectedPhoto(photo);
  }

  const isLoading = editState.status === "loading";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* Header */}
      <div className="flex-none flex items-center justify-between border-b border-gray-200 px-6 py-4 bg-white">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{property.address}</h2>
          <p className="text-sm text-gray-500">
            {[property.city, property.state, property.zip].filter(Boolean).join(", ")}
          </p>
        </div>
        <button
          onClick={onClose}
          className="rounded-xl p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
          aria-label="Close editor"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex-none flex border-b border-gray-200 bg-white">
        <button
          onClick={() => setActiveTab("edit")}
          className={`px-6 py-3 text-sm font-medium transition-colors ${
            activeTab === "edit"
              ? "border-b-2 border-blue-600 text-blue-600"
              : "text-gray-500 hover:text-gray-900"
          }`}
        >
          AI Edit
        </button>
        <button
          onClick={() => setActiveTab("furnish")}
          className={`px-6 py-3 text-sm font-medium transition-colors ${
            activeTab === "furnish"
              ? "border-b-2 border-blue-600 text-blue-600"
              : "text-gray-500 hover:text-gray-900"
          }`}
        >
          Furnish Room
        </button>
      </div>

      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto">
        {/* Furnish Room tab */}
        {activeTab === "furnish" && <FurnishRoom property={property} />}

        {/* AI Edit tab */}
        {activeTab === "edit" && (
          <div className="max-w-7xl mx-auto p-6">
            {/* Thumbnail strip */}
            {property.photos.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin mb-6">
                {property.photos.map((photo, i) => {
                  const isCached = editCache.has(photo);
                  return (
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
                      {/* Green dot = has cached edit */}
                      {isCached && (
                        <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-green-500 ring-1 ring-white" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Two column layout */}
            <div className="flex flex-col gap-6 lg:flex-row">
              {/* Left — Original + result */}
              <div className="flex-1">
                <div className="flex flex-col gap-4 sm:flex-row">
                  {/* Original */}
                  <div className="flex-1">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-400">
                      Original
                    </p>
                    <div className="h-64 overflow-hidden rounded-2xl bg-gray-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={selectedPhoto}
                        alt="Original property photo"
                        className="h-full w-full object-cover"
                      />
                    </div>
                  </div>

                  {/* AI Edited */}
                  <div className="flex-1">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-400">
                      AI Edited
                    </p>
                    <div className="relative h-64 overflow-hidden rounded-2xl bg-gray-100 flex items-center justify-center">
                      {editState.status === "idle" && (
                        <div className="flex flex-col items-center gap-2 text-gray-400">
                          <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={1}
                              d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
                            />
                          </svg>
                          <p className="text-sm">Result will appear here</p>
                        </div>
                      )}

                      {editState.status === "loading" && (
                        <div className="flex flex-col items-center gap-3 text-gray-500">
                          <svg className="h-10 w-10 animate-spin text-blue-500" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
                          </svg>
                          <p className="text-sm font-medium">AI is editing your image…</p>
                          <p className="text-xs text-gray-400">This may take 30–60 seconds</p>
                        </div>
                      )}

                      {editState.status === "model_loading" && (
                        <div className="flex flex-col items-center gap-3 px-4 text-center">
                          <svg className="h-10 w-10 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <p className="text-sm font-semibold text-amber-600">Model warming up</p>
                          <p className="text-xs text-gray-500">Try again in ~{editState.estimatedTime}s.</p>
                          <button
                            onClick={handleReset}
                            className="mt-1 rounded-lg bg-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-300 transition-colors"
                          >
                            Dismiss
                          </button>
                        </div>
                      )}

                      {editState.status === "error" && (
                        <div className="flex flex-col items-center gap-3 px-4 text-center">
                          <svg className="h-10 w-10 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                          </svg>
                          <p className="text-sm font-semibold text-red-500">Edit failed</p>
                          <p className="text-xs text-gray-500">{editState.message}</p>
                          <button
                            onClick={handleReset}
                            className="mt-1 rounded-lg bg-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-300 transition-colors"
                          >
                            Try Again
                          </button>
                        </div>
                      )}

                      {editState.status === "success" && (
                        <>
                          <button
                            onClick={() => setLightboxUrl(editState.editedImageUrl)}
                            className="h-full w-full cursor-zoom-in"
                            aria-label="Zoom in"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={editState.editedImageUrl}
                              alt="AI-edited property photo"
                              className="h-full w-full object-cover"
                            />
                          </button>
                          <div className="absolute bottom-2 right-2 flex gap-2">
                            <button
                              onClick={() => setLightboxUrl(editState.editedImageUrl)}
                              className="rounded-lg bg-black/50 px-3 py-1.5 text-xs font-medium text-white hover:bg-black/70 backdrop-blur-sm"
                            >
                              Zoom
                            </button>
                            <a
                              href={editState.editedImageUrl}
                              download="edited-property.jpg"
                              className="rounded-lg bg-black/50 px-3 py-1.5 text-xs font-medium text-white hover:bg-black/70 backdrop-blur-sm"
                            >
                              Download
                            </a>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right panel — Prompt + suggestions */}
              <div className="w-full lg:w-96">
                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
                  <h3 className="mb-4 text-sm font-semibold text-gray-700">
                    Edit Prompt
                  </h3>
                  <form onSubmit={handleEdit} className="flex flex-col gap-3">
                    <textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder='Describe what to change… e.g. "paint the walls light blue"'
                      rows={4}
                      disabled={isLoading}
                      className="w-full resize-none rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50"
                    />
                    <button
                      type="submit"
                      disabled={isLoading || !prompt.trim()}
                      className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isLoading ? (
                        <>
                          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
                          </svg>
                          Editing…
                        </>
                      ) : (
                        <>
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                          </svg>
                          Edit Image
                        </>
                      )}
                    </button>
                  </form>
                  {editState.status === "success" && (
                    <button
                      onClick={handleReset}
                      className="mt-2 w-full rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                    >
                      Clear &amp; Edit Again
                    </button>
                  )}
                </div>

                {/* Suggestion chips */}
                <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 p-5">
                  <h3 className="mb-3 text-sm font-semibold text-gray-700">Suggestions</h3>
                  <div className="flex flex-wrap gap-2">
                    {PROMPT_SUGGESTIONS.map((suggestion) => (
                      <button
                        key={suggestion}
                        onClick={() => setPrompt(suggestion)}
                        disabled={isLoading}
                        className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 hover:border-blue-500 hover:text-blue-600 hover:bg-blue-50 transition-all disabled:opacity-40"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
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
            alt="Zoomed edited photo"
            className="max-h-full max-w-full rounded-xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <div className="absolute top-4 right-4 flex gap-2">
            <a
              href={lightboxUrl}
              download="edited-property.jpg"
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
