"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import SearchBar from "@/components/SearchBar";
import PropertyCard from "@/components/PropertyCard";
import ImageEditor from "@/components/ImageEditor";
import { Property } from "@/types";

const WorldViewer = dynamic(() => import("@/components/WorldViewer"), { ssr: false });

interface WorldEntry {
  worldId: string;
  displayName: string;
  createdAt: string | null;
  thumbnailUrl: string | null;
}

interface WorldAssets {
  worldId: string;
  displayName: string;
  splatUrl: string | null;
  panoUrl: string | null;
  metricScaleFactor: number;
  groundPlaneOffset: number;
}

interface WalkthroughEntry {
  id: string;
  videoUrl: string;
  propertyAddress: string;
  city: string;
  state: string;
  photoUrl: string;
  createdAt: string;
}

type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; properties: Property[] }
  | { status: "error"; message: string };

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<"search" | "worlds" | "walkthroughs">("search");
  const [searchState, setSearchState] = useState<SearchState>({ status: "idle" });
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [loadingPropertyId, setLoadingPropertyId] = useState<string | null>(null);
  const [worlds, setWorlds] = useState<WorldEntry[]>([]);
  const [worldsLoading, setWorldsLoading] = useState(false);
  const [activeWorld, setActiveWorld] = useState<WorldAssets | null>(null);
  const [walkthroughs, setWalkthroughs] = useState<WalkthroughEntry[]>([]);
  const [activeWalkthrough, setActiveWalkthrough] = useState<WalkthroughEntry | null>(null);

  useEffect(() => {
    if (activeTab !== "worlds") return;
    setWorldsLoading(true);
    fetch("/api/marble/worlds")
      .then((r) => r.json())
      .then((d: { worlds?: WorldEntry[] }) => { if (d.worlds) setWorlds(d.worlds); })
      .finally(() => setWorldsLoading(false));
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "walkthroughs") return;
    try {
      const saved = JSON.parse(localStorage.getItem("snaphack_walkthroughs") ?? "[]");
      setWalkthroughs(saved);
    } catch { setWalkthroughs([]); }
  }, [activeTab]);

  async function handleOpenWorld(worldId: string) {
    const res = await fetch(`/api/marble/world?id=${worldId}`);
    const data = (await res.json()) as WorldAssets & { error?: string };
    if (res.ok && !data.error) setActiveWorld(data);
  }

  async function handleSelectProperty(property: Property) {
    if (!property.listingId) {
      setSelectedProperty(property);
      return;
    }

    setLoadingPropertyId(property.id);
    try {
      const res = await fetch("/api/properties/detail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listing_id: property.listingId }),
      });

      if (res.ok) {
        const data = (await res.json()) as { photos?: string[] };
        const allPhotos = data.photos ?? [];
        const merged = [...allPhotos];
        property.photos.forEach((p) => {
          if (!merged.includes(p)) merged.push(p);
        });
        setSelectedProperty({
          ...property,
          photos: merged,
          primaryPhoto: merged[0] ?? property.primaryPhoto,
        });
      } else {
        setSelectedProperty(property);
      }
    } catch {
      setSelectedProperty(property);
    } finally {
      setLoadingPropertyId(null);
    }
  }

  async function handleSearch(query: string) {
    setSearchState({ status: "loading" });

    try {
      const res = await fetch("/api/properties/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });

      const data = (await res.json()) as { properties?: Property[]; error?: string };

      if (!res.ok || data.error) {
        setSearchState({
          status: "error",
          message: data.error ?? "Search failed. Check your API key configuration.",
        });
        return;
      }

      const properties = data.properties ?? [];
      setSearchState({ status: "success", properties });
    } catch {
      setSearchState({
        status: "error",
        message: "Network error — please check your connection and try again.",
      });
    }
  }

  return (
    <>
      {/* Editor overlay */}
      {selectedProperty && (
        <ImageEditor
          property={selectedProperty}
          onClose={() => setSelectedProperty(null)}
        />
      )}

      <main className="min-h-screen bg-gray-50">
        {/* Nav bar */}
        <nav className="bg-white border-b border-gray-100 px-6 py-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
                <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9.75L12 3l9 6.75V21H3V9.75z" />
                </svg>
              </div>
              <span className="text-lg font-bold text-gray-900">Snaphack</span>
            </div>
            <div className="flex items-center gap-1 rounded-xl bg-gray-100 p-1">
              {(["search", "worlds", "walkthroughs"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                    activeTab === tab
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {tab === "search" ? "Search" : tab === "worlds" ? "My Worlds" : "Walk-Throughs"}
                </button>
              ))}
            </div>
          </div>
        </nav>

        {/* Fullscreen World Viewer */}
        {activeWorld && (
          <div className="fixed inset-0 z-50 flex flex-col bg-gray-950">
            <div className="flex-none flex items-center justify-between px-6 py-4 bg-gray-900/80 backdrop-blur-sm">
              <div>
                <p className="text-sm font-semibold text-white">{activeWorld.displayName}</p>
                <p className="text-xs text-white/50">WASD move · E/Q up/down · Shift fast · drag look</p>
              </div>
              <button
                onClick={() => setActiveWorld(null)}
                className="rounded-xl p-2 text-white/60 hover:bg-white/10 hover:text-white transition-colors"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1">
              {activeWorld.splatUrl ? (
                <WorldViewer
                  splatUrl={activeWorld.splatUrl}
                  metricScaleFactor={activeWorld.metricScaleFactor}
                  groundPlaneOffset={activeWorld.groundPlaneOffset}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-white/40">No 3D data for this world.</div>
              )}
            </div>
          </div>
        )}

        {/* Fullscreen Walk-Through Player */}
        {activeWalkthrough && (
          <div className="fixed inset-0 z-50 flex flex-col bg-black">
            <div className="flex-none flex items-center justify-between px-6 py-4 bg-black/60 backdrop-blur-sm">
              <div>
                <p className="text-sm font-semibold text-white">{activeWalkthrough.propertyAddress}</p>
                <p className="text-xs text-white/50">
                  {[activeWalkthrough.city, activeWalkthrough.state].filter(Boolean).join(", ")} ·{" "}
                  {new Date(activeWalkthrough.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={activeWalkthrough.videoUrl}
                  download="walkthrough.mp4"
                  className="rounded-xl border border-white/20 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/10 transition-colors"
                >
                  Download
                </a>
                <button
                  onClick={() => setActiveWalkthrough(null)}
                  className="rounded-xl p-2 text-white/60 hover:bg-white/10 hover:text-white transition-colors"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="flex-1 flex items-center justify-center p-4">
              <video
                src={activeWalkthrough.videoUrl}
                autoPlay
                loop
                controls
                className="max-h-full max-w-full rounded-2xl shadow-2xl"
              />
            </div>
          </div>
        )}

        {/* My Worlds tab */}
        {activeTab === "worlds" && (
          <section className="max-w-7xl mx-auto px-6 py-10">
            <h2 className="mb-6 text-xl font-bold text-gray-900">My 3D Worlds</h2>
            {worldsLoading && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="aspect-video animate-pulse rounded-2xl bg-gray-200" />
                ))}
              </div>
            )}
            {!worldsLoading && worlds.length === 0 && (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-gray-200 bg-white py-16 text-center">
                <svg className="h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
                </svg>
                <p className="font-medium text-gray-500">No worlds yet</p>
                <p className="text-sm text-gray-400">Generate one from a listing photo in the Immerse tab.</p>
              </div>
            )}
            {!worldsLoading && worlds.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {worlds.map((w) => (
                  <button
                    key={w.worldId}
                    onClick={() => handleOpenWorld(w.worldId)}
                    className="group relative aspect-video overflow-hidden rounded-2xl bg-gray-900 shadow-sm ring-1 ring-gray-200 hover:ring-blue-500 hover:shadow-md transition-all text-left"
                  >
                    {w.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={w.thumbnailUrl} alt={w.displayName} className="h-full w-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <svg className="h-10 w-10 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
                        </svg>
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-4 py-3">
                      <p className="truncate text-sm font-semibold text-white">{w.displayName}</p>
                      {w.createdAt && (
                        <p className="text-xs text-white/50">{new Date(w.createdAt).toLocaleDateString()}</p>
                      )}
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-lg">
                        Enter World
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Walk-Throughs tab */}
        {activeTab === "walkthroughs" && (
          <section className="max-w-7xl mx-auto px-6 py-10">
            <h2 className="mb-6 text-xl font-bold text-gray-900">Walk-Through Videos</h2>
            {walkthroughs.length === 0 && (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-gray-200 bg-white py-16 text-center">
                <svg className="h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M4 6h8a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2z" />
                </svg>
                <p className="font-medium text-gray-500">No walk-throughs yet</p>
                <p className="text-sm text-gray-400">Generate one from a listing photo in the Immerse tab.</p>
              </div>
            )}
            {walkthroughs.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {walkthroughs.map((wt) => (
                  <button
                    key={wt.id}
                    onClick={() => setActiveWalkthrough(wt)}
                    className="group relative aspect-video overflow-hidden rounded-2xl bg-gray-900 shadow-sm ring-1 ring-gray-200 hover:ring-blue-500 hover:shadow-md transition-all text-left"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={wt.photoUrl} alt={wt.propertyAddress} className="h-full w-full object-cover opacity-80 group-hover:opacity-60 transition-opacity" />
                    {/* Play icon overlay */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/50 group-hover:bg-blue-600 transition-colors backdrop-blur-sm">
                        <svg className="h-5 w-5 translate-x-0.5 text-white" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </div>
                    </div>
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-4 py-3">
                      <p className="truncate text-sm font-semibold text-white">{wt.propertyAddress}</p>
                      <p className="text-xs text-white/50">
                        {[wt.city, wt.state].filter(Boolean).join(", ")} · {new Date(wt.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Search tab */}
        {activeTab === "search" && (
        <>

        {/* Hero section */}
        <section className="bg-white border-b border-gray-100">
          <div className="max-w-7xl mx-auto px-6 py-16 flex flex-col items-center text-center gap-6">
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-gray-900 max-w-2xl">
              Reimagine any property{" "}
              <span className="text-blue-600">with AI</span>
            </h1>
            <p className="text-lg text-gray-500 max-w-lg">
              Search any listing, pick a photo, and transform it in seconds with a simple text prompt.
            </p>
            <SearchBar
              onSearch={handleSearch}
              isLoading={searchState.status === "loading"}
            />
          </div>
        </section>

        {/* Results section */}
        <section className="max-w-7xl mx-auto px-6 py-12">
          {/* Loading skeletons */}
          {searchState.status === "loading" && (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="overflow-hidden rounded-2xl bg-white shadow-sm border border-gray-100 animate-pulse"
                >
                  <div className="h-48 bg-gray-200" />
                  <div className="p-4 space-y-3">
                    <div className="h-4 bg-gray-200 rounded-lg w-1/3" />
                    <div className="h-4 bg-gray-200 rounded-lg w-3/4" />
                    <div className="h-3 bg-gray-100 rounded-lg w-1/2" />
                    <div className="mt-2 flex gap-2">
                      <div className="h-6 bg-gray-100 rounded-lg w-12" />
                      <div className="h-6 bg-gray-100 rounded-lg w-12" />
                      <div className="h-6 bg-gray-100 rounded-lg w-16" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Error */}
          {searchState.status === "error" && (
            <div className="flex flex-col items-center gap-4 rounded-2xl border border-red-100 bg-red-50 px-6 py-12 text-center max-w-lg mx-auto">
              <svg className="h-12 w-12 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                />
              </svg>
              <div>
                <p className="text-lg font-semibold text-red-700">Something went wrong</p>
                <p className="mt-1 text-sm text-red-500">{searchState.message}</p>
              </div>
            </div>
          )}

          {/* Empty results */}
          {searchState.status === "success" && searchState.properties.length === 0 && (
            <div className="flex flex-col items-center gap-4 rounded-2xl border border-gray-200 bg-white px-6 py-12 text-center max-w-lg mx-auto">
              <svg className="h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"
                />
              </svg>
              <div>
                <p className="text-lg font-semibold text-gray-700">No properties found</p>
                <p className="mt-1 text-sm text-gray-400">
                  Try a different address, city name, or ZIP code.
                </p>
              </div>
            </div>
          )}

          {/* Property grid */}
          {searchState.status === "success" && searchState.properties.length > 0 && (
            <>
              <p className="mb-5 text-sm text-gray-500">
                {searchState.properties.length} propert
                {searchState.properties.length === 1 ? "y" : "ies"} found — click one to edit with AI
              </p>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {searchState.properties.map((property) => (
                  <PropertyCard
                    key={property.id}
                    property={property}
                    onClick={handleSelectProperty}
                    isLoading={loadingPropertyId === property.id}
                  />
                ))}
              </div>
            </>
          )}

          {/* Idle state — how it works */}
          {searchState.status === "idle" && (
            <div className="grid gap-6 sm:grid-cols-3">
              {[
                {
                  icon: (
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                    </svg>
                  ),
                  title: "Search listings",
                  desc: "Find real properties by address, city, or ZIP code using live MLS data.",
                },
                {
                  icon: (
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                    </svg>
                  ),
                  title: "Pick a photo",
                  desc: "Browse listing photos and choose the one you want to reimagine.",
                },
                {
                  icon: (
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                    </svg>
                  ),
                  title: "Edit with AI",
                  desc: "Type a natural language prompt and watch AI transform the space.",
                },
              ].map((card) => (
                <div
                  key={card.title}
                  className="flex flex-col items-center gap-4 rounded-2xl bg-white p-8 text-center shadow-sm border border-gray-100"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                    {card.icon}
                  </div>
                  <p className="font-semibold text-gray-900">{card.title}</p>
                  <p className="text-sm text-gray-500 leading-relaxed">{card.desc}</p>
                </div>
              ))}
            </div>
          )}
        </section>
        </>
        )}
      </main>
    </>
  );
}
