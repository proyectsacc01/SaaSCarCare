"use client";

import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import Link from "next/link";
import styles from "../../login/login.module.css";
import { GoogleOAuthProvider, useGoogleLogin } from "@react-oauth/google";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://saascarcare-production.up.railway.app";

const CarIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.6-1.1-1-1.9-1H5c-.8 0-1.4.4-1.9 1L1 10l-.6 1c-.6.9-.4 2.1.5 2.6.2.1.5.2.8.2H3v1c0 .6.4 1 1 1h1" />
        <circle cx="7" cy="17" r="2" />
        <circle cx="17" cy="17" r="2" />
    </svg>
);

const GoogleIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
);

const GOOGLE_REDIRECT_URI = "https://saa-s-car-care-85l6.vercel.app/conductor/login";

function GoogleButton({ onSuccess, disabled, label }: {
    onSuccess: (resp: { access_token: string }) => void;
    disabled: boolean;
    label: string;
}) {
    const isAndroid = typeof window !== "undefined" && !!(window as any).AndroidTracker;
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";

    const login = useGoogleLogin({
        onSuccess,
        onError: () => toast.error("Error al iniciar sesión con Google"),
    });

    const handleClick = () => {
        if (isAndroid && clientId) {
            // La librería GIS falla silenciosa en WebView — navegamos directamente
            // a la URL de OAuth de Google y capturamos el token del hash al volver.
            const params = new URLSearchParams({
                client_id: clientId,
                redirect_uri: GOOGLE_REDIRECT_URI,
                response_type: "token",
                scope: "openid email profile",
                state: "conductor_oauth",
                include_granted_scopes: "true",
            });
            window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
        } else {
            login();
        }
    };

    return (
        <button
            type="button"
            className={styles.googleBtn}
            onClick={handleClick}
            disabled={disabled}
        >
            <GoogleIcon />
            <span>{label}</span>
        </button>
    );
}

function DriverLoginInner() {
    const [isRegistering, setIsRegistering] = useState(false);
    const [loading, setLoading] = useState(false);

    // Estado extra para Google register: pedir empresaEmail si es cuenta nueva
    const [needsEmpresaEmail, setNeedsEmpresaEmail] = useState(false);
    const [pendingToken, setPendingToken] = useState<string | null>(null);
    const [pendingTokenIsId, setPendingTokenIsId] = useState(false);
    const [empresaEmailGoogle, setEmpresaEmailGoogle] = useState("");

    // Ref para que el callback nativo de Android siempre use el handler actualizado
    const googleSuccessRef = useRef<((resp: { access_token?: string; id_token?: string }) => void) | null>(null);

    const [loginData, setLoginData] = useState({ email: "", password: "" });
    const [registerData, setRegisterData] = useState({
        nombre: "",
        email: "",
        password: "",
        empresaEmail: ""
    });

    const fetchWithTimeout = async (url: string, options: RequestInit) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60000);
        try {
            const res = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(timeout);
            return res;
        } catch (err: any) {
            clearTimeout(timeout);
            if (err.name === 'AbortError') throw new Error('El servidor está tardando en responder. Intenta de nuevo.');
            throw err;
        }
    };

    const handleGoogleSuccess = async (
        tokenResponse: { access_token?: string; id_token?: string },
        empresaEmail?: string
    ) => {
        setLoading(true);
        try {
            const body: Record<string, string> = {};
            if (tokenResponse.id_token) body.idToken = tokenResponse.id_token;
            else if (tokenResponse.access_token) body.accessToken = tokenResponse.access_token;
            if (empresaEmail) body.empresaEmail = empresaEmail;

            const res = await fetch(`/api/auth/google/conductor`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });
            const data = await res.json();

            if (res.ok) {
                localStorage.setItem("user", JSON.stringify(data));
                if (data.token) localStorage.setItem("token", data.token);
                if (data.picture) localStorage.setItem("profilePhoto", data.picture);
                toast.success(`¡Bienvenido, ${data.nombre}!`);
                window.dispatchEvent(new Event("storage"));
                window.location.href = "/conductor";
            } else if (data.error === "NEEDS_EMPRESA_EMAIL") {
                const token = tokenResponse.id_token || tokenResponse.access_token || "";
                setPendingToken(token);
                setPendingTokenIsId(!!tokenResponse.id_token);
                setNeedsEmpresaEmail(true);
                toast.info("Introduce el email de tu empresa para vincularte a la flota.");
            } else {
                toast.error(data.message || data.error || "Error al iniciar sesión con Google");
            }
        } catch (error) {
            toast.error("Error de conexión con el servidor");
        } finally {
            setLoading(false);
        }
    };

    // Siempre apunta al handler actualizado
    googleSuccessRef.current = handleGoogleSuccess;

    // Captura el access_token del hash cuando Google redirige de vuelta (flujo Android WebView)
    useEffect(() => {
        const hash = window.location.hash;
        if (!hash) return;
        const params = new URLSearchParams(hash.replace(/^#/, ""));
        const accessToken = params.get("access_token");
        const state = params.get("state");
        if (accessToken && state === "conductor_oauth") {
            window.history.replaceState(null, "", window.location.pathname);
            googleSuccessRef.current?.({ access_token: accessToken });
        }
    }, []);

    const handleConfirmEmpresaEmail = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!pendingToken || !empresaEmailGoogle.trim()) return;
        const tokenResponse = pendingTokenIsId
            ? { id_token: pendingToken }
            : { access_token: pendingToken };
        await handleGoogleSuccess(tokenResponse, empresaEmailGoogle.trim().toLowerCase());
        setNeedsEmpresaEmail(false);
        setPendingToken(null);
        setPendingTokenIsId(false);
        setEmpresaEmailGoogle("");
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const res = await fetchWithTimeout(`${API_URL}/api/auth/login/conductor`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email: loginData.email.trim().toLowerCase(),
                    password: loginData.password
                })
            });
            const data = await res.json();
            if (res.ok) {
                localStorage.setItem("user", JSON.stringify(data));
                if (data.token) localStorage.setItem("token", data.token);
                toast.success(`¡Bienvenido, ${data.nombre}!`);
                window.dispatchEvent(new Event("storage"));
                window.location.href = "/conductor";
            } else {
                toast.error(data.error || "Error al iniciar sesión");
            }
        } catch (error: any) {
            toast.error(error.message || "Error de conexión");
        } finally {
            setLoading(false);
        }
    };

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        if (registerData.password.length < 6) {
            toast.error("La contraseña debe tener mínimo 6 caracteres");
            return;
        }
        setLoading(true);
        try {
            const res = await fetchWithTimeout(`${API_URL}/api/auth/register/conductor`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    nombre: registerData.nombre.trim(),
                    email: registerData.email.trim().toLowerCase(),
                    password: registerData.password,
                    empresaEmail: registerData.empresaEmail.trim().toLowerCase()
                })
            });
            const data = await res.json();
            if (res.ok) {
                toast.success("✅ ¡Cuenta creada! Ahora inicia sesión.");
                setIsRegistering(false);
                setLoginData({ email: registerData.email.trim().toLowerCase(), password: "" });
                setRegisterData({ nombre: "", email: "", password: "", empresaEmail: "" });
            } else {
                toast.error(data.error || "Error al registrarse");
            }
        } catch (error: any) {
            toast.error(error.message || "Error de conexión");
        } finally {
            setLoading(false);
        }
    };

    // Modal: pedir empresaEmail cuando es primera vez con Google
    if (needsEmpresaEmail) {
        return (
            <main className={styles.mainContainer}>
                <div className={styles.visualPanel}>
                    <div className={styles.bgImageContainer}>
                        <img src="/login-bg.jpg" alt="Fondo" className={styles.bgImage} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                    <div className={styles.visualContent}>
                        <div className={styles.brandLogo}><CarIcon /><span>CarCare Driver</span></div>
                    </div>
                    <div className={styles.visualPattern} />
                </div>
                <div className={styles.formPanel}>
                    <div className={styles.formContent}>
                        <div className={styles.header}>
                            <h2 className={styles.title}>Vincular a la flota</h2>
                            <p className={styles.subtitle}>Introduce el email de tu empresa para completar el registro.</p>
                        </div>
                        <form onSubmit={handleConfirmEmpresaEmail} className={styles.form}>
                            <div className={styles.inputGroup}>
                                <label style={{ color: '#3bf63b' }}>Email de la Empresa</label>
                                <p style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.5rem' }}>
                                    Pídeselo a tu gestor de flota.
                                </p>
                                <input
                                    type="email"
                                    required
                                    placeholder="admin@empresa.com"
                                    value={empresaEmailGoogle}
                                    onChange={(e) => setEmpresaEmailGoogle(e.target.value)}
                                    style={{ borderColor: '#3bf63b' }}
                                    disabled={loading}
                                    autoFocus
                                />
                            </div>
                            <button type="submit" className={styles.submitBtn} disabled={loading}>
                                {loading ? "Vinculando..." : "Unirse a la Flota"}
                            </button>
                            <button
                                type="button"
                                onClick={() => { setNeedsEmpresaEmail(false); setPendingToken(null); }}
                                style={{ width: '100%', marginTop: '0.75rem', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '0.85rem' }}
                            >
                                Cancelar
                            </button>
                        </form>
                    </div>
                </div>
            </main>
        );
    }

    return (
        <main className={styles.mainContainer}>
            {/* Panel Visual */}
            <div className={styles.visualPanel}>
                <div className={styles.bgImageContainer}>
                    <img src="/login-bg.jpg" alt="Fondo" className={styles.bgImage} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <div className={styles.visualContent}>
                    <div className={styles.brandLogo}>
                        <CarIcon />
                        <span>CarCare Driver</span>
                    </div>
                    <div className={styles.quoteBox}>
                        <h1>Tu ruta, optimizada.</h1>
                        <p>Únete a la flota de tu empresa y recibe tus rutas en tiempo real.</p>
                        <div style={{ marginTop: '2rem', padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
                            <h3 style={{ fontSize: '0.9rem', marginBottom: '0.5rem', color: '#3bf63b' }}>¿Cómo funciona?</h3>
                            <ul style={{ fontSize: '0.8rem', color: '#94a3b8', paddingLeft: '1.2rem', lineHeight: '1.6' }}>
                                <li>Pide el email de administrador a tu jefe.</li>
                                <li>Regístrate usando ese email para vincularte.</li>
                                <li>¡Recibe rutas al instante!</li>
                            </ul>
                        </div>
                    </div>
                </div>
                <div className={styles.visualPattern} />
            </div>

            {/* Panel Formulario */}
            <div className={styles.formPanel}>
                <div className={styles.formContent}>
                    <div className={styles.header}>
                        <h2 className={styles.title}>{isRegistering ? 'Alta de Conductor' : 'Acceso Conductor'}</h2>
                        <p className={styles.subtitle}>
                            {isRegistering ? "¿Ya tienes cuenta? " : "¿Nuevo en la flota? "}
                            <button
                                onClick={() => setIsRegistering(!isRegistering)}
                                style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontWeight: 'bold' }}
                                disabled={loading}
                            >
                                {isRegistering ? "Inicia sesión aquí" : "Regístrate aquí"}
                            </button>
                        </p>
                    </div>

                    {/* Google OAuth */}
                    {process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID && (
                        <>
                            <GoogleButton
                                onSuccess={(t) => handleGoogleSuccess(t)}
                                disabled={loading}
                                label={isRegistering ? "Registrarse con Google" : "Continuar con Google"}
                            />

                            <div className={styles.oauthDivider}>
                                <span>o continuar con email</span>
                            </div>
                        </>
                    )}

                    {!isRegistering ? (
                        <form onSubmit={handleLogin} className={styles.form}>
                            <div className={styles.inputGroup}>
                                <label>Tu Email</label>
                                <input
                                    type="email"
                                    required
                                    placeholder="conductor@email.com"
                                    value={loginData.email}
                                    onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                                    disabled={loading}
                                />
                            </div>
                            <div className={styles.inputGroup}>
                                <label>Contraseña</label>
                                <input
                                    type="password"
                                    required
                                    placeholder="••••••••"
                                    value={loginData.password}
                                    onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                                    disabled={loading}
                                />
                            </div>
                            <button type="submit" className={styles.submitBtn} disabled={loading}>
                                {loading ? "Conectando..." : "Iniciar Turno"}
                            </button>
                        </form>
                    ) : (
                        <form onSubmit={handleRegister} className={styles.form}>
                            <div className={styles.inputGroup}>
                                <label>Nombre Completo</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Juan Pérez"
                                    value={registerData.nombre}
                                    onChange={(e) => setRegisterData({ ...registerData, nombre: e.target.value })}
                                    disabled={loading}
                                />
                            </div>
                            <div className={styles.inputGroup}>
                                <label>Tu Email</label>
                                <input
                                    type="email"
                                    required
                                    placeholder="juan@email.com"
                                    value={registerData.email}
                                    onChange={(e) => setRegisterData({ ...registerData, email: e.target.value })}
                                    disabled={loading}
                                />
                            </div>
                            <div className={styles.inputGroup}>
                                <label>Contraseña (mín. 6 caracteres)</label>
                                <input
                                    type="password"
                                    required
                                    minLength={6}
                                    placeholder="••••••••"
                                    value={registerData.password}
                                    onChange={(e) => setRegisterData({ ...registerData, password: e.target.value })}
                                    disabled={loading}
                                />
                            </div>
                            <div className={styles.inputGroup} style={{ borderTop: '1px solid #334155', paddingTop: '1rem', marginTop: '0.5rem' }}>
                                <label style={{ color: '#3bf63b' }}>Email de la Empresa</label>
                                <p style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '0.5rem' }}>
                                    Pídeselo a tu gestor para vincularte a la flota.
                                </p>
                                <input
                                    type="email"
                                    required
                                    placeholder="admin@empresa.com"
                                    value={registerData.empresaEmail}
                                    onChange={(e) => setRegisterData({ ...registerData, empresaEmail: e.target.value })}
                                    style={{ borderColor: '#3bf63b' }}
                                    disabled={loading}
                                />
                            </div>
                            <button type="submit" className={styles.submitBtn} disabled={loading}>
                                {loading ? "Registrando..." : "Unirse a la Flota"}
                            </button>
                        </form>
                    )}

                    <div className={styles.footerLink} style={{ marginTop: '2rem' }}>
                        <Link href="/login">
                            ¿Eres Administrador? Accede al Panel de Control
                        </Link>
                    </div>
                </div>
            </div>
        </main>
    );
}

export default function DriverLoginPage() {
    const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";

    if (googleClientId) {
        return (
            <GoogleOAuthProvider clientId={googleClientId}>
                <DriverLoginInner />
            </GoogleOAuthProvider>
        );
    }

    return <DriverLoginInner />;
}
