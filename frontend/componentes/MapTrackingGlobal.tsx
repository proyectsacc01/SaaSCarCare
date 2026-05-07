"use client";

import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useReducer, useRef, useState } from "react";
import { formatConnectionStateLabel } from "@/lib/status-labels";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RutaTracking {
    id?: string;
    origen: string;
    destino: string;
    estado: string;
    vehiculoId: string;
    conductorId?: string;
    conductorNombre?: string;
    latitudActual?: number;
    longitudActual?: number;
    latitudOrigen?: number;
    longitudOrigen?: number;
    latitudDestino?: number;
    longitudDestino?: number;
    velocidadActualKmh?: number;
    distanciaRestanteKm?: number;
    desviado?: boolean;
    ultimaActualizacionGPS?: string;
}

export interface ConductorUbicacion {
    id: string;
    nombre: string;
    email?: string;
    latitudActual?: number;
    longitudActual?: number;
    ultimaActualizacionGPS?: string;
    /**
     * Flag del backend: el conductor toggleó ACTIVO/INACTIVO en su app.
     * - true / undefined → comparte GPS (default)
     * - false → apagó el tracking conscientemente; lo mostramos en gris
     */
    compartiendoUbicacion?: boolean;
}

export interface MapTrackingGlobalProps {
    rutasActivas: RutaTracking[];
    conductoresUbicaciones?: ConductorUbicacion[];
    onRutaClick?: (rutaId: string) => void;
}

// ─── GPS status ───────────────────────────────────────────────────────────────

type GPSStatus = "online" | "idle" | "offline";

function getGPSStatus(ts?: string, hasPos?: boolean): { text: string; status: GPSStatus } {
    if (!ts && hasPos) return { text: "Ahora", status: "online" };
    if (!ts) return { text: "Sin señal", status: "offline" };
    const secs = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
    const status: GPSStatus = secs <= 30 ? "online" : secs <= 120 ? "idle" : "offline";
    let text = "Ahora";
    if (secs >= 5 && secs < 60) text = `Hace ${secs}s`;
    else if (secs >= 60 && secs < 3600) text = `Hace ${Math.floor(secs / 60)}m`;
    else if (secs >= 3600) text = `Hace ${Math.floor(secs / 3600)}h`;
    return { text, status };
}

const STATUS_COLOR: Record<GPSStatus, string> = {
    online: "#3bf63b",
    idle: "#f59e0b",
    offline: "#6b7280",
};

// ─── Distance (Haversine) ─────────────────────────────────────────────────────

function distM(a: [number, number], b: [number, number]): number {
    const R = 6371000;
    const dLat = ((b[0] - a[0]) * Math.PI) / 180;
    const dLng = ((b[1] - a[1]) * Math.PI) / 180;
    const x =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((a[0] * Math.PI) / 180) *
            Math.cos((b[0] * Math.PI) / 180) *
            Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

// ─── OSRM road routing (free, no key needed) ──────────────────────────────────
// Cache en memoria para no re-fetchear cuando el conductor está prácticamente quieto.
// Key: lat/lng redondeados a 3 decimales (~110m) para que cambios diminutos
// reusen la misma ruta. Se invalida al recargar la página.

const osrmCache = new Map<string, [number, number][]>();

function osrmKey(from: [number, number], to: [number, number]): string {
    const r = (n: number) => n.toFixed(3);
    return `${r(from[0])},${r(from[1])}->${r(to[0])},${r(to[1])}`;
}

async function getRoadRoute(
    from: [number, number],
    to: [number, number]
): Promise<[number, number][]> {
    const key = osrmKey(from, to);
    const cached = osrmCache.get(key);
    if (cached) return cached;
    try {
        const url =
            `https://router.project-osrm.org/route/v1/driving/` +
            `${from[1]},${from[0]};${to[1]},${to[0]}?geometries=geojson&overview=full`;
        const res = await fetch(url, { signal: AbortSignal.timeout(7000) });
        if (!res.ok) return [from, to];
        const data = await res.json();
        const coords: [number, number][] = data.routes?.[0]?.geometry?.coordinates;
        if (!coords?.length) return [from, to];
        const result = coords.map(([lng, lat]) => [lat, lng] as [number, number]);
        osrmCache.set(key, result);
        return result;
    } catch {
        return [from, to];
    }
}

// ─── Breadcrumb persistence (localStorage, max 24h) ───────────────────────────

const BREADCRUMB_KEY = "ecofleet_breadcrumbs_v1";
const BREADCRUMB_TTL_MS = 24 * 60 * 60 * 1000;

function loadBreadcrumbs(): Map<string, [number, number][]> {
    if (typeof window === "undefined") return new Map();
    try {
        const raw = localStorage.getItem(BREADCRUMB_KEY);
        if (!raw) return new Map();
        const obj = JSON.parse(raw) as { ts: number; data: Record<string, [number, number][]> };
        if (!obj?.ts || Date.now() - obj.ts > BREADCRUMB_TTL_MS) return new Map();
        return new Map(Object.entries(obj.data ?? {}));
    } catch {
        return new Map();
    }
}

function saveBreadcrumbs(map: Map<string, [number, number][]>) {
    if (typeof window === "undefined") return;
    try {
        const data: Record<string, [number, number][]> = {};
        map.forEach((v, k) => { data[k] = v; });
        localStorage.setItem(BREADCRUMB_KEY, JSON.stringify({ ts: Date.now(), data }));
    } catch { /* quota or disabled */ }
}

function mergeBreadcrumbHistory(
    prev: Map<string, [number, number][]>,
    rutasActivas: RutaTracking[]
) {
    let next = prev;
    let changed = false;

    rutasActivas.forEach((r) => {
        if (!r.latitudActual || !r.longitudActual || !r.id || !r.ultimaActualizacionGPS) return;
        const p: [number, number] = [r.latitudActual, r.longitudActual];
        const h = next.get(r.id) ?? [];
        const last = h[h.length - 1];
        if (!last || distM(last, p) > 5) {
            if (!changed) {
                next = new Map(next);
                changed = true;
            }
            next.set(r.id, [...h, p].slice(-300));
        }
    });

    return changed ? next : prev;
}

// ─── Leaflet icons ────────────────────────────────────────────────────────────

function makeTruckIcon(status: GPSStatus, label: string): L.DivIcon {
    const c = STATUS_COLOR[status];
    const anim =
        status === "online"
            ? `@keyframes gps-ping{0%,100%{box-shadow:0 0 0 0 ${c}70}50%{box-shadow:0 0 0 10px transparent}}`
            : "";
    const animStyle = status === "online" ? "animation:gps-ping 1.8s ease-in-out infinite;" : "";
    return L.divIcon({
        html: `<style>${anim}</style>
        <div style="display:flex;flex-direction:column;align-items:center;gap:3px;">
          <div style="background:${c};width:38px;height:38px;border-radius:50%;border:3px solid #fff;
            display:flex;align-items:center;justify-content:center;font-size:18px;
            box-shadow:0 4px 16px ${c}90;${animStyle}">🚛</div>
          <div style="background:rgba(0,0,0,0.88);color:#fff;font-size:9px;font-weight:800;
            padding:2px 6px;border-radius:4px;white-space:nowrap;
            border:1px solid ${c}50;letter-spacing:0.3px;">${label}</div>
        </div>`,
        className: "",
        iconSize: [48, 60],
        iconAnchor: [24, 19],
        popupAnchor: [0, -20],
    });
}

const OriginIcon = L.divIcon({
    html: `<div style="width:14px;height:14px;background:#3bf63b;border-radius:50%;
        border:2.5px solid #fff;box-shadow:0 0 12px #3bf63b90;"></div>`,
    className: "",
    iconSize: [14, 14],
    iconAnchor: [7, 7],
});

const DestIcon = L.divIcon({
    html: `<div style="width:14px;height:14px;background:#ef4444;border-radius:3px;
        border:2.5px solid #fff;box-shadow:0 0 12px #ef444490;"></div>`,
    className: "",
    iconSize: [14, 14],
    iconAnchor: [7, 7],
});

function makeIdleIcon(label: string, status: GPSStatus): L.DivIcon {
    const c = STATUS_COLOR[status];
    return L.divIcon({
        html: `<div style="display:flex;flex-direction:column;align-items:center;gap:3px;">
          <div style="background:rgba(20,20,28,0.9);width:32px;height:32px;border-radius:50%;
            border:2.5px solid ${c};display:flex;align-items:center;justify-content:center;
            font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,0.5);">👤</div>
          <div style="background:rgba(0,0,0,0.85);color:#fff;font-size:9px;font-weight:700;
            padding:2px 5px;border-radius:4px;white-space:nowrap;
            border:1px solid ${c}40;letter-spacing:0.2px;opacity:0.85;">${label}</div>
        </div>`,
        className: "",
        iconSize: [40, 50],
        iconAnchor: [20, 16],
        popupAnchor: [0, -16],
    });
}

// ─── Map helpers ──────────────────────────────────────────────────────────────

function FlyTo({ pos }: { pos: [number, number] | null }) {
    const map = useMap();
    const prev = useRef<string>("");
    useEffect(() => {
        if (!pos) return;
        const key = pos.join(",");
        if (key === prev.current) return;
        prev.current = key;
        map.flyTo(pos, 15, { duration: 1.4, easeLinearity: 0.3 });
    }, [pos, map]);
    return null;
}

function FitAll({ positions }: { positions: [number, number][] }) {
    const map = useMap();
    const done = useRef(false);
    useEffect(() => {
        if (done.current || positions.length === 0) return;
        done.current = true;
        if (positions.length === 1) {
            map.setView(positions[0], 14);
        } else {
            map.fitBounds(L.latLngBounds(positions), { padding: [60, 60], maxZoom: 13 });
        }
    }, [positions.length > 0]);
    return null;
}

// ─── Per-route layer ──────────────────────────────────────────────────────────

function RouteLayer({
    ruta,
    history,
    selected,
}: {
    ruta: RutaTracking;
    history: [number, number][];
    selected: boolean;
}) {
    const [roadLine, setRoadLine] = useState<[number, number][]>([]);
    const lastFetchPos = useRef<[number, number] | null>(null);

    // Solo consideramos posición actual real si vino con timestamp de GPS.
    // Rutas heredadas con latitudActual=origen pero sin ultimaActualizacionGPS
    // se descartan: el truck NO se ancla al origen.
    const cur: [number, number] | null =
        ruta.latitudActual && ruta.longitudActual && ruta.ultimaActualizacionGPS
            ? [ruta.latitudActual, ruta.longitudActual]
            : null;
    const dest: [number, number] | null =
        ruta.latitudDestino && ruta.longitudDestino
            ? [ruta.latitudDestino, ruta.longitudDestino]
            : null;
    const orig: [number, number] | null =
        ruta.latitudOrigen && ruta.longitudOrigen
            ? [ruta.latitudOrigen, ruta.longitudOrigen]
            : null;

    // Re-fetch road route only when conductor moves >80m
    useEffect(() => {
        if (!cur || !dest) return;
        if (lastFetchPos.current && distM(lastFetchPos.current, cur) < 80) return;
        lastFetchPos.current = cur;
        getRoadRoute(cur, dest).then(setRoadLine);
    }, [cur?.[0], cur?.[1]]);

    const gps = getGPSStatus(ruta.ultimaActualizacionGPS, !!cur);
    const lineColor = STATUS_COLOR[gps.status];
    const lineW = selected ? 5 : 3;
    const truckLabel = ruta.conductorNombre?.split(" ")[0] ?? "Driver";

    return (
        <>
            {/* Origin */}
            {orig && (
                <Marker position={orig} icon={OriginIcon}>
                    <Popup>
                        <b>Inicio:</b> {ruta.origen}
                    </Popup>
                </Marker>
            )}

            {/* Destination */}
            {dest && (
                <Marker position={dest} icon={DestIcon}>
                    <Popup>
                        <b>Destino:</b> {ruta.destino}
                    </Popup>
                </Marker>
            )}

            {/* Breadcrumb trail — where the driver has been */}
            {history.length > 1 && (
                <Polyline
                    positions={history}
                    pathOptions={{
                        color: lineColor,
                        weight: 2,
                        opacity: 0.4,
                        dashArray: "6 5",
                    }}
                />
            )}

            {/* Road route: current position → destination */}
            {roadLine.length > 1 && (
                <Polyline
                    positions={roadLine}
                    pathOptions={{
                        color: lineColor,
                        weight: lineW,
                        opacity: selected ? 0.92 : 0.62,
                    }}
                />
            )}

            {/* Truck marker */}
            {cur && (
                <Marker
                    position={cur}
                    icon={makeTruckIcon(gps.status, truckLabel)}
                >
                    <Popup maxWidth={270} minWidth={240}>
                        <div
                            style={{
                                fontFamily: "system-ui, sans-serif",
                                fontSize: "0.8rem",
                                color: "#111",
                            }}
                        >
                            <div
                                style={{
                                    fontWeight: 800,
                                    fontSize: "0.95rem",
                                    marginBottom: 8,
                                    paddingBottom: 8,
                                    borderBottom: `2px solid ${lineColor}`,
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                }}
                            >
                                <span>🚛 {ruta.conductorNombre ?? "Conductor"}</span>
                                <span
                                    style={{
                                        fontSize: "0.6rem",
                                        background: lineColor,
                                        color: "#000",
                                        padding: "2px 6px",
                                        borderRadius: 5,
                                        fontWeight: 900,
                                    }}
                                >
                                    {gps.status.toUpperCase()}
                                </span>
                            </div>
                            <div
                                style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 5,
                                }}
                            >
                                <div>
                                    📍 <b>Ruta:</b> {ruta.origen} → {ruta.destino}
                                </div>
                                <div
                                    style={{
                                        display: "flex",
                                        gap: 12,
                                        background: "rgba(0,0,0,0.05)",
                                        borderRadius: 6,
                                        padding: "6px 8px",
                                    }}
                                >
                                    <span>
                                        ⚡{" "}
                                        <b>
                                            {ruta.velocidadActualKmh != null
                                                ? ruta.velocidadActualKmh.toFixed(1)
                                                : "—"}{" "}
                                            km/h
                                        </b>
                                    </span>
                                    <span>
                                        📏{" "}
                                        {ruta.distanciaRestanteKm != null
                                            ? ruta.distanciaRestanteKm.toFixed(1)
                                            : "—"}{" "}
                                        km
                                    </span>
                                </div>
                                <div>🕐 GPS: {gps.text}</div>
                                <div
                                    style={{
                                        fontFamily: "monospace",
                                        fontSize: "0.65rem",
                                        color: "#888",
                                    }}
                                >
                                    {cur[0].toFixed(5)}, {cur[1].toFixed(5)}
                                </div>
                                {ruta.desviado && (
                                    <div
                                        style={{
                                            color: "#ef4444",
                                            fontWeight: 700,
                                            background: "#fef2f2",
                                            padding: "4px 8px",
                                            borderRadius: 6,
                                        }}
                                    >
                                        ⚠️ DESVIADO DE LA RUTA
                                    </div>
                                )}
                            </div>
                        </div>
                    </Popup>
                </Marker>
            )}
        </>
    );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function MapTrackingGlobal({
    rutasActivas,
    conductoresUbicaciones = [],
    onRutaClick,
}: MapTrackingGlobalProps) {
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [flyPos, setFlyPos] = useState<[number, number] | null>(null);
    // Breadcrumb history persists across re-renders AND page reloads (localStorage)
    const [historyMap, mergeHistoryMapDispatch] = useReducer(
        mergeBreadcrumbHistory,
        [] as RutaTracking[],
        () => loadBreadcrumbs()
    );
    const saveTickRef = useRef(0);

    // Solo añadimos al breadcrumb si la posición viene con timestamp de GPS real.
    useEffect(() => {
        mergeHistoryMapDispatch(rutasActivas);
    }, [rutasActivas]);

    useEffect(() => {
        if (historyMap.size === 0) return;
        saveTickRef.current += 1;
        if (saveTickRef.current % 10 === 0) {
            saveBreadcrumbs(historyMap);
        }
    }, [historyMap]);

    // Una ruta tiene GPS REAL solo si llegó al menos un POST /{id}/gps,
    // lo que se traduce en `ultimaActualizacionGPS` no-null. Si solo tiene
    // latitudActual sin timestamp = dato heredado del origen → lo ignoramos.
    const hasRealGPS = (r: RutaTracking) =>
        r.latitudActual != null &&
        r.longitudActual != null &&
        !!r.ultimaActualizacionGPS;

    const active = rutasActivas.filter(
        (r) => r.estado === "EN_CURSO" || r.estado === "DETENIDO"
    );

    // Conductores idle = los que tienen ubicación pero NO son el conductor de ninguna
    // ruta activa CON GPS REAL. Si una ruta está EN_CURSO pero todavía no llegó el
    // primer GPS, el conductor sigue apareciendo en su ubicación de presencia.
    const activeConductorIds = new Set(
        active
            .filter(hasRealGPS)
            .map((r) => r.conductorId)
            .filter(Boolean) as string[]
    );
    const idleDrivers = conductoresUbicaciones.filter(
        (c) =>
            c.latitudActual != null &&
            c.longitudActual != null &&
            !activeConductorIds.has(c.id)
    );

    const allPos: [number, number][] = [
        ...active
            .filter(hasRealGPS)
            .map((r) => [r.latitudActual!, r.longitudActual!] as [number, number]),
        ...idleDrivers.map((c) => [c.latitudActual!, c.longitudActual!] as [number, number]),
    ];

    const center: [number, number] =
        allPos.length > 0
            ? [
                  allPos.reduce((s, p) => s + p[0], 0) / allPos.length,
                  allPos.reduce((s, p) => s + p[1], 0) / allPos.length,
              ]
            : [40.4168, -3.7038];

    const handleSelect = (r: RutaTracking) => {
        setSelectedId(r.id ?? null);
        if (r.latitudActual && r.longitudActual) {
            setFlyPos([r.latitudActual, r.longitudActual]);
        }
        if (r.id) onRutaClick?.(r.id);
    };

    return (
        <div className="tracking-global-shell">
            {/* Interpolación CSS: cuando el truck cambia de posición, el wrapper
                de Leaflet anima la transición del transform — en vez de saltar.
                Resultado: movimiento fluido aunque el GPS llegue cada N segundos. */}
            <style>{`
                .tracking-global-shell {
                    display: flex;
                    height: 100%;
                    gap: 12px;
                    min-height: 0;
                }
                .tracking-global-sidebar {
                    width: 230px;
                    flex-shrink: 0;
                    display: flex;
                    flex-direction: column;
                    background: rgba(6,6,12,0.97);
                    border-radius: 14px;
                    border: 1px solid rgba(255,255,255,0.07);
                    overflow: hidden;
                    min-height: 0;
                }
                .tracking-global-sidebar-header {
                    padding: 12px 14px;
                    border-bottom: 1px solid rgba(255,255,255,0.06);
                }
                .tracking-global-sidebar-list {
                    flex: 1;
                    overflow-y: auto;
                    padding: 6px;
                    min-height: 0;
                }
                .tracking-global-route-card,
                .tracking-global-idle-card {
                    scroll-snap-align: start;
                }
                .tracking-global-map {
                    flex: 1;
                    border-radius: 14px;
                    overflow: hidden;
                    border: 1px solid rgba(255,255,255,0.07);
                    min-width: 0;
                    min-height: 0;
                }
                .leaflet-marker-icon, .leaflet-marker-shadow {
                    transition: transform 1.4s cubic-bezier(0.25, 0.1, 0.25, 1);
                    will-change: transform;
                }
                .leaflet-zoom-anim .leaflet-marker-icon,
                .leaflet-zoom-anim .leaflet-marker-shadow {
                    transition: none;
                }
                @media (max-width: 980px) {
                    .tracking-global-shell {
                        flex-direction: column;
                        gap: 10px;
                    }
                    .tracking-global-map {
                        order: -1;
                        min-height: clamp(360px, 56vh, 540px);
                    }
                    .tracking-global-sidebar {
                        width: 100%;
                    }
                    .tracking-global-sidebar-header {
                        padding: 10px 12px;
                        display: flex;
                        justify-content: space-between;
                        align-items: flex-end;
                        gap: 12px;
                    }
                    .tracking-global-sidebar-list {
                        display: flex;
                        gap: 8px;
                        overflow-x: auto;
                        overflow-y: hidden;
                        padding: 8px;
                        flex: 0 0 auto;
                        scroll-snap-type: x proximity;
                        -webkit-overflow-scrolling: touch;
                    }
                    .tracking-global-route-card,
                    .tracking-global-idle-card {
                        flex: 0 0 min(280px, 78vw);
                        margin-bottom: 0 !important;
                    }
                    .tracking-global-idle-title {
                        display: flex;
                        align-items: center;
                        min-width: max-content;
                        padding: 0 4px !important;
                        border-top: none !important;
                        margin-top: 0 !important;
                    }
                }
                @media (max-width: 640px) {
                    .tracking-global-map {
                        min-height: clamp(400px, 62vh, 620px);
                    }
                    .tracking-global-sidebar-header {
                        align-items: center;
                    }
                    .tracking-global-route-card,
                    .tracking-global-idle-card {
                        flex-basis: min(320px, 84vw);
                    }
                }
            `}</style>
            {/* ── Sidebar ────────────────────────────────────── */}
            <div className="tracking-global-sidebar">
                <div className="tracking-global-sidebar-header">
                    <div
                        style={{
                            fontSize: "0.58rem",
                            color: "#4b5563",
                            textTransform: "uppercase",
                            letterSpacing: "1.5px",
                            fontWeight: 700,
                        }}
                    >
                        Conductores activos
                    </div>
                    <div
                        style={{
                            fontSize: "1.5rem",
                            fontWeight: 900,
                            color: "#3bf63b",
                            lineHeight: 1.1,
                            marginTop: 2,
                        }}
                    >
                        {active.length}{" "}
                        <span
                            style={{
                                fontSize: "0.62rem",
                                color: "#6b7280",
                                fontWeight: 500,
                            }}
                        >
                            en ruta
                        </span>
                        {idleDrivers.length > 0 && (
                            <span
                                style={{
                                    fontSize: "0.62rem",
                                    color: "#9ca3af",
                                    fontWeight: 500,
                                    marginLeft: 8,
                                }}
                            >
                                · {idleDrivers.length} idle
                            </span>
                        )}
                    </div>
                </div>

                <div className="tracking-global-sidebar-list">
                    {active.length === 0 && (
                        <div
                            style={{
                                padding: "2rem 1rem",
                                textAlign: "center",
                                color: "#374151",
                                fontSize: "0.75rem",
                            }}
                        >
                            Sin conductores en ruta
                        </div>
                    )}

                    {active.map((r) => {
                        const gps = getGPSStatus(
                            r.ultimaActualizacionGPS,
                            hasRealGPS(r)
                        );
                        const c = STATUS_COLOR[gps.status];
                        const isSel = r.id === selectedId;

                        return (
                            <div
                                key={r.id}
                                className="tracking-global-route-card"
                                onClick={() => handleSelect(r)}
                                style={{
                                    padding: "10px 10px 8px",
                                    borderRadius: 10,
                                    marginBottom: 5,
                                    cursor: "pointer",
                                    transition: "all .2s",
                                    background: isSel
                                        ? `${c}14`
                                        : "rgba(255,255,255,0.02)",
                                    border: `1px solid ${
                                        isSel
                                            ? c + "45"
                                            : "rgba(255,255,255,0.05)"
                                    }`,
                                }}
                            >
                                <div
                                    style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "center",
                                        marginBottom: 3,
                                    }}
                                >
                                    <span
                                        style={{
                                            fontSize: "0.72rem",
                                            fontWeight: 700,
                                            color: "#e5e7eb",
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap",
                                            maxWidth: 120,
                                        }}
                                    >
                                        {r.conductorNombre ?? "Conductor"}
                                    </span>
                                    <span
                                        style={{
                                            fontSize: "0.5rem",
                                            fontWeight: 800,
                                            color: c,
                                            background: `${c}18`,
                                            padding: "2px 5px",
                                            borderRadius: 5,
                                            letterSpacing: "0.3px",
                                        }}
                                    >
                                        {gps.status === "online"
                                            ? `● ${formatConnectionStateLabel("online")}`
                                            : gps.status === "idle"
                                            ? `◐ ${formatConnectionStateLabel("idle")}`
                                            : `○ ${formatConnectionStateLabel("offline")}`}
                                    </span>
                                </div>

                                <div
                                    style={{
                                        fontSize: "0.6rem",
                                        color: "#6b7280",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                        marginBottom: 5,
                                    }}
                                >
                                    {r.origen} → {r.destino}
                                </div>

                                <div
                                    style={{
                                        display: "flex",
                                        gap: 8,
                                        fontSize: "0.6rem",
                                        color: "#9ca3af",
                                    }}
                                >
                                    {r.velocidadActualKmh != null && (
                                        <span>
                                            ⚡{r.velocidadActualKmh.toFixed(0)}{" "}
                                            km/h
                                        </span>
                                    )}
                                    {r.distanciaRestanteKm != null && (
                                        <span>
                                            📏{r.distanciaRestanteKm.toFixed(1)}{" "}
                                            km
                                        </span>
                                    )}
                                    {r.desviado && (
                                        <span style={{ color: "#ef4444" }}>
                                            ⚠️
                                        </span>
                                    )}
                                </div>

                                <div
                                    style={{
                                        fontSize: "0.55rem",
                                        color: "#374151",
                                        marginTop: 3,
                                    }}
                                >
                                    🕐 {gps.text}
                                </div>
                            </div>
                        );
                    })}

                    {idleDrivers.length > 0 && (
                        <div
                            className="tracking-global-idle-title"
                            style={{
                                fontSize: "0.55rem",
                                color: "#4b5563",
                                textTransform: "uppercase",
                                letterSpacing: "1.2px",
                                fontWeight: 700,
                                padding: "10px 6px 4px",
                                borderTop: "1px solid rgba(255,255,255,0.05)",
                                marginTop: 6,
                            }}
                        >
                            Sin ruta activa
                        </div>
                    )}

                    {idleDrivers.map((c) => {
                        const gps = getGPSStatus(c.ultimaActualizacionGPS, true);
                        const color = STATUS_COLOR[gps.status];
                        return (
                            <div
                                key={`idle-${c.id}`}
                                className="tracking-global-idle-card"
                                onClick={() => {
                                    if (c.latitudActual && c.longitudActual) {
                                        setFlyPos([c.latitudActual, c.longitudActual]);
                                        setSelectedId(null);
                                    }
                                }}
                                style={{
                                    padding: "8px 10px",
                                    borderRadius: 10,
                                    marginBottom: 4,
                                    cursor: "pointer",
                                    background: "rgba(255,255,255,0.015)",
                                    border: "1px solid rgba(255,255,255,0.04)",
                                    opacity: 0.85,
                                }}
                            >
                                <div
                                    style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "center",
                                    }}
                                >
                                    <span
                                        style={{
                                            fontSize: "0.7rem",
                                            fontWeight: 600,
                                            color: "#cbd5e1",
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap",
                                            maxWidth: 130,
                                        }}
                                    >
                                        👤 {c.nombre}
                                    </span>
                                    <span
                                        style={{
                                            width: 6,
                                            height: 6,
                                            borderRadius: "50%",
                                            background: color,
                                        }}
                                    />
                                </div>
                                <div
                                    style={{
                                        fontSize: "0.55rem",
                                        color: "#4b5563",
                                        marginTop: 2,
                                    }}
                                >
                                    🕐 {gps.text}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ── Map ────────────────────────────────────────── */}
            <div className="tracking-global-map">
                <MapContainer
                    center={center}
                    zoom={allPos.length > 0 ? 10 : 6}
                    style={{ height: "100%", width: "100%" }}
                    attributionControl={false}
                >
                    <TileLayer
                        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                        attribution='© <a href="https://www.openstreetmap.org/copyright">OSM</a>'
                    />
                    <FlyTo pos={flyPos} />
                    {allPos.length > 0 && !selectedId && (
                        <FitAll positions={allPos} />
                    )}
                    {active.map((r) => (
                        <RouteLayer
                            key={r.id}
                            ruta={r}
                            history={historyMap.get(r.id ?? "") ?? []}
                            selected={r.id === selectedId}
                        />
                    ))}
                    {idleDrivers.map((c) => {
                        // Si el conductor apagó el tracking en su app, lo mostramos
                        // como "offline" aunque tenga última posición conocida.
                        const sharing = c.compartiendoUbicacion !== false;
                        const gps = sharing
                            ? getGPSStatus(c.ultimaActualizacionGPS, true)
                            : { text: "Sin compartir", status: "offline" as GPSStatus };
                        const label = c.nombre?.split(" ")[0] ?? "Driver";
                        return (
                            <Marker
                                key={`idle-${c.id}`}
                                position={[c.latitudActual!, c.longitudActual!]}
                                icon={makeIdleIcon(label, gps.status)}
                            >
                                <Popup>
                                    <div style={{ fontFamily: "system-ui, sans-serif", fontSize: "0.8rem", color: "#111" }}>
                                        <div style={{ fontWeight: 800, marginBottom: 4 }}>👤 {c.nombre}</div>
                                        <div style={{ fontSize: "0.7rem", color: "#666" }}>
                                            {sharing ? "Sin ruta activa" : "GPS apagado por el conductor"}
                                        </div>
                                        <div style={{ fontSize: "0.7rem", marginTop: 4 }}>🕐 GPS: {gps.text}</div>
                                        <div style={{ fontFamily: "monospace", fontSize: "0.62rem", color: "#888", marginTop: 2 }}>
                                            {c.latitudActual!.toFixed(5)}, {c.longitudActual!.toFixed(5)}
                                        </div>
                                    </div>
                                </Popup>
                            </Marker>
                        );
                    })}
                </MapContainer>
            </div>
        </div>
    );
}
