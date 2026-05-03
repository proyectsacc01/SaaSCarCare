# Checklist para subir CarCare a Google Play Console

Documento de trabajo. Marcá `[x]` cuando completes cada paso.

---

## 1. Cosas que YA dejé arregladas en el código

- [x] **SSL handler** → ya no acepta certificados inválidos (`MainActivity.java`).
- [x] **Package unificado** a `com.ecofleet.app` en manifest, gradle y código.
- [x] **`WEB_URL` y `API_URL` configurables** desde `build.gradle` (debug = `10.0.2.2`, release = Railway).
- [x] **`usesCleartextTraffic="false"`** en producción + `network_security_config.xml`.
- [x] **`minifyEnabled true` + ProGuard rules** que preservan el bridge `AndroidTracker`.
- [x] **Plantilla de signing config** (`android/keystore.properties.example`).
- [x] **Notificación del foreground service** ahora abre la app al tocarse (requisito de Google).
- [x] **Política de privacidad** en `/privacy` (frontend).
- [x] **Strings unificados** — la app se llama "CarCare".
- [x] **`.gitignore`** bloquea keystores y `keystore.properties`.

---

## 2. Lo que TENÉS que hacer vos antes de poder generar el AAB

### 2.1 Generar el keystore (UNA vez en tu vida)

Desde la raíz del repo, en la carpeta `android/`:

```bash
keytool -genkey -v -keystore keystore.jks -alias carcare -keyalg RSA -keysize 2048 -validity 10000
```

Te va a pedir:
- Una contraseña del keystore (anotala)
- Una contraseña de la clave (puede ser la misma)
- Tu nombre, organización, ciudad, país (cualquier dato real)

⚠️ **GUARDÁ EL `keystore.jks` EN UN SITIO SEGURO** (Drive, gestor de contraseñas, USB físico). Si lo perdés **NO podés actualizar la app en Play Console — nunca más**. Es la regla de oro.

### 2.2 Crear `android/keystore.properties`

Copiá `android/keystore.properties.example` a `android/keystore.properties` y rellená con tus contraseñas reales.

### 2.3 Verificar URL del frontend en `android/app/build.gradle`

Línea 22 dice:

```gradle
buildConfigField "String", "WEB_URL", "\"https://saascarcare.up.railway.app\""
```

**CONFIRMÁ que esa es la URL pública de tu frontend Next.js**. Si tu frontend está en Vercel o en otro dominio, cambialo. Si todavía no tenés frontend deployado, esto es lo PRIMERO que tenés que hacer porque sin frontend en producción la app Android no funciona — solo carga una pantalla en blanco.

### 2.4 Generar el AAB firmado

```bash
cd android
./gradlew bundleRelease
```

El AAB sale en `android/app/build/outputs/bundle/release/app-release.aab`. Ese es el archivo que subís a Play Console.

---

## 3. Configuración en Google Play Console

### 3.1 Datos de la ficha de Play Store

| Campo | Valor sugerido |
|---|---|
| Nombre | `CarCare — Conductor de Flota` |
| Descripción corta (80 chars) | `Recibí rutas, registrá GPS y comunicate con tu central. Para flotas profesionales.` |
| Descripción larga | Ver plantilla abajo. |
| Categoría | Productividad / Negocios |
| Idioma principal | Español |
| Email de contacto | `elenarodriguez0097@gmail.com` |
| Política de privacidad (URL) | `https://<TU_FRONTEND>/privacy` |

**Plantilla descripción larga:**

```
CarCare es una plataforma profesional de gestión de flotas. Esta aplicación está diseñada
para los conductores que forman parte de una empresa que utiliza CarCare Tracker.

Funcionalidades para el conductor:
✓ Recibir rutas asignadas con origen, destino y distancia estimada
✓ Iniciar, pausar y completar el rastreo GPS en tiempo real
✓ Registrar repostajes con litros, precio y kilometraje
✓ Comunicarse directamente con la central durante la ruta
✓ Detección automática de desvíos (más del 20% del corredor planificado)

La aplicación requiere una cuenta proporcionada por tu empresa. Si tu empresa todavía no
utiliza CarCare, contactá con su equipo de gestión.

Privacidad: la ubicación GPS se transmite ÚNICAMENTE mientras tenés una ruta activa, y se
envía cifrada a los servidores de tu empresa. Nunca compartimos datos con terceros.
```

### 3.2 Permisos sensibles — formulario obligatorio

Cuando subas el AAB, Play Console te va a pedir justificación de los siguientes permisos. Copiá y pegá:

**`ACCESS_FINE_LOCATION` + `FOREGROUND_SERVICE_LOCATION`:**
> La app comparte la ubicación GPS del vehículo con la central de la empresa contratante mientras el conductor tiene una ruta activa, con el fin de calcular distancia recorrida, velocidad, tiempo estimado de llegada y detectar desvíos del trayecto planificado. La ubicación NO se recopila fuera de una ruta activa. El usuario puede pausar la ruta en cualquier momento, lo que detiene inmediatamente la transmisión.

**Foreground service type `location`:**
> Servicio en primer plano necesario para mantener actualizaciones GPS continuas (cada 2 segundos) durante la ruta. La aplicación muestra una notificación persistente mientras el servicio está activo.

### 3.3 Data Safety form

Datos que recopilás → declarar:

| Categoría | Datos | Recopilación | Compartida | Opcional |
|---|---|---|---|---|
| Personal info | Nombre, email | Sí | No | No (login obligatorio) |
| Location | Approximate + Precise | Sí | No (solo central) | Sí (durante ruta) |
| App activity | Interactions in-app | Sí | No | No |
| Device IDs | Device ID | Sí | No | No |

Marcá:
- ✅ Datos cifrados en tránsito
- ✅ Usuario puede solicitar borrado (escribir a `elenarodriguez0097@gmail.com`)

### 3.4 Content rating

Categoría: Productividad → cuestionario sin contenido sensible → rating PEGI 3 / Everyone.

---

## 4. Casos de uso del flujo conductor — pruebas manuales

Estos son los CUs que **vos** tenés que correr en un dispositivo físico (o el emulador) ANTES de subir el AAB. Si alguno falla, abrime un issue.

### CU-1 — Registro de conductor

| Paso | Acción | Resultado esperado |
|---|---|---|
| 1 | Instalar APK debug | App abre y carga `/conductor/login` |
| 2 | Tap en "Regístrate aquí" | Cambia a formulario de registro |
| 3 | Rellenar nombre, email, password | Sin errores de validación |
| 4 | Email de empresa válido | Se vincula a la flota |
| 5 | Tap "Crear cuenta" | Navega al dashboard del conductor |

❗ **Edge case:** email empresa inexistente → toast "Empresa no encontrada".

### CU-2 — Login email/password

| Paso | Resultado |
|---|---|
| 1. Login con credenciales correctas | Token guardado en `localStorage`, navega a `/conductor` |
| 2. Login con password incorrecto | Toast "Credenciales inválidas", queda en login |
| 3. Login sin internet | Toast "Error de conexión — revisá tu internet" tras 60s |

### CU-3 — Login con Google

| Paso | Resultado |
|---|---|
| 1. Tap "Continuar con Google" | Abre flujo OAuth en WebView |
| 2. Cuenta nueva → pide empresaEmail | Aparece input adicional |
| 3. EmpresaEmail correcto | Vinculado, navega a `/conductor` |

### CU-4 — Recibir ruta asignada

| Paso | Resultado |
|---|---|
| 1. Empresa crea ruta y la asigna al conductor | A los ≤10s aparece en el dashboard del conductor (auto-refresh) |
| 2. La ruta se muestra con origen, destino, distancia | OK |

### CU-5 — Iniciar tracking GPS (Android nativo)

| Paso | Resultado |
|---|---|
| 1. Tap "Iniciar Trayecto" | Toast "Iniciando GPS Nativo..." |
| 2. Notificación persistente "CarCare — Ruta en curso" aparece | OK |
| 3. Verificar logs del backend: POSTs a `/api/rutas/{id}/gps` cada 2s | OK |
| 4. Backend devuelve 200 OK | OK |

❗ **Edge case:** primer arranque, permiso GPS denegado → app muestra toast "Permiso GPS denegado". El usuario debe ir a Ajustes → Apps → CarCare → Permisos para concederlo.

### CU-6 — GPS continuo durante ruta

| Paso | Resultado |
|---|---|
| 1. Mover físicamente el dispositivo (caminar/conducir) | Las coords actualizan en `/api/rutas/{id}/gps` |
| 2. Cerrar la app (no force-stop, solo tapping fuera) | Notificación sigue, GPS sigue enviándose |
| 3. Bloquear la pantalla del teléfono | Lo mismo |
| 4. Reabrir la app | Recupera estado correcto |

❗ **Edge case:** modo avión durante 30s → al volver, el TrackingService retoma envío.

### CU-7 — Pausar ruta

| Paso | Resultado |
|---|---|
| 1. Tap "Pausar" | Toast "Trayecto pausado", `AndroidTracker.stopTracking()` se invoca |
| 2. Notificación persistente desaparece | OK |
| 3. No más POSTs al backend | OK |

### CU-8 — Reanudar ruta

| Paso | Resultado |
|---|---|
| 1. Tap "Reanudar" en una ruta pausada | `AndroidTracker.startTracking()` arranca de nuevo |
| 2. Notificación reaparece | OK |

### CU-9 — Completar ruta

| Paso | Resultado |
|---|---|
| 1. Tap "Completar trayecto" | Toast "Trayecto completado" |
| 2. `stopTracking()` invocado | Notificación desaparece |
| 3. Estado en backend = `COMPLETADA` | OK |
| 4. Ruta desaparece de la lista activa del conductor | OK |

### CU-10 — Chat con la central

| Paso | Resultado |
|---|---|
| 1. Abrir chat de la ruta | Lista mensajes existentes |
| 2. Enviar "Hola, llegué" | Aparece en panel de la empresa |
| 3. Empresa responde | Aparece en la app del conductor sin recargar |

❗ **Edge case:** chat sin conexión → mensaje se queda en pending hasta volver online (verificar comportamiento actual).

### CU-11 — Detección de desvío

| Paso | Resultado |
|---|---|
| 1. Iniciar ruta planificada Madrid → Barcelona | OK |
| 2. Mandar coords de Lisboa (simular desvío) | Backend detecta desvío >20% y emite alerta |
| 3. Empresa ve alerta "Conductor desviado" | OK |

### CU-12 — Permiso GPS denegado de inicio

| Paso | Resultado |
|---|---|
| 1. Primera apertura, denegar GPS en el diálogo del sistema | App muestra mensaje claro pidiendo activarlo |
| 2. App NO crashea | OK |
| 3. Conductor puede registrar repostajes pero no iniciar ruta | Verificar |

### CU-13 — Sin conexión durante ruta

| Paso | Resultado |
|---|---|
| 1. Ruta activa, modo avión 30s | TrackingService no crashea, log "Error enviando GPS" |
| 2. Volver online | Se reanudan los envíos automáticamente |

❗ **No tenemos buffer offline** — los puntos GPS perdidos durante el modo avión NO se recuperan. Es decisión de producto si querés agregarlo después.

### CU-14 — Logout y limpieza

| Paso | Resultado |
|---|---|
| 1. Tap "Cerrar sesión" | Token + user removidos de `localStorage` |
| 2. Navega a `/conductor/login` | OK |
| 3. Si había ruta activa → tracking detenido | Verificar |

---

## 5. Riesgos conocidos / cosas a considerar después

1. **Endpoint `/api/rutas/{id}/gps` no requiere autenticación.** Cualquiera con el rutaId puede plantar coordenadas falsas. Para una v1 está bien (rutaId no es trivial de adivinar), pero en v2 deberías protegerlo con un token específico de ruta.

2. **No hay buffer offline.** Coords perdidas durante desconexión no se reenvían.

3. **No hay versionado de la API.** Si cambiás el backend de forma incompatible, la app vieja se rompe.

4. **`testers` antes de release pública** → recomiendo subir primero a "Internal testing track" y probar con tu propia cuenta + 1 conductor real durante una semana antes de pasar a producción.

5. **Iconos** — los iconos en `android/app/src/main/res/mipmap-*` están sin revisar. Si son los placeholders verdes de Android, Play Console te los va a aceptar pero quedan feos. Generá iconos custom con [Image Asset Studio](https://developer.android.com/studio/write/image-asset-studio) en Android Studio.

---

## 6. Comandos rápidos

```bash
# Build debug (instalable en emulador)
cd android && ./gradlew assembleDebug

# Build release firmado (para Play Console)
cd android && ./gradlew bundleRelease

# Limpiar build
cd android && ./gradlew clean

# Ver logs de la app conectada por adb
adb logcat | grep -E "EcoFleet|TrackingService|CarCare"
```
