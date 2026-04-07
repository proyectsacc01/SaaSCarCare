const fs = require('fs');

const run = (file) => {
    let content = fs.readFileSync(file, 'utf-8');

    // Add useTranslation
    if (!content.includes('useTranslation')) {
        content = content.replace(/(import .*? \r?\n)+/, '$&\nimport { useTranslation } from "@/lib/i18n";\n');
        content = content.replace(/export default function [a-zA-Z_0-9]+\(\) \{/, '$&\n  const t = useTranslation();');
    }

    // common replacements (simple strings inside JSX)
    const map = {
        'Cargando...': '{t.common.loading}',
        'Vehículo no encontrado': '{t.vehicle.notFound}',
        '← Volver al Dashboard': '← {t.vehicle.backToDashboard}',
        '✏️ Editar vehículo': '✏️ {t.vehicle.editVehicle}',
        'Resumen del Vehículo': '{t.vehicle.summary}',
        'Kilometraje': '{t.metrics.mileage}',
        'Combustible': '{t.metrics.fuel}',
        'Coste Combustible': '{t.metrics.fuelCost}',
        'Coste Mantenimiento': '{t.metrics.maintenanceCost}',
        'Coste Total Acumulado': '{t.metrics.totalAccumulated}',
        'Coste \/ km': '{t.metrics.costPerKm}',
        'Consumo real': '{t.metrics.realConsumption}',
        'sin datos odómetro': '{t.metrics.noOdometerData}',
        // maintenance
        'Mantenimientos': '{t.tabs.maintenance}',
        'Repostajes': '{t.tabs.refueling}',
        'Documentos': '{t.tabs.documents}',
        'Programaciones': '{t.tabs.schedules}',
        'Editar': '{t.tabs.edit}',
        // ruta
        'Telemetría Real': 'Telemetría Real', // todo
    };

    for (const [key, value] of Object.entries(map)) {
        content = content.replace(new RegExp(key, 'g'), value);
    }
    
    // There are issues where I replaced {t.metrics.mileage} in places that were not JSX {}
    // like `const tip = "Kilometraje"` -> `const tip = "{t.metrics.mileage}"` 
    // This script is too error prone.
    
    fs.writeFileSync(file, content);
}
// run('app/vehiculo/[id]/page.tsx');
