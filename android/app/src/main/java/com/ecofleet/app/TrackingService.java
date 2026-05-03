package com.ecofleet.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.Location;
import android.os.Build;
import android.os.HandlerThread;
import android.os.IBinder;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

public class TrackingService extends Service {

    private static final String TAG = "TrackingService";
    private static final String CHANNEL_ID = "TrackingChannel";
    private static final int NOTIFICATION_ID = 1;
    private static final long UPDATE_INTERVAL_MS = 4000;
    private static final long FASTEST_INTERVAL_MS = 2000;
    // Descartar lecturas con precisión peor que 80 metros
    private static final float MAX_ACCURACY_M = 80.0f;

    private FusedLocationProviderClient fusedLocationClient;
    private LocationCallback locationCallback;
    private HandlerThread locationThread;
    private String rutaId;
    private String API_URL = BuildConfig.API_URL;

    @Override
    public void onCreate() {
        super.onCreate();
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this);
        crearCanalNotificacion();

        // Hilo dedicado para callbacks GPS — nunca bloquear el hilo principal
        locationThread = new HandlerThread("EcoFleetGPS");
        locationThread.start();

        locationCallback = new LocationCallback() {
            @Override
            public void onLocationResult(LocationResult result) {
                if (result == null) return;
                Location loc = result.getLastLocation();
                if (loc == null) return;

                // Ignorar lecturas demasiado imprecisas (red/wifi en interior)
                if (loc.getAccuracy() > MAX_ACCURACY_M) {
                    Log.w(TAG, "Ubicación descartada — precisión: " + loc.getAccuracy() + "m (límite " + MAX_ACCURACY_M + "m)");
                    return;
                }

                Log.d(TAG, String.format(Locale.US,
                    "GPS ✓  lat=%.6f  lng=%.6f  acc=%.1fm  proveedor=%s",
                    loc.getLatitude(), loc.getLongitude(),
                    loc.getAccuracy(), loc.getProvider()));

                enviarUbicacion(loc);
            }
        };
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            if (intent.hasExtra("rutaId"))  rutaId  = intent.getStringExtra("rutaId");
            if (intent.hasExtra("apiUrl"))  API_URL = intent.getStringExtra("apiUrl");
        }

        startForegroundWithNotification();

        // Verificar permisos antes de pedir GPS
        if (ContextCompat.checkSelfPermission(this, android.Manifest.permission.ACCESS_FINE_LOCATION)
                != PackageManager.PERMISSION_GRANTED) {
            Log.e(TAG, "Sin permiso ACCESS_FINE_LOCATION — deteniendo servicio");
            stopSelf();
            return START_NOT_STICKY;
        }

        // Enviar la última ubicación conocida inmediatamente para respuesta rápida
        try {
            fusedLocationClient.getLastLocation().addOnSuccessListener(loc -> {
                if (loc != null && rutaId != null) {
                    Log.d(TAG, "Enviando última ubicación conocida");
                    enviarUbicacion(loc);
                }
            });
        } catch (SecurityException e) {
            Log.w(TAG, "No se pudo obtener última ubicación: " + e.getMessage());
        }

        iniciarActualizacionesGPS();

        // START_STICKY: el sistema reinicia el servicio si lo mata
        return START_STICKY;
    }

    private void iniciarActualizacionesGPS() {
        LocationRequest request = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, UPDATE_INTERVAL_MS)
            .setWaitForAccurateLocation(true)
            .setMinUpdateIntervalMillis(FASTEST_INTERVAL_MS)
            .setMaxUpdateDelayMillis(UPDATE_INTERVAL_MS + 2000)
            .build();

        try {
            fusedLocationClient.requestLocationUpdates(request, locationCallback, locationThread.getLooper());
            Log.d(TAG, "Actualizaciones GPS iniciadas para ruta: " + rutaId);
        } catch (SecurityException e) {
            Log.e(TAG, "Error de seguridad al iniciar GPS: " + e.getMessage());
            stopSelf();
        }
    }

    private void enviarUbicacion(Location loc) {
        new Thread(() -> {
            try {
                URL url = new URL(API_URL + "/api/rutas/" + rutaId + "/gps");
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setDoOutput(true);
                conn.setConnectTimeout(8000);
                conn.setReadTimeout(8000);

                // CRÍTICO: Locale.US garantiza punto decimal en dispositivos con locale español
                // Sin esto, String.format usa coma y el JSON es inválido → coordenadas no se guardan
                double velocidadKmh = loc.hasSpeed() ? Math.max(0, loc.getSpeed() * 3.6) : -1;
                String json = String.format(Locale.US,
                    "{\"latitud\":%.7f,\"longitud\":%.7f,\"precision\":%.1f,\"velocidadKmh\":%.1f}",
                    loc.getLatitude(), loc.getLongitude(), loc.getAccuracy(), velocidadKmh);

                try (OutputStream os = conn.getOutputStream()) {
                    os.write(json.getBytes(StandardCharsets.UTF_8));
                }

                int code = conn.getResponseCode();
                if (code == 200 || code == 201) {
                    Log.d(TAG, "✓ GPS enviado: " + json);
                } else {
                    Log.w(TAG, "⚠ Servidor respondió " + code + " | payload: " + json);
                }
                conn.disconnect();
            } catch (Exception e) {
                Log.e(TAG, "✗ Error enviando GPS: " + e.getMessage());
            }
        }).start();
    }

    private void startForegroundWithNotification() {
        Intent openApp = new Intent(this, MainActivity.class);
        openApp.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int pflags = PendingIntent.FLAG_UPDATE_CURRENT |
            (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent pi = PendingIntent.getActivity(this, 0, openApp, pflags);

        Notification notif = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("EcoFleet — GPS Activo")
            .setContentText("Enviando ubicación en tiempo real")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentIntent(pi)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notif,
                android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } else {
            startForeground(NOTIFICATION_ID, notif);
        }
    }

    private void crearCanalNotificacion() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                CHANNEL_ID, "GPS Tracking", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Notificación de tracking GPS activo");
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(ch);
        }
    }

    @Override
    public void onDestroy() {
        if (fusedLocationClient != null && locationCallback != null) {
            fusedLocationClient.removeLocationUpdates(locationCallback);
        }
        if (locationThread != null) locationThread.quitSafely();
        Log.d(TAG, "TrackingService detenido");
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) { return null; }
}
