"use client";

import { MapContainer, TileLayer, Marker, Polyline, useMap, ZoomControl } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef, useState } from "react";

function isValidPoint(point: [number, number] | null | undefined): point is [number, number] {
    return !!point && Number.isFinite(point[0]) && Number.isFinite(point[1]) && point[0] !== 0 && point[1] !== 0;
}

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

function interpolatePoint(from: [number, number], to: [number, number], progress: number): [number, number] {
    return [
        from[0] + (to[0] - from[0]) * progress,
        from[1] + (to[1] - from[1]) * progress,
    ];
}

function inferRouteBearing(position: [number, number], routeCoordinates: [number, number][]) {
    if (routeCoordinates.length < 2) return null;

    let closestIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;

    routeCoordinates.forEach((point, index) => {
        const distance = distanceMeters(position, point);
        if (distance < closestDistance) {
            closestDistance = distance;
            closestIndex = index;
        }
    });

    const nextPoint = routeCoordinates[Math.min(closestIndex + 1, routeCoordinates.length - 1)];
    const prevPoint = routeCoordinates[Math.max(closestIndex - 1, 0)];

    if (nextPoint && distanceMeters(position, nextPoint) > 1) {
        return bearingDegrees(position, nextPoint);
    }

    if (prevPoint && distanceMeters(prevPoint, position) > 1) {
        return bearingDegrees(prevPoint, position);
    }

    return null;
}

const originIcon = L.divIcon({
    html: `<div style="
        width: 18px; height: 18px; border-radius: 50%;
        background: #3bf63b;
        box-shadow: 0 0 0 4px rgba(59,246,59,0.2), 0 0 10px rgba(59,246,59,0.6);
        border: 2px solid #050608;
    "></div>`,
    className: "",
    iconSize: [18, 18],
    iconAnchor: [9, 9],
});

const destinationIcon = L.divIcon({
    html: `<div style="
        width: 24px; height: 24px;
        border-radius: 6px;
        background: linear-gradient(135deg, #ef4444, #dc2626);
        border: 2px solid #050608;
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 0 0 4px rgba(239,68,68,0.16), 0 0 14px rgba(239,68,68,0.42);
        color: white; font-size: 12px;
    ">⚑</div>`,
    className: "",
    iconSize: [24, 24],
    iconAnchor: [12, 12],
});

function createCarIcon(heading: number) {
    return L.divIcon({
        html: `<div style="position: relative; width: 26px; height: 26px;">
            <div style="
                position: absolute; inset: -12px;
                border-radius: 999px;
                background: rgba(59,246,59,0.14);
                box-shadow: 0 0 28px rgba(59,246,59,0.22);
            "></div>
            <div style="
                position: absolute; inset: 0;
                display: flex; align-items: center; justify-content: center;
                transform: rotate(${heading}deg);
                transition: transform 120ms linear;
            ">
                <div style="
                    position: relative;
                    width: 26px; height: 26px;
                    display: flex; align-items: center; justify-content: center;
                ">
                    <div style="
                        position: absolute;
                        top: -2px;
                        width: 0; height: 0;
                        border-left: 7px solid transparent;
                        border-right: 7px solid transparent;
                        border-bottom: 14px solid #3bf63b;
                        filter: drop-shadow(0 0 8px rgba(59,246,59,0.85));
                    "></div>
                    <div style="
                        position: absolute;
                        bottom: 1px;
                        width: 16px; height: 16px; border-radius: 999px;
                        background: #3bf63b;
                        border: 3px solid #050608;
                        box-shadow: 0 0 12px rgba(59,246,59,0.72);
                    "></div>
                </div>
            </div>
        </div>`,
        className: "",
        iconSize: [26, 26],
        iconAnchor: [13, 13],
    });
}

function RemoveLeafletPrefix() {
    const map = useMap();

    useEffect(() => {
        map.attributionControl?.setPrefix("");
    }, [map]);

    return null;
}

function FollowTrackingCamera({
    enabled,
    position,
    zoom,
}: {
    enabled: boolean;
    position: [number, number] | null;
    zoom: number;
}) {
    const map = useMap();
    const lat = position?.[0];
    const lng = position?.[1];

    useEffect(() => {
        if (!enabled || !position) return;
        map.setView(position, Math.max(map.getZoom(), zoom), { animate: false });
    }, [enabled, lat, lng, position, zoom, map]);

    return null;
}

function FitRouteBounds({ points, enabled }: { points: [number, number][]; enabled: boolean }) {
    const map = useMap();

    useEffect(() => {
        if (!enabled || points.length === 0) return;

        if (points.length === 1) {
            map.setView(points[0], 16, { animate: false });
            return;
        }

        const bounds = L.latLngBounds(points.map((point) => L.latLng(point[0], point[1])));
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16, animate: false });
    }, [enabled, points, map]);

    return null;
}

interface MapTrackingProps {
    origin: [number, number] | null;
    destination: [number, number] | null;
    current: [number, number] | null;
    isDeviated?: boolean;
    routeCoordinates?: [number, number][];
}

export default function MapTracking({ origin, destination, current, isDeviated, routeCoordinates = [] }: MapTrackingProps) {
    const validOrigin = isValidPoint(origin) ? origin : null;
    const validDestination = isValidPoint(destination) ? destination : null;
    const validCurrent = isValidPoint(current) ? current : null;
    const targetPosition = validCurrent ?? validOrigin ?? validDestination ?? null;

    const [animatedPosition, setAnimatedPosition] = useState<[number, number] | null>(targetPosition);
    const [animatedHeading, setAnimatedHeading] = useState(0);

    const animationFrameRef = useRef<number | null>(null);
    const lastTargetRef = useRef<[number, number] | null>(targetPosition);
    const headingRef = useRef(0);

    const routeLine = useMemo(() => {
        if (routeCoordinates.length > 1) return routeCoordinates;
        if (targetPosition && validDestination) return [targetPosition, validDestination];
        return [validOrigin, validDestination].filter(Boolean) as [number, number][];
    }, [routeCoordinates, targetPosition, validDestination, validOrigin]);

    const fitPoints = useMemo(() => {
        const points: [number, number][] = [];
        if (validOrigin) points.push(validOrigin);
        if (validDestination) points.push(validDestination);
        routeLine.forEach((point) => points.push(point));
        return points;
    }, [routeLine, validDestination, validOrigin]);

    useEffect(() => {
        if (!targetPosition) return;

        if (!animatedPosition) {
            lastTargetRef.current = targetPosition;
            const initialBearing = inferRouteBearing(targetPosition, routeLine);
            const initializeFrame = requestAnimationFrame(() => {
                setAnimatedPosition(targetPosition);
                if (typeof initialBearing === "number") {
                    setAnimatedHeading(initialBearing);
                    headingRef.current = initialBearing;
                }
            });
            return () => cancelAnimationFrame(initializeFrame);
        }

        const startPosition = animatedPosition;
        const previousTarget = lastTargetRef.current ?? startPosition;
        const movementBetweenTargets = distanceMeters(previousTarget, targetPosition);
        const desiredHeading = movementBetweenTargets > 1.2
            ? bearingDegrees(previousTarget, targetPosition)
            : (inferRouteBearing(targetPosition, routeLine) ?? headingRef.current);

        if (animationFrameRef.current !== null) {
            cancelAnimationFrame(animationFrameRef.current);
        }

        const totalDistance = distanceMeters(startPosition, targetPosition);
        const startHeading = headingRef.current;

        if (totalDistance < 0.5) {
            const nextHeading = normalizeAngle(startHeading + shortestAngleDelta(startHeading, desiredHeading) * 0.35);
            headingRef.current = nextHeading;
            lastTargetRef.current = targetPosition;
            const snapFrame = requestAnimationFrame(() => {
                setAnimatedPosition(targetPosition);
                setAnimatedHeading(nextHeading);
            });
            return () => cancelAnimationFrame(snapFrame);
        }

        const duration = Math.max(220, Math.min(1300, totalDistance * 22));
        const startedAt = performance.now();

        const animate = (now: number) => {
            const progress = Math.min(1, (now - startedAt) / duration);
            const eased = 1 - Math.pow(1 - progress, 3);
            const position = interpolatePoint(startPosition, targetPosition, eased);
            const heading = normalizeAngle(startHeading + shortestAngleDelta(startHeading, desiredHeading) * eased);

            setAnimatedPosition(position);
            setAnimatedHeading(heading);

            if (progress < 1) {
                animationFrameRef.current = requestAnimationFrame(animate);
                return;
            }

            headingRef.current = desiredHeading;
            lastTargetRef.current = targetPosition;
            animationFrameRef.current = null;
        };

        animationFrameRef.current = requestAnimationFrame(animate);

        return () => {
            if (animationFrameRef.current !== null) {
                cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
            }
        };
    }, [animatedPosition, routeLine, targetPosition]);

    useEffect(() => {
        return () => {
            if (animationFrameRef.current !== null) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, []);

    const center = animatedPosition ?? validOrigin ?? validDestination ?? [40.4168, -3.7035];

    return (
        <MapContainer
            center={center}
            zoom={validCurrent ? 18 : 14}
            zoomControl={false}
            attributionControl={false}
            style={{
                height: "100%",
                width: "100%",
                borderRadius: "12px",
                border: "2px solid rgba(255,255,255,0.1)",
                background: "#050608",
            }}
        >
            <RemoveLeafletPrefix />
            <ZoomControl position="bottomright" />

            <TileLayer
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                attribution='© <a href="https://www.openstreetmap.org/copyright">OSM</a> · CartoDB'
                maxZoom={19}
                subdomains="abcd"
            />

            <FitRouteBounds points={fitPoints} enabled={!validCurrent} />
            <FollowTrackingCamera enabled={!!validCurrent} position={animatedPosition} zoom={18} />

            {routeLine.length > 1 && (
                <>
                    <Polyline
                        positions={routeLine}
                        pathOptions={{
                            color: "#000",
                            weight: 9,
                            opacity: 0.55,
                        }}
                    />
                    <Polyline
                        positions={routeLine}
                        pathOptions={{
                            color: isDeviated ? "#ef4444" : "#3bf63b",
                            weight: 5,
                            opacity: 0.95,
                            lineCap: "round",
                            lineJoin: "round",
                        }}
                    />
                </>
            )}

            {validOrigin && !validCurrent && <Marker position={validOrigin} icon={originIcon} />}
            {validDestination && <Marker position={validDestination} icon={destinationIcon} />}
            {animatedPosition && <Marker position={animatedPosition} icon={createCarIcon(animatedHeading)} />}
        </MapContainer>
    );
}
