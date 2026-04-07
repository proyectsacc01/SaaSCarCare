const fs = require('fs');

const file = 'c:/Users/Usuario/Documents/SaaS-CarCare/frontend/app/vehiculo/[id]/page.tsx';
let content = fs.readFileSync(file, 'utf8');

// The map(t => shadowing bug
content = content.replace(/TIPOS_DOCUMENTO\(t\)\.map\(t =>/g, 'TIPOS_DOCUMENTO(t).map(tipo =>');
content = content.replace(/<option key={t\.value} value={t\.value}>{t\.label}<\/option>/g, '<option key={tipo.value} value={tipo.value}>{tipo.label}</option>');

// t.vehicle -> t.documents
content = content.replace(/t\.vehicle\.newDocument/g, 't.documents.newDocument');
content = content.replace(/t\.vehicle\.registerDocument/g, 't.documents.registerDocument');
content = content.replace(/t\.vehicle\.refNumber/g, 't.documents.referenceNumber');
content = content.replace(/t\.vehicle\.issueDate/g, 't.documents.issueDate');
content = content.replace(/t\.vehicle\.expirationDate/g, 't.documents.expirationDate');
content = content.replace(/t\.vehicle\.saveDocument/g, 't.documents.saveDocument');
content = content.replace(/t\.vehicle\.vehicleDocuments/g, 't.documents.vehicleDocuments');
content = content.replace(/t\.vehicle\.noDocuments(?!Desc)/g, 't.documents.noDocuments');
content = content.replace(/t\.vehicle\.noDocumentsDesc/g, 't.documents.noDocumentsDesc');

// t.vehicle -> t.schedules
content = content.replace(/t\.vehicle\.newSchedule/g, 't.schedules.newSchedule');
content = content.replace(/t\.vehicle\.newMaintenanceSchedule/g, 't.schedules.createSchedule');
content = content.replace(/t\.vehicle\.intervalType/g, 't.schedules.intervalType');
content = content.replace(/t\.vehicle\.byKilometers/g, 't.schedules.byKm');
content = content.replace(/t\.vehicle\.byTime/g, 't.schedules.byTime');
content = content.replace(/t\.vehicle\.bothIntervals/g, 't.schedules.both');
content = content.replace(/t\.vehicle\.intervalKm/g, 't.schedules.intervalKm');
content = content.replace(/t\.vehicle\.intervalMonths/g, 't.schedules.intervalMonths');
content = content.replace(/t\.vehicle\.lastDoneDate/g, 't.schedules.lastPerformedDate');
content = content.replace(/t\.vehicle\.todayIfEmpty/g, 't.schedules.lastPerformedDateHint');
content = content.replace(/t\.vehicle\.createSchedule/g, 't.schedules.saveSchedule');
content = content.replace(/t\.vehicle\.maintenanceSchedules/g, 't.schedules.maintenanceSchedules');
content = content.replace(/t\.vehicle\.markAsDone/g, 't.schedules.markDone');
content = content.replace(/t\.vehicle\.nextDate/g, 't.schedules.nextDate');
content = content.replace(/t\.vehicle\.days/g, 't.schedules.days');
content = content.replace(/t\.vehicle\.noSchedules(?!Desc)/g, 't.schedules.noSchedules');
content = content.replace(/t\.vehicle\.noSchedulesDesc/g, 't.schedules.noSchedulesDesc');
content = content.replace(/t\.vehicle\.expired/g, 't.documents.expiredAgo');
content = content.replace(/t\.vehicle\.expiresIn/g, 't.documents.expiresIn');
content = content.replace(/t\.vehicle\.valid/g, 't.documents.valid');

// t.common -> t.schedules
content = content.replace(/t\.common\.nextAt/g, 't.schedules.nextAt');
content = content.replace(/t\.common\.remaining/g, 't.schedules.remaining');
content = content.replace(/t\.common\.passedBy/g, 't.schedules.overdue');

fs.writeFileSync(file, content);
console.log('Fixed page.tsx bindings!');
