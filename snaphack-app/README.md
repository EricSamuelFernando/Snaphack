# Snaphack — AI Real Estate Photo Editor

Search real estate listings by address, city, or ZIP code, then transform property photos using natural language prompts powered by Hugging Face InstructPix2Pix.

## Features

- Property search via RealEstateAPI.com
- Browse listing photos in a responsive grid
- AI-powered image editing with text prompts (InstructPix2Pix)
- Side-by-side before/after comparison
- Download edited images
- Graceful handling of HF model warm-up (503 responses)

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy the example file and fill in your keys:

```bash
cp .env.local.example .env.local
```

Then edit `.env.local`:

```
REALESTATE_API_KEY=your_key_here
HUGGINGFACE_API_TOKEN=your_hf_token_here
```

**Getting API keys:**
- **RealEstateAPI**: Sign up at [realestateapi.com](https://realestateapi.com) — free tier available
- **Hugging Face**: Create a free account at [huggingface.co](https://huggingface.co), go to Settings → Access Tokens, generate a token with `read` scope

### 3. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Usage

1. Type an address, city, or ZIP code in the search bar and hit **Search**
2. Click any property card to open the AI editor
3. Type an edit prompt (e.g. "paint the walls light blue") or pick a suggestion
4. Click **Edit Image** and wait ~30–60 seconds
5. Compare before/after and download the result

## Notes on the HF model

The `timbrooks/instruct-pix2pix` model on Hugging Face runs on shared inference infrastructure. If you see a "Model warming up" message, wait ~20 seconds and try again — the model was cold-started and needs to load. Paid Hugging Face plans get dedicated endpoints with faster cold starts.

## Project structure

```
snaphack-app/
  app/
    page.tsx                    # Main search + results page
    layout.tsx                  # Root layout
    api/
      properties/search/route.ts  # Proxies RealEstateAPI.com
      edit-image/route.ts         # Proxies Hugging Face inference
  components/
    SearchBar.tsx               # Search input + button
    PropertyCard.tsx            # Property grid card
    ImageEditor.tsx             # Full-screen editor with before/after
  types/
    index.ts                    # Shared TypeScript types
  .env.local.example            # Environment variable template
```

## Tech stack

- Next.js 14+ (App Router)
- TypeScript
- Tailwind CSS
- RealEstateAPI.com (property search)
- Hugging Face Inference API — `timbrooks/instruct-pix2pix`
