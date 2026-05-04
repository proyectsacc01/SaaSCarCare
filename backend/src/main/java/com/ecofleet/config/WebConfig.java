package com.ecofleet.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Config CORS global. Reemplaza la versión vieja que solo permitía
 * localhost / 10.0.2.2 — eso rompía en producción (Vercel) sobre todo
 * en Safari iOS, que es muy estricto con preflight cuando los headers
 * CORS no concuerdan exactamente.
 *
 * Usamos allowedOriginPatterns en lugar de allowedOrigins para poder
 * aceptar Vercel preview deploys (subdominios variables) y, al mismo
 * tiempo, mantener la posibilidad de credentials si las activamos en
 * el futuro. Los controllers también tienen @CrossOrigin(*) — esto
 * es la fuente de verdad central.
 */
@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/**")
                .allowedOriginPatterns(
                        "http://localhost:*",
                        "http://10.0.2.2:*",
                        "https://*.vercel.app",
                        "https://saa-s-car-care-85l6.vercel.app",
                        "capacitor://localhost",
                        "ionic://localhost",
                        "file://*"
                )
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH")
                .allowedHeaders("*")
                .exposedHeaders("Authorization", "Content-Type")
                .allowCredentials(false)
                .maxAge(3600);
    }
}
