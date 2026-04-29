package com.ecofleet.controller;

import com.ecofleet.model.Usuario;
import com.ecofleet.model.Conductor;
import com.ecofleet.repository.UsuarioRepository;
import com.ecofleet.repository.ConductorRepository;
import com.ecofleet.security.JwtUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.web.bind.annotation.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import jakarta.validation.Valid;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Controlador de autenticación.
 * 
 * ENDPOINTS:
 * - POST /api/auth/register → Registro de ADMINS (colección: usuarios)
 * - POST /api/auth/login → Login de ADMINS (colección: usuarios)
 * - POST /api/auth/register/conductor → Registro de CONDUCTORES (colección:
 * conductores)
 * - POST /api/auth/login/conductor → Login de CONDUCTORES (colección:
 * conductores)
 */
@RestController
@RequestMapping("/api/auth")
@CrossOrigin(origins = "*")
public class AuthController {

    private static final Logger logger = LoggerFactory.getLogger(AuthController.class);

    @Autowired
    private UsuarioRepository usuarioRepository;

    @Autowired
    private ConductorRepository conductorRepository;

    @Autowired
    private JwtUtil jwtUtil;

    private BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMINISTRADORES (Colección: usuarios)
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Registro de administradores/empresas.
     * Guarda en colección: usuarios
     */
    @PostMapping("/register")
    public ResponseEntity<?> registerAdmin(@Valid @RequestBody Usuario usuario) {
        logger.info("═══ REGISTRO ADMIN ═══");
        logger.info("Email: {}", usuario.getEmail());

        if (usuarioRepository.existsByEmail(usuario.getEmail())) {
            logger.warn("Email ya registrado: {}", usuario.getEmail());
            return ResponseEntity.badRequest().body(Map.of("error", "El email ya está registrado"));
        }

        usuario.setPassword(passwordEncoder.encode(usuario.getPassword()));
        usuario.setRole("ADMIN");

        Usuario saved = usuarioRepository.save(usuario);
        logger.info("✓ Admin registrado | ID: {}", saved.getId());

        return ResponseEntity.ok(Map.of(
                "message", "Empresa registrada correctamente",
                "id", saved.getId()));
    }

    /**
     * Login de administradores.
     * Busca en colección: usuarios
     */
    @PostMapping("/login")
    public ResponseEntity<?> loginAdmin(@RequestBody Map<String, String> credentials) {
        logger.info("═══ LOGIN ADMIN ═══");

        String email = credentials.get("email");
        String password = credentials.get("password");

        if (email == null || password == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "Email y contraseña son obligatorios"));
        }

        logger.info("Buscando admin: {}", email);
        Optional<Usuario> usuarioOpt = usuarioRepository.findByEmail(email.trim());

        if (usuarioOpt.isEmpty()) {
            logger.warn("Admin no encontrado: {}", email);
            return ResponseEntity.status(401).body(Map.of("error", "Credenciales inválidas"));
        }

        Usuario usuario = usuarioOpt.get();

        if (passwordEncoder.matches(password, usuario.getPassword())) {
            logger.info("✓ Login admin exitoso: {}", email);

            Map<String, Object> response = new HashMap<>();
            response.put("id", usuario.getId());
            response.put("email", usuario.getEmail());
            response.put("nombre", usuario.getNombre());
            response.put("nombreEmpresa", usuario.getNombreEmpresa());
            response.put("role", "ADMIN");
            response.put("empresaId", null);
            response.put("token", jwtUtil.generateToken(usuario.getId(), "ADMIN"));

            return ResponseEntity.ok(response);
        } else {
            logger.warn("Contraseña incorrecta para admin: {}", email);
            return ResponseEntity.status(401).body(Map.of("error", "Credenciales inválidas"));
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CONDUCTORES (Colección: conductores)
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Registro de conductores.
     * Guarda en colección: conductores
     */
    @GetMapping("/health")
    public ResponseEntity<?> healthCheck() {
        return ResponseEntity.ok(Map.of("status", "UP", "version", "1.0.1", "collection", "conductores"));
    }

    /**
     * Registro de conductores.
     * Guarda en colección: conductores
     */
    @PostMapping("/register/conductor")
    public ResponseEntity<?> registerConductor(@RequestBody Map<String, String> payload) {
        try {
            logger.info("═══ REGISTRO CONDUCTOR ═══");

            String email = payload.get("email");
            String password = payload.get("password");
            String nombre = payload.get("nombre");
            String empresaEmail = payload.get("empresaEmail");

            // Validaciones
            if (email == null || email.trim().isEmpty()) {
                return ResponseEntity.badRequest().body(Map.of("error", "El email es obligatorio"));
            }
            if (password == null || password.length() < 6) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "La contraseña debe tener mínimo 6 caracteres"));
            }
            if (nombre == null || nombre.trim().isEmpty()) {
                return ResponseEntity.badRequest().body(Map.of("error", "El nombre es obligatorio"));
            }
            if (empresaEmail == null || empresaEmail.trim().isEmpty()) {
                return ResponseEntity.badRequest().body(Map.of("error", "El email de la empresa es obligatorio"));
            }

            email = email.trim().toLowerCase();
            empresaEmail = empresaEmail.trim().toLowerCase();

            // Verificar que no exista
            if (conductorRepository.existsByEmail(email)) {
                logger.warn("Conductor ya existe: {}", email);
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Este email ya está registrado como conductor"));
            }

            // Buscar la empresa (admin)
            logger.info("Buscando empresa: {}", empresaEmail);
            Optional<Usuario> adminOpt = usuarioRepository.findByEmail(empresaEmail);
            if (adminOpt.isEmpty()) {
                logger.error("Empresa no encontrada: {}", empresaEmail);
                return ResponseEntity.badRequest().body(Map.of("error", "No existe ninguna empresa con ese email"));
            }

            Usuario admin = adminOpt.get();
            if (admin.getRole() != null && !admin.getRole().equalsIgnoreCase("ADMIN")) {
                logger.warn("Usuario encontrado pero rol incorrecto: {}", admin.getRole());
                // Permisivo: si está en la tabla de usuarios, lo tratamos como empresa
                // return ResponseEntity.badRequest().body(Map.of("error", "El email no
                // corresponde a una cuenta de empresa"));
            }

            // Crear conductor
            Conductor conductor = new Conductor();
            conductor.setEmail(email);
            conductor.setPassword(passwordEncoder.encode(password));
            conductor.setNombre(nombre.trim());
            conductor.setEmpresaId(admin.getId());
            conductor.setNombreEmpresa(admin.getNombreEmpresa());
            conductor.setActivo(true);

            Conductor saved = conductorRepository.save(conductor);

            logger.info("✓ CONDUCTOR REGISTRADO");
            logger.info("  ID: {}", saved.getId());
            logger.info("  Email: {}", saved.getEmail());
            logger.info("  Empresa: {}", saved.getNombreEmpresa());

            return ResponseEntity.ok(Map.of(
                    "message", "Conductor registrado correctamente",
                    "conductorId", saved.getId(),
                    "nombreEmpresa", saved.getNombreEmpresa() != null ? saved.getNombreEmpresa() : ""));
        } catch (Exception e) {
            logger.error("Error en registro de conductor: ", e);
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "Error interno del servidor: " + e.getMessage()));
        }
    }

    /**
     * Login/Registro con Google OAuth.
     * Recibe access_token, consulta userinfo de Google, busca o crea usuario.
     */
    @PostMapping("/google")
    public ResponseEntity<?> loginWithGoogle(@RequestBody Map<String, String> payload) {
        logger.info("═══ LOGIN GOOGLE ═══");

        String accessToken = payload.get("accessToken");
        if (accessToken == null || accessToken.trim().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Token de Google es obligatorio"));
        }

        try {
            // Obtener info del usuario con el access_token
            URL url = new URL("https://www.googleapis.com/oauth2/v3/userinfo");
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setRequestProperty("Authorization", "Bearer " + accessToken);

            int responseCode = conn.getResponseCode();
            if (responseCode != 200) {
                logger.warn("Token de Google inválido, código: {}", responseCode);
                return ResponseEntity.status(401).body(Map.of("error", "Token de Google inválido"));
            }

            // Leer respuesta
            BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line);
            }
            reader.close();

            // Parsear JSON manualmente (sin dependencias extra)
            String json = sb.toString();
            String email = extractJsonField(json, "email");
            String name = extractJsonField(json, "name");
            String googleId = extractJsonField(json, "sub");
            String picture = extractJsonField(json, "picture");

            if (email == null || googleId == null) {
                logger.error("No se pudo extraer email/sub del token de Google");
                return ResponseEntity.status(401).body(Map.of("error", "Token de Google incompleto"));
            }

            logger.info("Google auth para: {}", email);

            // Buscar usuario existente por googleId o email
            Optional<Usuario> existingUser = usuarioRepository.findByGoogleId(googleId);
            if (existingUser.isEmpty()) {
                existingUser = usuarioRepository.findByEmail(email);
            }

            Usuario usuario;
            if (existingUser.isPresent()) {
                usuario = existingUser.get();
                // Vincular googleId si no lo tenía
                if (usuario.getGoogleId() == null) {
                    usuario.setGoogleId(googleId);
                    usuarioRepository.save(usuario);
                }
                logger.info("✓ Usuario existente encontrado: {}", usuario.getId());
            } else {
                // Crear nuevo usuario
                usuario = new Usuario();
                usuario.setEmail(email);
                usuario.setPassword(passwordEncoder.encode(UUID.randomUUID().toString()));
                usuario.setNombre(name != null ? name : email.split("@")[0]);
                usuario.setRole("ADMIN");
                usuario.setGoogleId(googleId);
                usuario = usuarioRepository.save(usuario);
                logger.info("✓ Nuevo usuario creado via Google: {}", usuario.getId());
            }

            Map<String, Object> response = new HashMap<>();
            response.put("id", usuario.getId());
            response.put("email", usuario.getEmail());
            response.put("nombre", usuario.getNombre());
            response.put("nombreEmpresa", usuario.getNombreEmpresa());
            response.put("role", "ADMIN");
            response.put("empresaId", null);
            response.put("token", jwtUtil.generateToken(usuario.getId(), "ADMIN"));
            if (picture != null) response.put("picture", picture);

            return ResponseEntity.ok(response);

        } catch (Exception e) {
            logger.error("Error en login con Google: ", e);
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "Error al verificar con Google: " + e.getMessage()));
        }
    }

    /**
     * Login/Registro con Google OAuth para CONDUCTORES.
     * Recibe access_token + empresaEmail (solo en registro).
     * - Si el conductor ya existe (por googleId o email) → login directo.
     * - Si no existe → crea nuevo conductor vinculado a la empresa.
     */
    @PostMapping("/google/conductor")
    public ResponseEntity<?> loginConductorWithGoogle(@RequestBody Map<String, String> payload) {
        logger.info("═══ LOGIN GOOGLE CONDUCTOR ═══");

        String accessToken = payload.get("accessToken");
        String idToken = payload.get("idToken");
        String empresaEmail = payload.get("empresaEmail");

        if ((accessToken == null || accessToken.trim().isEmpty()) &&
            (idToken == null || idToken.trim().isEmpty())) {
            return ResponseEntity.badRequest().body(Map.of("error", "Token de Google es obligatorio"));
        }

        try {
            String json;
            // idToken (Google Sign-In nativo Android) → tokeninfo endpoint
            // accessToken (flujo web) → userinfo endpoint
            if (idToken != null && !idToken.trim().isEmpty()) {
                URL url = new URL("https://oauth2.googleapis.com/tokeninfo?id_token=" + idToken.trim());
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("GET");
                int responseCode = conn.getResponseCode();
                if (responseCode != 200) {
                    return ResponseEntity.status(401).body(Map.of("error", "ID Token de Google inválido"));
                }
                BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) sb.append(line);
                reader.close();
                json = sb.toString();
            } else {
                URL url = new URL("https://www.googleapis.com/oauth2/v3/userinfo");
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("GET");
                conn.setRequestProperty("Authorization", "Bearer " + accessToken);
                int responseCode = conn.getResponseCode();
                if (responseCode != 200) {
                    return ResponseEntity.status(401).body(Map.of("error", "Token de Google inválido"));
                }
                BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) sb.append(line);
                reader.close();
                json = sb.toString();
            }

            String email = extractJsonField(json, "email");
            String name = extractJsonField(json, "name");
            String googleId = extractJsonField(json, "sub");
            String picture = extractJsonField(json, "picture");

            if (email == null || googleId == null) {
                return ResponseEntity.status(401).body(Map.of("error", "Token de Google incompleto"));
            }

            logger.info("Google conductor auth para: {}", email);

            // Buscar conductor existente
            Optional<Conductor> existing = conductorRepository.findByGoogleId(googleId);
            if (existing.isEmpty()) {
                existing = conductorRepository.findByEmail(email);
            }

            Conductor conductor;

            if (existing.isPresent()) {
                // LOGIN: conductor ya existe
                conductor = existing.get();
                if (!conductor.isActivo()) {
                    return ResponseEntity.status(403).body(Map.of("error", "Tu cuenta ha sido desactivada. Contacta a tu empresa."));
                }
                if (conductor.getGoogleId() == null) {
                    conductor.setGoogleId(googleId);
                    conductorRepository.save(conductor);
                }
                logger.info("✓ Conductor existente logueado via Google: {}", conductor.getId());
            } else {
                // REGISTRO: crear nuevo conductor — necesita empresaEmail
                if (empresaEmail == null || empresaEmail.trim().isEmpty()) {
                    return ResponseEntity.badRequest().body(Map.of(
                        "error", "NEEDS_EMPRESA_EMAIL",
                        "message", "Primera vez con esta cuenta. Introduce el email de tu empresa para vincularte."
                    ));
                }

                String empresaEmailClean = empresaEmail.trim().toLowerCase();
                Optional<Usuario> adminOpt = usuarioRepository.findByEmail(empresaEmailClean);
                if (adminOpt.isEmpty()) {
                    return ResponseEntity.badRequest().body(Map.of("error", "No existe ninguna empresa con ese email"));
                }

                Usuario admin = adminOpt.get();
                conductor = new Conductor();
                conductor.setEmail(email);
                conductor.setPassword(passwordEncoder.encode(UUID.randomUUID().toString()));
                conductor.setNombre(name != null ? name : email.split("@")[0]);
                conductor.setGoogleId(googleId);
                conductor.setEmpresaId(admin.getId());
                conductor.setNombreEmpresa(admin.getNombreEmpresa());
                conductor.setActivo(true);
                conductor = conductorRepository.save(conductor);
                logger.info("✓ Nuevo conductor creado via Google: {}", conductor.getId());
            }

            Map<String, Object> response = new HashMap<>();
            response.put("id", conductor.getId());
            response.put("email", conductor.getEmail());
            response.put("nombre", conductor.getNombre());
            response.put("nombreEmpresa", conductor.getNombreEmpresa());
            response.put("role", "CONDUCTOR");
            response.put("empresaId", conductor.getEmpresaId());
            // Token subject = empresaId (multi-tenant) + conductorId claim para filtrar rutas
            response.put("token", jwtUtil.generateToken(conductor.getEmpresaId(), "CONDUCTOR", conductor.getId()));
            if (picture != null) response.put("picture", picture);

            return ResponseEntity.ok(response);

        } catch (Exception e) {
            logger.error("Error en Google login conductor: ", e);
            return ResponseEntity.internalServerError().body(Map.of("error", "Error al verificar con Google: " + e.getMessage()));
        }
    }

    private String extractJsonField(String json, String field) {
        String key = "\"" + field + "\"";
        int idx = json.indexOf(key);
        if (idx == -1) return null;
        int colonIdx = json.indexOf(":", idx);
        if (colonIdx == -1) return null;
        int startQuote = json.indexOf("\"", colonIdx + 1);
        if (startQuote == -1) return null;
        int endQuote = json.indexOf("\"", startQuote + 1);
        if (endQuote == -1) return null;
        return json.substring(startQuote + 1, endQuote);
    }

    /**
     * Login de conductores (Android).
     * Busca en colección: conductores
     */
    @PostMapping("/login/conductor")
    public ResponseEntity<?> loginConductor(@RequestBody Map<String, String> credentials) {
        logger.info("═══ LOGIN CONDUCTOR ═══");

        String email = credentials.get("email");
        String password = credentials.get("password");

        if (email == null || password == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "Email y contraseña son obligatorios"));
        }

        email = email.trim().toLowerCase();
        logger.info("Buscando conductor: {}", email);

        Optional<Conductor> conductorOpt = conductorRepository.findByEmail(email);

        if (conductorOpt.isEmpty()) {
            logger.warn("Conductor no encontrado: {}", email);
            return ResponseEntity.status(401).body(Map.of("error", "Credenciales inválidas"));
        }

        Conductor conductor = conductorOpt.get();

        // Verificar si está activo
        if (!conductor.isActivo()) {
            logger.warn("Conductor desactivado: {}", email);
            return ResponseEntity.status(403)
                    .body(Map.of("error", "Tu cuenta ha sido desactivada. Contacta a tu empresa."));
        }

        if (passwordEncoder.matches(password, conductor.getPassword())) {
            logger.info("✓ Login conductor exitoso: {}", email);

            Map<String, Object> response = new HashMap<>();
            response.put("id", conductor.getId());
            response.put("email", conductor.getEmail());
            response.put("nombre", conductor.getNombre());
            response.put("nombreEmpresa", conductor.getNombreEmpresa());
            response.put("role", "CONDUCTOR");
            response.put("empresaId", conductor.getEmpresaId());
            response.put("token", jwtUtil.generateToken(conductor.getEmpresaId(), "CONDUCTOR", conductor.getId()));

            return ResponseEntity.ok(response);
        } else {
            logger.warn("Contraseña incorrecta para conductor: {}", email);
            return ResponseEntity.status(401).body(Map.of("error", "Credenciales inválidas"));
        }
    }
}
