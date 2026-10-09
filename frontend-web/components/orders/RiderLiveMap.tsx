'use client';

import { MAP_TILE_URL, MAP_ATTRIBUTION, MAP_MAX_ZOOM } from '@/lib/map-config';
import 'leaflet/dist/leaflet.css';

import { useEffect, useRef } from 'react';
import { useT } from '@/lib/i18n';
import { ordersMessages } from '@/lib/i18n/messages/orders';

interface Point {
  latitude: number;
  longitude: number;
}

interface Props {
  rider: Point;
  /** The delivery address, when its location is known. */
  destination?: Point | null;
  height?: string;
}

const riderIconHtml = `
  <div style="width:36px;height:36px;border-radius:50%;background:#FF5500;border:3px solid white;box-shadow:0 4px 10px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;font-size:18px;">🛵</div>`;
const homeIconHtml = `
  <div style="width:30px;height:30px;border-radius:50%;background:#0f172a;border:3px solid white;box-shadow:0 4px 10px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;font-size:14px;">🏠</div>`;

/**
 * Where the rider is, and the customer's door, on an OpenStreetMap map. Display only. The
 * rider's marker moves as positions come in; the view follows the rider without fighting
 * a customer who has panned or zoomed.
 */
export default function RiderLiveMap({ rider, destination, height = '260px' }: Props) {
  const t = useT(ordersMessages);
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const riderMarkerRef = useRef<any>(null);
  const userMovedRef = useRef(false);
  const riderRef = useRef(rider);
  riderRef.current = rider;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || !containerRef.current || mapRef.current) return;

      const start = riderRef.current;
      const map = L.map(containerRef.current, { zoomControl: true, attributionControl: true }).setView([start.latitude, start.longitude], 15);
L.tileLayer(MAP_TILE_URL, { attribution: MAP_ATTRIBUTION, maxZoom: MAP_MAX_ZOOM }).addTo(map);

      riderMarkerRef.current = L.marker([start.latitude, start.longitude], {
        icon: L.divIcon({ className: 'rider-live-pin', html: riderIconHtml, iconSize: [36, 36], iconAnchor: [18, 18] }),
        title: t('map.yourRider'),
      }).addTo(map);

      if (destination) {
        L.marker([destination.latitude, destination.longitude], {
          icon: L.divIcon({ className: 'rider-live-home', html: homeIconHtml, iconSize: [30, 30], iconAnchor: [15, 15] }),
          title: t('map.deliveryAddress'),
        }).addTo(map);
        map.fitBounds(
          L.latLngBounds([start.latitude, start.longitude], [destination.latitude, destination.longitude]),
          { padding: [40, 40], maxZoom: 16 }
        );
      }
      // Once the customer drags the map themselves, stop re-centring it on the rider.
      map.on('dragstart', () => {
        userMovedRef.current = true;
      });
      mapRef.current = map;
      setTimeout(() => map.invalidateSize(), 200);
    })().catch((err) => console.error('Rider map failed to load:', err));

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      riderMarkerRef.current = null;
    };
    // The map is built once; positions are moved by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!riderMarkerRef.current || !mapRef.current) return;
    riderMarkerRef.current.setLatLng([rider.latitude, rider.longitude]);
    if (!userMovedRef.current && !mapRef.current.getBounds().pad(-0.2).contains([rider.latitude, rider.longitude])) {
      mapRef.current.panTo([rider.latitude, rider.longitude]);
    }
  }, [rider.latitude, rider.longitude]);

  return <div ref={containerRef} style={{ height }} className="w-full rounded-xl overflow-hidden border border-slate-200 z-0" aria-label={t('map.aria')} />;
}
