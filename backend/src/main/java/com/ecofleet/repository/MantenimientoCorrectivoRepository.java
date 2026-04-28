package com.ecofleet.repository;

import com.ecofleet.model.MantenimientoCorrectivo;
import org.springframework.data.mongodb.repository.MongoRepository;
import java.util.List;

public interface MantenimientoCorrectivoRepository extends MongoRepository<MantenimientoCorrectivo, String> {
    List<MantenimientoCorrectivo> findByVehiculoIdOrderByFechaDesc(String vehiculoId);
    List<MantenimientoCorrectivo> findByVehiculoIdIn(List<String> vehiculoIds);
}
