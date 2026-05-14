package com.ecofleet.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.regex.Pattern;

@Component
public class JwtFilter extends OncePerRequestFilter {

    @Autowired
    private JwtUtil jwtUtil;

    // Debe coincidir con WebConfig.addCorsMappings. Lo duplicamos acá porque
    // cuando el filtro corta la cadena con 401, el CorsFilter de Spring MVC
    // ya no llega a correr y la respuesta sale sin Access-Control-Allow-Origin.
    // Sin estos headers, el browser convierte el 401 en "TypeError: Failed to
    // fetch" y el frontend no puede ver el status real para redirigir a login.
    private static final Pattern ALLOWED_ORIGIN = Pattern.compile(
            "^(https://[a-zA-Z0-9-]+\\.vercel\\.app" +
            "|http://localhost(:\\d+)?" +
            "|http://10\\.0\\.2\\.2(:\\d+)?" +
            "|capacitor://localhost" +
            "|ionic://localhost" +
            "|file://.*)$"
    );

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {

        // Preflight CORS — el browser manda OPTIONS sin token, dejar pasar siempre
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            chain.doFilter(request, response);
            return;
        }

        String path = request.getRequestURI();

        // Endpoints públicos — no requieren token
        if (path.startsWith("/api/auth/")) {
            chain.doFilter(request, response);
            return;
        }

        // Extraer y validar Bearer token
        String authHeader = request.getHeader("Authorization");
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            String token = authHeader.substring(7);
            if (jwtUtil.isValid(token)) {
                request.setAttribute("userId", jwtUtil.extractTenantId(token));
                request.setAttribute("userRole", jwtUtil.extractRole(token));
                String conductorId = jwtUtil.extractConductorId(token);
                if (conductorId != null) {
                    request.setAttribute("conductorId", conductorId);
                }
            }
        }

        // Endpoints de GPS del Android — exentos hasta que la app Android se actualice
        if (isAndroidGpsEndpoint(path, request.getMethod())) {
            chain.doFilter(request, response);
            return;
        }

        // Todos los demás endpoints /api/ requieren token válido
        if (path.startsWith("/api/") && request.getAttribute("userId") == null) {
            applyCorsHeaders(request, response);
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType("application/json");
            response.getWriter().write("{\"error\": \"Token de autenticación requerido\"}");
            return;
        }

        chain.doFilter(request, response);
    }

    private void applyCorsHeaders(HttpServletRequest request, HttpServletResponse response) {
        String origin = request.getHeader("Origin");
        if (origin != null && ALLOWED_ORIGIN.matcher(origin).matches()) {
            response.setHeader("Access-Control-Allow-Origin", origin);
        } else {
            response.setHeader("Access-Control-Allow-Origin", "*");
        }
        response.setHeader("Vary", "Origin");
        response.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH");
        response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept");
        response.setHeader("Access-Control-Expose-Headers", "Authorization, Content-Type");
    }

    private boolean isAndroidGpsEndpoint(String path, String method) {
        // POST /api/rutas/{id}/gps — envío de GPS desde la app Android nativa
        if ("POST".equals(method) && path.matches("/api/rutas/[^/]+/gps")) return true;
        // GET /api/rutas/{id}/last-location — usada por el bridge JS de Android
        if ("GET".equals(method) && path.matches("/api/rutas/[^/]+/last-location")) return true;
        // POST /api/rutas/{id}/request-gps
        if ("POST".equals(method) && path.matches("/api/rutas/[^/]+/request-gps")) return true;
        return false;
    }
}
