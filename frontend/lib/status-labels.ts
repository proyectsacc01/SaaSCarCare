export type ConnectionStatusKey = "online" | "idle" | "offline";

export function formatRouteStateLabel(estado?: string) {
  const limpio = (estado ?? "").trim().toUpperCase().replace(/\s+/g, "_");

  switch (limpio) {
    case "ENCURSO":
    case "EN_CURSO":
      return "EN CURSO";
    case "DETENIDA":
    case "DETENIDO":
    case "PAUSADA":
    case "PAUSADO":
    case "STOPPED":
      return "DETENIDO";
    case "COMPLETADO":
    case "COMPLETADA":
      return "COMPLETADA";
    case "PLANEADA":
    case "PLANIFICADA":
      return "PLANIFICADA";
    default:
      return limpio ? limpio.replace(/_/g, " ") : "PLANIFICADA";
  }
}

export function formatConnectionStateLabel(status: ConnectionStatusKey) {
  switch (status) {
    case "online":
      return "Conectado";
    case "idle":
      return "Conexión inestable";
    case "offline":
    default:
      return "Desconectado";
  }
}

export function formatDriverAvailabilityLabel(isOnline: boolean) {
  return isOnline ? "En línea" : "Desconectado";
}
