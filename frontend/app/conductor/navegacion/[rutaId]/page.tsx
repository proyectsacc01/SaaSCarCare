"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import type { OSRMRoute } from "@/componentes/NavegacionMapa";

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
}

export default function NavegacionPage() {
    const params = useParams();
    const router = useRouter();
    const rutaId = (params?.rutaId as string) || '';

    const [ruta, setRuta] = useState<Ruta | null>(null);
    const [livePos, setLivePos] = useState<[number, number] | null>(null);
    const [routes, setRoutes] = useState<OSRMRoute[]>([]);
    const [activeIdx, setActiveIdx] = useState(0);
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
        (async () => {
            try {
                const res = await fetch(`${API_URL}/api/rutas/${rutaId}`, { headers: getAuthHeaders() });
                if (!res.ok) {
                    toast.error("No se pudo cargar la ruta");
                    router.push("/conductor");
                    return;
                }
                const data: Ruta = await res.json();
                setRuta(data);
            } catch {
                toast.error("Error de conexión");
                router.push("/conductor");
            }
        })();
    }, [rutaId, router]);

    // GPS continuo del dispositivo
    useEffect(() => {
        if (typeof navigator === 'undefined' || !navigator.geolocation) return;
        const id = navigator.geolocation.watchPosition(
            (pos) => setLivePos([pos.coords.latitude, pos.coords.longitude]),
            () => { /* silencioso — el mapa centra en origen mientras tanto */ },
            { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 }
        );
        watchRef.current = id;
        return () => {
            if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
        };
    }, []);

    // Calcular rutas (principal + alternativas) cada vez que la posición del
    // conductor cambia significativamente. OSRM público es gratis y soporta
    // alternatives=true.
    const lastFetchRef = useRef<[number, number] | null>(null);
    useEffect(() => {
        if (!ruta?.latitudDestino || !ruta?.longitudDestino) return;
        const from: [number, number] = livePos
            ?? (ruta.latitudOrigen && ruta.longitudOrigen
                ? [ruta.latitudOrigen, ruta.longitudOrigen]
                : null) as any;
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
                const url = `https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?alternatives=true&overview=full&geometries=geojson&steps=false`;
                const res = await fetch(url);
                if (!res.ok) throw new Error("OSRM error");
                const data = await res.json();
                if (data.code !== "Ok" || !data.routes?.length) {
                    setRoutes([]);
                    return;
                }
                const parsed: OSRMRoute[] = data.routes.map((r: any) => ({
                    distance: r.distance,
                    duration: r.duration,
                    geometry: (r.geometry?.coordinates ?? []).map(
                        (c: [number, number]) => [c[1], c[0]] as [number, number]
                    ),
                    legs: r.legs,
                    summary: r.legs?.[0]?.summary,
                }));
                setRoutes(parsed);
                setActiveIdx(0);
            } catch {
                // Si OSRM falla, dejamos el mapa con marcadores y polilínea recta.
                setRoutes([]);
            } finally {
                setLoadingRoutes(false);
            }
        })();
    }, [livePos, ruta?.latitudDestino, ruta?.longitudDestino, ruta?.latitudOrigen, ruta?.longitudOrigen, routes.length]);

    const activeRoute = routes[activeIdx];
    const distanciaKm = activeRoute ? activeRoute.distance / 1000 : 0;
    const minutos = activeRoute ? Math.round(activeRoute.duration / 60) : 0;
    const eta = useMemo(() => {
        if (!activeRoute) return null;
        const d = new Date(Date.now() + activeRoute.duration * 1000);
        return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    }, [activeRoute]);

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
        const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(target)}&travelmode=driving`;
        const bridge = (window as any).AndroidTracker;
        if (bridge && typeof bridge.openExternalUrl === 'function') {
            bridge.openExternalUrl(url);
        } else {
            window.open(url, '_blank', 'noopener,noreferrer');
        }
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
                    background: livePos ? 'rgba(59,246,59,0.1)' : 'rgba(107,114,128,0.1)',
                    border: `1px solid ${livePos ? 'rgba(59,246,59,0.25)' : 'rgba(107,114,128,0.2)'}`,
                    flexShrink: 0,
                }}>
                    <span style={{
                        width: '6px', height: '6px', borderRadius: '50%',
                        background: livePos ? '#3bf63b' : '#6b7280',
                        boxShadow: livePos ? '0 0 6px #3bf63b' : 'none',
                    }} />
                    <span style={{ fontSize: '0.6rem', fontWeight: '700', color: livePos ? '#3bf63b' : '#6b7280' }}>
                        GPS
                    </span>
                </div>
            </header>

            {/* MAPA */}
            <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
                <NavegacionMapa
                    origen={origen}
                    destino={destino}
                    livePos={livePos}
                    routes={routes}
                    activeIdx={activeIdx}
                    onSelectRoute={setActiveIdx}
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
                    <div style={{ textAlign: 'center', padding: '0.6rem', color: '#6b7280', fontSize: '0.75rem' }}>
                        {loadingRoutes ? 'Calculando…' : 'Sin ruta calculable. Verificá tu conexión a internet.'}
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

                {/* Botón abrir Google Maps */}
                <button
                    onClick={abrirEnGoogleMaps}
                    style={{
                        width: '100%', padding: '0.85rem',
                        background: 'linear-gradient(135deg, #3bf63b, #22c55e)',
                        border: 'none', borderRadius: '14px',
                        color: '#000', fontWeight: '900', fontSize: '0.85rem',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                        boxShadow: '0 8px 24px -10px rgba(59,246,59,0.5)',
                    }}
                >
                    <span style={{ fontSize: '1rem' }}>🧭</span>
                    Abrir navegación turn-by-turn
                </button>
            </div>
        </main>
    );
}
