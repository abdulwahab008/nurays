'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';

interface LocationMapProps {
  center?: { lat: number; lng: number };
  zoom?: number;
  onLocationSelect?: (coords: { lat: number; lng: number; address?: string }) => void;
  markerPosition?: { lat: number; lng: number } | null;
  /** When set, draw a circle of this radius (km) around the marker so users can see the free-delivery area */
  radiusKm?: number | null;
  height?: string;
  draggable?: boolean;
}

// This component will be loaded dynamically without SSR
function LocationMapInner({
  center = { lat: 24.8607, lng: 67.0011 }, // Karachi default
  zoom = 14,
  onLocationSelect,
  markerPosition,
  radiusKm = null,
  height = '300px',
  draggable = true,
}: LocationMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const circleRef = useRef<any>(null);
  const LRef = useRef<any>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // Only run on client side
    if (typeof window === 'undefined') return;

    const initMap = async () => {
      // Dynamically import Leaflet
      const L = (await import('leaflet')).default;

      // Fix default marker icon issue with webpack
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      if (!mapRef.current) return;

      // Initialize map if not already done
      if (!mapInstanceRef.current) {
        const map = L.map(mapRef.current).setView([center.lat, center.lng], zoom);

        // Add OpenStreetMap tiles (FREE!)
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        }).addTo(map);

        // Create a custom icon
        const customIcon = L.divIcon({
          className: 'custom-marker',
          html: `<div style="
            background: linear-gradient(135deg, #f97316, #ef4444);
            width: 40px;
            height: 40px;
            border-radius: 50% 50% 50% 0;
            transform: rotate(-45deg);
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 12px rgba(249, 115, 22, 0.5);
            border: 3px solid white;
          ">
            <span style="transform: rotate(45deg); font-size: 18px;">📍</span>
          </div>`,
          iconSize: [40, 40],
          iconAnchor: [20, 40],
        });

        // Add initial marker
        const initialPos = markerPosition || center;
        const marker = L.marker([initialPos.lat, initialPos.lng], { 
          icon: customIcon,
          draggable: draggable,
        }).addTo(map);

        // Handle marker drag
        if (draggable) {
          marker.on('dragend', function() {
            const pos = marker.getLatLng();
            onLocationSelect?.({ lat: pos.lat, lng: pos.lng });
          });
        }

        // Handle map click to move marker
        map.on('click', function(e: any) {
          marker.setLatLng(e.latlng);
          onLocationSelect?.({ lat: e.latlng.lat, lng: e.latlng.lng });
        });

        mapInstanceRef.current = map;
        markerRef.current = marker;
        LRef.current = L;
      }

      setIsLoaded(true);
    };

    initMap();

    // Cleanup
    return () => {
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

  // Update marker position when props change
  useEffect(() => {
    if (markerRef.current && markerPosition) {
      markerRef.current.setLatLng([markerPosition.lat, markerPosition.lng]);
      mapInstanceRef.current?.setView([markerPosition.lat, markerPosition.lng], mapInstanceRef.current.getZoom());
    }
  }, [markerPosition]);

  // Update map center when center prop changes
  useEffect(() => {
    if (mapInstanceRef.current && center) {
      mapInstanceRef.current.setView([center.lat, center.lng], mapInstanceRef.current.getZoom());
    }
  }, [center]);

  // Draw or remove free-delivery radius circle
  useEffect(() => {
    if (!isLoaded || !mapInstanceRef.current || !LRef.current) return;
    const map = mapInstanceRef.current;
    const L = LRef.current;
    const pos = markerPosition ?? center;

    if (circleRef.current) {
      map.removeLayer(circleRef.current);
      circleRef.current = null;
    }

    if (radiusKm != null && radiusKm > 0 && pos) {
      const circle = L.circle([pos.lat, pos.lng], {
        radius: radiusKm * 1000, // Leaflet uses meters
        color: '#16a34a',
        fillColor: '#22c55e',
        fillOpacity: 0.2,
        weight: 2,
      });
      circle.addTo(map);
      circleRef.current = circle;
    }
  }, [isLoaded, markerPosition, center, radiusKm]);

  return (
    <div className="relative rounded-xl overflow-hidden border border-gray-200">
      {/* Map Container */}
      <div 
        ref={mapRef} 
        style={{ height, width: '100%' }}
        className="z-0"
      />
      
      {/* Loading overlay */}
      {!isLoaded && (
        <div className="absolute inset-0 bg-gray-100 flex items-center justify-center">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-gray-600 font-medium">Loading map...</p>
          </div>
        </div>
      )}
      
      {/* Instructions overlay */}
      <div className="absolute bottom-3 left-3 right-3 bg-white/95 backdrop-blur-sm rounded-lg px-4 py-2 shadow-lg z-[1000]">
        <p className="text-sm text-gray-600">
          <span className="font-semibold text-orange-600">Tip:</span> Click or drag the marker to set your location.
          {radiusKm != null && radiusKm > 0 && (
            <span className="block mt-1 text-green-700"> Green circle = free delivery within {radiusKm} km.</span>
          )}
        </p>
      </div>
    </div>
  );
}

// Export with dynamic loading (no SSR) to avoid window is not defined errors
const LocationMap = dynamic(() => Promise.resolve(LocationMapInner), {
  ssr: false,
  loading: () => (
    <div className="bg-gray-100 rounded-xl flex items-center justify-center" style={{ height: '300px' }}>
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
        <p className="text-gray-600 font-medium">Loading map...</p>
      </div>
    </div>
  ),
});

export default LocationMap;
