import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// ═══════════════════════════════════════════════════════════
// 🔒 FIREWALL MIDDLEWARE — Protección a nivel de aplicación
// ═══════════════════════════════════════════════════════════

// --- Configuración del Firewall ---
const FIREWALL_CONFIG = {
    // Rate limiting: máximo de peticiones por IP en ventana de tiempo
    rateLimit: {
        windowMs: 60 * 1000,      // Ventana de 1 minuto
        maxRequests: 60,           // Máximo 60 peticiones por minuto (general)
        maxLoginAttempts: 5,       // Máximo 5 intentos de login por minuto
    },

    // IPs bloqueadas manualmente (añadir IPs sospechosas aquí)
    blockedIPs: [] as string[],

    // User-Agents bloqueados (bots maliciosos conocidos)
    blockedUserAgents: [
        'sqlmap',
        'nikto',
        'masscan',
        'nmap',
        'dirbuster',
        'gobuster',
        'hydra',
        'medusa',
        'wpscan',
        'joomla',
        'drupal',
        'scanner',
        'exploit',
        'hack',
    ],

    // Paths sensibles que requieren protección extra
    protectedPaths: [
        '/api/auth/login',
        '/api/auth/register',
        '/api/auth/login/conductor',
        '/api/auth/register/conductor',
    ],

    // Cabeceras de seguridad
    securityHeaders: {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self)',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    },
}

// --- Rate Limiter en memoria ---
const rateLimitMap = new Map<string, { count: number; resetTime: number }>()
const loginAttemptMap = new Map<string, { count: number; resetTime: number }>()

function isRateLimited(ip: string, isLoginAttempt: boolean): boolean {
    const now = Date.now()
    const map = isLoginAttempt ? loginAttemptMap : rateLimitMap
    const maxRequests = isLoginAttempt
        ? FIREWALL_CONFIG.rateLimit.maxLoginAttempts
        : FIREWALL_CONFIG.rateLimit.maxRequests

    const record = map.get(ip)

    if (!record || now > record.resetTime) {
        map.set(ip, { count: 1, resetTime: now + FIREWALL_CONFIG.rateLimit.windowMs })
        return false
    }

    record.count++

    if (record.count > maxRequests) {
        return true // BLOQUEADO
    }

    return false
}

// Limpieza periódica del mapa (evitar memory leak)
function cleanupMaps() {
    const now = Date.now()
    for (const [key, value] of rateLimitMap) {
        if (now > value.resetTime) rateLimitMap.delete(key)
    }
    for (const [key, value] of loginAttemptMap) {
        if (now > value.resetTime) loginAttemptMap.delete(key)
    }
}

// Limpieza cada 5 minutos
let lastCleanup = Date.now()

// --- Funciones de detección ---
function getClientIP(request: NextRequest): string {
    return (
        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        request.headers.get('x-real-ip') ||
        request.headers.get('cf-connecting-ip') ||
        'unknown'
    )
}

function isSuspiciousUserAgent(userAgent: string | null): boolean {
    if (!userAgent) return false // WebView y service workers pueden no enviar UA — no bloquear
    const ua = userAgent.toLowerCase()
    // No bloquear UAs legítimos de Android WebView, Chrome Mobile ni bots de indexación
    if (ua.includes('android') || ua.includes('mobile') || ua.includes('dalvik')) return false
    return FIREWALL_CONFIG.blockedUserAgents.some(blocked => ua.includes(blocked))
}

function isSuspiciousPayload(url: string): boolean {
    const suspiciousPatterns = [
        /(\.\.\/)/, // Path traversal
        /(union\s+select)/i, // SQL injection
        /(<script)/i, // XSS
        /(eval\()/i, // Code injection
        /(base64_decode)/i, // PHP injection
        /(%00)/, // Null byte
        /(etc\/passwd)/, // File inclusion
        /(cmd=|exec=|system\()/i, // Command injection
    ]
    return suspiciousPatterns.some(pattern => pattern.test(url))
}

function isProtectedPath(pathname: string): boolean {
    return FIREWALL_CONFIG.protectedPaths.some(path => pathname.includes(path))
}

// ═══════════════════════════════════════════════
// 🚀 MIDDLEWARE PRINCIPAL
// ═══════════════════════════════════════════════
export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl
    const ip = getClientIP(request)
    const userAgent = request.headers.get('user-agent')

    // --- Limpieza periódica ---
    if (Date.now() - lastCleanup > 5 * 60 * 1000) {
        cleanupMaps()
        lastCleanup = Date.now()
    }

    // 1️⃣ Bloqueo por IP
    if (FIREWALL_CONFIG.blockedIPs.includes(ip)) {
        console.log(`🔥 FIREWALL: IP bloqueada → ${ip}`)
        return new NextResponse('Access Denied', { status: 403 })
    }

    // 2️⃣ Bloqueo por User-Agent sospechoso
    if (isSuspiciousUserAgent(userAgent)) {
        console.log(`🔥 FIREWALL: User-Agent sospechoso → ${userAgent} (IP: ${ip})`)
        return new NextResponse('Access Denied', { status: 403 })
    }

    // 3️⃣ Detección de payloads maliciosos (SQL injection, XSS, etc.)
    if (isSuspiciousPayload(request.url)) {
        console.log(`🔥 FIREWALL: Payload malicioso detectado → ${request.url} (IP: ${ip})`)
        return new NextResponse('Access Denied', { status: 403 })
    }

    // 4️⃣ Rate limiting en rutas de login (anti brute-force)
    if (isProtectedPath(pathname) && request.method === 'POST') {
        if (isRateLimited(ip, true)) {
            console.log(`🔥 FIREWALL: Rate limit LOGIN → ${ip} (demasiados intentos)`)
            return NextResponse.json(
                { error: 'Demasiados intentos de inicio de sesión. Espera 1 minuto.' },
                { status: 429 }
            )
        }
    }

    // 5️⃣ Rate limiting general
    if (isRateLimited(ip, false)) {
        console.log(`🔥 FIREWALL: Rate limit GENERAL → ${ip}`)
        return new NextResponse('Too Many Requests', { status: 429 })
    }

    // 6️⃣ Aplicar cabeceras de seguridad a la respuesta
    const response = NextResponse.next()

    for (const [header, value] of Object.entries(FIREWALL_CONFIG.securityHeaders)) {
        response.headers.set(header, value)
    }

    // Cabeceras informativas del firewall
    response.headers.set('X-Firewall', 'CarCare-WAF/1.0')
    response.headers.set('X-Request-IP', ip)

    return response
}

// ═══════════════════════════════════════════════
// Rutas donde se aplica el middleware
// ═══════════════════════════════════════════════
export const config = {
    matcher: [
        /*
         * Aplica a todas las rutas EXCEPTO:
         * - _next/static (archivos estáticos)
         * - _next/image (optimización de imágenes)
         * - favicon.ico
         * - archivos públicos (imágenes, etc.)
         */
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
    ],
}
