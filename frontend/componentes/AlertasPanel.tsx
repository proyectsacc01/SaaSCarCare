"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "@/lib/i18n";
import { toast } from "sonner";
import styles from "./AlertasPanel.module.css";

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface Alerta {
  id: string;
  grupoKey?: string;
  tipo: "MANTENIMIENTO" | "RUTA_DETENIDA" | "RUTA_DESVIADA" | "GPS_PERDIDO" | "DOCUMENTO_VENCIDO" | "DOCUMENTO_POR_VENCER" | "MANTENIMIENTO_PROGRAMADO" | "COMBUSTIBLE_BAJO" | "MENSAJE_CONDUCTOR" | "SOPORTE_CONDUCTOR" | "EMERGENCIA_SOS";
  severidad: "CRITICAL" | "WARNING" | "INFO";
  titulo: string;
  descripcion: string;
  vehiculoId?: string;
  rutaId?: string;
  vehiculoInfo?: string;
  timestamp: string;
  leida: boolean;
  resuelta: boolean;
}

interface Props {
  apiUrl: string;
  getAuthHeaders: () => Record<string, string>;
  onNavigate?: (rutaId?: string, vehiculoId?: string) => void;
}

// ─── Helpers visuales ────────────────────────────────────────────────────────

const COLOR: Record<string, string> = {
  CRITICAL: "#ef4444",
  WARNING:  "#f59e0b",
  INFO:     "#3b82f6",
};

const BG: Record<string, string> = {
  CRITICAL: "rgba(239,68,68,0.12)",
  WARNING:  "rgba(245,158,11,0.12)",
  INFO:     "rgba(59,130,246,0.12)",
};

type AlertaTranslations = {
  components: Record<string, string>;
  alerts: Record<string, string>;
};

function tiempoAtras(timestamp: string, t: AlertaTranslations): string {
  const diff = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
  if (diff < 60)   return t.components.justNow;
  if (diff < 3600) return t.components.agoMin.replace("{min}", Math.floor(diff / 60).toString());
  if (diff < 86400) return t.components.agoH.replace("{h}", Math.floor(diff / 3600).toString());
  return t.components.agoD.replace("{d}", Math.floor(diff / 86400).toString());
}

function traducirAlerta(alerta: Alerta, t: AlertaTranslations): { titulo: string; descripcion: string } {
  const key = alerta.tipo as string;
  const titleKey = `${key}_title`;
  const descKey  = `${key}_desc`;
  const a = t.alerts as Record<string, string>;

  const titulo = a[titleKey]
    ? (alerta.vehiculoInfo
        ? `${a[titleKey]} — ${alerta.vehiculoInfo}`
        : a[titleKey])
    : alerta.titulo;

  let descripcion = a[descKey] ?? alerta.descripcion;
  // Reemplazar {tiempo} con la descripción original del backend si tiene el patrón de tiempo
  if (descripcion.includes("{tiempo}")) {
    const match = alerta.descripcion.match(/\d+[dhm]\s*\d*[dhm]?/);
    const tiempo = match ? match[0] : alerta.descripcion.replace(/^\w+\s+.*?(\d+.*)$/, "$1");
    descripcion = descripcion.replace("{tiempo}", tiempo);
  }

  return { titulo, descripcion };
}

function formatearDuracionDesdeMinutos(minutosTotales: number): string {
  const minutos = Math.max(1, Math.floor(minutosTotales));
  const dias = Math.floor(minutos / 1440);
  const horas = Math.floor((minutos % 1440) / 60);
  const mins = minutos % 60;

  if (dias > 0) return horas > 0 ? `${dias}d ${horas}h` : `${dias}d`;
  if (horas > 0) return mins > 0 ? `${horas}h ${mins}min` : `${horas}h`;
  return `${mins} min`;
}

function normalizarDescripcionTiempo(descripcion: string): string {
  return descripcion.replace(/(\d+)\s*minutos?/gi, (_, mins: string) =>
    formatearDuracionDesdeMinutos(Number(mins))
  );
}

function deduplicarAlertas(alertas: Alerta[]): Alerta[] {
  const ordenadas = [...alertas].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  const vistas = new Set<string>();
  const resultado: Alerta[] = [];

  for (const alerta of ordenadas) {
    const clave = alerta.grupoKey?.trim()
      ? `grupo:${alerta.grupoKey}`
      : `${alerta.tipo}|${alerta.rutaId ?? ""}|${alerta.vehiculoId ?? ""}|${alerta.titulo.trim().toLowerCase()}`;
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    resultado.push({
      ...alerta,
      descripcion: normalizarDescripcionTiempo(alerta.descripcion),
    });
  }

  return resultado;
}

function prioridadSeveridad(severidad: Alerta["severidad"]) {
  if (severidad === "CRITICAL") return 0;
  if (severidad === "WARNING") return 1;
  return 2;
}

function ordenarAlertas(alertas: Alerta[]) {
  return [...alertas].sort((a, b) => {
    if (a.leida !== b.leida) {
      return a.leida ? 1 : -1;
    }
    const sev = prioridadSeveridad(a.severidad) - prioridadSeveridad(b.severidad);
    if (sev !== 0) return sev;
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });
}

// ─── Iconos SVG ──────────────────────────────────────────────────────────────

const IconMantenimiento = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
  </svg>
);

const IconDetenida = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <rect x="9" y="9" width="6" height="6" rx="1"/>
  </svg>
);

const IconDesviada = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
    <path d="M12 9v4"/><path d="M12 17h.01"/>
  </svg>
);

const IconGPS = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2a7 7 0 0 1 7 7c0 5-7 13-7 13S5 14 5 9a7 7 0 0 1 7-7z"/>
    <circle cx="12" cy="9" r="2.5"/>
    <path d="M16.5 19.5 21 21l-1.5-4.5"/>
    <line x1="2" y1="2" x2="22" y2="22"/>
  </svg>
);

const IconDocumento = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
    <polyline points="10 9 9 9 8 9"/>
  </svg>
);

const IconCalendario = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
    <line x1="16" y1="2" x2="16" y2="6"/>
    <line x1="8" y1="2" x2="8" y2="6"/>
    <line x1="3" y1="10" x2="21" y2="10"/>
    <path d="M10 14l2 2 4-4"/>
  </svg>
);

const IconCombustible = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 22V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"/>
    <path d="M15 10h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2v0a1 1 0 0 0 1-1V8l-3-3"/>
    <line x1="3" y1="22" x2="15" y2="22"/>
    <rect x="6" y="8" width="4" height="4" rx="0.5"/>
  </svg>
);

const IconMensaje = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
);

const IconBell = ({ hasAlertas }: { hasAlertas: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill={hasAlertas ? "none" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    {hasAlertas && <circle cx="18" cy="5" r="0" fill="#ef4444" stroke="none"/>}
  </svg>
);

const IconSOS = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/>
    <line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
);

function getIcono(tipo: string) {
  switch (tipo) {
    case "MANTENIMIENTO":              return <IconMantenimiento />;
    case "MANTENIMIENTO_PROGRAMADO":   return <IconCalendario />;
    case "DOCUMENTO_VENCIDO":          return <IconDocumento />;
    case "DOCUMENTO_POR_VENCER":       return <IconDocumento />;
    case "COMBUSTIBLE_BAJO":           return <IconCombustible />;
    case "RUTA_DETENIDA":              return <IconDetenida />;
    case "RUTA_DESVIADA":              return <IconDesviada />;
    case "GPS_PERDIDO":                return <IconGPS />;
    case "MENSAJE_CONDUCTOR":          return <IconMensaje />;
    case "SOPORTE_CONDUCTOR":          return <IconMensaje />;
    case "EMERGENCIA_SOS":             return <IconSOS />;
    default: return <IconDesviada />;
  }
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function AlertasPanel({ apiUrl, getAuthHeaders, onNavigate }: Props) {
  const t = useTranslation();

  const [open, setOpen] = useState(false);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const knownAlertKeysRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);

  const noLeidas = alertas.filter(a => !a.leida && !a.resuelta).length;

  const mostrarToastAlerta = useCallback((alerta: Alerta) => {
    const { titulo, descripcion } = traducirAlerta(alerta, t);
    const mensaje = descripcion ? `${titulo} · ${descripcion}` : titulo;

    if (alerta.tipo === "EMERGENCIA_SOS" || alerta.severidad === "CRITICAL") {
      toast.error(mensaje, { duration: 10000 });
      return;
    }

    if (alerta.tipo === "SOPORTE_CONDUCTOR") {
      toast.warning(mensaje, { duration: 7000 });
      return;
    }

    toast.info(mensaje, { duration: 5000 });
  }, [t]);

  // Cargar alertas
  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/api/alertas`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data: Alerta[] = await res.json();
        const deduplicadas = ordenarAlertas(deduplicarAlertas(data));

        const clavesActuales = new Set<string>();
        for (const alerta of deduplicadas) {
          const clave = alerta.grupoKey?.trim() || alerta.id;
          clavesActuales.add(clave);
        }

        if (!initializedRef.current) {
          knownAlertKeysRef.current = clavesActuales;
          initializedRef.current = true;
        } else {
          for (const alerta of deduplicadas) {
            const clave = alerta.grupoKey?.trim() || alerta.id;
            if (!knownAlertKeysRef.current.has(clave) && !alerta.leida && !alerta.resuelta) {
              mostrarToastAlerta(alerta);
            }
          }
          knownAlertKeysRef.current = clavesActuales;
        }

        setAlertas(deduplicadas);
      }
    } catch { /* silent */ }
  }, [apiUrl, getAuthHeaders, mostrarToastAlerta]);

  // Poll más frecuente para que SOS y soporte aparezcan casi en tiempo real.
  useEffect(() => {
    const primerCargaId = window.setTimeout(() => {
      void cargar();
    }, 0);
    const id = window.setInterval(() => {
      void cargar();
    }, 10000);
    return () => {
      window.clearTimeout(primerCargaId);
      window.clearInterval(id);
    };
  }, [cargar]);

  // Marcar una como leída
  const marcarLeida = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await fetch(`${apiUrl}/api/alertas/${id}/leer`, {
      method: "PUT",
      headers: getAuthHeaders(),
    });
    setAlertas(prev => prev.map(a => a.id === id ? { ...a, leida: true } : a));
  };

  // Marcar todas como leídas
  const marcarTodas = async () => {
    await fetch(`${apiUrl}/api/alertas/leer-todas`, {
      method: "PUT",
      headers: getAuthHeaders(),
    });
    setAlertas(prev => prev.map(a => ({ ...a, leida: true })));
  };

  const handleClickAlerta = (alerta: Alerta) => {
    if (!alerta.leida) {
      fetch(`${apiUrl}/api/alertas/${alerta.id}/leer`, {
        method: "PUT",
        headers: getAuthHeaders(),
      });
      setAlertas(prev => prev.map(a => a.id === alerta.id ? { ...a, leida: true } : a));
    }
    if (onNavigate) onNavigate(alerta.rutaId, alerta.vehiculoId);
    setOpen(false);
  };

  const activas = ordenarAlertas(alertas.filter(a => !a.resuelta));

  return (
    <div className={styles.bellWrapper}>
      {/* Botón campanita */}
      <button
        className={`${styles.bellBtn} ${noLeidas > 0 ? styles.hasAlertas : ""} ${open ? styles.bellBtnActive : ""}`}
        onClick={() => setOpen(v => !v)}
        title={t.components.alertsCenter}
      >
        <span className={`${styles.bellIcon} ${open ? styles.bellIconActive : ""}`}>
          <IconBell hasAlertas={noLeidas > 0} />
        </span>
        {noLeidas > 0 && (
          <span className={styles.badge}>{noLeidas > 99 ? "99+" : noLeidas}</span>
        )}
      </button>

      {/* Overlay + Panel via Portal — always in DOM, toggled via CSS */}
      {createPortal(
        <>
          <div
            className={`${styles.overlay} ${open ? styles.overlayVisible : ""}`}
            onClick={() => setOpen(false)}
          />
          <div className={`${styles.panel} ${open ? styles.panelVisible : ""}`}>
          {/* Header */}
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle}>
              {t.components.alertsTitle}
              <span className={`${styles.panelCount} ${noLeidas === 0 ? styles.panelCountOk : ""}`}>
                {noLeidas === 0 ? t.components.allOk : `${t.components.unreadAlerts.replace('{count}', noLeidas.toString())}`}
              </span>
            </span>
            {noLeidas > 0 && (
              <button className={styles.marcarTodasBtn} onClick={marcarTodas}>
                {t.components.markAllAsRead}
              </button>
            )}
          </div>

          {/* Lista */}
          <div className={styles.lista}>
            {activas.length === 0 ? (
              <div className={styles.empty}>
                <svg className={styles.emptyIcon} width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
                <p className={styles.emptyText}>{t.components.allInOrder}</p>
                <p className={styles.emptySubtext}>{t.components.noActiveAlerts}</p>
              </div>
            ) : (
              activas.map(alerta => {
                const color = COLOR[alerta.severidad] ?? "#f59e0b";
                const bg    = BG[alerta.severidad]    ?? BG.WARNING;
                return (
                  <div
                    key={alerta.id}
                    className={`${styles.item} ${alerta.leida ? styles.leida : ""}`}
                    onClick={() => handleClickAlerta(alerta)}
                  >
                    {/* Borde izquierdo de color */}
                    <div className={styles.itemBorde} style={{ background: color }} />

                    {/* Icono */}
                    <div className={styles.iconWrap} style={{ background: bg, color }}>
                      {getIcono(alerta.tipo)}
                    </div>

                    {/* Contenido */}
                    {(() => {
                      const { titulo, descripcion } = traducirAlerta(alerta, t);
                      return (
                        <div className={styles.itemBody}>
                          <div className={styles.itemTitulo}>{titulo}</div>
                          <div className={styles.itemDesc}>{descripcion}</div>
                          <div className={styles.itemMeta}>
                            <span className={styles.itemTiempo}>{tiempoAtras(alerta.timestamp, t)}</span>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Dismiss */}
                    {!alerta.leida && (
                      <button
                        className={styles.dismissBtn}
                        onClick={e => marcarLeida(e, alerta.id)}
                        title={t.components.markAsRead}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
