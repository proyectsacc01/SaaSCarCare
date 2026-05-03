"use client";

import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect } from "react";

export interface OSRMStep {
    distance: number;
    duration: number;
    name?: string;
    instruction: string;
    maneuver: {
        type?: string;
        modifier?: string;
        location: [number, number];
    };
}

export interface OSRMRoute {
    distance: number;
    duration: number;
    geometry: [number, number][];
    legs: unknown[];
    summary?: string;
    steps: OSRMStep[];
}

interface Props {
    origen: [number, number] | null;
    destino: [number, number] | null;
    currentPos: [number, number] | null;
    routes: OSRMRoute[];
    activeIdx: number;
    onSelectRoute: (idx: number) => void;
    followMode: boolean;
    liveHeading?: number | null;
    driverZoom?: number;
    showAlternativeRoutes?: boolean;
}

// ─── Iconos Leaflet ───────────────────────────────────────────────────────────

const iconOrigen = L.divIcon({
    html: `<div style="
        width: 20px; height: 20px; border-radius: 50%;
        background: #3bf63b;
        box-shadow: 0 0 0 4px rgba(59,246,59,0.25), 0 0 12px rgba(59,246,59,0.7);
        border: 2px solid #050608;
    "></div>`,
    className: "",
    iconSize: [20, 20],
    iconAnchor: [10, 10],
});

const iconDestino = L.divIcon({
    html: `<div style="
        width: 28px; height: 28px;
        background: linear-gradient(135deg, #ef4444, #dc2626);
        box-shadow: 0 0 0 4px rgba(239,68,68,0.25), 0 4px 14px rgba(239,68,68,0.5);
        border: 2px solid #050608;
        border-radius: 6px;
        display: flex; align-items: center; justify-content: center;
        font-size: 14px;
    ">🚩</div>`,
    className: "",
    iconSize: [28, 28],
    iconAnchor: [14, 14],
});

function createConductorIcon(heading?: number | null) {
    const rotation = typeof heading === "number" && heading >= 0 ? heading : 0;
    return L.divIcon({
    html: `<div style="position: relative;">
        <div style="
            position: absolute; top: -10px; left: -10px;
            width: 40px; height: 40px; border-radius: 50%;
            background: rgba(59,246,59,0.25);
            animation: nav-pulse 1.6s ease-out infinite;
        "></div>
        <div style="position: relative; width: 22px; height: 22px; z-index: 1; transform: rotate(${rotation}deg);">
            <div style="
                position: absolute; left: 50%; top: -2px; transform: translateX(-50%);
                width: 0; height: 0;
                border-left: 6px solid transparent;
                border-right: 6px solid transparent;
                border-bottom: 11px solid #3bf63b;
                filter: drop-shadow(0 0 6px rgba(59,246,59,0.8));
            "></div>
            <div style="
                position: absolute; left: 50%; bottom: 0; transform: translateX(-50%);
                width: 16px; height: 16px; border-radius: 50%;
                background: #3bf63b;
                box-shadow: 0 0 0 3px #050608, 0 0 14px #3bf63b;
            "></div>
        </div>
        <style>@keyframes nav-pulse {
            0% { transform: scale(0.5); opacity: 0.9; }
            100% { transform: scale(1.4); opacity: 0; }
        }</style>
    </div>`,
    className: "",
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    });
}

// ─── Auto-fit cuando cambia origen/destino o llega la primera ruta ───────────

function AutoFit({
    points,
    deps,
    enabled,
}: {
    points: [number, number][];
    deps: unknown[];
    enabled: boolean;
}) {
    const map = useMap();
    useEffect(() => {
        if (!enabled) return;
        if (points.length === 0) return;
        if (points.length === 1) {
            map.setView(points[0], 15, { animate: true });
            return;
        }
        try {
            const bounds = L.latLngBounds(points.map(p => L.latLng(p[0], p[1])));
            map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14, animate: true });
        } catch { /* noop */ }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);
    return null;
}

function FollowDriverCamera({
    enabled,
    driverPos,
    driverZoom,
}: {
    enabled: boolean;
    driverPos: [number, number] | null;
    driverZoom: number;
}) {
    const map = useMap();
    const driverLat = driverPos?.[0];
    const driverLng = driverPos?.[1];
    useEffect(() => {
        if (!enabled || !driverPos) return;
        map.setView(driverPos, Math.max(map.getZoom(), driverZoom), { animate: true });
    }, [enabled, driverLat, driverLng, driverPos, driverZoom, map]);
    return null;
}

function RemoveLeafletPrefix() {
    const map = useMap();
    useEffect(() => {
        map.attributionControl?.setPrefix("");
    }, [map]);
    return null;
}

// ─── Componente principal ────────────────────────────────────────────────────

export default function NavegacionMapa({
    origen,
    destino,
    currentPos,
    routes,
    activeIdx,
    onSelectRoute,
    followMode,
    liveHeading,
    driverZoom = 18,
    showAlternativeRoutes = true,
}: Props) {

    // Punto de partida visible: GPS si lo hay, sino origen de la ruta
    const startPos = currentPos ?? origen;

    // Center inicial fallback (Madrid). El AutoFit corrige al toque.
    const initialCenter: [number, number] = startPos ?? destino ?? [40.4168, -3.7035];

    const fitPoints: [number, number][] = [];
    if (startPos) fitPoints.push(startPos);
    if (destino) fitPoints.push(destino);
    routes[activeIdx]?.geometry.forEach(p => fitPoints.push(p));

    return (
        <MapContainer
            center={initialCenter}
            zoom={followMode && startPos ? driverZoom : 13}
            zoomControl={false}
            style={{ width: '100%', height: '100%', background: '#050608' }}
        >
            <RemoveLeafletPrefix />
            <TileLayer
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                attribution='© <a href="https://www.openstreetmap.org/copyright">OSM</a> · CartoDB'
                maxZoom={19}
                subdomains="abcd"
            />

            <AutoFit
                points={fitPoints}
                enabled={!followMode || !startPos}
                deps={[
                    routes.length,
                    activeIdx,
                    destino?.[0], destino?.[1],
                    // livePos NO va aquí: una vez fitted, dejamos que el conductor
                    // siga viendo la ruta sin que el mapa salte cada GPS update.
                ]}
            />

            <FollowDriverCamera enabled={followMode} driverPos={startPos} driverZoom={driverZoom} />

            {/* Rutas alternativas (apagadas) primero, para que la activa quede arriba */}
            {showAlternativeRoutes && routes.map((r, i) => i !== activeIdx && (
                <Polyline
                    key={`alt-${i}`}
                    positions={r.geometry}
                    pathOptions={{
                        color: '#6b7280',
                        weight: 4,
                        opacity: 0.5,
                        dashArray: '8 6',
                    }}
                    eventHandlers={{
                        click: () => onSelectRoute(i),
                    }}
                />
            ))}

            {/* Ruta activa */}
            {routes[activeIdx] && (
                <>
                    <Polyline
                        positions={routes[activeIdx].geometry}
                        pathOptions={{
                            color: '#000',
                            weight: 9,
                            opacity: 0.6,
                        }}
                    />
                    <Polyline
                        positions={routes[activeIdx].geometry}
                        pathOptions={{
                            color: '#3bf63b',
                            weight: 5,
                            opacity: 0.95,
                            lineCap: 'round',
                            lineJoin: 'round',
                        }}
                    />
                </>
            )}

            {/* Si no hay ruta OSRM, dibujamos una línea recta entre conductor y destino */}
            {routes.length === 0 && startPos && destino && (
                <Polyline
                    positions={[startPos, destino]}
                    pathOptions={{
                        color: '#f59e0b',
                        weight: 3,
                        opacity: 0.7,
                        dashArray: '4 6',
                    }}
                />
            )}

            {/* Marker origen — solo si NO tenemos GPS live (sino el truck va arriba) */}
            {origen && !currentPos && <Marker position={origen} icon={iconOrigen} />}

            {/* Marker destino */}
            {destino && <Marker position={destino} icon={iconDestino} />}

            {/* Marker conductor live */}
            {currentPos && <Marker position={currentPos} icon={createConductorIcon(liveHeading)} />}
        </MapContainer>
    );
}
