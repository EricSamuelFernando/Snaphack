# Snaphack — AI-Powered Real Estate Photo Editor

Snaphack lets users search live MLS listings, browse property photos, and transform them using AI — either by editing with a text prompt or by virtually furnishing empty rooms with reference furniture photos.

---

## What It Does

### AI Edit
Search any property, select a listing photo, and describe what you want changed. The AI rewrites the image based on your prompt while preserving the structure of the room.

**Examples:**
- "Paint the walls light blue"
- "Make it look like a golden hour sunset"
- "Add modern minimalist furniture"
- "Make the kitchen look renovated with marble countertops"

Edited images are cached per photo — switching between photos restores previous edits instantly. Running a new prompt on the same photo overwrites the cache for that photo only.

### Furnish Room
Upload up to 3 reference photos of furniture or decor. The AI places them naturally into the selected room photo — matching lighting, perspective, and style.

Supports **iterative furnishing**: after each generation, click "Continue Furnishing" to use the result as the new room and add more pieces in the next round. Past round results appear in the photo strip labeled R1, R2, etc.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| MLS Data | RealEstateAPI.com |
| AI Image Editing | fal.ai — `flux-pro/kontext` |
| AI Room Furnishing | fal.ai — `flux-pro/kontext/multi` |
| File Storage | fal.ai Storage (furniture uploads) |

---

## Architecture

```
app/
├── page.tsx                        # Landing page — search + property grid
├── layout.tsx                      # Root layout (Inter font, metadata)
└── api/
    ├── properties/
    │   ├── search/route.ts         # POST /api/properties/search
    │   │                           # → RealEstateAPI MLSSearch
    │   └── detail/route.ts         # POST /api/properties/detail
    │                               # → RealEstateAPI MLSDetail (full photo list)
    ├── edit-image/route.ts         # POST /api/edit-image
    │                               # → fal.ai flux-pro/kontext
    ├── furnish-room/route.ts       # POST /api/furnish-room
    │                               # → fal.ai flux-pro/kontext/multi
    └── fal-upload/route.ts         # POST /api/fal-upload
                                    # → fal.ai Storage (furniture photos)

components/
├── SearchBar.tsx                   # Search input
├── PropertyCard.tsx                # Listing card with photo + details
├── ImageEditor.tsx                 # Fullscreen editor modal (AI Edit + Furnish tabs)
└── FurnishRoom.tsx                 # Furnish Room tab — upload + generate flow
```

All API keys are kept server-side. The browser never sees them.

---

## Data Flow

### Property Search
1. User types city / ZIP / state → `POST /api/properties/search`
2. Server calls `MLSSearch` with `include_photos: true`, `has_photos: true`, `active: true`
3. Returns up to 12 properties with photos

### Opening a Listing
1. Click property card → `POST /api/properties/detail` with `listing_id`
2. Merges detail photos (`media.photosList`) with search photos
3. Opens `ImageEditor` with full photo set

### AI Edit
1. User selects photo + enters prompt → `POST /api/edit-image`
2. Server calls `fal.ai flux-pro/kontext` with `image_url` + `prompt`
3. Returns edited image URL → displayed alongside original

### Furnish Room
1. User selects room photo from strip
2. Uploads up to 3 furniture photos → each auto-uploads to fal.ai Storage
3. Click Generate → `POST /api/furnish-room`
4. Server calls `fal.ai flux-pro/kontext/multi` with `image_urls: [room, ...furniture]`
5. Returns furnished room image
6. "Continue Furnishing" sets result as new room for next round

---

## Setup

### 1. Install dependencies
```bash
cd snaphack-app
npm install
```

### 2. Configure environment variables
```bash
cp .env.local.example .env.local
```

Edit `.env.local`:
```
REALESTATE_API_KEY=        # realestateapi.com — MLS data
HUGGINGFACE_API_TOKEN=     # huggingface.co — optional
FAL_KEY=                   # fal.ai — image editing + storage
REPLICATE_API_TOKEN=       # replicate.com — optional
```

Only `REALESTATE_API_KEY` and `FAL_KEY` are required for full functionality.

### 3. Run locally
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Search examples
| Input | Searches by |
|---|---|
| `california` | State |
| `TX` | State code |
| `Los Angeles, CA` | City + State |
| `90210` | ZIP code |

---

## Deploying to Vercel

1. Push repo to GitHub
2. Import on [vercel.com](https://vercel.com) — set root directory to `snaphack-app`
3. Add all env vars under **Settings → Environment Variables**
4. Deploy

AI routes have `maxDuration = 60` set — Vercel Pro plan required for functions longer than 10s. On Hobby plan, edits must complete within 10s (fal.ai is usually fast enough).

---

## Limitations

- MLS photo availability varies by board — some listings have no photos in the API
- `flux-pro/kontext/multi` accepts max 4 images total (1 room + 3 furniture) per round — use iterative furnishing for more items
- Furnish Room works best with interior room photos, not exterior shots
- AI edits are non-destructive — originals are never modified

---

## API Costs (approximate)

| Operation | Model | Cost |
|---|---|---|
| AI Edit | fal.ai flux-pro/kontext | ~$0.01 |
| Furnish Room | fal.ai flux-pro/kontext/multi | ~$0.05 |
| Property Search | RealEstateAPI MLSSearch | per plan |
| Property Detail | RealEstateAPI MLSDetail | per plan |
| File Upload | fal.ai Storage | ~$0.001 |
