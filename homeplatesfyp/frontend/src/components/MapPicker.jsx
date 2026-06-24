import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Compass, MapPin } from 'lucide-react';
import API from '../api';

// Fix Leaflet marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Custom customer house marker icon matching existing LiveTrackingMap style
const makePickerIcon = () =>
  L.divIcon({
    className: '',
    html: `<div style="
      width:40px;height:40px;
      background:#10B981;
      border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);
      border:3px solid white;
      box-shadow:0 4px 15px rgba(0,0,0,0.35);
      display:flex;align-items:center;justify-content:center;
    "><span style="transform:rotate(45deg);font-size:17px;line-height:1">🏠</span></div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 40],
  });

const CUSTOMER_PICKER_ICON = makePickerIcon();

// View Controller to update map center dynamically
const ChangeView = ({ center, zoom }) => {
  const map = useMap();
  const prevCenterRef = useRef('');
  useEffect(() => {
    if (!center) return;
    const key = `${center[0]},${center[1]}`;
    if (prevCenterRef.current === key) return;
    prevCenterRef.current = key;
    map.setView(center, zoom);
  }, [center, zoom, map]);
};

// Click handler to position pin on map click
const MapEventsHandler = ({ onClick }) => {
  useMapEvents({
    click(e) {
      onClick(e.latlng);
    },
  });
  return null;
};

const MapPicker = ({ onLocationSelected, initialLocation = null }) => {
  const defaultCenter = { lat: 31.5497, lng: 74.3436 }; // Lahore, Pakistan fallback
  const [position, setPosition] = useState(
    initialLocation
      ? { lat: initialLocation[1], lng: initialLocation[0] } // [longitude, latitude] GeoJSON convert
      : defaultCenter
  );
  const [mapCenter, setMapCenter] = useState(
    initialLocation
      ? [initialLocation[1], initialLocation[0]]
      : [defaultCenter.lat, defaultCenter.lng]
  );
  const [address, setAddress] = useState('Fetching your address...');
  const [loadingAddress, setLoadingAddress] = useState(false);

  // Reverse-geocode coordinates via backend Nominatim proxy
  const reverseGeocode = useCallback(async (lat, lng) => {
    setLoadingAddress(true);
    try {
      const res = await API.get(`/api/customer/reverse-geocode?lat=${lat}&lng=${lng}`);
      const resolvedAddress = res.data.address || `Coordinates: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      setAddress(resolvedAddress);
      if (onLocationSelected) {
        onLocationSelected({
          type: 'Point',
          coordinates: [lng, lat], // [longitude, latitude] GeoJSON
          formattedAddress: resolvedAddress,
        });
      }
    } catch (err) {
      console.error('Reverse geocode error:', err);
      const fallbackAddress = `Coordinates: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      setAddress(fallbackAddress);
      if (onLocationSelected) {
        onLocationSelected({
          type: 'Point',
          coordinates: [lng, lat],
          formattedAddress: fallbackAddress,
        });
      }
    } finally {
      setLoadingAddress(false);
    }
  }, [onLocationSelected]);

  // Handle geolocation
  const handleLocateMe = useCallback(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          setPosition({ lat, lng });
          setMapCenter([lat, lng]);
          reverseGeocode(lat, lng);
        },
        (error) => {
          console.warn('Geolocation denied or failed. Using fallback Lahore center.', error);
          reverseGeocode(position.lat, position.lng);
        },
        { enableHighAccuracy: true, timeout: 5000 }
      );
    } else {
      reverseGeocode(position.lat, position.lng);
    }
  }, [position.lat, position.lng, reverseGeocode]);

  // Get initial location on mount
  useEffect(() => {
    if (!initialLocation) {
      handleLocateMe();
    } else {
      reverseGeocode(initialLocation[1], initialLocation[0]);
    }
  }, []);

  // Draggable marker event handler - directly extract target from event to guarantee compatibility
  const markerEvents = useMemo(
    () => ({
      dragend(e) {
        const marker = e.target;
        if (marker != null) {
          const latLng = marker.getLatLng();
          setPosition({ lat: latLng.lat, lng: latLng.lng });
          reverseGeocode(latLng.lat, latLng.lng);
        }
      },
    }),
    [reverseGeocode]
  );

  return (
    <div className="space-y-4 text-left font-sans">
      <div className="flex justify-between items-center gap-4">
        <div className="flex items-center gap-2 text-[#1A2316]">
          <MapPin size={16} className="text-[#10B981] flex-shrink-0" />
          <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">Drag Pin to Set Location</span>
        </div>
        <button
          type="button"
          onClick={handleLocateMe}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/20 rounded-xl text-[9px] font-black uppercase tracking-wider hover:bg-[#10B981]/25 transition-all"
        >
          <Compass size={12} /> Locate Me
        </button>
      </div>

      <div 
        className="h-[260px] w-full rounded-2xl overflow-hidden shadow-md border-2 border-gray-100 relative z-30"
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <MapContainer
          center={mapCenter}
          zoom={14}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={true}
        >
          <ChangeView center={mapCenter} zoom={14} />
          <MapEventsHandler onClick={(latLng) => {
            setPosition({ lat: latLng.lat, lng: latLng.lng });
            reverseGeocode(latLng.lat, latLng.lng);
          }} />
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
          <Marker
            draggable={true}
            eventHandlers={markerEvents}
            position={[position.lat, position.lng]}
            icon={CUSTOMER_PICKER_ICON}
          />
        </MapContainer>
      </div>

      <div className="bg-gray-50 p-4 rounded-xl border border-gray-150">
        <p className="text-[8px] font-black uppercase text-gray-400 mb-1">Detected Address</p>
        <p className={`text-xs font-bold text-[#1A2316] leading-relaxed ${loadingAddress ? 'animate-pulse text-gray-400' : ''}`}>
          {loadingAddress ? 'Resolving location address...' : address}
        </p>
      </div>
    </div>
  );
};

export default MapPicker;
