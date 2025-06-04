## Overview

Elessar is a fully automated, AI-integrated UAP (Unidentified Aerial Phenomena) tracking and mapping pipeline. Built as a Jamstack app, it scrapes video-based sightings from public sources (currently Reddit, with X and Instagram integrations in progress), parses timestamps and geolocations with a hybrid regex + AI approach, stores vetted records in PostgreSQL, correlates UAP events against historical ADS-B flight pings, and renders everything in a dynamic Mapbox GL web interface. The result is a near–real-time, high-confidence UAP map—video only, no static images or text-only reports. Future versions will incorporate crowd sourcing and server side hosting to preserve sighting integrity.

---


## Key Features

- **Video-Only UAP Ingestion**  
  - Scrapes r/UFOs (Reddit) for video posts (native Reddit video, YouTube/Vimeo embeds)  
  - Filters by flair (e.g., “sighting,” “likely identified,” “confirmed hoax,” etc.)  
  - Ignores text-only or static image posts

- **Hybrid Regex + AI Parsing**  
  - Tiered date parsing: first attempt with regex, fallback/verification via a custom `ai_parser` (OpenAI GPT-4.1-mini)  
  - Regex loc-extraction for “Location: …” patterns; AI fallback when regex fails  
  - Automatic time zone inference (via latitude/longitude) for converting local event times to UTC

- **PostgreSQL Integration**  
  - Staging table for posts missing latitude/longitude, main `uap_sightings` table for fully validated records  
  - Geometry column (`geom`) populated via `ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)`  
  - Upsert logic to avoid duplicate insertions (`ON CONFLICT DO NOTHING`)  
  - Confidence rating recalculation (0–10 scale) based on vetting status, description length, account reputation, weather conditions, anomaly scores, etc.

- **ADS-B Flight Correlation**  
  - Batch fetch of historical flight tarballs (from the `adsblol/globe_history_2025` GitHub releases) based on event date  
  - Radius/window filtering: ±40 NM, ± 5 minutes (configurable)  
  - Extracts “ping” traces and deduplicates by ICAO to identify which flights were airborne during the UAP event  
  - Bulk upsert into a `flight_pings` table with keys `(sighting_id, icao, ping_time)` to avoid double-insertion

- **Mapbox GL Front-End**  
  - Clustered UAP sightings with confidence-based pulsing circles (ripple animation)  
  - Custom “hitbox” layer for easy click/tap on individual points  
  - Detailed popups showing:  
    - Report date vs. event date (UTC)  
    - Confidence score (color-coded)  
    - Description snippet (first ~200 chars + “View at Source” link)  
    - Full attribute table (collapsible via `<details>`)  
    - “Flight Data” button (if ADS-B pings exist for that sighting)  

- **Flight Widget Animation**  
  - On-click ICAO animation:  
    - Shows all pings for a flight as a LineString (blue-highlight line)  
    - Updates a moving Mapbox GL popup at each ping with altitude and timestamp  
    - Play/pause/close controls gated until a sighting with flight data is selected  
  - “Reload Flights” button to re-load data from a cached GeoJSON array without re-fetching

- **Interactive Sidebar/Drawer**  
  - **Recent**: Top 10 newest sightings with “fly-to” links  
  - **Filter**: Sort (newest/oldest) + filter (all/vetted/unreviewed) + dynamic list of filtered sightings (with “fly-to”)  
  - **Timeline**: Toggle bottom-center range slider to filter visible points by report date (slider label updates in real time)  
  - **Stats**: Last 24 hr total, high-confidence (≥ 8) in last 7 days, plus a 7-day sparkline (pure CSS-div bar chart)  
  - **Confidence**: Placeholder for future confidence detail visualizations

- **Loading & UX Touches**  
  - Full-screen “For the hope that was hidden…” animated overlay on initial load (two lines fade in/out, then map un-blurs)  
  - Persistent “Alpha Notice” banner at the very top (fixed) warning of potential date/location quirks and limited mobile support  
  - Custom “hamburger” + sliding drawer UI (hidden/off-screen until toggled) styled with Inter font + semi-transparent dark backgrounds  
  - **About** modal with:  
    - Detailed project description (video-only, AI/vetting pipeline)  
    - Quick links (GitHub, X, email, Buy Me a Coffee)  
    - Version, FAQ, Known Issues list (e.g., popup duplication, timeline toggle glitch)

