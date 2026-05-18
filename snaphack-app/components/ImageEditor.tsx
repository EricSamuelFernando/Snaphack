"use client";

import { useState, useEffect } from "react";
import { Property } from "@/types";
import UnifiedEditor from "@/components/UnifiedEditor";
import ImmersiveView from "@/components/ImmersiveView";

interface ImageEditorProps {
  property: Property;
  onClose: () => void;
}

export default function ImageEditor({ property, onClose }: ImageEditorProps) {
  const [activeTab, setActiveTab] = useState<"edit" | "immerse">("edit");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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

      {/* Tabs */}
      <div className="flex-none flex border-b border-gray-200 bg-white">
        {(["edit", "immerse"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === tab
                ? "border-b-2 border-blue-600 text-blue-600"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            {tab === "edit" ? "Edit & Furnish" : "Immerse"}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "edit" && <UnifiedEditor property={property} />}
        {activeTab === "immerse" && <ImmersiveView property={property} />}
      </div>
    </div>
  );
}
