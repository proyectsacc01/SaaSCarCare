"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import styles from "./page.module.css";
import BackgroundMeteors from "@/componentes/BackgroundMeteors";
import LocationInput from "@/componentes/LocationInput";
import AlertasPanel from "@/componentes/AlertasPanel";
import ConfiguracionPanel from "@/componentes/ConfiguracionPanel";
import LanguageSwitcher from "@/componentes/LanguageSwitcher";
import WavyButton from "@/components/ui/wavy-button";
import { useI18n } from "@/lib/i18n";
import { formatConnectionStateLabel, formatRouteStateLabel } from "@/lib/status-labels";
import dynamic from "next/dynamic";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar
} from "recharts";

interface Vehiculo {
  id: string;
  matricula: string;
  marca: string;
  modelo: string;
  kilometraje: number;
  tipoCombustible: string;
  combustibleActual: number;  // Porcentaje (0–100%)
  capacidadDeposito?: number; // Litros totales del depósito (ej: 60)
  consumoPor100km?: number;   // L/100km — calculado automáticamente, no editable
  costeKmReferencia?: number; // €/km presupuestado de referencia
  activo: boolean;
}

interface Ruta {
  id?: string;
  origen: string;
  destino: string;
  distanciaEstimadaKm: number;
  estado: string;
  vehiculoId: string;
  conductorId?: string;
  conductorNombre?: string;
  fecha: string;
  latitudOrigen?: number;
  longitudOrigen?: number;
  latitudDestino?: number;
  longitudDestino?: number;
  latitudActual?: number;
  longitudActual?: number;
  velocidadActualKmh?: number;
  distanciaRecorridaKm?: number;
  distanciaRestanteKm?: number;
  desviado?: boolean;
  ultimaActualizacionGPS?: string;
  signalSource?: 'route' | 'presence';
}

interface Repostaje {
  id: string;
  fecha: string;
  litros: number;
  precioPorLitro: number;
  costeTotal: number;
  kilometrajeActual: number;
  vehiculoId: string;
}

interface Conductor {
  id: string;
  nombre: string;
  email: string;
}

interface ConductorUbicacion {
  id: string;
  nombre: string;
  email: string;
  latitudActual?: number;
  longitudActual?: number;
  ultimaActualizacionGPS?: string;
}

interface MantenimientoItem {
  id: string;
  vehiculoId: string;
  tipo: string;
  descripcion?: string;
  fecha: string;
  costo?: number;
  kilometrajeRealizado?: number;
}

interface VehiculoKpi {
  vehiculoId: string;
  vehiculo: string;
  matricula: string;
  activo: boolean;
  costeTotalSemestre: number;
  costeCombustible: number;
  costeMantenimiento: number;
  costePorKm: number;
  litrosPor100Km: number;
  kmTotales: number;
  litrosTotales: number;
}

interface TendenciaMes {
  mes: string;
  periodo: string;
  costeCombustible: number;
  costeMantenimiento: number;
  costeTotal: number;
  kmRecorridos: number;
  litros: number;
  costePorKm: number;
}

interface FlotaKpis {
  totalVehiculos: number;
  costeTotalFlota: number;
  kmTotalesFlota: number;
  costePorKmFlota: number;
  vehiculos: VehiculoKpi[];
  tendenciaMensual: TendenciaMes[];
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

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

async function estimateRouteDistanceKm(origin: { lat: number; lng: number }, destination: { lat: number; lng: number }) {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=false`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      const roadMeters = data?.routes?.[0]?.distance;
      if (typeof roadMeters === 'number' && Number.isFinite(roadMeters) && roadMeters > 0) {
        return roadMeters / 1000;
      }
    }
  } catch {
    // fallback a Haversine
  }
  return haversineKm(origin, destination);
}

// Dynamic import para el mapa de tracking global (evitar SSR)
const MapTrackingGlobal = dynamic(() => import("@/componentes/MapTrackingGlobal"), {
  ssr: false,
  loading: () => (
    <div style={{
      height: "500px",
      background: "rgba(0,0,0,0.5)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: "16px",
      color: "#888"
    }}>
      Cargando mapa...
    </div>
  )
});

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://saascarcare-production.up.railway.app";

const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const EMISSION_FACTORS_KG_CO2_PER_LITER: Record<string, number> = {
  gasolina: 2.31,
  diesel: 2.68,
  hibrido: 2.31,
  electrico: 0,
};

function normalizeFuelType(tipoCombustible?: string) {
  return (tipoCombustible ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function getEmissionFactorKgCO2PerLiter(tipoCombustible?: string) {
  const normalized = normalizeFuelType(tipoCombustible);
  return EMISSION_FACTORS_KG_CO2_PER_LITER[normalized] ?? EMISSION_FACTORS_KG_CO2_PER_LITER.gasolina;
}

function formatEmissionValue(kgCO2: number, locale: string) {
  if (!Number.isFinite(kgCO2) || kgCO2 <= 0) return '0 kg CO₂';
  if (kgCO2 >= 1000) {
    return `${(kgCO2 / 1000).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} t CO₂`;
  }
  return `${Math.round(kgCO2).toLocaleString(locale)} kg CO₂`;
}

export default function Dashboard() {
  const router = useRouter();
  const { t, locale } = useI18n();

  const [activeTab, setActiveTab] = useState<'flota' | 'nuevo' | 'rutas' | 'estadisticas' | 'tracking' | 'costes'>('flota');
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [rutas, setRutas] = useState<Ruta[]>([]);
  const [conductores, setConductores] = useState<Conductor[]>([]);
  const [conductoresUbicaciones, setConductoresUbicaciones] = useState<ConductorUbicacion[]>([]);
  const [repostajes, setRepostajes] = useState<Repostaje[]>([]);
  const [mantenimientos, setMantenimientos] = useState<MantenimientoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [enviandoReporte, setEnviandoReporte] = useState(false);

  // Helper to get auth headers
  const getAuthHeaders = useCallback((): Record<string, string> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (typeof window === 'undefined') return headers;

    const token = localStorage.getItem("token");
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }, []);

  // Check auth
  useEffect(() => {
    const userStr = localStorage.getItem("user");
    if (!userStr) {
      router.push("/login");
    }
  }, [router]);

  const handleLogout = () => {
    // Check if user is conductor to redirect correctly
    try {
      const userStr = localStorage.getItem("user");
      if (userStr) {
        const user = JSON.parse(userStr);
        localStorage.removeItem("user");
        localStorage.removeItem("token");
        toast.info(t.dashboard.sessionClosed);
        if (user.role === 'CONDUCTOR') {
          router.push("/conductor/login");
          return;
        }
      }
    } catch (e) {
      localStorage.removeItem("user");
      localStorage.removeItem("token");
    }

    router.push("/login");
  };

  // Helper para calcular estado de conexión del conductor
  const getConnectionStatus = (timestamp: string | undefined, hasActiveGPS: boolean = false) => {
    if (!timestamp && hasActiveGPS) {
      return { status: 'online' as const, text: 'GPS activo', label: formatConnectionStateLabel('online'), color: '#22c55e' };
    }

    if (!timestamp) return { status: 'offline' as const, text: 'Sin señal', label: formatConnectionStateLabel('offline'), color: '#6b7280' };

    const now = new Date();
    const lastUpdate = new Date(timestamp);
    const diffSeconds = Math.floor((now.getTime() - lastUpdate.getTime()) / 1000);

    if (diffSeconds <= 45) {
      return {
        status: 'online' as const,
        text: diffSeconds < 5 ? 'Ahora' : `${t.dashboard.ago} ${diffSeconds}${t.dashboard.sec}`,
        label: formatConnectionStateLabel('online'),
        color: '#22c55e'
      };
    } else if (diffSeconds <= 180) {

      const mins = Math.floor(diffSeconds / 60);
      return {
        status: 'idle' as const,
        text: mins > 0 ? `${t.dashboard.ago} ${mins}${t.dashboard.min} ${diffSeconds % 60}${t.dashboard.sec}` : `${t.dashboard.ago} ${diffSeconds}${t.dashboard.sec}`,
        label: formatConnectionStateLabel('idle'),
        color: '#f59e0b'
      };
    } else {
      const mins = Math.floor(diffSeconds / 60);
      return {
        status: 'offline' as const,
        text: mins < 60 ? `${t.dashboard.ago} ${mins} ${t.dashboard.min}` : `${t.dashboard.ago} ${Math.floor(mins / 60)}${t.dashboard.h}`,
        label: formatConnectionStateLabel('offline'),
        color: '#6b7280'
      };
    }
  };

  const conductoresUbicacionMap = useMemo(() => {
    return new Map(conductoresUbicaciones.map((c) => [c.id, c]));
  }, [conductoresUbicaciones]);

  const rutasTrackingActivas = useMemo(() => {
    return rutas
      .filter((r) => isInProgressRoute(r.estado))
      .map((ruta) => {
        const presencia = ruta.conductorId ? conductoresUbicacionMap.get(ruta.conductorId) : undefined;
        const routeTs = ruta.ultimaActualizacionGPS ? new Date(ruta.ultimaActualizacionGPS).getTime() : 0;
        const presenceTs = presencia?.ultimaActualizacionGPS ? new Date(presencia.ultimaActualizacionGPS).getTime() : 0;
        const usarPresencia = !!presencia && presenceTs > routeTs;

        if (!usarPresencia) {
          return { ...ruta, signalSource: 'route' as const };
        }

        return {
          ...ruta,
          latitudActual: presencia?.latitudActual ?? ruta.latitudActual,
          longitudActual: presencia?.longitudActual ?? ruta.longitudActual,
          ultimaActualizacionGPS: presencia?.ultimaActualizacionGPS ?? ruta.ultimaActualizacionGPS,
          signalSource: 'presence' as const,
        };
      });
  }, [rutas, conductoresUbicacionMap]);

  // ═══ DATOS PARA ESTADÍSTICAS ═══
  // Datos manuales persistidos en localStorage (el usuario puede editar desde la UI)
  const [datosManual, setDatosManual] = useState<number[]>(() => {
    if (typeof window === 'undefined') return new Array(12).fill(0);
    try {
      const saved = localStorage.getItem('carcare_consumo_manual');
      return saved ? JSON.parse(saved) : new Array(12).fill(0);
    } catch { return new Array(12).fill(0); }
  });

  const [editandoMes, setEditandoMes] = useState<number | null>(null);
  const [inputConsumo, setInputConsumo] = useState('');
  const vehiculosPorId = useMemo(() => new Map(vehiculos.map((vehiculo) => [vehiculo.id, vehiculo])), [vehiculos]);

  const guardarDatoManual = (mesIndex: number, valor: number) => {
    const nuevo = [...datosManual];
    nuevo[mesIndex] = valor;
    setDatosManual(nuevo);
    localStorage.setItem('carcare_consumo_manual', JSON.stringify(nuevo));
    setEditandoMes(null);
    setInputConsumo('');
    toast.success(`Consumo de ${nombresMeses[mesIndex]} actualizado`);
  };

  const nombresMeses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const mesActual = new Date().getMonth();

  const factorEmisionPromedioFlota = useMemo(() => {
    let litrosReales = 0;
    let emisionesReales = 0;

    repostajes.forEach((rep) => {
      const litros = Number(rep.litros) || 0;
      if (litros <= 0) return;
      const vehiculo = vehiculosPorId.get(rep.vehiculoId);
      const factor = getEmissionFactorKgCO2PerLiter(vehiculo?.tipoCombustible);
      litrosReales += litros;
      emisionesReales += litros * factor;
    });

    if (litrosReales > 0) return emisionesReales / litrosReales;

    const factoresCombustion = vehiculos
      .map((vehiculo) => getEmissionFactorKgCO2PerLiter(vehiculo.tipoCombustible))
      .filter((factor) => factor > 0);

    if (factoresCombustion.length > 0) {
      return factoresCombustion.reduce((acc, factor) => acc + factor, 0) / factoresCombustion.length;
    }

    return EMISSION_FACTORS_KG_CO2_PER_LITER.gasolina;
  }, [repostajes, vehiculos, vehiculosPorId]);

  const datosGrafico = useMemo(() => {
    const añoActual = new Date().getFullYear();
    const consumoPorMes = new Array(12).fill(0);
    const emisionesPorMes = new Array(12).fill(0);

    // 1. Datos reales desde repostajes
    repostajes.forEach(rep => {
      if (!rep.fecha) return;
      const d = new Date(rep.fecha);
      if (d.getFullYear() === añoActual) {
        const litros = Number(rep.litros) || 0;
        consumoPorMes[d.getMonth()] += litros;
        const vehiculo = vehiculosPorId.get(rep.vehiculoId);
        const factor = getEmissionFactorKgCO2PerLiter(vehiculo?.tipoCombustible);
        emisionesPorMes[d.getMonth()] += litros * factor;
      }
    });

    // 2. Datos estimados desde rutas completadas (si no hay repostajes ese mes)
    rutas.forEach(r => {
      if (!r.fecha || normalizeRouteState(r.estado) !== 'COMPLETADA') return;
      const d = new Date(r.fecha);
      if (d.getFullYear() === añoActual) {
        // Solo estimar si no hay repostajes reales ese mes
        if (consumoPorMes[d.getMonth()] === 0) {
          // SOLO km reales (GPS). Sin GPS → 0 km.
          const kmRuta = r.distanciaRecorridaKm ?? 0;
          const litrosEstimados = (kmRuta / 100) * 8;
          consumoPorMes[d.getMonth()] += litrosEstimados;
          const vehiculo = vehiculosPorId.get(r.vehiculoId);
          const factor = getEmissionFactorKgCO2PerLiter(vehiculo?.tipoCombustible);
          emisionesPorMes[d.getMonth()] += litrosEstimados * factor;
        }
      }
    });

    // 3. Datos manuales (sobreescriben si el usuario los puso)
    datosManual.forEach((val, i) => {
      if (val > 0) {
        consumoPorMes[i] = val;
        emisionesPorMes[i] = val * factorEmisionPromedioFlota;
      }
    });

    // 4. Generar predicción (media móvil de 3 meses anteriores con datos)
    return nombresMeses.map((mes, i) => {
      const consumo = Math.round(consumoPorMes[i] * 10) / 10;
      const emisiones = Math.round(emisionesPorMes[i] * 10) / 10;

      // Predicción: promedio de los últimos 3 meses con datos
      const mesesAnteriores: number[] = [];
      const emisionesMesesAnteriores: number[] = [];
      for (let j = 1; j <= 3; j++) {
        if (i - j >= 0 && consumoPorMes[i - j] > 0) {
          mesesAnteriores.push(consumoPorMes[i - j]);
          emisionesMesesAnteriores.push(emisionesPorMes[i - j]);
        }
      }

      let prediccion = 0;
      if (mesesAnteriores.length > 0) {
        prediccion = mesesAnteriores.reduce((a, b) => a + b, 0) / mesesAnteriores.length;
      }

      let prediccionEmisiones = 0;
      if (emisionesMesesAnteriores.length > 0) {
        prediccionEmisiones = emisionesMesesAnteriores.reduce((a, b) => a + b, 0) / emisionesMesesAnteriores.length;
      }

      // Para el mes actual: proyectar el consumo parcial al mes completo
      if (i === mesActual && consumo > 0) {
        const diaActual = new Date().getDate();
        const diasEnMes = new Date(new Date().getFullYear(), i + 1, 0).getDate();
        const proyeccion = (consumo / Math.max(1, diaActual)) * diasEnMes;
        if (proyeccion > prediccion) prediccion = proyeccion;

        const factorMesActual = emisiones > 0 ? emisiones / consumo : factorEmisionPromedioFlota;
        const proyeccionEmisiones = proyeccion * factorMesActual;
        if (proyeccionEmisiones > prediccionEmisiones) prediccionEmisiones = proyeccionEmisiones;
      }

      return {
        mes,
        consumo,
        emisiones,
        prediccion: Math.round(prediccion * 10) / 10,
        prediccionEmisiones: Math.round(prediccionEmisiones * 10) / 10,
        esMesActual: i === mesActual,
        esManual: datosManual[i] > 0,
      };
    });
  }, [rutas, repostajes, datosManual, factorEmisionPromedioFlota, mesActual, nombresMeses, vehiculosPorId]);

  // KPIs calculados
  const mesesConDatos = datosGrafico.filter(d => d.consumo > 0).length;

  const emisionesTotales = datosGrafico.reduce((acc, dato) => acc + (dato.emisiones || 0), 0);
  const emisionesMedias = mesesConDatos > 0
    ? emisionesTotales / mesesConDatos
    : 63 * factorEmisionPromedioFlota;
     
  const mesesConDatosDisplay = mesesConDatos > 0 ? mesesConDatos : 4;

  const emisionesMesActual = datosGrafico[mesActual]?.emisiones || 0;

  const prediccionEmisionesMesActual = (datosGrafico[mesActual]?.prediccionEmisiones || 0) > 0
    ? datosGrafico[mesActual]?.prediccionEmisiones
    : 660 * factorEmisionPromedioFlota;

  const ahorroPotencialEmisiones = prediccionEmisionesMesActual > emisionesMesActual
    ? prediccionEmisionesMesActual - emisionesMesActual
    : 0;

  const [nuevoVehiculo, setNuevoVehiculo] = useState<Partial<Vehiculo>>({
    marca: '', modelo: '', matricula: '', kilometraje: 0, combustibleActual: 50, activo: true
  });
  const [nuevaRuta, setNuevaRuta] = useState<Partial<Ruta>>({
    origen: '', destino: '', distanciaEstimadaKm: 0, vehiculoId: '', conductorId: '', conductorNombre: '', fecha: new Date().toISOString().split('T')[0]
  });
  const [calculandoDistanciaRuta, setCalculandoDistanciaRuta] = useState(false);

  const cargarDatos = useCallback(async () => {
    setLoading(true);
    try {
      const [resVehiculos, resRutas, resRepostajes, resConductores, resMantenimientos, resUbicaciones] = await Promise.all([
        fetch(`${API_URL}/api/vehiculos`, { headers: getAuthHeaders() }),
        fetch(`${API_URL}/api/rutas`, { headers: getAuthHeaders() }),
        fetch(`${API_URL}/api/repostajes`, { headers: getAuthHeaders() }),
        fetch(`${API_URL}/api/conductores`, { headers: getAuthHeaders() }),
        fetch(`${API_URL}/api/mantenimientos`, { headers: getAuthHeaders() }),
        fetch(`${API_URL}/api/conductores/locations`, { headers: getAuthHeaders() })
      ]);

      if (resVehiculos.ok) {
        const dataV = await resVehiculos.json();
        setVehiculos(dataV);
      } else {
        console.error("Error fetching vehicles");
      }

      if (resRutas.ok) {
        const dataR = await resRutas.json();
        setRutas(dataR.map((r: Ruta) => ({ ...r, estado: normalizeRouteState(r.estado) })));
      }

      if (resRepostajes.ok) {
        const dataRep = await resRepostajes.json();
        setRepostajes(dataRep);
      }

      if (resConductores.ok) {
        const dataC = await resConductores.json();
        setConductores(dataC);
      } else if (resConductores.status === 403) {
        setConductores([]);
      }

      if (resMantenimientos.ok) {
        const dataM = await resMantenimientos.json();
        setMantenimientos(dataM);
      }

      if (resUbicaciones.ok) {
        const dataU = await resUbicaciones.json();
        setConductoresUbicaciones(dataU);
      }
    } catch (err) {
      console.error("Error conectando con el Backend:", err);
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  // ═══ COSTES & ROI — KPIs calculados en el cliente (instantáneo, igual que Estadísticas) ═══
  const flotaKpis = useMemo<FlotaKpis | null>(() => {
    if (vehiculos.length === 0) return null;

    const ahora = new Date();
    // Generar los últimos 6 meses como {year, month}
    const ultimos6Meses: { year: number; month: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
      ultimos6Meses.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
    }

    // Helper: extraer year+month de una fecha string
    const getYM = (fecha: string | undefined | null) => {
      if (!fecha) return null;
      try {
        const d = new Date(fecha);
        if (isNaN(d.getTime())) return null;
        return { year: d.getFullYear(), month: d.getMonth() + 1 };
      } catch { return null; }
    };

    const matchYM = (ym: { year: number; month: number } | null, target: { year: number; month: number }) =>
      ym !== null && ym.year === target.year && ym.month === target.month;

    // ── KPIs por vehículo ──
    const vehiculosKpis: VehiculoKpi[] = vehiculos.map(v => {
      let totalComb = 0, totalMant = 0, totalLitros = 0, totalKm = 0;

      for (const mes of ultimos6Meses) {
        // Combustible
        for (const r of repostajes) {
          if (r.vehiculoId !== v.id) continue;
          if (!matchYM(getYM(r.fecha), mes)) continue;
          totalComb += r.costeTotal || 0;
          totalLitros += r.litros || 0;
        }
        // Mantenimiento
        for (const m of mantenimientos) {
          if (m.vehiculoId !== v.id) continue;
          if (!matchYM(getYM(m.fecha), mes)) continue;
          totalMant += m.costo || 0;
        }
        // Km (rutas completadas)
        for (const ruta of rutas) {
          if (ruta.vehiculoId !== v.id) continue;
          if (normalizeRouteState(ruta.estado) !== 'COMPLETADA') continue;
          if (!matchYM(getYM(ruta.fecha), mes)) continue;
          // SOLO km reales (GPS). Sin GPS → 0 km.
          totalKm += ruta.distanciaRecorridaKm ?? 0;
        }
      }

      const costeTotal = totalComb + totalMant;
      return {
        vehiculoId: v.id,
        vehiculo: `${v.marca} ${v.modelo}`,
        matricula: v.matricula,
        activo: v.activo,
        costeTotalSemestre: Math.round(costeTotal * 100) / 100,
        costeCombustible: Math.round(totalComb * 100) / 100,
        costeMantenimiento: Math.round(totalMant * 100) / 100,
        costePorKm: totalKm > 0 ? Math.round((costeTotal / totalKm) * 100) / 100 : 0,
        litrosPor100Km: totalKm > 0 ? Math.round((totalLitros / totalKm) * 100 * 100) / 100 : 0,
        kmTotales: Math.round(totalKm * 100) / 100,
        litrosTotales: Math.round(totalLitros * 100) / 100,
      };
    });

    // Ordenar por coste total descendente
    vehiculosKpis.sort((a, b) => b.costeTotalSemestre - a.costeTotalSemestre);

    // ── Tendencia mensual global ──
    const tendenciaMensual: TendenciaMes[] = ultimos6Meses.map(mes => {
      let costeComb = 0, costeMant = 0, km = 0, litros = 0;

      for (const r of repostajes) {
        if (!matchYM(getYM(r.fecha), mes)) continue;
        costeComb += r.costeTotal || 0;
        litros += r.litros || 0;
      }
      for (const m of mantenimientos) {
        if (!matchYM(getYM(m.fecha), mes)) continue;
        costeMant += m.costo || 0;
      }
      for (const ruta of rutas) {
        if (normalizeRouteState(ruta.estado) !== 'COMPLETADA') continue;
        if (!matchYM(getYM(ruta.fecha), mes)) continue;
        // SOLO km reales (GPS). Sin GPS → 0 km.
        km += ruta.distanciaRecorridaKm ?? 0;
      }

      const costeTotal = costeComb + costeMant;
      return {
        mes: MESES_CORTOS[mes.month - 1],
        periodo: `${mes.year}-${String(mes.month).padStart(2, '0')}`,
        costeCombustible: Math.round(costeComb * 100) / 100,
        costeMantenimiento: Math.round(costeMant * 100) / 100,
        costeTotal: Math.round(costeTotal * 100) / 100,
        kmRecorridos: Math.round(km * 100) / 100,
        litros: Math.round(litros * 100) / 100,
        costePorKm: km > 0 ? Math.round((costeTotal / km) * 100) / 100 : 0,
      };
    });

    const totalCosteFlota = vehiculosKpis.reduce((a, k) => a + k.costeTotalSemestre, 0);
    const totalKmFlota = vehiculosKpis.reduce((a, k) => a + k.kmTotales, 0);

    return {
      totalVehiculos: vehiculos.length,
      costeTotalFlota: Math.round(totalCosteFlota * 100) / 100,
      kmTotalesFlota: Math.round(totalKmFlota * 100) / 100,
      costePorKmFlota: totalKmFlota > 0 ? Math.round((totalCosteFlota / totalKmFlota) * 100) / 100 : 0,
      vehiculos: vehiculosKpis,
      tendenciaMensual,
    };
  }, [vehiculos, repostajes, rutas, mantenimientos]);

  useEffect(() => {
    const userStr = localStorage.getItem("user");
    if (userStr) { // Only load data if user is logged in
      cargarDatos();
    }

    let intervalId: NodeJS.Timeout | null = null;
    if (activeTab === 'tracking') {
      intervalId = setInterval(() => {
        cargarDatos();
      }, 3000);
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [activeTab, cargarDatos]);

  useEffect(() => {
    const latO = nuevaRuta.latitudOrigen;
    const lngO = nuevaRuta.longitudOrigen;
    const latD = nuevaRuta.latitudDestino;
    const lngD = nuevaRuta.longitudDestino;

    if (
      latO == null || lngO == null || latD == null || lngD == null ||
      !Number.isFinite(latO) || !Number.isFinite(lngO) || !Number.isFinite(latD) || !Number.isFinite(lngD)
    ) {
      return;
    }

    let cancelled = false;
    setCalculandoDistanciaRuta(true);
    void estimateRouteDistanceKm(
      { lat: latO, lng: lngO },
      { lat: latD, lng: lngD }
    ).then((km) => {
      if (cancelled) return;
      const kmRedondeado = Math.max(0, Math.round(km * 10) / 10);
      setNuevaRuta((prev) => ({ ...prev, distanciaEstimadaKm: kmRedondeado }));
    }).finally(() => {
      if (!cancelled) setCalculandoDistanciaRuta(false);
    });

    return () => {
      cancelled = true;
    };
  }, [nuevaRuta.latitudOrigen, nuevaRuta.longitudOrigen, nuevaRuta.latitudDestino, nuevaRuta.longitudDestino]);

  const handleCrearVehiculo = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_URL}/api/vehiculos`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(nuevoVehiculo)
      });
      if (res.ok) {
        toast.success(t.dashboard.vehicleAddedMsg);
        setActiveTab('flota');
        cargarDatos();
        setNuevoVehiculo({ marca: '', modelo: '', matricula: '', kilometraje: 0, combustibleActual: 50, activo: true });
      }
    } catch (error) {
      toast.error(t.dashboard.errorCreateVehicle);
    }
  };

  const handleCrearRuta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevaRuta.vehiculoId) {
      toast.warning(t.dashboard.noVehicleWarning);
      return;
    }
    const conductorSeleccionado = conductores.find(c => c.id === nuevaRuta.conductorId);
    const geocode = async (query: string) => {
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`);
        const data = await response.json();
        if (data && data.length > 0) {
          return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
        }
      } catch (error) {
        console.error("Error en geocodificación:", error);
      }
      return null;
    };

    toast.promise(
      (async () => {
        let originCoords = { lat: nuevaRuta.latitudOrigen, lng: nuevaRuta.longitudOrigen };
        let destCoords = { lat: nuevaRuta.latitudDestino, lng: nuevaRuta.longitudDestino };

        if (!originCoords.lat || !originCoords.lng) {
          const res = await geocode(nuevaRuta.origen || "");
          if (res) originCoords = res;
        }
        if (!destCoords.lat || !destCoords.lng) {
          const res = await geocode(nuevaRuta.destino || "");
          if (res) destCoords = res;
        }

        if (!originCoords.lat || !destCoords.lat) {
          throw new Error(t.dashboard.routeNoLoc);
        }

        const distanciaCalculadaKm = await estimateRouteDistanceKm(
          { lat: originCoords.lat as number, lng: originCoords.lng as number },
          { lat: destCoords.lat as number, lng: destCoords.lng as number }
        );

        const res = await fetch(`${API_URL}/api/rutas`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            ...nuevaRuta,
            distanciaEstimadaKm: Math.max(0, Math.round(distanciaCalculadaKm * 10) / 10),
            estado: 'PLANIFICADA',
            conductorId: conductorSeleccionado?.id || "",
            conductorNombre: conductorSeleccionado?.nombre || "",
            latitudOrigen: originCoords.lat,
            longitudOrigen: originCoords.lng,
            latitudDestino: destCoords.lat,
            longitudDestino: destCoords.lng
            // No seteamos latitudActual/longitudActual al crear: el truck NO debe
            // anclarse al origen. Solo se llena cuando el dispositivo del conductor
            // emite GPS real vía POST /api/rutas/{id}/gps.
          })
        });

        if (!res.ok) throw new Error(t.dashboard.routeErrorReq);

        cargarDatos();
        setNuevaRuta({
          origen: "",
          destino: "",
          distanciaEstimadaKm: 0,
          fecha: new Date().toISOString().split("T")[0],
          vehiculoId: "",
          conductorId: "",
          conductorNombre: ""
        });
        return res.json();
      })(),
      {
        loading: t.dashboard.procLocations,
        success: t.dashboard.routeSuccess,
        error: (err) => `Error: ${err.message}`,
      }
    );
  };

  const handleCambioEstadoRuta = async (ruta: Ruta, nuevoEstado: string) => {
    const rutasPrevias = [...rutas];
    setRutas(prev => prev.map(r => r.id === ruta.id ? { ...r, estado: nuevoEstado } : r));

    try {
      await fetch(`${API_URL}/api/rutas/${ruta.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ ...ruta, estado: nuevoEstado })
      }).catch(e => console.warn("Backend no respondió, usando estado local"));

      toast.success(`${t.dashboard.routeMarked} ${nuevoEstado}`);
    } catch (error) {
      setRutas(rutasPrevias);
      toast.error(t.dashboard.errorUpdState);
    }
  };

  const handleEliminarRuta = async (ruta: Ruta) => {
    const rutasPrevias = [...rutas];
    setRutas(prev => prev.filter(r => r.id !== ruta.id));

    try {
      await fetch(`${API_URL}/api/rutas/${ruta.id}`, { method: 'DELETE', headers: getAuthHeaders() })
        .catch(e => console.warn("Backend no respondió, usando estado local"));
      toast.success("Ruta eliminada correctamente");
    } catch (error) {
      setRutas(rutasPrevias);
      toast.error("Error al eliminar ruta");
    }
  };

  const handleEliminarVehiculo = (id: string) => {
    toast("¿Estás seguro?", {
      description: "Esta acción eliminará el vehículo permanentemente de la flota.",
      action: {
        label: "Eliminar",
        onClick: async () => {
          try {
            const res = await fetch(`${API_URL}/api/vehiculos/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
            if (res.ok) {
              toast.success("Vehículo eliminado correctamente");
              setVehiculos((prev) => prev.filter(v => v.id !== id));
            }
          } catch (error) {
            toast.error("Error al eliminar vehículo");
          }
        }
      },
      cancel: {
        label: "Cancelar",
        onClick: () => console.log("Cancelado"),
      },
    });
  };

  const getFuelColor = (level: number) => {
    if (level > 50) return '#22c55e';
    if (level > 20) return '#eab308';
    return '#ef4444';
  };

  return (
    <BackgroundMeteors>
      <main style={{ height: '100%', width: '100%', overflowY: 'auto', position: 'relative', zIndex: 20, paddingBottom: '100px' }}>
        <div className={styles.container}>
          <header className={styles.header}>
            <div className={styles.title}>
              <h1>{t.dashboard.title}</h1>
              <p className={styles.subtitle}>{t.dashboard.subtitle}</p>
            </div>
            <div className={styles.status} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginLeft: 'auto' }}>
              <AlertasPanel
                apiUrl={API_URL}
                getAuthHeaders={getAuthHeaders}
                onNavigate={(rutaId, vehiculoId) => {
                  if (rutaId) { router.push(`/ruta/${rutaId}`); }
                  else if (vehiculoId) { router.push(`/vehiculo/${vehiculoId}`); }
                }}
              />
              <ConfiguracionPanel apiUrl={API_URL} getAuthHeaders={getAuthHeaders} />
              <LanguageSwitcher />
              <WavyButton
                variant="outline"
                size="sm"
                radius="sm"
                onClick={handleLogout}
              >
                {t.auth.logout}
              </WavyButton>
            </div>
          </header>

          <nav className={styles.nav}>
            <button
              className={`${styles.navButton} ${activeTab === 'flota' ? styles.activeTab : ''}`}
              onClick={() => setActiveTab('flota')}
            >
              {t.nav.fleet}
            </button>
            <button
              className={`${styles.navButton} ${activeTab === 'rutas' ? styles.activeTab : ''}`}
              onClick={() => setActiveTab('rutas')}
            >
              {t.nav.routes}
            </button>
            <button
              className={`${styles.navButton} ${activeTab === 'costes' ? styles.activeTab : ''}`}
              onClick={() => setActiveTab('costes')}
            >
              {t.nav.costs}
            </button>
            <button
              className={`${styles.navButton} ${activeTab === 'estadisticas' ? styles.activeTab : ''}`}
              onClick={() => setActiveTab('estadisticas')}
            >
              {t.nav.statistics}
            </button>
            <button
              className={`${styles.navButton} ${activeTab === 'tracking' ? styles.activeTab : ''}`}
              onClick={() => setActiveTab('tracking')}
            >
              {t.nav.tracking}
            </button>
            <button
              className={`${styles.navButton} ${activeTab === 'nuevo' ? styles.activeTab : ''}`}
              onClick={() => setActiveTab('nuevo')}
            >
              {t.nav.newVehicle}
            </button>
          </nav>

          {activeTab === 'flota' && (
            <div className={styles.grid}>
              {vehiculos.map((v) => (
                <div
                  key={v.id}
                  className={styles.card}
                  onClick={() => router.push(`/vehiculo/${v.id}`)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className={styles.cardHeader}>
                    <div>
                      <h2 className={styles.cardTitle}>{v.marca} {v.modelo}</h2>
                      <span className={styles.cardSubtitle}>Matrícula: {v.matricula}</span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEliminarVehiculo(v.id);
                      }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '1.2rem' }}
                      title="Eliminar Vehículo"
                    >
                      X
                    </button>
                  </div>

                  <div className={styles.statRow}>
                    <span className={styles.statLabel}>{t.metrics.mileage}</span>
                    <span className={styles.statValue}>{v.kilometraje.toLocaleString()} km</span>
                  </div>

                  <div className={styles.statRow}>
                    <span className={styles.statLabel}>{t.vehicle.fuelType}</span>
                    <span className={styles.statValue}>{v.tipoCombustible}</span>
                  </div>

                  <div className={styles.statRow}>
                    <span className={styles.statLabel}>{t.metrics.fuel}</span>
                    <span className={styles.statValue} style={{ color: v.combustibleActual != null && v.combustibleActual < 20 ? '#ef4444' : undefined }}>{v.combustibleActual?.toLocaleString(locale, { maximumFractionDigits: 1 })}%</span>
                  </div>

                  {(() => {
                    const repVehiculo = repostajes.filter(r => r.vehiculoId === v.id);
                    if (repVehiculo.length === 0) return null;
                    const totalComb = repVehiculo.reduce((sum, r) => sum + (r.costeTotal || 0), 0);
                    const ultimo = repVehiculo.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))[0];
                    return (
                      <>
                        <div className={styles.statRow}>
                          <span className={styles.statLabel}>{t.metrics.fuelExpense}</span>
                          <span className={styles.statValue} style={{ color: '#f59e0b' }}>€{totalComb.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        <div className={styles.statRow}>
                          <span className={styles.statLabel}>{t.metrics.lastRefueling}</span>
                          <span className={styles.statValue} style={{ fontSize: '0.85rem', color: '#9ca3af' }}>
                            {new Date(ultimo.fecha!).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
                          </span>
                        </div>
                      </>
                    );
                  })()}

                  <div className={styles.fuelBarBg}>
                    <div
                      className={styles.fuelBarFill}
                      style={{
                        width: `${Math.min(v.combustibleActual, 100)}%`,
                        backgroundColor: getFuelColor(v.combustibleActual)
                      }}
                    />
                  </div>
                  <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {(() => {
                      const estaOcupado = rutas.some(r => r.vehiculoId === v.id && isInProgressRoute(r.estado));
                      return (
                        <span
                          className={styles.badge}
                          style={{
                            backgroundColor: !v.activo ? 'rgba(239, 68, 68, 0.2)' : (estaOcupado ? 'rgba(234, 179, 8, 0.2)' : 'rgba(34, 197, 94, 0.2)'),
                            color: !v.activo ? '#f87171' : (estaOcupado ? '#facc15' : '#03f844'),
                            boxShadow: !v.activo ? 'none' : (estaOcupado ? '0 0 10px rgba(234, 179, 8, 0.2)' : '0 0 10px rgba(34, 197, 94, 0.2)'),
                          }}
                        >
                          {!v.activo ? "En taller" : (estaOcupado ? "Ocupado" : "Activo")}
                        </span>
                      );
                    })()}
                    {(() => {
                      const kpi = flotaKpis?.vehiculos.find(k => k.vehiculoId === v.id);
                      if (!kpi || kpi.costePorKm <= 0) return null;
                      const esEficiente = kpi.costePorKm <= (flotaKpis?.costePorKmFlota || Infinity);
                      return (
                        <span
                          className={styles.badge}
                          style={{
                            backgroundColor: esEficiente ? 'rgba(96, 165, 250, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                            color: esEficiente ? '#60a5fa' : '#f87171',
                          }}
                        >
                          €{kpi.costePorKm.toFixed(2)}/km
                        </span>
                      );
                    })()}
                  </div>
                </div>
              ))}
              {vehiculos.length === 0 && !loading && <p>{t.dashboard.noVehicles}</p>}
            </div>
          )}

          {activeTab === 'nuevo' && (
            <div className={styles.formContainer}>
              <h2 style={{ marginBottom: '1.5rem' }}>{t.dashboard.addNewVehicle}</h2>
              <form onSubmit={handleCrearVehiculo}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>{t.vehicle.brand}</label>
                  <input className={styles.input} type="text" placeholder={t.vehicle.brand} required
                    value={nuevoVehiculo.marca} onChange={e => setNuevoVehiculo({ ...nuevoVehiculo, marca: e.target.value })} />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>{t.vehicle.model}</label>
                  <input className={styles.input} type="text" placeholder="Ej: Prius" required
                    value={nuevoVehiculo.modelo} onChange={e => setNuevoVehiculo({ ...nuevoVehiculo, modelo: e.target.value })} />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>{t.vehicle.plate}</label>
                  <input className={styles.input} type="text" placeholder="1234-XYZ" required
                    value={nuevoVehiculo.matricula} onChange={e => setNuevoVehiculo({ ...nuevoVehiculo, matricula: e.target.value })} />
                </div>
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <label className={styles.label} style={{ marginBottom: 0 }}>{t.dashboard.initKm}</label>
                      <span style={{ fontWeight: 'bold', color: 'var(--accent)' }}>{nuevoVehiculo.kilometraje?.toLocaleString()} km</span>
                    </div>
                    <input
                      className={styles.input}
                      type="range"
                      min="0"
                      max="1000000"
                      step="500"
                      style={{ padding: '0.5rem', cursor: 'pointer' }}
                      value={nuevoVehiculo.kilometraje}
                      onChange={e => setNuevoVehiculo({ ...nuevoVehiculo, kilometraje: Number(e.target.value) })}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <label className={styles.label} style={{ marginBottom: 0 }}>{t.metrics.fuel}</label>
                      <span style={{ fontWeight: 'bold', color: getFuelColor(nuevoVehiculo.combustibleActual || 0) }}>
                        {nuevoVehiculo.combustibleActual}%
                      </span>
                    </div>
                    <input
                      className={styles.input}
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      style={{ padding: '0.5rem', cursor: 'pointer' }}
                      value={nuevoVehiculo.combustibleActual}
                      onChange={e => setNuevoVehiculo({ ...nuevoVehiculo, combustibleActual: Number(e.target.value) })}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.label}>{t.vehicle.fuelType}</label>
                    <select className={styles.select} required
                      value={nuevoVehiculo.tipoCombustible} onChange={e => setNuevoVehiculo({ ...nuevoVehiculo, tipoCombustible: e.target.value })}>
                      <option value="">{t.dashboard.selectFuel}</option>
                      <option value="gasolina">{t.dashboard.gasoline}</option>
                      <option value="diesel">{t.dashboard.diesel}</option>
                      <option value="hibrido">{t.dashboard.hybrid}</option>
                      <option value="electrico">{t.dashboard.electric}</option>
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <label className={styles.label} style={{ marginBottom: 0 }}>{t.dashboard.tankCap}</label>
                      <span style={{ fontWeight: 'bold', color: '#6b7280' }}>{nuevoVehiculo.capacidadDeposito || 60} L</span>
                    </div>
                    <input className={styles.input} type="number" min="10" max="500" step="5" placeholder="60"
                      value={nuevoVehiculo.capacidadDeposito || ''} onChange={e => setNuevoVehiculo({ ...nuevoVehiculo, capacidadDeposito: Number(e.target.value) || undefined })} />
                  </div>
                  <div className={styles.formGroup}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <label className={styles.label} style={{ marginBottom: 0 }}>{t.dashboard.refCostKm}</label>
                      <span style={{ fontWeight: 'bold', color: '#6b7280' }}>
                        {nuevoVehiculo.costeKmReferencia ? `€${nuevoVehiculo.costeKmReferencia}/km` : '—'}
                      </span>
                    </div>
                    <input className={styles.input} type="number" min="0" max="10" step="0.01" placeholder="0.35"
                      value={nuevoVehiculo.costeKmReferencia || ''} onChange={e => setNuevoVehiculo({ ...nuevoVehiculo, costeKmReferencia: Number(e.target.value) || undefined })} />
                    <span style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: '0.25rem', display: 'block' }}>{t.dashboard.refCostDesc}</span>
                  </div>
                </div>
                <WavyButton type="submit" variant="success" radius="sm" className="w-full">{t.vehicle.saveVehicle}</WavyButton>
              </form>
            </div>
          )}

          {activeTab === 'rutas' && (
            <div className={styles.rutasContainer}>
              <div className={styles.formContainer}>
                <h3 style={{ marginBottom: '1rem', color: 'var(--accent)' }}>{t.dashboard.newRouteHead}</h3>
                <form onSubmit={handleCrearRuta}>
                  <LocationInput
                    label={t.dashboard.originLabel}
                    placeholder="Ej: Madrid, Calle Mayor..."
                    value={nuevaRuta.origen || ""}
                    onChange={(val, coords) => setNuevaRuta({
                      ...nuevaRuta,
                      origen: val,
                      latitudOrigen: coords?.lat,
                      longitudOrigen: coords?.lng
                    })}
                  />

                  <LocationInput
                    label={t.dashboard.destLabel}
                    placeholder="Ej: Barcelona, Puerto..."
                    value={nuevaRuta.destino || ""}
                    onChange={(val, coords) => setNuevaRuta({
                      ...nuevaRuta,
                      destino: val,
                      latitudDestino: coords?.lat,
                      longitudDestino: coords?.lng
                    })}
                  />
                  <div className={styles.formGroup}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <label className={styles.label} style={{ marginBottom: 0 }}>{t.dashboard.estDist}</label>
                      <span style={{ fontWeight: 'bold', color: '#16a34a' }}>
                        {calculandoDistanciaRuta ? 'Calculando...' : `${nuevaRuta.distanciaEstimadaKm?.toLocaleString() || 0} km`}
                      </span>
                    </div>
                    <div className={styles.input} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#9ca3af' }}>
                      <span>Automática por mapa (inicio → destino)</span>
                      <span style={{ color: '#16a34a', fontWeight: 700 }}>{(nuevaRuta.distanciaEstimadaKm || 0).toFixed(1)} km</span>
                    </div>
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.label}>{t.dashboard.departureDate}</label>
                    <input className={styles.input} type="date" required
                      value={nuevaRuta.fecha} onChange={e => setNuevaRuta({ ...nuevaRuta, fecha: e.target.value })} />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.label}>{t.dashboard.assignedVehicle}</label>
                    <select className={styles.select} required
                      value={nuevaRuta.vehiculoId} onChange={e => setNuevaRuta({ ...nuevaRuta, vehiculoId: e.target.value })}>
                      <option value="">{t.dashboard.selectVehicle}</option>
                      {vehiculos.map(v => (
                        <option key={v.id} value={v.id}>{v.marca} {v.modelo} ({v.matricula})</option>
                      ))}
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.label}>{t.dashboard.assignedDriver}</label>
                    <select
                      className={styles.select}
                      value={nuevaRuta.conductorId || ""}
                      onChange={e => {
                        const conductor = conductores.find(c => c.id === e.target.value);
                        setNuevaRuta({
                          ...nuevaRuta,
                          conductorId: e.target.value,
                          conductorNombre: conductor?.nombre || ""
                        });
                      }}
                    >
                      <option value="">{t.dashboard.unassigned}</option>
                      {conductores.map(c => (
                        <option key={c.id} value={c.id}>{c.nombre} ({c.email})</option>
                      ))}
                    </select>
                  </div>
                  <WavyButton type="submit" variant="success" radius="sm" className="w-full">{t.routes.planRoute}</WavyButton>
                </form>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h3>{t.dashboard.activeRoutesHead}</h3>
                  <button
                    onClick={cargarDatos}
                    className={styles.submitButton}
                    style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
                    title="Recargar rutas"
                  >
                    🔄 Recargar
                  </button>
                </div>
                <div className={styles.grid}>
                  {rutas.map(r => {
                    const estadoRuta = normalizeRouteState(r.estado);
                    const esEnCurso = estadoRuta === 'EN_CURSO';
                    const esDetenido = estadoRuta === 'DETENIDO';
                    const esCompletada = estadoRuta === 'COMPLETADA';

                    return (
                      <div
                        key={r.id}
                        className={styles.card}
                        onClick={() => router.push(`/ruta/${r.id}`)}
                        style={{ cursor: 'pointer' }}
                      >
                        <div className={styles.cardHeader}>
                          <div>
                            <h2 className={styles.cardTitle}>{r.origen} → {r.destino}</h2>
                            <span className={styles.cardSubtitle}>#{r.id?.slice(-6).toUpperCase()} • {r.fecha}</span>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEliminarRuta(r);
                            }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '1.2rem' }}
                            title="Eliminar Ruta"
                          >
                            X
                          </button>
                        </div>

                        <div className={styles.statRow}>
                          <span className={styles.statLabel}>{t.dashboard.totDist}</span>
                          <span className={styles.statValue}>{r.distanciaEstimadaKm} km</span>
                        </div>

                        <div className={styles.statRow}>
                          <span className={styles.statLabel}>Vehículo asignado</span>
                          <span className={styles.statValue}>
                            {r.vehiculoId?.length > 10 ? `...${r.vehiculoId.slice(-8)}` : r.vehiculoId}
                          </span>
                        </div>

                        <div className={styles.statRow}>
                          <span className={styles.statLabel}>{t.dashboard.driverLbl}</span>
                          <span className={styles.statValue}>{r.conductorNombre || "Sin asignar"}</span>
                        </div>

                        <div className={styles.statRow}>
                          <span className={styles.statLabel}>{t.dashboard.stateLbl}</span>
                          <span className={styles.statValue}>{formatRouteStateLabel(estadoRuta)}</span>
                        </div>

                        <div className={styles.fuelBarBg}>
                          <div
                            className={styles.fuelBarFill}
                            style={{
                              width: esCompletada ? '100%' : ((esEnCurso || esDetenido) ? '60%' : '30%'),
                              backgroundColor: esCompletada ? '#22c55e' : (esDetenido ? '#f97316' : (esEnCurso ? '#06b6d4' : '#6b7280'))
                            }}
                          />
                        </div>

                        {(esEnCurso || esDetenido) && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '0.5rem' }}>
                            <span style={{
                              width: '8px',
                              height: '8px',
                              borderRadius: '50%',
                              backgroundColor: esDetenido ? '#f97316' : '#3bf63b',
                              boxShadow: esDetenido ? '0 0 10px #f97316' : '0 0 10px #3bf63b',
                              animation: esDetenido ? 'none' : 'pulse 1.5s infinite'
                            }}></span>
                            <span style={{ fontSize: '0.7rem', color: esDetenido ? '#f97316' : '#3bf63b', fontWeight: '800', letterSpacing: '0.05em' }}>
                              {esDetenido ? 'VEHÍCULO DETENIDO' : 'RASTREO ACTIVO'}
                            </span>
                          </div>
                        )}

                        <div style={{ marginTop: '1rem' }}>
                          <span
                            className={styles.badge}
                            style={{
                              backgroundColor: esCompletada ? 'rgba(34, 197, 94, 0.2)' : (esDetenido ? 'rgba(249, 115, 22, 0.2)' : (esEnCurso ? 'rgba(6, 182, 212, 0.2)' : 'rgba(107, 114, 128, 0.2)')),
                              color: esCompletada ? '#4ade80' : (esDetenido ? '#f97316' : (esEnCurso ? '#22d3ee' : '#9ca3af')),
                              boxShadow: esCompletada ? '0 0 10px rgba(34, 197, 94, 0.2)' : ((esEnCurso || esDetenido) ? `0 0 10px ${esDetenido ? 'rgba(249, 115, 22, 0.2)' : 'rgba(6, 182, 212, 0.2)'}` : 'none'),
                            }}
                          >
                            {formatRouteStateLabel(estadoRuta)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  {rutas.length === 0 && <p>{t.dashboard.noPlannedRoutes}</p>}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'estadisticas' && (
            <div className={styles.rutasContainer} style={{ gridTemplateColumns: "1fr", gap: "2rem" }}>
              {/* KPIs */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.5rem" }}>
                <div className={styles.card} style={{ position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", top: 0, right: 0, padding: "1rem", opacity: 0.1 }}>
                    <svg width="60" height="60" fill="#22c55e" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.31-8.86c-1.77-.45-2.34-.94-2.34-1.67 0-.84.79-1.43 2.1-1.43 1.38 0 1.9.66 1.94 1.64h1.71c-.05-1.34-.87-2.57-2.49-2.97V5H10.9v1.69c-1.51.32-2.72 1.3-2.72 2.81 0 1.79 1.49 2.69 3.66 3.21 1.95.46 2.34 1.15 2.34 1.87 0 .53-.39 1.39-2.1 1.39-1.6 0-2.23-.72-2.32-1.64H8.04c.1 1.7 1.36 2.66 2.86 2.97V19h2.34v-1.67c1.52-.29 2.72-1.16 2.73-2.77-.01-2.2-1.9-2.96-3.66-3.42z" /></svg>
                  </div>
                  <h3 style={{ color: "#94a3b8", fontSize: "0.9rem", textTransform: "uppercase", letterSpacing: "1px" }}>{t.dashboard.emissionsThisMonth}</h3>
                  <div style={{ fontSize: "2.5rem", fontWeight: "800", color: "#fff", margin: "0.5rem 0" }}>
                    {emisionesMesActual > 0 ? formatEmissionValue(emisionesMesActual, locale) : '—'}
                  </div>
                  {ahorroPotencialEmisiones > 0 && (
                    <span style={{ color: "#22c55e", background: "rgba(34, 197, 94, 0.1)", padding: "2px 8px", borderRadius: "12px", fontSize: "0.8rem", fontWeight: "600" }}>
                      {formatEmissionValue(ahorroPotencialEmisiones, locale)} {t.dashboard.underPred}
                    </span>
                  )}
                  {emisionesMesActual === 0 && <span style={{ color: "#4b5563", fontSize: "0.8rem" }}>{t.dashboard.addWithBtn}</span>}
                </div>

                <div className={styles.card}>
                  <h3 style={{ color: "#94a3b8", fontSize: "0.9rem", textTransform: "uppercase", letterSpacing: "1px" }}>{t.dashboard.emissionsMonthlyAvg}</h3>
                  <div style={{ fontSize: "2.5rem", fontWeight: "800", color: "#fff", margin: "0.5rem 0" }}>
                    {formatEmissionValue(emisionesMedias, locale)}
                  </div>
                  <span style={{ color: "var(--accent)", fontSize: "0.9rem" }}>
                    {t.dashboard.basedOn} {mesesConDatosDisplay} mes{mesesConDatosDisplay > 1 ? 'es' : ''}
                  </span>
                </div>

                <div className={styles.card}>
                  <h3 style={{ color: "#94a3b8", fontSize: "0.9rem", textTransform: "uppercase", letterSpacing: "1px" }}>{t.dashboard.emissionsPrediction} {nombresMeses[mesActual]}</h3>
                  <div style={{ fontSize: "2.5rem", fontWeight: "800", color: "#fff", margin: "0.5rem 0" }}>
                    {formatEmissionValue(prediccionEmisionesMesActual, locale)}
                  </div>
                  <span style={{ color: "#8884d8", fontSize: "0.9rem" }}>
                    {t.dashboard.movAvg3m}
                  </span>
                </div>
              </div>

              {/* Gráfico Principal — AreaChart original */}
              <div className={styles.card} style={{ minHeight: "450px", display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "2rem", flexWrap: "wrap", gap: "1rem" }}>
                  <div>
                    <h3 className={styles.cardTitle}>{t.dashboard.analysisPred}</h3>
                    <p style={{ color: "#64748b", fontSize: "0.9rem" }}>
                      {t.dashboard.realVsTrend} — {new Date().getFullYear()}
                      <span style={{ marginLeft: "0.5rem", background: "rgba(59,246,59,0.1)", color: "#3bf63b", padding: "2px 8px", borderRadius: "8px", fontSize: "0.75rem" }}>
                        {t.dashboard.currMonthLbl} {nombresMeses[mesActual]}
                      </span>
                    </p>
                  </div>
                </div>

                <div style={{ flex: 1, width: "100%", height: "100%", minHeight: "300px" }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={datosGrafico}>
                      <defs>
                        <linearGradient id="colorConsumo" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3bf63b" stopOpacity={0.8} />
                          <stop offset="95%" stopColor="#3bf63b" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorPrediccion" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8} />
                          <stop offset="95%" stopColor="#8884d8" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                      <XAxis dataKey="mes" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `${val}L`} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#1e293b", border: "none", borderRadius: "8px", boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.5)" }}
                        itemStyle={{ color: "#e2e8f0" }}
                      />
                      <Legend verticalAlign="top" height={36} />
                      <Area type="monotone" dataKey="consumo" name="Consumo Real (L)" stroke="#3bf63b" fillOpacity={1} fill="url(#colorConsumo)" strokeWidth={3} />
                      <Area type="monotone" dataKey="prediccion" name="Predicción (L)" stroke="#8884d8" strokeDasharray="5 5" fillOpacity={0.4} fill="url(#colorPrediccion)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Tabla editable de datos mensuales */}
              <div className={styles.card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
                  <div>
                    <h3 className={styles.cardTitle}>{t.dashboard.monthlyData}</h3>
                    <p style={{ color: "#64748b", fontSize: "0.85rem" }}>{t.dashboard.clickToEdit}</p>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "0.75rem" }}>
                  {datosGrafico.map((d, i) => (
                    <div
                      key={d.mes}
                      onClick={() => { setEditandoMes(i); setInputConsumo(d.consumo > 0 ? String(d.consumo) : ''); }}
                      style={{
                        padding: "0.75rem",
                        background: d.esMesActual ? "rgba(59,246,59,0.08)" : "rgba(255,255,255,0.02)",
                        border: d.esMesActual ? "1px solid rgba(59,246,59,0.3)" : "1px solid rgba(255,255,255,0.06)",
                        borderRadius: "10px",
                        cursor: "pointer",
                        transition: "all 0.2s",
                        position: "relative",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.3rem" }}>
                        <span style={{ fontSize: "0.75rem", fontWeight: "700", color: d.esMesActual ? "#3bf63b" : "#94a3b8", textTransform: "uppercase" }}>
                          {d.mes}
                        </span>
                        {d.esManual && <span style={{ fontSize: "0.55rem", background: "rgba(139,92,246,0.2)", color: "#a78bfa", padding: "1px 5px", borderRadius: "4px" }}>{t.dashboard.manualTag}</span>}
                        {d.esMesActual && <span style={{ fontSize: "0.55rem", background: "rgba(59,246,59,0.2)", color: "#3bf63b", padding: "1px 5px", borderRadius: "4px" }}>{t.dashboard.actualTag}</span>}
                      </div>

                      {editandoMes === i ? (
                        <form
                          onSubmit={(e) => { e.preventDefault(); guardarDatoManual(i, parseFloat(inputConsumo) || 0); }}
                          style={{ marginTop: "0.4rem" }}
                        >
                          <div style={{
                            display: "flex",
                            alignItems: "center",
                            background: "rgba(0,0,0,0.5)",
                            border: "1px solid rgba(59,246,59,0.4)",
                            borderRadius: "8px",
                            overflow: "hidden",
                            boxShadow: "0 0 0 3px rgba(59,246,59,0.08)"
                          }}>
                            <input
                              autoFocus
                              type="number"
                              step="0.1"
                              min="0"
                              value={inputConsumo}
                              onChange={(e) => setInputConsumo(e.target.value)}
                              onBlur={() => { guardarDatoManual(i, parseFloat(inputConsumo) || 0); }}
                              placeholder="0.0"
                              style={{
                                flex: 1,
                                width: "100%",
                                minWidth: 0,
                                padding: "0.45rem 0.5rem",
                                background: "transparent",
                                border: "none",
                                color: "#fff",
                                fontSize: "1rem",
                                fontWeight: "700",
                                outline: "none",
                                textAlign: "center",
                              }}
                            />
                            <span style={{
                              padding: "0.45rem 0.6rem",
                              background: "rgba(59,246,59,0.12)",
                              color: "#3bf63b",
                              fontSize: "0.75rem",
                              fontWeight: "700",
                              letterSpacing: "0.05em",
                              borderLeft: "1px solid rgba(59,246,59,0.2)",
                              whiteSpace: "nowrap",
                            }}>L</span>
                          </div>
                          <p style={{ fontSize: "0.6rem", color: "#4b5563", marginTop: "0.3rem", textAlign: "center" }}>{t.dashboard.enterOrClick}</p>
                        </form>
                      ) : (
                        <div style={{ fontSize: "1.2rem", fontWeight: "800", color: d.consumo > 0 ? "#fff" : "#374151", marginTop: "0.2rem" }}>
                          {d.consumo > 0 ? `${d.consumo}L` : '—'}
                        </div>
                      )}

                      {d.prediccion > 0 && editandoMes !== i && (
                        <div style={{ fontSize: "0.65rem", color: "#8884d8", marginTop: "0.25rem" }}>
                          ↗ {d.prediccion}L {t.dashboard.predTag}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {datosManual.some(v => v > 0) && (
                  <button
                    onClick={() => { setDatosManual(new Array(12).fill(0)); localStorage.removeItem('carcare_consumo_manual'); toast.success(t.dashboard.clearManualSuccess || 'Datos manuales eliminados'); }}
                    style={{ marginTop: "1rem", padding: "0.5rem 1rem", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "8px", color: "#ef4444", cursor: "pointer", fontSize: "0.8rem" }}
                  >
                    {t.dashboard.clearManual}
                  </button>
                )}
              </div>

              {/* ── Reporte Mensual ──────────────────────────────────────────── */}
              <div className={styles.card} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
              <div>
                <h3 style={{ color: "#fff", fontSize: "1rem", marginBottom: "0.25rem" }}>{t.dashboard.monthlyReport}</h3>
                <p style={{ color: "#6b7280", fontSize: "0.82rem", margin: 0 }}>
                  {t.dashboard.reportDesc}
                </p>
              </div>
              <button
                disabled={enviandoReporte}
                onClick={async () => {
                  setEnviandoReporte(true);
                  try {
                    const res = await fetch(`${API_URL}/api/reportes/enviar`, {
                      method: "POST",
                      headers: getAuthHeaders(),
                    });
                    if (res.ok) {
                      toast.success(t.dashboard.reportSuccess);
                        } else {
                          const data = await res.json().catch(() => ({}));
                          toast.error(data.error || t.dashboard.reportError || "No se pudo enviar el reporte");
                        }
                      } catch {
                        toast.error(t.dashboard.connectionError || "Error de conexión al enviar el reporte");
                      } finally {
                        setEnviandoReporte(false);
                      }
                    }}
                style={{
                  padding: "0.6rem 1.4rem",
                  background: enviandoReporte ? "rgba(99,102,241,0.3)" : "rgba(99,102,241,0.15)",
                  border: "1px solid rgba(99,102,241,0.4)",
                  borderRadius: "10px",
                  color: enviandoReporte ? "#9ca3af" : "#a5b4fc",
                  cursor: enviandoReporte ? "not-allowed" : "pointer",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  transition: "all 0.2s",
                }}
              >
                {enviandoReporte ? t.dashboard.sending : t.dashboard.sendReportAction}
              </button>
              </div>
            </div>
          )}

          {/* ═══════════════════ TAB: COSTES & ROI ═══════════════════ */}
          {activeTab === 'costes' && (
            <div className={styles.rutasContainer} style={{ gridTemplateColumns: '1fr', gap: '2rem' }}>
              {flotaKpis ? (
                <>
                  {/* ── KPI Cards globales ── */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
                    <div className={styles.card} style={{ position: 'relative', overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', top: '-10px', right: '-10px', width: '80px', height: '80px', background: 'radial-gradient(circle, rgba(168,85,247,0.15) 0%, transparent 70%)' }} />
                      <h3 style={{ color: '#94a3b8', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '0.5rem' }}>{t.dashboard.costTotalFleet}</h3>
                      <div style={{ fontSize: '2.2rem', fontWeight: '800', color: '#fff', letterSpacing: '-1px' }}>
                        €{flotaKpis.costeTotalFlota.toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </div>
                      <span style={{ color: '#a78bfa', fontSize: '0.8rem' }}>{t.dashboard.last6m}</span>
                    </div>

                    <div className={styles.card} style={{ position: 'relative', overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', top: '-10px', right: '-10px', width: '80px', height: '80px', background: 'radial-gradient(circle, rgba(34,197,94,0.15) 0%, transparent 70%)' }} />
                      <h3 style={{ color: '#94a3b8', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '0.5rem' }}>{t.dashboard.costKmFleet}</h3>
                      <div style={{ fontSize: '2.2rem', fontWeight: '800', color: '#fff', letterSpacing: '-1px' }}>
                        €{flotaKpis.costePorKmFlota.toFixed(2)}
                      </div>
                      <span style={{ color: '#22c55e', fontSize: '0.8rem' }}>{t.dashboard.avgPerKm}</span>
                    </div>

                    <div className={styles.card} style={{ position: 'relative', overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', top: '-10px', right: '-10px', width: '80px', height: '80px', background: 'radial-gradient(circle, rgba(59,130,246,0.15) 0%, transparent 70%)' }} />
                      <h3 style={{ color: '#94a3b8', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '0.5rem' }}>{t.dashboard.totKm}</h3>
                      <div style={{ fontSize: '2.2rem', fontWeight: '800', color: '#fff', letterSpacing: '-1px' }}>
                        {flotaKpis.kmTotalesFlota.toLocaleString(locale, { maximumFractionDigits: 0 })}
                      </div>
                      <span style={{ color: '#60a5fa', fontSize: '0.8rem' }}>{flotaKpis.totalVehiculos} {t.dashboard.vehiclesCount}</span>
                    </div>

                    <div className={styles.card} style={{ position: 'relative', overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', top: '-10px', right: '-10px', width: '80px', height: '80px', background: 'radial-gradient(circle, rgba(245,158,11,0.15) 0%, transparent 70%)' }} />
                      <h3 style={{ color: '#94a3b8', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '0.5rem' }}>{t.dashboard.mostExpensive}</h3>
                      <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#fff', letterSpacing: '-0.5px' }}>
                        {flotaKpis.vehiculos[0]?.vehiculo || '—'}
                      </div>
                      <span style={{ color: '#f59e0b', fontSize: '0.8rem' }}>
                        {flotaKpis.vehiculos[0] ? `€${flotaKpis.vehiculos[0].costePorKm.toFixed(2)}/km` : '—'}
                      </span>
                    </div>
                  </div>

                  {/* ── Gráfico de Tendencia Mensual ── */}
                  <div className={styles.card} style={{ minHeight: '420px', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ marginBottom: '1.5rem' }}>
                      <h3 className={styles.cardTitle}>{t.dashboard.costTrend}</h3>
                      <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                        {t.dashboard.costEvol}
                      </p>
                    </div>
                    <div style={{ flex: 1, width: '100%', minHeight: '300px' }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={flotaKpis.tendenciaMensual}>
                          <defs>
                            <linearGradient id="colorCosteComb" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.6} />
                              <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="colorCosteMant" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#ef4444" stopOpacity={0.6} />
                              <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.08} />
                          <XAxis dataKey="mes" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                          <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val: number) => `€${val}`} />
                          <Tooltip
                            contentStyle={{ backgroundColor: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}
                            itemStyle={{ color: '#e2e8f0' }}
                            formatter={(value, name) => [`€${Number(value ?? 0).toFixed(2)}`, name ?? '']}
                          />
                          <Legend verticalAlign="top" height={36} />
                          <Area type="monotone" dataKey="costeCombustible" name={t.dashboard.fuel} stroke="#f59e0b" fillOpacity={1} fill="url(#colorCosteComb)" strokeWidth={2.5} />
                          <Area type="monotone" dataKey="costeMantenimiento" name={t.dashboard.maintenance} stroke="#ef4444" fillOpacity={1} fill="url(#colorCosteMant)" strokeWidth={2.5} />
                          <Line type="monotone" dataKey="costeTotal" name={t.dashboard.totalCost} stroke="#a78bfa" strokeWidth={2} dot={{ fill: '#a78bfa', r: 4 }} strokeDasharray="5 5" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* ── Cards por Vehículo ── */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                      <div>
                        <h3 style={{ color: '#fff', fontSize: '1.15rem', fontWeight: '700' }}>{t.dashboard.costRank}</h3>
                        <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: '0.15rem' }}>{t.dashboard.costRankDesc}</p>
                      </div>
                      <button
                        onClick={() => { cargarDatos(); toast.success(t.dashboard.costsUpdated || 'Datos actualizados'); }}
                        className={styles.submitButton}
                        style={{ width: 'auto', padding: '0.5rem 1.2rem', fontSize: '0.85rem' }}
                      >
                        {t.dashboard.updateSync}
                      </button>
                    </div>

                    <div className={styles.grid}>
                      {flotaKpis.vehiculos.map((v, idx) => {
                        const rankColors = ['#f59e0b', '#94a3b8', '#cd7f32'];
                        const rankBorder = idx < 3 ? rankColors[idx] : 'rgba(255,255,255,0.08)';
                        const isTop = idx === 0;
                        const vData = vehiculos.find(veh => veh.id === v.vehiculoId);
                        const refKm = vData?.costeKmReferencia ?? null;

                        return (
                          <div
                            key={v.vehiculoId}
                            className={styles.card}
                            style={{
                              borderLeft: `4px solid ${rankBorder}`,
                              position: 'relative',
                              cursor: 'pointer',
                            }}
                            onClick={() => router.push(`/vehiculo/${v.vehiculoId}`)}
                          >
                            {/* Rank badge */}
                            <div style={{
                              position: 'absolute',
                              top: '12px',
                              right: '12px',
                              width: '28px',
                              height: '28px',
                              borderRadius: '8px',
                              background: idx < 3 ? `${rankBorder}20` : 'rgba(255,255,255,0.04)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '0.75rem',
                              fontWeight: '800',
                              color: idx < 3 ? rankBorder : '#4b5563',
                            }}>
                              #{idx + 1}
                            </div>

                            <div className={styles.cardHeader} style={{ marginBottom: '1rem' }}>
                              <div>
                                <h2 className={styles.cardTitle} style={{ fontSize: '1.1rem' }}>{v.vehiculo}</h2>
                                <span className={styles.cardSubtitle}>{v.matricula}</span>
                              </div>
                            </div>

                            {/* Coste Total destacado */}
                            <div style={{
                              background: isTop ? 'rgba(245,158,11,0.08)' : 'rgba(255,255,255,0.02)',
                              border: isTop ? '1px solid rgba(245,158,11,0.2)' : '1px solid rgba(255,255,255,0.05)',
                              borderRadius: '12px',
                              padding: '1rem',
                              marginBottom: '1rem',
                              textAlign: 'center',
                            }}>
                              <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.3rem' }}>{t.dashboard.costTotal6m}</div>
                              <div style={{ fontSize: '1.8rem', fontWeight: '800', color: isTop ? '#f59e0b' : '#fff', letterSpacing: '-1px' }}>
                                €{v.costeTotalSemestre.toLocaleString(locale, { minimumFractionDigits: 2 })}
                              </div>
                            </div>

                            <div className={styles.statRow} style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.4rem' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                                <span className={styles.statLabel}>{t.dashboard.costPerKmReal}</span>
                                <span className={styles.statValue} style={{
                                  color: v.costePorKm === 0 ? '#6b7280' : (v.costePorKm > (flotaKpis?.costePorKmFlota || 0) ? '#ef4444' : '#22c55e'),
                                  fontWeight: '700'
                                }}>
                                  {v.costePorKm === 0 ? '—' : `€${v.costePorKm.toFixed(3)}/km`}
                                  {v.costePorKm > 0 && (
                                    v.costePorKm > (flotaKpis?.costePorKmFlota || 0)
                                      ? <span style={{ marginLeft: '0.4rem', fontSize: '0.7rem', background: 'rgba(239,68,68,0.1)', padding: '2px 6px', borderRadius: '6px' }}>{t.dashboard.overAvg}</span>
                                      : <span style={{ marginLeft: '0.4rem', fontSize: '0.7rem', background: 'rgba(34,197,94,0.1)', padding: '2px 6px', borderRadius: '6px' }}>{t.dashboard.efficient}</span>
                                  )}
                                </span>
                              </div>
                              {refKm !== null && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', padding: '0.4rem 0.6rem', background: 'rgba(167,139,250,0.07)', borderRadius: '8px', border: '1px solid rgba(167,139,250,0.15)' }}>
                                  <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{t.dashboard.refBudget}</span>
                                  <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#a78bfa', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                    €{refKm.toFixed(3)}/km
                                    {v.costePorKm > 0 && (
                                      v.costePorKm > refKm
                                        ? <span style={{ fontSize: '0.65rem', background: 'rgba(239,68,68,0.15)', color: '#f87171', padding: '1px 5px', borderRadius: '5px' }}>+€{(v.costePorKm - refKm).toFixed(3)}</span>
                                        : <span style={{ fontSize: '0.65rem', background: 'rgba(34,197,94,0.15)', color: '#4ade80', padding: '1px 5px', borderRadius: '5px' }}>−€{(refKm - v.costePorKm).toFixed(3)}</span>
                                    )}
                                  </span>
                                </div>
                              )}
                            </div>

                            <div className={styles.statRow}>
                              <span className={styles.statLabel}>{t.dashboard.litersPer100}</span>
                              <span className={styles.statValue}>{v.litrosPor100Km.toFixed(1)}</span>
                            </div>

                            <div className={styles.statRow}>
                              <span className={styles.statLabel}>{t.dashboard.fuel}</span>
                              <span className={styles.statValue} style={{ color: '#f59e0b' }}>€{v.costeCombustible.toFixed(2)}</span>
                            </div>

                            <div className={styles.statRow}>
                              <span className={styles.statLabel}>{t.dashboard.maintenance}</span>
                              <span className={styles.statValue} style={{ color: '#ef4444' }}>€{v.costeMantenimiento.toFixed(2)}</span>
                            </div>

                            <div className={styles.statRow} style={{ borderBottom: 'none' }}>
                              <span className={styles.statLabel}>{t.dashboard.kmTraveled}</span>
                              <span className={styles.statValue}>{v.kmTotales.toLocaleString(locale)} km</span>
                            </div>

                            {/* Mini bar visualizing cost split */}
                            <div style={{ marginTop: '0.75rem' }}>
                              <div style={{ display: 'flex', gap: '2px', height: '6px', borderRadius: '3px', overflow: 'hidden' }}>
                                <div style={{
                                  width: v.costeTotalSemestre > 0 ? `${(v.costeCombustible / v.costeTotalSemestre) * 100}%` : '50%',
                                  background: 'linear-gradient(90deg, #f59e0b, #fbbf24)',
                                  borderRadius: '3px 0 0 3px',
                                }} />
                                <div style={{
                                  width: v.costeTotalSemestre > 0 ? `${(v.costeMantenimiento / v.costeTotalSemestre) * 100}%` : '50%',
                                  background: 'linear-gradient(90deg, #ef4444, #f87171)',
                                  borderRadius: '0 3px 3px 0',
                                }} />
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.3rem' }}>
                                <span style={{ fontSize: '0.65rem', color: '#f59e0b' }}>{t.dashboard.fuel}</span>
                                <span style={{ fontSize: '0.65rem', color: '#ef4444' }}>{t.dashboard.maintenance}</span>
                              </div>
                            </div>

                            {/* Status badge */}
                            <div style={{ marginTop: '0.75rem' }}>
                              <span
                                className={styles.badge}
                                style={{
                                  backgroundColor: v.activo ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                                  color: v.activo ? '#4ade80' : '#f87171',
                                }}
                              >
                                {v.activo ? t.common.active.toUpperCase() : t.vehicle.inWorkshop.toUpperCase()}
                              </span>
                            </div>
                          </div>
                        );
                      })}

                      {flotaKpis.vehiculos.length === 0 && (
                        <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '3rem', background: 'rgba(255,255,255,0.02)', borderRadius: '16px', border: '1px dashed rgba(255,255,255,0.1)' }}>
                          <p style={{ color: '#6b7280' }}>{t.dashboard.noCostData}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
                  <p>{t.dashboard.noCostData || 'No hay datos de costes disponibles'}</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'tracking' && (
            <div className={styles.rutasContainer} style={{ gridTemplateColumns: '1fr', gap: '2rem' }}>
              {/* Mapa Tracking Global */}
              <div className={styles.card} style={{ height: '600px', padding: 0, overflow: 'hidden', position: 'relative', border: '1px solid rgba(59, 246, 59, 0.3)', boxShadow: '0 0 50px rgba(59, 246, 59, 0.1)' }}>
                <MapTrackingGlobal
                  rutasActivas={rutasTrackingActivas}
                  conductoresUbicaciones={conductoresUbicaciones}
                  onRutaClick={(rutaId) => router.push(`/ruta/${rutaId}`)}
                />

                <div style={{ position: 'absolute', top: '20px', right: '20px', background: 'rgba(0,0,0,0.8)', padding: '1rem', borderRadius: '12px', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)', zIndex: 1000 }}>
                  <h3 style={{ fontSize: '0.9rem', color: '#fff', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 10px #22c55e' }}></span>
                    {t.dashboard.live}
                  </h3>
                  <div style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--accent)' }}>
                    {rutasTrackingActivas.length}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>{t.dashboard.vehiclesOnRoute}</div>
                </div>
              </div>

              {/* Lista de Vehículos en Ruta */}
              <div>
                <h3 style={{ marginBottom: '1rem', color: '#fff' }}>{t.dashboard.activeFleetState}</h3>
                <div className={styles.grid}>
                  {rutasTrackingActivas.map(r => {
                    const hasRealGPS = !!(r.latitudActual && r.longitudActual && r.ultimaActualizacionGPS);
                    const status = getConnectionStatus(r.ultimaActualizacionGPS, hasRealGPS);

                    return (
                      <div
                        key={r.id}
                        className={styles.card}
                        onClick={() => router.push(`/ruta/${r.id}`)}
                        style={{ cursor: 'pointer', borderLeft: `4px solid ${status.color}` }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                          <div>
                            <h4 style={{ color: '#fff', fontSize: '1.1rem', marginBottom: '0.2rem' }}>{r.vehiculoId?.slice(-8) || t.dashboard.unknown}</h4>
                            <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>Ruta #{r.id?.slice(-6).toUpperCase()}</span>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <span style={{
                              display: 'inline-block',
                              padding: '0.2rem 0.6rem',
                              borderRadius: '12px',
                              background: `${status.color}20`,
                              color: status.color,
                              fontSize: '0.75rem',
                              fontWeight: '700',
                              border: `1px solid ${status.color}40`
                            }}>
                              {status.label}
                            </span>
                          </div>
                        </div>

                        <div className={styles.statRow}>
                          <span className={styles.statLabel}>{t.dashboard.currLoc}</span>
                          <span className={styles.statValue} style={{ fontSize: '0.85rem' }}>
                            {hasRealGPS
                              ? `${r.latitudActual!.toFixed(4)}, ${r.longitudActual!.toFixed(4)}`
                              : 'Esperando GPS…'}
                          </span>
                        </div>

                        <div className={styles.statRow}>
                          <span className={styles.statLabel}>{t.dashboard.speed}</span>
                          <span className={styles.statValue} style={{ color: '#fff', fontWeight: 'bold' }}>
                            {r.velocidadActualKmh != null ? `${r.velocidadActualKmh.toFixed(0)} km/h` : '—'}
                          </span>
                        </div>

                        <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: '#6b7280' }}>
                          <span>
                            {normalizeRouteState(r.estado) === 'DETENIDO'
                              ? t.dashboard.vehStopped
                              : r.signalSource === 'presence'
                                ? 'Señal de la aplicación activa'
                                : (status.status === 'online' ? t.dashboard.transmitting : (status.status === 'idle' ? t.dashboard.unstableConn : t.dashboard.noConn))}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                  {rutasTrackingActivas.length === 0 && (
                    <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '3rem', background: 'rgba(255,255,255,0.02)', borderRadius: '16px', border: '1px dashed rgba(255,255,255,0.1)' }}>
                      <p style={{ color: '#6b7280' }}>{t.dashboard.noVehiclesActiveRightNow}</p>
                      <button onClick={() => setActiveTab('rutas')} style={{ marginTop: '1rem', background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', textDecoration: 'underline' }}>
                        Planificar una ruta
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </BackgroundMeteors>
  );
}
