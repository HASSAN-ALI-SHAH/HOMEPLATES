import React, { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// ─── Fix Leaflet's default marker icon broken by bundlers ──────────────────────
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// ─── Custom beautiful div-icons ────────────────────────────────────────────────
const makeIcon = (bg, emoji, size = 40) =>
  L.divIcon({
    className: '',
    html: `<div style="
      width:${size}px;height:${size}px;
      background:${bg};
      border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);
      border:3px solid white;
      box-shadow:0 4px 15px rgba(0,0,0,0.35);
      display:flex;align-items:center;justify-content:center;
    "><span style="transform:rotate(45deg);font-size:${size * 0.42}px;line-height:1">${emoji}</span></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size - 4],
  });

const RIDER_ICON    = makeIcon('#1A2316', '🏍️');
const CHEF_ICON     = makeIcon('#FBBF24', '👨‍🍳');
const CUSTOMER_ICON = makeIcon('#10B981', '🏠');

// ─── Auto-fit map whenever the set of visible markers changes ────────────────
const AutoFitBounds = ({ positions }) => {
  const map    = useMap();
  const prevKey = useRef('');

  useEffect(() => {
    const valid = positions.filter((p) => p && p.length === 2 && p[0] != null && p[1] != null);
    if (valid.length === 0) return;
    const key = valid.map(p => p.join(',')).join('|');
    // Only re-fit when the set of pins changes (e.g. rider pin first appears)
    if (prevKey.current === key) return;
    prevKey.current = key;
    try {
      const bounds = L.latLngBounds(valid);
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
      }
    } catch (_) {}
  }, [positions, map]);

  return null;
};

// ─── PanToRider — smoothly follow the rider as they move ──────────────────────
const PanToRider = ({ riderLocation }) => {
  const map     = useMap();
  const prevRef = useRef(null);

  useEffect(() => {
    if (!riderLocation) return;
    const { lat, lng } = riderLocation;
    const key = `${lat},${lng}`;
    if (prevRef.current === key) return;
    prevRef.current = key;
    map.panTo([lat, lng], { animate: true, duration: 1 });
  }, [riderLocation, map]);

  return null;
};

// ─── Main Component ────────────────────────────────────────────────────────────
/**
 * Props:
 *  riderLocation    — { lat, lng } | null   — live position (animated)
 *  chefLocation     — { lat, lng } | null   — static pickup point
 *  customerLocation — { lat, lng } | null   — static drop-off point
 *  phase            — 'pickup' | 'delivery' | 'all'  (default 'all')
 *                      'pickup'   = draw rider→chef line only
 *                      'delivery' = draw rider→customer line only
 *                      'all'      = draw rider→chef→customer line
 *  height           — CSS string (default '420px')
 *  showPolyline     — bool (default true)
 *  followRider      — bool (default false) — pan to rider automatically
 *  className        — extra CSS classes on wrapper
 */
const LiveTrackingMap = ({
  riderLocation,
  chefLocation,
  customerLocation,
  phase = 'all',
  height = '420px',
  showPolyline = true,
  followRider = false,
  className = '',
}) => {
  // Default center: Lahore, Pakistan (fallback when nothing is geocoded yet)
  const defaultCenter = [31.5497, 74.3436];

  const initialCenter = (() => {
    if (riderLocation)    return [riderLocation.lat,    riderLocation.lng];
    if (chefLocation)     return [chefLocation.lat,     chefLocation.lng];
    if (customerLocation) return [customerLocation.lat, customerLocation.lng];
    return defaultCenter;
  })();

  // Positions for bounds-fitting
  const allPositions = [
    riderLocation    ? [riderLocation.lat,    riderLocation.lng]    : null,
    chefLocation     ? [chefLocation.lat,     chefLocation.lng]     : null,
    customerLocation ? [customerLocation.lat, customerLocation.lng] : null,
  ].filter(Boolean);

  // Build polyline based on current delivery phase:
  //   pickup   → rider→chef
  //   delivery → rider→customer
  //   all      → rider→chef→customer (overview)
  const routePoints = [];
  if (riderLocation) {
    if ((phase === 'pickup' || phase === 'all') && chefLocation) {
      routePoints.push(
        [riderLocation.lat, riderLocation.lng],
        [chefLocation.lat,  chefLocation.lng]
      );
    }
    if (phase === 'delivery' && customerLocation) {
      routePoints.push(
        [riderLocation.lat,     riderLocation.lng],
        [customerLocation.lat,  customerLocation.lng]
      );
    }
    if (phase === 'all' && customerLocation && routePoints.length > 0) {
      // extend the 'all' line to include customer after chef
      routePoints.push([customerLocation.lat, customerLocation.lng]);
    }
  }

  return (
    <div
      style={{ height, borderRadius: '28px', overflow: 'hidden', position: 'relative' }}
      className={`shadow-2xl border-4 border-white ${className}`}
    >
      <MapContainer
        center={initialCenter}
        zoom={13}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={false}
        zoomControl={true}
        attributionControl={true}
      >
        {/* OpenStreetMap tiles — 100% free, no API key */}
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          maxZoom={19}
        />

        {/* Rider marker */}
        {riderLocation && (
          <Marker position={[riderLocation.lat, riderLocation.lng]} icon={RIDER_ICON}>
            <Popup>
              <div style={{ fontFamily: 'sans-serif', textAlign: 'center' }}>
                <strong style={{ fontSize: 13 }}>🏍️ Rider</strong>
                <br />
                <span style={{ fontSize: 11, color: '#666' }}>Live Location</span>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Chef / Kitchen marker */}
        {chefLocation && (
          <Marker position={[chefLocation.lat, chefLocation.lng]} icon={CHEF_ICON}>
            <Popup>
              <div style={{ fontFamily: 'sans-serif', textAlign: 'center' }}>
                <strong style={{ fontSize: 13 }}>👨‍🍳 Chef's Kitchen</strong>
                <br />
                <span style={{ fontSize: 11, color: '#666' }}>Pickup Point</span>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Customer / Delivery marker */}
        {customerLocation && (
          <Marker position={[customerLocation.lat, customerLocation.lng]} icon={CUSTOMER_ICON}>
            <Popup>
              <div style={{ fontFamily: 'sans-serif', textAlign: 'center' }}>
                <strong style={{ fontSize: 13 }}>🏠 Customer</strong>
                <br />
                <span style={{ fontSize: 11, color: '#666' }}>Delivery Destination</span>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Route polyline */}
        {showPolyline && routePoints.length >= 2 && (
          <Polyline
            positions={routePoints}
            color="#FBBF24"
            weight={3.5}
            dashArray="10, 8"
            opacity={0.85}
          />
        )}

        {/* Helpers */}
        <AutoFitBounds positions={allPositions} />
        {followRider && <PanToRider riderLocation={riderLocation} />}
      </MapContainer>

      {/* Legend overlay */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          zIndex: 1000,
          background: 'rgba(26,35,22,0.88)',
          backdropFilter: 'blur(8px)',
          borderRadius: 14,
          padding: '8px 12px',
          display: 'flex',
          gap: 12,
        }}
      >
        {riderLocation    && <span style={{ fontSize: 11, color: '#FBBF24', fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1 }}>🏍️ Rider</span>}
        {chefLocation     && <span style={{ fontSize: 11, color: '#fff',    fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1 }}>👨‍🍳 Kitchen</span>}
        {customerLocation && <span style={{ fontSize: 11, color: '#10B981', fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1 }}>🏠 Dropoff</span>}
      </div>
    </div>
  );
};

export default LiveTrackingMap;
