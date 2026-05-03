package com.ecofleet.controller;

import com.ecofleet.model.Alerta;
import com.ecofleet.model.Conductor;
import com.ecofleet.model.ConfiguracionEmail;
import com.ecofleet.model.Ruta;
import com.ecofleet.model.Usuario;
import com.ecofleet.repository.AlertaRepository;
import com.ecofleet.repository.ConfiguracionEmailRepository;
import com.ecofleet.repository.ConductorRepository;
import com.ecofleet.repository.RutaRepository;
import com.ecofleet.repository.UsuarioRepository;
import com.ecofleet.security.JwtUtil;
import com.ecofleet.service.EmailService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/conductores")
@CrossOrigin(origins = "*")
public class ConductorController {

    @Autowired
    private ConductorRepository conductorRepository;

    @Autowired
    private UsuarioRepository usuarioRepository;

    @Autowired
    private RutaRepository rutaRepository;

    @Autowired
    private AlertaRepository alertaRepository;

    @Autowired
    private ConfiguracionEmailRepository configuracionEmailRepository;

    @Autowired
    private EmailService emailService;

    @Autowired
    private JwtUtil jwtUtil;

    /**
     * Lista los conductores activos de la empresa del administrador autenticado.
     * Solo accesible por rol ADMIN.
     */
    @GetMapping
    public ResponseEntity<?> listarConductores(HttpServletRequest request) {
        String role = (String) request.getAttribute("userRole");
        if (!"ADMIN".equals(role)) {
            return ResponseEntity.status(403).body(Map.of("error", "Solo administradores pueden listar conductores"));
        }

        String empresaId = (String) request.getAttribute("userId");
        List<Conductor> conductores = conductorRepository.findByEmpresaIdAndActivoTrue(empresaId);

        List<Map<String, String>> result = conductores.stream()
                .map(c -> Map.of(
                        "id", c.getId(),
                        "nombre", c.getNombre() != null ? c.getNombre() : "",
                        "email", c.getEmail() != null ? c.getEmail() : ""
                ))
                .collect(Collectors.toList());

        return ResponseEntity.ok(result);
    }

    /**
     * El conductor reporta su ubicación actual (presencia GPS, independiente de rutas).
     * Se llama cada ~30s mientras la app está abierta para que el admin pueda verlo
     * en el mapa aunque no esté en ninguna ruta activa.
     */
    @PostMapping("/me/gps")
    public ResponseEntity<?> actualizarMiUbicacion(
            @RequestBody Map<String, Double> payload,
            HttpServletRequest request) {

        String role = (String) request.getAttribute("userRole");
        String conductorId = (String) request.getAttribute("conductorId");

        if (!"CONDUCTOR".equals(role) || conductorId == null || conductorId.isBlank()) {
            return ResponseEntity.status(403).body(Map.of("error", "Solo conductores"));
        }

        Double lat = payload.get("latitud");
        Double lng = payload.get("longitud");
        if (lat == null || lng == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "latitud y longitud son requeridos"));
        }

        Optional<Conductor> opt = conductorRepository.findById(conductorId);
        if (opt.isEmpty()) {
            return ResponseEntity.status(404).body(Map.of("error", "Conductor no encontrado"));
        }

        Conductor c = opt.get();
        c.setLatitudActual(lat);
        c.setLongitudActual(lng);
        c.setUltimaActualizacionGPS(java.time.Instant.now().toString());
        conductorRepository.save(c);

        return ResponseEntity.ok(Map.of("ok", true));
    }

    /**
     * Devuelve la última ubicación conocida de cada conductor de la empresa.
     * El admin lo usa para mostrar a TODOS los conductores en el mapa, incluso
     * aquellos que no tienen ruta activa en este momento.
     */
    @GetMapping("/locations")
    public ResponseEntity<?> ubicacionesConductores(HttpServletRequest request) {
        String role = (String) request.getAttribute("userRole");
        if (!"ADMIN".equals(role)) {
            return ResponseEntity.status(403).body(Map.of("error", "Solo administradores"));
        }

        String empresaId = (String) request.getAttribute("userId");
        List<Conductor> conductores = conductorRepository.findByEmpresaIdAndActivoTrue(empresaId);

        List<Map<String, Object>> result = conductores.stream()
                .filter(c -> c.getLatitudActual() != null && c.getLongitudActual() != null)
                .map(c -> {
                    Map<String, Object> m = new java.util.HashMap<>();
                    m.put("id", c.getId());
                    m.put("nombre", c.getNombre() != null ? c.getNombre() : "");
                    m.put("email", c.getEmail() != null ? c.getEmail() : "");
                    m.put("latitudActual", c.getLatitudActual());
                    m.put("longitudActual", c.getLongitudActual());
                    m.put("ultimaActualizacionGPS", c.getUltimaActualizacionGPS());
                    return m;
                })
                .collect(Collectors.toList());

        return ResponseEntity.ok(result);
    }

    @PostMapping("/me/support")
    public ResponseEntity<?> solicitarSoporte(
            @RequestBody Map<String, String> payload,
            HttpServletRequest request) {

        String role = (String) request.getAttribute("userRole");
        String conductorId = (String) request.getAttribute("conductorId");
        String empresaId = (String) request.getAttribute("userId");

        if (!"CONDUCTOR".equals(role) || conductorId == null || conductorId.isBlank()) {
            return ResponseEntity.status(403).body(Map.of("error", "Solo conductores"));
        }

        String mensaje = payload.get("mensaje") != null ? payload.get("mensaje").trim() : "";
        if (mensaje.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "El mensaje de soporte es obligatorio"));
        }

        Optional<Conductor> conductorOpt = conductorRepository.findById(conductorId);
        if (conductorOpt.isEmpty()) {
            return ResponseEntity.status(404).body(Map.of("error", "Conductor no encontrado"));
        }

        Conductor conductor = conductorOpt.get();
        String asunto = payload.get("asunto") != null && !payload.get("asunto").trim().isBlank()
                ? payload.get("asunto").trim()
                : "Solicitud de soporte del conductor";

        String rutaId = trimToNull(payload.get("rutaId"));
        Ruta ruta = null;
        if (rutaId != null) {
            Optional<Ruta> rutaOpt = rutaRepository.findById(rutaId);
            if (rutaOpt.isEmpty()) {
                return ResponseEntity.badRequest().body(Map.of("error", "La ruta indicada no existe"));
            }
            Ruta rutaEncontrada = rutaOpt.get();
            if (!empresaId.equals(rutaEncontrada.getUsuarioId()) || !conductorId.equals(rutaEncontrada.getConductorId())) {
                return ResponseEntity.badRequest().body(Map.of("error", "La ruta indicada no pertenece a este conductor"));
            }
            ruta = rutaEncontrada;
        }

        String nombreConductor = conductor.getNombre() != null && !conductor.getNombre().isBlank()
                ? conductor.getNombre()
                : (conductor.getEmail() != null ? conductor.getEmail() : "Conductor");
        String contextoRuta = ruta != null
                ? String.format("Ruta #%s - %s -> %s",
                    ruta.getId() != null && ruta.getId().length() >= 6 ? ruta.getId().substring(ruta.getId().length() - 6).toUpperCase() : "SIN ID",
                    ruta.getOrigen() != null ? ruta.getOrigen() : "Origen no disponible",
                    ruta.getDestino() != null ? ruta.getDestino() : "Destino no disponible")
                : "Sin ruta asociada";

        Alerta alerta = new Alerta();
        alerta.setEmpresaId(empresaId);
        alerta.setTipo("SOPORTE_CONDUCTOR");
        alerta.setSeveridad("WARNING");
        alerta.setTitulo("Soporte solicitado por " + nombreConductor);
        alerta.setDescripcion(contextoRuta + " - " + resumir(mensaje, 220));
        alerta.setRutaId(ruta != null ? ruta.getId() : null);
        alerta.setGrupoKey("SOPORTE_CONDUCTOR|" + conductorId + "|" + System.currentTimeMillis());
        alerta.setTimestamp(LocalDateTime.now());
        alerta.setLeida(false);
        alerta.setResuelta(false);
        alertaRepository.save(alerta);

        boolean emailEnviado = false;
        String destinoEmail = resolverDestinoSoporte(empresaId);
        if (!destinoEmail.isBlank() && emailService.isConfigured()) {
            try {
                emailService.enviar(destinoEmail, asunto, buildSupportEmailHtml(conductor, ruta, mensaje));
                emailEnviado = true;
            } catch (Exception e) {
                System.err.println("[ConductorController] Error enviando soporte por email: " + e.getMessage());
            }
        }

        return ResponseEntity.ok(Map.of(
                "ok", true,
                "emailEnviado", emailEnviado,
                "canal", emailEnviado ? "panel_y_email" : "panel"
        ));
    }

    /**
     * Permite a un conductor asociarse a una empresa distinta.
     * Devuelve un nuevo JWT con el empresaId actualizado.
     */
    @PutMapping("/{id}/empresa")
    public ResponseEntity<?> cambiarEmpresa(
            @PathVariable String id,
            @RequestBody Map<String, String> payload,
            HttpServletRequest request) {

        String role = (String) request.getAttribute("userRole");
        if (!"CONDUCTOR".equals(role)) {
            return ResponseEntity.status(403).body(Map.of("error", "Solo conductores pueden usar este endpoint"));
        }

        String conductorIdFromJwt = (String) request.getAttribute("conductorId");
        if (!id.equals(conductorIdFromJwt)) {
            return ResponseEntity.status(403).body(Map.of("error", "No podés modificar la cuenta de otro conductor"));
        }

        String empresaEmail = payload.get("empresaEmail");
        if (empresaEmail == null || empresaEmail.trim().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "El email de la empresa es obligatorio"));
        }

        Optional<Conductor> conductorOpt = conductorRepository.findById(id);
        if (conductorOpt.isEmpty()) {
            return ResponseEntity.status(404).body(Map.of("error", "Conductor no encontrado"));
        }

        Optional<Usuario> adminOpt = usuarioRepository.findByEmail(empresaEmail.trim().toLowerCase());
        if (adminOpt.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "No existe ninguna empresa con ese email"));
        }

        Conductor conductor = conductorOpt.get();
        Usuario admin = adminOpt.get();
        conductor.setEmpresaId(admin.getId());
        conductor.setNombreEmpresa(admin.getNombreEmpresa());
        conductorRepository.save(conductor);

        String newToken = jwtUtil.generateToken(admin.getId(), "CONDUCTOR", conductor.getId());

        return ResponseEntity.ok(Map.of(
            "token", newToken,
            "empresaId", admin.getId(),
            "nombreEmpresa", admin.getNombreEmpresa() != null ? admin.getNombreEmpresa() : ""
        ));
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private String resumir(String mensaje, int maxLen) {
        String limpio = mensaje == null ? "" : mensaje.replaceAll("\\s+", " ").trim();
        if (limpio.length() <= maxLen) {
            return limpio;
        }
        return limpio.substring(0, Math.max(0, maxLen - 1)) + "...";
    }

    private String resolverDestinoSoporte(String empresaId) {
        Optional<ConfiguracionEmail> cfg = configuracionEmailRepository.findByEmpresaId(empresaId);
        if (cfg.isPresent()) {
            String emailNotificaciones = cfg.get().getEmailNotificaciones();
            if (emailNotificaciones != null && !emailNotificaciones.isBlank()) {
                return emailNotificaciones;
            }
        }
        return usuarioRepository.findById(empresaId)
                .map(Usuario::getEmail)
                .orElse("");
    }

    private String buildSupportEmailHtml(Conductor conductor, Ruta ruta, String mensaje) {
        String rutaTexto = ruta != null
                ? (ruta.getOrigen() != null ? ruta.getOrigen() : "Origen") + " -> " + (ruta.getDestino() != null ? ruta.getDestino() : "Destino")
                : "Sin ruta asociada";
        String rutaId = ruta != null && ruta.getId() != null ? ruta.getId() : "-";
        String empresa = conductor.getNombreEmpresa() != null && !conductor.getNombreEmpresa().isBlank()
                ? conductor.getNombreEmpresa()
                : "Sin empresa";

        return "<body style='margin:0;padding:0;background:#080c14;font-family:Segoe UI,Roboto,Arial,sans-serif;'>"
                + "<table width='100%' cellpadding='0' cellspacing='0' style='background:#080c14;'><tr><td align='center'>"
                + "<table width='560' cellpadding='0' cellspacing='0' style='max-width:560px;width:100%;'>"
                + "<tr><td style='background:linear-gradient(135deg,#0f1923,#0d1117);padding:32px;border-bottom:2px solid #3bf63b;'>"
                + "<div style='color:#3bf63b;font-size:24px;font-weight:800;letter-spacing:2px;'>./CarCare</div>"
                + "<div style='color:#ffffff;font-size:18px;font-weight:700;margin-top:10px;'>Nueva solicitud de soporte</div>"
                + "</td></tr>"
                + "<tr><td style='background:#0d1117;padding:28px;'>"
                + "<div style='background:#111827;border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:20px;color:#e5e7eb;'>"
                + "<p style='margin:0 0 12px;font-size:14px;'><strong>Conductor:</strong> " + escapeHtml(conductor.getNombre()) + "</p>"
                + "<p style='margin:0 0 12px;font-size:14px;'><strong>Email:</strong> " + escapeHtml(conductor.getEmail()) + "</p>"
                + "<p style='margin:0 0 12px;font-size:14px;'><strong>Empresa:</strong> " + escapeHtml(empresa) + "</p>"
                + "<p style='margin:0 0 12px;font-size:14px;'><strong>Ruta:</strong> " + escapeHtml(rutaTexto) + "</p>"
                + "<p style='margin:0 0 18px;font-size:14px;'><strong>Ruta ID:</strong> " + escapeHtml(rutaId) + "</p>"
                + "<div style='background:#050608;border:1px solid rgba(59,246,59,0.18);border-radius:12px;padding:16px;'>"
                + "<div style='font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;'>Mensaje</div>"
                + "<div style='font-size:14px;line-height:1.65;color:#f3f4f6;white-space:pre-wrap;">" + escapeHtml(mensaje) + "</div>"
                + "</div>"
                + "</div>"
                + "</td></tr>"
                + "</table></td></tr></table></body>";
    }

    private String escapeHtml(String value) {
        if (value == null) {
            return "-";
        }
        return value
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
    }
}
