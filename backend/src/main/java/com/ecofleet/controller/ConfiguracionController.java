package com.ecofleet.controller;

import com.ecofleet.model.ConfiguracionEmail;
import com.ecofleet.repository.ConfiguracionEmailRepository;
import com.ecofleet.repository.UsuarioRepository;
import com.ecofleet.service.EmailService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/configuracion")
public class ConfiguracionController {

    @Autowired private UsuarioRepository usuarioRepository;
    @Autowired private ConfiguracionEmailRepository configEmailRepo;
    @Autowired private EmailService emailService;

    @GetMapping
    public ResponseEntity<Map<String, Object>> getConfiguracion(HttpServletRequest request) {
        String empresaId = (String) request.getAttribute("userId");
        return usuarioRepository.findById(empresaId)
                .map(u -> {
                    Map<String, Object> resp = new HashMap<>();
                    resp.put("emailCuenta", u.getEmail());
                    resp.put("nombreEmpresa", u.getNombreEmpresa() != null ? u.getNombreEmpresa() : u.getNombre());
                    resp.put("emailDisponible", emailService.isConfigured());

                    ConfiguracionEmail cfg = configEmailRepo.findByEmpresaId(empresaId).orElse(null);
                    resp.put("emailNotificaciones", cfg != null && cfg.getEmailNotificaciones() != null ? cfg.getEmailNotificaciones() : "");
                    resp.put("telefonoUrgencias", cfg != null && cfg.getTelefonoUrgencias() != null ? cfg.getTelefonoUrgencias() : "");
                    return ResponseEntity.ok(resp);
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @PutMapping("/email")
    public ResponseEntity<Map<String, String>> actualizarConfig(
            HttpServletRequest request,
            @RequestBody Map<String, String> body) {
        String empresaId = (String) request.getAttribute("userId");

        ConfiguracionEmail cfg = configEmailRepo.findByEmpresaId(empresaId)
                .orElseGet(() -> {
                    ConfiguracionEmail c = new ConfiguracionEmail();
                    c.setEmpresaId(empresaId);
                    return c;
                });

        if (body.containsKey("emailNotificaciones")) {
            try {
                String normalizado = emailService.normalizarDestinatarios(body.get("emailNotificaciones"));
                cfg.setEmailNotificaciones(normalizado.isEmpty() ? null : normalizado);
            } catch (IllegalArgumentException e) {
                return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
            }
        }

        if (body.containsKey("telefonoUrgencias")) {
            String telefono = body.get("telefonoUrgencias");
            if (telefono != null) {
                telefono = telefono.trim();
            }
            cfg.setTelefonoUrgencias(telefono == null || telefono.isBlank() ? null : telefono);
        }

        configEmailRepo.save(cfg);
        return ResponseEntity.ok(Map.of("mensaje", "Configuracion actualizada"));
    }

    @PostMapping("/test-email")
    public ResponseEntity<Map<String, String>> testEmail(HttpServletRequest request) {
        String empresaId = (String) request.getAttribute("userId");

        if (!emailService.isConfigured()) {
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "El servicio de email no esta disponible en este momento"));
        }

        ConfiguracionEmail cfg = configEmailRepo.findByEmpresaId(empresaId).orElse(null);
        String destino = cfg != null && cfg.getEmailNotificaciones() != null && !cfg.getEmailNotificaciones().isBlank()
                ? cfg.getEmailNotificaciones()
                : usuarioRepository.findById(empresaId).map(u -> u.getEmail()).orElse("");

        if (destino.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "No hay email destino"));
        }

        try {
            String html = "<body style='margin:0;padding:0;background:#080c14;font-family:Segoe UI,Roboto,Arial,sans-serif;'>" +
                    "<table width='100%' cellpadding='0' cellspacing='0' style='background:#080c14;'><tr><td align='center'>" +
                    "<table width='500' cellpadding='0' cellspacing='0' style='max-width:500px;width:100%;'>" +
                    "<tr><td style='background:linear-gradient(135deg,#0f1923,#0d1117);padding:40px;text-align:center;border-bottom:2px solid #3bf63b;'>" +
                    "<span style='font-size:24px;font-weight:800;color:#3bf63b;letter-spacing:3px;'>./CarCare</span>" +
                    "</td></tr>" +
                    "<tr><td style='background:#0d1117;padding:40px;text-align:center;'>" +
                    "<div style='background:#0f1923;border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:32px;margin-bottom:20px;'>" +
                    "<div style='width:48px;height:48px;margin:0 auto 16px;background:rgba(59,246,59,0.1);border-radius:50%;line-height:48px;text-align:center;'>" +
                    "<span style='color:#3bf63b;font-size:24px;'>&#10003;</span></div>" +
                    "<h2 style='color:#ffffff;margin:0 0 8px;font-size:18px;font-weight:700;'>Conexion exitosa</h2>" +
                    "<p style='color:rgba(255,255,255,0.5);font-size:13px;margin:0;line-height:1.6;'>Tu configuracion de email funciona correctamente.<br>Los reportes mensuales se enviaran a esta direccion.</p>" +
                    "</div>" +
                    "</td></tr>" +
                    "<tr><td style='background:#0a0e18;padding:20px;text-align:center;border-top:1px solid rgba(255,255,255,0.06);'>" +
                    "<p style='color:rgba(255,255,255,0.2);font-size:11px;margin:0;'>CarCare Tracker - Gestion Inteligente de Flotas</p>" +
                    "</td></tr>" +
                    "</table></td></tr></table></body>";
            emailService.enviar(destino, "CarCare - Test de email", html);
            return ResponseEntity.ok(Map.of("mensaje", "Email de prueba enviado a " + destino));
        } catch (Exception e) {
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", e.getMessage() != null ? e.getMessage() : "No se pudo enviar el email. Intenta de nuevo mas tarde."));
        }
    }
}
