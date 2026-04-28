"use client";

import { useTranslation } from "@/lib/i18n";
import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import styles from "../login/login.module.css";
import CloudflareTurnstile from "@/componentes/CloudflareTurnstile";
import { GoogleOAuthProvider, useGoogleLogin } from "@react-oauth/google";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://saascarcare-production.up.railway.app";

const GoogleIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
);

const CarIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.6-1.1-1-1.9-1H5c-.8 0-1.4.4-1.9 1L1 10l-.6 1c-.6.9-.4 2.1.5 2.6.2.1.5.2.8.2H3v1c0 .6.4 1 1 1h1" />
        <circle cx="7" cy="17" r="2" />
        <circle cx="17" cy="17" r="2" />
    </svg>
);

const EyeIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
    </svg>
);

const EyeOffIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
        <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
);

function GoogleButton({ onSuccess, disabled }: { onSuccess: (resp: { access_token: string }) => void; disabled: boolean }) {
    const login = useGoogleLogin({
        onSuccess,
        onError: () => toast.error("Error al conectar con Google"),
    });

    return (
        <button
            type="button"
            className={styles.googleBtn}
            onClick={() => login()}
            disabled={disabled}
        >
            <GoogleIcon />
            <span>Registrarse con Google</span>
        </button>
    );
}

export default function RegisterPage() {
  const t = useTranslation();

    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [passwordStrength, setPasswordStrength] = useState(0);
    const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
    const [formData, setFormData] = useState({
        nombre: "",
        nombreEmpresa: "",
        email: "",
        password: ""
    });

    const handleTurnstileVerify = useCallback((token: string) => {
        setTurnstileToken(token);
    }, []);

    const handleTurnstileExpire = useCallback(() => {
        setTurnstileToken(null);
    }, []);

    const calculatePasswordStrength = (password: string) => {
        let strength = 0;
        if (password.length >= 6) strength += 20;
        if (password.length >= 10) strength += 20;
        if (/[a-z]/.test(password)) strength += 20;
        if (/[A-Z]/.test(password)) strength += 20;
        if (/[0-9]/.test(password)) strength += 20;
        return strength;
    };

    const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const password = e.target.value;
        setFormData({ ...formData, password });
        setPasswordStrength(calculatePasswordStrength(password));
    };

    const getPasswordStrengthColor = () => {
        if (passwordStrength <= 40) return '#ef4444';
        if (passwordStrength <= 60) return '#f59e0b';
        if (passwordStrength <= 80) return '#eab308';
        return '#22c55e';
    };

    const handleGoogleSuccess = async (tokenResponse: { access_token: string }) => {
        setLoading(true);
        try {
            const res = await fetch(`/api/auth/google`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ accessToken: tokenResponse.access_token })
            });
            const data = await res.json();
            if (res.ok) {
                localStorage.setItem("user", JSON.stringify(data));
                toast.success("¡Cuenta creada con Google!");
                window.dispatchEvent(new Event("storage"));
                router.push("/dashboard");
            } else {
                toast.error(data.error || "Error al registrarse con Google");
            }
        } catch (error) {
            console.error(error);
            toast.error("Error de conexión con el servidor");
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        if (formData.password.length < 6) {
            toast.error("La contraseña debe tener al menos 6 caracteres");
            setLoading(false);
            return;
        }

        try {
            const res = await fetch(`${API_URL}/api/auth/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(formData)
            });

            const data = await res.json();

            if (res.ok) {
                toast.success("¡Cuenta creada! Por favor inicia sesión.");
                router.push("/login");
            } else {
                toast.error(data.error || "Error al registrarse");
            }
        } catch (error) {
            toast.error("Error de conexión");
        } finally {
            setLoading(false);
        }
    };

    const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";

    return (
        <GoogleOAuthProvider clientId={googleClientId}>
        <main className={styles.mainContainer}>
            {/* Visual Panel (Left) */}
            <div className={styles.visualPanel}>
                <div className={styles.bgImageContainer}>
                    <img
                        src="/login-bg.jpg"
                        alt="Fondo"
                        className={styles.bgImage}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                </div>

                <div className={styles.visualContent}>
                    <div className={styles.brandLogo}>
                        <CarIcon />
                        <span>CarCare Tracker</span>
                    </div>

                    <div className={styles.quoteBox}>
                        <h1>Gestión de flotas completa.</h1>
                        <p>Vehículos, rutas, combustible y mantenimiento en una sola plataforma.</p>

                        <div className={styles.statsRow}>
                            <div className={styles.statItem}>
                                <span className={styles.statVal}>6</span>
                                <span className={styles.statLabel}>Módulos</span>
                            </div>
                            <div className={styles.divider} />
                            <div className={styles.statItem}>
                                <span className={styles.statVal}>24/7</span>
                                <span className={styles.statLabel}>Monitorización</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div className={styles.visualPatternRegister} />
            </div>

            {/* Form Panel (Right) */}
            <div className={styles.formPanel}>
                <div className={styles.formContent}>
                    <div className={styles.mobileHeader}>
                        <CarIcon />
                    </div>

                    <div className={styles.header}>
                        <h2 className={styles.title}>Crear Cuenta</h2>
                        <p className={styles.subtitle}>
                            ¿Ya eres cliente? <Link href="/login">Inicia Sesión</Link>
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className={styles.form}>
                        <div className={styles.row}>
                            <div className={styles.inputGroup}>
                                <label htmlFor="nombre">Nombre Completo</label>
                                <input
                                    id="nombre"
                                    type="text"
                                    required
                                    placeholder="Juan Pérez"
                                    value={formData.nombre}
                                    onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                                />
                            </div>
                            <div className={styles.inputGroup}>
                                <label htmlFor="empresa">Empresa</label>
                                <input
                                    id="empresa"
                                    type="text"
                                    placeholder="Transportes SL"
                                    value={formData.nombreEmpresa}
                                    onChange={(e) => setFormData({ ...formData, nombreEmpresa: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className={styles.inputGroup}>
                            <label htmlFor="email">Correo Electrónico</label>
                            <input
                                id="email"
                                type="email"
                                required
                                placeholder="tu@email.com"
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            />
                        </div>

                        <div className={styles.inputGroup}>
                            <label htmlFor="password">Contraseña</label>
                            <div className={styles.passwordWrapper}>
                                <input
                                    id="password"
                                    type={showPassword ? "text" : "password"}
                                    required
                                    placeholder="Mínimo 6 caracteres"
                                    value={formData.password}
                                    onChange={handlePasswordChange}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className={styles.eyeBtn}
                                    tabIndex={-1}
                                >
                                    {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                                </button>
                            </div>

                            {formData.password.length > 0 && (
                                <div className={styles.strengthMeter}>
                                    <div className={styles.strengthBar} style={{
                                        width: `${passwordStrength}%`,
                                        backgroundColor: getPasswordStrengthColor()
                                    }} />
                                </div>
                            )}
                        </div>

                        <CloudflareTurnstile
                            onVerify={handleTurnstileVerify}
                            onExpire={handleTurnstileExpire}
                            theme="dark"
                        />

                        <button type="submit" className={styles.submitBtn} disabled={loading || (!turnstileToken && !!process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY)}>
                            {loading ? (
                                <span className={styles.loadingDots}>
                                    <span>.</span><span>.</span><span>.</span>
                                </span>
                            ) : "Empezar Gratis"}
                        </button>
                    </form>

                    <div className={styles.oauthDivider}>
                        <span>o continuar con</span>
                    </div>

                    <GoogleButton
                        onSuccess={handleGoogleSuccess}
                        disabled={loading}
                    />

                    <div className={styles.footerLink}>
                        <Link href="/">
                            ← Volver al inicio
                        </Link>
                    </div>
                </div>
            </div>
        </main>
        </GoogleOAuthProvider>
    );
}