'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Search, Navigation, MapPin, Loader2, Check } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
import { accountMessages } from '@/lib/i18n/messages/account';

export interface LocationMapProps {
  center?: { lat: number; lng: number };
  zoom?: number;
  onLocationSelect?: (coords: { lat: number; lng: number; address?: string }) => void;
  markerPosition?: { lat: number; lng: number } | null;
  radiusKm?: number | null;
  height?: string;
  draggable?: boolean;
}

const PAKISTAN_CITIES = [
  { name: 'Lahore', lat: 31.5204, lng: 74.3587 },
  { name: 'Askari 11', lat: 31.4720, lng: 74.4530 },
  { name: 'Karachi', lat: 24.8607, lng: 67.0011 },
  { name: 'Islamabad', lat: 33.6844, lng: 73.0479 },
  { name: 'Rawalpindi', lat: 33.5651, lng: 73.0169 },
];

function LocationMapInner({
  center = { lat: 31.5204, lng: 74.3587 }, // Default Lahore
  zoom = 13,
  onLocationSelect,
  markerPosition,
  radiusKm = null,
  height = '320px',
  draggable = true,
}: LocationMapProps) {
  const t = useT(accountMessages);
  const tc = useT(commonMessages);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const circleRef = useRef<any>(null);
  const LRef = useRef<any>(null);

  const [isLoaded, setIsLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [currentCoords, setCurrentCoords] = useState<{ lat: number; lng: number } | null>(
    markerPosition ?? null
  );

  // Initialize Leaflet Map
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let isMounted = true;

    const initMap = async () => {
      try {
        const L = (await import('leaflet')).default;
        // Dynamically ensure CSS is present
        if (!document.getElementById('leaflet-css')) {
          const link = document.createElement('link');
          link.id = 'leaflet-css';
          link.rel = 'stylesheet';
          link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
          document.head.appendChild(link);
        }

        if (!isMounted || !mapRef.current) return;

        delete (L.Icon.Default.prototype as any)._getIconUrl;
        L.Icon.Default.mergeOptions({
          iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
          iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
          shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        });

        if (!mapInstanceRef.current && mapRef.current) {
          const initialPos = markerPosition || center;
          const map = L.map(mapRef.current, {
            center: [initialPos.lat, initialPos.lng],
            zoom,
            zoomControl: false,
          });

          // Add clean zoom control top-right
          L.control.zoom({ position: 'topright' }).addTo(map);

          // Tile Layer: OpenStreetMap with clean styling
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap',
            maxZoom: 19,
          }).addTo(map);

          // Minimalist custom pin
          const pinIcon = L.divIcon({
            className: 'custom-pin',
            html: `
              <div style="position: relative; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center;">
                <div style="position: absolute; width: 34px; height: 34px; background: rgba(255, 85, 0, 0.2); border-radius: 50%; animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
                <div style="width: 28px; height: 28px; background: #FF5500; border: 2.5px solid white; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); box-shadow: 0 4px 10px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center;">
                  <div style="width: 8px; height: 8px; background: white; border-radius: 50%; transform: rotate(45deg);"></div>
                </div>
              </div>
            `,
            iconSize: [34, 34],
            iconAnchor: [17, 30],
          });

          const marker = L.marker([initialPos.lat, initialPos.lng], {
            icon: pinIcon,
            draggable,
          }).addTo(map);

          marker.on('dragend', () => {
            const pos = marker.getLatLng();
            setCurrentCoords({ lat: pos.lat, lng: pos.lng });
            onLocationSelect?.({ lat: pos.lat, lng: pos.lng });
          });

          map.on('click', (e: any) => {
            marker.setLatLng(e.latlng);
            setCurrentCoords({ lat: e.latlng.lat, lng: e.latlng.lng });
            onLocationSelect?.({ lat: e.latlng.lat, lng: e.latlng.lng });
          });

          mapInstanceRef.current = map;
          markerRef.current = marker;
          LRef.current = L;

          // Crucial: Invalidate size after layout completes to avoid blank/grey tiles
          setTimeout(() => {
            map.invalidateSize();
          }, 200);
        }

        setIsLoaded(true);
      } catch (err) {
        console.error('Failed to init Leaflet map:', err);
      }
    };

    initMap();

    // ResizeObserver to automatically resize map when container dimensions change
    let resizeObserver: ResizeObserver | null = null;
    if (mapRef.current) {
      resizeObserver = new ResizeObserver(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize();
        }
      });
      resizeObserver.observe(mapRef.current);
    }

    return () => {
      isMounted = false;
      if (resizeObserver) resizeObserver.disconnect();
      if (circleRef.current && mapInstanceRef.current) {
        mapInstanceRef.current.removeLayer(circleRef.current);
        circleRef.current = null;
      }
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markerRef.current = null;
        LRef.current = null;
      }
    };
  }, []);

  // Update marker position when external markerPosition changes
  useEffect(() => {
    if (markerRef.current && markerPosition) {
      markerRef.current.setLatLng([markerPosition.lat, markerPosition.lng]);
      mapInstanceRef.current?.panTo([markerPosition.lat, markerPosition.lng]);
      setCurrentCoords(markerPosition);
    }
  }, [markerPosition]);

  // Radius circle
  useEffect(() => {
    if (!isLoaded || !mapInstanceRef.current || !LRef.current) return;
    const map = mapInstanceRef.current;
    const L = LRef.current;
    const pos = markerPosition ?? currentCoords ?? center;

    if (circleRef.current) {
      map.removeLayer(circleRef.current);
      circleRef.current = null;
    }

    if (radiusKm != null && radiusKm > 0 && pos) {
      const circle = L.circle([pos.lat, pos.lng], {
        radius: radiusKm * 1000,
        color: '#10b981',
        fillColor: '#10b981',
        fillOpacity: 0.15,
        weight: 2,
      }).addTo(map);
      circleRef.current = circle;
    }
  }, [isLoaded, markerPosition, currentCoords, center, radiusKm]);

  // Jump to specific coordinates
  const jumpTo = useCallback((lat: number, lng: number, zoomLevel = 15, address?: string) => {
    if (!mapInstanceRef.current || !markerRef.current) return;
    mapInstanceRef.current.flyTo([lat, lng], zoomLevel, { duration: 1.2 });
    markerRef.current.setLatLng([lat, lng]);
    setCurrentCoords({ lat, lng });
    onLocationSelect?.({ lat, lng, address });
  }, [onLocationSelect]);

  // Handle Geolocation with graceful fallback
  const handleLocateMe = async () => {
    setLocating(true);

    const tryBrowserGps = (): Promise<{ lat: number; lng: number } | null> => {
      return new Promise((resolve) => {
        if (typeof window === 'undefined' || !navigator.geolocation) {
          resolve(null);
          return;
        }

        let resolved = false;
        const timer = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            resolve(null);
          }
        }, 4000);

        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (!resolved) {
              resolved = true;
              clearTimeout(timer);
              resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
            }
          },
          () => {
            if (!resolved) {
              resolved = true;
              clearTimeout(timer);
              resolve(null);
            }
          },
          { enableHighAccuracy: false, timeout: 3500, maximumAge: 60000 }
        );
      });
    };

    try {
      const browserCoords = await tryBrowserGps();
      if (browserCoords) {
        jumpTo(browserCoords.lat, browserCoords.lng, 16);
        return;
      }

      // Fallback to IP-based location
      const ipRes = await fetch('/api/geocode/ip');
      if (ipRes.ok) {
        const ipData = await ipRes.json();
        if (ipData.lat && ipData.lng) {
          jumpTo(ipData.lat, ipData.lng, 15, ipData.city);
          return;
        }
      }

      // Default fallback
      jumpTo(31.5204, 74.3587, 14, 'Lahore');
    } catch (err) {
      console.warn('Locate me failed, using default:', err);
      jumpTo(31.5204, 74.3587, 14, 'Lahore');
    } finally {
      setLocating(false);
    }
  };

  // Search Address / Society
  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;

    setIsSearching(true);
    try {
      const res = await fetch(`/api/geocode/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lng = parseFloat(data[0].lon);
        const displayName = data[0].display_name;
        jumpTo(lat, lng, 15, displayName);
      }
    } catch (err) {
      console.warn('Geocoding search failed:', err);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="relative rounded-2xl overflow-hidden border border-slate-200 shadow-xs bg-slate-50">
      {/* Top Search & City Bar */}
      <div className="p-2.5 bg-white border-b border-slate-100 flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[200px] relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSearch();
              }
            }}
            placeholder={t('mapSearchPlaceholder')}
            className="w-full ps-8 pe-16 py-1.5 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-[#FF5500] outline-none transition-all"
          />
          <Search className="w-3.5 h-3.5 text-slate-400 absolute start-2.5 top-2.5 pointer-events-none" />
          <button
            type="button"
            onClick={() => handleSearch()}
            disabled={isSearching || !searchQuery.trim()}
            className="absolute end-1 top-1 px-2.5 py-1 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white text-[10px] font-bold rounded-lg transition-colors cursor-pointer"
          >
            {isSearching ? <Loader2 className="w-3 h-3 animate-spin" /> : tc('search')}
          </button>
        </div>

        {/* Quick City Presets */}
        <div className="flex items-center gap-1 overflow-x-auto py-0.5">
          {PAKISTAN_CITIES.map((c) => (
            <button
              key={c.name}
              type="button"
              onClick={() => jumpTo(c.lat, c.lng, c.name === 'Askari 11' ? 16 : 13)}
              className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium transition-colors shrink-0 cursor-pointer"
            >
              {c.name}
            </button>
          ))}
          <button
            type="button"
            onClick={handleLocateMe}
            disabled={locating}
            title={t('detectMyLocation')}
            className="p-1.5 rounded-lg bg-orange-50 hover:bg-orange-100 text-[#FF5500] text-xs font-bold transition-colors shrink-0 cursor-pointer ms-auto flex items-center gap-1"
          >
            {locating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Navigation className="w-3.5 h-3.5" />
            )}
            <span className="text-[10px] font-semibold hidden sm:inline">{t('myLocation')}</span>
          </button>
        </div>
      </div>

      {/* Map DOM Element */}
      <div ref={mapRef} style={{ height, width: '100%' }} className="z-0" />

      {/* Loading State */}
      {!isLoaded && (
        <div className="absolute inset-0 bg-slate-50 flex items-center justify-center z-10">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin text-[#FF5500]" />
            <span>{t('loadingMap')}</span>
          </div>
        </div>
      )}

      {/* Bottom Coordinates & Hint */}
      <div className="px-3 py-1.5 bg-white/95 backdrop-blur-xs border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
        <span className="flex items-center gap-1 text-slate-600">
          <MapPin className="w-3 h-3 text-[#FF5500]" />
          <span>{t('mapHint')}</span>
        </span>
        {currentCoords && (
          <span className="font-mono font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-[10px]" data-ltr>
            {currentCoords.lat.toFixed(4)}, {currentCoords.lng.toFixed(4)}
          </span>
        )}
      </div>
    </div>
  );
}

function MapLoadingText() {
  const t = useT(accountMessages);
  return <span>{t('loadingMap')}</span>;
}

const LocationMap = dynamic(() => Promise.resolve(LocationMapInner), {
  ssr: false,
  loading: () => (
    <div className="bg-slate-100 rounded-2xl flex items-center justify-center border border-slate-200" style={{ height: '300px' }}>
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
        <Loader2 className="w-4 h-4 animate-spin" />
        <MapLoadingText />
      </div>
    </div>
  ),
});

export default LocationMap;
