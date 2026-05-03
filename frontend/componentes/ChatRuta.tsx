"use client";

import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";

interface Mensaje {
    id?: string;
    rutaId: string;
    remitente: "ADMIN" | "CONDUCTOR";
    contenido: string;
    mediaBase64?: string;
    mediaType?: string;
    timestamp?: string;
}

interface ChatProps {
    rutaId: string;
    rol: "ADMIN" | "CONDUCTOR";
    /**
     * Si true, el chat ocupa el 100% del padre (necesita un padre con altura
     * conocida y display:flex). Útil para layouts full-screen del conductor.
     * Si false (default), usa altura responsive con cap fijo.
     */
    fillParent?: boolean;
}

type AndroidTrackerBridge = {
    pickChatAudio?: () => void;
    startRecording?: () => void;
    requestMicPermission?: () => void;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://saascarcare-production.up.railway.app";
const MAX_MEDIA_SIZE = 2 * 1024 * 1024; // 2MB
const MAX_AUDIO_SECONDS = 90;

// Mensajes rápidos preestablecidos según el rol — para que el conductor no tenga que tipear
// mientras maneja, y la central tenga respuestas comunes a un toque
const QUICK_REPLIES_CONDUCTOR = [
    "Salgo ahora 🚗",
    "Llegué al destino ✓",
    "Hay tráfico, demora ~15 min",
    "Necesito asistencia",
];
const QUICK_REPLIES_ADMIN = [
    "Recibido 👍",
    "Confirmar llegada por favor",
    "¿Todo bien?",
    "Actualiza estado cuando puedas",
];

export default function ChatRuta({ rutaId, rol, fillParent = false }: ChatProps) {
    const [mensajes, setMensajes] = useState<Mensaje[]>([]);
    const [nuevoMensaje, setNuevoMensaje] = useState("");
    const [mediaPreview, setMediaPreview] = useState<{ base64: string; type: string } | null>(null);
    const [sending, setSending] = useState(false);
    const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
    const [showScrollDown, setShowScrollDown] = useState(false);
    const [showQuickReplies, setShowQuickReplies] = useState(true);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingSeconds, setRecordingSeconds] = useState(0);
    const scrollRef = useRef<HTMLDivElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const lastSeenIdRef = useRef<string | null>(null);
    const recorderRef = useRef<MediaRecorder | null>(null);
    const recorderChunksRef = useRef<Blob[]>([]);
    const recorderTimerRef = useRef<number | null>(null);
    const recorderStreamRef = useRef<MediaStream | null>(null);
    const [newMsgPulse, setNewMsgPulse] = useState(0);

    const quickReplies = rol === 'CONDUCTOR' ? QUICK_REPLIES_CONDUCTOR : QUICK_REPLIES_ADMIN;

    const getAndroidTracker = () => {
        if (typeof window === 'undefined') return null;
        return (window as Window & { AndroidTracker?: AndroidTrackerBridge }).AndroidTracker ?? null;
    };

    const getAuthHeaders = (): Record<string, string> => {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (typeof window === 'undefined') return headers;
        const token = localStorage.getItem("token");
        if (token) headers['Authorization'] = `Bearer ${token}`;
        return headers;
    };

    const cargarMensajes = async () => {
        try {
            const res = await fetch(`${API_URL}/api/mensajes/${rutaId}`, { headers: getAuthHeaders() });
            if (res.ok) setMensajes(await res.json());
        } catch { /* silencioso */ }
    };

    useEffect(() => {
        cargarMensajes();
        const interval = setInterval(cargarMensajes, 3000);
        return () => clearInterval(interval);
    }, [rutaId]);

    // Scroll inteligente: solo auto-scroll si el usuario ya estaba abajo, o si fue él quien envió.
    // Si está leyendo arriba, mostramos botón "ir abajo" + pulso para indicar mensaje nuevo.
    useEffect(() => {
        const el = scrollRef.current;
        if (!el || mensajes.length === 0) return;

        const last = mensajes[mensajes.length - 1];
        const isFromMe = last.remitente === rol;
        const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        const isNearBottom = distanceFromBottom < 80;

        if (isFromMe || isNearBottom) {
            el.scrollTop = el.scrollHeight;
        } else if (last.id && last.id !== lastSeenIdRef.current) {
            // Mensaje nuevo del otro lado y el usuario está leyendo arriba
            setNewMsgPulse(p => p + 1);
        }

        lastSeenIdRef.current = last.id || null;
    }, [mensajes, rol]);

    // Track scroll position para mostrar/ocultar botón flotante
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const onScroll = () => {
            const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
            setShowScrollDown(distanceFromBottom > 120);
        };
        el.addEventListener('scroll', onScroll, { passive: true });
        return () => el.removeEventListener('scroll', onScroll);
    }, []);

    useEffect(() => {
        return () => {
            stopRecorderResources();
            if (recorderRef.current && recorderRef.current.state !== "inactive") {
                recorderRef.current.stop();
            }
        };
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const handleNativeAudioSelected = (event: Event) => {
            const detail = (event as CustomEvent<{ base64?: string; type?: string }>).detail;
            if (!detail?.base64 || !detail?.type) {
                toast.error("No se pudo recibir el audio nativo");
                return;
            }
            setIsRecording(false);
            setRecordingSeconds(0);
            setMediaPreview({ base64: detail.base64, type: detail.type });
        };

        const handleNativeAudioError = (event: Event) => {
            const detail = (event as CustomEvent<{ message?: string }>).detail;
            setIsRecording(false);
            setRecordingSeconds(0);
            toast.error(detail?.message || "No se pudo capturar el audio");
        };

        window.addEventListener("native-chat-audio-selected", handleNativeAudioSelected as EventListener);
        window.addEventListener("native-chat-audio-error", handleNativeAudioError as EventListener);

        return () => {
            window.removeEventListener("native-chat-audio-selected", handleNativeAudioSelected as EventListener);
            window.removeEventListener("native-chat-audio-error", handleNativeAudioError as EventListener);
        };
    }, []);

    const scrollToBottom = () => {
        const el = scrollRef.current;
        if (!el) return;
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
        setNewMsgPulse(0);
    };

    const sendQuickReply = async (text: string) => {
        if (sending) return;
        setSending(true);
        try {
            const res = await fetch(`${API_URL}/api/mensajes`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ rutaId, remitente: rol, contenido: text })
            });
            if (res.ok) {
                cargarMensajes();
                setShowQuickReplies(false);
            }
        } catch (err) {
            console.error("Error enviando respuesta rápida:", err);
        } finally {
            setSending(false);
        }
    };

    const fileToDataUrl = (file: Blob) =>
        new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ""));
            reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
            reader.readAsDataURL(file);
        });

    const stopRecorderResources = () => {
        if (recorderTimerRef.current !== null) {
            window.clearInterval(recorderTimerRef.current);
            recorderTimerRef.current = null;
        }
        recorderStreamRef.current?.getTracks().forEach((track) => track.stop());
        recorderStreamRef.current = null;
    };

    const formatRecordingTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    };

    const pickRecorderMimeType = () => {
        if (typeof MediaRecorder === "undefined") return "";
        const candidates = [
            "audio/webm;codecs=opus",
            "audio/webm",
            "audio/mp4",
            "audio/ogg;codecs=opus",
        ];
        return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
    };

    const stopAudioRecording = () => {
        if (!recorderRef.current) return;
        if (recorderRef.current.state !== "inactive") {
            recorderRef.current.stop();
        }
    };

    const startAudioRecording = async () => {
        if (sending) return;
        if (typeof window === "undefined") return;

        const bridge = getAndroidTracker();
        if (bridge?.startRecording) {
            setIsRecording(true);
            setRecordingSeconds(0);
            setMediaPreview(null);
            bridge.startRecording();
            return;
        }

        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
            toast.error("Tu navegador no soporta grabación de audio");
            return;
        }

        // En Android WebView, getUserMedia puede fallar porque la web no tiene
        // el permiso RESOURCE_AUDIO_CAPTURE concedido aún. Si eso pasa, invocamos
        // el puente nativo para que pida el permiso de micrófono al sistema.
        // Cuando el usuario conceda, llega el evento "mic-permission-granted"
        // y reintentamos la grabación automáticamente.
        if (bridge?.requestMicPermission) {
            const onGranted = () => {
                window.removeEventListener("mic-permission-granted", onGranted);
                window.removeEventListener("mic-permission-denied", onDenied);
                void startAudioRecording();
            };
            const onDenied = () => {
                window.removeEventListener("mic-permission-granted", onGranted);
                window.removeEventListener("mic-permission-denied", onDenied);
                toast.error("Permiso de micrófono denegado. Habilítalo en Ajustes de la app.");
            };
            window.addEventListener("mic-permission-granted", onGranted);
            window.addEventListener("mic-permission-denied", onDenied);
            bridge.requestMicPermission();
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mimeType = pickRecorderMimeType();
            const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

            recorderRef.current = recorder;
            recorderStreamRef.current = stream;
            recorderChunksRef.current = [];
            setRecordingSeconds(0);
            setIsRecording(true);
            setMediaPreview(null);

            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) recorderChunksRef.current.push(event.data);
            };

            recorder.onstop = async () => {
                const blob = new Blob(recorderChunksRef.current, { type: recorder.mimeType || "audio/webm" });
                stopRecorderResources();
                setIsRecording(false);
                recorderRef.current = null;

                if (blob.size <= 0) {
                    toast.error("No se pudo generar el audio");
                    return;
                }

                if (blob.size > MAX_MEDIA_SIZE) {
                    toast.error("Audio demasiado grande (máx. 2MB)");
                    return;
                }

                try {
                    const dataUrl = await fileToDataUrl(blob);
                    const base64 = dataUrl.split(",")[1] || "";
                    setMediaPreview({ base64, type: blob.type || "audio/webm" });
                } catch {
                    toast.error("No se pudo preparar el audio");
                }
            };

            recorder.start(250);
            recorderTimerRef.current = window.setInterval(() => {
                setRecordingSeconds((prev) => {
                    const next = prev + 1;
                    if (next >= MAX_AUDIO_SECONDS) {
                        stopAudioRecording();
                    }
                    return next;
                });
            }, 1000);
        } catch {
            toast.error("No se pudo acceder al micrófono");
        }
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = "";

        if (!file.type.startsWith("audio/")) {
            toast.error("Solo audios");
            return;
        }

        try {
            if (file.size > MAX_MEDIA_SIZE) {
                toast.error("Audio demasiado grande (máx. 2MB)");
                return;
            }

            const dataUrl = await fileToDataUrl(file);
            const base64 = dataUrl.split(",")[1] || "";
            setMediaPreview({ base64, type: file.type });
        } catch {
            toast.error("No se pudo adjuntar el archivo");
        }
    };

    const enviar = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!nuevoMensaje.trim() && !mediaPreview) return;
        setSending(true);

        const mensajeObj: {
            rutaId: string;
            remitente: "ADMIN" | "CONDUCTOR";
            contenido: string;
            mediaBase64?: string;
            mediaType?: string;
        } = {
            rutaId,
            remitente: rol,
            contenido: nuevoMensaje.trim() || (mediaPreview ? "🎤 Audio" : ""),
        };
        if (mediaPreview) {
            mensajeObj.mediaBase64 = mediaPreview.base64;
            mensajeObj.mediaType = mediaPreview.type;
        }

        try {
            const res = await fetch(`${API_URL}/api/mensajes`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify(mensajeObj)
            });
            if (res.ok) {
                setNuevoMensaje("");
                setMediaPreview(null);
                cargarMensajes();
            } else {
                toast.error(`No se pudo enviar el mensaje (${res.status})`);
            }
        } catch (err) {
            console.error("Error enviando mensaje:", err);
            toast.error("Error de red al enviar mensaje");
        } finally {
            setSending(false);
        }
    };

    const formatTime = (ts?: string) => {
        if (!ts) return "";
        try {
            const d = new Date(ts);
            if (isNaN(d.getTime())) return "";
            return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        } catch { return ""; }
    };

    const isImage = (type?: string) => type?.startsWith("image/");
    const isAudio = (type?: string) => type?.startsWith("audio/");
    const isVideo = (type?: string) => type?.startsWith("video/");
    const mediaUrl = (m: Mensaje) => m.mediaBase64 ? `data:${m.mediaType};base64,${m.mediaBase64}` : "";

    return (
        <>
            <div style={{
                display: 'flex', flexDirection: 'column',
                // Si fillParent: ocupamos el 100% del contenedor padre (debe ser
                // flex con altura conocida) — esto da chat full-screen en móvil
                // y tablet, sin caps artificiales. Si no, height responsive con
                // cap razonable para usos embebidos en cards.
                ...(fillParent
                    ? { height: '100%', width: '100%', flex: 1 }
                    : { height: 'min(640px, 78dvh)', minHeight: '420px' }),
                borderRadius: '20px', overflow: 'hidden',
                background: 'linear-gradient(180deg, rgba(12,14,20,0.98) 0%, rgba(8,10,16,0.99) 100%)',
                border: '1px solid rgba(255,255,255,0.06)',
                boxShadow: '0 20px 60px -15px rgba(0,0,0,0.5)',
            }}>
                {/* Header */}
                <div style={{
                    padding: '0.9rem 1.1rem', display: 'flex', alignItems: 'center', gap: '0.7rem',
                    background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.05)',
                }}>
                    <div style={{
                        width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
                        background: rol === 'ADMIN'
                            ? 'linear-gradient(135deg, #60a5fa, #3b82f6)'
                            : 'linear-gradient(135deg, #3bf63b, #22c55e)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.8rem', fontWeight: '900', color: '#000',
                        boxShadow: rol === 'ADMIN'
                            ? '0 4px 14px rgba(96,165,250,0.3)'
                            : '0 4px 14px rgba(59,246,59,0.3)',
                    }}>
                        {rol === 'ADMIN' ? '🚗' : '🏢'}
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '0.9rem', fontWeight: '700', color: '#fff' }}>
                            {rol === 'ADMIN' ? 'Conductor' : 'Soporte Admin'}
                        </div>
                        <div style={{ fontSize: '0.6rem', color: '#3bf63b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#3bf63b', display: 'inline-block', boxShadow: '0 0 6px #3bf63b' }} />
                            En línea
                        </div>
                    </div>
                    <div style={{ fontSize: '0.55rem', color: '#374151', fontFamily: 'monospace' }}>
                        #{rutaId?.slice(-6).toUpperCase()}
                    </div>
                </div>

                {/* Messages — wrapper relative para botón flotante */}
                <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
                <div ref={scrollRef} style={{
                    position: 'absolute', inset: 0, overflowY: 'auto', padding: '1rem 0.9rem',
                    display: 'flex', flexDirection: 'column', gap: '0.6rem',
                    scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.08) transparent',
                }}>
                    {mensajes.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#374151' }}>
                            <div style={{
                                width: '64px', height: '64px', margin: '0 auto 1rem',
                                borderRadius: '50%',
                                background: rol === 'CONDUCTOR'
                                    ? 'linear-gradient(135deg, rgba(59,246,59,0.12), rgba(34,197,94,0.05))'
                                    : 'linear-gradient(135deg, rgba(96,165,250,0.12), rgba(59,130,246,0.05))',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '1.8rem',
                                border: `1px solid ${rol === 'CONDUCTOR' ? 'rgba(59,246,59,0.2)' : 'rgba(96,165,250,0.2)'}`,
                            }}>💬</div>
                            <p style={{ fontSize: '0.9rem', fontWeight: 700, margin: '0 0 0.3rem', color: '#9ca3af' }}>
                                Empieza la conversación
                            </p>
                            <p style={{ fontSize: '0.72rem', margin: 0, color: '#4b5563', lineHeight: 1.5 }}>
                                {rol === 'CONDUCTOR'
                                    ? 'Toca una respuesta rápida o escribe abajo'
                                    : 'Envía un mensaje al conductor'}
                            </p>
                        </div>
                    )}
                    {mensajes.map((m, i) => {
                        const isMe = m.remitente === rol;
                        const hasMedia = !!m.mediaBase64;
                        // "Leído" si después de mi mensaje hay un mensaje del otro lado — heurística simple sin
                        // necesidad de cambiar el modelo del backend.
                        const wasRead = isMe && mensajes.slice(i + 1).some(later => later.remitente !== rol);
                        return (
                            <div key={m.id || i} style={{
                                alignSelf: isMe ? 'flex-end' : 'flex-start',
                                maxWidth: hasMedia ? '75%' : '80%',
                                animation: 'fadeInUp 0.25s ease-out',
                            }}>
                                <div style={{
                                    padding: hasMedia ? '0.35rem' : '0.6rem 0.9rem',
                                    borderRadius: isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                                    background: isMe
                                        ? 'linear-gradient(135deg, #3bf63b, #22c55e)'
                                        : 'rgba(255,255,255,0.06)',
                                    color: isMe ? '#000' : '#e5e7eb',
                                    boxShadow: isMe
                                        ? '0 4px 18px rgba(59,246,59,0.2)'
                                        : '0 2px 8px rgba(0,0,0,0.15)',
                                    border: isMe ? 'none' : '1px solid rgba(255,255,255,0.06)',
                                    overflow: 'hidden',
                                }}>
                                    {/* Media */}
                                    {hasMedia && isImage(m.mediaType) && (
                                        <img
                                            src={mediaUrl(m)}
                                            alt="media"
                                            onClick={() => setLightboxSrc(mediaUrl(m))}
                                            style={{
                                                width: '100%', maxHeight: '220px', objectFit: 'cover',
                                                borderRadius: hasMedia && m.contenido && m.contenido !== '📎' ? '12px 12px 0 0' : '12px',
                                                cursor: 'pointer', display: 'block',
                                            }}
                                        />
                                    )}
                                    {hasMedia && isVideo(m.mediaType) && (
                                        <video
                                            src={mediaUrl(m)}
                                            controls
                                            playsInline
                                            style={{
                                                width: '100%', maxHeight: '220px',
                                                borderRadius: '12px', display: 'block',
                                            }}
                                        />
                                    )}
                                    {hasMedia && isAudio(m.mediaType) && (
                                        <audio
                                            src={mediaUrl(m)}
                                            controls
                                            preload="metadata"
                                            style={{
                                                width: '100%',
                                                minWidth: '240px',
                                                display: 'block',
                                                marginTop: m.contenido && m.contenido !== '📎' ? '0.35rem' : 0,
                                            }}
                                        />
                                    )}
                                    {/* Text */}
                                    {m.contenido && m.contenido !== '📎' && (
                                        <div style={{
                                            padding: hasMedia ? '0.5rem 0.6rem 0.3rem' : '0',
                                            fontSize: '0.88rem', lineHeight: 1.4,
                                        }}>
                                            {m.contenido}
                                        </div>
                                    )}
                                    {/* Timestamp + read indicator */}
                                    <div style={{
                                        fontSize: '0.55rem',
                                        textAlign: 'right',
                                        padding: hasMedia ? '0.15rem 0.5rem 0.25rem' : '0.15rem 0 0',
                                        fontWeight: '500',
                                        display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px',
                                        opacity: 0.65,
                                    }}>
                                        <span>{formatTime(m.timestamp)}</span>
                                        {isMe && (
                                            <span style={{
                                                color: wasRead ? '#0ea5e9' : (isMe ? 'rgba(0,0,0,0.55)' : '#6b7280'),
                                                fontWeight: 800, fontSize: '0.65rem', letterSpacing: '-2px',
                                            }} title={wasRead ? 'Leído' : 'Enviado'}>
                                                {wasRead ? '✓✓' : '✓'}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Botón flotante "ir abajo" cuando hay mensajes nuevos arriba */}
                {showScrollDown && (
                    <button
                        onClick={scrollToBottom}
                        style={{
                            position: 'absolute', bottom: '0.8rem', right: '0.8rem',
                            width: '36px', height: '36px', borderRadius: '50%',
                            background: newMsgPulse > 0
                                ? 'linear-gradient(135deg, #3bf63b, #22c55e)'
                                : 'rgba(20,22,28,0.95)',
                            border: `1px solid ${newMsgPulse > 0 ? 'transparent' : 'rgba(255,255,255,0.1)'}`,
                            color: newMsgPulse > 0 ? '#000' : '#9ca3af',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.9rem', fontWeight: 800,
                            boxShadow: newMsgPulse > 0
                                ? '0 6px 20px rgba(59,246,59,0.4), 0 0 0 4px rgba(59,246,59,0.15)'
                                : '0 4px 14px rgba(0,0,0,0.4)',
                            transition: 'all 0.2s ease',
                            backdropFilter: 'blur(10px)',
                        }}
                        title={newMsgPulse > 0 ? `${newMsgPulse} mensaje(s) nuevo(s)` : 'Ir abajo'}
                    >
                        ↓
                    </button>
                )}
                </div>

                {/* Quick Replies — solo se muestran si todavía no se ocultaron y hay 0 ó pocos mensajes */}
                {showQuickReplies && mensajes.length < 4 && !mediaPreview && (
                    <div style={{
                        padding: '0.5rem 0.7rem',
                        borderTop: '1px solid rgba(255,255,255,0.04)',
                        background: 'rgba(255,255,255,0.015)',
                        display: 'flex', gap: '0.4rem', overflowX: 'auto',
                        scrollbarWidth: 'none',
                    }}>
                        {quickReplies.map((qr, i) => (
                            <button
                                key={i}
                                onClick={() => sendQuickReply(qr)}
                                disabled={sending}
                                style={{
                                    flexShrink: 0,
                                    padding: '0.4rem 0.8rem',
                                    background: 'rgba(59,246,59,0.06)',
                                    border: '1px solid rgba(59,246,59,0.18)',
                                    borderRadius: '99px',
                                    color: '#3bf63b',
                                    fontSize: '0.72rem', fontWeight: 600,
                                    cursor: sending ? 'default' : 'pointer',
                                    opacity: sending ? 0.5 : 1,
                                    transition: 'all 0.15s',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {qr}
                            </button>
                        ))}
                        <button
                            onClick={() => setShowQuickReplies(false)}
                            style={{
                                flexShrink: 0,
                                padding: '0.4rem 0.6rem',
                                background: 'rgba(255,255,255,0.03)',
                                border: '1px solid rgba(255,255,255,0.06)',
                                borderRadius: '99px',
                                color: '#6b7280', fontSize: '0.7rem',
                                cursor: 'pointer',
                            }}
                            title="Ocultar respuestas rápidas"
                        >✕</button>
                    </div>
                )}

                {/* Media Preview */}
                {mediaPreview && (
                    <div style={{
                        padding: '0.5rem 0.9rem', display: 'flex', alignItems: 'center', gap: '0.6rem',
                        background: 'rgba(59,246,59,0.05)', borderTop: '1px solid rgba(59,246,59,0.15)',
                    }}>
                        {mediaPreview.type.startsWith("audio/") ? (
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <audio
                                    controls
                                    preload="metadata"
                                    src={`data:${mediaPreview.type};base64,${mediaPreview.base64}`}
                                    style={{ width: '100%' }}
                                />
                            </div>
                        ) : mediaPreview.type.startsWith("image/") ? (
                            <img
                                src={`data:${mediaPreview.type};base64,${mediaPreview.base64}`}
                                alt="preview"
                                style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '10px', border: '2px solid rgba(59,246,59,0.3)' }}
                            />
                        ) : (
                            <div style={{ width: '48px', height: '48px', borderRadius: '10px', background: 'rgba(59,246,59,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', border: '2px solid rgba(59,246,59,0.3)' }}>
                                🎬
                            </div>
                        )}
                        {!mediaPreview.type.startsWith("audio/") && (
                            <span style={{ flex: 1, fontSize: '0.75rem', color: '#9ca3af' }}>
                                {mediaPreview.type.startsWith("image/") ? "Imagen" : "Video"} adjunto
                            </span>
                        )}
                        <button
                            onClick={() => setMediaPreview(null)}
                            style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', width: '30px', height: '30px', color: '#ef4444', cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >✕</button>
                    </div>
                )}

                {isRecording && (
                    <div style={{
                        padding: '0.55rem 0.9rem',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.6rem',
                        background: 'rgba(239,68,68,0.08)', borderTop: '1px solid rgba(239,68,68,0.18)',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', color: '#fca5a5', fontSize: '0.78rem', fontWeight: 700 }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 10px rgba(239,68,68,0.8)' }} />
                            Grabando audio
                        </div>
                        <div style={{ color: '#fff', fontFamily: 'monospace', fontSize: '0.8rem', fontWeight: 800 }}>
                            {formatRecordingTime(recordingSeconds)}
                        </div>
                    </div>
                )}

                {/* Input */}
                <form onSubmit={enviar} style={{
                    display: 'flex', alignItems: 'center', gap: '0.4rem',
                    padding: '0.7rem 0.8rem',
                    background: 'rgba(255,255,255,0.02)',
                    borderTop: '1px solid rgba(255,255,255,0.05)',
                }}>
                    <input
                        ref={fileRef}
                        type="file"
                        accept="audio/*"
                        onChange={handleFileSelect}
                        style={{ display: 'none' }}
                    />
                    <button
                        type="button"
                        onClick={() => {
                            if (isRecording) {
                                stopAudioRecording();
                            } else {
                                void startAudioRecording();
                            }
                        }}
                        style={{
                            background: isRecording ? 'rgba(239,68,68,0.14)' : 'rgba(255,255,255,0.05)', border: `1px solid ${isRecording ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.08)'}`,
                            borderRadius: '50%', width: '38px', height: '38px', minWidth: '38px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', fontSize: '1rem', color: isRecording ? '#ef4444' : '#6b7280',
                            transition: 'all 0.2s',
                        }}
                        title={isRecording ? 'Detener grabación' : 'Grabar audio'}
                    >{isRecording ? '⏹' : '🎙'}</button>
                    <input
                        type="text"
                        value={nuevoMensaje}
                        onChange={(e) => setNuevoMensaje(e.target.value)}
                        placeholder={isRecording ? 'Pulsa detener para adjuntar el audio...' : 'Escribe un mensaje o graba un audio...'}
                        // Cuando el teclado de Android aparece, el viewport se reduce y
                        // el input puede quedar oculto detrás del bottom nav fixed.
                        // Forzamos scrollIntoView con un pequeño delay para esperar
                        // que el teclado termine la animación.
                        onFocus={(e) => {
                            const target = e.currentTarget;
                            setTimeout(() => {
                                try {
                                    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
                                } catch { /* navegadores viejos */ }
                            }, 350);
                        }}
                        style={{
                            flex: 1, background: 'rgba(0,0,0,0.25)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: '20px', padding: '0.6rem 1rem',
                            color: '#fff', outline: 'none', fontSize: '16px',
                            // 16px evita que iOS/Android haga zoom automático al focusear
                            minWidth: 0,
                        }}
                    />
                    <button
                        type="submit"
                        disabled={sending || isRecording || (!nuevoMensaje.trim() && !mediaPreview)}
                        style={{
                            background: (nuevoMensaje.trim() || mediaPreview)
                                ? 'linear-gradient(135deg, #3bf63b, #22c55e)'
                                : 'rgba(255,255,255,0.05)',
                            border: 'none', borderRadius: '50%',
                            width: '38px', height: '38px', minWidth: '38px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: (nuevoMensaje.trim() || mediaPreview) ? 'pointer' : 'default',
                            fontSize: '1rem',
                            color: (nuevoMensaje.trim() || mediaPreview) ? '#000' : '#4b5563',
                            boxShadow: (nuevoMensaje.trim() || mediaPreview)
                                ? '0 4px 14px rgba(59,246,59,0.3)' : 'none',
                            transition: 'all 0.25s ease',
                            transform: sending ? 'scale(0.9)' : 'scale(1)',
                            opacity: sending ? 0.6 : 1,
                        }}
                    >
                        {sending ? '⏳' : '➔'}
                    </button>
                </form>
            </div>

            {/* Lightbox */}
            {lightboxSrc && (
                <div
                    onClick={() => setLightboxSrc(null)}
                    style={{
                        position: 'fixed', inset: 0, zIndex: 9999,
                        background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(16px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'zoom-out', animation: 'fadeIn 0.2s ease',
                    }}
                >
                    <img src={lightboxSrc} alt="full" style={{ maxWidth: '92vw', maxHeight: '88vh', borderRadius: '12px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }} />
                    <button
                        style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', width: '40px', height: '40px', color: '#fff', fontSize: '1.2rem', cursor: 'pointer', backdropFilter: 'blur(8px)' }}
                    >✕</button>
                </div>
            )}

            <style>{`
                @keyframes fadeInUp {
                    from { opacity: 0; transform: translateY(8px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
            `}</style>
        </>
    );
}
