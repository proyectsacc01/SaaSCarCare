package com.carcare.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.JavascriptInterface;
import android.content.Intent;
import android.Manifest;
import android.content.pm.PackageManager;
import android.widget.Toast;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceError;
import android.webkit.SslErrorHandler;
import android.net.http.SslError;
import android.graphics.Bitmap;

public class MainActivity extends Activity {

    private WebView mWebView;

    // ═══ CONFIGURACIÓN DE URLS ═══
    // Inyectadas desde build.gradle por buildConfigField — NO hardcodear acá.
    // - debug:   http://10.0.2.2:3000  (frontend Next.js en localhost del host del emulador)
    // - release: https://saascarcare.up.railway.app (cambiar en build.gradle si usás otro dominio)
    private static final String API_URL = BuildConfig.API_URL;
    private static final String WEB_URL = BuildConfig.WEB_URL;

    // Ruta inicial - siempre al login de conductor
    private static final String INITIAL_PATH = "/conductor/login";

    @Override
    @SuppressLint("SetJavaScriptEnabled")
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        mWebView = new WebView(this);
        setContentView(mWebView);

        WebSettings webSettings = mWebView.getSettings();
        webSettings.setJavaScriptEnabled(true);
        webSettings.setDomStorageEnabled(true);
        webSettings.setDatabaseEnabled(true);
        webSettings.setAllowFileAccess(true);
        webSettings.setAllowContentAccess(true);
        webSettings.setLoadWithOverviewMode(true);
        webSettings.setUseWideViewPort(true);
        
        // Mixed content y debug solo en builds de desarrollo
        if (BuildConfig.DEBUG) {
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.LOLLIPOP) {
                webSettings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
            }
            WebView.setWebContentsDebuggingEnabled(true);
        } else {
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.LOLLIPOP) {
                webSettings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
            }
        }

        // Pedir permisos de ubicación y notificaciones (Android 13+)
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED ||
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.POST_NOTIFICATIONS}, 1);
            }
        } else {
            if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION}, 1);
            }
        }

        mWebView.addJavascriptInterface(new WebAppInterface(this), "AndroidTracker");
        
        mWebView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
                android.util.Log.d("EcoFleet", "Cargando URL: " + url);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                android.util.Log.d("EcoFleet", "Carga finalizada: " + url);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                android.util.Log.e("EcoFleet", "Error de WebView: " + error.getDescription());
            }

            @Override
            public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                // Política de Google Play: NUNCA aceptar certificados SSL inválidos en producción.
                android.util.Log.e("EcoFleet", "Error SSL bloqueado: " + error.getPrimaryError());
                handler.cancel();
            }
        });

        // Cargamos la URL del login de conductores
        mWebView.loadUrl(WEB_URL + INITIAL_PATH);
    }

    public class WebAppInterface {
        Activity mContext;

        WebAppInterface(Activity c) {
            mContext = c;
        }

        @JavascriptInterface
        public void startTracking(String rutaId) {
            Intent intent = new Intent(mContext, TrackingService.class);
            intent.putExtra("rutaId", rutaId);
            intent.putExtra("apiUrl", API_URL);
            
            // Solución para compatibilidad con API < 26
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                mContext.startForegroundService(intent);
            } else {
                mContext.startService(intent);
            }
            
            mContext.runOnUiThread(() -> Toast.makeText(mContext, "Iniciando GPS Nativo...", Toast.LENGTH_SHORT).show());
        }

        @JavascriptInterface
        public void stopTracking() {
            Intent intent = new Intent(mContext, TrackingService.class);
            mContext.stopService(intent);
            mContext.runOnUiThread(() -> Toast.makeText(mContext, "GPS Nativo Detenido", Toast.LENGTH_SHORT).show());
        }
    }

    @Override
    public void onBackPressed() {
        if (mWebView.canGoBack()) {
            mWebView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
