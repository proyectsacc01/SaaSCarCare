package com.ecofleet.controller;

import com.ecofleet.model.Alerta;
import com.ecofleet.model.Conductor;
import com.ecofleet.model.Mensaje;
import com.ecofleet.model.Ruta;
import com.ecofleet.repository.AlertaRepository;
import com.ecofleet.repository.ConductorRepository;
import com.ecofleet.repository.MensajeRepository;
import com.ecofleet.repository.RutaRepository;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.Collections;
import java.util.List;
import java.util.Optional;

@RestController
@RequestMapping("/api/mensajes")
@CrossOrigin(origins = "*")
public class MensajeController {

    @Autowired
    private MensajeRepository mensajeRepository;

    @Autowired
    private AlertaRepository alertaRepository;

    @Autowired
    private ConductorRepository conductorRepository;

    @Autowired
    private RutaRepository rutaRepository;

    /**
     * GET /api/mensajes/{rutaId}
     *
     * Returns messages for the 1-to-1 conversation between ADMIN and the
     * CURRENTLY ASSIGNED conductor on this route.
     *
     * Security rules:
     * - Tenant isolation: route must belong to the requesting user's company
     * - Conductor isolation: if the caller is a conductor, they must be the
     *   one currently assigned to the route
     * - Messages are scoped by (rutaId + conductorId): when the admin
     *   reassigns a conductor, the chat resets because the conductorId filter
     *   no longer matches old messages.
     */
    @GetMapping("/{rutaId}")
    public Object obtenerMensajes(@PathVariable String rutaId, HttpServletRequest request) {
        String empresaId = (String) request.getAttribute("userId");
        if (empresaId == null) {
            return Collections.emptyList();
        }

        // Tenant isolation: verify this route belongs to the requesting user's company
        Optional<Ruta> rutaOpt = rutaRepository.findById(rutaId);
        if (rutaOpt.isEmpty() || !empresaId.equals(rutaOpt.get().getUsuarioId())) {
            return Collections.emptyList();
        }

        Ruta ruta = rutaOpt.get();
        String conductorIdEnRuta = ruta.getConductorId();

        // If there's no conductor assigned, no conversation exists
        if (conductorIdEnRuta == null || conductorIdEnRuta.isBlank()) {
            return Collections.emptyList();
        }

        // Conductor isolation: if the caller is a conductor, verify they are
        // the one assigned to this route
        String callerConductorId = (String) request.getAttribute("conductorId");
        if (callerConductorId != null && !callerConductorId.equals(conductorIdEnRuta)) {
            return Collections.emptyList();
        }

        // Return only messages for this (ruta, conductor) pair
        return mensajeRepository.findByRutaIdAndConductorIdOrderByTimestampAsc(
                rutaId, conductorIdEnRuta);
    }

    /**
     * POST /api/mensajes
     *
     * Sends a message in the 1-to-1 conversation. The conductorId is
     * automatically set from the route's current assignment — the client
     * does NOT control it.
     */
    @PostMapping
    public Object enviarMensaje(@RequestBody Mensaje mensaje, HttpServletRequest request) {
        String empresaId = (String) request.getAttribute("userId");
        if (empresaId == null) {
            return Collections.singletonMap("error", "No autenticado");
        }

        if (mensaje.getRutaId() == null || mensaje.getRutaId().isBlank()) {
            return Collections.singletonMap("error", "rutaId es requerido");
        }

        // Tenant isolation
        Optional<Ruta> rutaOpt = rutaRepository.findById(mensaje.getRutaId());
        if (rutaOpt.isEmpty() || !empresaId.equals(rutaOpt.get().getUsuarioId())) {
            return Collections.singletonMap("error", "No autorizado para esta ruta");
        }

        Ruta ruta = rutaOpt.get();
        String conductorIdEnRuta = ruta.getConductorId();

        // Must have an assigned conductor to have a conversation
        if (conductorIdEnRuta == null || conductorIdEnRuta.isBlank()) {
            return Collections.singletonMap("error", "No hay conductor asignado a esta ruta");
        }

        // Conductor isolation: if the caller is a conductor, verify they are the assigned one
        String callerConductorId = (String) request.getAttribute("conductorId");
        if (callerConductorId != null && !callerConductorId.equals(conductorIdEnRuta)) {
            return Collections.singletonMap("error", "No eres el conductor asignado a esta ruta");
        }

        // Server-side enforcement: set conductorId from the route, not from the client
        mensaje.setUsuarioId(empresaId);
        mensaje.setConductorId(conductorIdEnRuta);

        Mensaje guardado = mensajeRepository.save(mensaje);

        // Si el remitente es un CONDUCTOR, generamos una alerta para que el admin
        // vea en la campanita que tiene mensajes nuevos.
        try {
            if ("CONDUCTOR".equalsIgnoreCase(guardado.getRemitente())
                    && guardado.getRutaId() != null) {

                String conductorNombre = "Conductor";
                if (callerConductorId != null) {
                    Optional<Conductor> c = conductorRepository.findById(callerConductorId);
                    if (c.isPresent() && c.get().getNombre() != null) {
                        conductorNombre = c.get().getNombre();
                    }
                }

                String rutaInfo = "";
                String origen = ruta.getOrigen() != null ? ruta.getOrigen() : "";
                String destino = ruta.getDestino() != null ? ruta.getDestino() : "";
                if (!origen.isEmpty() || !destino.isEmpty()) {
                    rutaInfo = origen + " → " + destino;
                }

                String grupoKey = "MENSAJE_CONDUCTOR|" + guardado.getRutaId()
                        + "|" + conductorIdEnRuta;

                Optional<Alerta> existente =
                        alertaRepository.findByGrupoKeyAndResueltaFalse(grupoKey);

                String preview = guardado.getContenido() != null && !guardado.getContenido().isBlank()
                        ? guardado.getContenido()
                        : (guardado.getMediaType() != null && guardado.getMediaType().startsWith("image/")
                                ? "[Foto adjunta]"
                                : guardado.getMediaType() != null && guardado.getMediaType().startsWith("audio/")
                                        ? "[Audio]"
                                        : "[Adjunto]");
                if (preview.length() > 80) preview = preview.substring(0, 77) + "…";

                Alerta a = existente.orElseGet(Alerta::new);
                a.setEmpresaId(empresaId);
                a.setTipo("MENSAJE_CONDUCTOR");
                a.setSeveridad("INFO");
                a.setTitulo("Mensaje de " + conductorNombre);
                a.setDescripcion(rutaInfo.isEmpty() ? preview : rutaInfo + " — " + preview);
                a.setRutaId(guardado.getRutaId());
                a.setGrupoKey(grupoKey);
                a.setTimestamp(LocalDateTime.now());
                a.setLeida(false);
                a.setResuelta(false);
                alertaRepository.save(a);
            }
        } catch (Exception e) {
            System.err.println("[MensajeController] Error generando alerta de mensaje: " + e.getMessage());
        }

        return guardado;
    }
}
