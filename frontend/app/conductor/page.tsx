"use client";

import { useTranslation } from "@/lib/i18n";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import BackgroundMeteors from "@/componentes/BackgroundMeteors";
import ChatRuta from "@/componentes/ChatRuta";

interface Ruta {
    id: string;
    origen: string;
    destino: string;
    distanciaEstimadaKm: number;
    estado: string;
    vehiculoId: string;
    fecha: string;
}

interface DriverUser {
    id: string;
    nombre?: string;
    email?: string;
    rol?: string;
}

const API_URL = typeof window !== 'undefined' && window.location.hostname === '10.0.2.2'
    ? ''
    : (process.env.NEXT_PUBLIC_API_URL || "https://saas-carcare-production-54f9.up.railway.app");

export default function ConductorDashboard() {
  const t = useTranslation();

    const [rutas, setRutas] = useState<Ruta[]>([]);
    const [rutasCompletadas, setRutasCompletadas] = useState<Ruta[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'inicio' | 'historial' | 'chat' | 'perfil'>('inicio');
    const [isOnline, setIsOnline] = useState(true);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [routeStartTime, setRouteStartTime] = useState<Date | null>(null);
    const [driverUser, setDriverUser] = useState<DriverUser | null>(null);

    const router = useRouter();
    const gpsWatchIdRef = useRef<number | null>(null);
    const [gpsInterval, setGpsInterval] = useState<NodeJS.Timeout | null>(null);
    const [showRefuelForm, setShowRefuelForm] = useState(false);
    const [refuelData, setRefuelData] = useState({ vehiculoId: '', litros: '', precioPorLitro: '1.650', estacion: '', kmActual: '' });

    const getAuthHeaders = (): Record<string, string> => {
        const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
        if (typeof window === 'undefined') return headers;
        const token = localStorage.getItem("token");
        if (token) headers['Authorization'] = `Bearer ${token}`;
        return headers;
    };

    const cargarRutas = async () => {
        try {
            setError(null);
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);
            const res = await fetch(`${API_URL}/api/rutas`, {
                signal: controller.signal,
                mode: 'cors',
                headers: getAuthHeaders()
            });
            clearTimeout(timeoutId);
            if (res.ok) {
                const data = await res.json();
                setRutas(data.filter((r: Ruta) => r.estado !== 'COMPLETADA'));
                setRutasCompletadas(data.filter((r: Ruta) => r.estado === 'COMPLETADA'));
                setLoading(false);
            } else {
                if (res.status === 401 || res.status === 403) {
                    toast.error("Sesión expirada");
                    router.push("/conductor/login");
                    return;
                }
                throw new Error(`Error del servidor: ${res.status}`);
            }
        } catch (err: any) {
            const errorMsg = err.name === 'AbortError'
                ? "Tiempo de espera agotado — el servidor no responde"
                : `Error de conexión: ${err.message}`;
            setError(errorMsg);
            toast.error(errorMsg);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const userStr = localStorage.getItem("user");
        if (!userStr) {
            toast.error("Debes iniciar sesión");
            router.push("/conductor/login");
            return;
        }
        try { setDriverUser(JSON.parse(userStr)); } catch {}
        cargarRutas();
        const interval = setInterval(cargarRutas, 10000);
        return () => {
            clearInterval(interval);
            stopBrowserGPS();
        };
    }, []);

    // Timer para ruta activa
    useEffect(() => {
        const activa = rutas.find(r => r.estado === 'EN_CURSO');
        if (activa && !routeStartTime) setRouteStartTime(new Date());
        else if (!activa) { setRouteStartTime(null); setElapsedSeconds(0); }
    }, [rutas]);

    useEffect(() => {
        if (!routeStartTime) return;
        const timer = setInterval(() => {
            setElapsedSeconds(Math.floor((Date.now() - routeStartTime.getTime()) / 1000));
        }, 1000);
        return () => clearInterval(timer);
    }, [routeStartTime]);

    const formatElapsed = (s: number) => {
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`;
        return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    };

    const startBrowserGPS = (rutaId: string) => {
        if (!navigator.geolocation) { toast.error("GPS no disponible"); return; }
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                toast.success("GPS activado");
                try {
                    await fetch(`${API_URL}/api/rutas/${rutaId}/gps`, {
                        method: 'POST', headers: getAuthHeaders(),
                        body: JSON.stringify({ latitud: position.coords.latitude, longitud: position.coords.longitude })
                    });
                } catch {}
                const watchId = navigator.geolocation.watchPosition(
                    async (pos) => {
                        try {
                            await fetch(`${API_URL}/api/rutas/${rutaId}/gps`, {
                                method: 'POST', headers: getAuthHeaders(),
                                body: JSON.stringify({ latitud: pos.coords.latitude, longitud: pos.coords.longitude })
                            });
                        } catch {}
                    },
                    (err) => { if (err.code === err.PERMISSION_DENIED) toast.error("Permiso GPS denegado"); },
                    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
                );
                gpsWatchIdRef.current = watchId;
            },
            (err) => { if (err.code === err.PERMISSION_DENIED) toast.error("Permiso GPS denegado"); },
            { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 }
        );
    };

    const stopBrowserGPS = () => {
        if (gpsWatchIdRef.current !== null) {
            navigator.geolocation.clearWatch(gpsWatchIdRef.current);
            gpsWatchIdRef.current = null;
        }
        if (gpsInterval) { clearInterval(gpsInterval); setGpsInterval(null); }
    };

    const toggleRuta = async (ruta: Ruta) => {
        const nuevoEstado = ruta.estado === 'EN_CURSO' ? 'PLANIFICADA' : 'EN_CURSO';
        if (typeof window !== 'undefined' && (window as any).AndroidTracker) {
            if (nuevoEstado === 'EN_CURSO') (window as any).AndroidTracker.startTracking(ruta.id);
            else (window as any).AndroidTracker.stopTracking();
        } else {
            if (nuevoEstado === 'EN_CURSO') startBrowserGPS(ruta.id);
            else stopBrowserGPS();
        }
        try {
            await fetch(`${API_URL}/api/rutas/${ruta.id}`, {
                method: 'PUT', headers: getAuthHeaders(),
                body: JSON.stringify({ estado: nuevoEstado })
            });
            cargarRutas();
            toast.success(nuevoEstado === 'EN_CURSO' ? 'Trayecto iniciado' : 'Trayecto pausado');
        } catch { toast.error("Error al actualizar estado"); }
    };

    const registrarRepostaje = async () => {
        const litros = parseFloat(refuelData.litros);
        const precio = parseFloat(refuelData.precioPorLitro);
        if (!refuelData.vehiculoId) { toast.warning("Seleccioná el vehículo"); return; }
        if (!litros || litros <= 0) { toast.warning("Ingresá la cantidad de litros"); return; }
        if (!precio || precio <= 0) { toast.warning("Ingresá el precio por litro"); return; }
        const costeTotal = Math.round(litros * precio * 100) / 100;
        try {
            const payload: Record<string, unknown> = {
                vehiculoId: refuelData.vehiculoId,
                litros,
                precioPorLitro: precio,
                costeTotal,
                estacion: refuelData.estacion || undefined,
                kilometrajeActual: refuelData.kmActual ? parseInt(refuelData.kmActual) : undefined,
            };
            const res = await fetch(`${API_URL}/api/repostajes`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify(payload),
            });
            if (res.ok) {
                toast.success(`Repostaje registrado — €${costeTotal.toFixed(2)}`);
                setShowRefuelForm(false);
                setRefuelData({ vehiculoId: '', litros: '', precioPorLitro: '1.650', estacion: '', kmActual: '' });
            } else {
                const body = await res.text().catch(() => '');
                if (res.status === 403) toast.error("Sin permiso para este vehículo");
                else if (res.status === 404) toast.error("Vehículo no encontrado en el sistema");
                else if (res.status === 400) toast.error("Datos incompletos — revisá los campos");
                else toast.error(`Error al registrar repostaje (${res.status})`);
                console.error('Repostaje error:', res.status, body);
            }
        } catch { toast.error("Error de conexión — revisá tu internet"); }
    };

    const completarRuta = async (ruta: Ruta) => {
        stopBrowserGPS();
        if (typeof window !== 'undefined' && (window as any).AndroidTracker) (window as any).AndroidTracker.stopTracking();
        try {
            await fetch(`${API_URL}/api/rutas/${ruta.id}`, {
                method: 'PUT', headers: getAuthHeaders(),
                body: JSON.stringify({ estado: 'COMPLETADA' })
            });
            cargarRutas();
            toast.success("Trayecto completado");
        } catch { toast.error("Error al completar ruta"); }
    };

    const getInitials = (name?: string) => {
        if (!name) return 'DR';
        return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    };

    const rutaActiva = rutas.find(r => r.estado === 'EN_CURSO');
    const rutasPendientes = rutas.filter(r => r.estado === 'PLANIFICADA');
    const kmTotalesHoy = rutasCompletadas.reduce((acc, r) => acc + (r.distanciaEstimadaKm || 0), 0);

    if (loading && !error) return (
        <BackgroundMeteors>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: '1rem' }}>
                <div style={{ width: '44px', height: '44px', border: '3px solid rgba(59,246,59,0.1)', borderTop: '3px solid #3bf63b', borderRadius: '50%', animation: 'spin 0.9s linear infinite' }} />
                <p style={{ color: '#6b7280', fontSize: '0.85rem', margin: 0 }}>Conectando con EcoFleet...</p>
            </div>
        </BackgroundMeteors>
    );

    if (error) return (
        <BackgroundMeteors>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '2rem', textAlign: 'center', gap: '1rem' }}>
                <div style={{ fontSize: '2.5rem' }}>📡</div>
                <h2 style={{ fontSize: '1.1rem', color: '#ef4444', margin: 0 }}>Sin conexión</h2>
                <p style={{ color: '#6b7280', fontSize: '0.85rem', margin: 0 }}>{error}</p>
                <button
                    onClick={() => { setLoading(true); setError(null); cargarRutas(); }}
                    style={{ padding: '0.875rem 2rem', background: 'linear-gradient(135deg, #3bf63b, #22c55e)', color: '#000', border: 'none', borderRadius: '12px', fontWeight: '800', fontSize: '0.9rem', cursor: 'pointer', marginTop: '0.5rem' }}
                >
                    Reintentar
                </button>
            </div>
        </BackgroundMeteors>
    );

    return (
        <BackgroundMeteors>
            <main style={{ minHeight: '100vh', width: '100%', display: 'flex', flexDirection: 'column', position: 'relative', paddingBottom: '72px' }}>

                {/* STATUS BAR */}
                <div style={{ background: 'rgba(5,5,10,0.9)', padding: '0.35rem 1.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.6rem', color: '#6b7280', backdropFilter: 'blur(8px)' }}>
                    <span style={{ fontFamily: 'monospace' }}>
                        {new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span style={{ color: isOnline ? '#3bf63b' : '#6b7280', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
                        {isOnline ? 'EN LÍNEA' : 'INACTIVO'}
                    </span>
                </div>

                {/* HEADER */}
                <header style={{
                    padding: '0.9rem 1.2rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'rgba(8,8,14,0.85)',
                    backdropFilter: 'blur(24px)',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    position: 'sticky',
                    top: 0,
                    zIndex: 20
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ width: '38px', height: '38px', borderRadius: '11px', background: 'linear-gradient(135deg, #3bf63b, #22c55e)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', color: '#000', fontSize: '0.9rem', boxShadow: '0 4px 16px rgba(59,246,59,0.35)', flexShrink: 0 }}>
                            CC
                        </div>
                        <div>
                            <h1 style={{ fontSize: '1rem', fontWeight: '800', margin: 0, lineHeight: 1.2, color: '#fff' }}>
                                Hola, {driverUser?.nombre?.split(' ')[0] || 'Conductor'}
                            </h1>
                            <p style={{ fontSize: '0.6rem', color: '#4b5563', margin: 0, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                                EcoFleet Driver
                            </p>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <button
                            onClick={() => setIsOnline(!isOnline)}
                            style={{
                                padding: '0.3rem 0.75rem',
                                borderRadius: '99px',
                                border: `1px solid ${isOnline ? 'rgba(59,246,59,0.4)' : 'rgba(107,114,128,0.3)'}`,
                                background: isOnline ? 'rgba(59,246,59,0.1)' : 'rgba(255,255,255,0.03)',
                                color: isOnline ? '#3bf63b' : '#6b7280',
                                fontSize: '0.6rem',
                                fontWeight: '800',
                                cursor: 'pointer',
                                letterSpacing: '0.5px',
                                transition: 'all 0.25s ease'
                            }}
                        >
                            {isOnline ? 'ACTIVO' : 'INACTIVO'}
                        </button>
                        <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', border: `2px solid ${isOnline ? 'rgba(59,246,59,0.5)' : 'rgba(107,114,128,0.3)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: '900', color: '#3bf63b', flexShrink: 0, transition: 'border-color 0.25s ease' }}>
                            {getInitials(driverUser?.nombre)}
                        </div>
                    </div>
                </header>

                {/* SCROLLABLE CONTENT */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1rem 1.5rem' }}>

                    {/* ─── TAB: INICIO ─── */}
                    {activeTab === 'inicio' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.4rem' }}>

                            {/* STATS STRIP */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.7rem' }}>
                                {[
                                    { label: 'Completadas', value: rutasCompletadas.length, color: '#3bf63b' },
                                    { label: 'KM hoy', value: kmTotalesHoy > 0 ? `${kmTotalesHoy.toFixed(0)}` : '0', color: '#60a5fa' },
                                    { label: 'Pendientes', value: rutasPendientes.length, color: '#f59e0b' },
                                ].map((s, i) => (
                                    <div key={i} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '14px', padding: '0.9rem 0.6rem', textAlign: 'center' }}>
                                        <div style={{ fontSize: '1.6rem', fontWeight: '900', color: s.color, lineHeight: 1 }}>{s.value}</div>
                                        <div style={{ fontSize: '0.55rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '0.3rem' }}>{s.label}</div>
                                    </div>
                                ))}
                            </div>

                            {/* RUTA ACTIVA */}
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                    <span style={{ fontSize: '0.65rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '2px', fontWeight: '700' }}>Trayecto Activo</span>
                                    {rutaActiva && (
                                        <span style={{ fontSize: '0.7rem', color: '#3bf63b', fontFamily: 'monospace', fontWeight: '800', background: 'rgba(59,246,59,0.08)', padding: '0.2rem 0.6rem', borderRadius: '99px', border: '1px solid rgba(59,246,59,0.2)' }}>
                                            ⏱ {formatElapsed(elapsedSeconds)}
                                        </span>
                                    )}
                                </div>

                                {rutaActiva ? (
                                    <div style={{
                                        background: 'linear-gradient(150deg, rgba(18,22,30,0.98) 0%, rgba(12,15,20,0.98) 100%)',
                                        border: '1px solid rgba(59,246,59,0.15)',
                                        borderLeft: '4px solid #3bf63b',
                                        borderRadius: '18px',
                                        padding: '1.2rem',
                                        boxShadow: '0 12px 40px -12px rgba(59,246,59,0.12), inset 0 1px 0 rgba(255,255,255,0.04)'
                                    }}>
                                        {/* Top badges */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.1rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(59,246,59,0.1)', padding: '0.3rem 0.75rem', borderRadius: '99px', border: '1px solid rgba(59,246,59,0.25)' }}>
                                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#3bf63b', boxShadow: '0 0 8px rgba(59,246,59,0.8)', display: 'inline-block', animation: 'gps-pulse 1.5s infinite' }} />
                                                <span style={{ fontSize: '0.58rem', color: '#3bf63b', fontWeight: '900', letterSpacing: '0.5px' }}>GPS ACTIVO</span>
                                            </div>
                                            <span style={{ fontSize: '0.58rem', color: '#374151', fontFamily: 'monospace' }}>
                                                #{rutaActiva.id?.slice(-6).toUpperCase()}
                                            </span>
                                        </div>

                                        {/* Route visual */}
                                        <div style={{ display: 'flex', gap: '0.9rem', marginBottom: '1.1rem', alignItems: 'stretch' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '4px' }}>
                                                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#3bf63b', boxShadow: '0 0 10px rgba(59,246,59,0.7)', flexShrink: 0 }} />
                                                <div style={{ width: '2px', flex: 1, background: 'linear-gradient(to bottom, #3bf63b55, #ef444455)', margin: '4px 0', minHeight: '20px' }} />
                                                <div style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#ef4444', boxShadow: '0 0 10px rgba(239,68,68,0.5)', flexShrink: 0 }} />
                                            </div>
                                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', overflow: 'hidden', gap: '12px' }}>
                                                <div>
                                                    <p style={{ fontSize: '0.6rem', color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 3px' }}>Origen</p>
                                                    <p style={{ fontSize: '1rem', fontWeight: '800', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#fff' }}>{rutaActiva.origen}</p>
                                                </div>
                                                <div>
                                                    <p style={{ fontSize: '0.6rem', color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 3px' }}>Destino</p>
                                                    <p style={{ fontSize: '1rem', fontWeight: '800', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#ef4444' }}>{rutaActiva.destino}</p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Mini stats */}
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.6rem', marginBottom: '1.1rem' }}>
                                            {[
                                                { label: 'Distancia', value: `${rutaActiva.distanciaEstimadaKm}`, unit: 'km' },
                                                { label: 'En curso', value: formatElapsed(elapsedSeconds), unit: '' },
                                                { label: 'Vehículo', value: rutaActiva.vehiculoId?.slice(-5)?.toUpperCase() || '—', unit: '' },
                                            ].map((s, i) => (
                                                <div key={i} style={{ background: 'rgba(0,0,0,0.25)', borderRadius: '10px', padding: '0.55rem', textAlign: 'center', border: '1px solid rgba(255,255,255,0.04)' }}>
                                                    <div style={{ fontSize: '0.8rem', fontWeight: '800', color: '#e5e7eb', lineHeight: 1.2 }}>
                                                        {s.value}{s.unit && <span style={{ fontSize: '0.55rem', color: '#6b7280', marginLeft: '2px' }}>{s.unit}</span>}
                                                    </div>
                                                    <div style={{ fontSize: '0.5rem', color: '#4b5563', textTransform: 'uppercase', marginTop: '3px', letterSpacing: '0.3px' }}>{s.label}</div>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Actions */}
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                            <button
                                                onClick={() => setActiveTab('chat')}
                                                style={{ padding: '0.875rem', background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.25)', borderRadius: '12px', color: '#60a5fa', fontWeight: '700', fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', transition: 'all 0.2s' }}
                                            >
                                                💬 Chat
                                            </button>
                                            <button
                                                onClick={() => completarRuta(rutaActiva)}
                                                style={{ padding: '0.875rem', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '12px', color: '#ef4444', fontWeight: '700', fontSize: '0.8rem', cursor: 'pointer', transition: 'all 0.2s' }}
                                            >
                                                ✓ Completar
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ background: 'rgba(255,255,255,0.02)', border: '2px dashed rgba(255,255,255,0.06)', borderRadius: '18px', padding: '2.5rem 2rem', textAlign: 'center' }}>
                                        <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem', filter: 'grayscale(1)', opacity: 0.35 }}>🛣️</div>
                                        <p style={{ color: '#4b5563', fontSize: '0.9rem', margin: '0 0 0.3rem', fontWeight: '600' }}>Sin trayecto activo</p>
                                        <p style={{ color: '#374151', fontSize: '0.75rem', margin: 0 }}>Iniciá un servicio desde "Próximos"</p>
                                    </div>
                                )}
                            </div>

                            {/* PRÓXIMOS SERVICIOS */}
                            {rutasPendientes.length > 0 && (
                                <div>
                                    <span style={{ fontSize: '0.65rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '2px', fontWeight: '700' }}>
                                        Próximos Servicios ({rutasPendientes.length})
                                    </span>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.75rem' }}>
                                        {rutasPendientes.map(r => (
                                            <div key={r.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '14px', padding: '1rem', transition: 'border-color 0.2s' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.8rem' }}>
                                                    <div style={{ flex: 1, overflow: 'hidden' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '0.4rem' }}>
                                                            <span style={{ fontSize: '0.58rem', color: '#f59e0b', fontWeight: '800', textTransform: 'uppercase' }}>
                                                                {r.fecha
                                                                    ? new Date(r.fecha).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                                                                    : 'Sin fecha'}
                                                            </span>
                                                            <span style={{ fontSize: '0.55rem', color: '#4b5563' }}>• {r.distanciaEstimadaKm} km</span>
                                                        </div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', overflow: 'hidden' }}>
                                                            <span style={{ fontSize: '0.85rem', fontWeight: '700', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '42%' }}>{r.origen}</span>
                                                            <span style={{ color: '#374151', fontSize: '0.8rem', flexShrink: 0 }}>→</span>
                                                            <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '42%' }}>{r.destino}</span>
                                                        </div>
                                                    </div>
                                                    {!rutaActiva && (
                                                        <button
                                                            onClick={() => toggleRuta(r)}
                                                            style={{ flexShrink: 0, padding: '0.6rem 1.1rem', background: 'linear-gradient(135deg, #3bf63b, #22c55e)', border: 'none', borderRadius: '10px', color: '#000', fontWeight: '900', fontSize: '0.72rem', cursor: 'pointer', boxShadow: '0 4px 14px rgba(59,246,59,0.3)', letterSpacing: '0.5px' }}
                                                        >
                                                            INICIAR
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* REGISTRAR REPOSTAJE */}
                            {(() => {
                                const vehiculosUnicos = [...new Set(
                                    [...rutas, ...rutasCompletadas].map(r => r.vehiculoId).filter(Boolean)
                                )];
                                const costePreview = parseFloat(refuelData.litros) > 0 && parseFloat(refuelData.precioPorLitro) > 0
                                    ? Math.round(parseFloat(refuelData.litros) * parseFloat(refuelData.precioPorLitro) * 100) / 100
                                    : 0;
                                return (
                                    <div>
                                        <button
                                            onClick={() => {
                                                const v = rutaActiva?.vehiculoId || vehiculosUnicos[0] || '';
                                                setRefuelData(d => ({ ...d, vehiculoId: v }));
                                                setShowRefuelForm(!showRefuelForm);
                                            }}
                                            style={{ width: '100%', padding: '1rem', background: showRefuelForm ? 'rgba(255,255,255,0.05)' : 'rgba(245,158,11,0.08)', border: `1px solid ${showRefuelForm ? 'rgba(255,255,255,0.12)' : 'rgba(245,158,11,0.25)'}`, borderRadius: '14px', color: showRefuelForm ? '#9ca3af' : '#f59e0b', fontWeight: '800', fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', letterSpacing: '0.5px', transition: 'all 0.2s' }}
                                        >
                                            {showRefuelForm ? '✕ Cancelar' : '⛽ Registrar Repostaje'}
                                        </button>

                                        {showRefuelForm && (
                                            <div style={{ marginTop: '0.75rem', background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '16px', padding: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                                {/* Selector de vehículo — siempre visible */}
                                                <div>
                                                    <label style={{ fontSize: '0.6rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '0.4rem' }}>Vehículo</label>
                                                    {vehiculosUnicos.length > 0 ? (
                                                        <select
                                                            value={refuelData.vehiculoId}
                                                            onChange={e => setRefuelData(d => ({ ...d, vehiculoId: e.target.value }))}
                                                            style={{ width: '100%', padding: '0.6rem', background: '#0d1117', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', color: '#fff', fontSize: '0.85rem' }}
                                                        >
                                                            <option value="">Seleccioná un vehículo</option>
                                                            {vehiculosUnicos.map(vid => (
                                                                <option key={vid} value={vid}>{vid}</option>
                                                            ))}
                                                        </select>
                                                    ) : (
                                                        <input
                                                            type="text"
                                                            placeholder="ID del vehículo (consultá al admin)"
                                                            value={refuelData.vehiculoId}
                                                            onChange={e => setRefuelData(d => ({ ...d, vehiculoId: e.target.value }))}
                                                            style={{ width: '100%', padding: '0.65rem', background: '#0d1117', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', color: '#fff', fontSize: '0.85rem', boxSizing: 'border-box' }}
                                                        />
                                                    )}
                                                </div>

                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                                                    <div>
                                                        <label style={{ fontSize: '0.6rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '0.4rem' }}>Litros</label>
                                                        <input type="number" step="0.1" min="0.1" placeholder="45.0"
                                                            value={refuelData.litros}
                                                            onChange={e => setRefuelData(d => ({ ...d, litros: e.target.value }))}
                                                            style={{ width: '100%', padding: '0.65rem', background: '#0d1117', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', color: '#fff', fontSize: '0.9rem', boxSizing: 'border-box' }} />
                                                    </div>
                                                    <div>
                                                        <label style={{ fontSize: '0.6rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '0.4rem' }}>€/Litro</label>
                                                        <input type="number" step="0.001" min="0.001" placeholder="1.650"
                                                            value={refuelData.precioPorLitro}
                                                            onChange={e => setRefuelData(d => ({ ...d, precioPorLitro: e.target.value }))}
                                                            style={{ width: '100%', padding: '0.65rem', background: '#0d1117', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', color: '#fff', fontSize: '0.9rem', boxSizing: 'border-box' }} />
                                                    </div>
                                                </div>

                                                {costePreview > 0 && (
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.75rem', background: 'rgba(245,158,11,0.1)', borderRadius: '8px', border: '1px solid rgba(245,158,11,0.25)' }}>
                                                        <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Total</span>
                                                        <span style={{ fontSize: '1rem', fontWeight: '800', color: '#f59e0b' }}>€{costePreview.toFixed(2)}</span>
                                                    </div>
                                                )}

                                                <div>
                                                    <label style={{ fontSize: '0.6rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '0.4rem' }}>Km del vehículo <span style={{ color: '#374151' }}>(opcional)</span></label>
                                                    <input type="number" min="0" placeholder="125000"
                                                        value={refuelData.kmActual}
                                                        onChange={e => setRefuelData(d => ({ ...d, kmActual: e.target.value }))}
                                                        style={{ width: '100%', padding: '0.65rem', background: '#0d1117', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', color: '#fff', fontSize: '0.9rem', boxSizing: 'border-box' }} />
                                                </div>

                                                <div>
                                                    <label style={{ fontSize: '0.6rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '0.4rem' }}>Estación <span style={{ color: '#374151' }}>(opcional)</span></label>
                                                    <input type="text" placeholder="Ej: Repsol Autovía A-3"
                                                        value={refuelData.estacion}
                                                        onChange={e => setRefuelData(d => ({ ...d, estacion: e.target.value }))}
                                                        style={{ width: '100%', padding: '0.65rem', background: '#0d1117', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', color: '#fff', fontSize: '0.9rem', boxSizing: 'border-box' }} />
                                                </div>

                                                <button
                                                    onClick={registrarRepostaje}
                                                    style={{ width: '100%', padding: '0.875rem', background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#000', border: 'none', borderRadius: '10px', fontWeight: '800', fontSize: '0.875rem', cursor: 'pointer' }}
                                                >
                                                    ✓ Confirmar Repostaje
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}

                            {/* SOS */}
                            <button
                                onClick={() => toast.error("SOS enviado al administrador — te contactaremos en breve", { duration: 6000 })}
                                style={{ width: '100%', padding: '1rem', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.18)', borderRadius: '14px', color: '#ef4444', fontWeight: '800', fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', letterSpacing: '0.8px', transition: 'all 0.2s' }}
                            >
                                🆘 EMERGENCIA SOS
                            </button>
                        </div>
                    )}

                    {/* ─── TAB: HISTORIAL ─── */}
                    {activeTab === 'historial' && (
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                <span style={{ fontSize: '0.65rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '2px', fontWeight: '700' }}>Historial de Rutas</span>
                                <span style={{ fontSize: '0.65rem', color: '#3bf63b', fontWeight: '700' }}>{rutasCompletadas.length} completadas</span>
                            </div>

                            {rutasCompletadas.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '4rem 2rem' }}>
                                    <div style={{ fontSize: '2.5rem', opacity: 0.25, marginBottom: '0.75rem' }}>📋</div>
                                    <p style={{ color: '#4b5563', fontSize: '0.9rem', margin: 0 }}>Sin rutas completadas aún</p>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    {rutasCompletadas.map(r => (
                                        <div key={r.id} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '14px', padding: '1rem', borderLeft: '3px solid rgba(59,246,59,0.4)' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                                                <span style={{ fontSize: '0.58rem', color: '#3bf63b', fontWeight: '800', background: 'rgba(59,246,59,0.1)', padding: '0.2rem 0.5rem', borderRadius: '99px' }}>✓ COMPLETADA</span>
                                                <span style={{ fontSize: '0.55rem', color: '#374151', fontFamily: 'monospace' }}>#{r.id?.slice(-6).toUpperCase()}</span>
                                            </div>
                                            <p style={{ fontSize: '0.85rem', fontWeight: '700', margin: '0 0 0.3rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {r.origen} <span style={{ color: '#4b5563' }}>→</span> {r.destino}
                                            </p>
                                            <div style={{ display: 'flex', gap: '1rem' }}>
                                                <span style={{ fontSize: '0.65rem', color: '#6b7280' }}>{r.distanciaEstimadaKm} km</span>
                                                {r.fecha && <span style={{ fontSize: '0.65rem', color: '#6b7280' }}>{new Date(r.fecha).toLocaleDateString('es-AR')}</span>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ─── TAB: CHAT ─── */}
                    {activeTab === 'chat' && (
                        <div>
                            <span style={{ fontSize: '0.65rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '2px', fontWeight: '700' }}>
                                Comunicación Directa
                            </span>
                            <div style={{ marginTop: '0.75rem' }}>
                                <ChatRuta
                                    rutaId={rutaActiva?.id || (rutasPendientes.length > 0 ? rutasPendientes[0].id : "testing_room")}
                                    rol="CONDUCTOR"
                                />
                            </div>
                        </div>
                    )}

                    {/* ─── TAB: PERFIL ─── */}
                    {activeTab === 'perfil' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                            {/* Avatar */}
                            <div style={{ textAlign: 'center', paddingTop: '0.5rem' }}>
                                <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'linear-gradient(135deg, rgba(59,246,59,0.15), rgba(34,197,94,0.08))', border: `3px solid ${isOnline ? 'rgba(59,246,59,0.5)' : 'rgba(107,114,128,0.3)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', fontWeight: '900', color: '#3bf63b', margin: '0 auto 0.75rem', transition: 'border-color 0.3s' }}>
                                    {getInitials(driverUser?.nombre)}
                                </div>
                                <h2 style={{ fontSize: '1.1rem', fontWeight: '800', margin: '0 0 0.2rem', color: '#fff' }}>
                                    {driverUser?.nombre || 'Conductor'}
                                </h2>
                                <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '0 0 0.4rem' }}>
                                    {driverUser?.email || ''}
                                </p>
                                <span style={{ fontSize: '0.6rem', color: isOnline ? '#3bf63b' : '#6b7280', fontWeight: '700', background: isOnline ? 'rgba(59,246,59,0.1)' : 'rgba(255,255,255,0.03)', padding: '0.2rem 0.7rem', borderRadius: '99px', border: `1px solid ${isOnline ? 'rgba(59,246,59,0.2)' : 'rgba(107,114,128,0.2)'}` }}>
                                    {isOnline ? '● EN LÍNEA' : '○ INACTIVO'}
                                </span>
                            </div>

                            {/* Stats */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                {[
                                    { label: 'Completadas', value: rutasCompletadas.length, color: '#3bf63b' },
                                    { label: 'KM Totales', value: `${rutasCompletadas.reduce((acc, r) => acc + r.distanciaEstimadaKm, 0).toFixed(0)}`, color: '#60a5fa' },
                                    { label: 'En progreso', value: rutas.length, color: '#f59e0b' },
                                    { label: 'Tiempo activo', value: elapsedSeconds > 0 ? formatElapsed(elapsedSeconds) : '—', color: '#a78bfa' },
                                ].map((s, i) => (
                                    <div key={i} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '14px', padding: '1rem', textAlign: 'center' }}>
                                        <div style={{ fontSize: '1.4rem', fontWeight: '900', color: s.color, lineHeight: 1.1 }}>{s.value}</div>
                                        <div style={{ fontSize: '0.58rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.3px', marginTop: '0.3rem' }}>{s.label}</div>
                                    </div>
                                ))}
                            </div>

                            {/* Acerca de */}
                            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '14px', padding: '1rem' }}>
                                <h3 style={{ fontSize: '0.7rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 0.75rem', fontWeight: '700' }}>Información</h3>
                                {[
                                    { label: 'Nombre', value: driverUser?.nombre || '—' },
                                    { label: 'Email', value: driverUser?.email || '—' },
                                    { label: 'Rol', value: driverUser?.rol || 'CONDUCTOR' },
                                    { label: 'ID', value: `#${driverUser?.id?.slice(-8).toUpperCase() || '—'}` },
                                ].map((row, i) => (
                                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0', borderBottom: i < 3 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                                        <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>{row.label}</span>
                                        <span style={{ fontSize: '0.8rem', fontWeight: '600', color: '#e5e7eb', maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>{row.value}</span>
                                    </div>
                                ))}
                            </div>

                            {/* Logout */}
                            <button
                                onClick={() => {
                                    localStorage.removeItem("user");
                                    localStorage.removeItem("token");
                                    router.push("/conductor/login");
                                }}
                                style={{ width: '100%', padding: '1rem', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.18)', borderRadius: '14px', color: '#ef4444', fontWeight: '700', fontSize: '0.875rem', cursor: 'pointer', letterSpacing: '0.3px' }}
                            >{t.auth.logout}</button>
                        </div>
                    )}
                </div>

                {/* BOTTOM NAVIGATION */}
                <nav style={{
                    position: 'fixed',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    background: 'rgba(6,6,12,0.96)',
                    backdropFilter: 'blur(24px)',
                    borderTop: '1px solid rgba(255,255,255,0.05)',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    padding: '0.4rem 0 0.6rem',
                    zIndex: 50
                }}>
                    {[
                        { id: 'inicio', label: 'Inicio', icon: (active: boolean) => (
                            <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? '#3bf63b' : 'none'} stroke={active ? '#3bf63b' : '#4b5563'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
                            </svg>
                        )},
                        { id: 'historial', label: 'Historial', icon: (active: boolean) => (
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#3bf63b' : '#4b5563'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
                            </svg>
                        )},
                        { id: 'chat', label: 'Chat', icon: (active: boolean) => (
                            <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? 'rgba(59,246,59,0.15)' : 'none'} stroke={active ? '#3bf63b' : '#4b5563'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                            </svg>
                        )},
                        { id: 'perfil', label: 'Perfil', icon: (active: boolean) => (
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#3bf63b' : '#4b5563'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
                            </svg>
                        )},
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', padding: '0.4rem', background: 'none', border: 'none', cursor: 'pointer', color: activeTab === tab.id ? '#3bf63b' : '#4b5563', transition: 'color 0.2s', WebkitTapHighlightColor: 'transparent' }}
                        >
                            {tab.icon(activeTab === tab.id)}
                            <span style={{ fontSize: '0.55rem', fontWeight: activeTab === tab.id ? '800' : '500', letterSpacing: '0.3px', transition: 'color 0.2s' }}>
                                {tab.label}
                            </span>
                            {activeTab === tab.id && (
                                <span style={{ width: '18px', height: '2px', background: '#3bf63b', borderRadius: '1px', marginTop: '1px' }} />
                            )}
                        </button>
                    ))}
                </nav>
            </main>

            <style>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                @keyframes gps-pulse {
                    0%, 100% { box-shadow: 0 0 6px rgba(59,246,59,0.8); opacity: 1; }
                    50% { box-shadow: 0 0 14px rgba(59,246,59,0.4); opacity: 0.6; }
                }
                @keyframes pulse {
                    0%, 100% { transform: scale(0.95); opacity: 1; }
                    50% { transform: scale(1.1); opacity: 0.7; }
                }
            `}</style>
        </BackgroundMeteors>
    );
}
