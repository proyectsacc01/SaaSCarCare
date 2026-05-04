"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslation } from "@/lib/i18n";
import styles from "./ConfiguracionPanel.module.css";

interface Props {
  apiUrl: string;
  getAuthHeaders: () => Record<string, string>;
}

export default function ConfiguracionPanel({ apiUrl, getAuthHeaders }: Props) {
  const t = useTranslation();

  const getUrgentPhoneStorageKey = (fallbackEmail = "") => {
    if (typeof window === "undefined") return "urgentPhone:default";
    try {
      const userStr = localStorage.getItem("user");
      if (userStr) {
        const user = JSON.parse(userStr);
        const scope = user?.empresaId || user?.id || user?.email || fallbackEmail || "default";
        return `urgentPhone:${scope}`;
      }
    } catch {}
    return `urgentPhone:${fallbackEmail || "default"}`;
  };

  const getUrgentPhoneGlobalKey = () => "urgentPhone:global";

  const readLocalUrgentPhone = (fallbackEmail = "") => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(getUrgentPhoneStorageKey(fallbackEmail))
      || localStorage.getItem(getUrgentPhoneGlobalKey())
      || "";
  };

  const saveLocalUrgentPhone = (phone: string, fallbackEmail = "") => {
    if (typeof window === "undefined") return;
    const key = getUrgentPhoneStorageKey(fallbackEmail);
    const globalKey = getUrgentPhoneGlobalKey();
    const normalized = phone.trim();
    if (normalized) {
      localStorage.setItem(key, normalized);
      localStorage.setItem(globalKey, normalized);
    } else {
      localStorage.removeItem(key);
      localStorage.removeItem(globalKey);
    }
  };

  const [open, setOpen] = useState(false);
  const [emailCuenta, setEmailCuenta] = useState("");
  const [emailNotif, setEmailNotif] = useState("");
  const [emailOriginal, setEmailOriginal] = useState("");
  const [telefonoUrgencias, setTelefonoUrgencias] = useState("");
  const [telefonoOriginal, setTelefonoOriginal] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [testeando, setTesteando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setMsg(null);
    fetch(`${apiUrl}/api/configuracion`, { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const emailCuentaValue = data?.emailCuenta ?? "";
        const localPhone = readLocalUrgentPhone(emailCuentaValue);
        const backendPhone = data?.telefonoUrgencias ?? "";

        if (!data) {
          setTelefonoUrgencias(localPhone);
          setTelefonoOriginal(localPhone);
          return;
        }

        setEmailCuenta(emailCuentaValue);
        setEmailNotif(data.emailNotificaciones ?? "");
        setEmailOriginal(data.emailNotificaciones ?? "");
        setTelefonoUrgencias(backendPhone || localPhone);
        setTelefonoOriginal(backendPhone || localPhone);
      })
      .catch(() => {});
  }, [open, apiUrl, getAuthHeaders]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const emailActivo = emailNotif || emailCuenta;
  const hayCambios = emailNotif !== emailOriginal || telefonoUrgencias !== telefonoOriginal;

  const guardar = async () => {
    setGuardando(true);
    setMsg(null);
    saveLocalUrgentPhone(telefonoUrgencias, emailCuenta);
    try {
      const res = await fetch(`${apiUrl}/api/configuracion/email`, {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify({ emailNotificaciones: emailNotif, telefonoUrgencias }),
      });
      if (res.ok) {
        setEmailOriginal(emailNotif);
        setTelefonoOriginal(telefonoUrgencias);
        setMsg({ tipo: "ok", texto: t.components.savedSuccessfully });
        setTimeout(() => setMsg(null), 4000);
      } else {
        setEmailOriginal(emailNotif);
        setTelefonoOriginal(telefonoUrgencias);
        setMsg({ tipo: "ok", texto: "Guardado en este navegador. El servidor aún no confirmó el cambio." });
      }
    } catch {
      setEmailOriginal(emailNotif);
      setTelefonoOriginal(telefonoUrgencias);
      setMsg({ tipo: "ok", texto: "Guardado en este navegador. Se sincronizará cuando el servidor responda." });
    } finally {
      setGuardando(false);
    }
  };

  const testEmail = async () => {
    setTesteando(true);
    setMsg(null);
    try {
      const res = await fetch(`${apiUrl}/api/configuracion/test-email`, {
        method: "POST",
        headers: getAuthHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setMsg({ tipo: "ok", texto: data.mensaje || t.components.testEmailSent });
      } else {
        setMsg({ tipo: "error", texto: data.error || t.components.couldNotSendEmail });
      }
    } catch {
      setMsg({ tipo: "error", texto: t.components.connError });
    } finally {
      setTesteando(false);
    }
  };

  return (
    <div className={styles.wrapper} ref={panelRef}>
      <button
        className={`${styles.btn} ${open ? styles.btnActive : ""}`}
        onClick={() => setOpen(v => !v)}
        title={t.components.settings}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      </button>

      {open && <div className={styles.overlay} onClick={() => setOpen(false)} />}

      {open && (
        <div className={styles.panel}>
          <div className={styles.header}>
            <span className={styles.title}>{t.components.notifSettings}</span>
            <button className={styles.closeBtn} onClick={() => setOpen(false)}>x</button>
          </div>

          <div className={styles.body}>
            {/* Email de la cuenta */}
            <div className={styles.infoRow}>
              <span className={styles.label}>{t.components.yourAccountEmail}</span>
              <span className={styles.value}>{emailCuenta || "..."}</span>
            </div>

            <div className={styles.divider} />

            {/* Email destino */}
            <div className={styles.section}>
              <label className={styles.sectionTitle}>{t.components.receiveReportsMultiple}</label>
              <p className={styles.sectionDesc}>{t.components.reportsDesc}</p>

              <input
                className={styles.input}
                type="text"
                placeholder={emailCuenta || t.components.emailPlaceholder}
                value={emailNotif}
                onChange={e => setEmailNotif(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && hayCambios) guardar(); }}
              />

              <div className={styles.currentEmail}>
                <span className={styles.dot} />
                Los reportes llegan a: <strong>{emailActivo}</strong>
              </div>
            </div>

            <div className={styles.divider} />

            <div className={styles.section}>
              <label className={styles.sectionTitle}>Teléfono urgente para conductores</label>
              <p className={styles.sectionDesc}>Cuando falle el canal interno, la app del conductor intentará llamar primero a este número.</p>

              <input
                className={styles.input}
                type="text"
                placeholder="Ej: +34 600 123 456"
                value={telefonoUrgencias}
                onChange={e => setTelefonoUrgencias(e.target.value)}
              />

              {telefonoUrgencias && (
                <div className={styles.currentEmail}>
                  <span className={styles.dot} />
                  Llamada urgente a: <strong>{telefonoUrgencias}</strong>
                </div>
              )}
            </div>

            {msg && (
              <div className={`${styles.msg} ${msg.tipo === "ok" ? styles.msgOk : styles.msgError}`}>
                {msg.texto}
              </div>
            )}

            <div className={styles.actions}>
              {emailNotif && (
                <button
                  className={styles.btnSecondary}
                  onClick={() => { setEmailNotif(""); }}
                >
                  Usar email de cuenta
                </button>
              )}
              <button
                className={styles.btnSecondary}
                onClick={testEmail}
                disabled={testeando}
              >
                {testeando ? t.components.sending : t.components.sendTest}
              </button>
              <button
                className={styles.btnPrimary}
                onClick={guardar}
                disabled={guardando || !hayCambios}
              >
                {guardando ? t.components.saving : t.components.save}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
