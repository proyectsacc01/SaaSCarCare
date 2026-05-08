"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";
import BackgroundMeteors from "@/componentes/BackgroundMeteors";
import styles from "../../dashboard/page.module.css";

interface Vehiculo {
  id: string;
  matricula: string;
  marca: string;
  modelo: string;
  kilometraje: number;
  tipoCombustible: string;
  combustibleActual: number;
  capacidadDeposito?: number;
  costeKmReferencia?: number;
  imagenUrl?: string;
  activo: boolean;
}

/** Compress an image file to a max-dimension JPEG base64 string */
function compressImage(file: File, maxDim = 600, quality = 0.7): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let w = img.width, h = img.height;
      if (w > maxDim || h > maxDim) {
        const ratio = Math.min(maxDim / w, maxDim / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas not supported')); return; }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
}

interface RutaEstado {
  id: string;
  estado: string;
  vehiculoId: string;
  distanciaEstimadaKm?: number;
}

interface Taller {
  nombre: string;
  direccion: string;
  telefono: string;
}

interface Repuesto {
  nombre: string;
  cantidad: number;
  costoUnitario: number;
}

interface Mantenimiento {
  id?: string;
  vehiculoId: string;
  tipo: string;
  descripcion: string;
  fecha: string;
  kilometrajeRealizado: number;
  costo: number;
  taller: Taller;
  repuestos: Repuesto[];
  observaciones: string;
  proximoMantenimiento?: number;
}

interface Repostaje {
  id?: string;
  vehiculoId: string;
  fecha?: string;
  litros: number;
  precioPorLitro: number;
  costeTotal?: number;
  kilometrajeActual?: number;
  estacion?: string;
  notas?: string;
  conductorId?: string;
  conductorNombre?: string;
}

interface DocumentoVehiculo {
  id?: string;
  vehiculoId: string;
  empresaId?: string;
  tipoDocumento: string;
  descripcion: string;
  numeroReferencia: string;
  fechaEmision: string;
  fechaVencimiento: string;
  notas: string;
  vehiculoInfo?: string;
}

interface ProgramacionMantenimiento {
  id?: string;
  vehiculoId: string;
  empresaId?: string;
  nombre: string;
  descripcion: string;
  tipoIntervalo: string; // POR_KM | POR_TIEMPO | AMBOS
  intervaloKm?: number;
  ultimoKmRealizado?: number;
  intervaloMeses?: number;
  ultimaFechaRealizado?: string;
  activo: boolean;
  vehiculoInfo?: string;
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

const TIPOS_DOCUMENTO = (t: any) => [
  { value: "ITV", label: t.vehicle.itv },
  { value: "SEGURO", label: t.vehicle.insurance },
  { value: "PERMISO_CIRCULACION", label: t.vehicle.circulationPermit },
  { value: "TARJETA_TRANSPORTE", label: t.vehicle.transportCard },
  { value: "OTRO", label: t.vehicle.other },
];

function diasHastaVencimiento(fecha: string): number {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const venc = new Date(fecha);
  venc.setHours(0, 0, 0, 0);
  return Math.ceil((venc.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
}

function estadoDocumento(fecha: string, t: any): { label: string; color: string; bg: string } {
  const dias = diasHastaVencimiento(fecha);
  if (dias < 0) return { label: `${t?.vehicle?.expired} ${Math.abs(dias)} ${t?.vehicle?.days}`, color: "#ef4444", bg: "rgba(239,68,68,0.12)" };
  if (dias <= 7) return { label: `${t?.vehicle?.expiresIn} ${dias} ${t?.vehicle?.days}`, color: "#ef4444", bg: "rgba(239,68,68,0.12)" };
  if (dias <= 15) return { label: `${t?.vehicle?.expiresIn} ${dias} ${t?.vehicle?.days}`, color: "#f59e0b", bg: "rgba(245,158,11,0.12)" };
  if (dias <= 30) return { label: `${t?.vehicle?.expiresIn} ${dias} ${t?.vehicle?.days}`, color: "#3b82f6", bg: "rgba(59,130,246,0.12)" };
  return { label: t?.vehicle?.valid || "Vigente", color: "#22c55e", bg: "rgba(34,197,94,0.12)" };
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://saascarcare-production.up.railway.app";
const DASHBOARD_ROUTE = "/dashboard";

export default function VehiculoDetalle() {
  const { t, locale } = useI18n();

  const router = useRouter();
  const params = useParams();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  const [vehiculo, setVehiculo] = useState<Vehiculo | null>(null);
  const [mantenimientos, setMantenimientos] = useState<Mantenimiento[]>([]);
  const [repostajes, setRepostajes] = useState<Repostaje[]>([]);
  const [rutas, setRutas] = useState<RutaEstado[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'mantenimientos' | 'repostajes' | 'documentos' | 'programaciones' | 'editar'>('mantenimientos');
  const [mostrarFormMantenimiento, setMostrarFormMantenimiento] = useState(false);
  const [mostrarFormRepostaje, setMostrarFormRepostaje] = useState(false);
  const [editData, setEditData] = useState<Partial<Vehiculo>>({});
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);

  // ── Documentos ──
  const [documentos, setDocumentos] = useState<DocumentoVehiculo[]>([]);
  const [mostrarFormDocumento, setMostrarFormDocumento] = useState(false);
  const [nuevoDocumento, setNuevoDocumento] = useState<Partial<DocumentoVehiculo>>({
    tipoDocumento: "ITV", descripcion: "", numeroReferencia: "",
    fechaEmision: new Date().toISOString().split("T")[0],
    fechaVencimiento: "", notas: "",
  });

  // ── Programaciones de mantenimiento ──
  const [programaciones, setProgramaciones] = useState<ProgramacionMantenimiento[]>([]);
  const [mostrarFormProgramacion, setMostrarFormProgramacion] = useState(false);
  const [nuevaProgramacion, setNuevaProgramacion] = useState<Partial<ProgramacionMantenimiento>>({
    nombre: "", descripcion: "", tipoIntervalo: "POR_KM",
    intervaloKm: 15000, intervaloMeses: 6, activo: true,
  });

  const [nuevoMantenimiento, setNuevoMantenimiento] = useState<Partial<Mantenimiento>>({
    tipo: "PREVENTIVO",
    descripcion: "",
    fecha: new Date().toISOString().split("T")[0],
    kilometrajeRealizado: 0,
    costo: 0,
    taller: { nombre: "", direccion: "", telefono: "" },
    repuestos: [],
    observaciones: "",
    proximoMantenimiento: 0,
  });

  const [nuevoRepostaje, setNuevoRepostaje] = useState<Partial<Repostaje>>({
    litros: 0,
    precioPorLitro: 1.65,
    kilometrajeActual: 0,
    estacion: "",
    notas: "",
    fecha: new Date().toISOString().split("T")[0],
  });

  const getAuthHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (typeof window === 'undefined') return headers;
    const token = localStorage.getItem("token");
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  };

  useEffect(() => {
    cargarDatos();
  }, [id]);

  const cargarDatos = async () => {
    setLoading(true);
    try {
      const [resVehiculo, resMantenimientos, resRepostajes, resRutas, resDocumentos, resProgramaciones] = await Promise.all([
        fetch(`${API_URL}/api/vehiculos/${id}`, { headers: getAuthHeaders() }),
        fetch(`${API_URL}/api/mantenimientos/vehiculo/${id}`, { headers: getAuthHeaders() }),
        fetch(`${API_URL}/api/repostajes/vehiculo/${id}`, { headers: getAuthHeaders() }),
        fetch(`${API_URL}/api/rutas/vehiculo/${id}`, { headers: getAuthHeaders() }),
        fetch(`${API_URL}/api/documentos/vehiculo/${id}`, { headers: getAuthHeaders() }),
        fetch(`${API_URL}/api/programaciones/vehiculo/${id}`, { headers: getAuthHeaders() }),
      ]);

      if (resVehiculo.ok) setVehiculo(await resVehiculo.json());
      if (resMantenimientos.ok) setMantenimientos(await resMantenimientos.json());
      if (resRepostajes.ok) setRepostajes(await resRepostajes.json());
      if (resRutas.ok) {
        const dataRutas = await resRutas.json();
        setRutas(dataRutas.map((r: RutaEstado) => ({ ...r, estado: normalizeRouteState(r.estado) })));
      }
      if (resDocumentos.ok) setDocumentos(await resDocumentos.json());
      if (resProgramaciones.ok) setProgramaciones(await resProgramaciones.json());
    } catch (err) {
      toast.error(t.vehiclePage.errorLoadData);
    } finally {
      setLoading(false);
    }
  };

  // ── Mantenimiento handlers ─────────────────────────────────────────────────

  const handleCrearMantenimiento = async (e: React.FormEvent) => {
    e.preventDefault();
    const isPreventivo = nuevoMantenimiento.tipo === "PREVENTIVO";
    const endpoint = isPreventivo ? "/api/mantenimientos/preventivo" : "/api/mantenimientos/correctivo";
    try {
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ ...nuevoMantenimiento, vehiculoId: id }),
      });
      if (res.ok) {
        toast.success(isPreventivo ? t.maintenance.preventive : t.maintenance.corrective);
        setMostrarFormMantenimiento(false);
        cargarDatos();
        setNuevoMantenimiento({
          tipo: "PREVENTIVO", descripcion: "",
          fecha: new Date().toISOString().split("T")[0],
          kilometrajeRealizado: vehiculo?.kilometraje || 0,
          costo: 0, taller: { nombre: "", direccion: "", telefono: "" },
          repuestos: [], observaciones: "",
          proximoMantenimiento: (vehiculo?.kilometraje || 0) + 15000,
        });
      }
    } catch { toast.error(t.vehiclePage.errorRegisterMaintenance); }
  };

  const handleEliminarMantenimiento = async (manId: string) => {
    if (!confirm(t.vehiclePage.confirmDeleteRecord)) return;
    try {
      const res = await fetch(`${API_URL}/api/mantenimientos/${manId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (res.ok) { toast.success(t.vehiclePage.maintenanceDeleted); cargarDatos(); }
    } catch { toast.error(t.vehiclePage.errorDeleteMaintenance); }
  };

  const agregarRepuesto = () => {
    setNuevoMantenimiento({
      ...nuevoMantenimiento,
      repuestos: [...(nuevoMantenimiento.repuestos || []), { nombre: "", cantidad: 1, costoUnitario: 0 }],
    });
  };

  const actualizarRepuesto = (index: number, campo: string, valor: any) => {
    const repuestosActualizados = [...(nuevoMantenimiento.repuestos || [])];
    repuestosActualizados[index] = { ...repuestosActualizados[index], [campo]: valor };
    setNuevoMantenimiento({ ...nuevoMantenimiento, repuestos: repuestosActualizados });
  };

  const eliminarRepuesto = (index: number) => {
    setNuevoMantenimiento({
      ...nuevoMantenimiento,
      repuestos: nuevoMantenimiento.repuestos?.filter((_, i) => i !== index),
    });
  };

  // ── Repostaje handlers ──────────────────────────────────────────────────────

  const handleCrearRepostaje = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevoRepostaje.litros || nuevoRepostaje.litros <= 0) {
      toast.warning(t.vehiclePage.enterLiters);
      return;
    }
    if (!nuevoRepostaje.precioPorLitro || nuevoRepostaje.precioPorLitro <= 0) {
      toast.warning(t.vehiclePage.enterPrice);
      return;
    }
    const costeTotal = Math.round((nuevoRepostaje.litros * nuevoRepostaje.precioPorLitro) * 100) / 100;
    try {
      const res = await fetch(`${API_URL}/api/repostajes`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          ...nuevoRepostaje,
          vehiculoId: id,
          costeTotal,
          // LocalDateTime en el backend requiere formato con hora — "2026-04-02" sola da 400
          fecha: nuevoRepostaje.fecha ? `${nuevoRepostaje.fecha}T00:00:00` : undefined,
          kilometrajeActual: nuevoRepostaje.kilometrajeActual && nuevoRepostaje.kilometrajeActual > 0
            ? nuevoRepostaje.kilometrajeActual : undefined,
        }),
      });
      if (res.ok) {
        toast.success(t.metrics.refuelingRegistered.replace('{total}', costeTotal.toFixed(2)));
        setMostrarFormRepostaje(false);
        cargarDatos();
        setNuevoRepostaje({
          litros: 0, precioPorLitro: 1.65, kilometrajeActual: 0,
          estacion: "", notas: "",
          fecha: new Date().toISOString().split("T")[0],
        });
      } else {
        const errBody = await res.text().catch(() => '');
        if (res.status === 403) toast.error(t.vehiclePage.noPermissionVehicle);
        else if (res.status === 400) toast.error(t.conductor.incompleteData);
        else toast.error(`${t.vehiclePage.refuelingError} (${res.status})`);
        console.error('Repostaje error:', res.status, errBody);
      }
    } catch { toast.error(t.vehiclePage.connectionError); }
  };

  const handleEliminarRepostaje = async (repId: string) => {
    if (!confirm(t.vehiclePage.confirmDeleteRecord)) return;
    try {
      const res = await fetch(`${API_URL}/api/repostajes/${repId}`, {
        method: "DELETE", headers: getAuthHeaders(),
      });
      if (res.ok) { toast.success(t.vehiclePage.refuelingDeleted); cargarDatos(); }
    } catch { toast.error(t.vehiclePage.errorDeleteRefueling); }
  };

  // ── Edición del vehículo ───────────────────────────────────────────────────

  const abrirEdicion = () => {
    setEditData({
      marca: vehiculo?.marca,
      modelo: vehiculo?.modelo,
      matricula: vehiculo?.matricula,
      kilometraje: vehiculo?.kilometraje,
      tipoCombustible: vehiculo?.tipoCombustible,
      combustibleActual: vehiculo?.combustibleActual,
      capacidadDeposito: vehiculo?.capacidadDeposito,
      costeKmReferencia: vehiculo?.costeKmReferencia,
      imagenUrl: vehiculo?.imagenUrl,
      activo: vehiculo?.activo,
    });
    setActiveTab('editar');
  };

  const handleGuardarEdicion = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardandoEdicion(true);
    try {
      const res = await fetch(`${API_URL}/api/vehiculos/${id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(editData),
      });
      if (res.ok) {
        toast.success(t.vehiclePage.vehicleUpdated);
        await cargarDatos();
        setActiveTab('mantenimientos');
      } else if (res.status === 403) {
        toast.error(t.vehiclePage.noPermissionEdit);
      } else {
        toast.error(t.vehiclePage.errorSaving);
      }
    } catch {
      toast.error(t.vehiclePage.connectionError);
    } finally {
      setGuardandoEdicion(false);
    }
  };

  // ── Documentos handlers ─────────────────────────────────────────────────────

  const handleCrearDocumento = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevoDocumento.fechaVencimiento) {
      toast.warning(t.vehiclePage.enterExpirationDate);
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/documentos`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ ...nuevoDocumento, vehiculoId: id }),
      });
      if (res.ok) {
        toast.success(t.vehiclePage.documentRegistered);
        setMostrarFormDocumento(false);
        cargarDatos();
        setNuevoDocumento({
          tipoDocumento: "ITV", descripcion: "", numeroReferencia: "",
          fechaEmision: new Date().toISOString().split("T")[0],
          fechaVencimiento: "", notas: "",
        });
      } else if (res.status === 403) {
        toast.error(t.vehiclePage.noPermissionVehicle);
      }
    } catch { toast.error(t.vehiclePage.errorRegisterDocument); }
  };

  const handleEliminarDocumento = async (docId: string) => {
    if (!confirm(t.vehiclePage.confirmDeleteRecord)) return;
    try {
      const res = await fetch(`${API_URL}/api/documentos/${docId}`, {
        method: "DELETE", headers: getAuthHeaders(),
      });
      if (res.ok) { toast.success(t.vehiclePage.documentDeleted); cargarDatos(); }
    } catch { toast.error(t.vehiclePage.errorDeleteDocument); }
  };

  // ── Programaciones handlers ────────────────────────────────────────────────

  const handleCrearProgramacion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevaProgramacion.nombre) {
      toast.warning(t.vehiclePage.enterScheduleName);
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/programaciones`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          ...nuevaProgramacion,
          vehiculoId: id,
          ultimaFechaRealizado: nuevaProgramacion.ultimaFechaRealizado || new Date().toISOString().split("T")[0],
        }),
      });
      if (res.ok) {
        toast.success(t.vehiclePage.scheduleCreated);
        setMostrarFormProgramacion(false);
        cargarDatos();
        setNuevaProgramacion({
          nombre: "", descripcion: "", tipoIntervalo: "POR_KM",
          intervaloKm: 15000, intervaloMeses: 6, activo: true,
        });
      } else if (res.status === 403) {
        toast.error(t.vehiclePage.noPermissionVehicle);
      }
    } catch { toast.error(t.vehiclePage.errorCreateSchedule); }
  };

  const handleMarcarRealizado = async (progId: string) => {
    try {
      const res = await fetch(`${API_URL}/api/programaciones/${progId}/marcar-realizado`, {
        method: "PUT", headers: getAuthHeaders(),
      });
      if (res.ok) {
        toast.success(t.vehiclePage.markedDone);
        cargarDatos();
      }
    } catch { toast.error(t.vehiclePage.errorMarkDone); }
  };

  const handleEliminarProgramacion = async (progId: string) => {
    if (!confirm(t.vehiclePage.confirmDeleteRecord)) return;
    try {
      const res = await fetch(`${API_URL}/api/programaciones/${progId}`, {
        method: "DELETE", headers: getAuthHeaders(),
      });
      if (res.ok) { toast.success(t.vehiclePage.scheduleDeleted); cargarDatos(); }
    } catch { toast.error(t.vehiclePage.errorDeleteSchedule); }
  };

  // ── Métricas ────────────────────────────────────────────────────────────────

  const costoTotalMantenimiento = mantenimientos.reduce((sum, m) => sum + (m.costo || 0), 0);
  const costoTotalCombustible = repostajes.reduce((sum, r) => sum + (r.costeTotal || 0), 0);
  const litrosTotales = repostajes.reduce((sum, r) => sum + (r.litros || 0), 0);
  const costoTotalVehiculo = costoTotalMantenimiento + costoTotalCombustible;

  // L/100km y coste/km: simétricos. Se excluye el PRIMER repostaje tanto para litros como para
  // euros — ese tanque pagó combustible quemado ANTES del primer odómetro registrado, así que
  // no se puede atribuir a los km del rango. Si lo incluyéramos solo en euros (no en litros)
  // el coste/km saldría inflado.
  const repConKm = repostajes
    .filter(r => r.kilometrajeActual && r.kilometrajeActual > 0)
    .sort((a, b) => (a.kilometrajeActual || 0) - (b.kilometrajeActual || 0));
  let consumoCalculado: number | null = null;
  let costeCombustibleEnRango = 0;
  let kmRangoRepostajes = 0;
  if (repConKm.length >= 2) {
    kmRangoRepostajes = repConKm[repConKm.length - 1].kilometrajeActual! - repConKm[0].kilometrajeActual!;
    const repostajesPosteriores = repConKm.slice(1);
    const litrosEnRango = repostajesPosteriores.reduce((sum, r) => sum + (r.litros || 0), 0);
    costeCombustibleEnRango = repostajesPosteriores.reduce((sum, r) => sum + (r.costeTotal || 0), 0);
    if (kmRangoRepostajes > 10 && litrosEnRango > 0) {
      consumoCalculado = (litrosEnRango / kmRangoRepostajes) * 100;
    }
  }

  // Mantenimientos atribuibles al rango: solo los que caen entre el primer y último odómetro
  const kmMinRep = repConKm.length > 0 ? repConKm[0].kilometrajeActual! : 0;
  const kmMaxRep = repConKm.length > 0 ? repConKm[repConKm.length - 1].kilometrajeActual! : 0;
  const costoMantenimientoEnRango = repConKm.length >= 2
    ? mantenimientos
        .filter(m => m.kilometrajeRealizado >= kmMinRep && m.kilometrajeRealizado <= kmMaxRep)
        .reduce((sum, m) => sum + (m.costo || 0), 0)
    : 0;

  // Coste OPERATIVO (combustible) por km — simétrico al cálculo de L/100km
  const costeCombustibleKm = kmRangoRepostajes > 10 && costeCombustibleEnRango > 0
    ? costeCombustibleEnRango / kmRangoRepostajes
    : null;
  // Coste TOTAL (combustible + mantenimiento) por km — TCO real del vehículo, mismo rango
  const costeKmReal = kmRangoRepostajes > 10 && (costeCombustibleEnRango + costoMantenimientoEnRango) > 0
    ? (costeCombustibleEnRango + costoMantenimientoEnRango) / kmRangoRepostajes
    : null;

  // Para chips/info de "km recorridos" usamos el rango completo de TODOS los registros
  const todosKmRegistrados = [
    ...mantenimientos.filter(m => m.kilometrajeRealizado > 0).map(m => m.kilometrajeRealizado),
    ...repostajes.filter(r => r.kilometrajeActual && r.kilometrajeActual > 0).map(r => r.kilometrajeActual!),
  ];
  const kmRegistradoMax = todosKmRegistrados.length > 0 ? Math.max(...todosKmRegistrados) : 0;
  const kmRegistradoMin = todosKmRegistrados.length > 0 ? Math.min(...todosKmRegistrados) : 0;
  const kmRecorridos = kmRegistradoMax - kmRegistradoMin;
  // Fallback: si hay rutas completadas, estimar desde distancia total recorrida
  if (consumoCalculado == null && litrosTotales > 0) {
    const kmCompletadas = rutas
      .filter(r => r.estado === 'COMPLETADA')
      .reduce((sum, r) => sum + (r.distanciaEstimadaKm || 0), 0);
    if (kmCompletadas > 10) {
      consumoCalculado = (litrosTotales / kmCompletadas) * 100;
    }
  }
  // Aviso de valor inusual: por debajo de 2 L/100km o por encima de 30 L/100km es físicamente
  // improbable para un vehículo común. Suele indicar km mal registrados en repostajes.
  const consumoFueraDeRango = consumoCalculado != null && (consumoCalculado < 2 || consumoCalculado > 30);

  // Combustible actual: clamp 0-100 para evitar mostrar 132% si el backend manda valores absolutos
  const combustiblePct = vehiculo?.combustibleActual != null
    ? Math.max(0, Math.min(100, vehiculo.combustibleActual))
    : null;

  // Estado real del vehículo cruzando datos de rutas activas
  const enCurso = rutas.some(r => normalizeRouteState(r.estado) === 'EN_CURSO');
  const detenido = rutas.some(r => normalizeRouteState(r.estado) === 'DETENIDO');
  const estadoVehiculo = enCurso ? 'EN_RUTA' : detenido ? 'DETENIDO' : vehiculo?.activo ? 'ACTIVO' : 'EN_TALLER';
  const estadoColor = { EN_RUTA: '#3bf63b', DETENIDO: '#facc15', ACTIVO: '#3bf63b', EN_TALLER: '#f87171' }[estadoVehiculo];
  const estadoLabel = { 
    EN_RUTA: t.vehicle.onRoute || 'En Ruta', 
    DETENIDO: t.vehicle.stopped || 'Detenido', 
    ACTIVO: t.common.active || 'Activo', 
    EN_TALLER: t.vehicle.inWorkshop || 'En Taller' 
  }[estadoVehiculo];



  const costeTotal = nuevoRepostaje.litros && nuevoRepostaje.precioPorLitro
    ? Math.round((nuevoRepostaje.litros * nuevoRepostaje.precioPorLitro) * 100) / 100
    : 0;

  if (loading) {
    return (
      <BackgroundMeteors>
        <div style={{ padding: "2rem", color: "white" }}>{t.common.loading}</div>
      </BackgroundMeteors>
    );
  }

  if (!vehiculo) {
    return (
      <BackgroundMeteors>
        <div style={{ padding: "2rem", color: "white" }}>{t.vehicle.notFound}</div>
      </BackgroundMeteors>
    );
  }

  return (
    <BackgroundMeteors>
      <main style={{ height: "100%", width: "100%", overflowY: "auto", position: "relative", zIndex: 20, paddingBottom: "100px" }}>
        <style>{`
          .vehiculo-header-main {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 1rem;
            width: 100%;
            flex-wrap: wrap;
          }
          .vehiculo-tabs {
            display: flex;
            gap: 0.5rem;
            margin-bottom: 1.5rem;
            background: #0d1117;
            padding: 0.35rem;
            border-radius: 10px;
            border: 1px solid rgba(255,255,255,0.08);
            width: 100%;
            overflow-x: auto;
            scrollbar-width: none;
            -ms-overflow-style: none;
          }
          .vehiculo-tabs::-webkit-scrollbar {
            display: none;
          }
          .vehiculo-tab-button {
            flex: 0 0 auto;
            white-space: nowrap;
          }
          .vehiculo-sparepart-row {
            display: grid;
            grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr) auto;
            gap: 0.5rem;
            align-items: end;
          }
          @media (max-width: 640px) {
            .vehiculo-header-main > button {
              width: 100%;
            }
            .vehiculo-tab-button {
              font-size: 0.8rem !important;
              padding: 0.55rem 0.95rem !important;
            }
            .vehiculo-card-metrics,
            .vehiculo-sparepart-row {
              grid-template-columns: 1fr !important;
            }
          }
        `}</style>
        <div className={styles.container}>
          <header className={styles.header}>
            <button
              onClick={() => router.push(DASHBOARD_ROUTE)}
              style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", padding: "0.5rem 1rem", borderRadius: "8px", color: "white", cursor: "pointer", marginBottom: "1rem" }}
            >← {t.vehicle.backToDashboard}</button>
            <div className="vehiculo-header-main">
              <div className={styles.title}>
                <h1>{vehiculo.marca} {vehiculo.modelo}</h1>
                <p className={styles.subtitle}>{t.vehicle.plate || t.vehicle.licensePlate}: {vehiculo.matricula}</p>
              </div>
              <button
                onClick={abrirEdicion}
                style={{ background: 'rgba(167,139,250,0.15)', border: '1px solid rgba(167,139,250,0.3)', padding: '0.5rem 1.1rem', borderRadius: '8px', color: '#a78bfa', cursor: 'pointer', fontWeight: '600', fontSize: '0.875rem', whiteSpace: 'nowrap' }}
              >✏️ {t.vehicle.editVehicle}</button>
            </div>
          </header>

          {/* ── Resumen financiero del vehículo ──────────────────────────── */}
          <div className={styles.card} style={{ marginBottom: "2rem" }}>
            <h3 className={styles.cardTitle} style={{ marginBottom: '1.25rem' }}>{t.vehicle.summary}</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem" }}>

              <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '12px', padding: '1rem', border: '1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ display: 'block', fontSize: '0.65rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.3rem' }}>{t.metrics.mileage}</span>
                <span style={{ fontSize: '1.5rem', fontWeight: '800', color: '#fff' }}>{vehiculo.kilometraje?.toLocaleString()}</span>
                <span style={{ fontSize: '0.75rem', color: '#4b5563', marginLeft: '0.3rem' }}>km</span>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '12px', padding: '1rem', border: '1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ display: 'block', fontSize: '0.65rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.3rem' }}>{t.metrics.fuel}</span>
                <span style={{ fontSize: '1.5rem', fontWeight: '800', color: combustiblePct != null && combustiblePct < 20 ? '#ef4444' : '#f59e0b' }}>{combustiblePct != null ? combustiblePct.toLocaleString(locale, { maximumFractionDigits: 1 }) : '—'}</span>
                <span style={{ fontSize: '0.75rem', color: '#4b5563', marginLeft: '0.3rem' }}>%</span>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '12px', padding: '1rem', border: '1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ display: 'block', fontSize: '0.65rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.3rem' }}>{t.metrics.fuelCost}</span>
                <span style={{ fontSize: '1.5rem', fontWeight: '800', color: '#f59e0b' }}>{costoTotalCombustible.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                <span style={{ fontSize: '0.75rem', color: '#4b5563', marginLeft: '0.3rem' }}>€ · {litrosTotales.toFixed(0)}L {t.common.total}</span>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '12px', padding: '1rem', border: '1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ display: 'block', fontSize: '0.65rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.3rem' }}>{t.metrics.maintenanceCost}</span>
                <span style={{ fontSize: '1.5rem', fontWeight: '800', color: '#ef4444' }}>{costoTotalMantenimiento.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                <span style={{ fontSize: '0.75rem', color: '#4b5563', marginLeft: '0.3rem' }}>€</span>
              </div>

              <div style={{ background: 'rgba(59, 246, 59, 0.05)', borderRadius: '12px', padding: '1rem', border: '1px solid rgba(59, 246, 59, 0.15)' }}>
                <span style={{ display: 'block', fontSize: '0.65rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.3rem' }}>{t.metrics.totalAccumulated}</span>
                <span style={{ fontSize: '1.5rem', fontWeight: '800', color: '#3bf63b' }}>{costoTotalVehiculo.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                <span style={{ fontSize: '0.75rem', color: '#4b5563', marginLeft: '0.3rem' }}>€</span>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '12px', padding: '1rem', border: '1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ display: 'block', fontSize: '0.65rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.3rem' }}>{t.vehicle.status}</span>
                <span style={{ fontSize: '1rem', fontWeight: '700', color: estadoColor }}>{estadoLabel}</span>
                <span style={{ display: 'block', fontSize: '0.75rem', color: '#4b5563', marginTop: '0.2rem' }}>{t.fuel[vehiculo.tipoCombustible as keyof typeof t.fuel] || vehiculo.tipoCombustible}</span>
              </div>

              <div style={{ background: 'rgba(167,139,250,0.06)', borderRadius: '12px', padding: '1rem', border: '1px solid rgba(167,139,250,0.15)' }}>
                <span style={{ display: 'block', fontSize: '0.65rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.3rem' }}>{t.metrics.fuelCostPerKm}</span>
                <span style={{ fontSize: '1.35rem', fontWeight: '800', color: '#f59e0b' }}>
                  {costeCombustibleKm != null ? `€${costeCombustibleKm.toFixed(2)}` : '—'}
                </span>
                <span style={{ display: 'block', fontSize: '0.65rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: '0.6rem', marginBottom: '0.2rem' }}>{t.metrics.totalCostPerKm}</span>
                <span style={{ fontSize: '1.35rem', fontWeight: '800', color: '#a78bfa' }}>
                  {costeKmReal != null ? `€${costeKmReal.toFixed(2)}` : '—'}
                </span>
                {costeKmReal != null && kmRecorridos > 0 && (
                  <span style={{ display: 'block', fontSize: '0.68rem', color: '#4b5563', marginTop: '0.3rem' }}>
                    {kmRecorridos.toLocaleString(locale)} {t.metrics.kmRegistered}
                  </span>
                )}
                {costeKmReal != null && vehiculo.costeKmReferencia && vehiculo.costeKmReferencia > 0 && (
                  <span style={{
                    display: 'inline-block', fontSize: '0.65rem', marginTop: '0.3rem',
                    padding: '2px 6px', borderRadius: '5px',
                    background: costeKmReal <= vehiculo.costeKmReferencia ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                    color: costeKmReal <= vehiculo.costeKmReferencia ? '#4ade80' : '#f87171',
                  }}>
                    {costeKmReal <= vehiculo.costeKmReferencia ? '✓ ' : '⚠ '}
                    vs €{vehiculo.costeKmReferencia.toFixed(2)}/km
                  </span>
                )}
                {costeKmReal == null && (
                  <span style={{ display: 'block', fontSize: '0.68rem', color: '#4b5563', marginTop: '0.2rem' }}>
                    {t.metrics.registerKmHint}
                  </span>
                )}
              </div>

              <div style={{ background: 'rgba(56,189,248,0.06)', borderRadius: '12px', padding: '1rem', border: '1px solid rgba(56,189,248,0.15)' }}>
                <span style={{ display: 'block', fontSize: '0.65rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.3rem' }}>{t.metrics.realConsumption}</span>
                <span style={{ fontSize: '1.5rem', fontWeight: '800', color: consumoFueraDeRango ? '#f59e0b' : '#38bdf8' }}>
                  {consumoCalculado != null ? consumoCalculado.toFixed(1) : '—'}
                </span>
                {consumoCalculado != null && (
                  <span style={{ fontSize: '0.75rem', color: '#4b5563', marginLeft: '0.3rem' }}>
                    L/100km
                  </span>
                )}
                <span style={{ display: 'block', fontSize: '0.68rem', color: '#4b5563', marginTop: '0.2rem' }}>
                  {consumoCalculado != null
                    ? (repConKm.length >= 2 ? t.metrics.calculatedFrom.replace('{n}', String(repConKm.length)) : t.metrics.estimatedFromRoutes)
                    : (repostajes.length === 0
                        ? t.metrics.noRefuels
                        : t.metrics.registerKmToCalc
                      )
                  }
                </span>
                {consumoFueraDeRango && (
                  <span style={{ display: 'block', fontSize: '0.65rem', color: '#f59e0b', marginTop: '0.3rem', padding: '2px 6px', borderRadius: '5px', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)' }}>
                    ⚠ {t.metrics.consumptionWarning}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* ── Tabs ──────────────────────────────────────────────────────── */}
          <div className="vehiculo-tabs">
            <button
              className="vehiculo-tab-button"
              onClick={() => setActiveTab('mantenimientos')}
              style={{
                padding: '0.6rem 1.25rem', borderRadius: '8px', border: 'none', cursor: 'pointer',
                fontWeight: '600', fontSize: '0.875rem', transition: 'all 0.2s',
                background: activeTab === 'mantenimientos' ? 'linear-gradient(135deg, #3bf63b, #22c55e)' : 'transparent',
                color: activeTab === 'mantenimientos' ? '#000' : 'rgba(255,255,255,0.5)',
                boxShadow: activeTab === 'mantenimientos' ? '0 2px 12px rgba(59,246,59,0.35)' : 'none',
              }}
            >
              🔧 {t.tabs.maintenance} ({mantenimientos.length})
            </button>
            <button
              className="vehiculo-tab-button"
              onClick={() => setActiveTab('repostajes')}
              style={{
                padding: '0.6rem 1.25rem', borderRadius: '8px', border: 'none', cursor: 'pointer',
                fontWeight: '600', fontSize: '0.875rem', transition: 'all 0.2s',
                background: activeTab === 'repostajes' ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'transparent',
                color: activeTab === 'repostajes' ? '#000' : 'rgba(255,255,255,0.5)',
                boxShadow: activeTab === 'repostajes' ? '0 2px 12px rgba(245,158,11,0.35)' : 'none',
              }}
            >
              ⛽ {t.tabs.refueling} ({repostajes.length})
            </button>
            <button
              className="vehiculo-tab-button"
              onClick={() => setActiveTab('documentos')}
              style={{
                padding: '0.6rem 1.25rem', borderRadius: '8px', border: 'none', cursor: 'pointer',
                fontWeight: '600', fontSize: '0.875rem', transition: 'all 0.2s',
                background: activeTab === 'documentos' ? 'linear-gradient(135deg, #3b82f6, #2563eb)' : 'transparent',
                color: activeTab === 'documentos' ? '#fff' : 'rgba(255,255,255,0.5)',
                boxShadow: activeTab === 'documentos' ? '0 2px 12px rgba(59,130,246,0.35)' : 'none',
              }}
            >
              📄 {t.tabs.documents} ({documentos.length})
            </button>
            <button
              className="vehiculo-tab-button"
              onClick={() => setActiveTab('programaciones')}
              style={{
                padding: '0.6rem 1.25rem', borderRadius: '8px', border: 'none', cursor: 'pointer',
                fontWeight: '600', fontSize: '0.875rem', transition: 'all 0.2s',
                background: activeTab === 'programaciones' ? 'linear-gradient(135deg, #8b5cf6, #6d28d9)' : 'transparent',
                color: activeTab === 'programaciones' ? '#fff' : 'rgba(255,255,255,0.5)',
                boxShadow: activeTab === 'programaciones' ? '0 2px 12px rgba(139,92,246,0.35)' : 'none',
              }}
            >
              📅 {t.tabs.schedules} ({programaciones.length})
            </button>
            <button
              className="vehiculo-tab-button"
              onClick={abrirEdicion}
              style={{
                padding: '0.6rem 1.25rem', borderRadius: '8px', border: 'none', cursor: 'pointer',
                fontWeight: '600', fontSize: '0.875rem', transition: 'all 0.2s',
                background: activeTab === 'editar' ? 'linear-gradient(135deg, #a78bfa, #7c3aed)' : 'transparent',
                color: activeTab === 'editar' ? '#fff' : 'rgba(255,255,255,0.5)',
                boxShadow: activeTab === 'editar' ? '0 2px 12px rgba(167,139,250,0.35)' : 'none',
              }}
            >
              ✏️ {t.tabs.edit}
            </button>
          </div>

          {/* ══════════════════════════════════════════════════════════════════
              TAB: MANTENIMIENTOS
          ══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'mantenimientos' && (
            <>
              <div style={{ marginBottom: "2rem" }}>
                <button
                  onClick={() => setMostrarFormMantenimiento(!mostrarFormMantenimiento)}
                  className={styles.submitButton}
                  style={{ width: "auto" }}
                >
                  {mostrarFormMantenimiento ? t.common.cancel : t.maintenance.newMaintenance}
                </button>
              </div>

              {mostrarFormMantenimiento && (
                <div className={styles.formContainer} style={{ marginBottom: "2rem" }}>
                  <h3 style={{ marginBottom: "1rem" }}>{t.maintenance.registerMaintenance}</h3>
                  <form onSubmit={handleCrearMantenimiento}>
                    <div className={styles.formRow}>
                      <div className={styles.formGroup}>
                        <label className={styles.label}>{t.maintenance.type}</label>
                        <select className={styles.select} value={nuevoMantenimiento.tipo}
                          onChange={(e) => setNuevoMantenimiento({ ...nuevoMantenimiento, tipo: e.target.value })} required>
                          <option value="PREVENTIVO">{t.maintenance.preventive}</option>
                          <option value="CORRECTIVO">{t.maintenance.corrective}</option>
                        </select>
                      </div>
                      <div className={styles.formGroup}>
                        <label className={styles.label}>{t.maintenance.date}</label>
                        <input className={styles.input} type="date" value={nuevoMantenimiento.fecha}
                          onChange={(e) => setNuevoMantenimiento({ ...nuevoMantenimiento, fecha: e.target.value })} required />
                      </div>
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.label}>{t.maintenance.description}</label>
                      <input className={styles.input} type="text" placeholder={t.maintenance.descriptionPlaceholder || "Ej: Cambio de aceite y filtros"}
                        value={nuevoMantenimiento.descripcion}
                        onChange={(e) => setNuevoMantenimiento({ ...nuevoMantenimiento, descripcion: e.target.value })} required />
                    </div>

                    <div className={styles.formRow}>
                      <div className={styles.formGroup}>
                        <label className={styles.label}>{t.maintenance.mileageAtService}</label>
                        <input className={styles.input} type="number" min="0" step="1" placeholder="125000"
                          value={nuevoMantenimiento.kilometrajeRealizado || ''}
                          onChange={(e) => setNuevoMantenimiento({ ...nuevoMantenimiento, kilometrajeRealizado: parseInt(e.target.value) || 0 })} required />
                      </div>
                      <div className={styles.formGroup}>
                        <label className={styles.label}>{t.maintenance.totalCost} (€)</label>
                        <input className={styles.input} type="number" min="0" step="0.01" placeholder="120.50"
                          value={nuevoMantenimiento.costo || ''}
                          onChange={(e) => setNuevoMantenimiento({ ...nuevoMantenimiento, costo: parseFloat(e.target.value) || 0 })} required />
                      </div>
                    </div>

                    {nuevoMantenimiento.tipo === "PREVENTIVO" && (
                      <div className={styles.formGroup} style={{ marginTop: '1rem' }}>
                        <label className={styles.label}>{t.maintenance.nextMaintenance}</label>
                        <input className={styles.input} type="number"
                          min={nuevoMantenimiento.kilometrajeRealizado || 0} step="500" placeholder="140000"
                          value={nuevoMantenimiento.proximoMantenimiento || ''}
                          onChange={(e) => setNuevoMantenimiento({ ...nuevoMantenimiento, proximoMantenimiento: parseInt(e.target.value) || 0 })} />
                      </div>
                    )}

                    <h4 style={{ marginTop: "1.5rem", marginBottom: "1rem", color: "var(--accent)" }}>{t.maintenance.workshop}</h4>
                    <div className={styles.formRow}>
                      <div className={styles.formGroup}>
                        <label className={styles.label}>{t.maintenance.workshopName}</label>
                        <input className={styles.input} type="text" placeholder={t.maintenance.workshopPlaceholder || "Taller Mecánico S.L."}
                          value={nuevoMantenimiento.taller?.nombre}
                          onChange={(e) => setNuevoMantenimiento({ ...nuevoMantenimiento, taller: { ...nuevoMantenimiento.taller!, nombre: e.target.value } })} required />
                      </div>
                      <div className={styles.formGroup}>
                        <label className={styles.label}>{t.maintenance.workshopAddress}</label>
                        <input className={styles.input} type="text" placeholder={t.maintenance.addressPlaceholder || "Calle Principal 123"}
                          value={nuevoMantenimiento.taller?.direccion}
                          onChange={(e) => setNuevoMantenimiento({ ...nuevoMantenimiento, taller: { ...nuevoMantenimiento.taller!, direccion: e.target.value } })} />
                      </div>
                      <div className={styles.formGroup}>
                        <label className={styles.label}>{t.maintenance.workshopPhone}</label>
                        <input className={styles.input} type="tel" placeholder="123456789"
                          value={nuevoMantenimiento.taller?.telefono}
                          onChange={(e) => setNuevoMantenimiento({ ...nuevoMantenimiento, taller: { ...nuevoMantenimiento.taller!, telefono: e.target.value } })} />
                      </div>
                    </div>

                    <h4 style={{ marginTop: "1.5rem", marginBottom: "1rem", color: "var(--accent)" }}>{t.maintenance.spareParts}</h4>
                    {nuevoMantenimiento.repuestos?.map((rep, index) => (
                      <div key={index} className="vehiculo-sparepart-row" style={{ marginBottom: "0.5rem" }}>
                        <div className={styles.formGroup} style={{ flex: 2 }}>
                          <label className={styles.label}>{t.maintenance.partName}</label>
                          <input className={styles.input} type="text" placeholder={t.maintenance.partPlaceholder || "Filtro de aceite"}
                            value={rep.nombre} onChange={(e) => actualizarRepuesto(index, "nombre", e.target.value)} />
                        </div>
                        <div className={styles.formGroup} style={{ flex: 1 }}>
                          <label className={styles.label}>{t.maintenance.quantity}</label>
                          <input className={styles.input} type="number" value={rep.cantidad}
                            onChange={(e) => actualizarRepuesto(index, "cantidad", Number(e.target.value))} />
                        </div>
                        <div className={styles.formGroup} style={{ flex: 1 }}>
                          <label className={styles.label}>{t.maintenance.unitCost}</label>
                          <input className={styles.input} type="number" step="0.01" value={rep.costoUnitario}
                            onChange={(e) => actualizarRepuesto(index, "costoUnitario", Number(e.target.value))} />
                        </div>
                        <button type="button" onClick={() => eliminarRepuesto(index)}
                          style={{ background: "#ef4444", border: "none", padding: "0.5rem 1rem", borderRadius: "6px", color: "white", cursor: "pointer" }}>✕</button>
                      </div>
                    ))}
                    <button type="button" onClick={agregarRepuesto}
                      style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", padding: "0.5rem 1rem", borderRadius: "6px", color: "white", cursor: "pointer", marginTop: "0.5rem" }}>
                      {t.maintenance.addSparePart}
                    </button>

                    <div className={styles.formGroup} style={{ marginTop: "1.5rem" }}>
                      <label className={styles.label}>{t.maintenance.observations}</label>
                      <textarea className={styles.input} rows={3} placeholder={t.maintenance.observationsPlaceholder || "Notas adicionales..."}
                        value={nuevoMantenimiento.observaciones}
                        onChange={(e) => setNuevoMantenimiento({ ...nuevoMantenimiento, observaciones: e.target.value })} />
                    </div>
                    <button type="submit" className={styles.submitButton} style={{ marginTop: "1rem" }}>
                      {t.maintenance.saveMaintenance}
                    </button>
                  </form>
                </div>
              )}

              <h2 style={{ marginBottom: "1rem" }}>{t.maintenance.history}</h2>
              <div className={styles.grid}>
                {mantenimientos.map((m) => {
                  const esPreventivo = m.tipo === "PREVENTIVO";
                  return (
                    <div key={m.id} className={styles.card}
                      style={{ borderLeft: `6px solid ${esPreventivo ? "#22c55e" : "#ef4444"}`, background: 'linear-gradient(145deg, rgba(30,30,40,0.95), rgba(20,20,25,0.9))' }}>
                      <div className={styles.cardHeader}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', marginBottom: '0.6rem' }}>
                            <span className={styles.badge} style={{
                              backgroundColor: esPreventivo ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)",
                              color: esPreventivo ? "#4ade80" : "#f87171",
                              border: `1px solid ${esPreventivo ? "rgba(34, 197, 94, 0.2)" : "rgba(239, 68, 68, 0.2)"}`,
                            }}>{esPreventivo ? t.maintenance.preventive.toUpperCase() : t.maintenance.corrective.toUpperCase()}</span>
                            <span style={{ fontSize: "0.7rem", color: "#444", fontFamily: 'monospace' }}>#{m.id?.slice(-6).toUpperCase()}</span>
                          </div>
                          <h4 className={styles.cardTitle} style={{ fontSize: '1.1rem', marginBottom: '0.4rem' }}>{m.descripcion}</h4>
                          <div style={{ display: 'flex', gap: '0.8rem', color: "#9ca3af", fontSize: "0.8rem", flexWrap: 'wrap' }}>
                            <span>📅 {new Date(m.fecha).toLocaleDateString(locale)}</span>
                            <span>🏭 {m.taller?.nombre || t.vehiclePage.officialWorkshop}</span>
                          </div>
                        </div>
                        <button onClick={() => m.id && handleEliminarMantenimiento(m.id)}
                          style={{ background: 'rgba(239, 68, 68, 0.1)', border: 'none', cursor: 'pointer', color: "#ef4444", width: '32px', height: '32px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                      </div>

                      <div className="vehiculo-card-metrics" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1.5rem', background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <div>
                          <span style={{ display: 'block', fontSize: '0.65rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.2rem' }}>{t.metrics.mileage}</span>
                          <span style={{ fontSize: '1.15rem', fontWeight: '800', color: '#fff' }}>{m.kilometrajeRealizado?.toLocaleString(locale)} <span style={{ fontSize: '0.75rem', color: '#4b5563' }}>KM</span></span>
                        </div>
                        <div>
                          <span style={{ display: 'block', fontSize: '0.65rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.2rem' }}>{t.maintenance.totalCost}</span>
                          <span style={{ fontSize: '1.15rem', fontWeight: '800', color: esPreventivo ? '#4ade80' : '#f87171' }}>{m.costo?.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span style={{ fontSize: '0.75rem', color: '#4b5563' }}>€</span></span>
                        </div>
                      </div>

                      {esPreventivo && m.proximoMantenimiento && (
                        <div style={{ marginTop: '1rem', padding: '0.7rem 1rem', background: 'rgba(34, 197, 94, 0.05)', borderRadius: '10px', border: '1px solid rgba(34, 197, 94, 0.15)', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#22c55e', boxShadow: '0 0 8px #22c55e' }} />
                          <span style={{ fontSize: '0.8rem', color: '#4ade80' }}>
                            {t.maintenance.nextReview}: <strong style={{ color: '#fff' }}>{m.proximoMantenimiento.toLocaleString(locale)} km</strong>
                          </span>
                        </div>
                      )}

                      {m.repuestos && m.repuestos.length > 0 && (
                        <div style={{ marginTop: "1.2rem" }}>
                          <div style={{ color: 'var(--accent)', fontSize: '0.75rem', fontWeight: '600', marginBottom: '0.6rem', textTransform: 'uppercase' }}>
                            {m.repuestos.length} {t.maintenance.sparePartsInstalled}
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                            {m.repuestos.map((rep, index) => (
                              <span key={index} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', padding: '0.2rem 0.5rem', borderRadius: '6px', fontSize: '0.7rem', color: '#9ca3af' }}>
                                {rep.nombre} <small style={{ color: '#4b5563' }}>x{rep.cantidad}</small>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {m.observaciones && (
                        <div style={{ marginTop: '1.2rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.8rem' }}>
                          <p style={{ fontSize: "0.8rem", color: "#6b7280", fontStyle: 'italic' }}>
                            <span style={{ color: '#4b5563', marginRight: '0.3rem' }}>{t.maintenance.notes}:</span>{m.observaciones}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
                {mantenimientos.length === 0 && (
                  <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '4rem 2rem', background: 'rgba(255,255,255,0.02)', borderRadius: '24px', border: '2px dashed rgba(255,255,255,0.05)' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.3 }}>🔧</div>
                    <h3 style={{ color: '#fff', marginBottom: '0.5rem' }}>{t.maintenance.noHistory}</h3>
                    <p style={{ color: "#6b7280" }}>{t.maintenance.noHistoryDesc}</p>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB: REPOSTAJES
          ══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'repostajes' && (
            <>
              {/* Stats de combustible */}
              {repostajes.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
                  <div style={{ background: 'rgba(245,158,11,0.08)', borderRadius: '12px', padding: '1rem', border: '1px solid rgba(245,158,11,0.2)', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.65rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.3rem' }}>{t.refueling.totalSpent}</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#f59e0b' }}>€{costoTotalCombustible.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                  </div>
                  <div style={{ background: 'rgba(245,158,11,0.08)', borderRadius: '12px', padding: '1rem', border: '1px solid rgba(245,158,11,0.2)', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.65rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.3rem' }}>{t.refueling.totalLiters}</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#f59e0b' }}>{litrosTotales.toLocaleString(locale, { maximumFractionDigits: 1 })} L</div>
                  </div>
                  <div style={{ background: 'rgba(245,158,11,0.08)', borderRadius: '12px', padding: '1rem', border: '1px solid rgba(245,158,11,0.2)', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.65rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.3rem' }}>{t.refueling.averagePrice}</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#f59e0b' }}>
                      €{litrosTotales > 0 ? (costoTotalCombustible / litrosTotales).toLocaleString(locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 }) : '—'}
                      <span style={{ fontSize: '0.7rem', color: '#6b7280' }}>/L</span>
                    </div>
                  </div>
                  <div style={{ background: 'rgba(245,158,11,0.08)', borderRadius: '12px', padding: '1rem', border: '1px solid rgba(245,158,11,0.2)', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.65rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.3rem' }}>{t.refueling.refuelings}</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#f59e0b' }}>{repostajes.length}</div>
                  </div>
                </div>
              )}

              <div style={{ marginBottom: "2rem" }}>
                <button
                  onClick={() => setMostrarFormRepostaje(!mostrarFormRepostaje)}
                  style={{ padding: '0.875rem 1.5rem', background: mostrarFormRepostaje ? 'rgba(255,255,255,0.1)' : 'linear-gradient(135deg, #f59e0b, #d97706)', color: mostrarFormRepostaje ? 'white' : '#000', border: mostrarFormRepostaje ? '1px solid rgba(255,255,255,0.2)' : 'none', borderRadius: '10px', fontWeight: '700', fontSize: '0.95rem', cursor: 'pointer', transition: 'all 0.2s' }}
                >
                  {mostrarFormRepostaje ? t.common.cancel : t.refueling.registerRefueling}
                </button>
              </div>

              {mostrarFormRepostaje && (
                <div className={styles.formContainer} style={{ marginBottom: "2rem" }}>
                  <h3 style={{ marginBottom: "1.25rem", color: '#f59e0b' }}>{t.refueling.registerRefueling}</h3>
                  <form onSubmit={handleCrearRepostaje}>
                    <div className={styles.formRow}>
                      <div className={styles.formGroup}>
                        <label className={styles.label}>{t.maintenance.date}</label>
                        <input className={styles.input} type="date"
                          value={nuevoRepostaje.fecha}
                          onChange={(e) => setNuevoRepostaje({ ...nuevoRepostaje, fecha: e.target.value })} required />
                      </div>
                      <div className={styles.formGroup}>
                        <label className={styles.label}>{t.refueling.station} <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>({t.common.optional})</span></label>
                        <input className={styles.input} type="text" placeholder={t.refueling.stationPlaceholder || "Ej: Repsol Av. Principal"}
                          value={nuevoRepostaje.estacion}
                          onChange={(e) => setNuevoRepostaje({ ...nuevoRepostaje, estacion: e.target.value })} />
                      </div>
                    </div>

                    <div className={styles.formRow}>
                      <div className={styles.formGroup}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                          <label className={styles.label} style={{ marginBottom: 0 }}>{t.refueling.liters}</label>
                          <span style={{ fontWeight: 'bold', color: '#f59e0b' }}>{nuevoRepostaje.litros} L</span>
                        </div>
                        <input className={styles.input} type="number" step="0.1" min="0.1" placeholder="45.0"
                          value={nuevoRepostaje.litros || ''}
                          onChange={(e) => setNuevoRepostaje({ ...nuevoRepostaje, litros: parseFloat(e.target.value) || 0 })} required />
                      </div>
                      <div className={styles.formGroup}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                          <label className={styles.label} style={{ marginBottom: 0 }}>{t.refueling.pricePerLiter}</label>
                          <span style={{ fontWeight: 'bold', color: '#f59e0b' }}>€{nuevoRepostaje.precioPorLitro?.toLocaleString(locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}/L</span>
                        </div>
                        <input className={styles.input} type="number" step="0.001" min="0.001" placeholder="1.650"
                          value={nuevoRepostaje.precioPorLitro || ''}
                          onChange={(e) => setNuevoRepostaje({ ...nuevoRepostaje, precioPorLitro: parseFloat(e.target.value) || 0 })} required />
                      </div>
                    </div>

                    {/* Preview del coste */}
                    {costeTotal > 0 && (
                      <div style={{ marginBottom: '1.25rem', padding: '0.875rem 1rem', background: 'rgba(245,158,11,0.1)', borderRadius: '10px', border: '1px solid rgba(245,158,11,0.3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: '#9ca3af', fontSize: '0.9rem' }}>{t.refueling.totalCost}</span>
                        <span style={{ color: '#f59e0b', fontWeight: '800', fontSize: '1.25rem' }}>€{costeTotal.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    )}

                    <div className={styles.formGroup}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <label className={styles.label} style={{ marginBottom: 0 }}>
                          {t.refueling.odometer} <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>({t.common.optional})</span>
                        </label>
                        {nuevoRepostaje.kilometrajeActual && nuevoRepostaje.kilometrajeActual > 0 &&
                          <span style={{ fontWeight: 'bold', color: 'var(--accent)' }}>{nuevoRepostaje.kilometrajeActual?.toLocaleString(locale)} km</span>
                        }
                      </div>
                      <input className={styles.input} type="number" min="0" placeholder={t.refueling.odometerPlaceholder || "Ej: 125000 — actualiza automáticamente el odómetro"}
                        value={nuevoRepostaje.kilometrajeActual || ''}
                        onChange={(e) => setNuevoRepostaje({ ...nuevoRepostaje, kilometrajeActual: parseInt(e.target.value) || 0 })} />
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.label}>{t.maintenance.notes} <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>({t.common.optional})</span></label>
                      <textarea className={styles.input} rows={2} placeholder={t.refueling.notesPlaceholder || "Ej: Repostaje completo, tarjeta empresa"}
                        value={nuevoRepostaje.notas}
                        onChange={(e) => setNuevoRepostaje({ ...nuevoRepostaje, notas: e.target.value })} />
                    </div>

                    <button type="submit"
                      style={{ width: '100%', padding: '1rem', background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#000', border: 'none', borderRadius: '8px', fontWeight: '700', fontSize: '1rem', cursor: 'pointer', transition: 'all 0.2s', marginTop: '0.5rem' }}>
                      {t.refueling.saveRefueling}
                    </button>
                  </form>
                </div>
              )}

              <h2 style={{ marginBottom: "1rem" }}>{t.refueling.history}</h2>
              <div className={styles.grid}>
                {repostajes
                  .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))
                  .map((r) => (
                    <div key={r.id} className={styles.card}
                      style={{ borderLeft: '6px solid #f59e0b', background: 'linear-gradient(145deg, rgba(30,30,40,0.95), rgba(20,20,25,0.9))' }}>
                      <div className={styles.cardHeader}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                            <span className={styles.badge} style={{ backgroundColor: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.2)' }}>
                              {t.refueling.refuelingSingular.toUpperCase()}
                            </span>
                            {r.estacion && (
                              <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>⛽ {r.estacion}</span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                            📅 {r.fecha ? new Date(r.fecha).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}
                          </div>
                          {r.conductorNombre && (
                            <div style={{ fontSize: '0.8rem', color: '#60a5fa', marginTop: '0.2rem' }}>
                              👤 {r.conductorNombre}
                            </div>
                          )}
                        </div>
                        <button onClick={() => r.id && handleEliminarRepostaje(r.id)}
                          style={{ background: 'rgba(239, 68, 68, 0.1)', border: 'none', cursor: 'pointer', color: "#ef4444", width: '32px', height: '32px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
                      </div>

                      <div className="vehiculo-card-metrics" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginTop: '1rem', background: 'rgba(0,0,0,0.3)', padding: '0.875rem', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <div>
                          <span style={{ display: 'block', fontSize: '0.6rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.2rem' }}>{t.refueling.liters}</span>
                          <span style={{ fontSize: '1.1rem', fontWeight: '800', color: '#f59e0b' }}>{r.litros?.toLocaleString(locale, { maximumFractionDigits: 1 })} <span style={{ fontSize: '0.7rem', color: '#4b5563' }}>L</span></span>
                        </div>
                        <div>
                          <span style={{ display: 'block', fontSize: '0.6rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.2rem' }}>€/{t.refueling.liters.slice(0, -1)}</span>
                          <span style={{ fontSize: '1.1rem', fontWeight: '800', color: '#fff' }}>€{r.precioPorLitro?.toLocaleString(locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</span>
                        </div>
                        <div>
                          <span style={{ display: 'block', fontSize: '0.6rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.2rem' }}>{t.common.all}</span>
                          <span style={{ fontSize: '1.1rem', fontWeight: '800', color: '#f59e0b' }}>€{r.costeTotal?.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                      </div>

                      {r.kilometrajeActual && r.kilometrajeActual > 0 && (
                        <div style={{ marginTop: '0.75rem', padding: '0.5rem 0.875rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', fontSize: '0.8rem', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span style={{ color: '#6b7280' }}>{t.refueling.odometer.split(' ')[0]}:</span>
                          <span style={{ color: '#fff', fontWeight: '600' }}>{r.kilometrajeActual.toLocaleString(locale)} km</span>
                        </div>
                      )}

                      {r.notas && (
                        <div style={{ marginTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.6rem' }}>
                          <p style={{ fontSize: "0.8rem", color: "#6b7280", fontStyle: 'italic', margin: 0 }}>
                            <span style={{ color: '#4b5563', marginRight: '0.3rem' }}>{t.maintenance.notes}:</span>{r.notas}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}

                {repostajes.length === 0 && (
                  <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '4rem 2rem', background: 'rgba(255,255,255,0.02)', borderRadius: '24px', border: '2px dashed rgba(245,158,11,0.15)' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.4 }}>⛽</div>
                    <h3 style={{ color: '#fff', marginBottom: '0.5rem' }}>{t.refueling.noHistory}</h3>
                    <p style={{ color: "#6b7280" }}>{t.refueling.noHistoryDesc}</p>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB: DOCUMENTOS
          ══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'documentos' && (
            <>
              {/* Stats de documentos */}
              {documentos.length > 0 && (() => {
                const vencidos = documentos.filter(d => diasHastaVencimiento(d.fechaVencimiento) < 0).length;
                const proximos = documentos.filter(d => { const dias = diasHastaVencimiento(d.fechaVencimiento); return dias >= 0 && dias <= 30; }).length;
                const vigentes = documentos.filter(d => diasHastaVencimiento(d.fechaVencimiento) > 30).length;
                return (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
                    <div style={{ background: 'rgba(34,197,94,0.08)', borderRadius: '12px', padding: '1rem', border: '1px solid rgba(34,197,94,0.2)', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.65rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.3rem' }}>{t.documents.valid}</div>
                      <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#22c55e' }}>{vigentes}</div>
                    </div>
                    <div style={{ background: 'rgba(59,130,246,0.08)', borderRadius: '12px', padding: '1rem', border: '1px solid rgba(59,130,246,0.2)', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.65rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.3rem' }}>{t.vehicle.expiresSoon || 'Próximos a vencer'}</div>
                      <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#3b82f6' }}>{proximos}</div>
                    </div>
                    <div style={{ background: 'rgba(239,68,68,0.08)', borderRadius: '12px', padding: '1rem', border: '1px solid rgba(239,68,68,0.2)', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.65rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.3rem' }}>{t.documents.expiredAgo}</div>
                      <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#ef4444' }}>{vencidos}</div>
                    </div>
                    <div style={{ background: 'rgba(59,130,246,0.08)', borderRadius: '12px', padding: '1rem', border: '1px solid rgba(59,130,246,0.2)', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.65rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.3rem' }}>{t.common.total}</div>
                      <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#3b82f6' }}>{documentos.length}</div>
                    </div>
                  </div>
                );
              })()}

              <div style={{ marginBottom: '2rem' }}>
                <button
                  onClick={() => setMostrarFormDocumento(!mostrarFormDocumento)}
                  style={{ padding: '0.875rem 1.5rem', background: mostrarFormDocumento ? 'rgba(255,255,255,0.1)' : 'linear-gradient(135deg, #3b82f6, #2563eb)', color: mostrarFormDocumento ? 'white' : '#fff', border: mostrarFormDocumento ? '1px solid rgba(255,255,255,0.2)' : 'none', borderRadius: '10px', fontWeight: '700', fontSize: '0.95rem', cursor: 'pointer', transition: 'all 0.2s' }}
                >
                  {mostrarFormDocumento ? t.common.cancel : t.documents.newDocument}
                </button>
              </div>

              {mostrarFormDocumento && (
                <div className={styles.formContainer} style={{ marginBottom: '2rem' }}>
                  <h3 style={{ marginBottom: '1.25rem', color: '#3b82f6' }}>{t.documents.registerDocument}</h3>
                  <form onSubmit={handleCrearDocumento}>
                    <div className={styles.formRow}>
                      <div className={styles.formGroup}>
                        <label className={styles.label}>{t.documents.documentType}</label>
                        <select className={styles.select} value={nuevoDocumento.tipoDocumento}
                          onChange={(e) => setNuevoDocumento({ ...nuevoDocumento, tipoDocumento: e.target.value })} required>
                          {TIPOS_DOCUMENTO(t).map(tipo => (
                            <option key={tipo.value} value={tipo.value}>{tipo.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className={styles.formGroup}>
                        <label className={styles.label}>{t.documents.referenceNumber} <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>({t.common.optional})</span></label>
                        <input className={styles.input} type="text" placeholder="Ej: POL-2026-1234"
                          value={nuevoDocumento.numeroReferencia}
                          onChange={(e) => setNuevoDocumento({ ...nuevoDocumento, numeroReferencia: e.target.value })} />
                      </div>
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.label}>{t.maintenance.description}</label>
                      <input className={styles.input} type="text" placeholder={t.maintenance.descriptionPlaceholder || "Ej: Seguro a todo riesgo — Mapfre"}
                        value={nuevoDocumento.descripcion}
                        onChange={(e) => setNuevoDocumento({ ...nuevoDocumento, descripcion: e.target.value })} required />
                    </div>

                    <div className={styles.formRow}>
                      <div className={styles.formGroup}>
                        <label className={styles.label}>{t.documents.issueDate}</label>
                        <input className={styles.input} type="date"
                          value={nuevoDocumento.fechaEmision}
                          onChange={(e) => setNuevoDocumento({ ...nuevoDocumento, fechaEmision: e.target.value })} required />
                      </div>
                      <div className={styles.formGroup}>
                        <label className={styles.label}>{t.documents.expirationDate}</label>
                        <input className={styles.input} type="date"
                          value={nuevoDocumento.fechaVencimiento}
                          onChange={(e) => setNuevoDocumento({ ...nuevoDocumento, fechaVencimiento: e.target.value })} required />
                      </div>
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.label}>{t.maintenance.notes} <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>({t.common.optional})</span></label>
                      <textarea className={styles.input} rows={2} placeholder={t.maintenance.observationsPlaceholder || "Información adicional..."}
                        value={nuevoDocumento.notas}
                        onChange={(e) => setNuevoDocumento({ ...nuevoDocumento, notas: e.target.value })} />
                    </div>

                    <button type="submit"
                      style={{ width: '100%', padding: '1rem', background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '700', fontSize: '1rem', cursor: 'pointer', transition: 'all 0.2s', marginTop: '0.5rem' }}>
                      {t.documents.saveDocument}
                    </button>
                  </form>
                </div>
              )}

              <h2 style={{ marginBottom: '1rem' }}>{t.documents.vehicleDocuments}</h2>
              <div className={styles.grid}>
                {documentos.map((doc) => {
                  const estado = estadoDocumento(doc.fechaVencimiento, t);
                  const tipoLabel = TIPOS_DOCUMENTO(t).find(t => t.value === doc.tipoDocumento)?.label || doc.tipoDocumento;
                  return (
                    <div key={doc.id} className={styles.card}
                      style={{ borderLeft: `6px solid ${estado.color}`, background: 'linear-gradient(145deg, rgba(30,30,40,0.95), rgba(20,20,25,0.9))' }}>
                      <div className={styles.cardHeader}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                            <span className={styles.badge} style={{
                              backgroundColor: 'rgba(59,130,246,0.15)', color: '#60a5fa',
                              border: '1px solid rgba(59,130,246,0.2)',
                            }}>{tipoLabel}</span>
                            <span className={styles.badge} style={{
                              backgroundColor: estado.bg, color: estado.color,
                              border: `1px solid ${estado.color}33`,
                            }}>{estado.label}</span>
                          </div>
                          <h4 className={styles.cardTitle} style={{ fontSize: '1.1rem', marginBottom: '0.4rem' }}>{doc.descripcion || tipoLabel}</h4>
                          {doc.numeroReferencia && (
                            <div style={{ fontSize: '0.8rem', color: '#9ca3af', marginBottom: '0.2rem' }}>
                              🔖 {t.documents.referenceNumber}: {doc.numeroReferencia}
                            </div>
                          )}
                        </div>
                        <button onClick={() => doc.id && handleEliminarDocumento(doc.id)}
                          style={{ background: 'rgba(239, 68, 68, 0.1)', border: 'none', cursor: 'pointer', color: '#ef4444', width: '32px', height: '32px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
                      </div>

                      <div className="vehiculo-card-metrics" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '1rem', background: 'rgba(0,0,0,0.3)', padding: '0.875rem', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <div>
                          <span style={{ display: 'block', fontSize: '0.6rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.2rem' }}>{t.documents.issueDate}</span>
                          <span style={{ fontSize: '0.95rem', fontWeight: '700', color: '#fff' }}>{doc.fechaEmision ? new Date(doc.fechaEmision).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}</span>
                        </div>
                        <div>
                          <span style={{ display: 'block', fontSize: '0.6rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.2rem' }}>{t.documents.expirationDate}</span>
                          <span style={{ fontSize: '0.95rem', fontWeight: '700', color: estado.color }}>{doc.fechaVencimiento ? new Date(doc.fechaVencimiento).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}</span>
                        </div>
                      </div>

                      {doc.notas && (
                        <div style={{ marginTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.6rem' }}>
                          <p style={{ fontSize: '0.8rem', color: '#6b7280', fontStyle: 'italic', margin: 0 }}>
                            <span style={{ color: '#4b5563', marginRight: '0.3rem' }}>{t.maintenance.notes}:</span>{doc.notas}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}

                {documentos.length === 0 && (
                  <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '4rem 2rem', background: 'rgba(255,255,255,0.02)', borderRadius: '24px', border: '2px dashed rgba(59,130,246,0.15)' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.4 }}>📄</div>
                    <h3 style={{ color: '#fff', marginBottom: '0.5rem' }}>{t.documents.noDocuments}</h3>
                    <p style={{ color: '#6b7280' }}>{t.documents.noDocumentsDesc}</p>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB: PROGRAMACIONES DE MANTENIMIENTO
          ══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'programaciones' && (
            <>
              {/* Stats de programaciones */}
              {programaciones.length > 0 && (() => {
                const activas = programaciones.filter(p => p.activo).length;
                const porKm = programaciones.filter(p => p.tipoIntervalo === 'POR_KM' || p.tipoIntervalo === 'AMBOS').length;
                const porTiempo = programaciones.filter(p => p.tipoIntervalo === 'POR_TIEMPO' || p.tipoIntervalo === 'AMBOS').length;
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
                    <div style={{ background: 'rgba(139,92,246,0.08)', borderRadius: '12px', padding: '1rem', border: '1px solid rgba(139,92,246,0.2)', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.65rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.3rem' }}>{t.schedules.activePlural}</div>
                      <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#8b5cf6' }}>{activas}</div>
                    </div>
                    <div style={{ background: 'rgba(139,92,246,0.08)', borderRadius: '12px', padding: '1rem', border: '1px solid rgba(139,92,246,0.2)', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.65rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.3rem' }}>{t.schedules.byKmLabel}</div>
                      <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#8b5cf6' }}>{porKm}</div>
                    </div>
                    <div style={{ background: 'rgba(139,92,246,0.08)', borderRadius: '12px', padding: '1rem', border: '1px solid rgba(139,92,246,0.2)', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.65rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.3rem' }}>{t.schedules.byTimeLabel}</div>
                      <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#8b5cf6' }}>{porTiempo}</div>
                    </div>
                    <div style={{ background: 'rgba(139,92,246,0.08)', borderRadius: '12px', padding: '1rem', border: '1px solid rgba(139,92,246,0.2)', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.65rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.3rem' }}>{t.schedules.total}</div>
                      <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#8b5cf6' }}>{programaciones.length}</div>
                    </div>
                  </div>
                );
              })()}

              <div style={{ marginBottom: '2rem' }}>
                <button
                  onClick={() => setMostrarFormProgramacion(!mostrarFormProgramacion)}
                  style={{ padding: '0.875rem 1.5rem', background: mostrarFormProgramacion ? 'rgba(255,255,255,0.1)' : 'linear-gradient(135deg, #8b5cf6, #6d28d9)', color: '#fff', border: mostrarFormProgramacion ? '1px solid rgba(255,255,255,0.2)' : 'none', borderRadius: '10px', fontWeight: '700', fontSize: '0.95rem', cursor: 'pointer', transition: 'all 0.2s' }}
                >
                  {mostrarFormProgramacion ? t.common.cancel : t.schedules.newSchedule}
                </button>
              </div>

              {mostrarFormProgramacion && (
                <div className={styles.formContainer} style={{ marginBottom: '2rem' }}>
                  <h3 style={{ marginBottom: '1.25rem', color: '#8b5cf6' }}>{t.schedules.createSchedule}</h3>
                  <form onSubmit={handleCrearProgramacion}>
                    <div className={styles.formRow}>
                      <div className={styles.formGroup}>
                        <label className={styles.label}>{t.common.name}</label>
                        <input className={styles.input} type="text" placeholder={t.maintenance.descriptionPlaceholder || "Ej: Cambio de aceite"}
                          value={nuevaProgramacion.nombre}
                          onChange={(e) => setNuevaProgramacion({ ...nuevaProgramacion, nombre: e.target.value })} required />
                      </div>
                      <div className={styles.formGroup}>
                        <label className={styles.label}>{t.schedules.intervalType}</label>
                        <select className={styles.select} value={nuevaProgramacion.tipoIntervalo}
                          onChange={(e) => setNuevaProgramacion({ ...nuevaProgramacion, tipoIntervalo: e.target.value })} required>
                          <option value="POR_KM">{t.schedules.byKm}</option>
                          <option value="POR_TIEMPO">{t.schedules.byTime}</option>
                          <option value="AMBOS">{t.schedules.both}</option>
                        </select>
                      </div>
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.label}>{t.maintenance.description} <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>({t.common.optional})</span></label>
                      <input className={styles.input} type="text" placeholder={t.maintenance.descriptionPlaceholder || "Ej: Aceite sintético 5W30 + filtro"}
                        value={nuevaProgramacion.descripcion}
                        onChange={(e) => setNuevaProgramacion({ ...nuevaProgramacion, descripcion: e.target.value })} />
                    </div>

                    <div className={styles.formRow}>
                      {(nuevaProgramacion.tipoIntervalo === 'POR_KM' || nuevaProgramacion.tipoIntervalo === 'AMBOS') && (
                        <div className={styles.formGroup}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                            <label className={styles.label} style={{ marginBottom: 0 }}>{t.schedules.intervalKm}</label>
                            <span style={{ fontWeight: 'bold', color: '#8b5cf6' }}>{(nuevaProgramacion.intervaloKm || 0).toLocaleString(locale)} km</span>
                          </div>
                          <input className={styles.input} type="number" min="500" step="500" placeholder="15000"
                            value={nuevaProgramacion.intervaloKm || ''}
                            onChange={(e) => setNuevaProgramacion({ ...nuevaProgramacion, intervaloKm: parseInt(e.target.value) || 0 })} required />
                        </div>
                      )}
                      {(nuevaProgramacion.tipoIntervalo === 'POR_TIEMPO' || nuevaProgramacion.tipoIntervalo === 'AMBOS') && (
                        <div className={styles.formGroup}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                            <label className={styles.label} style={{ marginBottom: 0 }}>{t.schedules.intervalMonths}</label>
                            <span style={{ fontWeight: 'bold', color: '#8b5cf6' }}>{nuevaProgramacion.intervaloMeses || 0} {t.common.months}</span>
                          </div>
                          <input className={styles.input} type="number" min="1" max="60" step="1" placeholder="6"
                            value={nuevaProgramacion.intervaloMeses || ''}
                            onChange={(e) => setNuevaProgramacion({ ...nuevaProgramacion, intervaloMeses: parseInt(e.target.value) || 0 })} required />
                        </div>
                      )}
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.label}>{t.schedules.lastPerformedDate} <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>({t.common.optional} — {t.schedules.lastPerformedDateHint})</span></label>
                      <input className={styles.input} type="date"
                        value={nuevaProgramacion.ultimaFechaRealizado || ''}
                        onChange={(e) => setNuevaProgramacion({ ...nuevaProgramacion, ultimaFechaRealizado: e.target.value })} />
                    </div>

                    <button type="submit"
                      style={{ width: '100%', padding: '1rem', background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '700', fontSize: '1rem', cursor: 'pointer', transition: 'all 0.2s', marginTop: '0.5rem' }}>
                      {t.schedules.saveSchedule}
                    </button>
                  </form>
                </div>
              )}

              <h2 style={{ marginBottom: '1rem' }}>{t.schedules.maintenanceSchedules}</h2>
              <div className={styles.grid}>
                {programaciones.map((prog) => {
                  const tipoLabel = { 
                    POR_KM: `🛣️ ${t.schedules.byKm}`, 
                    POR_TIEMPO: `🕐 ${t.schedules.byTime}`, 
                    AMBOS: `🔄 ${t.schedules.both}` 
                  }[prog.tipoIntervalo as 'POR_KM' | 'POR_TIEMPO' | 'AMBOS'] || prog.tipoIntervalo;
                  // Calcular próximo km
                  const proximoKm = prog.intervaloKm && prog.intervaloKm > 0
                    ? ((prog.ultimoKmRealizado || 0) + prog.intervaloKm)
                    : null;
                  const kmRestantes = proximoKm && vehiculo ? proximoKm - vehiculo.kilometraje : null;
                  const kmUrgente = kmRestantes !== null && kmRestantes <= 1000;
                  // Calcular próxima fecha
                  const proximaFecha = prog.intervaloMeses && prog.intervaloMeses > 0
                    ? (() => {
                        const base = prog.ultimaFechaRealizado ? new Date(prog.ultimaFechaRealizado) : new Date();
                        base.setMonth(base.getMonth() + prog.intervaloMeses);
                        return base;
                      })()
                    : null;
                  const diasRestantes = proximaFecha ? Math.ceil((proximaFecha.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : null;
                  const tiempoUrgente = diasRestantes !== null && diasRestantes <= 15;
                  const esUrgente = kmUrgente || tiempoUrgente;

                  return (
                    <div key={prog.id} className={styles.card}
                      style={{ borderLeft: `6px solid ${esUrgente ? '#ef4444' : '#8b5cf6'}`, background: 'linear-gradient(145deg, rgba(30,30,40,0.95), rgba(20,20,25,0.9))' }}>
                      <div className={styles.cardHeader}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                            <span className={styles.badge} style={{
                              backgroundColor: 'rgba(139,92,246,0.15)', color: '#a78bfa',
                              border: '1px solid rgba(139,92,246,0.2)',
                            }}>{tipoLabel}</span>
                            {esUrgente && (
                              <span className={styles.badge} style={{
                                backgroundColor: 'rgba(239,68,68,0.12)', color: '#ef4444',
                                border: '1px solid rgba(239,68,68,0.2)',
                              }}>⚠️ {t.common.next}</span>
                            )}
                            {!prog.activo && (
                              <span className={styles.badge} style={{
                                backgroundColor: 'rgba(107,114,128,0.15)', color: '#6b7280',
                                border: '1px solid rgba(107,114,128,0.2)',
                              }}>{t.common.inactive}</span>
                            )}
                          </div>
                          <h4 className={styles.cardTitle} style={{ fontSize: '1.1rem', marginBottom: '0.4rem' }}>{prog.nombre}</h4>
                          {prog.descripcion && (
                            <div style={{ fontSize: '0.8rem', color: '#9ca3af' }}>{prog.descripcion}</div>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                          <button onClick={() => prog.id && handleMarcarRealizado(prog.id)}
                            title={t.schedules.markDone || "Marcar como realizado"}
                            style={{ background: 'rgba(34, 197, 94, 0.1)', border: 'none', cursor: 'pointer', color: '#22c55e', width: '32px', height: '32px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>✅</button>
                          <button onClick={() => prog.id && handleEliminarProgramacion(prog.id)}
                            style={{ background: 'rgba(239, 68, 68, 0.1)', border: 'none', cursor: 'pointer', color: '#ef4444', width: '32px', height: '32px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: proximoKm && proximaFecha ? '1fr 1fr' : '1fr', gap: '0.75rem', marginTop: '1rem', background: 'rgba(0,0,0,0.3)', padding: '0.875rem', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.05)' }}>
                        {proximoKm !== null && (
                          <div>
                            <span style={{ display: 'block', fontSize: '0.6rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.2rem' }}>{t.schedules.nextAt}</span>
                            <span style={{ fontSize: '1.1rem', fontWeight: '800', color: kmUrgente ? '#ef4444' : '#fff' }}>{proximoKm.toLocaleString(locale)} <span style={{ fontSize: '0.7rem', color: '#4b5563' }}>km</span></span>
                            {kmRestantes !== null && (
                              <span style={{ display: 'block', fontSize: '0.75rem', color: kmUrgente ? '#ef4444' : '#6b7280', marginTop: '0.2rem' }}>
                                {kmRestantes > 0 ? `${t.schedules.remaining} ${kmRestantes.toLocaleString(locale)} km` : `${t.schedules.overdue} ${Math.abs(kmRestantes).toLocaleString(locale)} km`}
                              </span>
                            )}
                          </div>
                        )}
                        {proximaFecha !== null && (
                          <div>
                            <span style={{ display: 'block', fontSize: '0.6rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.2rem' }}>{t.schedules.nextDate}</span>
                            <span style={{ fontSize: '1.1rem', fontWeight: '800', color: tiempoUrgente ? '#ef4444' : '#fff' }}>
                              {proximaFecha.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' })}
                            </span>
                            {diasRestantes !== null && (
                              <span style={{ display: 'block', fontSize: '0.75rem', color: tiempoUrgente ? '#ef4444' : '#6b7280', marginTop: '0.2rem' }}>
                                {diasRestantes > 0 ? `${t.schedules.remaining} ${diasRestantes} ${t.schedules.days}` : `${t.schedules.overdue} ${Math.abs(diasRestantes)} ${t.schedules.days}`}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Último realizado */}
                      <div style={{ marginTop: '0.75rem', padding: '0.5rem 0.875rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', fontSize: '0.8rem', color: '#9ca3af', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                        {prog.ultimoKmRealizado != null && prog.ultimoKmRealizado > 0 && (
                          <span>{t.common.last}: <span style={{ color: '#fff', fontWeight: '600' }}>{prog.ultimoKmRealizado.toLocaleString(locale)} km</span></span>
                        )}
                        {prog.ultimaFechaRealizado && (
                          <span>{t.maintenance.date}: <span style={{ color: '#fff', fontWeight: '600' }}>{new Date(prog.ultimaFechaRealizado).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' })}</span></span>
                        )}
                      </div>
                    </div>
                  );
                })}

                {programaciones.length === 0 && (
                  <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '4rem 2rem', background: 'rgba(255,255,255,0.02)', borderRadius: '24px', border: '2px dashed rgba(139,92,246,0.15)' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.4 }}>📅</div>
                    <h3 style={{ color: '#fff', marginBottom: '0.5rem' }}>{t.schedules.noSchedules}</h3>
                    <p style={{ color: '#6b7280' }}>{t.schedules.noSchedulesDesc}</p>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB: EDITAR VEHÍCULO
          ══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'editar' && (
            <div className={styles.card}>
              <h3 className={styles.cardTitle} style={{ marginBottom: '1.5rem' }}>{t.vehicle.editVehicleData}</h3>
              <form onSubmit={handleGuardarEdicion}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>

                  <div className={styles.formGroup}>
                    <label className={styles.label}>{t.vehicle.brand}</label>
                    <input className={styles.input} type="text" value={editData.marca || ''} required
                      onChange={e => setEditData({ ...editData, marca: e.target.value })} />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.label}>{t.vehicle.model}</label>
                    <input className={styles.input} type="text" value={editData.modelo || ''} required
                      onChange={e => setEditData({ ...editData, modelo: e.target.value })} />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.label}>{t.vehicle.plate}</label>
                    <input className={styles.input} type="text" value={editData.matricula || ''} required
                      onChange={e => setEditData({ ...editData, matricula: e.target.value.toUpperCase() })} />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.label}>{t.vehicle.fuelType}</label>
                    <select className={styles.select} value={editData.tipoCombustible || ''}
                      onChange={e => setEditData({ ...editData, tipoCombustible: e.target.value })}>
                      <option value="gasolina">{t.fuel.GASOLINA}</option>
                      <option value="diesel">{t.fuel.DIESEL}</option>
                      <option value="hibrido">{t.fuel.HIBRIDO}</option>
                      <option value="electrico">{t.fuel.ELECTRICO}</option>
                    </select>
                  </div>

                  <div className={styles.formGroup}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <label className={styles.label} style={{ marginBottom: 0 }}>{t.metrics.mileage}</label>
                      <span style={{ fontWeight: 'bold', color: '#fff' }}>{(editData.kilometraje || 0).toLocaleString(locale)} km</span>
                    </div>
                    <input className={styles.input} type="number" min="0" step="1"
                      value={editData.kilometraje || 0}
                      onChange={e => setEditData({ ...editData, kilometraje: Number(e.target.value) })} />
                  </div>

                  <div className={styles.formGroup}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <label className={styles.label} style={{ marginBottom: 0 }}>{t.vehicle.currentFuel}</label>
                      <span style={{ fontWeight: 'bold', color: '#f59e0b' }}>{editData.combustibleActual ?? 0}%</span>
                    </div>
                    <input className={styles.input} type="range" min="0" max="100" step="1"
                      style={{ padding: '0.5rem', cursor: 'pointer' }}
                      value={editData.combustibleActual ?? 0}
                      onChange={e => setEditData({ ...editData, combustibleActual: Number(e.target.value) })} />
                  </div>

                  <div className={styles.formGroup}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <label className={styles.label} style={{ marginBottom: 0 }}>{t.vehicle.tankCapacity}</label>
                      <span style={{ fontWeight: 'bold', color: '#6b7280' }}>{editData.capacidadDeposito || '—'} L</span>
                    </div>
                    <input className={styles.input} type="number" min="10" max="500" step="5" placeholder="60"
                      value={editData.capacidadDeposito || ''}
                      onChange={e => setEditData({ ...editData, capacidadDeposito: Number(e.target.value) || undefined })} />
                  </div>

                  <div className={styles.formGroup}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <label className={styles.label} style={{ marginBottom: 0 }}>{t.vehicle.refCostPerKm}</label>
                      <span style={{ fontWeight: 'bold', color: '#a78bfa' }}>
                        {editData.costeKmReferencia ? `€${editData.costeKmReferencia.toLocaleString(locale, { minimumFractionDigits: 2 })}/km` : '—'}
                      </span>
                    </div>
                    <input className={styles.input} type="number" min="0" max="10" step="0.01" placeholder="0.35"
                      value={editData.costeKmReferencia || ''}
                      onChange={e => setEditData({ ...editData, costeKmReferencia: Number(e.target.value) || undefined })} />
                    <span style={{ fontSize: '0.7rem', color: '#6b7280', display: 'block', marginTop: '0.25rem' }}>{t.vehicle.refCostDesc}</span>
                  </div>

                  {/* ── Vehicle Photo (edit) ── */}
                  <div className={styles.formGroup}>
                    <label className={styles.label}>{t.vehicle.vehiclePhoto} <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>({t.common.optional})</span></label>
                    <div
                      style={{
                        border: '2px dashed rgba(255,255,255,0.15)',
                        borderRadius: '12px',
                        padding: '1.5rem',
                        textAlign: 'center',
                        cursor: 'pointer',
                        transition: 'all 0.3s ease',
                        background: 'rgba(255,255,255,0.02)',
                        position: 'relative',
                        overflow: 'hidden',
                      }}
                      onClick={() => document.getElementById('edit-vehiculo-image-input')?.click()}
                    >
                      {editData.imagenUrl ? (
                        <>
                          <img src={editData.imagenUrl} alt="Preview" style={{ width: '100%', maxHeight: '200px', objectFit: 'cover', borderRadius: '10px', marginBottom: '0.75rem' }} />
                          <button
                            type="button"
                            style={{
                              position: 'absolute', top: '8px', right: '8px',
                              background: 'rgba(239,68,68,0.8)', border: 'none', color: 'white',
                              width: '28px', height: '28px', borderRadius: '50%', cursor: 'pointer',
                              fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditData({ ...editData, imagenUrl: '' });
                            }}
                          >
                            ✕
                          </button>
                          <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.45)' }}>{t.vehicle.clickToChangePhoto}</div>
                        </>
                      ) : (
                        <>
                          <div style={{ fontSize: '2rem', marginBottom: '0.5rem', opacity: 0.5 }}>📸</div>
                          <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.45)', lineHeight: 1.4 }}>{t.vehicle.uploadPhotoHint}</div>
                        </>
                      )}
                      <input
                        id="edit-vehiculo-image-input"
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          if (file.size > 5 * 1024 * 1024) {
                            toast.warning(t.vehicle.photoTooLarge);
                            return;
                          }
                          try {
                            const compressed = await compressImage(file);
                            setEditData({ ...editData, imagenUrl: compressed });
                          } catch {
                            toast.error('Error al procesar la imagen');
                          }
                        }}
                      />
                    </div>
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.label}>{t.vehicle.vehicleStatus}</label>
                    <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                      <button type="button"
                        onClick={() => setEditData({ ...editData, activo: true })}
                        style={{
                          flex: 1, padding: '0.6rem', borderRadius: '8px', border: '1px solid',
                          cursor: 'pointer', fontWeight: '600', fontSize: '0.875rem',
                          borderColor: editData.activo ? '#3bf63b' : 'rgba(255,255,255,0.1)',
                          background: editData.activo ? 'rgba(59,246,59,0.12)' : 'transparent',
                          color: editData.activo ? '#3bf63b' : '#6b7280',
                        }}>{t.common.active}</button>
                      <button type="button"
                        onClick={() => setEditData({ ...editData, activo: false })}
                        style={{
                          flex: 1, padding: '0.6rem', borderRadius: '8px', border: '1px solid',
                          cursor: 'pointer', fontWeight: '600', fontSize: '0.875rem',
                          borderColor: editData.activo === false ? '#f87171' : 'rgba(255,255,255,0.1)',
                          background: editData.activo === false ? 'rgba(248,113,113,0.12)' : 'transparent',
                          color: editData.activo === false ? '#f87171' : '#6b7280',
                        }}>
                        {t.vehicle.inWorkshop}
                      </button>
                    </div>
                  </div>

                </div>

                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '2rem' }}>
                  <button type="submit" disabled={guardandoEdicion}
                    style={{ padding: '0.75rem 2rem', borderRadius: '10px', border: 'none', cursor: guardandoEdicion ? 'not-allowed' : 'pointer', fontWeight: '700', fontSize: '0.95rem', background: 'linear-gradient(135deg, #a78bfa, #7c3aed)', color: '#fff', opacity: guardandoEdicion ? 0.6 : 1 }}>
                    {guardandoEdicion ? t.common.saving : t.common.saveChanges}
                  </button>
                  <button type="button" onClick={() => setActiveTab('mantenimientos')}
                    style={{ padding: '0.75rem 1.5rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', fontWeight: '600', fontSize: '0.95rem', background: 'transparent', color: 'rgba(255,255,255,0.5)' }}>
                    {t.common.cancel}
                  </button>
                </div>
              </form>
            </div>
          )}

        </div>
      </main>
    </BackgroundMeteors>
  );
}
