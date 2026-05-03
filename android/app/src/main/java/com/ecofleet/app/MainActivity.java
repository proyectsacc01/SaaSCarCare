package com.ecofleet.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.SslErrorHandler;
import android.webkit.ValueCallback;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import android.Manifest;
import android.provider.MediaStore;

public class MainActivity extends Activity {

    private WebView mWebView;

    // Callback que el WebView nos da cuando un <input type="file"> es activado.
    // Lo guardamos para entregarle el resultado del picker en onActivityResult.
    private ValueCallback<Uri[]> mFilePathCallback;
    private static final int FILECHOOSER_REQUEST = 1100;

    private static final String API_URL = BuildConfig.API_URL;
    private static final String WEB_URL = BuildConfig.WEB_URL;
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

        // Eliminar el marcador ";wv" del user agent para que Google OAuth no bloquee el flujo
        String ua = webSettings.getUserAgentString();
        webSettings.setUserAgentString(ua.replace("; wv", ""));

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

        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED ||
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED ||
                checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED ||
                checkSelfPermission(Manifest.permission.READ_MEDIA_AUDIO) != PackageManager.PERMISSION_GRANTED ||
                checkSelfPermission(Manifest.permission.READ_MEDIA_IMAGES) != PackageManager.PERMISSION_GRANTED ||
                checkSelfPermission(Manifest.permission.READ_MEDIA_VIDEO) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.POST_NOTIFICATIONS,
                        Manifest.permission.RECORD_AUDIO,
                        Manifest.permission.READ_MEDIA_AUDIO,
                        Manifest.permission.READ_MEDIA_IMAGES,
                        Manifest.permission.READ_MEDIA_VIDEO
                }, 1);
            }
        } else {
            if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED ||
                checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED ||
                checkSelfPermission(Manifest.permission.READ_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.RECORD_AUDIO,
                        Manifest.permission.READ_EXTERNAL_STORAGE
                }, 1);
            }
        }

        mWebView.addJavascriptInterface(new WebAppInterface(this), "AndroidTracker");

        // Conceder permiso de geolocalización al WebView automáticamente
        // (el usuario ya otorgó ACCESS_FINE_LOCATION a la app en el diálogo del sistema)
        mWebView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                callback.invoke(origin, true, false);
            }

            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> {
                    java.util.List<String> granted = new java.util.ArrayList<>();
                    for (String resource : request.getResources()) {
                        if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) {
                            if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                                granted.add(resource);
                            }
                        } else {
                            granted.add(resource);
                        }
                    }

                    if (!granted.isEmpty()) {
                        request.grant(granted.toArray(new String[0]));
                    } else {
                        request.deny();
                    }
                });
            }

            // Habilita <input type="file"> dentro del WebView. Sin esto el botón
            // de adjuntar imagen del chat no hace nada en Android.
            @Override
            public boolean onShowFileChooser(WebView webView,
                                             ValueCallback<Uri[]> filePathCallback,
                                             FileChooserParams fileChooserParams) {
                // Si había un callback pendiente, lo cancelamos para no bloquear.
                if (mFilePathCallback != null) {
                    mFilePathCallback.onReceiveValue(null);
                }
                mFilePathCallback = filePathCallback;

                // Parsear el atributo accept="..." correctamente. Algunos WebViews
                // devuelven ["image/*,video/*"] como un solo string con coma —
                // lo expandimos a array de mimes individuales. setType no acepta
                // strings con coma, así que en ese caso usamos */* + EXTRA_MIME_TYPES.
                java.util.List<String> mimes = new java.util.ArrayList<>();
                String[] raw = fileChooserParams.getAcceptTypes();
                if (raw != null) {
                    for (String r : raw) {
                        if (r == null) continue;
                        for (String part : r.split(",")) {
                            String p = part.trim();
                            if (!p.isEmpty()) mimes.add(p);
                        }
                    }
                }
                if (mimes.isEmpty()) {
                    mimes.add("image/*");
                }

                // Intent principal: file picker estándar (Photos / Documents / Drive…).
                Intent contentIntent = new Intent(Intent.ACTION_GET_CONTENT);
                contentIntent.addCategory(Intent.CATEGORY_OPENABLE);
                if (mimes.size() == 1) {
                    contentIntent.setType(mimes.get(0));
                } else {
                    contentIntent.setType("*/*");
                    contentIntent.putExtra(Intent.EXTRA_MIME_TYPES, mimes.toArray(new String[0]));
                }
                if (fileChooserParams.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) {
                    contentIntent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                }

                // Intent extra: galería directa (ACTION_PICK). Es el que la mayoría
                // de los usuarios espera ver al tocar 📷. Lo agregamos como
                // alternativa visible en el chooser cuando el accept incluye imágenes.
                java.util.List<Intent> extras = new java.util.ArrayList<>();
                boolean wantsImages = false;
                boolean wantsAudio = false;
                for (String m : mimes) {
                    if (m.startsWith("image/")) { wantsImages = true; break; }
                    if (m.startsWith("audio/")) wantsAudio = true;
                }
                if (wantsImages) {
                    Intent gallery = new Intent(Intent.ACTION_PICK,
                            android.provider.MediaStore.Images.Media.EXTERNAL_CONTENT_URI);
                    gallery.setType("image/*");
                    extras.add(gallery);
                }
                if (wantsAudio) {
                    Intent audioRecorder = new Intent(MediaStore.Audio.Media.RECORD_SOUND_ACTION);
                    extras.add(audioRecorder);
                }

                Intent chooser = Intent.createChooser(contentIntent, "Adjuntar archivo");
                if (!extras.isEmpty()) {
                    chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, extras.toArray(new Intent[0]));
                }

                try {
                    startActivityForResult(chooser, FILECHOOSER_REQUEST);
                    return true;
                } catch (ActivityNotFoundException e) {
                    mFilePathCallback = null;
                    Toast.makeText(MainActivity.this,
                            "No hay app para elegir archivos",
                            Toast.LENGTH_SHORT).show();
                    return false;
                }
            }
        });

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
                android.util.Log.e("EcoFleet", "Error SSL bloqueado: " + error.getPrimaryError());
                handler.cancel();
            }

            // Intercepta links externos: Google Maps, navegación, intents, tel, mailto, etc.
            // Cualquier cosa que NO sea nuestro propio host se abre con un Intent externo
            // (Maps app, navegador, dialer...) en lugar de tratar de cargarla en el WebView.
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleUrl(view, request.getUrl().toString());
            }

            @SuppressWarnings("deprecation")
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleUrl(view, url);
            }

            private boolean handleUrl(WebView view, String url) {
                if (url == null) return false;

                // intent:// → resolver al intent real y lanzar
                if (url.startsWith("intent:")) {
                    try {
                        Intent intent = Intent.parseUri(url, Intent.URI_INTENT_SCHEME);
                        if (intent.resolveActivity(getPackageManager()) != null) {
                            startActivity(intent);
                            return true;
                        }
                        String fallback = intent.getStringExtra("browser_fallback_url");
                        if (fallback != null) {
                            view.loadUrl(fallback);
                            return true;
                        }
                    } catch (Exception e) {
                        android.util.Log.e("EcoFleet", "Error parseando intent URL: " + e.getMessage());
                    }
                    return true;
                }

                // Mapas, navegación, tel, mailto, sms, etc → siempre fuera del WebView
                boolean externalScheme = url.startsWith("tel:") || url.startsWith("mailto:")
                        || url.startsWith("sms:") || url.startsWith("geo:")
                        || url.startsWith("whatsapp:") || url.startsWith("market:");
                boolean isMaps = url.contains("maps.google.") || url.contains("google.com/maps")
                        || url.contains("maps.app.goo.gl") || url.contains("goo.gl/maps");

                if (externalScheme || isMaps) {
                    try {
                        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(intent);
                        return true;
                    } catch (ActivityNotFoundException e) {
                        Toast.makeText(MainActivity.this,
                                "No hay app para abrir esta URL",
                                Toast.LENGTH_SHORT).show();
                        return true;
                    }
                }

                // El resto (mismo host) se carga en el WebView
                return false;
            }
        });

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

        // Lanza una URL externa con la app correspondiente del sistema
        // (Google Maps, dialer, navegador...). Llamado desde JS.
        @JavascriptInterface
        public void openExternalUrl(String url) {
            if (url == null || url.isEmpty()) return;
            try {
                Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                mContext.startActivity(intent);
            } catch (ActivityNotFoundException e) {
                mContext.runOnUiThread(() -> Toast.makeText(mContext,
                        "No hay app instalada para abrir esa URL",
                        Toast.LENGTH_SHORT).show());
            } catch (Exception e) {
                android.util.Log.e("EcoFleet", "openExternalUrl falló: " + e.getMessage());
            }
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

    // Recibe el resultado del file picker (galería/archivos) y se lo entrega al
    // WebView vía el callback que guardamos en onShowFileChooser. Sin esto el
    // <input type="file"> queda colgado para siempre.
    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != FILECHOOSER_REQUEST) return;
        if (mFilePathCallback == null) return;

        Uri[] results = null;
        if (resultCode == Activity.RESULT_OK && data != null) {
            if (data.getClipData() != null) {
                int count = data.getClipData().getItemCount();
                results = new Uri[count];
                for (int i = 0; i < count; i++) {
                    results[i] = data.getClipData().getItemAt(i).getUri();
                }
            } else if (data.getData() != null) {
                results = new Uri[]{ data.getData() };
            }
        }
        mFilePathCallback.onReceiveValue(results);
        mFilePathCallback = null;
    }
}
