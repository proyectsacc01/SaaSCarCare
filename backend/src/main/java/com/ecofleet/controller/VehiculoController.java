package com.ecofleet.controller;

import com.ecofleet.model.Vehiculo;
import com.ecofleet.repository.VehiculoRepository;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/vehiculos")
@CrossOrigin(origins = "*")
public class VehiculoController {

    @Autowired
    private VehiculoRepository vehiculoRepository;

    @GetMapping
    public List<Vehiculo> obtenerTodos(HttpServletRequest request) {
        String usuarioId = (String) request.getAttribute("userId");
        return vehiculoRepository.findByUsuarioId(usuarioId);
    }

    /** Health endpoint — confirms which fields the Vehiculo model supports */
    @GetMapping("/version")
    public ResponseEntity<String> version() {
        return ResponseEntity.ok("vehiculo-model-v2-imagenUrl-support");
    }

    @PostMapping
    public Vehiculo crearVehiculo(@RequestBody Vehiculo vehiculo, HttpServletRequest request) {
        String usuarioId = (String) request.getAttribute("userId");
        vehiculo.setUsuarioId(usuarioId);
        return vehiculoRepository.save(vehiculo);
    }

    @GetMapping("/{id}")
    public ResponseEntity<Vehiculo> obtenerVehiculo(@PathVariable String id) {
        return vehiculoRepository.findById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PutMapping("/{id}")
    public ResponseEntity<Vehiculo> actualizarVehiculo(@PathVariable String id,
                                                        @RequestBody Vehiculo datos,
                                                        HttpServletRequest request) {
        String usuarioId = (String) request.getAttribute("userId");
        return vehiculoRepository.findById(id)
                .filter(v -> usuarioId.equals(v.getUsuarioId()))
                .map(v -> {
                    if (datos.getMarca() != null)            v.setMarca(datos.getMarca());
                    if (datos.getModelo() != null)           v.setModelo(datos.getModelo());
                    if (datos.getMatricula() != null)        v.setMatricula(datos.getMatricula());
                    if (datos.getKilometraje() != null)      v.setKilometraje(datos.getKilometraje());
                    if (datos.getTipoCombustible() != null)  v.setTipoCombustible(datos.getTipoCombustible());
                    if (datos.getCombustibleActual() != null) v.setCombustibleActual(datos.getCombustibleActual());
                    if (datos.getCapacidadDeposito() != null) v.setCapacidadDeposito(datos.getCapacidadDeposito());
                    if (datos.getConsumoPor100km() != null)   v.setConsumoPor100km(datos.getConsumoPor100km());
                    if (datos.getCosteKmReferencia() != null) v.setCosteKmReferencia(datos.getCosteKmReferencia());
                    if (datos.getImagenUrl() != null)        v.setImagenUrl(datos.getImagenUrl());
                    if (datos.getActivo() != null)           v.setActivo(datos.getActivo());
                    return ResponseEntity.ok(vehiculoRepository.save(v));
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> eliminarVehiculo(@PathVariable String id) {
        if (vehiculoRepository.existsById(id)) {
            vehiculoRepository.deleteById(id);
            return ResponseEntity.noContent().build();
        }
        return ResponseEntity.notFound().build();
    }
}
