package com.ecofleet.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.location.Location;
import android.os.Build;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

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

public class TrackingService extends Service {

    private static final String CHANNEL_ID = "TrackingChannel";
    private FusedLocationProviderClient fusedLocationClient;
    private LocationCallback locationCallback;
    private String rutaId;
    private static final String TAG = "TrackingService";

    // URL de tu backend — viene desde BuildConfig (debug = local, release = Railway)
    private String API_URL = BuildConfig.API_URL;

    @Override
    public void onCreate() {
        super.onCreate();
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this);
        crearCanalNotificacion();
        
        locationCallback = new LocationCallback() {
            @Override
            public void onLocationResult(LocationResult locationResult) {
                if (locationResult == null) return;
                for (Location location : locationResult.getLocations()) {
                    enviarUbicacionAlBackend(location);
                }
            }
        };
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && intent.hasExtra("rutaId")) {
            rutaId = intent.getStringExtra("rutaId");
            if (intent.hasExtra("apiUrl")) {
                API_URL = intent.getStringExtra("apiUrl");
            }
        }

        // Intent que abre la app cuando el usuario toca la notificación
        Intent openAppIntent = new Intent(this, MainActivity.class);
        openAppIntent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            pendingFlags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent openAppPI = PendingIntent.getActivity(this, 0, openAppIntent, pendingFlags);

        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("CarCare — Ruta en curso")
                .setContentText("Compartiendo ubicación con la central")
                .setSmallIcon(android.R.drawable.ic_menu_mylocation)
                .setContentIntent(openAppPI)
                .setOngoing(true)
                .setCategory(NotificationCompat.CATEGORY_SERVICE)
                .build();

        // En Android 10 (API 29) y posteriores, es obligatorio especificar el tipo de servicio
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(1, notification, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } else {
            startForeground(1, notification);
        }
        
        solicitarActualizacionesUbicacion();
        
        return START_NOT_STICKY;
    }

    private void solicitarActualizacionesUbicacion() {
        // Actualización cada 2 segundos para tracking en tiempo real
        LocationRequest locationRequest = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 2000)
                .setWaitForAccurateLocation(false)
                .setMinUpdateIntervalMillis(1000) // Mínimo 1 segundo entre actualizaciones
                .setMaxUpdateDelayMillis(3000)
                .build();

        try {
            Log.d(TAG, "Iniciando solicitud de actualizaciones de ubicación para ruta: " + rutaId);
            fusedLocationClient.requestLocationUpdates(locationRequest, locationCallback, Looper.getMainLooper());
        } catch (SecurityException e) {
            Log.e(TAG, "Error: Sin permisos de ubicación", e);
        }
    }

    private void enviarUbicacionAlBackend(Location location) {
        Log.d(TAG, String.format("Nueva ubicación GPS: lat=%.6f, lng=%.6f, precisión=%.1fm", 
            location.getLatitude(), location.getLongitude(), location.getAccuracy()));
        
        new Thread(() -> {
            try {
                // Usar endpoint dedicado de GPS que calcula velocidad y distancia restante
                URL url = new URL(API_URL + "/api/rutas/" + rutaId + "/gps");
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setDoOutput(true);
                conn.setConnectTimeout(5000);
                conn.setReadTimeout(5000);

                String jsonInputString = String.format(
                    "{\"latitud\": %f, \"longitud\": %f}",
                    location.getLatitude(), location.getLongitude()
                );

                Log.d(TAG, "Enviando GPS al backend: " + API_URL + "/api/rutas/" + rutaId + "/gps");

                try (OutputStream os = conn.getOutputStream()) {
                    byte[] input = jsonInputString.getBytes(StandardCharsets.UTF_8);
                    os.write(input, 0, input.length);
                }

                int responseCode = conn.getResponseCode();
                if (responseCode == 200) {
                    Log.d(TAG, "✓ GPS enviado correctamente - velocidad y distancia calculadas");
                } else {
                    Log.w(TAG, "⚠ Respuesta del servidor: " + responseCode);
                }
                conn.disconnect();
            } catch (Exception e) {
                Log.e(TAG, "✗ Error enviando GPS al backend: " + e.getMessage(), e);
            }
        }).start();
    }

    private void crearCanalNotificacion() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel serviceChannel = new NotificationChannel(
                    CHANNEL_ID,
                    "Tracking Service Channel",
                    NotificationManager.IMPORTANCE_LOW
            );
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(serviceChannel);
            }
        }
    }

    @Override
    public void onDestroy() {
        fusedLocationClient.removeLocationUpdates(locationCallback);
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
