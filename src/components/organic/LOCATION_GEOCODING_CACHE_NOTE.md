# Audience Location Geocoding Note

Status: implemented (Google Geocoding + 12h cache).

Current behavior:
- Country markers use a static ISO-country centroid map.
- City markers use Google geocoded coordinates from server payload when available; curated fallback coordinates are used if unresolved.
- In country mode, city markers automatically appear once map zoom reaches `2.35x`.
- Clicking a country marker zooms in and scopes city markers to that country when `countryCode` is present.

Server-side geocoding flow:
1. Parse location demographics from Meta (`country`, `city`) in `fetch-organic-analytics`.
2. Normalize cache key (`google_geocode:city:<normalized_city>:<country|global>`).
3. Read cache first from `brand_profiles.reporting_cache`.
4. Geocode cache misses using Google Geocoding API.
5. Write successful geocode results back to `reporting_cache`.
6. Attach `lat`, `lng`, and `countryCode` to city demographic entries returned to the frontend.

Cache expectations:
- Read cache before geocoding.
- Write cache after geocoding misses.
- Freshness window: 12 hours.
- Keep unresolved locations in payload so UI can show mapped/total counts.
