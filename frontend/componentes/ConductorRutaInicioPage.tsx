"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import type { OSRMRoute } from "@/componentes/NavegacionMapa";
import { formatRouteStateLabel } from "@/lib/status-labels";

const NavegacionMapa = dynamic(() => import("@/componentes/NavegacionMapa"), {
  ssr: false,
  loading: () => (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#3bf63b", fontSize: "0.85rem" }}>
      Cargando mapa…
    </div>
  ),
});

const API_URL = typeof window !== "undefined" && window.location.hostname === "10.0.2.2"
  ? ""
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

interface OSRMRouteResponse {
  distance: number;
  duration: number;
  geometry?: {
    coordinates?: [number, number][];
  };
}

interface OSRMResponse {
  code?: string;
  routes?: OSRMRouteResponse[];
}

type AndroidTrackerBridge = {
  openExternalUrl?: (url: string) => void;
};

function getAndroidTracker(): AndroidTrackerBridge | null {
  if (typeof window === "undefined") return null;
  return (window as Window & { AndroidTracker?: AndroidTrackerBridge }).AndroidTracker ?? null;
}

function normalizeRouteState(estado?: string) {
  const limpio = (estado ?? "").trim().toUpperCase().replace(/\s+/g, "_");
  switch (limpio) {
    case "ENCURSO":
    case "EN_CURSO":
      return "EN_CURSO";
    case "DETENIDA":
    case "DETENIDO":
    case "PAUSADA":
    case "PAUSADO":
    case "STOPPED":
      return "DETENIDO";
    case "COMPLETADO":
    case "COMPLETADA":
      return "COMPLETADA";
    case "PLANEADA":
    case "PLANIFICADA":
      return "PLANIFICADA";
    default:
      return limpio || "PLANIFICADA";
  }
}

function formatDuration(mins: number) {
  if (!Number.isFinite(mins) || mins <= 0) return "—";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export default function ConductorRutaInicioPage() {
  const params = useParams();
  const router = useRouter();
  const rutaId = (params?.rutaId as string) || "";

  const [ruta, setRuta] = useState<Ruta | null>(null);
  const [livePos, setLivePos] = useState<[number, number] | null>(null);
  const [liveHeading, setLiveHeading] = useState<number | null>(null);
  const [routes, setRoutes] = useState<OSRMRoute[]>([]);
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const watchRef = useRef<number | null>(null);
  const lastFetchRef = useRef<[number, number] | null>(null);

  const getAuthHeaders = (): Record<string, string> => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    return {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  };

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

    void cargarRuta();
    const interval = window.setInterval(() => {
      void cargarRuta(true);
    }, 8000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [rutaId, router]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    const id = navigator.geolocation.watchPosition(
      async (pos) => {
        setLivePos([pos.coords.latitude, pos.coords.longitude]);
        setLiveHeading(pos.coords.heading != null && pos.coords.heading >= 0 ? pos.coords.heading : null);

        try {
          await fetch(`${API_URL}/api/rutas/${rutaId}/gps`, {
            method: "POST",
            headers: getAuthHeaders(),
            body: JSON.stringify({
              latitud: pos.coords.latitude,
              longitud: pos.coords.longitude,
              precision: pos.coords.accuracy,
              velocidadKmh: pos.coords.speed != null && pos.coords.speed >= 0 ? pos.coords.speed * 3.6 : undefined,
            }),
          });
        } catch {
          // Sin bloqueo visual; la vista puede seguir funcionando localmente.
        }
      },
      () => {
        // Si no hay GPS en este momento, se mantiene el origen como referencia.
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 }
    );

    watchRef.current = id;
    return () => {
      if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    };
  }, [rutaId]);

  useEffect(() => {
    if (!ruta?.latitudDestino || !ruta?.longitudDestino) return;

    const from = livePos
      ?? (ruta.latitudActual != null && ruta.longitudActual != null
        ? [ruta.latitudActual, ruta.longitudActual] as [number, number]
        : ruta.latitudOrigen != null && ruta.longitudOrigen != null
          ? [ruta.latitudOrigen, ruta.longitudOrigen] as [number, number]
          : null);

    if (!from) return;

    if (lastFetchRef.current) {
      const [pLat, pLng] = lastFetchRef.current;
      const dLat = (from[0] - pLat) * 111320;
      const dLng = (from[1] - pLng) * 111320 * Math.cos((from[0] * Math.PI) / 180);
      const distM = Math.sqrt(dLat * dLat + dLng * dLng);
      if (distM < 150 && routes.length > 0) return;
    }

    lastFetchRef.current = from;
    const to: [number, number] = [ruta.latitudDestino, ruta.longitudDestino];

    setLoadingRoutes(true);
    void (async () => {
      try {
        const url = `https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("OSRM error");
        const data: OSRMResponse = await res.json();

        if (data.code !== "Ok" || !data.routes?.length) {
          setRoutes([]);
          return;
        }

        setRoutes(data.routes.slice(0, 1).map((route) => ({
          distance: route.distance,
          duration: route.duration,
          geometry: (route.geometry?.coordinates ?? []).map(
            (coord: [number, number]) => [coord[1], coord[0]] as [number, number]
          ),
          legs: [],
          steps: [],
        })));
      } catch {
        setRoutes([]);
      } finally {
        setLoadingRoutes(false);
      }
    })();
  }, [livePos, ruta?.latitudActual, ruta?.longitudActual, ruta?.latitudDestino, ruta?.longitudOrigen, ruta?.latitudOrigen, ruta?.longitudDestino, routes.length]);

  const currentPos = useMemo<[number, number] | null>(() => {
    if (livePos) return livePos;
    if (ruta?.latitudActual != null && ruta?.longitudActual != null) {
      return [ruta.latitudActual, ruta.longitudActual];
    }
    return null;
  }, [livePos, ruta?.latitudActual, ruta?.longitudActual]);

  const activeRoute = routes[0] ?? null;
  const distanciaKm = activeRoute ? activeRoute.distance / 1000 : (ruta?.distanciaEstimadaKm ?? 0);
  const minutos = activeRoute ? Math.round(activeRoute.duration / 60) : 0;
  const eta = useMemo(() => {
    if (!activeRoute) return "—";
    return new Date(Date.now() + activeRoute.duration * 1000).toLocaleTimeString("es", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }, [activeRoute]);

  const origen: [number, number] | null = ruta?.latitudOrigen != null && ruta.longitudOrigen != null
    ? [ruta.latitudOrigen, ruta.longitudOrigen]
    : null;

  const destino: [number, number] | null = ruta?.latitudDestino != null && ruta.longitudDestino != null
    ? [ruta.latitudDestino, ruta.longitudDestino]
    : null;

  const abrirNavegacionExterna = () => {
    if (!ruta?.latitudDestino || !ruta?.longitudDestino) {
      toast.error("El destino no tiene coordenadas disponibles");
      return;
    }

    const target = `${ruta.latitudDestino},${ruta.longitudDestino}`;
    const bridge = getAndroidTracker();
    if (bridge && typeof bridge.openExternalUrl === "function") {
      bridge.openExternalUrl(`google.navigation:q=${encodeURIComponent(target)}&mode=d`);
      return;
    }

    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(target)}&travelmode=driving&dir_action=navigate`,
      "_blank",
      "noopener,noreferrer"
    );
  };

  if (!ruta) {
    return (
      <div style={{ height: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", color: "#6b7280", background: "#050608" }}>
        Cargando ruta…
      </div>
    );
  }

  return (
    <main style={{ height: "100dvh", width: "100%", display: "flex", flexDirection: "column", background: "#050608", overflow: "hidden" }}>
      <header style={{ padding: "0.9rem 1rem", display: "flex", alignItems: "center", gap: "0.75rem", background: "rgba(5,6,11,0.98)", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0, zIndex: 10 }}>
        <button
          onClick={() => router.push("/conductor")}
          aria-label="Volver"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "50%", width: "38px", height: "38px", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", cursor: "pointer", fontSize: "1.1rem", flexShrink: 0 }}
        >
          ←
        </button>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "0.58rem", color: "#3bf63b", fontWeight: 800, letterSpacing: "1.2px", textTransform: "uppercase" }}>
            Inicio de ruta
          </div>
          <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {ruta.destino}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.3rem" }}>
          <span style={{ padding: "0.28rem 0.65rem", borderRadius: "999px", background: "rgba(59,246,59,0.1)", border: "1px solid rgba(59,246,59,0.22)", fontSize: "0.58rem", fontWeight: 800, color: "#3bf63b", letterSpacing: "0.4px" }}>
            {formatRouteStateLabel(ruta.estado)}
          </span>
          <span style={{ fontSize: "0.58rem", color: currentPos ? "#3bf63b" : "#9ca3af", fontWeight: 700 }}>
            {currentPos ? "GPS conectado" : "Sin señal GPS"}
          </span>
        </div>
      </header>

      <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
        <NavegacionMapa
          origen={origen}
          destino={destino}
          currentPos={currentPos}
          routes={routes}
          activeIdx={0}
          onSelectRoute={() => undefined}
          followMode
          liveHeading={liveHeading}
          driverZoom={18}
          showAlternativeRoutes={false}
        />

        {loadingRoutes && (
          <div style={{ position: "absolute", top: "1rem", left: "50%", transform: "translateX(-50%)", background: "rgba(5,6,11,0.92)", border: "1px solid rgba(59,246,59,0.2)", padding: "0.5rem 0.9rem", borderRadius: "99px", fontSize: "0.7rem", color: "#3bf63b", fontWeight: 600, zIndex: 100 }}>
            Calculando ruta…
          </div>
        )}
      </div>

      <div style={{ background: "rgba(5,6,11,0.99)", borderTop: "1px solid rgba(255,255,255,0.07)", padding: "0.95rem 1rem calc(1rem + env(safe-area-inset-bottom, 0px))", flexShrink: 0, display: "flex", flexDirection: "column", gap: "0.8rem" }}>
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "16px", padding: "0.95rem" }}>
          <div style={{ fontSize: "0.62rem", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.9px", marginBottom: "0.45rem" }}>
            Ruta asignada
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", flexWrap: "wrap", lineHeight: 1.35 }}>
            <span style={{ color: "#e5e7eb", fontWeight: 700 }}>{ruta.origen}</span>
            <span style={{ color: "#4b5563" }}>→</span>
            <span style={{ color: "#ef4444", fontWeight: 700 }}>{ruta.destino}</span>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.55rem" }}>
          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "12px", padding: "0.65rem", textAlign: "center" }}>
            <div style={{ fontSize: "0.95rem", fontWeight: 900, color: "#3bf63b" }}>{distanciaKm.toFixed(1)}</div>
            <div style={{ fontSize: "0.5rem", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px", marginTop: "2px" }}>km</div>
          </div>

          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "12px", padding: "0.65rem", textAlign: "center" }}>
            <div style={{ fontSize: "0.95rem", fontWeight: 900, color: "#60a5fa" }}>{formatDuration(minutos)}</div>
            <div style={{ fontSize: "0.5rem", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px", marginTop: "2px" }}>tiempo</div>
          </div>

          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "12px", padding: "0.65rem", textAlign: "center" }}>
            <div style={{ fontSize: "0.95rem", fontWeight: 900, color: "#a78bfa" }}>{eta}</div>
            <div style={{ fontSize: "0.5rem", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px", marginTop: "2px" }}>llegada</div>
          </div>
        </div>

        {!activeRoute && !loadingRoutes && (
          <div style={{ textAlign: "center", padding: "0.75rem", color: "#9ca3af", fontSize: "0.75rem", background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.25)", borderRadius: "12px" }}>
            No se pudo calcular la ruta en el mapa en este momento. Puedes abrir la navegación externa.
          </div>
        )}

        <button
          onClick={abrirNavegacionExterna}
          style={{ width: "100%", padding: "0.95rem", background: "linear-gradient(135deg, #3bf63b, #22c55e)", border: "none", borderRadius: "14px", color: "#041107", fontWeight: 900, fontSize: "0.84rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", boxShadow: "0 10px 25px -12px rgba(59,246,59,0.7)" }}
        >
          <span style={{ fontSize: "1rem" }}>🧭</span>
          Abrir en Google Maps
        </button>
      </div>
    </main>
  );
}
