package com.ecofleet.service;

import com.ecofleet.model.*;
import com.ecofleet.repository.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.TextStyle;
import java.time.format.DateTimeParseException;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class ReporteService {

    private static final Logger log = LoggerFactory.getLogger(ReporteService.class);

    @Autowired private UsuarioRepository usuarioRepository;
    @Autowired private VehiculoRepository vehiculoRepository;
    @Autowired private RutaRepository rutaRepository;
    @Autowired private RepostajeRepository repostajeRepository;
    @Autowired private MantenimientoPreventivoRepository preventivosRepo;
    @Autowired private MantenimientoCorrectivoRepository correctivosRepo;
    @Autowired private ConfiguracionEmailRepository configEmailRepo;
    @Autowired private EmailService emailService;

    // ════════════════════════════════════════════════════════════════════════════
    // REPORTE MENSUAL POR EMAIL (existente)
    // ════════════════════════════════════════════════════════════════════════════

    @Scheduled(cron = "0 0 8 1 * *")
    public void enviarReportesMensuales() {
        log.info("Iniciando envío de reportes mensuales automáticos...");
        List<Usuario> admins = usuarioRepository.findByRole("ADMIN");
        for (Usuario admin : admins) {
            try {
                enviarReporte(admin.getId(), LocalDate.now(), true);
            } catch (Exception e) {
                log.error("Error enviando reporte a {}: {}", admin.getEmail(), e.getMessage());
            }
        }
        log.info("Reportes mensuales enviados a {} empresas.", admins.size());
    }

    public void enviarReporte(String empresaId) throws Exception {
        enviarReporte(empresaId, LocalDate.now(), false);
    }

    void enviarReporte(String empresaId, LocalDate fechaBase, boolean cierreMensual) throws Exception {
        Usuario admin = usuarioRepository.findById(empresaId)
                .orElseThrow(() -> new IllegalArgumentException("Empresa no encontrada"));

        ConfiguracionEmail cfg = configEmailRepo.findByEmpresaId(empresaId).orElse(null);

        YearMonth periodo = cierreMensual
                ? YearMonth.from(fechaBase.minusMonths(1))
                : YearMonth.from(fechaBase);
        int year  = periodo.getYear();
        int month = periodo.getMonthValue();
        String mesNombre = periodo.getMonth().getDisplayName(TextStyle.FULL, new Locale("es", "ES"));
        mesNombre = mesNombre.substring(0, 1).toUpperCase() + mesNombre.substring(1);

        List<Vehiculo> vehiculos = vehiculoRepository.findByUsuarioId(empresaId);
        long totalVehiculos   = vehiculos.size();
        long vehiculosActivos = vehiculos.stream().filter(v -> Boolean.TRUE.equals(v.getActivo())).count();

        List<String> vehiculoIds = vehiculos.stream().map(Vehiculo::getId).collect(Collectors.toList());

        List<Ruta> todasRutas = rutaRepository.findByUsuarioId(empresaId);
        List<Ruta> rutasMes   = todasRutas.stream()
                .filter(r -> perteneceAlPeriodo(r.getFecha(), periodo))
                .collect(Collectors.toList());
        long rutasCompletadas = rutasMes.stream()
                .filter(r -> "COMPLETADA".equals(normalizarEstado(r.getEstado())))
                .count();
        long rutasTotal       = rutasMes.size();
        // SOLO km reales (GPS). Sin GPS → 0 km. La estimada es para planificación.
        double kmTotales      = rutasMes.stream()
                .filter(r -> "COMPLETADA".equals(normalizarEstado(r.getEstado())))
                .mapToDouble(r -> r.getDistanciaRecorridaKm() != null ? r.getDistanciaRecorridaKm() : 0)
                .sum();

        double litrosTotales = 0, costeCombustible = 0;
        for (String vid : vehiculoIds) {
            for (Repostaje r : repostajeRepository.findByVehiculoId(vid)) {
                if (r.getFecha() != null && r.getFecha().getYear() == year && r.getFecha().getMonthValue() == month) {
                    litrosTotales    += r.getLitros()     != null ? r.getLitros()     : 0;
                    costeCombustible += r.getCosteTotal() != null ? r.getCosteTotal() : 0;
                }
            }
        }

        double costeMantenimiento = 0;
        int totalMantenimientos   = 0;
        for (String vid : vehiculoIds) {
            for (MantenimientoPreventivo mp : preventivosRepo.findByVehiculoIdOrderByFechaDesc(vid)) {
                if (mp.getFecha() != null && mp.getFecha().getYear() == year && mp.getFecha().getMonthValue() == month) {
                    costeMantenimiento += mp.getCosto() != null ? mp.getCosto() : 0;
                    totalMantenimientos++;
                }
            }
            for (MantenimientoCorrectivo mc : correctivosRepo.findByVehiculoIdOrderByFechaDesc(vid)) {
                if (mc.getFecha() != null && mc.getFecha().getYear() == year && mc.getFecha().getMonthValue() == month) {
                    costeMantenimiento += mc.getCosto() != null ? mc.getCosto() : 0;
                    totalMantenimientos++;
                }
            }
        }

        double costeTotal = costeCombustible + costeMantenimiento;

        String emailDestino = (cfg != null && cfg.getEmailNotificaciones() != null && !cfg.getEmailNotificaciones().isBlank())
                ? cfg.getEmailNotificaciones()
                : admin.getEmail();

        String html = buildHtml(
                admin.getNombreEmpresa() != null ? admin.getNombreEmpresa() : admin.getNombre(),
                mesNombre, year,
                totalVehiculos, vehiculosActivos,
                rutasTotal, rutasCompletadas,
                kmTotales,
                litrosTotales, costeCombustible,
                totalMantenimientos, costeMantenimiento,
                costeTotal
        );

        String subject = "Reporte Mensual CarCare - " + mesNombre + " " + year;
        emailService.enviar(emailDestino, subject, html);
        log.info("Reporte mensual enviado a {} ({}) para {}-{}: vehiculos={}, rutasPlanificadas={}, rutasCompletadas={}",
                emailDestino, empresaId, year, month, totalVehiculos, rutasTotal, rutasCompletadas);
    }

    // ════════════════════════════════════════════════════════════════════════════
    // COSTES & ROI POR VEHÍCULO (Feature 2)
    // ════════════════════════════════════════════════════════════════════════════

    /**
     * Calcula el TCO de un vehículo específico para un periodo dado.
     * Si no se pasa periodo, usa los últimos 6 meses.
     */
    public Map<String, Object> calcularCostesVehiculo(String empresaId, String vehiculoId, String periodoStr) {
        Vehiculo vehiculo = vehiculoRepository.findById(vehiculoId)
                .orElseThrow(() -> new IllegalArgumentException("Vehículo no encontrado"));

        if (!empresaId.equals(vehiculo.getUsuarioId())) {
            throw new IllegalArgumentException("Vehículo no pertenece a esta empresa");
        }

        YearMonth periodo = periodoStr != null && !periodoStr.isBlank()
                ? YearMonth.parse(periodoStr)
                : YearMonth.now();

        // Una sola query por colección — luego procesamos en memoria
        List<String> ids = List.of(vehiculoId);
        DatosFlota datos = cargarDatosFlota(ids);

        List<Map<String, Object>> tendenciaMensual = new ArrayList<>();
        double totalCombustible = 0, totalMantenimiento = 0, totalLitros = 0, totalKm = 0;

        for (int i = 5; i >= 0; i--) {
            YearMonth mes = periodo.minusMonths(i);
            Map<String, Object> datosMes = calcularCostesMesVehiculoEnMemoria(vehiculoId, mes, datos);
            tendenciaMensual.add(datosMes);

            totalCombustible += (double) datosMes.get("costeCombustible");
            totalMantenimiento += (double) datosMes.get("costeMantenimiento");
            totalLitros += (double) datosMes.get("litros");
            totalKm += (double) datosMes.get("kmRecorridos");
        }

        double amortizacionMensual = 2500.0;
        double totalAmortizacion = amortizacionMensual;

        double costeTotal = totalCombustible + totalMantenimiento + totalAmortizacion;
        double costePorKm = totalKm > 0 ? costeTotal / totalKm : 0;
        double litrosPor100Km = totalKm > 0 ? (totalLitros / totalKm) * 100 : 0;

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("vehiculoId", vehiculoId);
        result.put("vehiculo", vehiculo.getMarca() + " " + vehiculo.getModelo());
        result.put("matricula", vehiculo.getMatricula());
        result.put("periodo", periodo.toString());
        result.put("costeTotal", round2(costeTotal));
        result.put("costeCombustible", round2(totalCombustible));
        result.put("costeMantenimiento", round2(totalMantenimiento));
        result.put("amortizacionEstimada", round2(totalAmortizacion));
        result.put("costePorKm", round2(costePorKm));
        result.put("litrosPor100Km", round2(litrosPor100Km));
        result.put("kmTotales", round2(totalKm));
        result.put("litrosTotales", round2(totalLitros));
        result.put("tendenciaMensual", tendenciaMensual);

        return result;
    }

    /**
     * Calcula KPIs de la flota completa: coste/km por vehículo, tendencia mensual,
     * ranking de más costosos.
     *
     * Optimización: 4 queries totales a MongoDB (antes eran 12 × N × 4 ≈ 48N).
     * Toda la agregación posterior se hace en memoria.
     */
    public Map<String, Object> calcularFlotaKpis(String empresaId) {
        long t0 = System.currentTimeMillis();
        List<Vehiculo> vehiculos = vehiculoRepository.findByUsuarioId(empresaId);
        YearMonth ahora = YearMonth.now();

        if (vehiculos.isEmpty()) {
            Map<String, Object> empty = new LinkedHashMap<>();
            empty.put("totalVehiculos", 0);
            empty.put("costeTotalFlota", 0.0);
            empty.put("kmTotalesFlota", 0.0);
            empty.put("costePorKmFlota", 0.0);
            empty.put("vehiculos", new ArrayList<>());
            empty.put("tendenciaMensual", new ArrayList<>());
            return empty;
        }

        List<String> ids = vehiculos.stream().map(Vehiculo::getId).collect(Collectors.toList());
        DatosFlota datos = cargarDatosFlota(ids);

        // ── KPIs por vehículo (todo en memoria) ──
        List<Map<String, Object>> vehiculosKpis = new ArrayList<>();
        for (Vehiculo v : vehiculos) {
            Map<String, Object> kpi = calcularKpiVehiculoEnMemoria(v, ahora, datos);
            vehiculosKpis.add(kpi);
        }

        vehiculosKpis.sort((a, b) -> Double.compare(
                (double) b.get("costeTotalSemestre"),
                (double) a.get("costeTotalSemestre")
        ));

        // ── Tendencia mensual global ──
        List<Map<String, Object>> tendenciaGlobal = new ArrayList<>();
        for (int i = 5; i >= 0; i--) {
            YearMonth mes = ahora.minusMonths(i);
            double costeCombMes = 0, costeMantMes = 0, kmMes = 0, litrosMes = 0;

            for (Vehiculo v : vehiculos) {
                Map<String, Object> datosMes = calcularCostesMesVehiculoEnMemoria(v.getId(), mes, datos);
                costeCombMes += (double) datosMes.get("costeCombustible");
                costeMantMes += (double) datosMes.get("costeMantenimiento");
                kmMes += (double) datosMes.get("kmRecorridos");
                litrosMes += (double) datosMes.get("litros");
            }

            String mesLabel = mes.getMonth().getDisplayName(TextStyle.SHORT, new Locale("es", "ES"));
            mesLabel = mesLabel.substring(0, 1).toUpperCase() + mesLabel.substring(1);

            Map<String, Object> datoMes = new LinkedHashMap<>();
            datoMes.put("mes", mesLabel);
            datoMes.put("periodo", mes.toString());
            datoMes.put("costeCombustible", round2(costeCombMes));
            datoMes.put("costeMantenimiento", round2(costeMantMes));
            datoMes.put("costeTotal", round2(costeCombMes + costeMantMes));
            datoMes.put("kmRecorridos", round2(kmMes));
            datoMes.put("litros", round2(litrosMes));
            datoMes.put("costePorKm", kmMes > 0 ? round2((costeCombMes + costeMantMes) / kmMes) : 0);
            tendenciaGlobal.add(datoMes);
        }

        double totalCosteFlota = vehiculosKpis.stream()
                .mapToDouble(k -> (double) k.get("costeTotalSemestre")).sum();
        double totalKmFlota = vehiculosKpis.stream()
                .mapToDouble(k -> (double) k.get("kmTotales")).sum();

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("totalVehiculos", vehiculos.size());
        result.put("costeTotalFlota", round2(totalCosteFlota));
        result.put("kmTotalesFlota", round2(totalKmFlota));
        result.put("costePorKmFlota", totalKmFlota > 0 ? round2(totalCosteFlota / totalKmFlota) : 0);
        result.put("vehiculos", vehiculosKpis);
        result.put("tendenciaMensual", tendenciaGlobal);

        log.info("calcularFlotaKpis empresa={} vehiculos={} en {}ms", empresaId, vehiculos.size(), System.currentTimeMillis() - t0);
        return result;
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    /**
     * Carga TODA la información de costes (combustible, mantenimientos, rutas) para un set
     * de vehículos en 4 queries totales y la indexa por vehiculoId para acceso O(1) en memoria.
     */
    private DatosFlota cargarDatosFlota(List<String> vehiculoIds) {
        Map<String, List<Repostaje>> repostajesPorVeh = repostajeRepository.findByVehiculoIdIn(vehiculoIds)
                .stream().collect(Collectors.groupingBy(Repostaje::getVehiculoId));

        Map<String, List<MantenimientoPreventivo>> preventivosPorVeh = preventivosRepo.findByVehiculoIdIn(vehiculoIds)
                .stream().collect(Collectors.groupingBy(MantenimientoPreventivo::getVehiculoId));

        Map<String, List<MantenimientoCorrectivo>> correctivosPorVeh = correctivosRepo.findByVehiculoIdIn(vehiculoIds)
                .stream().collect(Collectors.groupingBy(MantenimientoCorrectivo::getVehiculoId));

        Map<String, List<Ruta>> rutasPorVeh = rutaRepository.findByVehiculoIdIn(vehiculoIds)
                .stream().collect(Collectors.groupingBy(Ruta::getVehiculoId));

        return new DatosFlota(repostajesPorVeh, preventivosPorVeh, correctivosPorVeh, rutasPorVeh);
    }

    private Map<String, Object> calcularKpiVehiculoEnMemoria(Vehiculo v, YearMonth ahora, DatosFlota datos) {
        String vehiculoId = v.getId();
        double totalComb = 0, totalMant = 0, totalLitros = 0, totalKm = 0;

        for (int i = 5; i >= 0; i--) {
            YearMonth mes = ahora.minusMonths(i);
            Map<String, Object> datosMes = calcularCostesMesVehiculoEnMemoria(vehiculoId, mes, datos);
            totalComb += (double) datosMes.get("costeCombustible");
            totalMant += (double) datosMes.get("costeMantenimiento");
            totalLitros += (double) datosMes.get("litros");
            totalKm += (double) datosMes.get("kmRecorridos");
        }

        double costeTotal = totalComb + totalMant;

        Map<String, Object> kpi = new LinkedHashMap<>();
        kpi.put("vehiculoId", vehiculoId);
        kpi.put("vehiculo", v.getMarca() + " " + v.getModelo());
        kpi.put("matricula", v.getMatricula());
        kpi.put("activo", Boolean.TRUE.equals(v.getActivo()));
        kpi.put("costeTotalSemestre", round2(costeTotal));
        kpi.put("costeCombustible", round2(totalComb));
        kpi.put("costeMantenimiento", round2(totalMant));
        kpi.put("costePorKm", totalKm > 0 ? round2(costeTotal / totalKm) : 0);
        kpi.put("litrosPor100Km", totalKm > 0 ? round2((totalLitros / totalKm) * 100.0) : 0);
        kpi.put("kmTotales", round2(totalKm));
        kpi.put("litrosTotales", round2(totalLitros));

        return kpi;
    }

    private Map<String, Object> calcularCostesMesVehiculoEnMemoria(String vehiculoId, YearMonth mes, DatosFlota datos) {
        int year = mes.getYear();
        int month = mes.getMonthValue();

        double costeComb = 0, litros = 0;
        for (Repostaje r : datos.repostajesPorVeh.getOrDefault(vehiculoId, Collections.emptyList())) {
            if (r.getFecha() != null && r.getFecha().getYear() == year && r.getFecha().getMonthValue() == month) {
                costeComb += r.getCosteTotal() != null ? r.getCosteTotal() : 0;
                litros += r.getLitros() != null ? r.getLitros() : 0;
            }
        }

        double costeMant = 0;
        for (MantenimientoPreventivo mp : datos.preventivosPorVeh.getOrDefault(vehiculoId, Collections.emptyList())) {
            if (mp.getFecha() != null && mp.getFecha().getYear() == year && mp.getFecha().getMonthValue() == month) {
                costeMant += mp.getCosto() != null ? mp.getCosto() : 0;
            }
        }
        for (MantenimientoCorrectivo mc : datos.correctivosPorVeh.getOrDefault(vehiculoId, Collections.emptyList())) {
            if (mc.getFecha() != null && mc.getFecha().getYear() == year && mc.getFecha().getMonthValue() == month) {
                costeMant += mc.getCosto() != null ? mc.getCosto() : 0;
            }
        }

        double kmMes = 0;
        for (Ruta ruta : datos.rutasPorVeh.getOrDefault(vehiculoId, Collections.emptyList())) {
            if ("COMPLETADA".equals(normalizarEstado(ruta.getEstado()))
                    && perteneceAlPeriodo(ruta.getFecha(), mes)) {
                // SOLO km reales (GPS). Sin GPS → 0 km.
                kmMes += ruta.getDistanciaRecorridaKm() != null ? ruta.getDistanciaRecorridaKm() : 0;
            }
        }

        String mesLabel = mes.getMonth().getDisplayName(TextStyle.SHORT, new Locale("es", "ES"));
        mesLabel = mesLabel.substring(0, 1).toUpperCase() + mesLabel.substring(1);

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("mes", mesLabel);
        data.put("periodo", mes.toString());
        data.put("costeCombustible", round2(costeComb));
        data.put("costeMantenimiento", round2(costeMant));
        data.put("costeTotal", round2(costeComb + costeMant));
        data.put("litros", round2(litros));
        data.put("kmRecorridos", round2(kmMes));
        data.put("costePorKm", kmMes > 0 ? round2((costeComb + costeMant) / kmMes) : 0);

        return data;
    }

    private static final class DatosFlota {
        final Map<String, List<Repostaje>> repostajesPorVeh;
        final Map<String, List<MantenimientoPreventivo>> preventivosPorVeh;
        final Map<String, List<MantenimientoCorrectivo>> correctivosPorVeh;
        final Map<String, List<Ruta>> rutasPorVeh;

        DatosFlota(Map<String, List<Repostaje>> r, Map<String, List<MantenimientoPreventivo>> p,
                   Map<String, List<MantenimientoCorrectivo>> c, Map<String, List<Ruta>> ru) {
            this.repostajesPorVeh = r;
            this.preventivosPorVeh = p;
            this.correctivosPorVeh = c;
            this.rutasPorVeh = ru;
        }
    }

    private double round2(double value) {
        return Math.round(value * 100.0) / 100.0;
    }

    // ════════════════════════════════════════════════════════════════════════════
    // HTML TEMPLATE (existente - sin cambios)
    // ════════════════════════════════════════════════════════════════════════════

    private String buildHtml(String empresa, String mes, int year,
                             long totalVeh, long activosVeh,
                             long rutasTot, long rutasComp,
                             double km,
                             double litros, double costeComb,
                             int mantenTotal, double costeMant,
                             double costeTotal) {
        String pct = rutasTot > 0
                ? String.format("%.0f%%", (rutasComp * 100.0 / rutasTot))
                : "-";

        return "<!DOCTYPE html><html lang='es'><head><meta charset='UTF-8'>" +
               "<meta name='viewport' content='width=device-width,initial-scale=1'></head>" +
               "<body style='margin:0;padding:0;background:#080c14;font-family:Segoe UI,Roboto,Arial,sans-serif;'>" +

               // ── Outer container
               "<table width='100%' cellpadding='0' cellspacing='0' style='background:#080c14;'><tr><td align='center'>" +
               "<table width='600' cellpadding='0' cellspacing='0' style='max-width:600px;width:100%;'>" +

               // ── HEADER
               "<tr><td style='background:linear-gradient(135deg,#0f1923 0%,#0d1117 100%);padding:48px 40px 36px;text-align:center;border-bottom:2px solid #3bf63b;'>" +
               "<div style='margin-bottom:20px;'>" +
               "<span style='display:inline-block;font-size:28px;font-weight:800;letter-spacing:3px;color:#3bf63b;'>./CarCare</span>" +
               "</div>" +
               "<h1 style='color:#ffffff;margin:0 0 8px;font-size:22px;font-weight:700;letter-spacing:0.5px;'>Reporte Mensual de Flota</h1>" +
               "<p style='color:rgba(255,255,255,0.45);margin:0;font-size:14px;'>" + mes + " " + year + "</p>" +
               "</td></tr>" +

               // ── EMPRESA BAR
               "<tr><td style='background:#0f1923;padding:16px 40px;border-bottom:1px solid rgba(255,255,255,0.06);'>" +
               "<table width='100%' cellpadding='0' cellspacing='0'><tr>" +
               "<td style='color:rgba(255,255,255,0.4);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1.5px;'>Empresa</td>" +
               "<td align='right' style='color:#ffffff;font-size:14px;font-weight:700;'>" + empresa + "</td>" +
               "</tr></table>" +
               "</td></tr>" +

               // ── BODY
               "<tr><td style='background:#0d1117;padding:32px 28px;'>" +

               // Intro
               "<p style='color:rgba(255,255,255,0.6);font-size:14px;line-height:1.7;margin:0 0 28px;'>" +
               "Aqui tenes el resumen de actividad de tu flota durante <span style='color:#3bf63b;font-weight:600;'>" + mes + " " + year + "</span>.</p>" +

               // ── KPI Row 1: Vehiculos + Rutas
               "<table width='100%' cellpadding='0' cellspacing='0' style='margin-bottom:12px;'><tr>" +
               "<td width='49%' valign='top'>" + kpiCard("VEHICULOS", totalVeh + " total", activosVeh + " activos", "#3bf63b") + "</td>" +
               "<td width='2%'></td>" +
               "<td width='49%' valign='top'>" + kpiCard("RUTAS", rutasTot + " planificadas", rutasComp + " completadas (" + pct + ")", "#22c55e") + "</td>" +
               "</tr></table>" +

               // ── KPI Row 2: Km + Combustible
               "<table width='100%' cellpadding='0' cellspacing='0' style='margin-bottom:12px;'><tr>" +
               "<td width='49%' valign='top'>" + kpiCard("KILOMETROS", String.format("%.0f km", km), "recorridos este mes", "#60a5fa") + "</td>" +
               "<td width='2%'></td>" +
               "<td width='49%' valign='top'>" + kpiCard("COMBUSTIBLE", String.format("%.1f L", litros), String.format("%.2f EUR", costeComb), "#f59e0b") + "</td>" +
               "</tr></table>" +

               // ── KPI Row 3: Mantenimientos + Coste Total
               "<table width='100%' cellpadding='0' cellspacing='0' style='margin-bottom:8px;'><tr>" +
               "<td width='49%' valign='top'>" + kpiCard("MANTENIMIENTOS", mantenTotal + " registros", String.format("%.2f EUR", costeMant), "#ef4444") + "</td>" +
               "<td width='2%'></td>" +
               "<td width='49%' valign='top'>" + kpiCard("COSTE TOTAL", String.format("%.2f EUR", costeTotal), "combustible + mant.", "#a78bfa") + "</td>" +
               "</tr></table>" +

               "</td></tr>" +

               // ── FOOTER
               "<tr><td style='background:#0a0e18;padding:28px 40px;text-align:center;border-top:1px solid rgba(255,255,255,0.06);'>" +
               "<p style='color:rgba(255,255,255,0.25);font-size:12px;margin:0 0 6px;'>Reporte generado automaticamente por <span style='color:#3bf63b;'>CarCare</span></p>" +
               "<p style='color:rgba(255,255,255,0.15);font-size:11px;margin:0;'>" + year + " CarCare Tracker - Gestion Inteligente de Flotas</p>" +
               "</td></tr>" +

               "</table></td></tr></table>" +
               "</body></html>";
    }

    private String kpiCard(String label, String value, String sub, String accentColor) {
        return "<div style='background:#0f1923;border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:18px 16px;'>" +
               "<div style='font-size:10px;font-weight:700;color:" + accentColor + ";text-transform:uppercase;letter-spacing:1.5px;margin-bottom:10px;'>" + label + "</div>" +
               "<div style='font-size:22px;font-weight:800;color:#ffffff;margin-bottom:4px;letter-spacing:-0.5px;'>" + value + "</div>" +
               "<div style='font-size:12px;color:rgba(255,255,255,0.4);'>" + sub + "</div>" +
               "</div>";
    }

    private boolean perteneceAlPeriodo(String fechaRuta, YearMonth periodo) {
        LocalDate fecha = parseRutaFecha(fechaRuta);
        return fecha != null && YearMonth.from(fecha).equals(periodo);
    }

    private LocalDate parseRutaFecha(String fechaRuta) {
        if (fechaRuta == null || fechaRuta.isBlank()) {
            return null;
        }

        String valor = fechaRuta.trim();

        LocalDate fecha = parseLocalDate(valor);
        if (fecha != null) {
            return fecha;
        }

        int separadorFechaHora = valor.indexOf('T');
        if (separadorFechaHora > 0) {
            fecha = parseLocalDate(valor.substring(0, separadorFechaHora));
            if (fecha != null) {
                return fecha;
            }
        }

        try {
            return OffsetDateTime.parse(valor).toLocalDate();
        } catch (DateTimeParseException ignored) {
        }

        try {
            return ZonedDateTime.parse(valor).toLocalDate();
        } catch (DateTimeParseException ignored) {
        }

        try {
            return Instant.parse(valor).atZone(ZoneId.systemDefault()).toLocalDate();
        } catch (DateTimeParseException ignored) {
        }

        log.warn("No se pudo interpretar la fecha de la ruta para el reporte mensual: {}", fechaRuta);
        return null;
    }

    private LocalDate parseLocalDate(String valor) {
        try {
            return LocalDate.parse(valor, DateTimeFormatter.ISO_LOCAL_DATE);
        } catch (DateTimeParseException ignored) {
        }

        try {
            return LocalDate.parse(valor, DateTimeFormatter.ofPattern("yyyy-M-d"));
        } catch (DateTimeParseException ignored) {
        }

        return null;
    }

    private String normalizarEstado(String estado) {
        return estado == null ? "" : estado.trim().toUpperCase(Locale.ROOT);
    }
}
