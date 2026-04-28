# ─── ProGuard / R8 rules para CarCare ────────────────────────────────────────

# Mantener la clase del bridge JS↔Java. Sin esto, R8 renombra los métodos
# `startTracking` / `stopTracking` y el frontend (window.AndroidTracker) deja de funcionar.
-keepclassmembers class com.carcare.app.MainActivity$WebAppInterface {
    @android.webkit.JavascriptInterface <methods>;
}
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Mantener clases del SDK de Google Play Services (Location)
-keep class com.google.android.gms.location.** { *; }
-dontwarn com.google.android.gms.**

# WebView
-keepclassmembers class * extends android.webkit.WebViewClient {
    public void *(android.webkit.WebView, java.lang.String, android.graphics.Bitmap);
    public boolean *(android.webkit.WebView, java.lang.String);
}
-keepclassmembers class * extends android.webkit.WebViewClient {
    public void *(android.webkit.WebView, java.lang.String);
}

# Service y Activity
-keep class com.carcare.app.MainActivity { *; }
-keep class com.carcare.app.TrackingService { *; }

# AndroidX y Material
-keep class androidx.** { *; }
-dontwarn androidx.**

# Quitar logs en release (opcional pero limpia el AAB)
-assumenosideeffects class android.util.Log {
    public static *** d(...);
    public static *** v(...);
}
