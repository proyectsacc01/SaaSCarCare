package com.ecofleet.repository;

import com.ecofleet.model.Repostaje;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface RepostajeRepository extends MongoRepository<Repostaje, String> {
    List<Repostaje> findByVehiculoId(String vehiculoId);
    List<Repostaje> findByVehiculoIdIn(List<String> vehiculoIds);
}
