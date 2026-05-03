"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import type { OSRMRoute, OSRMStep } from "@/componentes/NavegacionMapa";

const NavegacionMapa = dynamic(() => import("@/componentes/NavegacionMapa"), {
    ssr: false,
    loading: () => (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3bf63b', fontSize: '0.85rem' }}>
            Cargando mapa…
        </div>
    ),
});

const API_URL = typeof window !== 'undefined' && window.location.hostname === '10.0.2.2'
    ? ''
    : (process.env.NEXT_PUBLIC_API_URL || "https://saascarcare-production.up.railway.app");

interface Ruta {
    id: string;
    origen: string;
    destino: string;
    estado: string;
    distanciaEstimadaKm?: number;
    latitudOrigen?: number;
    longitudOrigen?: number;
    latitudDestino?: number;
    longitudDestino?: number;
    latitudActual?: number;
    longitudActual?: number;
}

function normalizeRouteState(estado?: string) {
    const limpio = (estado ?? '').trim().toUpperCase().replace(/\s+/g, '_');
    switch (limpio) {
        case 'ENCURSO':
        case 'EN_CURSO':
            return 'EN_CURSO';
        case 'DETENIDA':
        case 'DETENIDO':
        case 'PAUSADA':
        case 'PAUSADO':
        case 'STOPPED':
            return 'DETENIDO';
        case 'COMPLETADO':
        case 'COMPLETADA':
            return 'COMPLETADA';
        case 'PLANEADA':
        case 'PLANIFICADA':
            return 'PLANIFICADA';
        default:
            return limpio || 'PLANIFICADA';
    }
}

interface OSRMManeuverResponse {
    type?: string;
    modifier?: string;
    location?: [number, number];
}

interface OSRMStepResponse {
    distance?: number;
    duration?: number;
    name?: string;
    maneuver?: OSRMManeuverResponse;
}

interface OSRMLegResponse {
    summary?: string;
    steps?: OSRMStepResponse[];
}

interface OSRMRouteResponse {
    distance: number;
    duration: number;
    geometry?: {
        coordinates?: [number, number][];
    };
    legs?: OSRMLegResponse[];
}

interface OSRMResponse {
    code?: string;
    routes?: OSRMRouteResponse[];
}

type AndroidTrackerBridge = {
    openExternalUrl?: (url: string) => void;
};

function getAndroidTracker(): AndroidTrackerBridge | null {
    if (typeof window === 'undefined') return null;
    return (window as Window & { AndroidTracker?: AndroidTrackerBridge }).AndroidTracker ?? null;
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

function formatDistanceLabel(meters: number) {
    if (!Number.isFinite(meters) || meters <= 0) return "Ahora";
    if (meters < 1000) return `${Math.round(meters)} m`;
    return `${(meters / 1000).toFixed(1)} km`;
}

function buildStepInstruction(step: OSRMStepResponse): string {
    const maneuver = step?.maneuver ?? {};
    const name = step?.name?.trim();
    const modifier = maneuver.modifier as string | undefined;
    const roadText = name ? ` por ${name}` : "";

    if (maneuver.type === "arrive") return "Llegaste a destino";
    if (maneuver.type === "depart") return name ? `Salí por ${name}` : "Iniciá la marcha";
    if (maneuver.type === "continue") return name ? `Segu\u00ed por ${name}` : "Segu\u00ed recto";
    if (maneuver.type === "merge") return name ? `Incorporate a ${name}` : "Incorporate a la vía";
    if (maneuver.type === "roundabout") return name ? `Entrá a la rotonda y seguí por ${name}` : "Entrá a la rotonda";
    if (maneuver.type === "on ramp") return name ? `Tomá el acceso hacia ${name}` : "Tomá el acceso";
    if (maneuver.type === "off ramp") return name ? `Tomá la salida hacia ${name}` : "Tomá la salida";

    if (modifier === "left") return `Gir\u00e1 a la izquierda${roadText}`;
    if (modifier === "right") return `Gir\u00e1 a la derecha${roadText}`;
    if (modifier === "slight left") return `Mantenete a la izquierda${roadText}`;
    if (modifier === "slight right") return `Mantenete a la derecha${roadText}`;
    if (modifier === "sharp left") return `Dobla fuerte a la izquierda${roadText}`;
    if (modifier === "sharp right") return `Dobla fuerte a la derecha${roadText}`;
    if (modifier === "uturn") return "Hacé un cambio de sentido";

    return name ? `Segu\u00ed por ${name}` : "Segu\u00ed la ruta";
}

function parseRouteSteps(legs: OSRMLegResponse[]): OSRMStep[] {
    return (legs ?? []).flatMap((leg) =>
        (leg.steps ?? []).map((step) => ({
            distance: step.distance ?? 0,
            duration: step.duration ?? 0,
            name: step.name ?? "",
            instruction: buildStepInstruction(step),
            maneuver: {
                type: step.maneuver?.type,
                modifier: step.maneuver?.modifier,
                location: step.maneuver?.location
                    ? [step.maneuver.location[1], step.maneuver.location[0]]
                    : [0, 0],
            },
        }))
    );
}

export default function NavegacionPage() {
    const params = useParams();
    const router = useRouter();
    const rutaId = (params?.rutaId as string) || '';

    const [ruta, setRuta] = useState<Ruta | null>(null);
    const [livePos, setLivePos] = useState<[number, number] | null>(null);
    const [liveHeading, setLiveHeading] = useState<number | null>(null);
    const [routes, setRoutes] = useState<OSRMRoute[]>([]);
    const [activeIdx, setActiveIdx] = useState(0);
    const [currentStepIdx, setCurrentStepIdx] = useState(0);
    const [followMode, setFollowMode] = useState(true);
    const [loadingRoutes, setLoadingRoutes] = useState(false);
    const watchRef = useRef<number | null>(null);

    const getAuthHeaders = (): Record<string, string> => {
        const token = typeof window !== 'undefined' ? localStorage.getItem("token") : null;
        return {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        };
    };

    // Cargar la ruta asignada
    useEffect(() => {
        if (!rutaId) return;
        let cancelled = false;
        const cargarRuta = async (silent = false) => {
            try {
                const res = await fetch(`${API_URL}/api/rutas/${rutaId}`, { headers: getAuthHeaders() });
                if (!res.ok) {
                    if (!silent) {
                        toast.error("No se pudo cargar la ruta");
                        router.push("/conductor");
                    }
                    return;
                }
                const data: Ruta = await res.json();
                data.estado = normalizeRouteState(data.estado);
                if (!cancelled) setRuta(data);
            } catch {
                if (!silent) {
                    toast.error("Error de conexión");
                    router.push("/conductor");
                }
            }
        };

        cargarRuta();
        const interval = window.setInterval(() => {
            void cargarRuta(true);
        }, 8000);

        return () => {
            cancelled = true;
            window.clearInterval(interval);
        };
    }, [rutaId, router]);

    // GPS continuo del dispositivo
    useEffect(() => {
        if (typeof navigator === 'undefined' || !navigator.geolocation) return;
        const id = navigator.geolocation.watchPosition(
            async (pos) => {
                setLivePos([pos.coords.latitude, pos.coords.longitude]);
                setLiveHeading(pos.coords.heading != null && pos.coords.heading >= 0 ? pos.coords.heading : null);
                try {
                    await fetch(`${API_URL}/api/rutas/${rutaId}/gps`, {
                        method: 'POST',
                        headers: getAuthHeaders(),
                        body: JSON.stringify({
                            latitud: pos.coords.latitude,
                            longitud: pos.coords.longitude,
                            precision: pos.coords.accuracy,
                            velocidadKmh: pos.coords.speed != null && pos.coords.speed >= 0 ? pos.coords.speed * 3.6 : undefined,
                        }),
                    });
                } catch {
                    /* noop */
                }
            },
            () => { /* silencioso — el mapa centra en origen mientras tanto */ },
            { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 }
        );
        watchRef.current = id;
        return () => {
            if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
        };
    }, [rutaId]);

    // Calcular rutas (principal + alternativas) cada vez que la posición del
    // conductor cambia significativamente. OSRM público es gratis y soporta
    // alternatives=true.
    const lastFetchRef = useRef<[number, number] | null>(null);
    useEffect(() => {
        if (!ruta?.latitudDestino || !ruta?.longitudDestino) return;
        const from = livePos
            ?? (ruta.latitudActual && ruta.longitudActual
                ? [ruta.latitudActual, ruta.longitudActual] as [number, number]
                : null)
            ?? (ruta.latitudOrigen && ruta.longitudOrigen
                ? [ruta.latitudOrigen, ruta.longitudOrigen] as [number, number]
                : null);
        if (!from) return;

        // Throttle: solo refetcheamos si nos movimos >300m respecto a la última.
        if (lastFetchRef.current) {
            const [pLat, pLng] = lastFetchRef.current;
            const dLat = (from[0] - pLat) * 111320;
            const dLng = (from[1] - pLng) * 111320 * Math.cos((from[0] * Math.PI) / 180);
            const distM = Math.sqrt(dLat * dLat + dLng * dLng);
            if (distM < 300 && routes.length > 0) return;
        }
        lastFetchRef.current = from;

        const to: [number, number] = [ruta.latitudDestino, ruta.longitudDestino];

        setLoadingRoutes(true);
        (async () => {
            try {
                const url = `https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?alternatives=true&overview=full&geometries=geojson&steps=true`;
                const res = await fetch(url);
                if (!res.ok) throw new Error("OSRM error");
                const data: OSRMResponse = await res.json();
                if (data.code !== "Ok" || !data.routes?.length) {
                    setRoutes([]);
                    return;
                }
                const parsed: OSRMRoute[] = data.routes.map((r) => ({
                    distance: r.distance,
                    duration: r.duration,
                    geometry: (r.geometry?.coordinates ?? []).map(
                        (c: [number, number]) => [c[1], c[0]] as [number, number]
                    ),
                    legs: r.legs,
                    summary: r.legs?.[0]?.summary,
                    steps: parseRouteSteps(r.legs ?? []),
                }));
                setRoutes(parsed);
                setActiveIdx(0);
                setCurrentStepIdx(0);
            } catch {
                // Si OSRM falla, dejamos el mapa con marcadores y polilínea recta.
                setRoutes([]);
            } finally {
                setLoadingRoutes(false);
            }
        })();
    }, [livePos, ruta?.latitudActual, ruta?.longitudActual, ruta?.latitudDestino, ruta?.longitudDestino, ruta?.latitudOrigen, ruta?.longitudOrigen, routes.length]);

    const activeRoute = routes[activeIdx];
    const currentPos: [number, number] | null = livePos
        ?? (ruta?.latitudActual && ruta?.longitudActual ? [ruta.latitudActual, ruta.longitudActual] : null);
    const currentLat = currentPos?.[0];
    const currentLng = currentPos?.[1];
    const distanciaKm = activeRoute ? activeRoute.distance / 1000 : 0;
    const minutos = activeRoute ? Math.round(activeRoute.duration / 60) : 0;
    const eta = useMemo(() => {
        if (!activeRoute) return null;
        const d = new Date(Date.now() + activeRoute.duration * 1000);
        return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    }, [activeRoute]);
    const currentStep = activeRoute?.steps?.[currentStepIdx] ?? null;
    const nextSteps = activeRoute?.steps?.slice(currentStepIdx + 1, currentStepIdx + 4) ?? [];
    const distanceToStep = currentPos && currentStep ? distanceMeters(currentPos, currentStep.maneuver.location) : (currentStep?.distance ?? 0);

    useEffect(() => {
        setCurrentStepIdx(0);
    }, [activeIdx, activeRoute?.steps?.length]);

    useEffect(() => {
        if (!currentPos || !activeRoute?.steps?.length) return;
        setCurrentStepIdx((prev) => {
            let next = prev;
            while (next < activeRoute.steps.length - 1) {
                const step = activeRoute.steps[next];
                const dist = distanceMeters(currentPos, step.maneuver.location);
                if (dist > 40) break;
                next += 1;
            }
            return next;
        });
    }, [currentLat, currentLng, currentPos, activeRoute?.steps]);

    const fmtDuration = (mins: number) => {
        if (mins < 60) return `${mins} min`;
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return m === 0 ? `${h}h` : `${h}h ${m}min`;
    };

    const abrirEnGoogleMaps = () => {
        if (!ruta?.latitudDestino || !ruta?.longitudDestino) {
            toast.error("Destino sin coordenadas");
            return;
        }
        const target = `${ruta.latitudDestino},${ruta.longitudDestino}`;
        const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(target)}&travelmode=driving&dir_action=navigate`;
        const bridge = getAndroidTracker();
        if (bridge && typeof bridge.openExternalUrl === 'function') {
            bridge.openExternalUrl(url);
        } else {
            window.open(url, '_blank', 'noopener,noreferrer');
        }
    };

    const iniciarNavegacionNativa = () => {
        if (!ruta?.latitudDestino || !ruta?.longitudDestino) {
            toast.error("Destino sin coordenadas");
            return;
        }
        const target = `${ruta.latitudDestino},${ruta.longitudDestino}`;
        const bridge = getAndroidTracker();
        if (bridge && typeof bridge.openExternalUrl === 'function') {
            // En Android abre Google Maps directo en modo navegación guiada
            bridge.openExternalUrl(`google.navigation:q=${encodeURIComponent(target)}&mode=d`);
            return;
        }
        // Fallback web
        abrirEnGoogleMaps();
    };

    if (!ruta) {
        return (
            <div style={{ height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', background: '#050608' }}>
                Cargando ruta…
            </div>
        );
    }

    const origen: [number, number] | null = ruta.latitudOrigen && ruta.longitudOrigen
        ? [ruta.latitudOrigen, ruta.longitudOrigen]
        : null;
    const destino: [number, number] | null = ruta.latitudDestino && ruta.longitudDestino
        ? [ruta.latitudDestino, ruta.longitudDestino]
        : null;

    return (
        <main style={{
            height: '100dvh', width: '100%',
            display: 'flex', flexDirection: 'column',
            background: '#050608', overflow: 'hidden',
        }}>
            {/* HEADER */}
            <header style={{
                padding: '0.85rem 1rem',
                display: 'flex', alignItems: 'center', gap: '0.75rem',
                background: 'rgba(5,6,11,0.98)', backdropFilter: 'blur(24px)',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                flexShrink: 0, zIndex: 10,
            }}>
                <button
                    onClick={() => router.push("/conductor")}
                    aria-label="Volver"
                    style={{
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: '50%',
                        width: '38px', height: '38px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', cursor: 'pointer', fontSize: '1.1rem', flexShrink: 0,
                    }}
                >←</button>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.55rem', color: '#3bf63b', fontWeight: '800', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
                        Navegación
                    </div>
                    <div style={{ fontSize: '0.95rem', fontWeight: '700', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ruta.destino}
                    </div>
                </div>
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '5px',
                    padding: '0.3rem 0.7rem', borderRadius: '99px',
                    background: currentPos ? 'rgba(59,246,59,0.1)' : 'rgba(107,114,128,0.1)',
                    border: `1px solid ${currentPos ? 'rgba(59,246,59,0.25)' : 'rgba(107,114,128,0.2)'}`,
                    flexShrink: 0,
                }}>
                    <span style={{
                        width: '6px', height: '6px', borderRadius: '50%',
                        background: currentPos ? '#3bf63b' : '#6b7280',
                        boxShadow: currentPos ? '0 0 6px #3bf63b' : 'none',
                    }} />
                    <span style={{ fontSize: '0.6rem', fontWeight: '700', color: currentPos ? '#3bf63b' : '#6b7280' }}>
                        GPS
                    </span>
                </div>
                <button
                    onClick={() => setFollowMode((v) => !v)}
                    style={{
                        background: followMode ? 'rgba(59,246,59,0.12)' : 'rgba(255,255,255,0.05)',
                        border: `1px solid ${followMode ? 'rgba(59,246,59,0.28)' : 'rgba(255,255,255,0.08)'}`,
                        color: followMode ? '#3bf63b' : '#9ca3af',
                        borderRadius: '999px',
                        padding: '0.38rem 0.72rem',
                        fontSize: '0.62rem',
                        fontWeight: '800',
                        cursor: 'pointer',
                        flexShrink: 0,
                    }}
                >
                    {followMode ? 'SIGUIENDO' : 'VISTA LIBRE'}
                </button>
            </header>

            {/* MAPA */}
            <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
                <NavegacionMapa
                    origen={origen}
                    destino={destino}
                    currentPos={currentPos}
                    routes={routes}
                    activeIdx={activeIdx}
                    onSelectRoute={setActiveIdx}
                    followMode={followMode}
                    liveHeading={liveHeading}
                />
                {loadingRoutes && routes.length === 0 && (
                    <div style={{
                        position: 'absolute', top: '1rem', left: '50%', transform: 'translateX(-50%)',
                        background: 'rgba(5,6,11,0.92)', backdropFilter: 'blur(8px)',
                        border: '1px solid rgba(59,246,59,0.2)',
                        padding: '0.5rem 0.9rem', borderRadius: '99px',
                        fontSize: '0.7rem', color: '#3bf63b', fontWeight: '600', zIndex: 100,
                    }}>
                        Calculando rutas…
                    </div>
                )}
                {currentStep && (
                    <div style={{
                        position: 'absolute',
                        top: loadingRoutes && routes.length === 0 ? '4.2rem' : '1rem',
                        left: '1rem',
                        right: '1rem',
                        background: 'rgba(5,6,11,0.94)',
                        border: '1px solid rgba(59,246,59,0.16)',
                        borderRadius: '18px',
                        padding: '0.85rem 0.95rem',
                        backdropFilter: 'blur(16px)',
                        zIndex: 90,
                        boxShadow: '0 18px 40px -24px rgba(0,0,0,0.7)',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                            <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: '0.55rem', color: '#3bf63b', fontWeight: '900', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                                    Próxima maniobra
                                </div>
                                <div style={{ fontSize: '0.88rem', fontWeight: '800', color: '#fff', lineHeight: 1.35 }}>
                                    {currentStep.instruction}
                                </div>
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                <div style={{ fontSize: '0.95rem', fontWeight: '900', color: '#3bf63b' }}>{formatDistanceLabel(distanceToStep)}</div>
                                <div style={{ fontSize: '0.55rem', color: '#6b7280', marginTop: '0.12rem' }}>para maniobrar</div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* PANEL INFERIOR */}
            <div style={{
                background: 'rgba(5,6,11,0.99)', backdropFilter: 'blur(24px)',
                borderTop: '1px solid rgba(255,255,255,0.07)',
                padding: '0.9rem 1rem calc(1rem + env(safe-area-inset-bottom, 0px))',
                flexShrink: 0, zIndex: 10,
                display: 'flex', flexDirection: 'column', gap: '0.75rem',
            }}>
                {/* Stats */}
                {activeRoute ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', padding: '0.6rem', textAlign: 'center' }}>
                            <div style={{ fontSize: '0.95rem', fontWeight: '900', color: '#3bf63b' }}>{distanciaKm.toFixed(1)}</div>
                            <div style={{ fontSize: '0.5rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '2px' }}>km</div>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', padding: '0.6rem', textAlign: 'center' }}>
                            <div style={{ fontSize: '0.95rem', fontWeight: '900', color: '#60a5fa' }}>{fmtDuration(minutos)}</div>
                            <div style={{ fontSize: '0.5rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '2px' }}>tiempo</div>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', padding: '0.6rem', textAlign: 'center' }}>
                            <div style={{ fontSize: '0.95rem', fontWeight: '900', color: '#a78bfa' }}>{eta || '—'}</div>
                            <div style={{ fontSize: '0.5rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '2px' }}>ETA</div>
                        </div>
                    </div>
                ) : (
                    <div style={{ textAlign: 'center', padding: '0.6rem', color: '#9ca3af', fontSize: '0.75rem', background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.25)', borderRadius: '12px' }}>
                        {loadingRoutes ? 'Calculando…' : 'Turn-by-turn interno no disponible ahora. Usá navegación nativa para guía real.'}
                    </div>
                )}

                <button
                    onClick={iniciarNavegacionNativa}
                    style={{
                        width: '100%', padding: '0.9rem',
                        background: 'linear-gradient(135deg, #3bf63b, #22c55e)',
                        border: 'none', borderRadius: '14px',
                        color: '#041107', fontWeight: '900', fontSize: '0.84rem',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                        boxShadow: '0 10px 25px -12px rgba(59,246,59,0.7)'
                    }}
                >
                    <span style={{ fontSize: '1rem' }}>🧭</span>
                    Navegación guiada (Google Maps)
                </button>

                {currentStep && (
                    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', padding: '0.85rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
                            <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: '0.55rem', color: '#6b7280', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '0.25rem' }}>
                                    Turn-by-turn
                                </div>
                                <div style={{ fontSize: '0.85rem', fontWeight: '800', color: '#fff', lineHeight: 1.35 }}>
                                    {currentStep.instruction}
                                </div>
                            </div>
                            <div style={{ flexShrink: 0, textAlign: 'right' }}>
                                <div style={{ fontSize: '0.88rem', fontWeight: '900', color: '#3bf63b' }}>{formatDistanceLabel(distanceToStep)}</div>
                                <div style={{ fontSize: '0.55rem', color: '#6b7280', marginTop: '0.15rem' }}>siguiente paso</div>
                            </div>
                        </div>
                        {nextSteps.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', marginTop: '0.8rem' }}>
                                {nextSteps.map((step, idx) => (
                                    <div key={`${step.instruction}-${idx}`} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', paddingTop: idx === 0 ? '0.7rem' : 0, borderTop: idx === 0 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                                        <span style={{ fontSize: '0.72rem', color: '#9ca3af', lineHeight: 1.35 }}>{step.instruction}</span>
                                        <span style={{ fontSize: '0.68rem', color: '#6b7280', flexShrink: 0 }}>{formatDistanceLabel(step.distance)}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Selector de rutas alternativas */}
                {routes.length > 1 && (
                    <div style={{ display: 'flex', gap: '0.4rem', overflowX: 'auto', paddingBottom: '0.2rem' }}>
                        {routes.map((r, i) => {
                            const km = (r.distance / 1000).toFixed(1);
                            const min = Math.round(r.duration / 60);
                            const isActive = i === activeIdx;
                            return (
                                <button
                                    key={i}
                                    onClick={() => setActiveIdx(i)}
                                    style={{
                                        flexShrink: 0,
                                        padding: '0.5rem 0.85rem',
                                        background: isActive ? 'rgba(59,246,59,0.12)' : 'rgba(255,255,255,0.03)',
                                        border: `1px solid ${isActive ? 'rgba(59,246,59,0.4)' : 'rgba(255,255,255,0.06)'}`,
                                        borderRadius: '12px', cursor: 'pointer',
                                        textAlign: 'left', minWidth: '110px',
                                        color: isActive ? '#3bf63b' : '#9ca3af',
                                        transition: 'all 0.15s',
                                    }}
                                >
                                    <div style={{ fontSize: '0.55rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>
                                        {i === 0 ? 'Más rápida' : `Alternativa ${i}`}
                                    </div>
                                    <div style={{ fontSize: '0.8rem', fontWeight: '800' }}>
                                        {fmtDuration(min)} · {km} km
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* Botón respaldo externo */}
                <button
                    onClick={abrirEnGoogleMaps}
                    style={{
                        width: '100%', padding: '0.85rem',
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px',
                        color: '#e5e7eb', fontWeight: '800', fontSize: '0.82rem',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                    }}
                >
                    <span style={{ fontSize: '1rem' }}>🧭</span>
                    Abrir en Google Maps
                </button>
            </div>
        </main>
    );
}
