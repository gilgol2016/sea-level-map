# Global Sea Level Explorer (MVP)

An interactive, client-side geographic visualization exploring hypothetical global ocean sea-level rise from **0 to 100 meters**.

> **Note:** This is a geographic elevation visualization based on digital terrain data, **not a climate forecast or dynamic flood prediction**.

---

## 1. Core Model & Definitions

### Meaning of "+X meters"
**"+X meters"** strictly denotes a **hypothetical global ocean sea-level elevation $X$ meters above today's mean sea level (0 meters)**.

### Inundation Classification Rule
To maintain geographical integrity and prevent misleading representations, the model partitions global surfaces into three distinct categories:

1. **Newly Submerged Land:**
   * Visualized with an oceanic flood overlay and classified as submerged.
   * Defined strictly by the condition:
     $$\mathbf{0 < \text{elevation} \le \text{seaLevel}}$$
2. **Naturally Dry Depressions Below Sea Level:**
   * Terrestrial depressions that are below current sea level today (e.g., Dead Sea basin at $-430\text{ m}$, Death Valley at $-58\text{ m}$, Caspian Sea shores at $-28\text{ m}$, and Dutch polders at $-2\text{ to } -7\text{ m}$).
   * **Rule:** These areas have $\text{elevation} \le 0\text{ m}$ and are **not** marked or counted as newly submerged.
3. **Existing Ocean / Water:**
   * Baseline open ocean surfaces at $\approx 0\text{ m}$.
   * **Rule:** At **0m sea level**, there is **exactly zero newly submerged land**.

### Population Impact Estimation
* **Global Exposure:** Based on global hypsometric population research (~8.05B world population baseline). At 0m, 0 people (0%) are displaced; at +1m, ~110M (1.4%); at +10m, ~640M (8.0%); at +66m, ~1.51B (18.8%); at +100m, ~1.78B (22.1%).
* **Metropolitan Agglomeration Exposure:** Pre-computed metropolitan area populations for all 122 tracked world cities to give real-time urban impact estimates.

---

## 2. Elevation Data & Official Decoding Formula

Elevation data is streamed on demand from **AWS Open Data Terrain Tiles** in the Mapzen Terrarium format:
* **Endpoint:** `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`
* **CORS:** Verified with `Access-Control-Allow-Origin: *` for direct client-side consumption.
* **Decoding Formula:**
  $$\text{elevation (meters)} = \left(R \times 256 + G + \frac{B}{256}\right) - 32768$$
  where $R, G, B \in [0, 255]$ are 8-bit integer channel values.

---

## 3. Documented Limitations of the Bathtub Model

For the MVP, a hydrostatic **"bathtub model"** is implemented. It compares bare-ground elevation directly to hypothetical sea levels. It does **not** model:
* Hydrological connectivity or breach dynamics of inland barriers.
* Artificial coastal defenses (dykes, seawalls, storm surge barriers, pumping systems).
* Tidal dynamics, astronomical high tides, or wave run-up.
* Storm surges, wind setups, or atmospheric pressure variations.

---

## 4. Getting Started

### Prerequisites
* Node.js (v18+)
* npm (v9+)

### Installation
```bash
npm install
```

### Environment Configuration (CARTO API Key)
Copy the example environment file and add your free CARTO Basemaps API key:
```bash
cp .env.example .env.local
```
Edit `.env.local` and set:
```env
VITE_CARTO_API_KEY=your_actual_carto_api_key
```
*(Get a free key for up to 5M requests/month at: https://carto.com/basemaps/apikey/)*

### Run Sanity Check Tests
Run the automated test suite verifying elevation rules, depression protection, marine noise filtering, and population dataset integrity (13 checks):
```bash
npm test
```

### Start Development Server
```bash
npm run dev
```
Open `http://localhost:5173` in your browser.

### Build for Production
```bash
npm run build
```

---

## 5. Technology Stack
* **Framework:** React 19 + TypeScript + Vite
* **Map Engine:** MapLibre GL JS (v5)
* **Base Map:** CartoDB Positron raster tiles (&copy; OpenStreetMap contributors, &copy; CARTO)
* **Elevation Overlay:** AWS Open Data Terrain Tiles (Mapzen Terrarium format)
* **Icons:** Lucide React
* **Styling:** Tailwind CSS
