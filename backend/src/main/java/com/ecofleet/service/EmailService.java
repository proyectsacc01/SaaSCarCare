package com.ecofleet.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
public class EmailService {

    private static final Logger log = LoggerFactory.getLogger(EmailService.class);
    private static final String RESEND_URL = "https://api.resend.com/emails";
    private static final Pattern EMAIL_PATTERN = Pattern.compile("^[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}$", Pattern.CASE_INSENSITIVE);
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(15))
            .build();

    @Value("${RESEND_API_KEY:}")
    private String apiKey;

    @Value("${RESEND_FROM_EMAIL:CarCare <onboarding@resend.dev>}")
    private String fromEmail;

    // Workaround para cuando Resend está en modo sandbox (sin dominio verificado).
    // Si el FROM apunta al dominio sandbox de Resend (`onboarding@resend.dev` /
    // `*@resend.dev`), Resend SOLO permite enviar al email registrado como dueño
    // de la cuenta API. Si seteás esta env var con ese email, en modo sandbox
    // todos los destinatarios se redirigen acá y se le añade un banner al HTML
    // indicando el destino original. Sin esta var, el envío falla con el error
    // estándar de Resend y se devuelve un mensaje accionable al usuario.
    @Value("${RESEND_SANDBOX_FALLBACK_EMAIL:}")
    private String sandboxFallbackEmail;

    public boolean isConfigured() {
        return apiKey != null && !apiKey.isBlank();
    }

    private boolean isSandboxFrom() {
        return fromEmail != null && fromEmail.toLowerCase().contains("resend.dev");
    }

    public void enviar(String to, String subject, String html) throws Exception {
        if (!isConfigured()) {
            throw new RuntimeException("Servicio de email no disponible. Contacta al administrador del sistema.");
        }

        List<String> destinatariosOriginales = parseDestinatarios(to);
        List<String> destinatarios = destinatariosOriginales;
        String htmlFinal = html;

        // Si seguimos en sandbox de Resend (sin dominio verificado), redirigimos
        // al email de fallback. Si no hay fallback configurado, dejamos que Resend
        // devuelva su error y traducimos el mensaje en resolveErrorMessage().
        boolean redirigido = false;
        if (isSandboxFrom() && sandboxFallbackEmail != null && !sandboxFallbackEmail.isBlank()) {
            String fallback = sandboxFallbackEmail.trim();
            boolean yaCoincide = destinatariosOriginales.size() == 1
                    && destinatariosOriginales.get(0).equalsIgnoreCase(fallback);
            if (!yaCoincide) {
                destinatarios = List.of(fallback);
                htmlFinal = buildSandboxBanner(destinatariosOriginales) + html;
                redirigido = true;
                log.warn("Resend en modo sandbox — redirigiendo email de [{}] a [{}]",
                        String.join(", ", destinatariosOriginales), fallback);
            }
        }

        String htmlEscaped = escapeJson(htmlFinal).replace("\n", "\\n").replace("\r", "");
        String toJson = destinatarios.stream()
                .map(destino -> "\"" + escapeJson(destino) + "\"")
                .collect(Collectors.joining(","));

        String subjectFinal = redirigido ? "[SANDBOX] " + subject : subject;

        String json = String.format(
                "{\"from\":\"%s\",\"to\":[%s],\"subject\":\"%s\",\"html\":\"%s\"}",
                escapeJson(fromEmail),
                toJson,
                escapeJson(subjectFinal),
                htmlEscaped
        );

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(RESEND_URL))
                .header("Authorization", "Bearer " + apiKey)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(json))
                .timeout(Duration.ofSeconds(15))
                .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        if (response.statusCode() >= 200 && response.statusCode() < 300) {
            log.info("Email enviado exitosamente a {}", String.join(", ", destinatarios));
        } else {
            log.error("Error enviando email ({}): {}", response.statusCode(), response.body());
            throw new RuntimeException(resolveErrorMessage(response.body()));
        }
    }

    public String normalizarDestinatarios(String raw) {
        List<String> destinatarios = parseDestinatarios(raw);
        return destinatarios.isEmpty() ? "" : String.join(", ", destinatarios);
    }

    private List<String> parseDestinatarios(String raw) {
        if (raw == null || raw.isBlank()) {
            return List.of();
        }

        Set<String> destinatarios = new LinkedHashSet<>();
        for (String parte : raw.split("[,;\\n]+")) {
            String email = parte.trim();
            if (email.isEmpty()) {
                continue;
            }
            if (!EMAIL_PATTERN.matcher(email).matches()) {
                throw new IllegalArgumentException("Correo invalido: " + email);
            }
            destinatarios.add(email);
        }

        return List.copyOf(destinatarios);
    }

    private String escapeJson(String value) {
        return value
                .replace("\\", "\\\\")
                .replace("\"", "\\\"");
    }

    private String resolveErrorMessage(String responseBody) {
        String body = responseBody == null ? "" : responseBody;
        if (body.contains("You can only send testing emails to your own email address")) {
            return "Resend esta en modo de prueba (sin dominio verificado). Opciones: "
                    + "(1) verifica tu dominio en https://resend.com/domains y configura RESEND_FROM_EMAIL "
                    + "con un email de ese dominio; o (2) configura la variable RESEND_SANDBOX_FALLBACK_EMAIL "
                    + "en Railway con el email registrado en tu cuenta de Resend — los emails se redirigiran "
                    + "a esa bandeja mientras testeas.";
        }
        if (body.contains("domain is not verified")) {
            return "El dominio configurado para enviar emails no esta verificado en Resend. "
                    + "Verificalo en https://resend.com/domains o usa RESEND_SANDBOX_FALLBACK_EMAIL como fallback.";
        }
        return "No se pudo enviar el email. Intenta de nuevo mas tarde.";
    }

    private String buildSandboxBanner(List<String> destinatariosOriginales) {
        String destinos = String.join(", ", destinatariosOriginales);
        return "<div style=\"background:#fef3c7;border:1px solid #f59e0b;color:#92400e;"
                + "padding:12px 16px;border-radius:8px;margin-bottom:16px;font-family:sans-serif;font-size:14px;\">"
                + "<strong>Modo sandbox de Resend.</strong> "
                + "Este email iba destinado a: <code>" + destinos + "</code>. "
                + "Se redirigio a esta bandeja porque el dominio remitente no esta verificado. "
                + "Verifica tu dominio en https://resend.com/domains para enviar a destinatarios reales."
                + "</div>";
    }
}
