export interface Property {
  id: string;
  listingId: number | null;
  address: string;
  city: string;
  state: string;
  zip: string;
  price: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  sqft: number | null;
  photos: string[];
  primaryPhoto: string | null;
}

export interface SearchResponse {
  properties: Property[];
  error?: string;
}

export interface EditImageResponse {
  editedImageUrl: string;
  error?: string;
}

export interface HuggingFaceError {
  error: string;
  estimated_time?: number;
}
