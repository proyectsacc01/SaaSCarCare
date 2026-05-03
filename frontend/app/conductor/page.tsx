"use client";

import { useTranslation } from "@/lib/i18n";
import { formatDriverAvailabilityLabel } from "@/lib/status-labels";
import { useEffect, useState, useRef, type ReactNode } from "react";
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
    latitudOrigen?: number;
    longitudOrigen?: number;
    latitudDestino?: number;
    longitudDestino?: number;
}

interface Vehiculo {
    id: string;
    matricula: string;
    marca: string;
    modelo: string;
    kilometraje: number;
    tipoCombustible: string;
    activo: boolean;
}

interface DriverUser {
    id: string;
    nombre?: string;
    email?: string;
    rol?: string;
    empresaId?: string;
    nombreEmpresa?: string;
}

type DriverTab = 'inicio' | 'historial' | 'chat' | 'perfil';

type AndroidTrackerBridge = {
    startTracking?: (rutaId: string) => void;
    stopTracking?: () => void;
    openExternalUrl?: (url: string) => void;
};

function getAndroidTracker(): AndroidTrackerBridge | null {
    if (typeof window === 'undefined') return null;
    return (window as Window & { AndroidTracker?: AndroidTrackerBridge }).AndroidTracker ?? null;
}

function getErrorMessage(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback;
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

function isInProgressRoute(estado?: string) {
    const normalizado = normalizeRouteState(estado);
    return normalizado === 'EN_CURSO' || normalizado === 'DETENIDO';
}

function isCompletedRoute(estado?: string) {
    return normalizeRouteState(estado) === 'COMPLETADA';
}

function isPlannedRoute(estado?: string) {
    return normalizeRouteState(estado) === 'PLANIFICADA';
}

const API_URL = typeof window !== 'undefined' && window.location.hostname === '10.0.2.2'
    ? ''
    : (process.env.NEXT_PUBLIC_API_URL || "https://saascarcare-production.up.railway.app");

// Abre una URL externa fuera del WebView. En Android, usa el bridge nativo
// para lanzar un Intent.ACTION_VIEW (Google Maps app, navegador, etc).
// En navegador web, abre en nueva pestaña.
function openExternal(url: string) {
    const bridge = getAndroidTracker();
    if (bridge && typeof bridge.openExternalUrl === 'function') {
        bridge.openExternalUrl(url);
        return;
    }
    if (typeof window === 'undefined') return;
    window.open(url, '_blank', 'noopener,noreferrer');
}

export default function ConductorDashboard() {
  const t = useTranslation();

    const [rutas, setRutas] = useState<Ruta[]>([]);
    const [rutasCompletadas, setRutasCompletadas] = useState<Ruta[]>([]);
    const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<DriverTab>('inicio');
    // isOnline controla SI el dispositivo emite GPS al servidor.
    // - true  → presence watcher activo + TrackingService nativo si hay ruta
    // - false → no se manda ubicación, el admin lo ve como inactivo
    // Persistimos en localStorage para que el cambio sobreviva al refresh y a
    // salir/entrar de la app.
    const [isOnline, setIsOnline] = useState(() => {
        if (typeof window === 'undefined') return true;
        const stored = localStorage.getItem('driverIsOnline');
        return stored === null ? true : stored === '1';
    });
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [routeStartTime, setRouteStartTime] = useState<Date | null>(null);
    const [driverUser, setDriverUser] = useState<DriverUser | null>(null);

    const router = useRouter();
    const gpsWatchIdRef = useRef<number | null>(null);
    const [gpsInterval, setGpsInterval] = useState<NodeJS.Timeout | null>(null);
    const [showRefuelForm, setShowRefuelForm] = useState(false);
    const [refuelData, setRefuelData] = useState({ vehiculoId: '', litros: '', precioPorLitro: '1.650', estacion: '', kmActual: '' });
    const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
    const profileFileRef = useRef<HTMLInputElement>(null);

    // GPS en vivo durante ruta — para mostrar velocidad y posición real al conductor
    const [liveGps, setLiveGps] = useState<{ lat: number; lng: number; speed: number; accuracy: number } | null>(null);
    // Mensajes no leídos para badge en bottom nav
    const [unreadMessages, setUnreadMessages] = useState(0);
    const lastReadMsgIdRef = useRef<string | null>(null);
    // Tracking de rutas vistas para detectar nuevas (notificación in-app)
    const seenRouteIdsRef = useRef<Set<string>>(new Set());
    const [newRouteToast, setNewRouteToast] = useState<Ruta | null>(null);
    // Filtro de historial
    const [historyFilter, setHistoryFilter] = useState<'hoy' | 'semana' | 'mes' | 'todo'>('todo');
    const [historySearch, setHistorySearch] = useState('');
    const [showEmpresaForm, setShowEmpresaForm] = useState(false);
    const [empresaEmailInput, setEmpresaEmailInput] = useState('');
    const [empresaLoading, setEmpresaLoading] = useState(false);
    const [showSupportForm, setShowSupportForm] = useState(false);
    const [supportLoading, setSupportLoading] = useState(false);
    const [supportSubject, setSupportSubject] = useState('');
    const [supportMessage, setSupportMessage] = useState('');
    const trackedRouteIdRef = useRef<string | null>(null);

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
                const data: Ruta[] = await res.json();
                const normalizadas = data.map(r => ({ ...r, estado: normalizeRouteState(r.estado) }));
                const activas = normalizadas.filter(r => !isCompletedRoute(r.estado));
                const completadas = normalizadas.filter(r => isCompletedRoute(r.estado));

                // Detectar nuevas rutas planificadas para notificar al conductor
                const seen = seenRouteIdsRef.current;
                if (seen.size > 0) {
                    const nuevas = activas.filter(r => isPlannedRoute(r.estado) && !seen.has(r.id));
                    if (nuevas.length > 0) {
                        const ultima = nuevas[nuevas.length - 1];
                        setNewRouteToast(ultima);
                        toast.success(`Nueva ruta asignada: ${ultima.origen} → ${ultima.destino}`, { duration: 6000 });
                        // Vibración suave si el dispositivo lo soporta
                        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
                            try { navigator.vibrate([180, 60, 180]); } catch {}
                        }
                    }
                }
                activas.forEach(r => seen.add(r.id));

                setRutas(activas);
                setRutasCompletadas(completadas);
                setLoading(false);
            } else {
                if (res.status === 401 || res.status === 403) {
                    toast.error("Sesión expirada");
                    router.push("/conductor/login");
                    return;
                }
                throw new Error(`Error del servidor: ${res.status}`);
            }
        } catch (err: unknown) {
            const isAbort = err instanceof Error && err.name === 'AbortError';
            const errorMsg = isAbort
                ? "Tiempo de espera agotado — el servidor no responde"
                : `Error de conexión: ${getErrorMessage(err, 'Error desconocido')}`;
            setError(errorMsg);
            toast.error(errorMsg);
        } finally {
            setLoading(false);
        }
    };

    const cargarVehiculos = async () => {
        try {
            const res = await fetch(`${API_URL}/api/vehiculos`, { headers: getAuthHeaders() });
            if (res.ok) {
                const data: Vehiculo[] = await res.json();
                setVehiculos(data.filter(v => v.activo));
            }
        } catch { /* silencioso — los vehículos son auxiliares */ }
    };

    useEffect(() => {
        const userStr = localStorage.getItem("user");
        if (!userStr) {
            toast.error("Debes iniciar sesión");
            router.push("/conductor/login");
            return;
        }
        try { setDriverUser(JSON.parse(userStr)); } catch {}
        // Load profile photo from localStorage
        const savedPhoto = localStorage.getItem("profilePhoto");
        if (savedPhoto) setProfilePhoto(savedPhoto);
        cargarRutas();
        cargarVehiculos();
        const interval = setInterval(cargarRutas, 10000);

        return () => {
            clearInterval(interval);
            stopBrowserGPS();
        };
    }, []);

    // ─── Presence GPS — solo activo cuando isOnline=true ─────────────────
    // El conductor reporta su ubicación REAL cada ~30s mientras la app
    // esté abierta Y esté marcado como ACTIVO. Si el conductor toca el
    // botón ACTIVO/INACTIVO en el header, este watcher se monta/desmonta
    // y deja de enviar GPS al servidor.
    useEffect(() => {
        if (!isOnline) return;
        if (typeof navigator === 'undefined' || !navigator.geolocation) return;

        // Throttle 10s para presence: balance entre fluidez visual en el admin
        // y no saturar backend cuando el conductor está parado. Si arranca una
        // ruta, el TrackingService nativo / startBrowserGPS manda más rápido al
        // endpoint /{id}/gps; este watcher solo cubre el caso "abre la app sin
        // ruta" o "entre rutas".
        let lastSent = 0;
        const watchId = navigator.geolocation.watchPosition(
            (pos) => {
                const now = Date.now();
                if (now - lastSent < 10_000) return;
                lastSent = now;
                fetch(`${API_URL}/api/conductores/me/gps`, {
                    method: 'POST',
                    headers: getAuthHeaders(),
                    body: JSON.stringify({
                        latitud: pos.coords.latitude,
                        longitud: pos.coords.longitude,
                        precision: pos.coords.accuracy,
                        velocidadKmh: pos.coords.speed != null && pos.coords.speed >= 0 ? pos.coords.speed * 3.6 : undefined,
                    }),
                }).catch(() => { /* silencioso */ });
            },
            () => { /* permiso denegado o error — silencioso */ },
            { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 }
        );

        return () => {
            navigator.geolocation.clearWatch(watchId);
        };
    }, [isOnline]);

    // Toggle ACTIVO/INACTIVO:
    //   - Persiste el estado en localStorage Y en el backend (compartiendoUbicacion)
    //   - El watcher de presencia se ata/desata vía el useEffect de arriba
    //   - El tracking de ruta se sincroniza aparte según el estado que llegue del servidor
    //   - Si pasamos a INACTIVO con ruta en curso, paramos el TrackingService nativo
    const toggleOnline = () => {
        const next = !isOnline;
        setIsOnline(next);
        if (typeof window !== 'undefined') {
            localStorage.setItem('driverIsOnline', next ? '1' : '0');
        }
        // Avisar al backend para que el admin vea correctamente el flag.
        // Best-effort: si falla, el estado local sigue siendo correcto.
        fetch(`${API_URL}/api/conductores/me/online`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ activo: next }),
        }).catch(() => { /* silencioso */ });

        const tracker = getAndroidTracker();
        const rutaEnCurso = rutas.find(r => isInProgressRoute(r.estado));
        if (!next) {
            // INACTIVO: paramos GPS del navegador y servicio nativo
            stopBrowserGPS();
            if (tracker?.stopTracking) {
                try { tracker.stopTracking(); } catch { /* noop */ }
            }
            toast.success("Tu estado es Desconectado — tu ubicación no se comparte");
        } else {
            // ACTIVO: si tenés ruta en curso, re-arrancar tracking nativo o web
            if (rutaEnCurso?.id) {
                if (tracker?.startTracking) {
                    try { tracker.startTracking(rutaEnCurso.id); } catch { /* noop */ }
                } else {
                    startBrowserGPS(rutaEnCurso.id);
                }
            }
            toast.success("Tu estado es En línea — tu ubicación se comparte con la central");
        }
    };

    const rutaEnProgreso = rutas.find(r => isInProgressRoute(r.estado));
    const rutasPendientes = rutas.filter(r => isPlannedRoute(r.estado));
    const rutasEnProgresoCount = rutas.filter(r => isInProgressRoute(r.estado)).length;

    const handleProfilePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 1024 * 1024) { toast.error("Foto muy grande (máx. 1MB)"); return; }
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = reader.result as string;
            setProfilePhoto(dataUrl);
            localStorage.setItem("profilePhoto", dataUrl);
            toast.success("Foto de perfil actualizada");
        };
        reader.readAsDataURL(file);
        e.target.value = "";
    };

    // Timer para ruta activa
    useEffect(() => {
        if (rutaEnProgreso && !routeStartTime) setRouteStartTime(new Date());
        else if (!rutaEnProgreso) { setRouteStartTime(null); setElapsedSeconds(0); }
    }, [rutaEnProgreso, routeStartTime]);

    // Sincroniza el tracking real con el estado que llega del panel/backend.
    // Si la central inicia, pausa, reanuda o cierra una ruta, la app responde sola.
    useEffect(() => {
        if (!isOnline || !rutaEnProgreso) {
            stopRouteTracking();
            return;
        }
        startRouteTracking(rutaEnProgreso.id);
    }, [isOnline, rutaEnProgreso?.id, rutaEnProgreso?.estado]);

    useEffect(() => {
        if (!routeStartTime) return;
        const timer = setInterval(() => {
            setElapsedSeconds(Math.floor((Date.now() - routeStartTime.getTime()) / 1000));
        }, 1000);
        return () => clearInterval(timer);
    }, [routeStartTime]);

    // Polling de mensajes ADMIN no leídos para badge en bottom nav
    useEffect(() => {
        const rutaParaChat = rutaEnProgreso || rutas.find(r => isPlannedRoute(r.estado));
        if (!rutaParaChat) {
            setUnreadMessages(0);
            return;
        }
        const fetchMsgs = async () => {
            try {
                const res = await fetch(`${API_URL}/api/mensajes/${rutaParaChat.id}`, { headers: getAuthHeaders() });
                if (!res.ok) return;
                const msgs: Array<{ id?: string; remitente: string; timestamp?: string }> = await res.json();
                if (msgs.length === 0) { setUnreadMessages(0); return; }
                // Si el usuario está en la pestaña chat, todos son leídos
                if (activeTab === 'chat') {
                    lastReadMsgIdRef.current = msgs[msgs.length - 1].id || null;
                    setUnreadMessages(0);
                    return;
                }
                // Contamos mensajes ADMIN posteriores al último leído
                const lastRead = lastReadMsgIdRef.current;
                let countingFrom = lastRead ? false : true;
                let unread = 0;
                for (const m of msgs) {
                    if (countingFrom && m.remitente === 'ADMIN') unread++;
                    if (m.id === lastRead) countingFrom = true;
                }
                setUnreadMessages(unread);
            } catch { /* silencioso */ }
        };
        fetchMsgs();
        const interval = setInterval(fetchMsgs, 5000);
        return () => clearInterval(interval);
    }, [rutas, activeTab, rutaEnProgreso?.id]);

    const formatElapsed = (s: number) => {
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`;
        return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    };

    const updateLiveGps = (pos: GeolocationPosition) => {
        setLiveGps({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            speed: pos.coords.speed != null && pos.coords.speed >= 0 ? pos.coords.speed * 3.6 : 0,
            accuracy: pos.coords.accuracy || 0,
        });
    };

    const startBrowserGPS = (rutaId: string) => {
        if (!navigator.geolocation) { toast.error("GPS no disponible"); return; }
        if (gpsWatchIdRef.current !== null && trackedRouteIdRef.current === rutaId) return;
        if (trackedRouteIdRef.current && trackedRouteIdRef.current !== rutaId) {
            stopBrowserGPS();
        }
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                toast.success("GPS activado");
                updateLiveGps(position);
                trackedRouteIdRef.current = rutaId;
                try {
                    await fetch(`${API_URL}/api/rutas/${rutaId}/gps`, {
                        method: 'POST', headers: getAuthHeaders(),
                        body: JSON.stringify({
                            latitud: position.coords.latitude,
                            longitud: position.coords.longitude,
                            precision: position.coords.accuracy,
                            velocidadKmh: position.coords.speed != null && position.coords.speed >= 0 ? position.coords.speed * 3.6 : undefined,
                        })
                    });
                } catch {}
                const watchId = navigator.geolocation.watchPosition(
                    async (pos) => {
                        updateLiveGps(pos);
                        try {
                            await fetch(`${API_URL}/api/rutas/${rutaId}/gps`, {
                                method: 'POST', headers: getAuthHeaders(),
                                body: JSON.stringify({
                                    latitud: pos.coords.latitude,
                                    longitud: pos.coords.longitude,
                                    precision: pos.coords.accuracy,
                                    velocidadKmh: pos.coords.speed != null && pos.coords.speed >= 0 ? pos.coords.speed * 3.6 : undefined,
                                })
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
        trackedRouteIdRef.current = null;
        setLiveGps(null);
    };

    const startRouteTracking = (rutaId: string) => {
        if (trackedRouteIdRef.current === rutaId) return;
        const tracker = getAndroidTracker();
        stopBrowserGPS();
        if (tracker?.startTracking) {
            try {
                tracker.startTracking(rutaId);
                trackedRouteIdRef.current = rutaId;
                return;
            } catch {
                trackedRouteIdRef.current = null;
            }
        }
        startBrowserGPS(rutaId);
    };

    const stopRouteTracking = () => {
        stopBrowserGPS();
        const tracker = getAndroidTracker();
        if (tracker?.stopTracking) {
            try { tracker.stopTracking(); } catch { /* noop */ }
        }
        trackedRouteIdRef.current = null;
    };

    const toggleRuta = async (ruta: Ruta) => {
        const estadoActual = normalizeRouteState(ruta.estado);
        const nuevoEstado = estadoActual === 'EN_CURSO' ? 'PLANIFICADA' : 'EN_CURSO';
        // No se puede iniciar una ruta si el conductor está INACTIVO —
        // sino el admin no recibiría telemetría y la ruta no tendría sentido.
        if (nuevoEstado === 'EN_CURSO' && !isOnline) {
            toast.error("Activa tu estado para iniciar la ruta");
            return;
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
        if (!refuelData.vehiculoId) { toast.warning("Selecciona el vehículo"); return; }
        if (!litros || litros <= 0) { toast.warning("Introduce la cantidad de litros"); return; }
        if (!precio || precio <= 0) { toast.warning("Introduce el precio por litro"); return; }
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
                else if (res.status === 400) toast.error("Datos incompletos — revisa los campos");
                else toast.error(`Error al registrar repostaje (${res.status})`);
                console.error('Repostaje error:', res.status, body);
            }
        } catch { toast.error("Error de conexión — revisa tu conexión a internet"); }
    };

    const cambiarEmpresa = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!empresaEmailInput.trim() || !driverUser?.id) return;
        setEmpresaLoading(true);
        try {
            const res = await fetch(`${API_URL}/api/conductores/${driverUser.id}/empresa`, {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify({ empresaEmail: empresaEmailInput.trim().toLowerCase() }),
            });
            const data = await res.json();
            if (res.ok) {
                if (data.token) localStorage.setItem('token', data.token);
                const updated = { ...driverUser, empresaId: data.empresaId, nombreEmpresa: data.nombreEmpresa };
                setDriverUser(updated);
                localStorage.setItem('user', JSON.stringify(updated));
                toast.success(`Vinculado a ${data.nombreEmpresa}`);
                setShowEmpresaForm(false);
                setEmpresaEmailInput('');
                cargarRutas();
            } else {
                toast.error(data.error || 'Error al cambiar empresa');
            }
        } catch {
            toast.error('Error de conexión');
        } finally {
            setEmpresaLoading(false);
        }
    };

    const enviarSoporte = async (e: React.FormEvent) => {
        e.preventDefault();
        const mensaje = supportMessage.trim();
        if (!mensaje) {
            toast.error('Cuéntanos qué problema tuviste para poder enviarlo');
            return;
        }

            const rutaContexto = rutaEnProgreso || rutasPendientes[0];
        setSupportLoading(true);
        try {
            const res = await fetch(`/api/conductores/me/support`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    asunto: supportSubject.trim() || 'Soporte desde CarCare Driver',
                    mensaje,
                    rutaId: rutaContexto?.id,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data.error || 'No se pudo enviar la solicitud');
            }
            setSupportSubject('');
            setSupportMessage('');
            setShowSupportForm(false);
            if (data.emailEnviado) {
                toast.success('Soporte enviado al panel y por correo');
            } else if (data.emailError) {
                toast.success('Soporte enviado al panel de la central');
                toast.warning(`Correo pendiente: ${data.emailError}`);
            } else {
                toast.success('Soporte enviado al panel de la central');
            }
        } catch (err: unknown) {
            toast.error(getErrorMessage(err, 'Error enviando soporte'));
        } finally {
            setSupportLoading(false);
        }
    };

    const completarRuta = async (ruta: Ruta) => {
        try {
            await fetch(`${API_URL}/api/rutas/${ruta.id}`, {
                method: 'PUT', headers: getAuthHeaders(),
                body: JSON.stringify({ estado: 'COMPLETADA' })
            });
            cargarRutas();
            toast.success("Trayecto completado");
        } catch { toast.error("Error al completar ruta"); }
    };

    const getInitials = (name?: string, email?: string) => {
        if (name?.trim()) return name.trim().split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        if (email?.trim()) return email.trim()[0].toUpperCase();
        return '?';
    };

    const rutaActiva = rutaEnProgreso;

    // KM RECORRIDOS HOY: solo rutas completadas con fecha = hoy (zona horaria local)
    const hoyStr = new Date().toISOString().slice(0, 10);
    const completadasHoy = rutasCompletadas.filter(r => {
        if (!r.fecha) return false;
        const f = new Date(r.fecha);
        if (isNaN(f.getTime())) return false;
        return f.toISOString().slice(0, 10) === hoyStr;
    });
    const kmHoyReales = completadasHoy.reduce((acc, r) => acc + (r.distanciaEstimadaKm || 0), 0);
    const kmTotalAcumulado = rutasCompletadas.reduce((acc, r) => acc + (r.distanciaEstimadaKm || 0), 0);

    // FILTRO DE HISTORIAL — calculamos las rutas visibles según filtro + búsqueda
    const filtroFecha = (() => {
        const ahora = Date.now();
        if (historyFilter === 'hoy') return ahora - 24 * 3600 * 1000;
        if (historyFilter === 'semana') return ahora - 7 * 24 * 3600 * 1000;
        if (historyFilter === 'mes') return ahora - 30 * 24 * 3600 * 1000;
        return 0;
    })();
    const rutasHistorialFiltradas = rutasCompletadas.filter(r => {
        if (filtroFecha > 0) {
            if (!r.fecha) return false;
            const t = new Date(r.fecha).getTime();
            if (isNaN(t) || t < filtroFecha) return false;
        }
        if (historySearch.trim()) {
            const q = historySearch.toLowerCase();
            return (r.origen?.toLowerCase().includes(q) || r.destino?.toLowerCase().includes(q));
        }
        return true;
    });
    const kmTotalesPeriodo = rutasHistorialFiltradas.reduce((acc, r) => acc + (r.distanciaEstimadaKm || 0), 0);

    if (loading && !error) return (
        <BackgroundMeteors>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: '1.5rem' }}>
                <div style={{ position: 'relative', width: '56px', height: '56px' }}>
                    <div style={{ width: '56px', height: '56px', border: '2.5px solid rgba(59,246,59,0.06)', borderTop: '2.5px solid #3bf63b', borderRight: '2.5px solid rgba(59,246,59,0.3)', borderRadius: '50%', animation: 'spin 0.85s linear infinite' }} />
                </div>
                <div style={{ textAlign: 'center' }}>
                    <p style={{ color: '#e5e7eb', fontSize: '0.9rem', margin: '0 0 0.25rem', fontWeight: '700', letterSpacing: '0.2px' }}>CarCare Driver</p>
                    <p style={{ color: '#4b5563', fontSize: '0.68rem', margin: 0 }}>Conectando con la flota...</p>
                </div>
            </div>
        </BackgroundMeteors>
    );

    if (error) return (
        <BackgroundMeteors>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '2rem', textAlign: 'center', gap: '1.2rem' }}>
                <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(239,68,68,0.08)', border: '2px solid rgba(239,68,68,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem' }}>📡</div>
                <div>
                    <h2 style={{ fontSize: '1.1rem', color: '#ef4444', margin: '0 0 0.4rem', fontWeight: '800' }}>Sin conexión</h2>
                    <p style={{ color: '#6b7280', fontSize: '0.8rem', margin: 0, maxWidth: '280px', lineHeight: 1.5 }}>{error}</p>
                </div>
                <button
                    onClick={() => { setLoading(true); setError(null); cargarRutas(); }}
                    style={{ padding: '0.9rem 2.5rem', background: 'linear-gradient(135deg, #3bf63b, #22c55e)', color: '#000', border: 'none', borderRadius: '14px', fontWeight: '800', fontSize: '0.9rem', cursor: 'pointer', boxShadow: '0 6px 20px rgba(59,246,59,0.3)', transition: 'transform 0.2s', letterSpacing: '0.3px' }}
                >
                    Reintentar
                </button>
            </div>
        </BackgroundMeteors>
    );

    return (
        <BackgroundMeteors>
            <main style={{
                // Altura FIJA al viewport dinámico. Sin esto, cuando el contenido
                // crece (form de repostaje, lista larga…), main crecía con él y el
                // overflow:auto del scroll interno dejaba de actuar — el usuario
                // no podía scrollear. Ahora main NUNCA crece: todo el scroll
                // ocurre dentro del div flex:1.
                height: '100dvh',
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
                overflow: 'hidden'
            }}>

                {/* STATUS BAR */}
                <div style={{ background: 'rgba(5,5,10,0.9)', padding: '0.35rem 1.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.6rem', color: '#6b7280', backdropFilter: 'blur(8px)' }}>
                    <span style={{ fontFamily: 'monospace' }}>
                        {new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span style={{ color: isOnline ? '#3bf63b' : '#6b7280', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
                        {formatDriverAvailabilityLabel(isOnline).toUpperCase()}
                    </span>
                </div>

                {/* HEADER */}
                <header style={{
                    padding: '0.85rem 1.2rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    // Sólido para que el contenido del scroll NO se vea borroso
                    // pasando por detrás (efecto "marco roto" que reportó el usuario).
                    background: 'rgba(5,6,11,0.98)',
                    backdropFilter: 'blur(24px)',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    position: 'sticky',
                    top: 0,
                    zIndex: 20,
                    boxShadow: '0 4px 14px -8px rgba(0,0,0,0.6)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
                        <div style={{
                            width: '36px', height: '36px', borderRadius: '12px',
                            background: 'linear-gradient(135deg, #3bf63b, #22c55e)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: '0 4px 14px rgba(59,246,59,0.3)', flexShrink: 0
                        }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.6-1.1-1-1.9-1H5c-.8 0-1.4.4-1.9 1L1 10l-.6 1c-.6.9-.4 2.1.5 2.6.2.1.5.2.8.2H3v1c0 .6.4 1 1 1h1" />
                                <circle cx="7" cy="17" r="2" /><circle cx="17" cy="17" r="2" />
                            </svg>
                        </div>
                        <div>
                            <h1 style={{ fontSize: '0.95rem', fontWeight: '800', margin: 0, lineHeight: 1.2, color: '#fff' }}>
                                {driverUser?.nombre?.split(' ')[0] || 'Conductor'}
                            </h1>
                            <p style={{ fontSize: '0.58rem', color: '#4b5563', margin: 0, letterSpacing: '0.5px' }}>
                                {driverUser?.nombreEmpresa || 'CarCare Driver'}
                            </p>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <button
                            onClick={toggleOnline}
                            style={{
                                padding: '0.25rem 0.6rem',
                                borderRadius: '99px',
                                border: `1px solid ${isOnline ? 'rgba(59,246,59,0.35)' : 'rgba(107,114,128,0.25)'}`,
                                background: isOnline ? 'rgba(59,246,59,0.08)' : 'rgba(255,255,255,0.03)',
                                color: isOnline ? '#3bf63b' : '#6b7280',
                                fontSize: '0.55rem',
                                fontWeight: '800',
                                cursor: 'pointer',
                                letterSpacing: '0.3px',
                                transition: 'all 0.25s ease',
                                display: 'flex', alignItems: 'center', gap: '4px'
                            }}
                        >
                            <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: isOnline ? '#3bf63b' : '#6b7280', boxShadow: isOnline ? '0 0 6px rgba(59,246,59,0.6)' : 'none' }} />
                            {formatDriverAvailabilityLabel(isOnline).toUpperCase()}
                        </button>
                        <div
                            onClick={() => setActiveTab('perfil')}
                            style={{
                                width: '36px', height: '36px', borderRadius: '50%', overflow: 'hidden',
                                border: `2px solid ${isOnline ? 'rgba(59,246,59,0.55)' : 'rgba(107,114,128,0.3)'}`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '0.7rem', fontWeight: '900', color: '#3bf63b', flexShrink: 0,
                                transition: 'border-color 0.25s ease, transform 0.15s ease', cursor: 'pointer',
                                background: profilePhoto
                                    ? 'transparent'
                                    : 'linear-gradient(135deg, rgba(59,246,59,0.18), rgba(34,197,94,0.06))',
                                boxShadow: isOnline ? '0 0 0 3px rgba(59,246,59,0.08)' : 'none'
                            }}
                        >
                            {profilePhoto ? (
                                <img
                                    src={profilePhoto}
                                    alt=""
                                    referrerPolicy="no-referrer"
                                    onError={() => {
                                        // Google a veces invalida el URL de la foto de perfil
                                        // (token caducado, hotlink bloqueado). Volvemos a iniciales.
                                        setProfilePhoto(null);
                                        if (typeof window !== 'undefined') {
                                            localStorage.removeItem('profilePhoto');
                                        }
                                    }}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                            ) : getInitials(driverUser?.nombre, driverUser?.email)}
                        </div>
                    </div>
                </header>

                {/* SCROLLABLE CONTENT */}
                <div style={{
                    flex: 1,
                    // Sin minHeight:0, los flex items por default tienen
                    // min-height:auto y crecen al contenido en vez de scrollear.
                    // Necesario para que overflowY:auto realmente actúe.
                    minHeight: 0,
                    overflowY: 'auto',
                    overscrollBehavior: 'contain',
                    WebkitOverflowScrolling: 'touch',
                    // Padding-bottom = altura del nav fijo (~64px) + safe area + aire.
                    // Garantiza que la última tarjeta de CUALQUIER tab pueda
                    // scrollearse hasta arriba del nav y nunca quede tapada.
                    padding: '1rem 1rem calc(110px + env(safe-area-inset-bottom, 0px))'
                }}>

                    {/* ─── TAB: INICIO ─── */}
                    {activeTab === 'inicio' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.4rem' }}>

                            {/* STATS STRIP */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.7rem' }}>
                                {[
                                    { label: `Hoy · ${completadasHoy.length}`, value: kmHoyReales > 0 ? `${kmHoyReales.toFixed(0)}` : '0', sub: 'km', color: '#3bf63b' },
                                    { label: 'Pendientes', value: rutasPendientes.length, sub: 'rutas', color: '#f59e0b' },
                                    { label: 'Total', value: rutasCompletadas.length, sub: 'completadas', color: '#60a5fa' },
                                ].map((s, i) => (
                                    <div key={i} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '14px', padding: '0.9rem 0.6rem', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
                                        <div style={{ position: 'absolute', top: '-8px', right: '-8px', width: '48px', height: '48px', background: `radial-gradient(circle, ${s.color}1f 0%, transparent 70%)` }} />
                                        <div style={{ fontSize: '1.6rem', fontWeight: '900', color: s.color, lineHeight: 1 }}>{s.value}</div>
                                        <div style={{ fontSize: '0.5rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.4px', marginTop: '0.15rem', fontWeight: 600 }}>{s.sub}</div>
                                        <div style={{ fontSize: '0.5rem', color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '0.15rem' }}>{s.label}</div>
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
                                        border: `1px solid ${rutaActiva.estado === 'DETENIDO' ? 'rgba(249,115,22,0.18)' : 'rgba(59,246,59,0.15)'}`,
                                        borderLeft: `4px solid ${rutaActiva.estado === 'DETENIDO' ? '#f97316' : '#3bf63b'}`,
                                        borderRadius: '18px',
                                        padding: '1.2rem',
                                        boxShadow: rutaActiva.estado === 'DETENIDO'
                                            ? '0 12px 40px -12px rgba(249,115,22,0.12), inset 0 1px 0 rgba(255,255,255,0.04)'
                                            : '0 12px 40px -12px rgba(59,246,59,0.12), inset 0 1px 0 rgba(255,255,255,0.04)'
                                    }}>
                                        {/* Top badges */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.1rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: rutaActiva.estado === 'DETENIDO' ? 'rgba(249,115,22,0.1)' : 'rgba(59,246,59,0.1)', padding: '0.3rem 0.75rem', borderRadius: '99px', border: `1px solid ${rutaActiva.estado === 'DETENIDO' ? 'rgba(249,115,22,0.25)' : 'rgba(59,246,59,0.25)'}` }}>
                                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: rutaActiva.estado === 'DETENIDO' ? '#f97316' : '#3bf63b', boxShadow: rutaActiva.estado === 'DETENIDO' ? '0 0 8px rgba(249,115,22,0.8)' : '0 0 8px rgba(59,246,59,0.8)', display: 'inline-block', animation: rutaActiva.estado === 'DETENIDO' ? 'none' : 'gps-pulse 1.5s infinite' }} />
                                                <span style={{ fontSize: '0.58rem', color: rutaActiva.estado === 'DETENIDO' ? '#f97316' : '#3bf63b', fontWeight: '900', letterSpacing: '0.5px' }}>
                                                    {rutaActiva.estado === 'DETENIDO' ? 'DETENIDO · EN RUTA' : 'GPS ACTIVO'}
                                                </span>
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

                                        {/* Mini stats — incluye velocidad real cuando hay GPS */}
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.6rem', marginBottom: '1.1rem' }}>
                                            <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '10px', padding: '0.55rem', textAlign: 'center', border: liveGps && liveGps.speed > 1 ? '1px solid rgba(59,246,59,0.25)' : '1px solid rgba(255,255,255,0.04)' }}>
                                                <div style={{ fontSize: '0.95rem', fontWeight: '900', color: liveGps ? '#3bf63b' : '#6b7280', lineHeight: 1.1 }}>
                                                    {liveGps ? Math.round(liveGps.speed) : '—'}
                                                    <span style={{ fontSize: '0.5rem', color: '#6b7280', marginLeft: '2px', fontWeight: 600 }}>km/h</span>
                                                </div>
                                                <div style={{ fontSize: '0.5rem', color: '#4b5563', textTransform: 'uppercase', marginTop: '3px', letterSpacing: '0.3px' }}>Velocidad</div>
                                            </div>
                                            <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: '10px', padding: '0.55rem', textAlign: 'center', border: '1px solid rgba(255,255,255,0.04)' }}>
                                                <div style={{ fontSize: '0.8rem', fontWeight: '800', color: '#e5e7eb', lineHeight: 1.2 }}>
                                                    {rutaActiva.distanciaEstimadaKm}<span style={{ fontSize: '0.55rem', color: '#6b7280', marginLeft: '2px' }}>km</span>
                                                </div>
                                                <div style={{ fontSize: '0.5rem', color: '#4b5563', textTransform: 'uppercase', marginTop: '3px', letterSpacing: '0.3px' }}>Distancia</div>
                                            </div>
                                            <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: '10px', padding: '0.55rem', textAlign: 'center', border: '1px solid rgba(255,255,255,0.04)' }}>
                                                <div style={{ fontSize: '0.8rem', fontWeight: '800', color: '#e5e7eb', lineHeight: 1.2 }}>
                                                    {formatElapsed(elapsedSeconds)}
                                                </div>
                                                <div style={{ fontSize: '0.5rem', color: '#4b5563', textTransform: 'uppercase', marginTop: '3px', letterSpacing: '0.3px' }}>Tiempo</div>
                                            </div>
                                        </div>

                                        {/* GPS accuracy badge cuando hay señal */}
                                        {liveGps && (
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.4rem 0.6rem', background: 'rgba(0,0,0,0.25)', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.55rem', color: '#6b7280' }}>
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: liveGps.accuracy < 20 ? '#3bf63b' : liveGps.accuracy < 50 ? '#f59e0b' : '#ef4444' }} />
                                                    GPS · ±{Math.round(liveGps.accuracy)}m
                                                </span>
                                                <span style={{ fontFamily: 'monospace', color: '#4b5563' }}>
                                                    {liveGps.lat.toFixed(4)}, {liveGps.lng.toFixed(4)}
                                                </span>
                                            </div>
                                        )}

                                        {/* Actions */}
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                                            <button
                                                onClick={() => router.push(`/conductor/iniciar/${rutaActiva.id}`)}
                                                style={{ padding: '0.8rem 0.4rem', background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.25)', borderRadius: '12px', color: '#60a5fa', fontWeight: '700', fontSize: '0.7rem', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '3px' }}
                                            >
                                                <span style={{ fontSize: '0.95rem' }}>🧭</span>
                                                Iniciar
                                            </button>
                                            <button
                                                onClick={() => setActiveTab('chat')}
                                                style={{ padding: '0.8rem 0.4rem', background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.25)', borderRadius: '12px', color: '#a78bfa', fontWeight: '700', fontSize: '0.7rem', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '3px', position: 'relative' }}
                                            >
                                                <span style={{ fontSize: '0.95rem' }}>💬</span>
                                                Chat
                                                {unreadMessages > 0 && (
                                                    <span style={{ position: 'absolute', top: '4px', right: '8px', minWidth: '14px', height: '14px', background: '#ef4444', borderRadius: '99px', fontSize: '0.5rem', fontWeight: 900, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>
                                                        {unreadMessages > 9 ? '9+' : unreadMessages}
                                                    </span>
                                                )}
                                            </button>
                                            <button
                                                onClick={() => completarRuta(rutaActiva)}
                                                style={{ padding: '0.8rem 0.4rem', background: 'linear-gradient(135deg, #3bf63b, #22c55e)', border: 'none', borderRadius: '12px', color: '#000', fontWeight: '900', fontSize: '0.7rem', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '3px', boxShadow: '0 4px 14px rgba(59,246,59,0.25)' }}
                                            >
                                                <span style={{ fontSize: '0.95rem' }}>✓</span>
                                                Completar
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ background: 'rgba(255,255,255,0.02)', border: '2px dashed rgba(255,255,255,0.06)', borderRadius: '18px', padding: '2.5rem 2rem', textAlign: 'center' }}>
                                        <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem', filter: 'grayscale(1)', opacity: 0.35 }}>🛣️</div>
                                        <p style={{ color: '#4b5563', fontSize: '0.9rem', margin: '0 0 0.3rem', fontWeight: '600' }}>Sin trayecto activo</p>
                                        <p style={{ color: '#374151', fontSize: '0.75rem', margin: 0 }}>Inicia un servicio desde Próximos</p>
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
                                                                    ? new Date(r.fecha).toLocaleDateString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
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
                                // Merge: vehículos de la API + IDs de rutas que no estén en la API
                                const idsDeRutas = [...new Set(
                                    [...rutas, ...rutasCompletadas].map(r => r.vehiculoId).filter(Boolean)
                                )];
                                const idsEnApi = new Set(vehiculos.map(v => v.id));
                                const idsHuerfanos = idsDeRutas.filter(id => !idsEnApi.has(id));

                                const getVehiculoLabel = (v: Vehiculo) => `${v.matricula} — ${v.marca} ${v.modelo}`;

                                const hayVehiculos = vehiculos.length > 0 || idsHuerfanos.length > 0;

                                const costePreview = parseFloat(refuelData.litros) > 0 && parseFloat(refuelData.precioPorLitro) > 0
                                    ? Math.round(parseFloat(refuelData.litros) * parseFloat(refuelData.precioPorLitro) * 100) / 100
                                    : 0;

                                // Info del vehículo seleccionado para mostrar debajo del selector
                                const vehiculoSeleccionado = vehiculos.find(v => v.id === refuelData.vehiculoId);

                                return (
                                    <div>
                                        <button
                                            onClick={() => {
                                                const v = rutaActiva?.vehiculoId || (vehiculos.length > 0 ? vehiculos[0].id : idsHuerfanos[0] || '');
                                                setRefuelData(d => ({ ...d, vehiculoId: v }));
                                                setShowRefuelForm(!showRefuelForm);
                                            }}
                                            style={{ width: '100%', padding: '1rem', background: showRefuelForm ? 'rgba(255,255,255,0.05)' : 'rgba(245,158,11,0.08)', border: `1px solid ${showRefuelForm ? 'rgba(255,255,255,0.12)' : 'rgba(245,158,11,0.25)'}`, borderRadius: '14px', color: showRefuelForm ? '#9ca3af' : '#f59e0b', fontWeight: '800', fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', letterSpacing: '0.5px', transition: 'all 0.2s' }}
                                        >
                                            {showRefuelForm ? '✕ Cancelar' : '⛽ Registrar Repostaje'}
                                        </button>

                                        {showRefuelForm && (
                                            <div style={{ marginTop: '0.75rem', background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '16px', padding: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                                {/* Selector de vehículo — muestra matrícula + marca modelo */}
                                                <div>
                                                    <label style={{ fontSize: '0.6rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '0.4rem' }}>Vehículo</label>
                                                    {hayVehiculos ? (
                                                        <select
                                                            value={refuelData.vehiculoId}
                                                            onChange={e => setRefuelData(d => ({ ...d, vehiculoId: e.target.value }))}
                                                            style={{ width: '100%', padding: '0.7rem 0.6rem', background: '#0d1117', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', color: '#fff', fontSize: '0.85rem', appearance: 'none', WebkitAppearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.7rem center', paddingRight: '2rem', cursor: 'pointer', transition: 'border-color 0.2s' }}
                                                        >
                                                            <option value="">Selecciona un vehículo</option>
                                                            {vehiculos.length > 0 && (
                                                                <optgroup label="Flota disponible">
                                                                    {vehiculos.map(v => (
                                                                        <option key={v.id} value={v.id}>
                                                                            {getVehiculoLabel(v)}
                                                                        </option>
                                                                    ))}
                                                                </optgroup>
                                                            )}
                                                            {idsHuerfanos.length > 0 && (
                                                                <optgroup label="De rutas asignadas">
                                                                    {idsHuerfanos.map(vid => (
                                                                        <option key={vid} value={vid}>ID: {vid.slice(-8).toUpperCase()}</option>
                                                                    ))}
                                                                </optgroup>
                                                            )}
                                                        </select>
                                                    ) : (
                                                        <input
                                                            type="text"
                                                            placeholder="ID del vehículo (consulta al admin)"
                                                            value={refuelData.vehiculoId}
                                                            onChange={e => setRefuelData(d => ({ ...d, vehiculoId: e.target.value }))}
                                                            style={{ width: '100%', padding: '0.65rem', background: '#0d1117', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', color: '#fff', fontSize: '0.85rem', boxSizing: 'border-box' }}
                                                        />
                                                    )}
                                                </div>

                                                {/* Info card del vehículo seleccionado */}
                                                {vehiculoSeleccionado && (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', padding: '0.6rem 0.75rem', background: 'rgba(59,246,59,0.05)', borderRadius: '10px', border: '1px solid rgba(59,246,59,0.15)' }}>
                                                        <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(59,246,59,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', flexShrink: 0 }}>🚗</div>
                                                        <div style={{ flex: 1, overflow: 'hidden' }}>
                                                            <div style={{ fontSize: '0.8rem', fontWeight: '700', color: '#e5e7eb', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                {vehiculoSeleccionado.marca} {vehiculoSeleccionado.modelo}
                                                            </div>
                                                            <div style={{ display: 'flex', gap: '0.6rem', fontSize: '0.6rem', color: '#6b7280', marginTop: '2px' }}>
                                                                <span>{vehiculoSeleccionado.matricula}</span>
                                                                <span>•</span>
                                                                <span>{vehiculoSeleccionado.tipoCombustible}</span>
                                                                <span>•</span>
                                                                <span>{vehiculoSeleccionado.kilometraje?.toLocaleString()} km</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                                                    <div>
                                                        <label style={{ fontSize: '0.6rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '0.4rem' }}>Litros</label>
                                                        <input type="number" step="0.1" min="0.1" placeholder="45.0"
                                                            value={refuelData.litros}
                                                            onChange={e => setRefuelData(d => ({ ...d, litros: e.target.value }))}
                                                            style={{ width: '100%', padding: '0.65rem', background: '#0d1117', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', color: '#fff', fontSize: '0.9rem', boxSizing: 'border-box' }} />
                                                    </div>
                                                    <div>
                                                        <label style={{ fontSize: '0.6rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '0.4rem' }}>€/Litro</label>
                                                        <input type="number" step="0.001" min="0.001" placeholder="1.650"
                                                            value={refuelData.precioPorLitro}
                                                            onChange={e => setRefuelData(d => ({ ...d, precioPorLitro: e.target.value }))}
                                                            style={{ width: '100%', padding: '0.65rem', background: '#0d1117', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', color: '#fff', fontSize: '0.9rem', boxSizing: 'border-box' }} />
                                                    </div>
                                                </div>

                                                {costePreview > 0 && (
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.7rem 0.85rem', background: 'linear-gradient(135deg, rgba(245,158,11,0.12), rgba(217,119,6,0.08))', borderRadius: '10px', border: '1px solid rgba(245,158,11,0.25)' }}>
                                                        <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: '600' }}>Coste Total</span>
                                                        <span style={{ fontSize: '1.15rem', fontWeight: '900', color: '#f59e0b', letterSpacing: '-0.3px' }}>€{costePreview.toFixed(2)}</span>
                                                    </div>
                                                )}

                                                <div>
                                                    <label style={{ fontSize: '0.6rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '0.4rem' }}>Km del vehículo <span style={{ color: '#374151' }}>(opcional)</span></label>
                                                    <input type="number" min="0" placeholder="125000"
                                                        value={refuelData.kmActual}
                                                        onChange={e => setRefuelData(d => ({ ...d, kmActual: e.target.value }))}
                                                        style={{ width: '100%', padding: '0.65rem', background: '#0d1117', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', color: '#fff', fontSize: '0.9rem', boxSizing: 'border-box' }} />
                                                </div>

                                                <div>
                                                    <label style={{ fontSize: '0.6rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '0.4rem' }}>Estación <span style={{ color: '#374151' }}>(opcional)</span></label>
                                                    <input type="text" placeholder="Ej: Repsol Autovía A-3"
                                                        value={refuelData.estacion}
                                                        onChange={e => setRefuelData(d => ({ ...d, estacion: e.target.value }))}
                                                        style={{ width: '100%', padding: '0.65rem', background: '#0d1117', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', color: '#fff', fontSize: '0.9rem', boxSizing: 'border-box' }} />
                                                </div>

                                                <button
                                                    onClick={registrarRepostaje}
                                                    style={{ width: '100%', padding: '0.95rem', background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#000', border: 'none', borderRadius: '12px', fontWeight: '900', fontSize: '0.9rem', cursor: 'pointer', boxShadow: '0 4px 14px rgba(245,158,11,0.25)', letterSpacing: '0.3px', transition: 'transform 0.15s, box-shadow 0.15s' }}
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
                                onClick={async () => {
                                    // Mandamos coordenadas si las tenemos para que el admin
                                    // vea EXACTAMENTE dónde estás cuando activaste el SOS.
                                    const sendSos = async (lat?: number, lng?: number) => {
                                        try {
                                            const body: { latitud?: number; longitud?: number } = {};
                                            if (lat != null && lng != null) {
                                                body.latitud = lat;
                                                body.longitud = lng;
                                            }
                                            const res = await fetch(`/api/conductores/me/sos`, {
                                                method: 'POST',
                                                headers: getAuthHeaders(),
                                                body: JSON.stringify(body),
                                            });
                                            const data = await res.json().catch(() => ({}));
                                            if (res.ok) {
                                                toast.error(data.emailEnviado
                                                    ? "🆘 SOS enviado a la central y por correo"
                                                    : "🆘 SOS enviado a la central — te contactarán de inmediato", { duration: 8000 });
                                                if (!data.emailEnviado && data.emailError) {
                                                    toast.warning(`Aviso por correo pendiente: ${data.emailError}`);
                                                }
                                            } else {
                                                toast.error(data.error || "No se pudo notificar el SOS. Llama directamente a la central.");
                                            }
                                        } catch {
                                            toast.error("Sin conexión. Llama al teléfono de la central.");
                                        }
                                    };
                                    if (typeof navigator !== 'undefined' && navigator.geolocation) {
                                        navigator.geolocation.getCurrentPosition(
                                            (pos) => sendSos(pos.coords.latitude, pos.coords.longitude),
                                            () => sendSos(),
                                            { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
                                        );
                                    } else {
                                        await sendSos();
                                    }
                                }}
                                style={{ width: '100%', padding: '1rem', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.18)', borderRadius: '14px', color: '#ef4444', fontWeight: '800', fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', letterSpacing: '0.8px', transition: 'all 0.2s' }}
                            >
                                🆘 EMERGENCIA SOS
                            </button>
                        </div>
                    )}

                    {/* ─── TAB: HISTORIAL ─── */}
                    {activeTab === 'historial' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {/* Resumen del periodo */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.7rem' }}>
                                <div style={{ background: 'rgba(59,246,59,0.06)', border: '1px solid rgba(59,246,59,0.15)', borderRadius: '14px', padding: '0.9rem', textAlign: 'center' }}>
                                    <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#3bf63b', lineHeight: 1 }}>{rutasHistorialFiltradas.length}</div>
                                    <div style={{ fontSize: '0.55rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '0.3rem' }}>Rutas</div>
                                </div>
                                <div style={{ background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.15)', borderRadius: '14px', padding: '0.9rem', textAlign: 'center' }}>
                                    <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#60a5fa', lineHeight: 1 }}>{kmTotalesPeriodo.toFixed(0)}</div>
                                    <div style={{ fontSize: '0.55rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '0.3rem' }}>Km totales</div>
                                </div>
                            </div>

                            {/* Filtros por período */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.4rem' }}>
                                {([
                                    { id: 'hoy', label: 'Hoy' },
                                    { id: 'semana', label: '7d' },
                                    { id: 'mes', label: '30d' },
                                    { id: 'todo', label: 'Todo' },
                                ] as const).map(f => (
                                    <button
                                        key={f.id}
                                        onClick={() => setHistoryFilter(f.id)}
                                        style={{
                                            padding: '0.55rem 0.4rem', borderRadius: '10px',
                                            background: historyFilter === f.id ? 'linear-gradient(135deg, #3bf63b, #22c55e)' : 'rgba(255,255,255,0.03)',
                                            border: `1px solid ${historyFilter === f.id ? 'transparent' : 'rgba(255,255,255,0.06)'}`,
                                            color: historyFilter === f.id ? '#000' : '#9ca3af',
                                            fontWeight: 800, fontSize: '0.7rem', cursor: 'pointer',
                                            letterSpacing: '0.3px', transition: 'all 0.2s',
                                        }}
                                    >
                                        {f.label}
                                    </button>
                                ))}
                            </div>

                            {/* Búsqueda */}
                            <div style={{ position: 'relative' }}>
                                <input
                                    type="search"
                                    value={historySearch}
                                    onChange={e => setHistorySearch(e.target.value)}
                                    placeholder="Buscar por origen o destino..."
                                    style={{
                                        width: '100%', padding: '0.7rem 0.9rem 0.7rem 2.4rem',
                                        background: 'rgba(255,255,255,0.03)',
                                        border: '1px solid rgba(255,255,255,0.06)',
                                        borderRadius: '12px', color: '#e5e7eb',
                                        fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box',
                                    }}
                                />
                                <span style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.85rem', opacity: 0.4, pointerEvents: 'none' }}>🔍</span>
                                {historySearch && (
                                    <button
                                        onClick={() => setHistorySearch('')}
                                        style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.05)', border: 'none', borderRadius: '50%', width: '24px', height: '24px', color: '#6b7280', cursor: 'pointer', fontSize: '0.7rem' }}
                                    >✕</button>
                                )}
                            </div>

                            {/* Lista — agrupada por día */}
                            {rutasHistorialFiltradas.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '3rem 2rem' }}>
                                    <div style={{ fontSize: '2.5rem', opacity: 0.25, marginBottom: '0.75rem' }}>📋</div>
                                    <p style={{ color: '#4b5563', fontSize: '0.9rem', margin: 0, fontWeight: 600 }}>
                                        {historySearch || historyFilter !== 'todo' ? 'Sin resultados' : 'Sin rutas completadas aún'}
                                    </p>
                                    {(historySearch || historyFilter !== 'todo') && (
                                        <button
                                            onClick={() => { setHistorySearch(''); setHistoryFilter('todo'); }}
                                            style={{ marginTop: '0.8rem', padding: '0.5rem 1rem', background: 'rgba(59,246,59,0.08)', border: '1px solid rgba(59,246,59,0.2)', borderRadius: '8px', color: '#3bf63b', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer' }}
                                        >
                                            Limpiar filtros
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    {Object.entries(
                                        rutasHistorialFiltradas
                                            .slice()
                                            .sort((a, b) => (new Date(b.fecha || 0).getTime()) - (new Date(a.fecha || 0).getTime()))
                                            .reduce<Record<string, Ruta[]>>((acc, r) => {
                                                const key = r.fecha ? new Date(r.fecha).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Sin fecha';
                                                (acc[key] = acc[key] || []).push(r);
                                                return acc;
                                            }, {})
                                    ).map(([dia, items]) => (
                                        <div key={dia}>
                                            <div style={{ fontSize: '0.6rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 700, marginBottom: '0.5rem', paddingLeft: '0.2rem' }}>
                                                {dia} <span style={{ color: '#374151', fontWeight: 500 }}>· {items.length} {items.length === 1 ? 'ruta' : 'rutas'}</span>
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                                {items.map(r => (
                                                    <div key={r.id} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '14px', padding: '0.9rem 1rem', borderLeft: '3px solid rgba(59,246,59,0.5)' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                                                            <span style={{ fontSize: '0.55rem', color: '#3bf63b', fontWeight: 800, background: 'rgba(59,246,59,0.1)', padding: '0.18rem 0.5rem', borderRadius: '99px' }}>✓ COMPLETADA</span>
                                                            <span style={{ fontSize: '0.55rem', color: '#374151', fontFamily: 'monospace' }}>#{r.id?.slice(-6).toUpperCase()}</span>
                                                        </div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', overflow: 'hidden', marginBottom: '0.35rem' }}>
                                                            <span style={{ fontSize: '0.85rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '42%' }}>{r.origen}</span>
                                                            <span style={{ color: '#374151', fontSize: '0.8rem', flexShrink: 0 }}>→</span>
                                                            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '42%' }}>{r.destino}</span>
                                                        </div>
                                                        <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
                                                            <span style={{ fontSize: '0.65rem', color: '#6b7280', fontWeight: 600 }}>{r.distanciaEstimadaKm} km</span>
                                                            {r.fecha && <span style={{ fontSize: '0.6rem', color: '#4b5563' }}>{new Date(r.fecha).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</span>}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ─── TAB: CHAT ─── */}
                    {activeTab === 'chat' && (
                        // En chat hacemos layout vertical full-height: la card de
                        // connection info no crece, y el ChatRuta ocupa TODO el
                        // espacio que sobre. Resultado: el chat se siente nativo
                        // tanto en móvil como en tablet, sin caps artificiales.
                        <div style={{
                            display: 'flex', flexDirection: 'column', gap: '0.75rem',
                            height: '100%', minHeight: 0
                        }}>
                            {/* Connection info — altura fija */}
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '0.6rem',
                                padding: '0.7rem 0.9rem', borderRadius: '14px',
                                background: 'rgba(59,246,59,0.04)', border: '1px solid rgba(59,246,59,0.12)',
                                flexShrink: 0,
                            }}>
                                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'linear-gradient(135deg, #3bf63b, #22c55e)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: '900', color: '#000', flexShrink: 0 }}>🏢</div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '0.78rem', fontWeight: '700', color: '#e5e7eb' }}>Soporte Admin</div>
                                    <div style={{ fontSize: '0.6rem', color: '#4b5563' }}>
                                        {rutaActiva ? `Ruta #${rutaActiva.id?.slice(-6).toUpperCase()}` : 'Canal general'}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(59,246,59,0.08)', padding: '0.2rem 0.5rem', borderRadius: '99px', border: '1px solid rgba(59,246,59,0.2)' }}>
                                    <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#3bf63b', boxShadow: '0 0 6px #3bf63b' }} />
                                    <span style={{ fontSize: '0.55rem', color: '#3bf63b', fontWeight: '700' }}>CONECTADO</span>
                                </div>
                            </div>
                            {/* Chat component — toma toda la altura sobrante */}
                            <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
                                <ChatRuta
                                    rutaId={rutaActiva?.id || (rutasPendientes.length > 0 ? rutasPendientes[0].id : "testing_room")}
                                    rol="CONDUCTOR"
                                    fillParent
                                />
                            </div>
                        </div>
                    )}

                    {/* ─── TAB: PERFIL ─── */}
                    {activeTab === 'perfil' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                            {/* Hidden file input for profile photo */}
                            <input
                                ref={profileFileRef}
                                type="file"
                                accept="image/*"
                                onChange={handleProfilePhoto}
                                style={{ display: 'none' }}
                            />
                            {/* Avatar with camera overlay */}
                            <div style={{ textAlign: 'center', paddingTop: '0.5rem' }}>
                                <div
                                    onClick={() => profileFileRef.current?.click()}
                                    style={{
                                        width: '90px', height: '90px', borderRadius: '50%', margin: '0 auto 0.75rem',
                                        position: 'relative', cursor: 'pointer',
                                        background: profilePhoto ? 'transparent' : 'linear-gradient(135deg, rgba(59,246,59,0.15), rgba(34,197,94,0.08))',
                                        border: `3px solid ${isOnline ? 'rgba(59,246,59,0.5)' : 'rgba(107,114,128,0.3)'}`,
                                        overflow: 'hidden', transition: 'border-color 0.3s, transform 0.2s',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}
                                >
                                    {profilePhoto ? (
                                        <img
                                            src={profilePhoto}
                                            alt=""
                                            referrerPolicy="no-referrer"
                                            onError={() => {
                                                setProfilePhoto(null);
                                                if (typeof window !== 'undefined') {
                                                    localStorage.removeItem('profilePhoto');
                                                }
                                            }}
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                        />
                                    ) : (
                                        <span style={{ fontSize: '2rem', fontWeight: '900', color: '#3bf63b' }}>
                                            {getInitials(driverUser?.nombre, driverUser?.email)}
                                        </span>
                                    )}
                                    {/* Camera overlay */}
                                    <div style={{
                                        position: 'absolute', bottom: 0, left: 0, right: 0,
                                        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
                                        padding: '0.25rem 0', textAlign: 'center',
                                        fontSize: '0.65rem', color: '#fff', fontWeight: '600',
                                    }}>
                                        📷
                                    </div>
                                </div>
                                <h2 style={{ fontSize: '1.1rem', fontWeight: '800', margin: '0 0 0.2rem', color: '#fff' }}>
                                    {driverUser?.nombre || 'Conductor'}
                                </h2>
                                <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '0 0 0.4rem' }}>
                                    {driverUser?.email || ''}
                                </p>
                                <span style={{ fontSize: '0.6rem', color: isOnline ? '#3bf63b' : '#6b7280', fontWeight: '700', background: isOnline ? 'rgba(59,246,59,0.1)' : 'rgba(255,255,255,0.03)', padding: '0.2rem 0.7rem', borderRadius: '99px', border: `1px solid ${isOnline ? 'rgba(59,246,59,0.2)' : 'rgba(107,114,128,0.2)'}` }}>
                                    {isOnline ? '● EN LÍNEA' : '○ DESCONECTADO'}
                                </span>
                            </div>

                            {/* Stats */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                {[
                                    { label: 'Completadas', value: rutasCompletadas.length, color: '#3bf63b', icon: '✓' },
                                    { label: 'KM Totales', value: `${rutasCompletadas.reduce((acc, r) => acc + r.distanciaEstimadaKm, 0).toFixed(0)}`, color: '#60a5fa', icon: '🛣' },
                                    { label: 'En progreso', value: rutasEnProgresoCount, color: '#f59e0b', icon: '⚡' },
                                    { label: 'Tiempo activo', value: elapsedSeconds > 0 ? formatElapsed(elapsedSeconds) : '—', color: '#a78bfa', icon: '⏱' },
                                ].map((s, i) => (
                                    <div key={i} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', padding: '1rem', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
                                        <div style={{ position: 'absolute', top: '-5px', right: '-5px', width: '40px', height: '40px', background: `radial-gradient(circle, ${s.color}15 0%, transparent 70%)` }} />
                                        <div style={{ fontSize: '0.8rem', marginBottom: '0.4rem', opacity: 0.5 }}>{s.icon}</div>
                                        <div style={{ fontSize: '1.4rem', fontWeight: '900', color: s.color, lineHeight: 1.1 }}>{s.value}</div>
                                        <div style={{ fontSize: '0.58rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.3px', marginTop: '0.3rem' }}>{s.label}</div>
                                    </div>
                                ))}
                            </div>

                            {/* Quick Actions */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                                <button
                                    onClick={() => profileFileRef.current?.click()}
                                    style={{ padding: '0.9rem', background: 'rgba(96,165,250,0.07)', border: '1px solid rgba(96,165,250,0.2)', borderRadius: '14px', color: '#60a5fa', fontWeight: '700', fontSize: '0.78rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                                >📷 Cambiar Foto</button>
                                <button
                                    onClick={() => setActiveTab('chat')}
                                    style={{ padding: '0.9rem', background: 'rgba(59,246,59,0.07)', border: '1px solid rgba(59,246,59,0.2)', borderRadius: '14px', color: '#3bf63b', fontWeight: '700', fontSize: '0.78rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                                >💬 Abrir Chat</button>
                            </div>

                            {/* Info */}
                            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '16px', padding: '1rem', overflow: 'hidden' }}>
                                <h3 style={{ fontSize: '0.7rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 0.75rem', fontWeight: '700' }}>Información</h3>
                                {[
                                    { label: 'Nombre', value: driverUser?.nombre || '—' },
                                    { label: 'Email', value: driverUser?.email || '—' },
                                    { label: 'Rol', value: driverUser?.rol || 'CONDUCTOR' },
                                    { label: 'ID', value: `#${driverUser?.id?.slice(-8).toUpperCase() || '—'}` },
                                ].map((row, i) => (
                                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.65rem 0', borderBottom: i < 3 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                                        <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>{row.label}</span>
                                        <span style={{ fontSize: '0.8rem', fontWeight: '600', color: '#e5e7eb', maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>{row.value}</span>
                                    </div>
                                ))}
                            </div>

                            {/* Vincular a empresa */}
                            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '16px', padding: '1rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showEmpresaForm ? '0.75rem' : 0 }}>
                                    <div>
                                        <div style={{ fontSize: '0.7rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '700' }}>Empresa vinculada</div>
                                        <div style={{ fontSize: '0.85rem', fontWeight: '700', color: driverUser?.nombreEmpresa ? '#e5e7eb' : '#4b5563', marginTop: '2px' }}>
                                            {driverUser?.nombreEmpresa || 'Sin empresa'}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setShowEmpresaForm(v => !v)}
                                        style={{ padding: '0.35rem 0.75rem', background: 'rgba(59,246,59,0.08)', border: '1px solid rgba(59,246,59,0.2)', borderRadius: '8px', color: '#3bf63b', fontSize: '0.7rem', fontWeight: '700', cursor: 'pointer' }}
                                    >{showEmpresaForm ? 'Cancelar' : 'Cambiar'}</button>
                                </div>
                                {showEmpresaForm && (
                                    <form onSubmit={cambiarEmpresa} style={{ display: 'flex', gap: '0.5rem' }}>
                                        <input
                                            type="email"
                                            required
                                            placeholder="admin@empresa.com"
                                            value={empresaEmailInput}
                                            onChange={e => setEmpresaEmailInput(e.target.value)}
                                            disabled={empresaLoading}
                                            style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(59,246,59,0.3)', borderRadius: '8px', padding: '0.5rem 0.75rem', color: '#e5e7eb', fontSize: '0.8rem', outline: 'none' }}
                                        />
                                        <button
                                            type="submit"
                                            disabled={empresaLoading}
                                            style={{ padding: '0.5rem 1rem', background: 'linear-gradient(135deg,#3bf63b,#22c55e)', border: 'none', borderRadius: '8px', color: '#000', fontWeight: '800', fontSize: '0.75rem', cursor: 'pointer' }}
                                        >{empresaLoading ? '...' : 'Unirse'}</button>
                                    </form>
                                )}
                            </div>

                            {/* Configuración */}
                            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '16px', padding: '0.4rem', overflow: 'hidden' }}>
                                {[
                                    {
                                        icon: '🔒', label: 'Política de Privacidad',
                                        sub: 'Cómo tratamos tus datos',
                                        action: () => {
                                            const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/privacy`;
                                            openExternal(url);
                                        },
                                    },
                                    {
                                        icon: '✉️', label: 'Contactar soporte',
                                        sub: 'Reporta un problema o sugerencia',
                                        action: () => {
                                            setSupportSubject(v => v || 'Soporte desde CarCare Driver');
                                            setShowSupportForm(v => !v);
                                        },
                                    },
                                    {
                                        icon: '🔄', label: 'Recargar datos',
                                        sub: 'Forzar sincronización con la central',
                                        action: () => { setLoading(true); cargarRutas(); toast.success('Sincronizando...'); },
                                    },
                                ].map((row, i, arr) => (
                                    <button
                                        key={i}
                                        onClick={row.action}
                                        style={{
                                            width: '100%', display: 'flex', alignItems: 'center', gap: '0.75rem',
                                            padding: '0.85rem 0.7rem', background: 'transparent', border: 'none', cursor: 'pointer',
                                            borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                                            textAlign: 'left',
                                        }}
                                    >
                                        <span style={{ fontSize: '1.1rem', width: '32px', height: '32px', borderRadius: '10px', background: 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{row.icon}</span>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#e5e7eb' }}>{row.label}</div>
                                            <div style={{ fontSize: '0.62rem', color: '#6b7280', marginTop: '1px' }}>{row.sub}</div>
                                        </div>
                                        <span style={{ color: '#4b5563', fontSize: '0.85rem', flexShrink: 0 }}>›</span>
                                    </button>
                                ))}
                            </div>

                            {showSupportForm && (
                                <form onSubmit={enviarSoporte} style={{ background: 'rgba(59,246,59,0.04)', border: '1px solid rgba(59,246,59,0.14)', borderRadius: '16px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    <div>
                                        <div style={{ fontSize: '0.72rem', color: '#3bf63b', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Soporte directo</div>
                                        <div style={{ fontSize: '0.68rem', color: '#6b7280', marginTop: '0.2rem' }}>
                                            Esto le llega a la central dentro del panel. Si el email est\u00e1 configurado, tambi\u00e9n sale por correo.
                                        </div>
                                    </div>
                                    <input
                                        type="text"
                                        value={supportSubject}
                                        onChange={e => setSupportSubject(e.target.value)}
                                        placeholder="Asunto"
                                        disabled={supportLoading}
                                        style={{ width: '100%', padding: '0.7rem 0.8rem', background: '#0d1117', border: '1px solid rgba(59,246,59,0.18)', borderRadius: '10px', color: '#e5e7eb', fontSize: '0.82rem', outline: 'none', boxSizing: 'border-box' }}
                                    />
                                    <textarea
                                        value={supportMessage}
                                        onChange={e => setSupportMessage(e.target.value)}
                                        placeholder="Describe el fallo, qué estabas haciendo y si tienes una ruta activa."
                                        disabled={supportLoading}
                                        rows={5}
                                        style={{ width: '100%', resize: 'vertical', minHeight: '120px', padding: '0.8rem', background: '#0d1117', border: '1px solid rgba(59,246,59,0.18)', borderRadius: '12px', color: '#e5e7eb', fontSize: '0.82rem', outline: 'none', boxSizing: 'border-box', lineHeight: 1.5 }}
                                    />
                                    <div style={{ fontSize: '0.62rem', color: '#4b5563' }}>
                                        {rutaActiva ? `Se adjunta el contexto de la ruta #${rutaActiva.id?.slice(-6).toUpperCase()}.` : 'Se envía como soporte general si no tienes una ruta en progreso.'}
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                                        <button
                                            type="button"
                                            onClick={() => setShowSupportForm(false)}
                                            disabled={supportLoading}
                                            style={{ padding: '0.85rem', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', color: '#9ca3af', fontWeight: '700', fontSize: '0.78rem', cursor: 'pointer' }}
                                        >Cancelar</button>
                                        <button
                                            type="submit"
                                            disabled={supportLoading}
                                            style={{ padding: '0.85rem', background: 'linear-gradient(135deg, #3bf63b, #22c55e)', border: 'none', borderRadius: '12px', color: '#000', fontWeight: '900', fontSize: '0.78rem', cursor: 'pointer', boxShadow: '0 8px 22px -12px rgba(59,246,59,0.55)' }}
                                        >{supportLoading ? 'Enviando...' : 'Enviar soporte'}</button>
                                    </div>
                                </form>
                            )}

                            {/* Logout */}
                            <button
                                onClick={() => {
                                    if (rutaActiva) {
                                        if (!confirm('Tenés una ruta activa. ¿Cerrar sesión igual?')) return;
                                        stopRouteTracking();
                                    }
                                    localStorage.removeItem("user");
                                    localStorage.removeItem("token");
                                    localStorage.removeItem("profilePhoto");
                                    router.push("/conductor/login");
                                }}
                                style={{ width: '100%', padding: '1rem', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.18)', borderRadius: '14px', color: '#ef4444', fontWeight: '700', fontSize: '0.875rem', cursor: 'pointer', letterSpacing: '0.3px' }}
                            >{t.auth.logout}</button>

                            {/* Footer con versión */}
                            <div style={{ textAlign: 'center', padding: '0.5rem 0 1rem', color: '#374151', fontSize: '0.6rem' }}>
                                <p style={{ margin: '0 0 0.2rem', letterSpacing: '0.5px', fontWeight: 700 }}>./CarCare Driver</p>
                                <p style={{ margin: 0 }}>v1.0.0 · {new Date().getFullYear()}</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* BOTTOM NAVIGATION */}
                <nav style={{
                    position: 'fixed', bottom: 0, left: 0, right: 0,
                    // Sólido para que ninguna tarjeta del scroll se confunda con el nav.
                    background: 'rgba(4,5,10,0.99)', backdropFilter: 'blur(24px)',
                    borderTop: '1px solid rgba(255,255,255,0.07)',
                    display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
                    padding: '0.55rem 0 calc(0.55rem + env(safe-area-inset-bottom, 0px))',
                    zIndex: 50,
                    boxShadow: '0 -4px 14px -8px rgba(0,0,0,0.6)'
                }}>
                    {([
                        { id: 'inicio', label: 'Inicio', icon: (a: boolean) => (
                            <svg width="21" height="21" viewBox="0 0 24 24" fill={a ? '#3bf63b' : 'none'} stroke={a ? '#3bf63b' : '#4b5563'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                        )},
                        { id: 'historial', label: 'Historial', icon: (a: boolean) => (
                            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={a ? '#3bf63b' : '#4b5563'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                        )},
                        { id: 'chat', label: 'Chat', icon: (a: boolean) => (
                            <svg width="21" height="21" viewBox="0 0 24 24" fill={a ? 'rgba(59,246,59,0.15)' : 'none'} stroke={a ? '#3bf63b' : '#4b5563'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                        )},
                        { id: 'perfil', label: 'Perfil', icon: (a: boolean) => (
                            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={a ? '#3bf63b' : '#4b5563'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                        )},
                    ] satisfies Array<{ id: DriverTab; label: string; icon: (active: boolean) => ReactNode }>).map(tab => {
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                style={{
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
                                    padding: '0.35rem 0', background: 'none', border: 'none', cursor: 'pointer',
                                    color: isActive ? '#3bf63b' : '#4b5563',
                                    transition: 'all 0.2s ease',
                                    WebkitTapHighlightColor: 'transparent',
                                    position: 'relative',
                                }}
                            >
                                <div style={{
                                    padding: '0.3rem 0.9rem', borderRadius: '12px',
                                    background: isActive ? 'rgba(59,246,59,0.08)' : 'transparent',
                                    transition: 'background 0.25s ease',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    position: 'relative',
                                }}>
                                    {tab.icon(isActive)}
                                    {tab.id === 'chat' && unreadMessages > 0 && !isActive && (
                                        <span style={{
                                            position: 'absolute', top: '-2px', right: '4px',
                                            minWidth: '16px', height: '16px',
                                            background: '#ef4444',
                                            borderRadius: '99px',
                                            fontSize: '0.5rem', fontWeight: 900, color: '#fff',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            padding: '0 4px',
                                            border: '2px solid rgba(6,6,12,0.97)',
                                            boxShadow: '0 0 8px rgba(239,68,68,0.5)',
                                        }}>
                                            {unreadMessages > 9 ? '9+' : unreadMessages}
                                        </span>
                                    )}
                                </div>
                                <span style={{
                                    fontSize: '0.52rem', fontWeight: isActive ? '800' : '500',
                                    letterSpacing: '0.2px', transition: 'all 0.2s',
                                    color: isActive ? '#3bf63b' : '#6b7280',
                                }}>
                                    {tab.label}
                                </span>
                            </button>
                        );
                    })}
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
                * { -webkit-tap-highlight-color: transparent; }
                input, select { font-family: inherit; }
            `}</style>
        </BackgroundMeteors>
    );
}
