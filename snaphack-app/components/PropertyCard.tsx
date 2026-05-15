"use client";

import { Property } from "@/types";

interface PropertyCardProps {
  property: Property;
  onClick: (property: Property) => void;
  isLoading?: boolean;
}

function formatPrice(price: number | null): string {
  if (price === null) return "Price N/A";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(price);
}

export default function PropertyCard({
  property,
  onClick,
  isLoading = false,
}: PropertyCardProps) {
  const { address, city, state, zip, price, bedrooms, bathrooms, sqft, primaryPhoto } =
    property;

  const locationLine = [city, state, zip].filter(Boolean).join(", ");

  return (
    <button
      onClick={() => onClick(property)}
      className="group relative flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5 text-left w-full border border-gray-100"
    >
      {/* Photo — fills top 60% of card */}
      <div className="relative h-48 w-full overflow-hidden bg-gray-100 flex-none">
        {primaryPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={primaryPhoto}
            alt={address}
            className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-gray-100 text-gray-300">
            <svg className="h-14 w-14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1}
                d="M3 9.75L12 3l9 6.75V21H3V9.75z"
              />
            </svg>
          </div>
        )}

        {/* Edit with AI pill — appears on hover */}
        {!isLoading && (
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-black/20 rounded-t-2xl">
            <span className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-lg">
              Edit with AI &rarr;
            </span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-col gap-1 p-4">
        {/* Price in blue */}
        <p className="text-lg font-bold text-blue-600">{formatPrice(price)}</p>
        <p className="font-semibold text-gray-900 truncate">{address}</p>
        {locationLine && (
          <p className="text-sm text-gray-500 truncate">{locationLine}</p>
        )}

        {/* Badges */}
        <div className="mt-2 flex flex-wrap gap-2">
          {bedrooms !== null && (
            <span className="rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
              {bedrooms} bd
            </span>
          )}
          {bathrooms !== null && (
            <span className="rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
              {bathrooms} ba
            </span>
          )}
          {sqft !== null && (
            <span className="rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
              {sqft.toLocaleString()} sqft
            </span>
          )}
        </div>
      </div>

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/70 rounded-2xl">
          <svg className="h-8 w-8 animate-spin text-blue-600" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
          </svg>
        </div>
      )}
    </button>
  );
}
