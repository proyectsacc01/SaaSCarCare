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

    @GetMapping("/{rutaId}")
    public List<Mensaje> obtenerMensajes(@PathVariable String rutaId) {
        return mensajeRepository.findByRutaIdOrderByTimestampAsc(rutaId);
    }

    @PostMapping
    public Mensaje enviarMensaje(@RequestBody Mensaje mensaje, HttpServletRequest request) {
        String usuarioId = (String) request.getAttribute("userId");
        if (usuarioId != null) {
            mensaje.setUsuarioId(usuarioId);
        }

        Mensaje guardado = mensajeRepository.save(mensaje);

        // Si el remitente es un CONDUCTOR, generamos una alerta para que el admin
        // vea en la campanita que tiene mensajes nuevos. Reutilizamos una sola
        // alerta por (ruta, conductor) hasta que el admin la marque como leída,
        // así no se inunda el panel con 50 entradas de la misma conversación.
        try {
            if ("CONDUCTOR".equalsIgnoreCase(guardado.getRemitente())
                    && guardado.getRutaId() != null
                    && usuarioId != null) {

                String conductorId = (String) request.getAttribute("conductorId");
                String conductorNombre = "Conductor";
                if (conductorId != null) {
                    Optional<Conductor> c = conductorRepository.findById(conductorId);
                    if (c.isPresent() && c.get().getNombre() != null) {
                        conductorNombre = c.get().getNombre();
                    }
                }

                String rutaInfo = "";
                Optional<Ruta> r = rutaRepository.findById(guardado.getRutaId());
                if (r.isPresent()) {
                    Ruta ru = r.get();
                    rutaInfo = (ru.getOrigen() != null ? ru.getOrigen() : "") + " → "
                             + (ru.getDestino() != null ? ru.getDestino() : "");
                }

                String grupoKey = "MENSAJE_CONDUCTOR|" + guardado.getRutaId()
                        + "|" + (conductorId != null ? conductorId : "");

                Optional<Alerta> existente =
                        alertaRepository.findByGrupoKeyAndResueltaFalse(grupoKey);

                String preview = guardado.getContenido() != null && !guardado.getContenido().isBlank()
                        ? guardado.getContenido()
                        : (guardado.getMediaType() != null && guardado.getMediaType().startsWith("image/")
                                ? "[Foto adjunta]"
                                : "[Adjunto]");
                if (preview.length() > 80) preview = preview.substring(0, 77) + "…";

                Alerta a = existente.orElseGet(Alerta::new);
                a.setEmpresaId(usuarioId);
                a.setTipo("MENSAJE_CONDUCTOR");
                a.setSeveridad("INFO");
                a.setTitulo("Mensaje de " + conductorNombre);
                a.setDescripcion(rutaInfo.isEmpty() ? preview : rutaInfo + " — " + preview);
                a.setRutaId(guardado.getRutaId());
                a.setGrupoKey(grupoKey);
                a.setTimestamp(LocalDateTime.now());
                // Si ya existía y estaba leída, la marcamos no leída de nuevo
                // porque hay un mensaje nuevo encima.
                a.setLeida(false);
                a.setResuelta(false);
                alertaRepository.save(a);
            }
        } catch (Exception e) {
            // No bloquear el envío del mensaje por un fallo de alerta
            System.err.println("[MensajeController] Error generando alerta de mensaje: " + e.getMessage());
        }

        return guardado;
    }
}
