"use client";

import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect } from "react";

export interface OSRMRoute {
    distance: number;
    duration: number;
    geometry: [number, number][];
    legs: any[];
    summary?: string;
}

interface Props {
    origen: [number, number] | null;
    destino: [number, number] | null;
    livePos: [number, number] | null;
    routes: OSRMRoute[];
    activeIdx: number;
    onSelectRoute: (idx: number) => void;
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

const iconConductor = L.divIcon({
    html: `<div style="position: relative;">
        <div style="
            position: absolute; top: -10px; left: -10px;
            width: 40px; height: 40px; border-radius: 50%;
            background: rgba(59,246,59,0.25);
            animation: nav-pulse 1.6s ease-out infinite;
        "></div>
        <div style="
            width: 20px; height: 20px; border-radius: 50%;
            background: #3bf63b;
            box-shadow: 0 0 0 3px #050608, 0 0 14px #3bf63b;
            position: relative; z-index: 1;
        "></div>
        <style>@keyframes nav-pulse {
            0% { transform: scale(0.5); opacity: 0.9; }
            100% { transform: scale(1.4); opacity: 0; }
        }</style>
    </div>`,
    className: "",
    iconSize: [20, 20],
    iconAnchor: [10, 10],
});

// ─── Auto-fit cuando cambia origen/destino o llega la primera ruta ───────────

function AutoFit({
    points,
    deps,
}: {
    points: [number, number][];
    deps: any[];
}) {
    const map = useMap();
    useEffect(() => {
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

// ─── Componente principal ────────────────────────────────────────────────────

export default function NavegacionMapa({
    origen,
    destino,
    livePos,
    routes,
    activeIdx,
    onSelectRoute,
}: Props) {

    // Punto de partida visible: GPS si lo hay, sino origen de la ruta
    const startPos = livePos ?? origen;

    // Center inicial fallback (Madrid). El AutoFit corrige al toque.
    const initialCenter: [number, number] = startPos ?? destino ?? [40.4168, -3.7035];

    const fitPoints: [number, number][] = [];
    if (startPos) fitPoints.push(startPos);
    if (destino) fitPoints.push(destino);
    routes[activeIdx]?.geometry.forEach(p => fitPoints.push(p));

    return (
        <MapContainer
            center={initialCenter}
            zoom={13}
            zoomControl={false}
            style={{ width: '100%', height: '100%', background: '#050608' }}
        >
            <TileLayer
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                attribution='© <a href="https://www.openstreetmap.org/copyright">OSM</a> · CartoDB'
                maxZoom={19}
                subdomains="abcd"
            />

            <AutoFit
                points={fitPoints}
                deps={[
                    routes.length,
                    activeIdx,
                    destino?.[0], destino?.[1],
                    // livePos NO va aquí: una vez fitted, dejamos que el conductor
                    // siga viendo la ruta sin que el mapa salte cada GPS update.
                ]}
            />

            {/* Rutas alternativas (apagadas) primero, para que la activa quede arriba */}
            {routes.map((r, i) => i !== activeIdx && (
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
            {origen && !livePos && <Marker position={origen} icon={iconOrigen} />}

            {/* Marker destino */}
            {destino && <Marker position={destino} icon={iconDestino} />}

            {/* Marker conductor live */}
            {livePos && <Marker position={livePos} icon={iconConductor} />}
        </MapContainer>
    );
}
