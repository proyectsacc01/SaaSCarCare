"use client";

import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState, useCallback } from "react";

// ─── Types ──────────────────────────────────────────────────────────────────

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
    /** Cuando cambia, el mapa vuelve a centrar/zoomear en el conductor. */
    recenterTrigger?: number;
}

// ─── Math helpers ───────────────────────────────────────────────────────────

function distanceMeters(a: [number, number], b: [number, number]) {
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

function bearingDegrees(from: [number, number], to: [number, number]) {
    const lat1 = (from[0] * Math.PI) / 180;
    const lat2 = (to[0] * Math.PI) / 180;
    const dLng = ((to[1] - from[1]) * Math.PI) / 180;
    const y = Math.sin(dLng) * Math.cos(lat2);
    const x =
        Math.cos(lat1) * Math.sin(lat2) -
        Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    const angle = (Math.atan2(y, x) * 180) / Math.PI;
    return (angle + 360) % 360;
}

function shortestAngleDelta(from: number, to: number) {
    return ((to - from + 540) % 360) - 180;
}

function normalizeAngle(angle: number) {
    return ((angle % 360) + 360) % 360;
}

function interpolatePoint(
    from: [number, number],
    to: [number, number],
    progress: number
): [number, number] {
    return [
        from[0] + (to[0] - from[0]) * progress,
        from[1] + (to[1] - from[1]) * progress,
    ];
}

/** Cubic ease-out for natural deceleration */
function easeOutCubic(t: number) {
    return 1 - Math.pow(1 - t, 3);
}

/**
 * Find bearing from position along the route ahead.
 * Looks at the next segment from the closest point on the route,
 * so the arrow always points in the direction of the road.
 */
function inferRouteBearing(
    position: [number, number],
    routeCoordinates: [number, number][]
): number | null {
    if (routeCoordinates.length < 2) return null;

    let closestIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;

    for (let i = 0; i < routeCoordinates.length; i++) {
        const d = distanceMeters(position, routeCoordinates[i]);
        if (d < closestDistance) {
            closestDistance = d;
            closestIndex = i;
        }
    }

    // Look ahead 2-3 points for a smoother bearing on curves
    const lookAhead = Math.min(closestIndex + 3, routeCoordinates.length - 1);
    const nextPoint = routeCoordinates[lookAhead];

    if (nextPoint && distanceMeters(position, nextPoint) > 1) {
        return bearingDegrees(position, nextPoint);
    }

    // Fallback: bearing from previous point to current
    const prevPoint = routeCoordinates[Math.max(closestIndex - 1, 0)];
    if (prevPoint && distanceMeters(prevPoint, position) > 1) {
        return bearingDegrees(prevPoint, position);
    }

    return null;
}

// ─── Iconos Leaflet ─────────────────────────────────────────────────────────

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

function createConductorIcon(heading: number) {
    return L.divIcon({
        html: `<div style="position: relative; width: 26px; height: 26px;">
            <div style="
                position: absolute; inset: -12px;
                border-radius: 999px;
                background: rgba(59,246,59,0.14);
                box-shadow: 0 0 28px rgba(59,246,59,0.22);
                animation: nav-pulse 1.6s ease-out infinite;
            "></div>
            <div style="
                position: absolute; inset: 0;
                display: flex; align-items: center; justify-content: center;
                transform: rotate(${heading}deg);
                transition: transform 150ms linear;
            ">
                <div style="position: relative; width: 26px; height: 26px; display: flex; align-items: center; justify-content: center;">
                    <div style="
                        position: absolute; top: -2px; left: 50%; transform: translateX(-50%);
                        width: 0; height: 0;
                        border-left: 7px solid transparent;
                        border-right: 7px solid transparent;
                        border-bottom: 14px solid #3bf63b;
                        filter: drop-shadow(0 0 8px rgba(59,246,59,0.85));
                    "></div>
                    <div style="
                        position: absolute; bottom: 1px; left: 50%; transform: translateX(-50%);
                        width: 16px; height: 16px; border-radius: 999px;
                        background: #3bf63b;
                        border: 3px solid #050608;
                        box-shadow: 0 0 12px rgba(59,246,59,0.72);
                    "></div>
                </div>
            </div>
            <style>@keyframes nav-pulse {
                0% { transform: scale(0.5); opacity: 0.9; }
                100% { transform: scale(1.4); opacity: 0; }
            }</style>
        </div>`,
        className: "",
        iconSize: [26, 26],
        iconAnchor: [13, 13],
    });
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function RemoveLeafletPrefix() {
    const map = useMap();
    useEffect(() => {
        map.attributionControl?.setPrefix("");
    }, [map]);
    return null;
}

/**
 * AutoFit: Ajusta bounds cuando se cargan las rutas o puntos por primera vez.
 * Solo corre cuando enabled=true (no en followMode con GPS activo).
 */
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

/**
 * SmoothFollowCamera: En vez de saltar, la cámara PAN suave al conductor
 * usando flyTo con duración proporcional a la distancia.
 * No anima si la distancia es mínima (evita micro-stutters).
 */
function SmoothFollowCamera({
    enabled,
    driverPos,
    driverZoom,
}: {
    enabled: boolean;
    driverPos: [number, number] | null;
    driverZoom: number;
}) {
    const map = useMap();
    const lastPanRef = useRef<[number, number] | null>(null);

    useEffect(() => {
        if (!enabled || !driverPos) return;

        const currentCenter = map.getCenter();
        const currentLat = currentCenter.lat;
        const currentLng = currentCenter.lng;
        const distFromCenter = distanceMeters(
            [currentLat, currentLng],
            driverPos
        );

        // Si la distancia del centro del mapa al conductor es muy pequeña,
        // no hacemos nada — evita micro-pans que causan flicker.
        if (distFromCenter < 3) return;

        // Si es un salto grande (>500m), usamos setView instantáneo
        if (distFromCenter > 500) {
            map.setView(driverPos, Math.max(map.getZoom(), driverZoom), {
                animate: false,
            });
            lastPanRef.current = driverPos;
            return;
        }

        // Pan suave: duración proporcional a la distancia (más lejos = más lento)
        // pero acotada entre 0.3s y 1.2s para que siempre se sienta fluido
        const duration = Math.max(0.3, Math.min(1.2, distFromCenter / 200));
        map.panTo(driverPos, {
            animate: true,
            duration,
            easeLinearity: 0.4,
        });
        lastPanRef.current = driverPos;
    }, [enabled, driverPos, driverZoom, map]);
    return null;
}

/**
 * RecenterOnTrigger: Botón "Centrar en mí" — flyTo con animación
 */
function RecenterOnTrigger({
    trigger,
    pos,
    zoom,
}: {
    trigger?: number;
    pos: [number, number] | null;
    zoom: number;
}) {
    const map = useMap();
    useEffect(() => {
        if (trigger == null || !pos) return;
        map.flyTo(pos, zoom, { animate: true, duration: 0.6 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [trigger]);
    return null;
}

// ─── Componente principal ───────────────────────────────────────────────────

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
    recenterTrigger,
}: Props) {
    // ── Animated state ──────────────────────────────────────────────────────
    const [animatedPos, setAnimatedPos] = useState<[number, number] | null>(null);
    const [animatedHeading, setAnimatedHeading] = useState(0);

    const animFrameRef = useRef<number | null>(null);
    const lastTargetRef = useRef<[number, number] | null>(null);
    const headingRef = useRef(0);
    const lastGpsHeadingRef = useRef<number | null>(null);

    // Ruta activa para infer bearing
    const activeGeometry = routes[activeIdx]?.geometry ?? [];

    // Resolve heading from: liveHeading (compass/GPS) → route-inferred → movement → previous
    // Now that liveHeading comes from real compass (stationary) or GPS (moving),
    // it is the TRUSTED primary source. Route geometry is only a last resort.
    const resolveHeading = useCallback(
        (pos: [number, number], gpsHeading: number | null | undefined): number => {
            // 1. Live heading from compass or GPS — this IS the real direction
            if (
                typeof gpsHeading === "number" &&
                gpsHeading >= 0 &&
                Number.isFinite(gpsHeading)
            ) {
                lastGpsHeadingRef.current = gpsHeading;
                return gpsHeading;
            }

            // 2. Calculate from movement (last position → current position)
            if (lastTargetRef.current) {
                const d = distanceMeters(lastTargetRef.current, pos);
                if (d > 2) {
                    return bearingDegrees(lastTargetRef.current, pos);
                }
            }

            // 3. Infer from route geometry (last resort — less accurate)
            const routeBearing = inferRouteBearing(pos, activeGeometry);
            if (routeBearing !== null) return routeBearing;

            // 4. Keep previous heading
            return headingRef.current;
        },
        [activeGeometry]
    );

    // ── Interpolation animation loop ────────────────────────────────────────
    useEffect(() => {
        const targetPos = currentPos;
        if (!targetPos) return;

        // First fix: snap immediately
        if (!animatedPos) {
            const heading = resolveHeading(targetPos, liveHeading);
            headingRef.current = heading;
            lastTargetRef.current = targetPos;
            const frame = requestAnimationFrame(() => {
                setAnimatedPos(targetPos);
                setAnimatedHeading(heading);
            });
            return () => cancelAnimationFrame(frame);
        }

        const startPos = animatedPos;
        const startHeading = headingRef.current;
        const desiredHeading = resolveHeading(targetPos, liveHeading);

        // Cancel any running animation
        if (animFrameRef.current !== null) {
            cancelAnimationFrame(animFrameRef.current);
            animFrameRef.current = null;
        }

        const totalDist = distanceMeters(startPos, targetPos);

        // Very small movement: snap instantly
        if (totalDist < 0.5) {
            const blended = normalizeAngle(
                startHeading + shortestAngleDelta(startHeading, desiredHeading) * 0.3
            );
            headingRef.current = blended;
            lastTargetRef.current = targetPos;
            const frame = requestAnimationFrame(() => {
                setAnimatedPos(targetPos);
                setAnimatedHeading(blended);
            });
            return () => cancelAnimationFrame(frame);
        }

        // Adaptive duration:
        // - Short moves (< 10m): 250ms for snappy response
        // - Medium (10-100m): 400-800ms
        // - Long (> 100m): cap at 1300ms to avoid sluggishness
        const duration = Math.max(250, Math.min(1300, totalDist * 18));
        const startedAt = performance.now();

        const animate = (now: number) => {
            const raw = Math.min(1, (now - startedAt) / duration);
            const eased = easeOutCubic(raw);

            const pos = interpolatePoint(startPos, targetPos, eased);
            const heading = normalizeAngle(
                startHeading + shortestAngleDelta(startHeading, desiredHeading) * eased
            );

            setAnimatedPos(pos);
            setAnimatedHeading(heading);

            if (raw < 1) {
                animFrameRef.current = requestAnimationFrame(animate);
                return;
            }

            // Animation complete
            headingRef.current = desiredHeading;
            lastTargetRef.current = targetPos;
            animFrameRef.current = null;
        };

        animFrameRef.current = requestAnimationFrame(animate);

        return () => {
            if (animFrameRef.current !== null) {
                cancelAnimationFrame(animFrameRef.current);
                animFrameRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentPos, liveHeading, resolveHeading]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (animFrameRef.current !== null) {
                cancelAnimationFrame(animFrameRef.current);
            }
        };
    }, []);

    // ── Derived values ──────────────────────────────────────────────────────

    // Punto visible del conductor (animado o raw)
    const displayPos = animatedPos ?? currentPos;
    const startPos = displayPos ?? origen;
    const initialCenter: [number, number] = startPos ?? destino ?? [40.4168, -3.7035];

    const fitPoints: [number, number][] = [];
    if (startPos) fitPoints.push(startPos);
    if (destino) fitPoints.push(destino);
    activeGeometry.forEach(p => fitPoints.push(p));

    return (
        <MapContainer
            center={initialCenter}
            zoom={followMode && startPos ? driverZoom : 13}
            zoomControl={false}
            attributionControl={false}
            style={{ width: '100%', height: '100%', background: '#050608' }}
        >
            <RemoveLeafletPrefix />
            <TileLayer
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> · CartoDB'
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
                ]}
            />

            <SmoothFollowCamera
                enabled={followMode}
                driverPos={displayPos}
                driverZoom={driverZoom}
            />
            <RecenterOnTrigger trigger={recenterTrigger} pos={displayPos} zoom={driverZoom} />

            {/* Rutas alternativas — debajo de la activa */}
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

            {/* Ruta activa: sombra + línea */}
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

            {/* Línea recta fallback si no hay ruta OSRM */}
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

            {/* Origen — solo si NO hay GPS live */}
            {origen && !currentPos && <Marker position={origen} icon={iconOrigen} />}

            {/* Destino */}
            {destino && <Marker position={destino} icon={iconDestino} />}

            {/* Conductor: posición ANIMADA con heading SUAVE */}
            {displayPos && (
                <Marker
                    position={displayPos}
                    icon={createConductorIcon(animatedHeading)}
                />
            )}
        </MapContainer>
    );
}
