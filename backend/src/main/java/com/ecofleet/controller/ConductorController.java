package com.ecofleet.controller;

import com.ecofleet.model.AiChatMessage;
import com.ecofleet.model.Alerta;
import com.ecofleet.model.Conductor;
import com.ecofleet.model.ConfiguracionEmail;
import com.ecofleet.model.Ruta;
import com.ecofleet.model.Usuario;
import com.ecofleet.repository.AiChatMessageRepository;
import com.ecofleet.repository.AlertaRepository;
import com.ecofleet.repository.ConfiguracionEmailRepository;
import com.ecofleet.repository.ConductorRepository;
import com.ecofleet.repository.RutaRepository;
import com.ecofleet.repository.UsuarioRepository;
import com.ecofleet.security.JwtUtil;
import com.ecofleet.service.EmailService;
import com.ecofleet.service.GroqChatService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.ArrayList;
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
    private AiChatMessageRepository aiChatMessageRepository;

    @Autowired
    private EmailService emailService;

    @Autowired
    private GroqChatService groqChatService;

    @Autowired
    private JwtUtil jwtUtil;

    private final BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    private static final java.util.regex.Pattern EMAIL_PATTERN =
            java.util.regex.Pattern.compile("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$");

    /**
     * El conductor edita sus propios datos de perfil: nombre, email, teléfono
     * y opcionalmente contraseña. Solo puede modificarse a sí mismo (lo
     * identifica el conductorId del JWT).
     *
     * Si cambia el email, se reemite el JWT (mismo flujo que cambiarEmpresa)
     * porque el token va vinculado a la identidad del conductor y conviene
     * que el frontend lo refresque.
     *
     * Para cambiar la contraseña se exige la actual — no alcanza con tener un
     * JWT válido, porque un token robado no debería poder cambiar la clave.
     */
    @PutMapping("/me/profile")
    public ResponseEntity<?> editarMiPerfil(
            @RequestBody Map<String, String> payload,
            HttpServletRequest request) {

        String role = (String) request.getAttribute("userRole");
        String conductorId = trimToNull((String) request.getAttribute("conductorId"));

        if (!"CONDUCTOR".equals(role) || conductorId == null) {
            return ResponseEntity.status(403).body(Map.of("error", "Solo conductores pueden usar este endpoint"));
        }

        Optional<Conductor> opt = conductorRepository.findById(conductorId);
        if (opt.isEmpty()) {
            return ResponseEntity.status(404).body(Map.of("error", "Conductor no encontrado"));
        }
        Conductor conductor = opt.get();

        String nuevoNombre = trimToNull(payload.get("nombre"));
        String nuevoEmailRaw = trimToNull(payload.get("email"));
        String nuevoTelefono = payload.get("telefono"); // permito blank para borrar
        String currentPassword = payload.get("currentPassword");
        String newPassword = payload.get("newPassword");

        boolean emailCambio = false;
        String nuevoEmail = null;

        if (nuevoEmailRaw != null) {
            nuevoEmail = nuevoEmailRaw.toLowerCase();
            if (!EMAIL_PATTERN.matcher(nuevoEmail).matches()) {
                return ResponseEntity.badRequest().body(Map.of("error", "El email no tiene un formato válido"));
            }
            String emailActual = conductor.getEmail() != null ? conductor.getEmail().toLowerCase() : "";
            if (!nuevoEmail.equals(emailActual)) {
                Optional<Conductor> duplicado = conductorRepository.findByEmail(nuevoEmail);
                if (duplicado.isPresent() && !duplicado.get().getId().equals(conductor.getId())) {
                    return ResponseEntity.status(409).body(Map.of("error", "Ya existe un conductor con ese email"));
                }
                emailCambio = true;
            }
        }

        if (newPassword != null && !newPassword.isBlank()) {
            if (newPassword.length() < 6) {
                return ResponseEntity.badRequest().body(Map.of("error", "La nueva contraseña debe tener al menos 6 caracteres"));
            }
            // Solo exigimos la contraseña actual si el conductor YA tenía una
            // password elegida por él. Los usuarios que entraron por Google
            // tienen un UUID autogenerado en la base que nunca conocieron, así
            // que la primera vez pueden setear una sin pedirles nada.
            //
            // Para conductores legacy (registrados antes de existir el flag,
            // `tienePasswordPropia == null`) caemos a una heurística segura
            // basada en `googleId`:
            //   - googleId != null → entró por Google → no exigir actual.
            //   - googleId == null → se registró con email/password → exigirla.
            boolean tienePropia = resolverTienePasswordPropia(conductor);
            if (tienePropia) {
                if (currentPassword == null || currentPassword.isBlank()) {
                    return ResponseEntity.badRequest().body(Map.of("error", "Para cambiar la contraseña hay que ingresar la actual"));
                }
                if (conductor.getPassword() == null || !passwordEncoder.matches(currentPassword, conductor.getPassword())) {
                    return ResponseEntity.status(401).body(Map.of("error", "La contraseña actual es incorrecta"));
                }
            }
            conductor.setPassword(passwordEncoder.encode(newPassword));
            conductor.setTienePasswordPropia(true);
        }

        if (nuevoNombre != null) {
            conductor.setNombre(nuevoNombre);
        }
        if (emailCambio) {
            conductor.setEmail(nuevoEmail);
        }
        if (nuevoTelefono != null) {
            conductor.setTelefono(nuevoTelefono.trim());
        }

        conductorRepository.save(conductor);

        Map<String, Object> response = new java.util.HashMap<>();
        response.put("id", conductor.getId());
        response.put("nombre", conductor.getNombre() != null ? conductor.getNombre() : "");
        response.put("email", conductor.getEmail() != null ? conductor.getEmail() : "");
        response.put("telefono", conductor.getTelefono() != null ? conductor.getTelefono() : "");
        response.put("role", "CONDUCTOR");
        response.put("empresaId", conductor.getEmpresaId());
        response.put("nombreEmpresa", conductor.getNombreEmpresa() != null ? conductor.getNombreEmpresa() : "");
        response.put("tienePasswordPropia", resolverTienePasswordPropia(conductor));

        if (emailCambio) {
            response.put("token", jwtUtil.generateToken(conductor.getEmpresaId(), "CONDUCTOR", conductor.getId()));
        }

        return ResponseEntity.ok(response);
    }

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

        Map<String, String> rutasActivasPorConductor = rutaRepository.findByUsuarioId(empresaId).stream()
                .filter(ruta -> {
                    String estado = normalizarEstadoRuta(ruta.getEstado());
                    return "EN_CURSO".equals(estado) || "DETENIDO".equals(estado);
                })
                .filter(ruta -> trimToNull(ruta.getConductorId()) != null)
                .collect(Collectors.toMap(
                        ruta -> trimToNull(ruta.getConductorId()),
                        Ruta::getId,
                        (actual, ignorada) -> actual
                ));

        List<Map<String, Object>> result = conductores.stream()
                .map(c -> {
                    Map<String, Object> item = new java.util.HashMap<>();
                    item.put("id", c.getId());
                    item.put("nombre", c.getNombre() != null ? c.getNombre() : "");
                    item.put("email", c.getEmail() != null ? c.getEmail() : "");
                    item.put("disponible", !rutasActivasPorConductor.containsKey(c.getId()));
                    item.put("rutaActivaId", rutasActivasPorConductor.get(c.getId()));
                    return item;
                })
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

    @GetMapping("/me/chat-ai")
    public ResponseEntity<?> obtenerHistorialAi(
            @RequestParam(required = false) String conductorId,
            @RequestParam(required = false) String conductorEmail,
            @RequestParam(required = false) String rutaId,
            HttpServletRequest request) {
        String empresaId = trimToNull((String) request.getAttribute("userId"));

        if (empresaId == null) {
            return ResponseEntity.status(401).body(Map.of("error", "Token de autenticación requerido"));
        }

        Optional<Conductor> conductorOpt = resolverConductorDesdeRequest(request, empresaId, conductorId, conductorEmail);
        if (conductorOpt.isEmpty()) {
            conductorOpt = resolverConductorDesdeRuta(empresaId, sanitizeOptionalRouteId(rutaId));
        }
        if (conductorOpt.isEmpty()) {
            return ResponseEntity.status(403).body(Map.of("error", "No se pudo identificar al conductor"));
        }

        String resolvedConductorId = trimToNull(conductorOpt.get().getId());
        if (resolvedConductorId == null) {
            return ResponseEntity.status(403).body(Map.of("error", "Conductor sin identificador válido"));
        }

        return ResponseEntity.ok(
                aiChatMessageRepository.findByEmpresaIdAndConductorIdOrderByTimestampAsc(empresaId, resolvedConductorId)
        );
    }

    @PostMapping("/me/chat-ai")
    public ResponseEntity<?> enviarMensajeAi(@RequestBody Map<String, String> payload, HttpServletRequest request) {
        String empresaId = trimToNull((String) request.getAttribute("userId"));

        if (empresaId == null) {
            return ResponseEntity.status(401).body(Map.of("error", "Token de autenticación requerido"));
        }

        if (!groqChatService.isConfigured()) {
            return ResponseEntity.status(503).body(Map.of("error", "La IA no está configurada todavía"));
        }

        String mensaje = trimToNull(payload.get("mensaje"));
        if (mensaje == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "El mensaje es obligatorio"));
        }

        String payloadConductorId = trimToNull(payload.get("conductorId"));
        String payloadConductorEmail = trimToNull(payload.get("conductorEmail"));

        Optional<Conductor> conductorOpt = resolverConductorDesdeRequest(request, empresaId, payloadConductorId, payloadConductorEmail);
        if (conductorOpt.isEmpty()) {
            conductorOpt = resolverConductorDesdeRuta(empresaId, sanitizeOptionalRouteId(payload.get("rutaId")));
        }
        if (conductorOpt.isEmpty()) {
            return ResponseEntity.status(404).body(Map.of("error", "Conductor no encontrado"));
        }

        String conductorId = trimToNull(conductorOpt.get().getId());
        if (conductorId == null) {
            return ResponseEntity.status(403).body(Map.of("error", "Conductor sin identificador válido"));
        }

        String rutaId = sanitizeOptionalRouteId(payload.get("rutaId"));

        AiChatMessage userMsg = new AiChatMessage();
        userMsg.setEmpresaId(empresaId);
        userMsg.setConductorId(conductorId);
        userMsg.setRutaId(rutaId);
        userMsg.setRemitente("CONDUCTOR");
        userMsg.setContenido(mensaje);
        aiChatMessageRepository.save(userMsg);

        List<AiChatMessage> historialGuardado = aiChatMessageRepository
                .findByEmpresaIdAndConductorIdOrderByTimestampAsc(empresaId, conductorId);
        List<String> historialGroq = new ArrayList<>();
        int max = Math.max(0, historialGuardado.size() - 1);
        for (int i = 0; i < max; i++) {
            AiChatMessage item = historialGuardado.get(i);
            String roleForGroq = "AI".equalsIgnoreCase(item.getRemitente()) ? "assistant" : "user";
            historialGroq.add(roleForGroq + "::" + item.getContenido());
        }

        GroqChatService.GroqAiResult aiResult;
        try {
            aiResult = groqChatService.responder(historialGroq, mensaje);
        } catch (IllegalStateException ex) {
            return ResponseEntity.status(502).body(Map.of(
                    "error", "No se pudo consultar la IA",
                    "detail", ex.getMessage()
            ));
        }

        AiChatMessage aiMsg = new AiChatMessage();
        aiMsg.setEmpresaId(empresaId);
        aiMsg.setConductorId(conductorId);
        aiMsg.setRutaId(rutaId);
        aiMsg.setRemitente("AI");
        aiMsg.setContenido(aiResult.answer());
        aiMsg.setEscaladoACentral(aiResult.escalateToCentral());
        aiMsg.setSeveridadEscalada(aiResult.severity());
        aiChatMessageRepository.save(aiMsg);

        boolean escalado = false;
        if (aiResult.escalateToCentral()) {
            escalado = crearEscaladaAi(empresaId, conductorOpt.get(), rutaId, mensaje, aiResult.reason(), aiResult.severity());
        }

        return ResponseEntity.ok(Map.of(
                "message", aiMsg,
                "escalatedToCentral", escalado,
                "severity", aiResult.severity(),
                "reason", aiResult.reason()
        ));
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
                    // Flag para que el frontend del admin diferencie conductores
                    // que apagaron tracking conscientemente vs los que están
                    // activos pero con GPS rancio.
                    m.put("compartiendoUbicacion",
                            c.getCompartiendoUbicacion() == null
                                    ? Boolean.TRUE
                                    : c.getCompartiendoUbicacion());
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
        String empresaId = (String) request.getAttribute("userId");

        if (!"CONDUCTOR".equals(role) || empresaId == null || empresaId.isBlank()) {
            return ResponseEntity.status(403).body(Map.of("error", "Solo conductores"));
        }

        String mensaje = payload.get("mensaje") != null ? payload.get("mensaje").trim() : "";
        if (mensaje.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "El mensaje de soporte es obligatorio"));
        }

        String payloadConductorId = trimToNull(payload.get("conductorId"));
        String payloadConductorEmail = trimToNull(payload.get("conductorEmail"));
        String payloadConductorNombre = trimToNull(payload.get("conductorNombre"));

        Optional<Conductor> conductorOpt = resolverConductorDesdeRequest(request, empresaId, payloadConductorId, payloadConductorEmail);
        Conductor conductor = conductorOpt.orElseGet(() -> construirConductorFallback(empresaId, payloadConductorId, payloadConductorEmail, payloadConductorNombre));
        String conductorId = trimToNull(conductor.getId()) != null
                ? conductor.getId()
                : (payloadConductorEmail != null ? payloadConductorEmail : "conductor_sin_id");
        String asunto = payload.get("asunto") != null && !payload.get("asunto").trim().isBlank()
                ? payload.get("asunto").trim()
                : "Solicitud de soporte del conductor";

        String rutaId = trimToNull(payload.get("rutaId"));
        Ruta ruta = null;
        boolean rutaIgnorada = false;
        if (rutaId != null) {
            Optional<Ruta> rutaOpt = rutaRepository.findById(rutaId);
            if (rutaOpt.isPresent()) {
                Ruta rutaEncontrada = rutaOpt.get();
                boolean mismaEmpresa = empresaId.equals(rutaEncontrada.getUsuarioId());
                boolean mismoConductor = conductor.getId() == null || conductor.getId().isBlank() || conductorId.equals(rutaEncontrada.getConductorId());
                if (mismaEmpresa && mismoConductor) {
                    ruta = rutaEncontrada;
                } else {
                    rutaIgnorada = true;
                }
            } else {
                rutaIgnorada = true;
            }
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
        alerta.setVehiculoId(ruta != null ? ruta.getVehiculoId() : null);
        alerta.setGrupoKey("SOPORTE_CONDUCTOR|" + conductorId + "|" + System.currentTimeMillis());
        alerta.setTimestamp(LocalDateTime.now());
        alerta.setLeida(false);
        alerta.setResuelta(false);
        alertaRepository.save(alerta);

        boolean emailEnviado = false;
        String emailError = "";
        String destinoEmail = resolverDestinoSoporte(empresaId);
        if (destinoEmail.isBlank()) {
            emailError = "No hay un correo de destino configurado para notificaciones";
        } else if (!emailService.isConfigured()) {
            emailError = "El servicio de correo no está configurado en el servidor";
        } else {
            try {
                emailService.enviar(destinoEmail, asunto, buildSupportEmailHtml(conductor, ruta, mensaje));
                emailEnviado = true;
            } catch (Exception e) {
                emailError = e.getMessage() != null ? e.getMessage() : "No se pudo enviar el correo";
                System.err.println("[ConductorController] Error enviando soporte por email: " + e.getMessage());
            }
        }

        return ResponseEntity.ok(Map.of(
                "ok", true,
                "alertaId", alerta.getId(),
                "emailEnviado", emailEnviado,
                "emailDestino", destinoEmail,
                "emailError", emailError,
                "rutaIgnorada", rutaIgnorada,
                "canal", emailEnviado ? "panel_y_email" : "panel"
        ));
    }

    /**
     * Emergencia SOS — el conductor pulsa el botón rojo y el admin recibe una
     * alerta CRITICAL con su última ubicación conocida.
     */
    @PostMapping("/me/sos")
    public ResponseEntity<?> activarSOS(
            @RequestBody(required = false) Map<String, Object> payload,
            HttpServletRequest request) {

        String role = (String) request.getAttribute("userRole");
        String empresaId = (String) request.getAttribute("userId");

        if (!"CONDUCTOR".equals(role) || empresaId == null || empresaId.isBlank()) {
            return ResponseEntity.status(403).body(Map.of("error", "Solo conductores"));
        }

        String payloadConductorId = payload != null ? trimToNull(asString(payload.get("conductorId"))) : null;
        String payloadConductorEmail = payload != null ? trimToNull(asString(payload.get("conductorEmail"))) : null;
        String payloadConductorNombre = payload != null ? trimToNull(asString(payload.get("conductorNombre"))) : null;

        Optional<Conductor> conductorOpt = resolverConductorDesdeRequest(request, empresaId, payloadConductorId, payloadConductorEmail);
        Conductor conductor = conductorOpt.orElseGet(() -> construirConductorFallback(empresaId, payloadConductorId, payloadConductorEmail, payloadConductorNombre));
        String conductorId = trimToNull(conductor.getId()) != null
                ? conductor.getId()
                : (payloadConductorEmail != null ? payloadConductorEmail : "conductor_sin_id");

        // Si llega lat/lng en el payload, los persistimos antes de crear la alerta
        // — así el admin ve la ubicación EXACTA al momento del SOS.
        if (payload != null) {
            Object lat = payload.get("latitud");
            Object lng = payload.get("longitud");
            if (lat instanceof Number && lng instanceof Number) {
                conductor.setLatitudActual(((Number) lat).doubleValue());
                conductor.setLongitudActual(((Number) lng).doubleValue());
                conductor.setUltimaActualizacionGPS(java.time.Instant.now().toString());
                if (conductorOpt.isPresent()) {
                    conductorRepository.save(conductor);
                }
            }
        }

        // Buscar la ruta activa del conductor (si tiene una en curso, la asociamos)
        String rutaId = null;
        Ruta rutaActiva = null;
        try {
            List<Ruta> rutas = rutaRepository.findByUsuarioIdAndConductorId(empresaId, conductorId);
            for (Ruta r : rutas) {
                boolean esActiva = "EN_CURSO".equalsIgnoreCase(r.getEstado()) || "DETENIDO".equalsIgnoreCase(r.getEstado());
                boolean mismoConductor = conductor.getId() == null || conductor.getId().isBlank() || conductorId.equals(r.getConductorId());
                if (esActiva && mismoConductor) {
                    rutaId = r.getId();
                    rutaActiva = r;
                    break;
                }
            }
        } catch (Exception e) {
            // continúa sin rutaId
        }

        String nombre = conductor.getNombre() != null && !conductor.getNombre().isBlank()
                ? conductor.getNombre()
                : (conductor.getEmail() != null ? conductor.getEmail() : "Conductor");

        String ubicacionTxt = (conductor.getLatitudActual() != null && conductor.getLongitudActual() != null)
                ? String.format("Última posición: %.5f, %.5f", conductor.getLatitudActual(), conductor.getLongitudActual())
                : "Posición desconocida";

        Alerta alerta = new Alerta();
        alerta.setEmpresaId(empresaId);
        alerta.setTipo("EMERGENCIA_SOS");
        alerta.setSeveridad("CRITICAL");
        alerta.setTitulo("🆘 Emergencia SOS — " + nombre);
        alerta.setDescripcion("El conductor activó la emergencia. "
                + (rutaActiva != null ? String.format("Ruta: %s -> %s. ",
                    rutaActiva.getOrigen() != null ? rutaActiva.getOrigen() : "Origen no disponible",
                    rutaActiva.getDestino() != null ? rutaActiva.getDestino() : "Destino no disponible") : "")
                + ubicacionTxt);
        alerta.setRutaId(rutaId);
        alerta.setVehiculoId(rutaActiva != null ? rutaActiva.getVehiculoId() : null);
        // Cada SOS es un evento ÚNICO — usamos timestamp en el grupoKey para no
        // deduplicarlo nunca. El admin tiene que ver cada SOS individual.
        alerta.setGrupoKey("EMERGENCIA_SOS|" + conductorId + "|" + System.currentTimeMillis());
        alerta.setTimestamp(LocalDateTime.now());
        alerta.setLeida(false);
        alerta.setResuelta(false);
        alertaRepository.save(alerta);

        // Email también si está configurado — el SOS es crítico
        String destinoEmail = resolverDestinoSoporte(empresaId);
        boolean emailEnviado = false;
        String emailError = "";
        if (destinoEmail.isBlank()) {
            emailError = "No hay un correo de destino configurado para notificaciones";
        } else if (!emailService.isConfigured()) {
            emailError = "El servicio de correo no está configurado en el servidor";
        } else {
            try {
                emailService.enviar(destinoEmail,
                        "🆘 EMERGENCIA SOS — " + nombre,
                        buildSosEmailHtml(conductor, ubicacionTxt));
                emailEnviado = true;
            } catch (Exception e) {
                emailError = e.getMessage() != null ? e.getMessage() : "No se pudo enviar el correo";
                System.err.println("[ConductorController] Error enviando SOS por email: " + e.getMessage());
            }
        }

        return ResponseEntity.ok(Map.of(
                "ok", true,
                "alertaId", alerta.getId(),
                "rutaId", rutaId != null ? rutaId : "",
                "emailEnviado", emailEnviado,
                "emailDestino", destinoEmail,
                "emailError", emailError
        ));
    }

    /**
     * Marca al conductor como ACTIVO o INACTIVO en cuanto a compartir ubicación.
     * Cuando se setea inactivo, el admin lo verá como "Sin compartir GPS" en el
     * mapa aunque tenga última ubicación conocida.
     */
    @PostMapping("/me/online")
    public ResponseEntity<?> setOnline(
            @RequestBody Map<String, Object> payload,
            HttpServletRequest request) {

        String role = (String) request.getAttribute("userRole");
        String conductorId = (String) request.getAttribute("conductorId");

        if (!"CONDUCTOR".equals(role) || conductorId == null || conductorId.isBlank()) {
            return ResponseEntity.status(403).body(Map.of("error", "Solo conductores"));
        }

        Object activoObj = payload.get("activo");
        boolean activo = activoObj instanceof Boolean ? (Boolean) activoObj : true;

        Optional<Conductor> opt = conductorRepository.findById(conductorId);
        if (opt.isEmpty()) {
            return ResponseEntity.status(404).body(Map.of("error", "Conductor no encontrado"));
        }
        Conductor c = opt.get();
        c.setCompartiendoUbicacion(activo);
        if (!activo) {
            // Limpiamos el timestamp para que el admin vea "GPS desconectado"
            c.setUltimaActualizacionGPS(null);
        }
        conductorRepository.save(c);
        return ResponseEntity.ok(Map.of("ok", true, "activo", activo));
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

    /**
     * Resuelve si un conductor ya tiene una contraseña elegida por él mismo.
     * Para registros nuevos, lee el flag `tienePasswordPropia`. Para registros
     * legacy donde el flag es null, usa `googleId` como fallback:
     *   - googleId != null → vino por Google, password autogenerada.
     *   - googleId == null → registro manual con email/password.
     */
    private boolean resolverTienePasswordPropia(Conductor c) {
        if (c.getTienePasswordPropia() != null) {
            return c.getTienePasswordPropia();
        }
        return trimToNull(c.getGoogleId()) == null;
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private String normalizarEstadoRuta(String estado) {
        String limpio = trimToNull(estado);
        if (limpio == null) {
            return "PLANIFICADA";
        }

        limpio = limpio.toUpperCase().replace(' ', '_');
        return switch (limpio) {
            case "ENCURSO", "EN_CURSO" -> "EN_CURSO";
            case "DETENIDA", "PAUSADA", "PAUSADO", "STOPPED" -> "DETENIDO";
            case "COMPLETADO" -> "COMPLETADA";
            case "PLANEADA" -> "PLANIFICADA";
            default -> limpio;
        };
    }

    private String asString(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    private Optional<Conductor> resolverConductorDesdeRequest(HttpServletRequest request, String empresaId, String payloadConductorId, String payloadConductorEmail) {
        String claimConductorId = trimToNull((String) request.getAttribute("conductorId"));

        if (claimConductorId != null) {
            Optional<Conductor> claimMatch = conductorRepository.findById(claimConductorId)
                    .filter(c -> empresaId.equals(c.getEmpresaId()));
            if (claimMatch.isPresent()) {
                return claimMatch;
            }
        }

        String bodyConductorId = trimToNull(payloadConductorId);
        if (bodyConductorId != null) {
            Optional<Conductor> bodyIdMatch = conductorRepository.findById(bodyConductorId)
                    .filter(c -> empresaId.equals(c.getEmpresaId()));
            if (bodyIdMatch.isPresent()) {
                return bodyIdMatch;
            }
        }

        String bodyConductorEmail = trimToNull(payloadConductorEmail);
        if (bodyConductorEmail != null) {
            return conductorRepository.findByEmail(bodyConductorEmail.trim().toLowerCase())
                    .filter(c -> empresaId.equals(c.getEmpresaId()));
        }

        return Optional.empty();
    }

    private Conductor construirConductorFallback(String empresaId, String payloadConductorId, String payloadConductorEmail, String payloadConductorNombre) {
        Conductor conductor = new Conductor();
        conductor.setId(payloadConductorId);
        conductor.setEmail(payloadConductorEmail != null ? payloadConductorEmail : "");
        conductor.setNombre(payloadConductorNombre != null ? payloadConductorNombre : (payloadConductorEmail != null ? payloadConductorEmail : "Conductor"));
        conductor.setEmpresaId(empresaId);
        conductor.setNombreEmpresa(usuarioRepository.findById(empresaId).map(Usuario::getNombreEmpresa).orElse("Sin empresa"));
        return conductor;
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

    private boolean crearEscaladaAi(String empresaId, Conductor conductor, String rutaId, String mensaje, String reason, String severity) {
        try {
            Optional<Ruta> rutaOpt = rutaId == null
                    ? Optional.empty()
                    : rutaRepository.findById(rutaId).filter(r -> empresaId.equals(r.getUsuarioId()));

            String nombreConductor = conductor.getNombre() != null && !conductor.getNombre().isBlank()
                    ? conductor.getNombre()
                    : (conductor.getEmail() != null ? conductor.getEmail() : "Conductor");
            String resumenRuta = rutaOpt.map(r -> {
                String origen = r.getOrigen() != null ? r.getOrigen() : "Origen";
                String destino = r.getDestino() != null ? r.getDestino() : "Destino";
                return origen + " → " + destino;
            }).orElse("Sin ruta activa");

            String grupoKey = "IA_CONDUCTOR_ESCALADA|" + conductor.getId();
            Optional<Alerta> existente = alertaRepository.findByGrupoKeyAndResueltaFalse(grupoKey);

            Alerta alerta = existente.orElseGet(Alerta::new);
            alerta.setEmpresaId(empresaId);
            alerta.setTipo("IA_CONDUCTOR_ESCALADA");
            alerta.setSeveridad(severity);
            alerta.setTitulo("La IA derivó a " + nombreConductor + " a la central");
            alerta.setDescripcion(resumenRuta + " — " + resumir(mensaje, 180)
                    + (trimToNull(reason) != null ? " — Motivo IA: " + resumir(reason, 80) : ""));
            alerta.setRutaId(rutaOpt.map(Ruta::getId).orElse(null));
            alerta.setGrupoKey(grupoKey);
            alerta.setTimestamp(LocalDateTime.now());
            alerta.setLeida(false);
            alerta.setResuelta(false);
            alertaRepository.save(alerta);
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }

    private String sanitizeOptionalRouteId(String routeId) {
        String clean = trimToNull(routeId);
        if (clean == null || "testing_room".equalsIgnoreCase(clean)) {
            return null;
        }
        return clean;
    }

    private Optional<Conductor> resolverConductorDesdeRuta(String empresaId, String rutaId) {
        if (rutaId == null) {
            return Optional.empty();
        }

        return rutaRepository.findById(rutaId)
                .filter(r -> empresaId.equals(r.getUsuarioId()))
                .map(Ruta::getConductorId)
                .map(this::trimToNull)
                .flatMap(conductorRepository::findById)
                .filter(c -> empresaId.equals(c.getEmpresaId()));
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
                + "<div style='font-size:14px;line-height:1.65;color:#f3f4f6;white-space:pre-wrap;'>" + escapeHtml(mensaje) + "</div>"
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

    private String buildSosEmailHtml(Conductor conductor, String ubicacionTxt) {
        String nombre = conductor.getNombre() != null && !conductor.getNombre().isBlank()
                ? conductor.getNombre()
                : (conductor.getEmail() != null ? conductor.getEmail() : "Conductor");
        String empresa = conductor.getNombreEmpresa() != null && !conductor.getNombreEmpresa().isBlank()
                ? conductor.getNombreEmpresa()
                : "Sin empresa";
        String mapsLink = (conductor.getLatitudActual() != null && conductor.getLongitudActual() != null)
                ? String.format("https://www.google.com/maps?q=%s,%s",
                        conductor.getLatitudActual(), conductor.getLongitudActual())
                : null;

        StringBuilder sb = new StringBuilder();
        sb.append("<body style='margin:0;padding:0;background:#080c14;font-family:Segoe UI,Roboto,Arial,sans-serif;'>");
        sb.append("<table width='100%' cellpadding='0' cellspacing='0' style='background:#080c14;'><tr><td align='center'>");
        sb.append("<table width='560' cellpadding='0' cellspacing='0' style='max-width:560px;width:100%;'>");
        sb.append("<tr><td style='background:linear-gradient(135deg,#7f1d1d,#450a0a);padding:32px;border-bottom:3px solid #ef4444;'>");
        sb.append("<div style='color:#fca5a5;font-size:24px;font-weight:800;letter-spacing:2px;'>🆘 EMERGENCIA</div>");
        sb.append("<div style='color:#ffffff;font-size:18px;font-weight:700;margin-top:10px;'>El conductor ").append(escapeHtml(nombre)).append(" activó SOS</div>");
        sb.append("</td></tr>");
        sb.append("<tr><td style='background:#0d1117;padding:28px;'>");
        sb.append("<div style='background:#1f1115;border:1px solid rgba(239,68,68,0.3);border-radius:14px;padding:20px;color:#e5e7eb;'>");
        sb.append("<p style='margin:0 0 12px;font-size:14px;'><strong>Conductor:</strong> ").append(escapeHtml(nombre)).append("</p>");
        sb.append("<p style='margin:0 0 12px;font-size:14px;'><strong>Email:</strong> ").append(escapeHtml(conductor.getEmail())).append("</p>");
        sb.append("<p style='margin:0 0 12px;font-size:14px;'><strong>Empresa:</strong> ").append(escapeHtml(empresa)).append("</p>");
        sb.append("<p style='margin:0 0 18px;font-size:14px;'><strong>Ubicación:</strong> ").append(escapeHtml(ubicacionTxt)).append("</p>");
        if (mapsLink != null) {
            sb.append("<a href='").append(mapsLink).append("' style='display:inline-block;background:#ef4444;color:#fff;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:800;font-size:14px;'>Abrir en Google Maps</a>");
        }
        sb.append("</div></td></tr></table></td></tr></table></body>");
        return sb.toString();
    }
}
