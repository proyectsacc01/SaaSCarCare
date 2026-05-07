package com.ecofleet.controller;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class RutaControllerGpsFilterTest {

    @Test
    void debeContarMovimientoRealAunqueLaPrecisionSeaMedia() {
        // 42 metros con precisión de 50m y velocidad real de ciudad.
        // Antes este tramo podía descartarse por comparar contra un umbral enorme.
        assertThat(RutaController.debeAcumularSegmento(0.042, 50.0, 48.0, 48.0)).isTrue();
    }

    @Test
    void debeIgnorarJitterCortoCuandoNoHayMovimientoReal() {
        assertThat(RutaController.debeAcumularSegmento(0.002, 10.0, 0.0, 0.8)).isFalse();
    }

    @Test
    void debeAcotarElUmbralParaNoPerderTramosReales() {
        assertThat(RutaController.calcularUmbralAcumulacionMetros(80.0)).isEqualTo(12.0);
        assertThat(RutaController.calcularUmbralAcumulacionMetros(8.0)).isEqualTo(3.0);
    }

    @Test
    void debeDescartarVelocidadesImposibles() {
        assertThat(RutaController.esVelocidadGpsPosible(120.0)).isTrue();
        assertThat(RutaController.esVelocidadGpsPosible(260.0)).isFalse();
        assertThat(RutaController.esVelocidadGpsPosible(null)).isFalse();
    }
}
