package com.ecofleet.controller;

import com.ecofleet.model.Conductor;
import com.ecofleet.model.Ruta;
import com.ecofleet.model.Vehiculo;
import com.ecofleet.repository.ConductorRepository;
import com.ecofleet.repository.RutaRepository;
import com.ecofleet.repository.VehiculoRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.time.Instant;
import java.util.Locale;
import java.util.Objects;

@RestController
@RequestMapping("/api/rutas")
@CrossOrigin(origins = "*")
public class RutaController {

    private static final String OSRM_ROUTE_BASE_URL = "https://router.project-osrm.org/route/v1/driving";
    private static final HttpClient HTTP_CLIENT = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(4))
            .build();
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    @Autowired
    private RutaRepository rutaRepository;

    @Autowired
    private ConductorRepository conductorRepository;

    @Autowired
    private VehiculoRepository vehiculoRepository;

    @GetMapping
    public List<Ruta> listarRutas(HttpServletRequest request) {
        String usuarioId = (String) request.getAttribute("userId");
        String role = (String) request.getAttribute("userRole");
        String conductorId = (String) request.getAttribute("conductorId");

        if ("CONDUCTOR".equals(role) && conductorId != null && !conductorId.isBlank()) {
            return rutaRepository.findByUsuarioIdAndConductorId(usuarioId, conductorId).stream()
                    .map(this::normalizarEstadoRuta)
                    .toList();
        }

        return rutaRepository.findByUsuarioId(usuarioId).stream()
                .map(this::normalizarEstadoRuta)
                .toList();
    }

    /**
     * Endpoint exclusivo del panel del conductor. SIEMPRE filtra por
     * conductorId del JWT, sin importar el role. Si el caller no es
     * un conductor identificado (sin claim conductorId) devuelve 403.
     *
     * Defensa contra el bug donde un ADMIN entra a /conductor con su
     * propio token y termina viendo TODAS las rutas de la empresa.
     * El frontend `/conductor/page.tsx` consume ESTE endpoint, nunca
     * `GET /api/rutas` (que sigue existiendo para el dashboard del admin).
     */
    @GetMapping("/me")
    public List<Ruta> listarMisRutas(HttpServletRequest request) {
        String usuarioId = (String) request.getAttribute("userId");
        String role = (String) request.getAttribute("userRole");
        String conductorId = (String) request.getAttribute("conductorId");

        if (!"CONDUCTOR".equals(role) || conductorId == null || conductorId.isBlank()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Solo conductores pueden acceder a /api/rutas/me");
        }
        return rutaRepository.findByUsuarioIdAndConductorId(usuarioId, conductorId).stream()
                .map(this::normalizarEstadoRuta)
                .toList();
    }

    @PostMapping
    public Ruta crearRuta(@RequestBody Ruta ruta, HttpServletRequest request) {
        String usuarioId = (String) request.getAttribute("userId");
        String role = (String) request.getAttribute("userRole");
        if ("CONDUCTOR".equals(role)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Los conductores no pueden crear rutas");
        }
        ruta.setUsuarioId(usuarioId);
        if (ruta.getEstado() == null) {
            ruta.setEstado("PLANIFICADA");
        } else {
            ruta.setEstado(normalizarEstado(ruta.getEstado()));
        }
        // Defensa: latitudActual/longitudActual SOLO los puede setear el endpoint
        // /{id}/gps cuando el dispositivo emite GPS real. Ignoramos lo que venga
        // del body para evitar que el truck quede anclado al origen.
        ruta.setLatitudActual(null);
        ruta.setLongitudActual(null);
        ruta.setUltimaActualizacionGPS(null);
        ruta.setVelocidadActualKmh(null);
        ruta.setDistanciaRestanteKm(null);
        ruta.setDesviado(null);
        ruta.setInicioDetencion(null);
        recalcularDistanciaEstimada(ruta, ruta.getDistanciaEstimadaKm());
        aplicarAsignacionConductor(ruta, ruta.getConductorId(), usuarioId);
        return rutaRepository.save(ruta);
    }
    
    @GetMapping("/vehiculo/{vehiculoId}")
    public List<Ruta> obtenerRutasPorVehiculo(@PathVariable String vehiculoId) {
        return rutaRepository.findByVehiculoId(vehiculoId);
    }

    @PutMapping("/{id}")
    public Ruta actualizarRuta(@PathVariable String id, @RequestBody Ruta rutaActualizada, HttpServletRequest request) {
        String usuarioId = (String) request.getAttribute("userId");
        String role = (String) request.getAttribute("userRole");
        String conductorId = (String) request.getAttribute("conductorId");

        return rutaRepository.findById(id)
                .map(ruta -> {
                    validarAccesoRuta(ruta, usuarioId, role, conductorId);

                    if (!"CONDUCTOR".equals(role)) {
                        String conductorAnteriorId = normalizarId(ruta.getConductorId());
                        if (rutaActualizada.getOrigen() != null) ruta.setOrigen(rutaActualizada.getOrigen());
                        if (rutaActualizada.getDestino() != null) ruta.setDestino(rutaActualizada.getDestino());
                        if (rutaActualizada.getDistanciaEstimadaKm() != null) ruta.setDistanciaEstimadaKm(rutaActualizada.getDistanciaEstimadaKm());
                        if (rutaActualizada.getVehiculoId() != null) ruta.setVehiculoId(rutaActualizada.getVehiculoId());
                        if (rutaActualizada.getFecha() != null) ruta.setFecha(rutaActualizada.getFecha());
                        if (rutaActualizada.getLatitudOrigen() != null) ruta.setLatitudOrigen(rutaActualizada.getLatitudOrigen());
                        if (rutaActualizada.getLongitudOrigen() != null) ruta.setLongitudOrigen(rutaActualizada.getLongitudOrigen());
                        if (rutaActualizada.getLatitudDestino() != null) ruta.setLatitudDestino(rutaActualizada.getLatitudDestino());
                        if (rutaActualizada.getLongitudDestino() != null) ruta.setLongitudDestino(rutaActualizada.getLongitudDestino());
                        recalcularDistanciaEstimada(ruta, rutaActualizada.getDistanciaEstimadaKm());
                        if (rutaActualizada.getConductorId() != null || rutaActualizada.getConductorNombre() != null) {
                            aplicarAsignacionConductor(ruta, rutaActualizada.getConductorId(), usuarioId);
                            String conductorNuevoId = normalizarId(ruta.getConductorId());
                            boolean conductorCambio = !Objects.equals(conductorAnteriorId, conductorNuevoId);
                            if (conductorCambio && !"COMPLETADA".equals(normalizarEstado(ruta.getEstado()))) {
                                // El GPS histórico de ruta pertenece al conductor anterior.
                                // Si reasignamos, limpiamos esa línea base para NO seguir
                                // mostrando/mezclando la señal vieja ni puentear km fantasma.
                                resetearLineaBaseGPS(ruta);
                            }
                        }
                    }

                    // Si se está iniciando la ruta (cambio a EN_CURSO) y no tiene posición GPS actual
                    // Inicializar con la posición de origen
                    if (rutaActualizada.getEstado() != null && 
                        "EN_CURSO".equals(rutaActualizada.getEstado()) && 
                        ruta.getLatitudActual() == null) {
                       
                        System.out.println("[RutaController] Iniciando ruta - ESPERANDO GPS REAL del dispositivo");
                        ruta.setLatitudActual(null);
                        ruta.setLongitudActual(null);
                    }
                    
                    if (rutaActualizada.getEstado() != null) {
                        String estadoAnterior = ruta.getEstado();
                        String estadoNormalizado = normalizarEstado(rutaActualizada.getEstado());

                        // Si la ruta vuelve a EN_CURSO desde un estado no activo,
                        // limpiamos la línea base del GPS para NO puentear kilómetros
                        // fantasma entre la última posición vieja y la nueva real.
                        if ("EN_CURSO".equals(estadoNormalizado)
                                && !"EN_CURSO".equals(normalizarEstado(estadoAnterior))
                                && !"DETENIDO".equals(normalizarEstado(estadoAnterior))) {
                            resetearLineaBaseGPS(ruta);
                        }

                        ruta.setEstado(estadoNormalizado);

                        // Resetear detención al reanudar manualmente
                        if ("EN_CURSO".equals(estadoNormalizado)) {
                            ruta.setInicioDetencion(null);
                        }

                        // ─── AUTO-UPDATE KILOMETRAJE DEL VEHÍCULO AL COMPLETAR ───────────
                        // Solo si la transición ES a COMPLETADA (evitar doble conteo)
                        if ("COMPLETADA".equals(estadoNormalizado)
                                && !"COMPLETADA".equals(normalizarEstado(estadoAnterior))
                                && ruta.getVehiculoId() != null) {

                            // Política de conteo de km al completar:
                            //  SOLO contamos distanciaRecorridaKm (acumulada por GPS real).
                            //  Si el conductor no se movió (GPS no registró distancia),
                            //  los km son 0. La distancia estimada es para planificación,
                            //  NO para contabilidad. Esto evita inflar km ficticios.
                            double kmAñadir = ruta.getDistanciaRecorridaKm() != null
                                    ? ruta.getDistanciaRecorridaKm()
                                    : 0;

                            final double kmFinal = kmAñadir;
                            vehiculoRepository.findById(ruta.getVehiculoId()).ifPresent(vehiculo -> {
                                // Actualizar kilometraje
                                double kmActuales = vehiculo.getKilometraje() != null ? vehiculo.getKilometraje() : 0;
                                vehiculo.setKilometraje(kmActuales + kmFinal);

                                // Descontar combustible consumido
                                // consumo = km × (consumoPor100km / 100) / capacidadDeposito × 100
                                // Defaults: 8L/100km, 60L de depósito
                                if (vehiculo.getCombustibleActual() != null) {
                                    double consumo = vehiculo.getConsumoPor100km() != null ? vehiculo.getConsumoPor100km() : 8.0;
                                    double capacidad = vehiculo.getCapacidadDeposito() != null ? vehiculo.getCapacidadDeposito() : 60.0;
                                    double litrosConsumidos = kmFinal * consumo / 100.0;
                                    double pctConsumido = (litrosConsumidos / capacidad) * 100.0;
                                    double pctAnterior = vehiculo.getCombustibleActual();
                                    double nuevoPct = Math.max(0.0, Math.round((pctAnterior - pctConsumido) * 10.0) / 10.0);
                                    vehiculo.setCombustibleActual(nuevoPct);
                                    System.out.printf("[RutaController] ⛽ Combustible vehículo %s: %.1f%% → %.1f%% (−%.1f L en %.1f km)%n",
                                            vehiculo.getMatricula(), pctAnterior, nuevoPct, litrosConsumidos, kmFinal);
                                }

                                vehiculoRepository.save(vehiculo);
                                System.out.printf("[RutaController] ✅ Km actualizados vehículo %s: %.1f → %.1f km%n",
                                        vehiculo.getMatricula(), kmActuales, kmActuales + kmFinal);
                            });
                        }
                    }
                    
                    // NOTA: latitudActual/longitudActual NO se actualizan vía PUT.
                    // El único camino válido para mover el truck es POST /{id}/gps,
                    // que es el endpoint específico de telemetría del dispositivo.
                    // Esto evita que un PUT con `{...ruta}` desde el frontend
                    // re-ancle al origen accidentalmente.
                    
                    return normalizarEstadoRuta(rutaRepository.save(ruta));
                })
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Ruta no encontrada"));
    }

    @GetMapping("/{id}")
    public Ruta obtenerRuta(@PathVariable String id, HttpServletRequest request) {
        String usuarioId = (String) request.getAttribute("userId");
        String role = (String) request.getAttribute("userRole");
        String conductorId = (String) request.getAttribute("conductorId");

        Ruta ruta = rutaRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Ruta no encontrada"));
        validarAccesoRuta(ruta, usuarioId, role, conductorId);
        return normalizarEstadoRuta(ruta);
    }

    // Endpoint específico para que Android envíe actualizaciones de GPS en tiempo real
    @PostMapping("/{id}/gps")
    public Ruta actualizarGPS(@PathVariable String id, @RequestBody GPSCoordinates gps) {
        System.out.println("[RutaController] 📱 GPS RECIBIDO de Android: " + gps);
        return rutaRepository.findById(id)
                .map(ruta -> {
                    String estadoTelemetria = normalizarEstado(ruta.getEstado());
                    boolean rutaEnSeguimiento = "EN_CURSO".equals(estadoTelemetria) || "DETENIDO".equals(estadoTelemetria);
                    String timestampActual = Instant.now().toString();

                    if (!rutaEnSeguimiento) {
                        if (ruta.getConductorId() != null && !ruta.getConductorId().isBlank()) {
                            conductorRepository.findById(ruta.getConductorId()).ifPresent(c -> {
                                c.setLatitudActual(gps.getLatitud());
                                c.setLongitudActual(gps.getLongitud());
                                c.setUltimaActualizacionGPS(timestampActual);
                                conductorRepository.save(c);
                            });
                        }
                        return normalizarEstadoRuta(ruta);
                    }

                    boolean distanciaRestanteCalculadaConRuta = false;

                    // Guardar posición anterior para calcular velocidad
                    Double latitudAnterior = ruta.getLatitudActual();
                    Double longitudAnterior = ruta.getLongitudActual();
                    String timestampAnterior = ruta.getUltimaActualizacionGPS();

                    // Actualizar posición actual
                    ruta.setLatitudActual(gps.getLatitud());
                    ruta.setLongitudActual(gps.getLongitud());

                    // Guardar timestamp actual
                    ruta.setUltimaActualizacionGPS(timestampActual);

                    // Primera posición real del tramo activo: actualizar la
                    // distancia total esperada usando la ubicación ACTUAL del
                    // conductor, no el origen planificado. Si ya había km
                    // acumulados (reanudar), se respeta lo recorrido y se suma
                    // la distancia vial restante hasta el destino.
                    if ((latitudAnterior == null || longitudAnterior == null || timestampAnterior == null)
                            && ruta.getLatitudDestino() != null && ruta.getLongitudDestino() != null) {
                        Double kmRestantesRutaReal = calcularDistanciaRutaRealKm(
                                gps.getLatitud(),
                                gps.getLongitud(),
                                ruta.getLatitudDestino(),
                                ruta.getLongitudDestino()
                        );
                        if (kmRestantesRutaReal != null && kmRestantesRutaReal > 0) {
                            double kmAcumulados = ruta.getDistanciaRecorridaKm() != null
                                    ? ruta.getDistanciaRecorridaKm()
                                    : 0.0;
                            ruta.setDistanciaRestanteKm(redondearKm(kmRestantesRutaReal));
                            ruta.setDistanciaEstimadaKm(redondearKm(kmAcumulados + kmRestantesRutaReal));
                            distanciaRestanteCalculadaConRuta = true;
                        }
                    }

                    // Calcular distancia recorrida desde última posición
                    double distanciaRecorrida = 0;

                    // Calcular velocidad si tenemos posición y timestamp anterior
                    if (latitudAnterior != null && longitudAnterior != null && timestampAnterior != null) {
                        try {
                            distanciaRecorrida = calcularDistancia(
                                latitudAnterior, longitudAnterior,
                                gps.getLatitud(), gps.getLongitud()
                            );

                            Instant instanteAnterior = Instant.parse(timestampAnterior);
                            Instant instanteActual = Instant.parse(timestampActual);
                            double segundosTranscurridos = (instanteActual.toEpochMilli() - instanteAnterior.toEpochMilli()) / 1000.0;
                            double horasTranscurridas = segundosTranscurridos / 3600.0;

                            if (horasTranscurridas > 0 && distanciaRecorrida > 0.001) {
                                double velocidad = distanciaRecorrida / horasTranscurridas;
                                velocidad = Math.max(0, Math.min(200, velocidad));
                                ruta.setVelocidadActualKmh(velocidad);
                            } else {
                                ruta.setVelocidadActualKmh(0.0);
                            }
                        } catch (Exception e) {
                            System.err.println("[RutaController] Error calculando velocidad: " + e.getMessage());
                            ruta.setVelocidadActualKmh(0.0);
                        }
                    } else {
                        ruta.setVelocidadActualKmh(0.0);
                    }

                    if (gps.getVelocidadKmh() != null && gps.getVelocidadKmh() >= 0) {
                        double velocidadReportada = Math.max(0, Math.min(200, gps.getVelocidadKmh()));
                        ruta.setVelocidadActualKmh(velocidadReportada);
                    }

                    // ═══ ACUMULAR DISTANCIA RECORRIDA REAL ═══
                    // Sumamos la distancia entre cada par de GPS para tener el km
                    // verdadero al completar.
                    //
                    // OJO: no podemos exigir que el tramo sea mayor que toda la
                    // precisión reportada (ej. 50m, 80m) porque la app emite GPS
                    // cada 3–4s. A velocidad urbana o media, un vehículo puede
                    // avanzar 25m, 40m o 60m entre muestras: eso es MOVIMIENTO
                    // real, no ruido. Si el umbral depende demasiado de la
                    // precisión, terminamos descartando kilómetros válidos y el
                    // historial queda en 0.
                    //
                    // La estrategia correcta combina:
                    //  1. un umbral corto de jitter (3m–12m, acotado)
                    //  2. velocidad plausible (<250 km/h)
                    //  3. confirmación por velocidad reportada o implícita
                    if (distanciaRecorrida > 0 && timestampAnterior != null) {
                        double precisionM = gps.getPrecision() != null && gps.getPrecision() > 0
                                ? gps.getPrecision()
                                : 15.0;

                        try {
                            Instant a = Instant.parse(timestampAnterior);
                            Instant b = Instant.parse(timestampActual);
                            double seg = (b.toEpochMilli() - a.toEpochMilli()) / 1000.0;
                            if (seg > 0) {
                                double velocidadImplicita = (distanciaRecorrida / seg) * 3600.0;
                                if (!esVelocidadGpsPosible(velocidadImplicita)) {
                                    System.out.printf("[RutaController] ⚠ Salto GPS descartado: %.2f km en %.1fs (%.0f km/h implícita)%n",
                                            distanciaRecorrida, seg, velocidadImplicita);
                                } else if (debeAcumularSegmento(distanciaRecorrida, precisionM, gps.getVelocidadKmh(), velocidadImplicita)) {
                                    acumularDistanciaRecorrida(ruta, distanciaRecorrida);
                                }
                            }
                        } catch (Exception ignored) {
                            // Si los timestamps no parsean, seguimos filtrando jitter,
                            // pero sin perder un tramo real por un parseo fallido.
                            if (debeAcumularSegmento(distanciaRecorrida, precisionM, gps.getVelocidadKmh(), null)) {
                                acumularDistanciaRecorrida(ruta, distanciaRecorrida);
                            }
                        }
                    }

                    // ═══ DETECCIÓN DE INACTIVIDAD (5 min sin moverse) ═══
                    // Si la ruta está EN_CURSO o DETENIDO, evaluar movimiento
                    String estadoActual = normalizarEstado(ruta.getEstado());
                    if ("EN_CURSO".equals(estadoActual) || "DETENIDO".equals(estadoActual)) {
                        double precisionM = gps.getPrecision() != null && gps.getPrecision() > 0
                                ? gps.getPrecision()
                                : 15.0;
                        double umbralMovimientoKm = Math.max(0.012, (precisionM * 1.25) / 1000.0);
                        double velocidadActualKmh = ruta.getVelocidadActualKmh() != null ? ruta.getVelocidadActualKmh() : 0.0;
                        boolean hayMovimientoReal = distanciaRecorrida >= umbralMovimientoKm || velocidadActualKmh >= 4.0;

                        if (hayMovimientoReal) {
                            // Hay movimiento → si estaba DETENIDO, reactivar
                            if ("DETENIDO".equals(estadoActual)) {
                                ruta.setEstado("EN_CURSO");
                                System.out.println("[RutaController] ▶ Ruta REACTIVADA - movimiento detectado");
                            }
                            // Resetear el timestamp de inicio de parada
                            ruta.setInicioDetencion(null);
                        } else {
                            // Sin movimiento significativo
                            if (ruta.getInicioDetencion() == null) {
                                // Primera detección de parada: marcar inicio
                                ruta.setInicioDetencion(timestampActual);
                            } else {
                                // Ya estaba parado: verificar si pasaron 5 minutos
                                try {
                                    Instant inicioParada = Instant.parse(ruta.getInicioDetencion());
                                    Instant ahora = Instant.parse(timestampActual);
                                    long segundosDetenido = (ahora.toEpochMilli() - inicioParada.toEpochMilli()) / 1000;

                                    if (segundosDetenido >= 300 && "EN_CURSO".equals(estadoActual)) {
                                        ruta.setEstado("DETENIDO");
                                        System.out.println("[RutaController] ⏸ Ruta DETENIDA - " + segundosDetenido + "s sin movimiento");
                                    }
                                } catch (Exception e) {
                                    System.err.println("[RutaController] Error evaluando detencion: " + e.getMessage());
                                }
                            }
                        }
                    }

                    // Calcular distancia restante al destino
                    if (!distanciaRestanteCalculadaConRuta
                            && ruta.getLatitudDestino() != null && ruta.getLongitudDestino() != null) {
                        double distanciaRestante = calcularDistancia(
                            gps.getLatitud(), gps.getLongitud(),
                            ruta.getLatitudDestino(), ruta.getLongitudDestino()
                        );
                        ruta.setDistanciaRestanteKm(distanciaRestante);
                    }

                    // Calcular si está desviado
                    if (ruta.getLatitudOrigen() != null && ruta.getLongitudOrigen() != null &&
                        ruta.getLatitudDestino() != null && ruta.getLongitudDestino() != null) {

                        double distanciaTotal = calcularDistancia(
                            ruta.getLatitudOrigen(), ruta.getLongitudOrigen(),
                            ruta.getLatitudDestino(), ruta.getLongitudDestino()
                        );
                        double distanciaActualADestino = ruta.getDistanciaRestanteKm();

                        ruta.setDesviado(distanciaActualADestino > (distanciaTotal * 1.2));
                    }

                    // ─── Actualizar ubicación del conductor (para mostrarlo en mapa aunque no tenga ruta activa) ───
                    if (ruta.getConductorId() != null && !ruta.getConductorId().isBlank()) {
                        conductorRepository.findById(ruta.getConductorId()).ifPresent(c -> {
                            c.setLatitudActual(gps.getLatitud());
                            c.setLongitudActual(gps.getLongitud());
                            c.setUltimaActualizacionGPS(timestampActual);
                            conductorRepository.save(c);
                        });
                    }

                    return normalizarEstadoRuta(rutaRepository.save(ruta));
                })
                .orElse(null);
    }

    // Endpoint para obtener última ubicación conocida
    @GetMapping("/{id}/last-location")
    public GPSCoordinates obtenerUltimaUbicacion(@PathVariable String id) {
        return rutaRepository.findById(id)
                .map(ruta -> {
                    GPSCoordinates gps = new GPSCoordinates();
                    gps.setLatitud(ruta.getLatitudActual());
                    gps.setLongitud(ruta.getLongitudActual());
                    return gps;
                })
                .orElse(null);
    }

    // Endpoint para solicitar actualización de GPS al dispositivo móvil
    @PostMapping("/{id}/request-gps")
    public String solicitarGPSMovil(@PathVariable String id) {
        return "GPS_REQUEST_SENT";
    }

    @DeleteMapping("/{id}")
    public void eliminarRuta(@PathVariable String id, HttpServletRequest request) {
        String usuarioId = (String) request.getAttribute("userId");
        String role = (String) request.getAttribute("userRole");
        if ("CONDUCTOR".equals(role)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Los conductores no pueden eliminar rutas");
        }
        Ruta ruta = rutaRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Ruta no encontrada"));
        validarAccesoRuta(ruta, usuarioId, role, null);
        rutaRepository.deleteById(id);
    }

    private void validarAccesoRuta(Ruta ruta, String usuarioId, String role, String conductorId) {
        if (ruta == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Ruta no encontrada");
        }
        if (usuarioId == null || !usuarioId.equals(ruta.getUsuarioId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Ruta fuera del alcance de la sesión");
        }
        if ("CONDUCTOR".equals(role)) {
            if (conductorId == null || conductorId.isBlank()) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Conductor no identificado");
            }
            if (!conductorId.equals(ruta.getConductorId())) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Ruta no asignada a este conductor");
            }
        }
    }

    private void aplicarAsignacionConductor(Ruta ruta, String conductorId, String usuarioId) {
        if (conductorId == null) {
            return;
        }

        String conductorIdNormalizado = conductorId.trim();
        if (conductorIdNormalizado.isEmpty()) {
            ruta.setConductorId(null);
            ruta.setConductorNombre(null);
            return;
        }

        Conductor conductor = conductorRepository.findById(conductorIdNormalizado)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Conductor no encontrado"));

        if (!usuarioId.equals(conductor.getEmpresaId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El conductor no pertenece a esta empresa");
        }

        ruta.setConductorId(conductor.getId());
        ruta.setConductorNombre(conductor.getNombre());
    }

    private Ruta normalizarEstadoRuta(Ruta ruta) {
        if (ruta == null) {
            return null;
        }
        ruta.setEstado(normalizarEstado(ruta.getEstado()));
        return ruta;
    }

    private String normalizarEstado(String estado) {
        if (estado == null || estado.isBlank()) {
            return "PLANIFICADA";
        }

        String limpio = estado.trim().toUpperCase().replace(' ', '_');
        return switch (limpio) {
            case "ENCURSO" -> "EN_CURSO";
            case "EN_CURSO" -> "EN_CURSO";
            case "DETENIDA", "PAUSADA", "PAUSADO", "STOPPED" -> "DETENIDO";
            case "COMPLETADO" -> "COMPLETADA";
            case "PLANEADA" -> "PLANIFICADA";
            default -> limpio;
        };
    }

    private void recalcularDistanciaEstimada(Ruta ruta, Double distanciaSugeridaKm) {
        if (ruta == null) return;
        if (distanciaSugeridaKm != null && distanciaSugeridaKm > 0) {
            ruta.setDistanciaEstimadaKm(redondearKm(distanciaSugeridaKm));
        }

        if (ruta.getLatitudOrigen() == null || ruta.getLongitudOrigen() == null
                || ruta.getLatitudDestino() == null || ruta.getLongitudDestino() == null) {
            return;
        }

        Double kmRutaReal = calcularDistanciaRutaRealKm(
                ruta.getLatitudOrigen(),
                ruta.getLongitudOrigen(),
                ruta.getLatitudDestino(),
                ruta.getLongitudDestino()
        );

        if (kmRutaReal != null && kmRutaReal > 0) {
            ruta.setDistanciaEstimadaKm(redondearKm(kmRutaReal));
            return;
        }

        double kmRecta = calcularDistancia(
                ruta.getLatitudOrigen(),
                ruta.getLongitudOrigen(),
                ruta.getLatitudDestino(),
                ruta.getLongitudDestino()
        );

        // Factor conservador para aproximar recorrido vial en caso de no usar
        // proveedor de rutas. Solo usamos esto como último fallback.
        double kmEstimados = Math.round((kmRecta * 1.18) * 10.0) / 10.0;
        ruta.setDistanciaEstimadaKm(Math.max(0.1, kmEstimados));
    }

    private void resetearLineaBaseGPS(Ruta ruta) {
        ruta.setLatitudActual(null);
        ruta.setLongitudActual(null);
        ruta.setUltimaActualizacionGPS(null);
        ruta.setVelocidadActualKmh(null);
        ruta.setDistanciaRestanteKm(null);
        ruta.setDesviado(false);
        ruta.setInicioDetencion(null);
    }

    private String normalizarId(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private void acumularDistanciaRecorrida(Ruta ruta, double distanciaKm) {
        double acumulada = ruta.getDistanciaRecorridaKm() != null
                ? ruta.getDistanciaRecorridaKm()
                : 0.0;
        ruta.setDistanciaRecorridaKm(acumulada + distanciaKm);
    }

    static double calcularUmbralAcumulacionMetros(Double precisionM) {
        double precisionNormalizada = precisionM != null && precisionM > 0 ? precisionM : 15.0;
        // Nunca menor a 3m para no sumar jitter mínimo, y nunca mayor a 12m
        // para no comernos tramos reales cuando las muestras llegan cada pocos segundos.
        return Math.max(3.0, Math.min(precisionNormalizada * 0.35, 12.0));
    }

    static boolean esVelocidadGpsPosible(Double velocidadKmh) {
        return velocidadKmh != null
                && Double.isFinite(velocidadKmh)
                && velocidadKmh >= 0
                && velocidadKmh <= 250.0;
    }

    static boolean debeAcumularSegmento(double distanciaRecorridaKm,
                                        Double precisionM,
                                        Double velocidadReportadaKmh,
                                        Double velocidadImplicitaKmh) {
        if (!Double.isFinite(distanciaRecorridaKm) || distanciaRecorridaKm <= 0) {
            return false;
        }

        double distanciaMetros = distanciaRecorridaKm * 1000.0;
        double umbralMetros = calcularUmbralAcumulacionMetros(precisionM);
        double velocidadReportada = esVelocidadGpsPosible(velocidadReportadaKmh) ? velocidadReportadaKmh : 0.0;
        double velocidadImplicita = esVelocidadGpsPosible(velocidadImplicitaKmh) ? velocidadImplicitaKmh : 0.0;

        boolean segmentoSuficiente = distanciaMetros >= umbralMetros;
        boolean movimientoConfirmado = velocidadReportada >= 4.0 || velocidadImplicita >= 4.0;
        boolean microTramoValido = movimientoConfirmado && distanciaMetros >= Math.max(3.0, umbralMetros * 0.5);

        return segmentoSuficiente || microTramoValido;
    }

    private Double calcularDistanciaRutaRealKm(double latOrigen, double lonOrigen, double latDestino, double lonDestino) {
        try {
            String url = String.format(
                    Locale.US,
                    "%s/%.6f,%.6f;%.6f,%.6f?overview=false",
                    OSRM_ROUTE_BASE_URL,
                    lonOrigen, latOrigen,
                    lonDestino, latDestino
            );

            HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                    .timeout(Duration.ofSeconds(6))
                    .header("User-Agent", "SaaS-CarCare/1.0")
                    .GET()
                    .build();

            HttpResponse<String> response = HTTP_CLIENT.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                return null;
            }

            JsonNode json = OBJECT_MAPPER.readTree(response.body());
            JsonNode routes = json.path("routes");
            if (!routes.isArray() || routes.isEmpty()) {
                return null;
            }

            double meters = routes.get(0).path("distance").asDouble(-1);
            if (!Double.isFinite(meters) || meters <= 0) {
                return null;
            }

            return meters / 1000.0;
        } catch (Exception e) {
            System.err.println("[RutaController] No se pudo calcular distancia vial real: " + e.getMessage());
            return null;
        }
    }

    private double redondearKm(double km) {
        return Math.round(km * 10.0) / 10.0;
    }

    // Clase interna para recibir coordenadas GPS
    public static class GPSCoordinates {
        private Double latitud;
        private Double longitud;
        private Double precision;
        private Double velocidadKmh;
        
        public Double getLatitud() { return latitud; }
        public void setLatitud(Double latitud) { this.latitud = latitud; }
        public Double getLongitud() { return longitud; }
        public void setLongitud(Double longitud) { this.longitud = longitud; }
        public Double getPrecision() { return precision; }
        public void setPrecision(Double precision) { this.precision = precision; }
        public Double getVelocidadKmh() { return velocidadKmh; }
        public void setVelocidadKmh(Double velocidadKmh) { this.velocidadKmh = velocidadKmh; }
        
        @Override
        public String toString() {
            return String.format("GPS[lat=%.6f, lng=%.6f, acc=%s, speed=%s]",
                    latitud,
                    longitud,
                    precision != null ? String.format("%.1fm", precision) : "-",
                    velocidadKmh != null ? String.format("%.1fkm/h", velocidadKmh) : "-");
        }
    }

    // Método para calcular distancia entre dos puntos GPS (fórmula de Haversine)
    private double calcularDistancia(double lat1, double lon1, double lat2, double lon2) {
        final int R = 6371; // Radio de la Tierra en kilómetros
        
        double latDistance = Math.toRadians(lat2 - lat1);
        double lonDistance = Math.toRadians(lon2 - lon1);
        double a = Math.sin(latDistance / 2) * Math.sin(latDistance / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(lonDistance / 2) * Math.sin(lonDistance / 2);
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c; // distancia en kilómetros
    }
}
