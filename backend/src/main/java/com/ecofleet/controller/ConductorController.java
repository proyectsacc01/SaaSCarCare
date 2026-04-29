package com.ecofleet.controller;

import com.ecofleet.model.Conductor;
import com.ecofleet.model.Usuario;
import com.ecofleet.repository.ConductorRepository;
import com.ecofleet.repository.UsuarioRepository;
import com.ecofleet.security.JwtUtil;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

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
}
