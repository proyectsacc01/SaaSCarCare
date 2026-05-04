package com.ecofleet.model;

import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

@Data
@Document(collection = "configuracion_email")
public class ConfiguracionEmail {
    @Id
    private String id;

    private String empresaId;

    // Email where reports are sent (if null, uses account email)
    private String emailNotificaciones;

    // Teléfono urgente de la central / empresa para conductores.
    private String telefonoUrgencias;
}
