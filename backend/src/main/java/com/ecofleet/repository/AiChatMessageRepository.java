package com.ecofleet.repository;

import com.ecofleet.model.AiChatMessage;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;

public interface AiChatMessageRepository extends MongoRepository<AiChatMessage, String> {
    List<AiChatMessage> findByEmpresaIdAndConductorIdOrderByTimestampAsc(String empresaId, String conductorId);
}
