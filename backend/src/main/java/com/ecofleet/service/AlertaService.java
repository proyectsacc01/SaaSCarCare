package com.ecofleet.service;

import com.ecofleet.model.*;
import com.ecofleet.repository.*;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public class AlertaService {

    private static final Logger log = LoggerFactory.getLogger(AlertaService.class);

    @Autowired private AlertaRepository alertaRepository;
    @Autowired private UsuarioRepository usuarioRepository;
    @Autowired private VehiculoRepository vehiculoRepository;
    @Autowired private RutaRepository rutaRepository;
    @Autowired private MantenimientoPreventivoRepository preventivoRepo;
    @Autowired private MantenimientoCorrectivoRepository correctivoRepo;
    @Autowired private DocumentoVehiculoRepository documentoRepo;
    @Autowired private ProgramacionMantenimientoRepository programacionRepo;

    // ═══════════════════════════════════════════════════════════════
    // SCHEDULER — corre cada 5 minutos
    // ═══════════════════════════════════════════════════════════════
    @Scheduled(fixedDelay = 300000, initialDelay = 15000)
    public void verificarCondiciones() {
        log.info("[Alertas] Iniciando verificación de condiciones...");
        List<Usuario> empresas = usuarioRepository.findAll();

        for (Usuario empresa : empresas) {
            try {
                procesarEmpresa(empresa);
            } catch (Exception e) {
                log.error("[Alertas] Error procesando empresa {}: {}", empresa.getId(), e.getMessage());
            }
        }

        // Limpiar alertas resueltas de más de 7 días
        alertaRepository.deleteByResueltaTrueAndTimestampBefore(LocalDateTime.now().minusDays(7));
        log.info("[Alertas] Verificación completada para {} empresas", empresas.size());
    }

    private void procesarEmpresa(Usuario empresa) {
        String empresaId = empresa.getId();
        List<Vehiculo> vehiculos = vehiculoRepository.findByUsuarioId(empresaId);
        List<Ruta> rutas = rutaRepository.findByUsuarioId(empresaId);

        // 1. Calcular las grupoKeys actualmente activas
        Set<String> grupoKeysActivos = new HashSet<>();

        for (Vehiculo v : vehiculos) {
            if (v.getKilometraje() == null) continue;

            // Buscar el mantenimiento preventivo más reciente con proximoMantenimiento
            List<MantenimientoPreventivo> preventivos =
                    preventivoRepo.findByVehiculoIdOrderByFechaDesc(v.getId());

            double proximoKm = -1;
            for (MantenimientoPreventivo p : preventivos) {
                if (p.getProximoMantenimiento() != null && p.getProximoMantenimiento() > 0) {
                    proximoKm = p.getProximoMantenimiento();
                    break;
                }
            }

            if (proximoKm > 0) {
                double km = v.getKilometraje();
                String info = v.getMarca() + " " + v.getModelo() + " (" + v.getMatricula() + ")";

                if (km >= proximoKm) {
                    String key = "mant_crit_" + v.getId();
                    grupoKeysActivos.add(key);
                    crearSiNoExiste(key, empresaId, "MANTENIMIENTO", "CRITICAL",
                            "Mantenimiento vencido — " + info,
                            String.format("Superó en %.0f km el límite de mantenimiento programado (%.0f km)", km - proximoKm, proximoKm),
                            v.getId(), null, info);
                    // Si había WARNING para este vehículo, resolverlo
                    resolverSiExiste("mant_warn_" + v.getId());

                } else if (km >= proximoKm - 1000) {
                    String key = "mant_warn_" + v.getId();
                    grupoKeysActivos.add(key);
                    crearSiNoExiste(key, empresaId, "MANTENIMIENTO", "WARNING",
                            "Mantenimiento próximo — " + info,
                            String.format("Quedan %.0f km para el próximo mantenimiento programado (%.0f km)", proximoKm - km, proximoKm),
                            v.getId(), null, info);
                }
            }
        }

        // 2. Combustible bajo (< 20%)
        for (Vehiculo v : vehiculos) {
            if (v.getCombustibleActual() == null) continue;
            String info = v.getMarca() + " " + v.getModelo() + " (" + v.getMatricula() + ")";
            double pct = v.getCombustibleActual();
            String key = "combustible_bajo_" + v.getId();

            if (pct < 20.0) {
                grupoKeysActivos.add(key);
                String severidad = pct < 10.0 ? "CRITICAL" : "WARNING";
                crearSiNoExiste(key, empresaId, "COMBUSTIBLE_BAJO", severidad,
                        "Combustible bajo — " + info,
                        String.format("Nivel de combustible al %.1f%% — repostaje necesario", pct),
                        v.getId(), null, info);
            } else {
                resolverSiExiste(key);
            }
        }

        for (Ruta r : rutas) {
            if (r.getEstado() == null) continue;
            String estadoRuta = normalizarEstado(r.getEstado());
            String label = r.getOrigen() + " → " + r.getDestino();

            if ("DETENIDO".equals(estadoRuta)) {
                String key = "detenida_" + r.getId();
                grupoKeysActivos.add(key);
                String duracion = "";
                if (r.getInicioDetencion() != null) {
                    try {
                        long secs = (Instant.now().toEpochMilli() - Instant.parse(r.getInicioDetencion()).toEpochMilli()) / 1000;
                        duracion = secs > 0 ? " · " + formatearDuracion(secs) + " parado" : "";
                    } catch (Exception ignored) {}
                }
                crearSiNoExiste(key, empresaId, "RUTA_DETENIDA", "WARNING",
                        "Ruta detenida — " + label,
                        "El vehículo lleva tiempo parado sin movimiento" + duracion,
                        r.getVehiculoId(), r.getId(), label);
            } else {
                resolverSiExiste("detenida_" + r.getId());
            }

            if (Boolean.TRUE.equals(r.getDesviado()) && "EN_CURSO".equals(estadoRuta)) {
                String key = "desviada_" + r.getId();
                grupoKeysActivos.add(key);
                crearSiNoExiste(key, empresaId, "RUTA_DESVIADA", "WARNING",
                        "Conductor desviado — " + label,
                        "El vehículo se salió del corredor de la ruta planificada",
                        r.getVehiculoId(), r.getId(), label);
            } else {
                resolverSiExiste("desviada_" + r.getId());
            }

            if ("EN_CURSO".equals(estadoRuta) && r.getUltimaActualizacionGPS() != null) {
                try {
                    long secsDesdeGPS = (Instant.now().toEpochMilli() -
                            Instant.parse(r.getUltimaActualizacionGPS()).toEpochMilli()) / 1000;
                    if (secsDesdeGPS > 600) { // Más de 10 minutos sin GPS
                        String key = "gps_" + r.getId();
                        grupoKeysActivos.add(key);
                        crearSiNoExiste(key, empresaId, "GPS_PERDIDO", "WARNING",
                                "Señal GPS perdida — " + label,
                                "Sin actualización GPS desde hace " + formatearDuracion(secsDesdeGPS),
                                r.getVehiculoId(), r.getId(), label);
                    } else {
                        resolverSiExiste("gps_" + r.getId());
                    }
                } catch (Exception ignored) {}
            } else if ("COMPLETADA".equals(estadoRuta)) {
                resolverSiExiste("gps_" + r.getId());
                resolverSiExiste("detenida_" + r.getId());
                resolverSiExiste("desviada_" + r.getId());
            }
        }

        // ── 4. Documentos por vencer / vencidos ─────────────────────────────
        verificarDocumentos(empresaId, grupoKeysActivos);

        // ── 5. Programaciones de mantenimiento (km + tiempo) ────────────────
        verificarProgramaciones(empresaId, vehiculos, grupoKeysActivos);
    }

    // ═══════════════════════════════════════════════════════════════
    // DOCUMENTOS — vencimiento a 30, 15, 7 días y vencido
    // ═══════════════════════════════════════════════════════════════

    private void verificarDocumentos(String empresaId, Set<String> grupoKeysActivos) {
        LocalDate hoy = LocalDate.now();
        LocalDate en30Dias = hoy.plusDays(30);

        // Traer documentos que vencen dentro de 30 días o ya vencieron
        List<DocumentoVehiculo> documentos = documentoRepo.findByEmpresaId(empresaId);

        for (DocumentoVehiculo doc : documentos) {
            if (doc.getFechaVencimiento() == null) continue;

            LocalDate venc = doc.getFechaVencimiento();
            long diasRestantes = ChronoUnit.DAYS.between(hoy, venc);
            String info = doc.getVehiculoInfo() != null ? doc.getVehiculoInfo() : "Vehículo";
            String tipoDoc = formatearTipoDocumento(doc.getTipoDocumento());

            if (diasRestantes < 0) {
                // VENCIDO
                String key = "doc_vencido_" + doc.getId();
                grupoKeysActivos.add(key);
                crearSiNoExiste(key, empresaId, "DOCUMENTO_VENCIDO", "CRITICAL",
                        tipoDoc + " vencido — " + info,
                        String.format("%s venció hace %d día(s) (venc: %s)", tipoDoc, Math.abs(diasRestantes), venc),
                        doc.getVehiculoId(), null, info);
                // Resolver warning previo si lo había
                resolverSiExiste("doc_warn_" + doc.getId());

            } else if (diasRestantes <= 7) {
                String key = "doc_warn_" + doc.getId();
                grupoKeysActivos.add(key);
                crearSiNoExiste(key, empresaId, "DOCUMENTO_POR_VENCER", "CRITICAL",
                        tipoDoc + " vence en " + diasRestantes + " día(s) — " + info,
                        String.format("%s vence el %s — renovar URGENTE", tipoDoc, venc),
                        doc.getVehiculoId(), null, info);

            } else if (diasRestantes <= 15) {
                String key = "doc_warn_" + doc.getId();
                grupoKeysActivos.add(key);
                crearSiNoExiste(key, empresaId, "DOCUMENTO_POR_VENCER", "WARNING",
                        tipoDoc + " vence en " + diasRestantes + " días — " + info,
                        String.format("%s vence el %s — planificar renovación", tipoDoc, venc),
                        doc.getVehiculoId(), null, info);

            } else if (diasRestantes <= 30) {
                String key = "doc_warn_" + doc.getId();
                grupoKeysActivos.add(key);
                crearSiNoExiste(key, empresaId, "DOCUMENTO_POR_VENCER", "INFO",
                        tipoDoc + " vence en " + diasRestantes + " días — " + info,
                        String.format("%s vence el %s", tipoDoc, venc),
                        doc.getVehiculoId(), null, info);

            } else {
                // Documento vigente — resolver alertas previas
                resolverSiExiste("doc_vencido_" + doc.getId());
                resolverSiExiste("doc_warn_" + doc.getId());
            }
        }
    }

    private String formatearTipoDocumento(String tipo) {
        if (tipo == null) return "Documento";
        switch (tipo) {
            case "ITV": return "ITV";
            case "SEGURO": return "Seguro";
            case "PERMISO_CIRCULACION": return "Permiso de Circulación";
            case "TARJETA_TRANSPORTE": return "Tarjeta de Transporte";
            default: return "Documento";
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // PROGRAMACIONES — mantenimiento por km y/o tiempo
    // ═══════════════════════════════════════════════════════════════

    private void verificarProgramaciones(String empresaId, List<Vehiculo> vehiculos, Set<String> grupoKeysActivos) {
        List<ProgramacionMantenimiento> programaciones = programacionRepo.findByEmpresaIdAndActivoTrue(empresaId);
        LocalDate hoy = LocalDate.now();

        // Indexar vehículos por ID para lookup rápido
        Map<String, Vehiculo> vehiculoMap = new HashMap<>();
        for (Vehiculo v : vehiculos) vehiculoMap.put(v.getId(), v);

        for (ProgramacionMantenimiento prog : programaciones) {
            Vehiculo v = vehiculoMap.get(prog.getVehiculoId());
            if (v == null) continue;

            String info = prog.getVehiculoInfo() != null ? prog.getVehiculoInfo()
                    : v.getMarca() + " " + v.getModelo() + " (" + v.getMatricula() + ")";
            String nombre = prog.getNombre() != null ? prog.getNombre() : "Mantenimiento programado";

            boolean alertaKm = false;
            boolean alertaTiempo = false;
            String severidadKm = null;
            String severidadTiempo = null;
            String descKm = "";
            String descTiempo = "";

            // ── Check por kilómetros ────────────────────────────────────
            Double proximoKm = prog.getProximoKm();
            if (proximoKm != null && v.getKilometraje() != null) {
                double kmActual = v.getKilometraje();
                double kmRestantes = proximoKm - kmActual;

                if (kmRestantes <= 0) {
                    alertaKm = true;
                    severidadKm = "CRITICAL";
                    descKm = String.format("Superó en %.0f km el límite (%,.0f km)", Math.abs(kmRestantes), proximoKm);
                } else if (kmRestantes <= 1000) {
                    alertaKm = true;
                    severidadKm = "WARNING";
                    descKm = String.format("Faltan %.0f km para el próximo (%,.0f km)", kmRestantes, proximoKm);
                }
            }

            // ── Check por tiempo ────────────────────────────────────────
            LocalDate proximaFecha = prog.getProximaFecha();
            if (proximaFecha != null) {
                long diasRestantes = ChronoUnit.DAYS.between(hoy, proximaFecha);

                if (diasRestantes < 0) {
                    alertaTiempo = true;
                    severidadTiempo = "CRITICAL";
                    descTiempo = String.format("Venció hace %d día(s) (fecha: %s)", Math.abs(diasRestantes), proximaFecha);
                } else if (diasRestantes <= 15) {
                    alertaTiempo = true;
                    severidadTiempo = "WARNING";
                    descTiempo = String.format("Faltan %d día(s) para la fecha programada (%s)", diasRestantes, proximaFecha);
                }
            }

            // ── Generar alerta con la mayor severidad ───────────────────
            String key = "prog_mant_" + prog.getId();

            if (alertaKm || alertaTiempo) {
                grupoKeysActivos.add(key);

                // Elegir la mayor severidad entre km y tiempo
                String severidad;
                if ("CRITICAL".equals(severidadKm) || "CRITICAL".equals(severidadTiempo)) {
                    severidad = "CRITICAL";
                } else {
                    severidad = "WARNING";
                }

                // Combinar descripciones
                StringBuilder desc = new StringBuilder();
                if (alertaKm) desc.append("KM: ").append(descKm);
                if (alertaKm && alertaTiempo) desc.append(" | ");
                if (alertaTiempo) desc.append("Tiempo: ").append(descTiempo);

                String titulo = severidad.equals("CRITICAL")
                        ? nombre + " vencido — " + info
                        : nombre + " próximo — " + info;

                crearSiNoExiste(key, empresaId, "MANTENIMIENTO_PROGRAMADO", severidad,
                        titulo, desc.toString(), v.getId(), null, info);
            } else {
                resolverSiExiste(key);
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════════════════════

    private void crearSiNoExiste(String grupoKey, String empresaId, String tipo, String severidad,
                                  String titulo, String descripcion,
                                  String vehiculoId, String rutaId, String vehiculoInfo) {
        List<Alerta> activas = alertaRepository.findByGrupoKeyAndResueltaFalseOrderByTimestampDesc(grupoKey);

        if (!activas.isEmpty()) {
            Alerta principal = activas.get(0);
            boolean actualizada = actualizarAlerta(principal, empresaId, tipo, severidad, titulo, descripcion, vehiculoId, rutaId, vehiculoInfo);
            if (actualizada) {
                alertaRepository.save(principal);
            }

            if (activas.size() > 1) {
                for (int i = 1; i < activas.size(); i++) {
                    Alerta duplicada = activas.get(i);
                    duplicada.setResuelta(true);
                    alertaRepository.save(duplicada);
                }
                log.info("[Alertas] Se consolidaron {} alertas duplicadas para {}", activas.size() - 1, grupoKey);
            }
            return;
        }

        Alerta alerta = new Alerta();
        alerta.setGrupoKey(grupoKey);
        alerta.setLeida(false);
        alerta.setResuelta(false);
        actualizarAlerta(alerta, empresaId, tipo, severidad, titulo, descripcion, vehiculoId, rutaId, vehiculoInfo);
        alertaRepository.save(alerta);
        log.info("[Alertas] Nueva alerta: {} — {}", severidad, titulo);
    }

    private void resolverSiExiste(String grupoKey) {
        List<Alerta> activas = alertaRepository.findByGrupoKeyAndResueltaFalseOrderByTimestampDesc(grupoKey);
        activas.forEach(a -> {
            a.setResuelta(true);
            alertaRepository.save(a);
        });
    }

    private boolean actualizarAlerta(Alerta alerta, String empresaId, String tipo, String severidad,
                                     String titulo, String descripcion,
                                     String vehiculoId, String rutaId, String vehiculoInfo) {
        boolean cambio = false;

        if (!empresaId.equals(alerta.getEmpresaId())) {
            alerta.setEmpresaId(empresaId);
            cambio = true;
        }
        if (!tipo.equals(alerta.getTipo())) {
            alerta.setTipo(tipo);
            cambio = true;
        }
        if (!severidad.equals(alerta.getSeveridad())) {
            alerta.setSeveridad(severidad);
            cambio = true;
        }
        if (!titulo.equals(alerta.getTitulo())) {
            alerta.setTitulo(titulo);
            cambio = true;
        }
        if (!descripcion.equals(alerta.getDescripcion())) {
            alerta.setDescripcion(descripcion);
            cambio = true;
        }
        if (!equalsNullable(vehiculoId, alerta.getVehiculoId())) {
            alerta.setVehiculoId(vehiculoId);
            cambio = true;
        }
        if (!equalsNullable(rutaId, alerta.getRutaId())) {
            alerta.setRutaId(rutaId);
            cambio = true;
        }
        if (!equalsNullable(vehiculoInfo, alerta.getVehiculoInfo())) {
            alerta.setVehiculoInfo(vehiculoInfo);
            cambio = true;
        }
        if (alerta.isResuelta()) {
            alerta.setResuelta(false);
            cambio = true;
        }
        if (cambio || alerta.getTimestamp() == null) {
            alerta.setTimestamp(LocalDateTime.now());
            return true;
        }
        return false;
    }

    private boolean equalsNullable(String a, String b) {
        return a == null ? b == null : a.equals(b);
    }

    private String formatearDuracion(long segundos) {
        long minutosTotales = Math.max(1, segundos / 60);
        long dias = minutosTotales / (24 * 60);
        long horas = (minutosTotales % (24 * 60)) / 60;
        long minutos = minutosTotales % 60;

        if (dias > 0) {
            return horas > 0
                    ? dias + " d " + horas + " h"
                    : dias + " d";
        }

        if (horas > 0) {
            return minutos > 0
                    ? horas + " h " + minutos + " min"
                    : horas + " h";
        }

        return minutos + " min";
    }

    // ═══════════════════════════════════════════════════════════════
    // ACCIONES DEL USUARIO
    // ═══════════════════════════════════════════════════════════════

    public List<Alerta> getAlertasActivas(String empresaId) {
        List<Alerta> activas = alertaRepository.findByEmpresaIdAndResueltaFalseOrderByTimestampDesc(empresaId);
        return consolidarDuplicadas(activas);
    }

    public long getNoLeidas(String empresaId) {
        return alertaRepository.countByEmpresaIdAndLeidaFalseAndResueltaFalse(empresaId);
    }

    public void marcarLeida(String alertaId) {
        alertaRepository.findById(alertaId).ifPresent(a -> {
            a.setLeida(true);
            alertaRepository.save(a);
        });
    }

    public void marcarTodasLeidas(String empresaId) {
        List<Alerta> noLeidas = alertaRepository.findByEmpresaIdAndLeidaFalseAndResueltaFalse(empresaId);
        noLeidas.forEach(a -> a.setLeida(true));
        alertaRepository.saveAll(noLeidas);
    }

    private List<Alerta> consolidarDuplicadas(List<Alerta> alertas) {
        Map<String, Alerta> porGrupo = new HashMap<>();
        List<Alerta> visibles = new ArrayList<>();

        for (Alerta alerta : alertas) {
            String grupoKey = alerta.getGrupoKey();
            if (grupoKey == null || grupoKey.isBlank()) {
                visibles.add(alerta);
                continue;
            }

            if (!porGrupo.containsKey(grupoKey)) {
                porGrupo.put(grupoKey, alerta);
                visibles.add(alerta);
                continue;
            }

            alerta.setResuelta(true);
            alertaRepository.save(alerta);
        }

        return visibles;
    }

    private String normalizarEstado(String estado) {
        if (estado == null || estado.isBlank()) {
            return "PLANIFICADA";
        }
        String limpio = estado.trim().toUpperCase().replace(' ', '_');
        return switch (limpio) {
            case "ENCURSO" -> "EN_CURSO";
            case "DETENIDA", "PAUSADA", "PAUSADO", "STOPPED" -> "DETENIDO";
            case "COMPLETADO" -> "COMPLETADA";
            case "PLANEADA" -> "PLANIFICADA";
            default -> limpio;
        };
    }
}
