"use client";

import { useTranslation } from "@/lib/i18n";
import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import styles from "./login.module.css";
import CloudflareTurnstile from "@/componentes/CloudflareTurnstile";
import { GoogleOAuthProvider, useGoogleLogin } from "@react-oauth/google";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://saas-carcare-production-54f9.up.railway.app";

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

function GoogleButton({ onSuccess, disabled, label }: { onSuccess: (resp: { access_token: string }) => void; disabled: boolean; label: string }) {
    const login = useGoogleLogin({
        onSuccess,
        onError: () => toast.error(label),
    });

    return (
        <button
            type="button"
            className={styles.googleBtn}
            onClick={() => login()}
            disabled={disabled}
        >
            <GoogleIcon />
            <span>{label}</span>
        </button>
    );
}

export default function LoginPage() {
    const t = useTranslation();

    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
    const [formData, setFormData] = useState({
        email: "",
        password: ""
    });

    const handleTurnstileVerify = useCallback((token: string) => {
        setTurnstileToken(token);
    }, []);

    const handleTurnstileExpire = useCallback(() => {
        setTurnstileToken(null);
    }, []);

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
                if (data.token) localStorage.setItem("token", data.token);
                toast.success(t.auth.welcome);
                window.dispatchEvent(new Event("storage"));
                router.push("/dashboard");
            } else {
                toast.error(data.error || t.auth.googleError);
            }
        } catch (error) {
            console.error(error);
            toast.error(t.auth.connectionError);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const res = await fetch(`${API_URL}/api/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(formData)
            });

            const data = await res.json();

            if (res.ok) {
                localStorage.setItem("user", JSON.stringify(data));
                if (data.token) localStorage.setItem("token", data.token);
                toast.success(t.auth.welcomeBack);
                window.dispatchEvent(new Event("storage"));
                router.push("/dashboard");
            } else {
                toast.error(data.error || t.auth.loginError);
            }
        } catch (error) {
            console.error(error);
            toast.error(t.auth.connectionError);
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
                        <h1>{t.auth.loginHeroTitle}</h1>
                        <p>{t.auth.loginHeroSubtitle}</p>

                        <div className={styles.statsRow}>
                            <div className={styles.statItem}>
                                <span className={styles.statVal}>6</span>
                                <span className={styles.statLabel}>{t.landing.statModules}</span>
                            </div>
                            <div className={styles.divider} />
                            <div className={styles.statItem}>
                                <span className={styles.statVal}>3s</span>
                                <span className={styles.statLabel}>{t.landing.statRefresh}</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div className={styles.visualPattern} />
            </div>

            {/* Form Panel (Right) */}
            <div className={styles.formPanel}>
                <div className={styles.formContent}>
                    <div className={styles.mobileHeader}>
                        <CarIcon />
                    </div>

                    <div className={styles.header}>
                        <h2 className={styles.title}>{t.auth.login}</h2>
                        <p className={styles.subtitle}>
                            {t.auth.newHere} <Link href="/register">{t.auth.createFreeAccount}</Link>
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className={styles.form}>
                        <div className={styles.inputGroup}>
                            <label htmlFor="email">{t.auth.email}</label>
                            <input
                                id="email"
                                type="email"
                                required
                                placeholder="nombre@empresa.com"
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                autoComplete="email"
                            />
                        </div>

                        <div className={styles.inputGroup}>
                            <div className={styles.labelRow}>
                                <label htmlFor="password">{t.auth.password}</label>
                                <a href="#" className={styles.forgotLink}>{t.auth.forgotPassword}</a>
                            </div>
                            <div className={styles.passwordWrapper}>
                                <input
                                    id="password"
                                    type={showPassword ? "text" : "password"}
                                    required
                                    placeholder="••••••••"
                                    value={formData.password}
                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                    autoComplete="current-password"
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
                            ) : t.auth.accessPanel}
                        </button>
                    </form>

                    <div className={styles.oauthDivider}>
                        <span>{t.auth.orContinueWith}</span>
                    </div>

                    <GoogleButton
                        onSuccess={handleGoogleSuccess}
                        disabled={loading}
                        label={t.auth.continueWithGoogle}
                    />

                    <div className={styles.footerLink}>
                        <Link href="/">
                            {t.auth.backToHome}
                        </Link>
                    </div>
                </div>
            </div>
        </main>
        </GoogleOAuthProvider>
    );
}