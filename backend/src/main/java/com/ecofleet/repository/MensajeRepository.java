package com.ecofleet.repository;

import com.ecofleet.model.Mensaje;
import org.springframework.data.mongodb.repository.MongoRepository;
import java.util.List;

public interface MensajeRepository extends MongoRepository<Mensaje, String> {
    List<Mensaje> findByUsuarioId(String usuarioId);
    List<Mensaje> findByRutaIdOrderByTimestampAsc(String rutaId);
    List<Mensaje> findByRutaIdAndConductorIdOrderByTimestampAsc(String rutaId, String conductorId);
}
