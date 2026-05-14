package com.ecofleet.model;

import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.LocalDateTime;

@Data
@Document(collection = "ai_chat_messages")
public class AiChatMessage {
    @Id
    private String id;
    private String empresaId;
    private String conductorId;
    private String rutaId;
    private String remitente; // CONDUCTOR | AI
    private String contenido;
    private boolean escaladoACentral;
    private String severidadEscalada; // INFO | WARNING | CRITICAL
    private LocalDateTime timestamp = LocalDateTime.now();
}
