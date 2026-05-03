"use client";

import { useTranslation } from "@/lib/i18n";
import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { toast } from "sonner";
import BackgroundMeteors from "@/componentes/BackgroundMeteors";
import styles from "../../dashboard/page.module.css";
import dynamic from "next/dynamic";
import ChatRuta from "@/componentes/ChatRuta";
import { formatRouteStateLabel } from "@/lib/status-labels";

const MapTracking = dynamic(() => import("@/componentes/MapTracking"), {
    ssr: false,
    loading: () => <div style={{ height: "400px", background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>Cargando Mapa...</div>
});

interface Ruta {
    id: string;
    origen: string;
    destino: string;
    distanciaEstimadaKm?: number;
    distanciaRecorridaKm?: number;
    estado: string;
    vehiculoId: string;
    conductorId?: string;
    conductorNombre?: string;
    fecha?: string;
    latitudOrigen?: number;
    longitudOrigen?: number;
    latitudDestino?: number;
    longitudDestino?: number;
    latitudActual?: number;
    longitudActual?: number;
    desviado?: boolean;
    velocidadActualKmh?: number;
    distanciaRestanteKm?: number;
    ultimaActualizacionGPS?: string;
    inicioDetencion?: string;
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

// Helper: calcular tiempo desde última actualización GPS
function getGPSConnectionStatus(timestamp?: string): { label: string; color: string; isConnected: boolean; secondsAgo: number } {
    if (!timestamp) return { label: 'Sin señal', color: '#6b7280', isConnected: false, secondsAgo: Infinity };
    const diffMs = Date.now() - new Date(timestamp).getTime();
    const seconds = Math.floor(diffMs / 1000);
    if (seconds <= 15) return { label: 'Conectado', color: '#22c55e', isConnected: true, secondsAgo: seconds };
    if (seconds <= 60) return { label: `Hace ${seconds}s`, color: '#f59e0b', isConnected: true, secondsAgo: seconds };
    if (seconds <= 300) return { label: `Hace ${Math.floor(seconds / 60)} min`, color: '#f59e0b', isConnected: false, secondsAgo: seconds };
    return { label: 'Desconectado', color: '#ef4444', isConnected: false, secondsAgo: seconds };
}

// Helper: calcular ETA
function calcularETA(distanciaKm?: number, velocidadKmh?: number): string {
    if (!distanciaKm || !velocidadKmh || velocidadKmh < 1) return '--';
    const horas = distanciaKm / velocidadKmh;
    const minutos = Math.round(horas * 60);
    if (minutos < 1) return '< 1 min';
    if (minutos < 60) return `${minutos} min`;
    const h = Math.floor(minutos / 60);
    const m = minutos % 60;
    return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

// Helper: calcular progreso real
function calcularProgreso(distanciaTotal?: number, distanciaRestante?: number): number {
    if (!distanciaTotal || distanciaTotal <= 0) return 0;
    if (!distanciaRestante && distanciaRestante !== 0) return 0;
    const progreso = ((distanciaTotal - distanciaRestante) / distanciaTotal) * 100;
    return Math.max(0, Math.min(100, progreso));
}

const API_URL = typeof window !== 'undefined' && window.location.hostname === '10.0.2.2'
    ? ''
    : (process.env.NEXT_PUBLIC_API_URL || "https://saascarcare-production.up.railway.app");
const DASHBOARD_ROUTE = "/dashboard";

export default function RutaTracking() {
  const t = useTranslation();

    const router = useRouter();
    const params = useParams();
    const id = Array.isArray(params.id) ? params.id[0] : params.id;

    const [ruta, setRuta] = useState<Ruta | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null); // null = sin error, string = mensaje de error
    const [routeCoordinates, setRouteCoordinates] = useState<[number, number][]>([]);
    const [, setIsCalculatingRoute] = useState(false);

    // useRef para mantener referencias correctamente entre renders
    const isMountedRef = useRef(true);
    const abortControllerRef = useRef<AbortController | null>(null);
    const previousStateRef = useRef<string | undefined>(undefined);

    // Helper to get auth headers
    const getAuthHeaders = useCallback((): Record<string, string> => {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (typeof window === 'undefined') return headers;

        const token = localStorage.getItem("token");
        if (token) headers['Authorization'] = `Bearer ${token}`;
        return headers;
    }, []);

    const calcularRutaDinamica = useCallback(async (currentLat: number, currentLng: number, destLat: number, destLng: number) => {
        try {
            setIsCalculatingRoute(true);
            console.log('[RutaTracking] Calculando ruta dinámica desde:', { currentLat, currentLng }, 'hasta:', { destLat, destLng });

            const url = `https://router.project-osrm.org/route/v1/driving/${currentLng},${currentLat};${destLng},${destLat}?overview=full&geometries=geojson`;

            const response = await fetch(url);
            const data = await response.json();

            if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
                const coordinates = data.routes[0].geometry.coordinates.map((coord: number[]) => [coord[1], coord[0]] as [number, number]);
                console.log('[RutaTracking] Ruta calculada con', coordinates.length, 'puntos');
                setRouteCoordinates(coordinates);
            } else {
                console.warn('[RutaTracking] No se pudo calcular la ruta, usando línea directa');
                setRouteCoordinates([[currentLat, currentLng], [destLat, destLng]]);
            }
        } catch (error) {
            console.error('[RutaTracking] Error calculando ruta:', error);
            setRouteCoordinates([[currentLat, currentLng], [destLat, destLng]]);
        } finally {
            setIsCalculatingRoute(false);
        }
    }, []);

    const cargarDatos = useCallback(async () => {
        if (!isMountedRef.current) return;

        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }

        abortControllerRef.current = new AbortController();

        try {
            console.log('[RutaTracking] Cargando datos de ruta:', id);
            const res = await fetch(`${API_URL}/api/rutas/${id}`, {
                signal: abortControllerRef.current.signal,
                headers: getAuthHeaders() as any
            });

            if (!res.ok) {
                if (res.status === 404) {
                    throw new Error('NOT_FOUND');
                }
                throw new Error(`HTTP ${res.status}: ${res.statusText}`);
            }

            const data = await res.json();
            data.estado = normalizeRouteState(data.estado);

            // Si no hay datos, no es una ruta válida
            if (!data || !data.id) {
                throw new Error('NOT_FOUND');
            }

            console.log('[RutaTracking] Datos recibidos - Estado:', data.estado, '- GPS:', !!(data.latitudActual && data.longitudActual));

            // Calcular ruta según el estado
            if (data.estado === 'EN_CURSO' || data.estado === 'DETENIDO') {
                if (data.latitudActual && data.longitudActual && data.latitudDestino && data.longitudDestino) {
                    console.log('[RutaTracking] ✅ GPS REAL detectado');
                    await calcularRutaDinamica(
                        data.latitudActual,
                        data.longitudActual,
                        data.latitudDestino,
                        data.longitudDestino
                    );
                } else {
                    console.log('[RutaTracking] ⏳ Esperando GPS...');
                    setRouteCoordinates([]);
                }
            } else if (data.estado === 'PLANIFICADA' && data.latitudOrigen && data.longitudOrigen && data.latitudDestino && data.longitudDestino) {
                await calcularRutaDinamica(
                    data.latitudOrigen,
                    data.longitudOrigen,
                    data.latitudDestino,
                    data.longitudDestino
                );
            }

            if (isMountedRef.current) {
                if (previousStateRef.current && previousStateRef.current !== 'EN_CURSO' && data.estado === 'EN_CURSO') {
                    console.log('🚀 ¡RUTA INICIADA!');
                }
                previousStateRef.current = data.estado;
                setRuta(data);
                setError(null); // Limpiar cualquier error previo
                setLoading(false);
            }
        } catch (err: any) {
            if (err.name === 'AbortError') {
                // Ignorar errores de abort, son normales al cancelar requests
                return;
            }

            console.error('[RutaTracking] Error cargando ruta:', err);

            if (isMountedRef.current) {
                // Solo establecer error si es un error real (no abort)
                if (err.message === 'NOT_FOUND') {
                    setError('Ruta no encontrada');
                } else {
                    // Para otros errores, no mostrar "no encontrada" inmediatamente
                    // puede ser un error de red temporal
                    console.warn('[RutaTracking] Error temporal, reintentando...');
                }
                setLoading(false);
            }
        }
    }, [id, calcularRutaDinamica, getAuthHeaders]);

    useEffect(() => {
        isMountedRef.current = true;

        // Cargar datos inmediatamente
        cargarDatos();

        // Actualizar cada 2 segundos
        const intervalId = setInterval(() => {
            if (isMountedRef.current) {
                cargarDatos();
            }
        }, 2000);

        return () => {
            isMountedRef.current = false;
            if (intervalId) clearInterval(intervalId);
            if (abortControllerRef.current) abortControllerRef.current.abort();
        };
    }, [cargarDatos]);

    // Mostrar cargando mientras se obtienen datos por primera vez
    if (loading || (!ruta && !error)) {
        return (
            <BackgroundMeteors>
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '100vh',
                    gap: '1rem'
                }}>
                    <div style={{
                        width: '40px',
                        height: '40px',
                        border: '3px solid rgba(59, 246, 59, 0.3)',
                        borderTop: '3px solid #3bf63b',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite'
                    }}></div>
                    <span style={{ color: '#9ca3af' }}>Cargando ruta...</span>
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
            </BackgroundMeteors>
        );
    }

    // Mostrar error solo si hay un error real (404)
    if (error) {
        return (
            <BackgroundMeteors>
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '100vh',
                    gap: '1rem'
                }}>
                    <span style={{ fontSize: '3rem' }}>🔍</span>
                    <span style={{ color: '#ef4444', fontSize: '1.2rem' }}>{error}</span>
                    <button
                        onClick={() => router.push(DASHBOARD_ROUTE)}
                        style={{
                            marginTop: '1rem',
                            padding: '0.75rem 1.5rem',
                            background: 'linear-gradient(135deg, #3bf63b, #22c55e)',
                            color: '#000',
                            border: 'none',
                            borderRadius: '8px',
                            fontWeight: 'bold',
                            cursor: 'pointer'
                        }}
                    >
                        Volver al Dashboard
                    </button>
                </div>
            </BackgroundMeteors>
        );
    }

    // Si llegamos aquí, ruta existe y no hay error
    if (!ruta) return null;

    return (
        <BackgroundMeteors>
            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }

                /* ── HEADER DESKTOP ── */
                .ruta-header {
                    display: flex;
                    align-items: flex-start;
                    justify-content: space-between;
                    gap: 1.5rem;
                    border-bottom: 1px solid rgba(255,255,255,0.05);
                    padding-bottom: 1.5rem;
                }
                .ruta-header-left {
                    display: flex;
                    align-items: flex-start;
                    gap: 1rem;
                    flex: 1;
                    min-width: 0;
                }
                .ruta-title-h1 {
                    font-size: 1.7rem;
                    font-weight: 900;
                    letter-spacing: -0.02em;
                    line-height: 1.25;
                    margin: 0;
                }
                .ruta-badges-row {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    flex-wrap: wrap;
                    margin-bottom: 0.45rem;
                }
                .ruta-vehicle-pill {
                    display: flex;
                    align-items: center;
                    gap: 0.6rem;
                    background: rgba(255,255,255,0.03);
                    padding: 0.5rem 1rem;
                    border-radius: 10px;
                    border: 1px solid rgba(255,255,255,0.05);
                    white-space: nowrap;
                }
                .ruta-back-btn {
                    width: 40px;
                    height: 40px;
                    flex-shrink: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                /* ── GRID PRINCIPAL ── */
                .ruta-main-grid {
                    display: grid;
                    grid-template-columns: 1fr 350px;
                    gap: 2rem;
                    margin-top: 2rem;
                }
                .ruta-map-box {
                    height: 600px;
                    padding: 0;
                    border-radius: 24px;
                    overflow: hidden;
                    border: 1px solid rgba(255,255,255,0.1);
                    box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);
                }

                /* ── MÓVIL ── */
                @media (max-width: 768px) {
                    .ruta-header {
                        flex-direction: column;
                        gap: 0.75rem;
                        padding-bottom: 1rem;
                    }
                    /* Top bar: botón atrás + vehicle pill en la misma fila */
                    .ruta-header-topbar {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        width: 100%;
                    }
                    /* Título ocupa ancho completo */
                    .ruta-title-block {
                        width: 100%;
                    }
                    .ruta-title-h1 {
                        font-size: 1.25rem;
                        line-height: 1.3;
                    }
                    .ruta-vehicle-label { display: none; }
                    .ruta-vehicle-pill { padding: 0.35rem 0.75rem; font-size: 0.8rem; }
                    /* Ocultar el bloque vehicle de la derecha en desktop-style */
                    .ruta-vehicle-desktop { display: none; }
                    .ruta-vehicle-mobile { display: flex !important; }
                    .ruta-back-btn { width: 36px !important; height: 36px !important; font-size: 1rem; }
                    .ruta-main-grid { grid-template-columns: 1fr; gap: 1rem; }
                    .ruta-map-box { height: 280px !important; border-radius: 16px !important; }
                }
                @media (min-width: 769px) {
                    .ruta-header-topbar { display: contents; }
                    .ruta-vehicle-mobile { display: none !important; }
                    .ruta-vehicle-desktop { display: block; }
                }
            `}</style>
            <main style={{ height: "100%", width: "100%", overflowY: "auto", position: "relative", zIndex: 20 }}>
                <div className={styles.container}>
                    <header className="ruta-header">
                        {/* Top bar: botón atrás + vehicle pill (mobile los ve en fila, desktop se distribuye) */}
                        <div className="ruta-header-topbar">
                            <button
                                onClick={() => router.push(DASHBOARD_ROUTE)}
                                className={`${styles.navButton} ruta-back-btn`}
                                style={{
                                    background: 'rgba(255,255,255,0.05)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    padding: '0',
                                    borderRadius: '12px',
                                }}
                            >
                                ←
                            </button>

                            {/* Vehicle pill — visible en mobile junto al back btn */}
                            <div className="ruta-vehicle-mobile" style={{ display: 'none', alignItems: 'center', gap: '0.5rem' }}>
                                <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#3bf63b' }}></div>
                                <span style={{ fontWeight: '700', fontSize: '0.8rem', color: '#e2e8f0' }}>
                                    {ruta.conductorNombre || ruta.vehiculoId?.slice(-10)}
                                </span>
                            </div>
                        </div>

                        {/* Bloque título — ocupa ancho completo en mobile */}
                        <div className="ruta-title-block" style={{ flex: 1, minWidth: 0 }}>
                            <div className="ruta-badges-row">
                                <span className={styles.badge} style={{
                                    background: ruta.estado === 'EN_CURSO' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(156, 163, 175, 0.1)',
                                    color: ruta.estado === 'EN_CURSO' ? '#60a5fa' : '#9ca3af',
                                    fontSize: '0.65rem'
                                }}>
                                    RUTA #{ruta.id?.slice(-6).toUpperCase()}
                                </span>

                                {(ruta.estado === 'EN_CURSO' || ruta.estado === 'DETENIDO') && (
                                    <span className={styles.badge} style={{
                                        background: ruta.estado === 'DETENIDO'
                                            ? 'rgba(249, 115, 22, 0.2)'
                                            : (ruta.latitudActual && ruta.longitudActual)
                                                ? 'rgba(34, 197, 94, 0.2)'
                                                : 'rgba(251, 191, 36, 0.2)',
                                        color: ruta.estado === 'DETENIDO'
                                            ? '#f97316'
                                            : (ruta.latitudActual && ruta.longitudActual)
                                                ? '#22c55e' : '#f59e0b',
                                        fontSize: '0.6rem',
                                        fontWeight: '700'
                                    }}>
                                        {ruta.estado === 'DETENIDO'
                                            ? '⏸ DETENIDO'
                                            : (ruta.latitudActual && ruta.longitudActual)
                                                ? '📡 GPS ACTIVO'
                                                : '⏳ ESPERANDO GPS'}
                                    </span>
                                )}

                                <span style={{ color: '#4b5563', fontSize: '0.75rem' }}>{ruta.fecha?.slice(0, 10)}</span>
                                <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>
                                    {ruta.conductorNombre ? `Conductor: ${ruta.conductorNombre}` : 'Conductor sin asignar'}
                                </span>
                            </div>

                            <h1 className="ruta-title-h1">
                                <span style={{ color: '#e2e8f0' }}>{ruta.origen}</span>
                                {' '}<span style={{ color: 'var(--accent)', opacity: 0.55, fontSize: '0.8em' }}>➝</span>{' '}
                                <span style={{ color: '#e2e8f0' }}>{ruta.destino}</span>
                            </h1>
                        </div>

                        {/* Vehicle pill desktop — oculta en mobile */}
                        <div className="ruta-vehicle-desktop">
                            <div className="ruta-vehicle-label" style={{ fontSize: '0.7rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.3rem' }}>Vehículo</div>
                            <div className="ruta-vehicle-pill">
                                <div style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#3bf63b', flexShrink: 0 }}></div>
                                <span style={{ fontWeight: '700', fontSize: '0.85rem' }}>{ruta.vehiculoId?.slice(-12)}</span>
                            </div>
                            <div className="ruta-vehicle-label" style={{ fontSize: '0.7rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: '0.9rem', marginBottom: '0.3rem' }}>Conductor</div>
                            <div className="ruta-vehicle-pill">
                                <div style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#60a5fa', flexShrink: 0 }}></div>
                                <span style={{ fontWeight: '700', fontSize: '0.85rem' }}>{ruta.conductorNombre || 'Sin asignar'}</span>
                            </div>
                        </div>
                    </header>

                    <div className="ruta-main-grid">
                        {/* Map Section */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            <div className={`${styles.card} ruta-map-box`}>
                                <MapTracking
                                    origin={[ruta.latitudOrigen, ruta.longitudOrigen]}
                                    destination={[ruta.latitudDestino, ruta.longitudDestino]}
                                    current={[ruta.latitudActual, ruta.longitudActual]}
                                    isDeviated={ruta.desviado}
                                    routeCoordinates={routeCoordinates}
                                />
                            </div>

                            {/* Botón para Android */}
                            {typeof window !== 'undefined' && (window as any).AndroidTracker ? (
                                <button
                                    onClick={async () => {
                                        if (ruta?.estado === 'EN_CURSO' || ruta?.estado === 'DETENIDO') {
                                            (window as any).AndroidTracker.stopTracking();
                                            toast.success('📱 Tracking GPS detenido');
                                        } else {
                                            (window as any).AndroidTracker.startTracking(id);
                                            toast.success('📱 Tracking GPS iniciado');
                                        }
                                    }}
                                    style={{
                                        padding: '1.2rem 1.5rem',
                                        background: (ruta?.estado === 'EN_CURSO' || ruta?.estado === 'DETENIDO')
                                            ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(220, 38, 38, 0.2))'
                                            : 'linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(16, 185, 129, 0.2))',
                                        border: (ruta?.estado === 'EN_CURSO' || ruta?.estado === 'DETENIDO')
                                            ? '2px solid rgba(239, 68, 68, 0.5)'
                                            : '2px solid rgba(34, 197, 94, 0.5)',
                                        borderRadius: '16px',
                                        fontSize: '1.1rem',
                                        color: (ruta?.estado === 'EN_CURSO' || ruta?.estado === 'DETENIDO') ? '#ef4444' : '#22c55e',
                                        cursor: 'pointer',
                                        marginBottom: '1rem',
                                        width: '100%',
                                        fontWeight: '800'
                                    }}
                                >
                                    {(ruta?.estado === 'EN_CURSO' || ruta?.estado === 'DETENIDO')
                                        ? '📱 DETENER TRACKING GPS ANDROID'
                                        : '📱 INICIAR TRACKING GPS ANDROID'}
                                </button>
                            ) : null}

                            {/* Indicador GPS */}
                            {ruta?.latitudActual && ruta?.longitudActual && (
                                <div style={{
                                    padding: '1rem 1.2rem',
                                    background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.1), rgba(16, 185, 129, 0.1))',
                                    border: '1px solid rgba(34, 197, 94, 0.3)',
                                    borderRadius: '12px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.8rem',
                                    fontSize: '0.9rem',
                                    color: '#22c55e',
                                    marginBottom: '1rem'
                                }}>
                                    <div style={{
                                        width: '12px',
                                        height: '12px',
                                        borderRadius: '50%',
                                        backgroundColor: '#22c55e',
                                        animation: 'pulse 2s infinite'
                                    }}></div>
                                    <div>
                                        <div style={{ fontWeight: '700' }}>📡 GPS ACTIVO</div>
                                        <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>
                                            {ruta.latitudActual.toFixed(6)}, {ruta.longitudActual.toFixed(6)}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Timeline - Datos Reales */}
                            {(() => {
                                const progreso = calcularProgreso(ruta.distanciaEstimadaKm, ruta.distanciaRestanteKm);
                                const eta = calcularETA(ruta.distanciaRestanteKm, ruta.velocidadActualKmh);
                                return (
                                    <div className={styles.card} style={{ padding: '1.5rem', background: 'rgba(0,0,0,0.2)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                            <span style={{ fontSize: '0.8rem', color: '#6b7280', fontWeight: '600' }}>PROGRESS TRACKER</span>
                                            <span style={{ fontSize: '0.8rem', color: 'var(--accent)', fontWeight: '700' }}>
                                                {ruta.estado === 'DETENIDO' ? `${progreso.toFixed(0)}% — ${formatRouteStateLabel(ruta.estado)}`
                                                    : ruta.estado === 'EN_CURSO' && ruta.latitudActual ? `${progreso.toFixed(0)}%`
                                                    : ruta.estado === 'EN_CURSO' ? 'ESPERANDO GPS'
                                                    : 'SIN INICIAR'}
                                            </span>
                                        </div>
                                        <div style={{ height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden', position: 'relative' }}>
                                            <div style={{
                                                position: 'absolute', left: 0, top: 0, height: '100%',
                                                width: `${progreso}%`,
                                                background: progreso >= 90 ? 'linear-gradient(to right, #22c55e, #3bf63b)' : 'linear-gradient(to right, var(--accent), #3bf63b)',
                                                borderRadius: '4px',
                                                boxShadow: '0 0 15px var(--accent)',
                                                transition: 'width 1s ease-out'
                                            }}></div>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.8rem', fontSize: '0.75rem', color: '#4b5563' }}>
                                            <span>SALIDA: {ruta.origen}</span>
                                            <span>ETA: {eta}</span>
                                        </div>
                                        {ruta.distanciaEstimadaKm != null && ruta.distanciaEstimadaKm > 0 && (
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.4rem', fontSize: '0.7rem', color: '#374151' }}>
                                                <span>
                                                    {/* Preferimos los KM RECORRIDOS reales (acumulados desde GPS).
                                                        Caemos al cálculo estimado-restante solo si todavía no llegó GPS. */}
                                                    {ruta.distanciaRecorridaKm != null
                                                        ? ruta.distanciaRecorridaKm.toFixed(1)
                                                        : (ruta.distanciaEstimadaKm - (ruta.distanciaRestanteKm ?? 0)).toFixed(1)} km recorridos
                                                </span>
                                                <span>{ruta.distanciaEstimadaKm.toFixed(1)} km totales</span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}
                        </div>

                        {/* Sidebar Stats */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            <div className={styles.card} style={{ background: 'linear-gradient(145deg, rgba(30,30,40,0.95), rgba(20,20,25,0.95))' }}>
                                <h3 className={styles.cardTitle} style={{ fontSize: '1.1rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                                    Telemetría Real
                                </h3>

                                {ruta.estado === 'DETENIDO' && (
                                    <div style={{ background: 'rgba(249, 115, 22, 0.1)', color: '#f97316', padding: '1rem', borderRadius: '12px', marginBottom: '1rem', border: '1px solid rgba(249, 115, 22, 0.25)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '800', fontSize: '0.85rem' }}>
                                            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1" strokeWidth="2"/><rect x="14" y="4" width="4" height="16" rx="1" strokeWidth="2"/></svg>
                                            VEHÍCULO DETENIDO
                                        </div>
                                        <p style={{ fontSize: '0.75rem', marginTop: '0.4rem', opacity: 0.8 }}>
                                            Sin movimiento hace más de 5 minutos.
                                            {ruta.inicioDetencion && (() => {
                                                const mins = Math.floor((Date.now() - new Date(ruta.inicioDetencion).getTime()) / 60000);
                                                return mins > 0 ? ` Parado hace ${mins} min.` : '';
                                            })()}
                                        </p>
                                    </div>
                                )}

                                {ruta.desviado && (
                                    <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '1rem', borderRadius: '12px', marginBottom: '1.5rem', border: '1px solid rgba(239, 68, 68, 0.2)', animation: 'pulse 2s infinite' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '800', fontSize: '0.85rem' }}>
                                            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                            ALERTA DE DESVÍO
                                        </div>
                                        <p style={{ fontSize: '0.75rem', marginTop: '0.4rem', opacity: 0.8 }}>Trayectoria fuera de parámetros.</p>
                                    </div>
                                )}

                                {(() => {
                                    const gpsStatus = getGPSConnectionStatus(ruta.ultimaActualizacionGPS);
                                    const velocidad = ruta.velocidadActualKmh;
                                    const velocidadColor = !velocidad && velocidad !== 0 ? '#4b5563'
                                        : velocidad === 0 ? '#f59e0b'
                                        : velocidad > 120 ? '#ef4444'
                                        : velocidad > 80 ? '#f59e0b'
                                        : '#22c55e';
                                    const distRestante = ruta.distanciaRestanteKm;
                                    
                                    return (
                                        <div style={{ display: 'grid', gap: '1rem' }}>
                                            <div style={{ padding: '1rem', background: 'rgba(0,0,0,0.3)', borderRadius: '12px', border: '1px solid rgba(96, 165, 250, 0.18)' }}>
                                                <span style={{ display: 'block', fontSize: '0.65rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.4rem' }}>Conductor Asignado</span>
                                                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.3rem' }}>
                                                    <span style={{ fontSize: '1.15rem', fontWeight: '800', color: '#e2e8f0' }}>
                                                        {ruta.conductorNombre || 'Sin asignar'}
                                                    </span>
                                                </div>
                                                {ruta.conductorId && (
                                                    <div style={{ fontSize: '0.65rem', color: '#4b5563', marginTop: '0.35rem' }}>
                                                        ID: {ruta.conductorId.slice(-10)}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Velocidad Actual */}
                                            <div style={{ padding: '1rem', background: 'rgba(0,0,0,0.3)', borderRadius: '12px', border: `1px solid ${velocidadColor}20` }}>
                                                <span style={{ display: 'block', fontSize: '0.65rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.4rem' }}>Velocidad Actual</span>
                                                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.3rem' }}>
                                                    <span style={{ fontSize: '2rem', fontWeight: '800', color: velocidadColor, transition: 'color 0.5s ease' }}>
                                                        {velocidad !== undefined && velocidad !== null
                                                            ? velocidad.toFixed(0)
                                                            : '--'}
                                                    </span>
                                                    <span style={{ fontSize: '0.8rem', color: '#4b5563' }}>KM/H</span>
                                                </div>
                                                {velocidad !== undefined && velocidad !== null && (
                                                    <div style={{ marginTop: '0.5rem' }}>
                                                        <div style={{ height: '3px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden' }}>
                                                            <div style={{
                                                                height: '100%',
                                                                width: `${Math.min((velocidad / 150) * 100, 100)}%`,
                                                                background: `linear-gradient(to right, #22c55e, ${velocidadColor})`,
                                                                borderRadius: '2px',
                                                                transition: 'width 1s ease-out'
                                                            }}></div>
                                                        </div>
                                                        <div style={{ fontSize: '0.65rem', color: '#4b5563', marginTop: '0.3rem' }}>
                                                            {velocidad === 0 ? '🟡 Vehículo detenido' :
                                                             velocidad > 120 ? '🔴 Velocidad excesiva' :
                                                             velocidad > 80 ? '🟡 Velocidad alta' :
                                                             '🟢 Velocidad normal'}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Distancia Restante */}
                                            <div style={{ padding: '1rem', background: 'rgba(0,0,0,0.3)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.03)' }}>
                                                <span style={{ display: 'block', fontSize: '0.65rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.4rem' }}>Distancia Restante</span>
                                                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.3rem' }}>
                                                    <span style={{ fontSize: '2rem', fontWeight: '800', color: '#fff', transition: 'all 0.5s ease' }}>
                                                        {distRestante !== undefined && distRestante !== null
                                                            ? distRestante.toFixed(1)
                                                            : (ruta.distanciaEstimadaKm != null
                                                                ? ruta.distanciaEstimadaKm.toFixed(1)
                                                                : '--')}
                                                    </span>
                                                    <span style={{ fontSize: '0.8rem', color: '#4b5563' }}>KM</span>
                                                </div>
                                                {distRestante !== undefined && distRestante !== null && (
                                                    <div style={{ fontSize: '0.65rem', marginTop: '0.3rem', color: distRestante < 1 ? '#22c55e' : distRestante < 5 ? '#f59e0b' : '#4b5563' }}>
                                                        {distRestante < 0.5 ? '🎯 Llegando al destino' :
                                                         distRestante < 1 ? '🎯 Muy cerca del destino' :
                                                         distRestante < 5 ? '📍 Aproximándose al destino' :
                                                         `📍 ${calcularETA(distRestante, velocidad)} restantes`}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Estado del Canal - Datos Reales */}
                                            <div style={{ padding: '1rem', background: 'rgba(0,0,0,0.3)', borderRadius: '12px', border: `1px solid ${gpsStatus.color}20` }}>
                                                <span style={{ display: 'block', fontSize: '0.65rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.4rem' }}>Estado del Canal GPS</span>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <div style={{
                                                        width: '10px', height: '10px', borderRadius: '50%',
                                                        backgroundColor: gpsStatus.color,
                                                        boxShadow: gpsStatus.isConnected ? `0 0 8px ${gpsStatus.color}` : 'none',
                                                        animation: gpsStatus.isConnected ? 'pulse 1.5s infinite' : 'none'
                                                    }}></div>
                                                    <span style={{ fontSize: '0.9rem', fontWeight: '600', color: gpsStatus.color }}>
                                                        {gpsStatus.label}
                                                    </span>
                                                </div>
                                                {ruta.ultimaActualizacionGPS && (
                                                    <div style={{ fontSize: '0.6rem', color: '#4b5563', marginTop: '0.4rem' }}>
                                                        Última señal: {new Date(ruta.ultimaActualizacionGPS).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                                    </div>
                                                )}
                                            </div>

                                            {/* ETA Card */}
                                            {(ruta.estado === 'EN_CURSO' || ruta.estado === 'DETENIDO') && ruta.distanciaRestanteKm !== undefined && (
                                                <div style={{ padding: '1rem', background: 'linear-gradient(135deg, rgba(59, 246, 59, 0.05), rgba(34, 197, 94, 0.08))', borderRadius: '12px', border: '1px solid rgba(59, 246, 59, 0.15)' }}>
                                                    <span style={{ display: 'block', fontSize: '0.65rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.4rem' }}>Tiempo Estimado Llegada</span>
                                                    <span style={{ fontSize: '1.5rem', fontWeight: '800', color: '#3bf63b' }}>
                                                        {calcularETA(ruta.distanciaRestanteKm, ruta.velocidadActualKmh)}
                                                    </span>
                                                    {ruta.velocidadActualKmh !== undefined && ruta.velocidadActualKmh > 0 && (
                                                        <div style={{ fontSize: '0.6rem', color: '#4b5563', marginTop: '0.3rem' }}>
                                                            A velocidad media de {ruta.velocidadActualKmh.toFixed(0)} km/h
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}

                                <div style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                                    <button
                                        className={styles.submitButton}
                                        style={{
                                            height: '54px',
                                            fontSize: '1rem',
                                            backgroundColor: (ruta.estado === 'EN_CURSO' || ruta.estado === 'DETENIDO') ? 'rgba(239, 68, 68, 0.1)' : '#3bf63b',
                                            color: (ruta.estado === 'EN_CURSO' || ruta.estado === 'DETENIDO') ? '#ef4444' : '#000',
                                            border: (ruta.estado === 'EN_CURSO' || ruta.estado === 'DETENIDO') ? '1px solid #ef4444' : 'none',
                                            boxShadow: (ruta.estado === 'EN_CURSO' || ruta.estado === 'DETENIDO') ? 'none' : '0 10px 20px -5px rgba(59, 246, 59, 0.3)'
                                        }}
                                        onClick={async () => {
                                            const nuevoEstado = (ruta.estado === 'EN_CURSO' || ruta.estado === 'DETENIDO') ? 'PLANIFICADA' : 'EN_CURSO';

                                            if (typeof window !== 'undefined' && (window as any).AndroidTracker) {
                                                if (nuevoEstado === 'EN_CURSO') {
                                                    (window as any).AndroidTracker.startTracking(id);
                                                } else {
                                                    (window as any).AndroidTracker.stopTracking();
                                                }
                                            }

                                            await fetch(`${API_URL}/api/rutas/${id}`, {
                                                method: 'PUT',
                                                headers: getAuthHeaders() as any,
                                                body: JSON.stringify({ estado: nuevoEstado })
                                            });
                                            setRuta({ ...ruta, estado: nuevoEstado, inicioDetencion: undefined });
                                            toast.info(`Sistema ${nuevoEstado === 'EN_CURSO' ? 'Activado' : 'Desactivado'}`);
                                        }}
                                    >
                                        {(ruta.estado === 'EN_CURSO' || ruta.estado === 'DETENIDO') ? 'DETENER RASTREO' : 'ACTIVAR GPS / INICIAR'}
                                    </button>

                                    <button
                                        className={styles.navButton}
                                        style={{
                                            height: '50px',
                                            background: 'rgba(255,255,255,0.05)',
                                            border: '1px solid rgba(255,255,255,0.1)',
                                            color: '#fff',
                                            borderRadius: '12px',
                                            fontSize: '0.9rem',
                                            fontWeight: '600'
                                        }}
                                        onClick={() => toast.info("Canal de voz abierto con conductor...")}
                                    >
                                        Llamar al Conductor
                                    </button>
                                </div>
                            </div>

                            <div className={styles.card} style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.1)' }}>
                                <h4 style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '0.8rem' }}>NOTAS DE RUTA</h4>
                                <p style={{ fontSize: '0.8rem', color: '#4b5563', lineHeight: '1.6' }}>
                                    Asegúrese de que el conductor mantenga el dispositivo en un lugar con visibilidad satelital óptima para evitar errores de geolocalización.
                                </p>
                            </div>

                            <ChatRuta rutaId={id as string} rol="ADMIN" />
                        </div>
                    </div>
                </div>
            </main>
        </BackgroundMeteors>
    );
}
