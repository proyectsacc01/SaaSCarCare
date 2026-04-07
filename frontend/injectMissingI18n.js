const fs = require('fs');
const path = require('path');

const missingTranslations = {
  fr: {
    documents: {
      newDocument: "📄 Nouveau Document",
      registerDocument: "Enregistrer Document",
      saveDocument: "Enregistrer Document",
      vehicleDocuments: "Documents du Véhicule",
      noDocuments: "Aucun document enregistré",
      noDocumentsDesc: "Enregistrez le contrôle technique, les assurances et autres documents pour recevoir des alertes d'expiration.",
      documentType: "Type de Document",
      referenceNumber: "Nº de Référence",
      description: "Description",
      issueDate: "Date d'Émission",
      expirationDate: "Date d'Expiration",
      notes: "Notes",
      valid: "Valide",
      expiresIn: "Expire dans",
      expiredAgo: "Expiré il y a",
      days: "j",
      upcoming: "Bientôt expiré",
      expired: "Expirés",
      itv: "Contrôle technique",
      insurance: "Assurance",
      circulation: "Permis de Circulation",
      transport: "Carte de Transport",
      other: "Autre",
      documentRegistered: "Document enregistré",
      documentDeleted: "Document supprimé",
    },
    schedules: {
      newSchedule: "📅 Nouvelle Planification",
      createSchedule: "Nouvelle Planification de Maintenance",
      saveSchedule: "Créer Planification",
      maintenanceSchedules: "Planifications de Maintenance",
      noSchedules: "Aucune planification",
      noSchedulesDesc: "Planifiez des vidanges d'huile, des révisions et plus pour recevoir des alertes.",
      name: "Nom",
      description: "Description",
      intervalType: "Type d'Intervalle",
      byKm: "Par Kilomètres",
      byTime: "Par Temps",
      both: "Les deux (le premier)",
      intervalKm: "Intervalle en Km",
      intervalMonths: "Intervalle en Mois",
      lastPerformedDate: "Dernière date",
      lastPerformedDateHint: "optionnel — si non indiqué, aujourd'hui est utilisé",
      nextAt: "Prochain à",
      nextDate: "Prochaine date",
      remaining: "Reste",
      overdue: "En retard de",
      km: "km",
      days: "jours",
      months: "mois",
      markDone: "Marquer comme fait",
      markedDone: "Maintenance marquée comme faite",
      scheduleCreated: "Planification créée",
      scheduleDeleted: "Planification supprimée",
      activePlural: "Actives",
      byKmLabel: "Par Km",
      byTimeLabel: "Par Temps",
      total: "Total",
      upcoming: "Prochain",
      inactive: "Inactif",
    }
  },
  pt: {
    documents: {
      newDocument: "📄 Novo Documento",
      registerDocument: "Registar Documento",
      saveDocument: "Guardar Documento",
      vehicleDocuments: "Documentos do Veículo",
      noDocuments: "Sem documentos registados",
      noDocumentsDesc: "Registe inspeções, seguros e outros documentos para receber alertas de validade.",
      documentType: "Tipo de Documento",
      referenceNumber: "Nº de Referência",
      description: "Descrição",
      issueDate: "Data de Emissão",
      expirationDate: "Data de Validade",
      notes: "Notas",
      valid: "Válido",
      expiresIn: "Expira em",
      expiredAgo: "Expirou há",
      days: "d",
      upcoming: "A expirar",
      expired: "Expirados",
      itv: "Inspeção",
      insurance: "Seguro",
      circulation: "Livrete",
      transport: "Cartão de Transporte",
      other: "Outro",
      documentRegistered: "Documento registado",
      documentDeleted: "Documento eliminado",
    },
    schedules: {
      newSchedule: "📅 Nova Programação",
      createSchedule: "Nova Programação de Manutenção",
      saveSchedule: "Criar Programação",
      maintenanceSchedules: "Programações de Manutenção",
      noSchedules: "Sem programações de manutenção",
      noSchedulesDesc: "Programe mudanças de óleo, revisões e mais para receber alertas automáticos.",
      name: "Nome",
      description: "Descrição",
      intervalType: "Tipo de Intervalo",
      byKm: "Por Quilómetros",
      byTime: "Por Tempo",
      both: "Ambos (o primeiro a chegar)",
      intervalKm: "Intervalo em Km",
      intervalMonths: "Intervalo em Meses",
      lastPerformedDate: "Última data realizado",
      lastPerformedDateHint: "opcional — se não indicado, usamos hoje",
      nextAt: "Próximo aos",
      nextDate: "Próxima data",
      remaining: "Faltam",
      overdue: "Atrasado",
      km: "km",
      days: "dias",
      months: "meses",
      markDone: "Marcar como feito",
      markedDone: "Manutenção marcada como concluída",
      scheduleCreated: "Programação criada",
      scheduleDeleted: "Programação eliminada",
      activePlural: "Ativas",
      byKmLabel: "Por Km",
      byTimeLabel: "Por Tempo",
      total: "Total",
      upcoming: "Próximo",
      inactive: "Inativo",
    }
  }
};

const i18nDir = 'c:/Users/Usuario/Documents/SaaS-CarCare/frontend/lib/i18n';

for (const lang of Object.keys(missingTranslations)) {
    const filePath = path.join(i18nDir, `${lang}.ts`);
    if (fs.existsSync(filePath)) {
        let content = fs.readFileSync(filePath, 'utf8');
        let blockStr = '';
        
        for (const category of ['documents', 'schedules']) {
          blockStr += `  ${category}: {\n`;
          for (const [key, value] of Object.entries(missingTranslations[lang][category])) {
              blockStr += `    ${key}: "${value.replace(/"/g, '\\"')}",\n`;
          }
          blockStr += `  },\n\n`;
        }
        
        // Find `} as const;` and insert right before it.
        content = content.replace(/}(?=\s*as const;)/, `${blockStr}}`);
        
        fs.writeFileSync(filePath, content);
        console.log(`Updated ${lang}.ts with missing documents and schedules.`);
    }
}
