package com.ecofleet.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;

@Service
public class GroqChatService {

    private static final Logger log = LoggerFactory.getLogger(GroqChatService.class);

    private static final String SYSTEM_PROMPT = """
            Eres el asistente de conductores de CarCare Tracker.
            Tu rol es SOLO responder dudas generales y operativas de bajo riesgo.
            No inventes datos internos, no digas que hablaste con la central y no prometas acciones humanas.
            Si el conductor describe una emergencia, accidente, avería seria, amenaza, problema médico, inseguridad o una situación que requiera intervención humana, debes marcar escalateToCentral=true.
            Aunque escales, igual responde en tono breve, claro y calmado indicando que avisarás a la central y que, si hay riesgo inmediato, el conductor debe contactar emergencias.
            Devuelve SIEMPRE JSON válido PURO, sin markdown, sin backticks y sin texto extra, con esta forma exacta:
            {
              "answer": "texto para el conductor",
              "escalateToCentral": false,
              "severity": "INFO|WARNING|CRITICAL",
              "reason": "motivo corto"
            }
            """;

    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(15))
            .build();

    private final ObjectMapper objectMapper;

    @Value("${groq.api-key:}")
    private String apiKey;

    @Value("${groq.api-url:https://api.groq.com/openai/v1/chat/completions}")
    private String apiUrl;

    @Value("${groq.model:llama-3.3-70b-versatile}")
    private String model;

    public GroqChatService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public boolean isConfigured() {
        return apiKey != null && !apiKey.isBlank();
    }

    public GroqAiResult responder(List<String> historial, String mensajeUsuario) {
        if (!isConfigured()) {
            throw new IllegalStateException("GROQ_API_KEY no configurada");
        }

        try {
            JsonNode requestBody = buildRequestBody(historial, mensajeUsuario);
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(apiUrl))
                    .header("Authorization", "Bearer " + apiKey)
                    .header("Content-Type", "application/json")
                    .timeout(Duration.ofSeconds(25))
                    .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(requestBody)))
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                log.error("Groq devolvió {}: {}", response.statusCode(), response.body());
                throw new IllegalStateException("Groq devolvió " + response.statusCode() + ": " + response.body());
            }

            return parseResponse(response.body());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("No se pudo consultar Groq", e);
        } catch (IOException e) {
            throw new IllegalStateException("No se pudo consultar Groq", e);
        }
    }

    private JsonNode buildRequestBody(List<String> historial, String mensajeUsuario) {
        var root = objectMapper.createObjectNode();
        root.put("model", model);

        var messages = objectMapper.createArrayNode();
        messages.add(objectMapper.createObjectNode()
                .put("role", "system")
                .put("content", SYSTEM_PROMPT));

        if (historial != null && !historial.isEmpty()) {
            List<String> ultimos = historial.size() > 8
                    ? historial.subList(Math.max(0, historial.size() - 8), historial.size())
                    : historial;
            for (String item : ultimos) {
                String[] parts = item.split("::", 2);
                if (parts.length != 2) continue;
                messages.add(objectMapper.createObjectNode()
                        .put("role", parts[0])
                        .put("content", parts[1]));
            }
        }

        messages.add(objectMapper.createObjectNode()
                .put("role", "user")
                .put("content", mensajeUsuario));
        root.set("messages", messages);

        return root;
    }

    private GroqAiResult parseResponse(String rawBody) throws IOException {
        JsonNode root = objectMapper.readTree(rawBody);
        String content = root.path("choices").path(0).path("message").path("content").asText("");
        if (content.isBlank()) {
            throw new IllegalStateException("Groq respondió sin contenido");
        }

        String cleaned = cleanupJsonCandidate(content);

        try {
            JsonNode payload = objectMapper.readTree(cleaned);
            String answer = payload.path("answer").asText("").trim();
            boolean escalate = payload.path("escalateToCentral").asBoolean(false);
            String severity = normalizeSeverity(payload.path("severity").asText("INFO"));
            String reason = payload.path("reason").asText("").trim();

            if (answer.isBlank()) {
                throw new IllegalStateException("Groq devolvió respuesta vacía");
            }

            return new GroqAiResult(answer, escalate, severity, reason);
        } catch (Exception parseError) {
            log.warn("No se pudo parsear JSON de Groq, usando fallback. Contenido: {}", content);
            return new GroqAiResult(
                    content.replace("```json", "").replace("```", "").trim(),
                    false,
                    "INFO",
                    "fallback_plain_text"
            );
        }
    }

    private String normalizeSeverity(String severity) {
        String normalized = severity == null ? "INFO" : severity.trim().toUpperCase();
        return switch (normalized) {
            case "CRITICAL" -> "CRITICAL";
            case "WARNING" -> "WARNING";
            case "LOW", "INFO", "NORMAL" -> "INFO";
            default -> "INFO";
        };
    }

    private String cleanupJsonCandidate(String raw) {
        String trimmed = raw == null ? "" : raw.trim();
        if (trimmed.startsWith("```")) {
            trimmed = trimmed.replaceFirst("^```(?:json)?\\s*", "");
            trimmed = trimmed.replaceFirst("\\s*```$", "");
        }

        int firstBrace = trimmed.indexOf('{');
        int lastBrace = trimmed.lastIndexOf('}');
        if (firstBrace >= 0 && lastBrace > firstBrace) {
            return trimmed.substring(firstBrace, lastBrace + 1);
        }

        return trimmed;
    }

    public record GroqAiResult(String answer, boolean escalateToCentral, String severity, String reason) {}
}
