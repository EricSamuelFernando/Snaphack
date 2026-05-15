"use client";

import { useState } from "react";
import SearchBar from "@/components/SearchBar";
import PropertyCard from "@/components/PropertyCard";
import ImageEditor from "@/components/ImageEditor";
import { Property } from "@/types";

type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; properties: Property[] }
  | { status: "error"; message: string };

export default function HomePage() {
  const [searchState, setSearchState] = useState<SearchState>({ status: "idle" });
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [loadingPropertyId, setLoadingPropertyId] = useState<string | null>(null);

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
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 9.75L12 3l9 6.75V21H3V9.75z"
                  />
                </svg>
              </div>
              <span className="text-lg font-bold text-gray-900">Snaphack</span>
            </div>
            <span className="text-sm text-gray-500 hidden sm:block">
              AI-powered real estate visualization
            </span>
          </div>
        </nav>

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
      </main>
    </>
  );
}
