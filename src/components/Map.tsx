import React, { useState, useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import { Map as MapLibreMap, GeoJSONSource, RasterTileSource, Popup, Marker, setWorkerUrl, type RequestParameters } from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { City, Landmark, Hotspot, ProbeLocation } from '../types';

setWorkerUrl(maplibreWorkerUrl);
import { generateSubmergedTile } from '../utils/demProcessor';
import { formatPopulation } from '../utils/formatters';
import { sampleElevationAt, getProbeStatus, formatCoordinates } from '../utils/elevationProbe';
import { findProtectedBasin, isBasinBreached } from '../utils/basinProtection';

interface MapProps {
  seaLevel: number;
  cities: City[];
  landmarks: Landmark[];
  showCities: boolean;
  showLandmarks: boolean;
  selectedCity: City | null;
  onSelectCity: (city: City | null) => void;
  selectedLandmark: Landmark | null;
  onSelectLandmark: (landmark: Landmark | null) => void;
  targetHotspot: Hotspot | null;
  initialCenter?: [number, number];
  initialZoom?: number;
  onViewportChange?: (viewport: { lat: number; lon: number; zoom: number }) => void;
  onMapReady?: (map: MapLibreMap) => void;
}

const CATEGORY_META: Record<string, { label: string; icon: string; color: string }> = {
  heritage: { label: 'World Heritage', icon: '🏛️', color: '#8b5cf6' },
  monument: { label: 'Monument', icon: '🗿', color: '#f59e0b' },
  natural: { label: 'Natural Wonder', icon: '🌲', color: '#10b981' },
  structure: { label: 'Iconic Structure', icon: '🏗️', color: '#06b6d4' }
};

function escapeHtml(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return '';
  return String(value).replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return char;
    }
  });
}

// Register custom protocol once globally
let protocolRegistered = false;
function ensureCustomProtocol() {
  if (protocolRegistered) return;
  protocolRegistered = true;

  maplibregl.addProtocol('sealevel', async (params: RequestParameters) => {
    try {
      const urlObj = new URL(params.url.replace('sealevel://', 'https://dummy.local/'));
      const pathParts = urlObj.pathname.replace(/^\//, '').split('/');
      const z = parseInt(pathParts[0], 10);
      const rawX = parseInt(pathParts[1], 10);
      const y = parseInt(pathParts[2].replace('.png', ''), 10);
      const level = parseFloat(urlObj.searchParams.get('level') || '0');

      // Wrap X coordinate to [0, 2^z - 1] to properly handle world-wrapping and the 180th meridian (e.g. Fiji)
      const maxTiles = 1 << z;
      const x = ((rawX % maxTiles) + maxTiles) % maxTiles;

      const bitmap = await generateSubmergedTile(z, x, y, level);
      return { data: bitmap };
    } catch (err) {
      // In case of non-existent ocean tile or network error, return transparent 256x256 bitmap
      const fallbackCanvas = new OffscreenCanvas(256, 256);
      const emptyBitmap = await createImageBitmap(fallbackCanvas);
      return { data: emptyBitmap };
    }
  });
}

const CITY_LAYER_IDS = [
  'cities-tier1-halo',
  'cities-tier1-markers',
  'cities-tier2-halo',
  'cities-tier2-markers',
  'cities-tier3-halo',
  'cities-tier3-markers'
];

const LANDMARK_LAYER_IDS = [
  'landmarks-halo',
  'landmarks-markers'
];

export const MapView: React.FC<MapProps> = ({
  seaLevel,
  cities,
  landmarks,
  showCities,
  showLandmarks,
  selectedCity,
  onSelectCity,
  selectedLandmark,
  onSelectLandmark,
  targetHotspot,
  initialCenter,
  initialZoom,
  onViewportChange,
  onMapReady
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const probeMarkerRef = useRef<Marker | null>(null);
  const probePopupRef = useRef<Popup | null>(null);
  const [probeLocation, setProbeLocation] = useState<ProbeLocation | null>(null);
  const [isMapReady, setIsMapReady] = useState<boolean>(false);
  const latestSeaLevelRef = useRef<number>(seaLevel);
  const selectedCityRef = useRef<City | null>(selectedCity);
  const selectedLandmarkRef = useRef<Landmark | null>(selectedLandmark);

  useEffect(() => {
    selectedCityRef.current = selectedCity;
  }, [selectedCity]);

  useEffect(() => {
    selectedLandmarkRef.current = selectedLandmark;
  }, [selectedLandmark]);

  const onMapReadyRef = useRef(onMapReady);
  useEffect(() => {
    onMapReadyRef.current = onMapReady;
  }, [onMapReady]);

  // Initialize MapLibre
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    ensureCustomProtocol();

    const cartoApiKey = (import.meta.env.VITE_CARTO_API_KEY as string | undefined)?.trim();
    const cartoTileUrl = cartoApiKey
      ? `https://basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(cartoApiKey)}`
      : 'https://basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}{r}.png';

    const map = new MapLibreMap({
      container: mapContainerRef.current,
      canvasContextAttributes: { preserveDrawingBuffer: true },
      style: {
        version: 8,
        sources: {
          'osm-base': {
            type: 'raster',
            tiles: [cartoTileUrl],
            tileSize: 256,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>'
          },
          'flood-source': {
            type: 'raster',
            tiles: [`sealevel://{z}/{x}/{y}.png?level=${seaLevel}`],
            tileSize: 256,
            minzoom: 0,
            maxzoom: 14
          }
        },
        layers: [
          {
            id: 'osm-base-layer',
            type: 'raster',
            source: 'osm-base',
            minzoom: 0,
            maxzoom: 19
          },
          {
            id: 'flood-layer',
            type: 'raster',
            source: 'flood-source',
            paint: {
              'raster-opacity': 0.85,
              'raster-fade-duration': 100
            },
            layout: {
              visibility: seaLevel > 0 ? 'visible' : 'none'
            }
          }
        ]
      },
      center: initialCenter || [15, 25],
      zoom: initialZoom ?? 2.2,
      minZoom: 1.5,
      maxZoom: 13
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'bottom-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    map.on('moveend', () => {
      const center = map.getCenter();
      onViewportChange?.({
        lat: parseFloat(center.lat.toFixed(4)),
        lon: parseFloat(center.lng.toFixed(4)),
        zoom: parseFloat(map.getZoom().toFixed(2))
      });
    });

    map.on('load', () => {
      setIsMapReady(true);
      // 1. Add Cities GeoJSON Source
      map.addSource('cities-source', {
        type: 'geojson',
        data: buildCitiesGeoJson(cities, seaLevel)
      });

      // City halo paint style
      const cityHaloPaint: NonNullable<maplibregl.CircleLayerSpecification['paint']> = {
        'circle-radius': [
          'case',
          ['get', 'isSubmerged'], 11,
          ['get', 'isDepression'], 9,
          6
        ],
        'circle-color': [
          'case',
          ['get', 'isSubmerged'], '#ef4444',
          ['get', 'isDepression'], '#f59e0b',
          '#0ea5e9'
        ],
        'circle-opacity': [
          'case',
          ['get', 'isSubmerged'], 0.35,
          ['get', 'isDepression'], 0.25,
          0.15
        ]
      };

      // City core marker paint style
      const cityMarkerPaint: NonNullable<maplibregl.CircleLayerSpecification['paint']> = {
        'circle-radius': [
          'case',
          ['get', 'isSubmerged'], 6,
          ['get', 'isDepression'], 5,
          4
        ],
        'circle-color': [
          'case',
          ['get', 'isSubmerged'], '#dc2626',
          ['get', 'isDepression'], '#d97706',
          '#0284c7'
        ],
        'circle-stroke-width': 1.5,
        'circle-stroke-color': '#ffffff'
      };

      // Tier 1 Cities (Mega-cities & primary capitals, visible at all zoom levels)
      map.addLayer({
        id: 'cities-tier1-halo',
        type: 'circle',
        source: 'cities-source',
        minzoom: 0,
        filter: ['==', ['get', 'tier'], 1],
        paint: cityHaloPaint,
        layout: { visibility: showCities ? 'visible' : 'none' }
      });
      map.addLayer({
        id: 'cities-tier1-markers',
        type: 'circle',
        source: 'cities-source',
        minzoom: 0,
        filter: ['==', ['get', 'tier'], 1],
        paint: cityMarkerPaint,
        layout: { visibility: showCities ? 'visible' : 'none' }
      });

      // Tier 2 Cities (Major hubs & secondary capitals, visible at zoom >= 4)
      map.addLayer({
        id: 'cities-tier2-halo',
        type: 'circle',
        source: 'cities-source',
        minzoom: 4,
        filter: ['==', ['get', 'tier'], 2],
        paint: cityHaloPaint,
        layout: { visibility: showCities ? 'visible' : 'none' }
      });
      map.addLayer({
        id: 'cities-tier2-markers',
        type: 'circle',
        source: 'cities-source',
        minzoom: 4,
        filter: ['==', ['get', 'tier'], 2],
        paint: cityMarkerPaint,
        layout: { visibility: showCities ? 'visible' : 'none' }
      });

      // Tier 3 Cities (Regional hubs & coastal settlements, visible at zoom >= 6)
      map.addLayer({
        id: 'cities-tier3-halo',
        type: 'circle',
        source: 'cities-source',
        minzoom: 6,
        filter: ['==', ['get', 'tier'], 3],
        paint: cityHaloPaint,
        layout: { visibility: showCities ? 'visible' : 'none' }
      });
      map.addLayer({
        id: 'cities-tier3-markers',
        type: 'circle',
        source: 'cities-source',
        minzoom: 6,
        filter: ['==', ['get', 'tier'], 3],
        paint: cityMarkerPaint,
        layout: { visibility: showCities ? 'visible' : 'none' }
      });

      // 2. Add Landmarks GeoJSON Source
      map.addSource('landmarks-source', {
        type: 'geojson',
        data: buildLandmarksGeoJson(landmarks, seaLevel)
      });

      // Landmarks halo
      map.addLayer({
        id: 'landmarks-halo',
        type: 'circle',
        source: 'landmarks-source',
        paint: {
          'circle-radius': [
            'case',
            ['get', 'isSubmerged'], 14,
            10
          ],
          'circle-color': [
            'case',
            ['get', 'isSubmerged'], '#ef4444',
            ['get', 'isDepression'], '#f59e0b',
            '#eab308'
          ],
          'circle-opacity': 0.35
        },
        layout: { visibility: showLandmarks ? 'visible' : 'none' }
      });

      // Landmarks core marker (distinct amber/gold diamond-like appearance)
      map.addLayer({
        id: 'landmarks-markers',
        type: 'circle',
        source: 'landmarks-source',
        paint: {
          'circle-radius': [
            'case',
            ['get', 'isSubmerged'], 7,
            ['get', 'isDepression'], 6,
            5.5
          ],
          'circle-color': [
            'case',
            ['get', 'isSubmerged'], '#b91c1c',
            ['get', 'isDepression'], '#d97706',
            '#ca8a04'
          ],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff'
        },
        layout: { visibility: showLandmarks ? 'visible' : 'none' }
      });

      // Click handlers on city markers
      const cityMarkerLayers = ['cities-tier1-markers', 'cities-tier2-markers', 'cities-tier3-markers'];
      cityMarkerLayers.forEach((layerId) => {
        map.on('click', layerId, (e) => {
          if (!e.features || !e.features[0]) return;
          const props = e.features[0].properties;
          if (!props) return;

          const city = cities.find(c => c.id === props.id);
          if (city) {
            onSelectLandmark(null);
            onSelectCity(city);
          }
        });

        map.on('mouseenter', layerId, () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', layerId, () => {
          map.getCanvas().style.cursor = '';
        });
      });

      // Click handlers on landmark markers
      map.on('click', 'landmarks-markers', (e) => {
        if (!e.features || !e.features[0]) return;
        const props = e.features[0].properties;
        if (!props) return;

        const landmark = landmarks.find(l => l.id === props.id);
        if (landmark) {
          onSelectCity(null);
          onSelectLandmark(landmark);
        }
      });

      map.on('mouseenter', 'landmarks-markers', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'landmarks-markers', () => {
        map.getCanvas().style.cursor = '';
      });

      // Elevation Probe: Click anywhere on Earth to inspect elevation and live flood depth
      map.on('click', async (e) => {
        // Ignore click if clicking on an interactive city or landmark marker
        const cityLayers = ['cities-tier1-markers', 'cities-tier2-markers', 'cities-tier3-markers'];
        const cityFeatures = map.queryRenderedFeatures(e.point, { layers: cityLayers });
        const landmarkFeatures = map.queryRenderedFeatures(e.point, { layers: ['landmarks-markers'] });

        if (cityFeatures.length > 0 || landmarkFeatures.length > 0) {
          return;
        }

        // If a city/landmark or probe popup is active, clicking map dismisses it rather than dropping a new probe
        const hasActiveSelection = !!(
          selectedCityRef.current ||
          selectedLandmarkRef.current ||
          probeMarkerRef.current ||
          (popupRef.current && popupRef.current.isOpen()) ||
          (probePopupRef.current && probePopupRef.current.isOpen())
        );

        if (hasActiveSelection) {
          if (selectedCityRef.current) onSelectCity(null);
          if (selectedLandmarkRef.current) onSelectLandmark(null);
          if (popupRef.current) {
            popupRef.current.remove();
            popupRef.current = null;
          }
          if (probePopupRef.current) {
            probePopupRef.current.remove();
            probePopupRef.current = null;
          }
          if (probeMarkerRef.current) {
            probeMarkerRef.current.remove();
            probeMarkerRef.current = null;
          }
          setProbeLocation(null);
          return;
        }

        const lon = e.lngLat.lng;
        const lat = e.lngLat.lat;
        const currentZoom = map.getZoom();

        // Remove previous probe marker/popup
        if (probePopupRef.current) {
          probePopupRef.current.remove();
          probePopupRef.current = null;
        }
        if (probeMarkerRef.current) {
          probeMarkerRef.current.remove();
          probeMarkerRef.current = null;
        }

        const popup = new Popup({ offset: 25, closeButton: true, closeOnClick: false })
          .setLngLat([lon, lat])
          .setHTML(buildProbeLoadingHtml(lat, lon));

        const marker = new maplibregl.Marker({ color: '#f43f5e' })
          .setLngLat([lon, lat])
          .setPopup(popup)
          .addTo(map);

        marker.togglePopup();

        probeMarkerRef.current = marker;
        probePopupRef.current = popup;

        popup.on('close', () => {
          setProbeLocation(null);
          if (probeMarkerRef.current) {
            probeMarkerRef.current.remove();
            probeMarkerRef.current = null;
          }
          probePopupRef.current = null;
        });

        try {
          const elevation = await sampleElevationAt(lon, lat, currentZoom);
          setProbeLocation({ lat, lon, elevation });
          popup.setHTML(buildProbePopupHtml({ lat, lon, elevation }, latestSeaLevelRef.current));
        } catch (err) {
          console.warn('Failed to probe elevation at', lon, lat, err);
          popup.setHTML(`
            <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; color: #991b1b; padding: 4px; min-width: 170px;">
              <div style="font-size: 12px; font-weight: 700;">📍 Elevation Probe</div>
              <div style="font-size: 11px; margin-top: 4px; color: #64748b;">Elevation data unavailable for open ocean or unmapped tile.</div>
            </div>
          `);
        }
      });
    });

    mapRef.current = map;
    onMapReadyRef.current?.(map);

    return () => {
      onMapReadyRef.current?.(null as unknown as MapLibreMap);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update flood layer tiles when seaLevel changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const clampedSeaLevel = seaLevel <= 0 ? 0 : seaLevel;
    latestSeaLevelRef.current = clampedSeaLevel;

    try {
      if (map.getLayer('flood-layer')) {
        map.setLayoutProperty('flood-layer', 'visibility', clampedSeaLevel > 0 ? 'visible' : 'none');
      }
      const source = map.getSource('flood-source') as RasterTileSource | undefined;
      if (source && typeof source.setTiles === 'function') {
        source.setTiles([`sealevel://{z}/{x}/{y}.png?level=${clampedSeaLevel}`]);
      }

      // Update cities GeoJSON
      const citiesSource = map.getSource('cities-source') as GeoJSONSource | undefined;
      if (citiesSource && typeof citiesSource.setData === 'function') {
        citiesSource.setData(buildCitiesGeoJson(cities, clampedSeaLevel));
      }

      // Update landmarks GeoJSON
      const landmarksSource = map.getSource('landmarks-source') as GeoJSONSource | undefined;
      if (landmarksSource && typeof landmarksSource.setData === 'function') {
        landmarksSource.setData(buildLandmarksGeoJson(landmarks, clampedSeaLevel));
      }
    } catch {
      // Layers or sources may still be initializing
    }
  }, [seaLevel, cities, landmarks, isMapReady]);

  // Update visibility when showCities or showLandmarks toggle
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    try {
      const cityVis = showCities ? 'visible' : 'none';
      for (const layerId of CITY_LAYER_IDS) {
        if (map.getLayer(layerId)) {
          map.setLayoutProperty(layerId, 'visibility', cityVis);
        }
      }

      const landmarkVis = showLandmarks ? 'visible' : 'none';
      for (const layerId of LANDMARK_LAYER_IDS) {
        if (map.getLayer(layerId)) {
          map.setLayoutProperty(layerId, 'visibility', landmarkVis);
        }
      }
    } catch {
      // Layers may still be initializing
    }
  }, [showCities, showLandmarks, isMapReady]);

  // Handle selected city popup & flyTo
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!selectedCity) {
      if (!selectedLandmark && popupRef.current) {
        popupRef.current.remove();
        popupRef.current = null;
      }
      return;
    }

    map.flyTo({
      center: [selectedCity.lon, selectedCity.lat],
      zoom: Math.max(map.getZoom(), 6),
      speed: 1.2
    });

    if (popupRef.current) popupRef.current.remove();

    if (probeMarkerRef.current) {
      probeMarkerRef.current.remove();
      probeMarkerRef.current = null;
    }
    if (probePopupRef.current) {
      probePopupRef.current.remove();
      probePopupRef.current = null;
    }
    setProbeLocation(null);

    const isSubmerged = selectedCity.elevation > 0 && selectedCity.elevation <= seaLevel;
    const isDepression = selectedCity.isDepression || selectedCity.elevation <= 0;

    let statusHtml = '';
    const formattedSeaLevel = seaLevel % 1 !== 0 ? seaLevel.toFixed(1) : seaLevel.toLocaleString();
    if (isSubmerged) {
      statusHtml = `
        <div style="background-color: rgba(127, 29, 29, 0.45); border: 1px solid rgba(239, 68, 68, 0.4); color: #fca5a5; padding: 4px 8px; border-radius: 6px; font-weight: 700; font-size: 12px; margin-top: 6px; display: flex; align-items: center; gap: 4px;">
          <span>⚠️</span> SUBMERGED at +${formattedSeaLevel}m
        </div>
      `;
    } else if (isDepression) {
      statusHtml = `
        <div style="background-color: rgba(120, 53, 15, 0.45); border: 1px solid rgba(245, 158, 11, 0.4); color: #fde68a; padding: 4px 8px; border-radius: 6px; font-weight: 600; font-size: 11px; margin-top: 6px;">
          <span>ℹ️</span> Natural depression (below sea level today, not newly flooded)
        </div>
      `;
    } else {
      const clearanceVal = selectedCity.elevation - seaLevel;
      const clearance = clearanceVal % 1 !== 0 ? clearanceVal.toFixed(1) : clearanceVal.toFixed(0);
      statusHtml = `
        <div style="background-color: rgba(12, 74, 110, 0.45); border: 1px solid rgba(14, 165, 233, 0.4); color: #7dd3fc; padding: 4px 8px; border-radius: 6px; font-weight: 600; font-size: 11px; margin-top: 6px;">
          <span>🛡️</span> Safe (${clearance}m clearance above water)
        </div>
      `;
    }

    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #f1f5f9; min-width: 170px;">
        <div style="font-size: 15px; font-weight: 700; line-height: 1.2; color: #ffffff;">${escapeHtml(selectedCity.name)}</div>
        <div style="font-size: 12px; color: #94a3b8; margin-bottom: 6px;">${escapeHtml(selectedCity.country)}</div>
        <div style="font-size: 12px; border-top: 1px solid rgba(51, 65, 85, 0.8); padding-top: 6px; display: flex; justify-content: space-between; gap: 8px; color: #cbd5e1;">
          <span><strong style="color: #f1f5f9;">Elevation:</strong> ${selectedCity.elevation > 0 ? `+${selectedCity.elevation}m` : `${selectedCity.elevation}m`}</span>
          <span><strong style="color: #f1f5f9;">Metro Pop:</strong> ${formatPopulation(selectedCity.population)}</span>
        </div>
        ${statusHtml}
      </div>
    `;

    popupRef.current = new Popup({ offset: 12, closeButton: true })
      .setLngLat([selectedCity.lon, selectedCity.lat])
      .setHTML(htmlContent)
      .addTo(map);

    popupRef.current.on('close', () => {
      onSelectCity(null);
    });
  }, [selectedCity, seaLevel]);

  // Handle selected landmark popup & flyTo
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!selectedLandmark) {
      if (!selectedCity && popupRef.current) {
        popupRef.current.remove();
        popupRef.current = null;
      }
      return;
    }

    map.flyTo({
      center: [selectedLandmark.lon, selectedLandmark.lat],
      zoom: Math.max(map.getZoom(), 7),
      speed: 1.2
    });

    if (popupRef.current) popupRef.current.remove();

    if (probeMarkerRef.current) {
      probeMarkerRef.current.remove();
      probeMarkerRef.current = null;
    }
    if (probePopupRef.current) {
      probePopupRef.current.remove();
      probePopupRef.current = null;
    }
    setProbeLocation(null);

    const isSubmerged = selectedLandmark.elevation > 0 && selectedLandmark.elevation <= seaLevel;
    const isDepression = selectedLandmark.isDepression || selectedLandmark.elevation <= 0;
    const catInfo = CATEGORY_META[selectedLandmark.category] || { label: 'Landmark', icon: '📍', color: '#6366f1' };

    let statusHtml = '';
    const formattedSeaLevel = seaLevel % 1 !== 0 ? seaLevel.toFixed(1) : seaLevel.toLocaleString();
    if (isSubmerged) {
      statusHtml = `
        <div style="background-color: rgba(127, 29, 29, 0.45); border: 1px solid rgba(239, 68, 68, 0.4); color: #fca5a5; padding: 4px 8px; border-radius: 6px; font-weight: 700; font-size: 12px; margin-top: 6px; display: flex; align-items: center; gap: 4px;">
          <span>⚠️</span> SUBMERGED at +${formattedSeaLevel}m
        </div>
      `;
    } else if (isDepression) {
      statusHtml = `
        <div style="background-color: rgba(120, 53, 15, 0.45); border: 1px solid rgba(245, 158, 11, 0.4); color: #fde68a; padding: 4px 8px; border-radius: 6px; font-weight: 600; font-size: 11px; margin-top: 6px;">
          <span>ℹ️</span> Natural depression (below sea level today, not newly flooded)
        </div>
      `;
    } else {
      const clearanceVal = selectedLandmark.elevation - seaLevel;
      const clearance = clearanceVal % 1 !== 0 ? clearanceVal.toFixed(1) : clearanceVal.toFixed(0);
      statusHtml = `
        <div style="background-color: rgba(12, 74, 110, 0.45); border: 1px solid rgba(14, 165, 233, 0.4); color: #7dd3fc; padding: 4px 8px; border-radius: 6px; font-weight: 600; font-size: 11px; margin-top: 6px;">
          <span>🛡️</span> Safe (${clearance}m clearance above water)
        </div>
      `;
    }

    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #f1f5f9; min-width: 200px; max-width: 260px;">
        <div style="display: flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 600; color: #94a3b8; margin-bottom: 2px;">
          <span>${catInfo.icon}</span>
          <span>${catInfo.label}</span>
          <span>&bull;</span>
          <span>${escapeHtml(selectedLandmark.country)}</span>
        </div>
        <div style="font-size: 15px; font-weight: 700; line-height: 1.2; color: #ffffff;">${escapeHtml(selectedLandmark.name)}</div>
        <div style="font-size: 11px; color: #cbd5e1; margin: 4px 0 6px 0; line-height: 1.35;">${escapeHtml(selectedLandmark.description)}</div>
        <div style="font-size: 12px; border-top: 1px solid rgba(51, 65, 85, 0.8); padding-top: 5px; color: #cbd5e1;">
          <strong style="color: #f1f5f9;">Elevation:</strong> ${selectedLandmark.elevation > 0 ? `+${selectedLandmark.elevation}m` : `${selectedLandmark.elevation}m`}
        </div>
        ${statusHtml}
      </div>
    `;

    popupRef.current = new Popup({ offset: 12, closeButton: true })
      .setLngLat([selectedLandmark.lon, selectedLandmark.lat])
      .setHTML(htmlContent)
      .addTo(map);

    popupRef.current.on('close', () => {
      onSelectLandmark(null);
    });
  }, [selectedLandmark, seaLevel]);

  // Handle Hotspot camera jumps
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !targetHotspot) return;

    map.flyTo({
      center: [targetHotspot.lon, targetHotspot.lat],
      zoom: targetHotspot.zoom,
      speed: 1.2,
      curve: 1.4
    });
  }, [targetHotspot]);

  // Synchronize latestSeaLevelRef and dynamically update elevation probe popup on slider change
  useEffect(() => {
    latestSeaLevelRef.current = seaLevel;
    if (probeLocation && probePopupRef.current && probePopupRef.current.isOpen()) {
      probePopupRef.current.setHTML(buildProbePopupHtml(probeLocation, seaLevel));
    }
  }, [seaLevel, probeLocation]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainerRef} className="w-full h-full" />
    </div>
  );
};

function buildCitiesGeoJson(cities: City[], seaLevel: number): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: cities.map((city) => {
      const basin = findProtectedBasin(city.lon, city.lat);
      const isBreached = basin ? isBasinBreached(basin, seaLevel) : false;
      const isProtected = basin ? !isBreached : false;

      let isSubmerged = false;
      let isDepression = false;

      if (isProtected) {
        isDepression = !!city.isDepression || city.elevation <= 0;
      } else if (isBreached && city.elevation <= seaLevel) {
        isSubmerged = true;
      } else {
        isSubmerged = city.elevation > 0 && city.elevation <= seaLevel;
        isDepression = !!city.isDepression || city.elevation <= 0;
      }

      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [city.lon, city.lat]
        },
        properties: {
          id: city.id,
          name: city.name,
          country: city.country,
          elevation: city.elevation,
          tier: city.tier || 2,
          isSubmerged,
          isDepression
        }
      };
    })
  };
}

function buildLandmarksGeoJson(landmarks: Landmark[], seaLevel: number): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: landmarks.map((landmark) => {
      const basin = findProtectedBasin(landmark.lon, landmark.lat);
      const isBreached = basin ? isBasinBreached(basin, seaLevel) : false;
      const isProtected = basin ? !isBreached : false;

      let isSubmerged = false;
      let isDepression = false;

      if (isProtected) {
        isDepression = !!landmark.isDepression || landmark.elevation <= 0;
      } else if (isBreached && landmark.elevation <= seaLevel) {
        isSubmerged = true;
      } else {
        isSubmerged = landmark.elevation > 0 && landmark.elevation <= seaLevel;
        isDepression = !!landmark.isDepression || landmark.elevation <= 0;
      }

      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [landmark.lon, landmark.lat]
        },
        properties: {
          id: landmark.id,
          name: landmark.name,
          category: landmark.category,
          country: landmark.country,
          elevation: landmark.elevation,
          description: landmark.description,
          isSubmerged,
          isDepression
        }
      };
    })
  };
}

function buildProbePopupHtml(probe: ProbeLocation, seaLevel: number): string {
  const status = getProbeStatus(probe.elevation, seaLevel, { lat: probe.lat, lon: probe.lon });
  const formattedSeaLevel = seaLevel % 1 !== 0 ? seaLevel.toFixed(1) : seaLevel.toLocaleString();
  const elevText = probe.elevation > 0 ? `+${probe.elevation}m` : `${probe.elevation}m`;

  let statusBg = 'rgba(127, 29, 29, 0.45)';
  let statusBorder = 'rgba(239, 68, 68, 0.4)';
  let statusColor = '#fca5a5';
  let statusIcon = '⚠️';

  if (status.badgeType === 'safe') {
    statusBg = 'rgba(12, 74, 110, 0.45)';
    statusBorder = 'rgba(14, 165, 233, 0.4)';
    statusColor = '#7dd3fc';
    statusIcon = '🛡️';
  } else if (status.badgeType === 'basin_protected') {
    statusBg = 'rgba(20, 83, 45, 0.45)';
    statusBorder = 'rgba(34, 197, 94, 0.4)';
    statusColor = '#86efac';
    statusIcon = '🛡️';
  } else if (status.badgeType === 'depression') {
    statusBg = 'rgba(120, 53, 15, 0.45)';
    statusBorder = 'rgba(245, 158, 11, 0.4)';
    statusColor = '#fde68a';
    statusIcon = 'ℹ️';
  }

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #f1f5f9; min-width: 210px; max-width: 270px;">
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 2px;">
        <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #94a3b8; display: flex; align-items: center; gap: 4px;">
          <span>📍</span> Elevation Probe
        </span>
        <span style="font-size: 10px; background-color: rgba(30, 41, 59, 0.8); border: 1px solid rgba(51, 65, 85, 0.8); color: #38bdf8; padding: 1px 6px; border-radius: 9999px; font-weight: 600;">
          +${formattedSeaLevel}m Sea
        </span>
      </div>

      <div style="font-size: 11px; color: #94a3b8; margin-bottom: 6px; font-family: monospace;">
        ${formatCoordinates(probe.lat, probe.lon)}
      </div>

      <div style="font-size: 12px; border-top: 1px solid rgba(51, 65, 85, 0.8); padding-top: 6px; display: flex; justify-content: space-between; align-items: center; color: #cbd5e1;">
        <span>Ground Elevation:</span>
        <strong style="font-size: 13px; color: #ffffff;">${elevText}</strong>
      </div>

      <div style="background-color: ${statusBg}; border: 1px solid ${statusBorder}; color: ${statusColor}; padding: 6px 8px; border-radius: 6px; font-weight: 700; font-size: 11px; margin-top: 6px; line-height: 1.35; display: flex; align-items: center; gap: 6px;">
        <span style="font-size: 13px; flex-shrink: 0;">${statusIcon}</span>
        <span>${status.statusText}</span>
      </div>
    </div>
  `;
}

function buildProbeLoadingHtml(lat: number, lon: number): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #f1f5f9; min-width: 180px; padding: 4px 0;">
      <div style="font-size: 12px; font-weight: 700; color: #ffffff; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
        <span>📍</span> Probing Elevation...
      </div>
      <div style="font-size: 10px; color: #94a3b8; font-family: monospace;">
        ${formatCoordinates(lat, lon)}
      </div>
      <div style="font-size: 11px; color: #64748b; margin-top: 4px; font-style: italic;">
        Sampling DEM elevation raster...
      </div>
    </div>
  `;
}

