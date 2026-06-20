// Nominatim (OpenStreetMap) geocoding — 100% free, no API key needed
// Fallback: hardcoded coordinates for major Pakistani cities

const geocodeCache = {};

// ─── Hardcoded Pakistani city coordinates (fallback when Nominatim fails) ──────
const PAKISTAN_CITIES = {
  lahore:      { lat: 31.5497, lng: 74.3436 },
  karachi:     { lat: 24.8607, lng: 67.0011 },
  islamabad:   { lat: 33.6844, lng: 73.0479 },
  rawalpindi:  { lat: 33.5651, lng: 73.0169 },
  faisalabad:  { lat: 31.4504, lng: 73.1350 },
  multan:      { lat: 30.1575, lng: 71.5249 },
  peshawar:    { lat: 34.0151, lng: 71.5249 },
  quetta:      { lat: 30.1798, lng: 66.9750 },
  sialkot:     { lat: 32.4945, lng: 74.5229 },
  gujranwala:  { lat: 32.1617, lng: 74.1883 },
  hyderabad:   { lat: 25.3960, lng: 68.3578 },
  abbottabad:  { lat: 34.1463, lng: 73.2117 },
  bahawalpur:  { lat: 29.3956, lng: 71.6836 },
  sargodha:    { lat: 32.0836, lng: 72.6711 },
};

/**
 * Extract first matching Pakistani city name from an address string.
 */
const cityFromAddress = (address) => {
  if (!address) return null;
  const lower = address.toLowerCase();
  for (const city of Object.keys(PAKISTAN_CITIES)) {
    if (lower.includes(city)) return city;
  }
  return null;
};

/**
 * Try Nominatim for a given query string. Returns { lat, lng } or null.
 */
const nominatim = async (query) => {
  try {
    const url =
      `https://nominatim.openstreetmap.org/search` +
      `?format=json&q=${encodeURIComponent(query)}&limit=1&countrycodes=pk`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'HomePlates/1.0 (homeplates.fyp@gmail.com)' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
  } catch (_) {}
  return null;
};

/**
 * Convert an address string → { lat, lng }.
 * Strategy:
 *   1. Return from in-memory cache if available.
 *   2. Try Nominatim with full address.
 *   3. If that fails, try Nominatim with just the extracted city name.
 *   4. If still failing, use hardcoded city fallback.
 * Returns null only if all strategies fail.
 */
export const geocodeAddress = async (address) => {
  if (!address || address.trim().length < 2) return null;

  const key = address.trim().toLowerCase();
  if (geocodeCache[key]) return geocodeCache[key];

  // 1️⃣ Nominatim — full address (Pakistan filter)
  await new Promise((r) => setTimeout(r, 400)); // respect 1 req/sec policy
  let result = await nominatim(address);
  if (result) {
    geocodeCache[key] = result;
    return result;
  }

  // 2️⃣ Nominatim — city name only (more likely to succeed)
  const city = cityFromAddress(address);
  if (city) {
    await new Promise((r) => setTimeout(r, 400));
    result = await nominatim(city + ', Pakistan');
    if (result) {
      geocodeCache[key] = result;
      return result;
    }

    // 3️⃣ Hardcoded fallback for known Pakistani cities
    const fallback = PAKISTAN_CITIES[city];
    if (fallback) {
      geocodeCache[key] = fallback;
      return fallback;
    }
  }

  // 4️⃣ Nothing worked
  console.warn('geocodeAddress: could not resolve →', address);
  return null;
};

/**
 * Quick synchronous lookup for known city names.
 * Returns { lat, lng } or null — no network call.
 */
export const getCityCoords = (cityName) => {
  if (!cityName) return null;
  return PAKISTAN_CITIES[cityName.toLowerCase()] || null;
};
