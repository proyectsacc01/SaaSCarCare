import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de Privacidad — CarCare Tracker",
  description:
    "Política de privacidad de CarCare Tracker para conductores y empresas: tratamiento de datos personales, ubicación GPS, comunicaciones y derechos del usuario.",
};

const updated = "27 de abril de 2026";

export default function PrivacyPolicyPage() {
  return (
    <main
      style={{
        background: "#0d1117",
        color: "#e2e8f0",
        minHeight: "100vh",
        padding: "3rem 1.5rem",
        fontFamily: "Segoe UI, Roboto, Arial, sans-serif",
        lineHeight: 1.7,
      }}
    >
      <article
        style={{
          maxWidth: "780px",
          margin: "0 auto",
          background: "#0f1923",
          padding: "2.5rem 2rem",
          borderRadius: "16px",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <header style={{ marginBottom: "2rem", borderBottom: "2px solid #3bf63b", paddingBottom: "1rem" }}>
          <a
            href="/conductor"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              color: "#3bf63b",
              fontSize: "0.78rem",
              fontWeight: 700,
              textDecoration: "none",
              marginBottom: "1rem",
              opacity: 0.8,
            }}
          >
            ← Volver a la aplicación
          </a>
          <p style={{ color: "#3bf63b", fontWeight: 700, letterSpacing: "2px", fontSize: "0.8rem", textTransform: "uppercase", margin: "0 0 0.5rem" }}>
            ./CarCare Tracker
          </p>
          <h1 style={{ fontSize: "2rem", color: "#fff", margin: "0.5rem 0" }}>Política de Privacidad</h1>
          <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.85rem", margin: 0 }}>Última actualización: {updated}</p>
        </header>

        <Section title="1. Quiénes somos">
          <p>
            CarCare Tracker es una plataforma SaaS de gestión de flotas para empresas. Esta política se aplica al panel
            web, al backend API y a la aplicación Android para conductores. La empresa cliente que contrata CarCare
            actúa como responsable del tratamiento de los datos personales de sus empleados conductores; CarCare actúa
            como encargado del tratamiento.
          </p>
        </Section>

        <Section title="2. Datos que recopilamos">
          <ul>
            <li><strong>Datos de cuenta:</strong> nombre, correo electrónico, empresa asociada y contraseña cifrada.</li>
            <li><strong>Datos de ubicación:</strong> coordenadas GPS, velocidad y precisión durante el tiempo que el conductor tiene una ruta activa. La ubicación NO se recopila fuera de una ruta activa.</li>
            <li><strong>Datos de operación:</strong> rutas planificadas, repostajes, mantenimientos, documentos del vehículo y mensajes intercambiados con la central.</li>
            <li><strong>Datos técnicos:</strong> identificador del dispositivo, sistema operativo y registros de errores con fines de diagnóstico.</li>
          </ul>
        </Section>

        <Section title="3. Finalidad del tratamiento">
          <ul>
            <li>Prestar el servicio de gestión y rastreo de flota contratado por la empresa.</li>
            <li>Calcular distancias recorridas, consumo, tiempos estimados y desvíos de ruta.</li>
            <li>Permitir la comunicación entre el conductor y la central durante la ruta.</li>
            <li>Generar reportes operativos para la empresa contratante.</li>
            <li>Mantener la seguridad del servicio (detección de accesos indebidos).</li>
          </ul>
        </Section>

        <Section title="4. Permisos de la app Android">
          <ul>
            <li><strong>Ubicación precisa (foreground service):</strong> requerida para enviar la posición GPS al servidor mientras hay una ruta activa. La app muestra una notificación persistente durante el rastreo.</li>
            <li><strong>Notificaciones:</strong> para mostrar el estado del rastreo y avisos de la central.</li>
            <li><strong>Internet y estado de red:</strong> para sincronizar con el servidor.</li>
          </ul>
          <p>
            La app NO accede a contactos, cámara, micrófono, archivos personales, calendario ni historial de navegación.
            La ubicación se transmite cifrada en HTTPS exclusivamente al backend de CarCare.
          </p>
        </Section>

        <Section title="5. Base legal (RGPD / GDPR)">
          <p>
            El tratamiento se basa en (a) la ejecución del contrato laboral entre el conductor y su empresa empleadora,
            (b) el interés legítimo de la empresa en gestionar y optimizar su flota, y (c) el cumplimiento de
            obligaciones legales en materia de transporte y conservación de registros.
          </p>
        </Section>

        <Section title="6. Conservación de datos">
          <p>
            Los datos de ubicación se conservan durante el periodo operativo necesario para el cumplimiento del
            servicio (habitualmente 12 meses) y posteriormente se anonimizan o se eliminan. Los datos de cuenta y de
            operación se conservan mientras exista la relación contractual con la empresa.
          </p>
        </Section>

        <Section title="7. Compartición con terceros">
          <p>Los datos personales NO se venden ni se ceden a terceros con fines publicitarios. Únicamente se comparten con:</p>
          <ul>
            <li>Proveedores de infraestructura cloud (Railway, MongoDB Atlas) bajo acuerdos de confidencialidad.</li>
            <li>Proveedores de geocodificación de direcciones (Nominatim/OpenStreetMap) — solo direcciones de origen y destino, nunca trayectos completos.</li>
            <li>Autoridades competentes cuando exista requerimiento legal.</li>
          </ul>
        </Section>

        <Section title="8. Derechos del usuario">
          <p>Como conductor, tienes derecho a:</p>
          <ul>
            <li>Acceder a tus datos personales y solicitar una copia de los mismos.</li>
            <li>Rectificar datos inexactos o incompletos.</li>
            <li>Solicitar la supresión de tus datos cuando ya no sean necesarios.</li>
            <li>Oponerte al tratamiento o solicitar la limitación del mismo.</li>
            <li>Portar tus datos a otro responsable.</li>
            <li>Retirar el consentimiento en cualquier momento.</li>
          </ul>
          <p>
            Para ejercer estos derechos, debes dirigirte en primera instancia a tu empresa empleadora (responsable
            del tratamiento) o, en su defecto, contactar con nosotros en la dirección indicada al final.
          </p>
          <p>
            Asimismo, tienes derecho a presentar una reclamación ante la Agencia Española de Protección de Datos
            (AEPD,{" "}
            <a href="https://www.aepd.es" target="_blank" rel="noopener noreferrer" style={{ color: "#3bf63b" }}>
              www.aepd.es
            </a>
            ) si consideras que el tratamiento de tus datos no se ajusta a la normativa.
          </p>
        </Section>

        <Section title="9. Seguridad">
          <p>
            Aplicamos medidas técnicas y organizativas razonables: cifrado en tránsito (HTTPS/TLS), contraseñas con
            hashing bcrypt, autenticación basada en JWT con expiración, separación de datos por empresa
            (multitenant) y registros de auditoría.
          </p>
        </Section>

        <Section title="10. Eliminación de cuenta">
          <p>
            Para eliminar permanentemente una cuenta de conductor o empresa, escribe a la dirección de contacto que
            aparece al final de este documento. La supresión se tramita en un plazo máximo de 30 días e incluye los
            datos de cuenta, las ubicaciones registradas y los mensajes asociados.
          </p>
        </Section>

        <Section title="11. Cambios en esta política">
          <p>
            Podemos actualizar esta política para reflejar cambios legales o de funcionalidad. Las modificaciones se
            publicarán en esta misma URL, indicando la fecha de actualización al inicio del documento. Te
            recomendamos revisarla periódicamente.
          </p>
        </Section>

        <Section title="12. Contacto">
          <p>
            Para cualquier consulta sobre esta política o sobre el tratamiento de tus datos personales, puedes escribir a{" "}
            <a href="mailto:elenarodriguez0097@gmail.com" style={{ color: "#3bf63b" }}>
              elenarodriguez0097@gmail.com
            </a>
            .
          </p>
        </Section>
      </article>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: "2rem" }}>
      <h2 style={{ fontSize: "1.15rem", color: "#3bf63b", fontWeight: 700, marginBottom: "0.6rem" }}>{title}</h2>
      <div style={{ color: "rgba(255,255,255,0.78)", fontSize: "0.95rem" }}>{children}</div>
    </section>
  );
}
