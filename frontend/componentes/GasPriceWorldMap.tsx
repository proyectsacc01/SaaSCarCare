"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import styles from "./GasPriceWorldMap.module.css";
import {
  FUEL_PRICES,
  ISO2_TO_ISO3,
  getPriceColor,
  getChangeColor,
  type CountryFuelPrice,
} from "./gasPriceData";

// ── Types ──
type FuelType = "gasoline" | "diesel";

interface GasPriceWorldMapProps {
  t: {
    gasMap: {
      title: string;
      subtitle: string;
      gasoline: string;
      diesel: string;
      refresh: string;
      loading: string;
      globalAvg: string;
      cheapest: string;
      expensive: string;
      countries: string;
      usdPerLiter: string;
      weeklyChange: string;
      region: string;
      lastUpdated: string;
      source: string;
      topExpensive: string;
      topCheapest: string;
      noData: string;
      cheap: string;
      mid: string;
      pricey: string;
    };
  };
  locale: string;
}

// GeoJSON URL — Natural Earth 110m simplified (lightweight ~200KB)
const GEOJSON_URL =
  "https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson";

// Build lookup: ISO3 → price data
const iso3ToPriceMap = new Map<string, CountryFuelPrice>();
FUEL_PRICES.forEach((fp) => {
  const iso3 = ISO2_TO_ISO3[fp.code];
  if (iso3) iso3ToPriceMap.set(iso3, fp);
});

// ── Map zoom reset helper ──
function MapBoundsReset() {
  const map = useMap();
  useEffect(() => {
    map.setView([25, 10], 2);
    map.setMaxBounds([[-85, -220], [85, 220]]);
    map.setMinZoom(2);
  }, [map]);
  return null;
}

// ── Main Component ──
export default function GasPriceWorldMap({ t, locale }: GasPriceWorldMapProps) {
  const [fuelType, setFuelType] = useState<FuelType>("gasoline");
  const [geoData, setGeoData] = useState<GeoJSON.FeatureCollection | null>(null);
  const [loadingGeo, setLoadingGeo] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredCountry, setHoveredCountry] = useState<CountryFuelPrice | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const geoJsonRef = useRef<L.GeoJSON | null>(null);

  // Fetch GeoJSON
  useEffect(() => {
    let cancelled = false;
    setLoadingGeo(true);
    fetch(GEOJSON_URL)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch map data");
        return res.json();
      })
      .then((data) => {
        if (!cancelled) {
          setGeoData(data);
          setLoadingGeo(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message);
          setLoadingGeo(false);
        }
      });
    return () => { cancelled = true; };
  }, []);

  // Computed stats
  const stats = useMemo(() => {
    const prices = FUEL_PRICES.map((fp) => fuelType === "gasoline" ? fp.gasoline : fp.diesel);
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
    const sorted = [...FUEL_PRICES].sort((a, b) => {
      const pa = fuelType === "gasoline" ? a.gasoline : a.diesel;
      const pb = fuelType === "gasoline" ? b.gasoline : b.diesel;
      return pa - pb;
    });
    return {
      avg,
      cheapest: sorted[0],
      expensive: sorted[sorted.length - 1],
      count: FUEL_PRICES.length,
      topExpensive: sorted.slice(-6).reverse(),
      topCheapest: sorted.slice(0, 6),
    };
  }, [fuelType]);

  // Style each country feature
  const styleFeature = useCallback(
    (feature: GeoJSON.Feature | undefined) => {
      if (!feature?.properties) return { fillColor: "#1e293b", fillOpacity: 0.6, weight: 0.3, color: "rgba(255,255,255,0.08)" };
      const iso3 = feature.properties.ISO_A3 || feature.properties.ADM0_A3;
      const priceData = iso3ToPriceMap.get(iso3);
      if (!priceData) return { fillColor: "#1e293b", fillOpacity: 0.5, weight: 0.3, color: "rgba(255,255,255,0.08)" };
      const price = fuelType === "gasoline" ? priceData.gasoline : priceData.diesel;
      return {
        fillColor: getPriceColor(price),
        fillOpacity: 0.75,
        weight: 0.5,
        color: "rgba(255,255,255,0.12)",
      };
    },
    [fuelType]
  );

  // Feature event handlers
  const onEachFeature = useCallback(
    (feature: GeoJSON.Feature, layer: L.Layer) => {
      const iso3 = feature.properties?.ISO_A3 || feature.properties?.ADM0_A3;
      const priceData = iso3ToPriceMap.get(iso3);

      layer.on({
        mouseover: (e: L.LeafletMouseEvent) => {
          const target = e.target as L.Path;
          target.setStyle({ weight: 2, color: "rgba(255,255,255,0.5)", fillOpacity: 0.9 });
          target.bringToFront();
          if (priceData) setHoveredCountry(priceData);
        },
        mousemove: (e: L.LeafletMouseEvent) => {
          setTooltipPos({ x: e.originalEvent.clientX + 15, y: e.originalEvent.clientY - 10 });
        },
        mouseout: (e: L.LeafletMouseEvent) => {
          const target = e.target as L.Path;
          if (geoJsonRef.current) {
            geoJsonRef.current.resetStyle(target);
          }
          setHoveredCountry(null);
        },
      });
    },
    []
  );

  // Re-style when fuel type changes
  useEffect(() => {
    if (geoJsonRef.current && geoData) {
      geoJsonRef.current.setStyle(styleFeature as L.StyleFunction);
    }
  }, [fuelType, styleFeature, geoData]);

  const getPrice = (fp: CountryFuelPrice) => fuelType === "gasoline" ? fp.gasoline : fp.diesel;

  return (
    <div className={styles.container}>
      {/* Loading Overlay */}
      {loadingGeo && (
        <div className={styles.loadingOverlay}>
          <div className={styles.loadingSpinner} />
          <span className={styles.loadingText}>{t.gasMap.loading}</span>
        </div>
      )}

      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h2>
            <span>⛽</span> {t.gasMap.title}
          </h2>
          <p>{t.gasMap.subtitle}</p>
          <div className={styles.sourceTag}>
            <span className={styles.sourceDot} />
            {t.gasMap.source}: World Bank · US EIA · EU Commission
          </div>
        </div>
        <div className={styles.controls}>
          <div className={styles.fuelToggle}>
            <button
              className={`${styles.fuelBtn} ${fuelType === "gasoline" ? styles.fuelBtnActive : ""}`}
              onClick={() => setFuelType("gasoline")}
            >
              {t.gasMap.gasoline}
            </button>
            <button
              className={`${styles.fuelBtn} ${fuelType === "diesel" ? styles.fuelBtnActive : ""}`}
              onClick={() => setFuelType("diesel")}
            >
              {t.gasMap.diesel}
            </button>
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      <div className={styles.statsBar}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>{t.gasMap.globalAvg}</div>
          <div className={styles.statValue} style={{ color: "#f59e0b" }}>
            ${stats.avg.toFixed(3)}
          </div>
          <div className={styles.statSub} style={{ color: "#94a3b8" }}>
            {t.gasMap.usdPerLiter}
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>{t.gasMap.cheapest}</div>
          <div className={styles.statValue} style={{ color: "#22c55e" }}>
            ${getPrice(stats.cheapest).toFixed(3)}
          </div>
          <div className={styles.statSub} style={{ color: "#22c55e" }}>
            {stats.cheapest.flag} {locale === "es" ? stats.cheapest.nameEs : stats.cheapest.name}
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>{t.gasMap.expensive}</div>
          <div className={styles.statValue} style={{ color: "#ef4444" }}>
            ${getPrice(stats.expensive).toFixed(3)}
          </div>
          <div className={styles.statSub} style={{ color: "#ef4444" }}>
            {stats.expensive.flag} {locale === "es" ? stats.expensive.nameEs : stats.expensive.name}
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>{t.gasMap.countries}</div>
          <div className={styles.statValue} style={{ color: "#a78bfa" }}>
            {stats.count}
          </div>
          <div className={styles.statSub} style={{ color: "#94a3b8" }}>
            {t.gasMap.lastUpdated}: Q1 2025
          </div>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className={styles.errorBanner}>
          ⚠️ {error}
        </div>
      )}

      {/* Map */}
      {!loadingGeo && geoData && (
        <>
          <div className={styles.mapWrapper}>
            <MapContainer
              center={[25, 10]}
              zoom={2}
              scrollWheelZoom={true}
              dragging={true}
              zoomControl={true}
              style={{ height: "480px", width: "100%", borderRadius: "12px", background: "#0f172a" }}
              attributionControl={false}
            >
              <MapBoundsReset />
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
                attribution=""
              />
              <GeoJSON
                ref={(ref) => { geoJsonRef.current = ref as L.GeoJSON | null; }}
                data={geoData}
                style={styleFeature}
                onEachFeature={onEachFeature}
              />
            </MapContainer>
          </div>

          {/* Legend */}
          <div className={styles.legend}>
            <span className={styles.legendLabel}>{t.gasMap.cheap} $0.02</span>
            <div className={styles.legendBar} />
            <span className={styles.legendLabel}>$2.40 {t.gasMap.pricey}</span>
          </div>
        </>
      )}

      {/* Tooltip */}
      {hoveredCountry && (
        <div
          className={styles.tooltip}
          style={{ left: tooltipPos.x, top: tooltipPos.y }}
        >
          <div className={styles.tooltipCountry}>
            <span className={styles.tooltipFlag}>{hoveredCountry.flag}</span>
            <div>
              <div className={styles.tooltipName}>
                {locale === "es" ? hoveredCountry.nameEs : hoveredCountry.name}
              </div>
              <div className={styles.tooltipRegion}>{hoveredCountry.region}</div>
            </div>
          </div>
          <div className={styles.tooltipPrice}>
            <span className={styles.tooltipPriceValue}>${getPrice(hoveredCountry).toFixed(3)}</span>
            <span className={styles.tooltipPriceUnit}>{t.gasMap.usdPerLiter}</span>
          </div>
          <div className={styles.tooltipMeta}>
            <div className={styles.tooltipMetaRow}>
              <span className={styles.tooltipMetaLabel}>{t.gasMap.weeklyChange}</span>
              <span className={styles.tooltipMetaValue} style={{ color: getChangeColor(hoveredCountry.change7d) }}>
                {hoveredCountry.change7d > 0 ? "+" : ""}{hoveredCountry.change7d.toFixed(1)}%
              </span>
            </div>
            <div className={styles.tooltipMetaRow}>
              <span className={styles.tooltipMetaLabel}>{t.gasMap.gasoline}</span>
              <span className={styles.tooltipMetaValue} style={{ color: "#f59e0b" }}>
                ${hoveredCountry.gasoline.toFixed(3)}
              </span>
            </div>
            <div className={styles.tooltipMetaRow}>
              <span className={styles.tooltipMetaLabel}>{t.gasMap.diesel}</span>
              <span className={styles.tooltipMetaValue} style={{ color: "#60a5fa" }}>
                ${hoveredCountry.diesel.toFixed(3)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Rankings */}
      <div className={styles.rankings}>
        <div className={styles.rankingCard}>
          <div className={styles.rankingTitle} style={{ color: "#ef4444" }}>
            🔥 {t.gasMap.topExpensive}
          </div>
          <div className={styles.rankingList}>
            {stats.topExpensive.map((fp, idx) => (
              <div key={fp.code} className={styles.rankItem}>
                <span className={styles.rankPosition}>{idx + 1}</span>
                <span className={styles.rankFlag}>{fp.flag}</span>
                <span className={styles.rankName}>{locale === "es" ? fp.nameEs : fp.name}</span>
                <span className={styles.rankPrice} style={{ color: "#ef4444" }}>
                  ${getPrice(fp).toFixed(3)}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className={styles.rankingCard}>
          <div className={styles.rankingTitle} style={{ color: "#22c55e" }}>
            💚 {t.gasMap.topCheapest}
          </div>
          <div className={styles.rankingList}>
            {stats.topCheapest.map((fp, idx) => (
              <div key={fp.code} className={styles.rankItem}>
                <span className={styles.rankPosition}>{idx + 1}</span>
                <span className={styles.rankFlag}>{fp.flag}</span>
                <span className={styles.rankName}>{locale === "es" ? fp.nameEs : fp.name}</span>
                <span className={styles.rankPrice} style={{ color: "#22c55e" }}>
                  ${getPrice(fp).toFixed(3)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
