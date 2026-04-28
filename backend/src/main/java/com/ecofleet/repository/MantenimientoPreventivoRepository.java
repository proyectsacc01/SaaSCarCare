package com.ecofleet.repository;

import com.ecofleet.model.MantenimientoPreventivo;
import org.springframework.data.mongodb.repository.MongoRepository;
import java.util.List;

public interface MantenimientoPreventivoRepository extends MongoRepository<MantenimientoPreventivo, String> {
    List<MantenimientoPreventivo> findByVehiculoIdOrderByFechaDesc(String vehiculoId);
    List<MantenimientoPreventivo> findByVehiculoIdIn(List<String> vehiculoIds);
}
