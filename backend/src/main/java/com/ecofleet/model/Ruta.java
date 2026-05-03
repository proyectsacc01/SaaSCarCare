package com.ecofleet.model;

import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

@Data
@Document(collection = "rutas")
public class Ruta {
    @Id
    private String id;
    
    private String usuarioId; // ID del usuario/empresa propietaria

    private String origen;
    private String destino;
    private Double distanciaEstimadaKm;
    private String estado; // "PLANIFICADA", "EN_CURSO", "DETENIDO", "COMPLETADA"
    
    private String vehiculoId; // Vehiculo asignado
    private String conductorId;     // Conductor asignado (nullable)
    private String conductorNombre; // Nombre desnormalizado para display
    private String fecha;

    // Coordenadas para el Tracking
    private Double latitudOrigen;
    private Double longitudOrigen;
    private Double latitudDestino;
    private Double longitudDestino;
    
    private Double latitudActual;
    private Double longitudActual;
    
    private Boolean desviado = false;
    
    // Timestamp de la última actualización GPS recibida
    private String ultimaActualizacionGPS;
    
    // Timestamp de inicio de detención (para detectar paradas de 5+ min)
    private String inicioDetencion;

    // Datos calculados en tiempo real
    private Double velocidadActualKmh; // Velocidad calculada en km/h
    private Double distanciaRestanteKm; // Distancia restante hasta el destino

    // Distancia ACUMULADA realmente recorrida desde el inicio de la ruta,
    // calculada sumando la distancia entre cada par de GPS recibidos.
    // Esto es lo que se usa para sumar al kilometraje del vehículo cuando
    // la ruta se completa, en vez de la distancia estimada que puede no
    // reflejar el trayecto real (desvíos, origen distinto, etc).
    private Double distanciaRecorridaKm;

    // Getters y Setters manuales para asegurar compatibilidad
    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    
    public String getOrigen() { return origen; }
    public void setOrigen(String origen) { this.origen = origen; }
    
    public String getDestino() { return destino; }
    public void setDestino(String destino) { this.destino = destino; }
    
    public Double getDistanciaEstimadaKm() { return distanciaEstimadaKm; }
    public void setDistanciaEstimadaKm(Double distanciaEstimadaKm) { this.distanciaEstimadaKm = distanciaEstimadaKm; }
    
    public String getEstado() { return estado; }
    public void setEstado(String estado) { this.estado = estado; }
    
    public String getVehiculoId() { return vehiculoId; }
    public void setVehiculoId(String vehiculoId) { this.vehiculoId = vehiculoId; }

    public String getConductorId() { return conductorId; }
    public void setConductorId(String conductorId) { this.conductorId = conductorId; }

    public String getConductorNombre() { return conductorNombre; }
    public void setConductorNombre(String conductorNombre) { this.conductorNombre = conductorNombre; }

    public String getFecha() { return fecha; }
    public void setFecha(String fecha) { this.fecha = fecha; }
    
    public Double getLatitudOrigen() { return latitudOrigen; }
    public void setLatitudOrigen(Double latitudOrigen) { this.latitudOrigen = latitudOrigen; }
    
    public Double getLongitudOrigen() { return longitudOrigen; }
    public void setLongitudOrigen(Double longitudOrigen) { this.longitudOrigen = longitudOrigen; }
    
    public Double getLatitudDestino() { return latitudDestino; }
    public void setLatitudDestino(Double latitudDestino) { this.latitudDestino = latitudDestino; }
    
    public Double getLongitudDestino() { return longitudDestino; }
    public void setLongitudDestino(Double longitudDestino) { this.longitudDestino = longitudDestino; }
    
    public Double getLatitudActual() { return latitudActual; }
    public void setLatitudActual(Double latitudActual) { this.latitudActual = latitudActual; }
    
    public Double getLongitudActual() { return longitudActual; }
    public void setLongitudActual(Double longitudActual) { this.longitudActual = longitudActual; }
    
    public Boolean getDesviado() { return desviado; }
    public void setDesviado(Boolean desviado) { this.desviado = desviado; }
    
    public String getUltimaActualizacionGPS() { return ultimaActualizacionGPS; }
    public void setUltimaActualizacionGPS(String ultimaActualizacionGPS) { this.ultimaActualizacionGPS = ultimaActualizacionGPS; }
    
    public Double getVelocidadActualKmh() { return velocidadActualKmh; }
    public void setVelocidadActualKmh(Double velocidadActualKmh) { this.velocidadActualKmh = velocidadActualKmh; }
    
    public Double getDistanciaRestanteKm() { return distanciaRestanteKm; }
    public void setDistanciaRestanteKm(Double distanciaRestanteKm) { this.distanciaRestanteKm = distanciaRestanteKm; }

    public Double getDistanciaRecorridaKm() { return distanciaRecorridaKm; }
    public void setDistanciaRecorridaKm(Double distanciaRecorridaKm) { this.distanciaRecorridaKm = distanciaRecorridaKm; }

    public String getInicioDetencion() { return inicioDetencion; }
    public void setInicioDetencion(String inicioDetencion) { this.inicioDetencion = inicioDetencion; }
}
