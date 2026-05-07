// Gas price data sourced from World Bank, US EIA, EU Commission
// Prices in USD per liter — updated Q1 2025
// This file can be refreshed by fetching latest data from public sources

export interface CountryFuelPrice {
  code: string;       // ISO 3166-1 alpha-2
  name: string;
  nameEs: string;
  flag: string;
  region: string;
  gasoline: number;   // USD/liter
  diesel: number;     // USD/liter
  change7d: number;   // % weekly change
  lastUpdated: string;
}

export const FUEL_PRICES: CountryFuelPrice[] = [
  { code: "VE", name: "Venezuela", nameEs: "Venezuela", flag: "🇻🇪", region: "South America", gasoline: 0.018, diesel: 0.022, change7d: 0, lastUpdated: "2025-04" },
  { code: "LY", name: "Libya", nameEs: "Libia", flag: "🇱🇾", region: "Africa", gasoline: 0.031, diesel: 0.035, change7d: 0, lastUpdated: "2025-04" },
  { code: "IR", name: "Iran", nameEs: "Irán", flag: "🇮🇷", region: "Middle East", gasoline: 0.051, diesel: 0.065, change7d: 0, lastUpdated: "2025-04" },
  { code: "DZ", name: "Algeria", nameEs: "Argelia", flag: "🇩🇿", region: "Africa", gasoline: 0.224, diesel: 0.145, change7d: -0.3, lastUpdated: "2025-04" },
  { code: "KW", name: "Kuwait", nameEs: "Kuwait", flag: "🇰🇼", region: "Middle East", gasoline: 0.310, diesel: 0.295, change7d: -0.5, lastUpdated: "2025-04" },
  { code: "EG", name: "Egypt", nameEs: "Egipto", flag: "🇪🇬", region: "Africa", gasoline: 0.345, diesel: 0.298, change7d: 0.2, lastUpdated: "2025-04" },
  { code: "KZ", name: "Kazakhstan", nameEs: "Kazajistán", flag: "🇰🇿", region: "Central Asia", gasoline: 0.372, diesel: 0.420, change7d: -5.6, lastUpdated: "2025-04" },
  { code: "SA", name: "Saudi Arabia", nameEs: "Arabia Saudí", flag: "🇸🇦", region: "Middle East", gasoline: 0.381, diesel: 0.252, change7d: 0, lastUpdated: "2025-04" },
  { code: "BH", name: "Bahrain", nameEs: "Baréin", flag: "🇧🇭", region: "Middle East", gasoline: 0.400, diesel: 0.330, change7d: 0, lastUpdated: "2025-04" },
  { code: "NG", name: "Nigeria", nameEs: "Nigeria", flag: "🇳🇬", region: "Africa", gasoline: 0.401, diesel: 0.750, change7d: 9.9, lastUpdated: "2025-04" },
  { code: "MY", name: "Malaysia", nameEs: "Malasia", flag: "🇲🇾", region: "Asia", gasoline: 0.430, diesel: 0.520, change7d: 0, lastUpdated: "2025-04" },
  { code: "QA", name: "Qatar", nameEs: "Catar", flag: "🇶🇦", region: "Middle East", gasoline: 0.460, diesel: 0.480, change7d: -0.3, lastUpdated: "2025-04" },
  { code: "AE", name: "UAE", nameEs: "Emiratos Árabes", flag: "🇦🇪", region: "Middle East", gasoline: 0.498, diesel: 0.540, change7d: -1.2, lastUpdated: "2025-04" },
  { code: "OM", name: "Oman", nameEs: "Omán", flag: "🇴🇲", region: "Middle East", gasoline: 0.507, diesel: 0.530, change7d: 0, lastUpdated: "2025-04" },
  { code: "RU", name: "Russia", nameEs: "Rusia", flag: "🇷🇺", region: "Europe", gasoline: 0.520, diesel: 0.560, change7d: 0.8, lastUpdated: "2025-04" },
  { code: "PK", name: "Pakistan", nameEs: "Pakistán", flag: "🇵🇰", region: "South Asia", gasoline: 0.630, diesel: 0.680, change7d: 1.1, lastUpdated: "2025-04" },
  { code: "BO", name: "Bolivia", nameEs: "Bolivia", flag: "🇧🇴", region: "South America", gasoline: 0.540, diesel: 0.530, change7d: 0, lastUpdated: "2025-04" },
  { code: "ID", name: "Indonesia", nameEs: "Indonesia", flag: "🇮🇩", region: "Asia", gasoline: 0.700, diesel: 0.690, change7d: -0.4, lastUpdated: "2025-04" },
  { code: "MX", name: "Mexico", nameEs: "México", flag: "🇲🇽", region: "North America", gasoline: 0.990, diesel: 1.030, change7d: -1.5, lastUpdated: "2025-04" },
  { code: "US", name: "United States", nameEs: "Estados Unidos", flag: "🇺🇸", region: "North America", gasoline: 0.910, diesel: 0.960, change7d: -2.1, lastUpdated: "2025-04" },
  { code: "IN", name: "India", nameEs: "India", flag: "🇮🇳", region: "South Asia", gasoline: 1.180, diesel: 1.100, change7d: 0, lastUpdated: "2025-04" },
  { code: "BR", name: "Brazil", nameEs: "Brasil", flag: "🇧🇷", region: "South America", gasoline: 1.080, diesel: 1.020, change7d: -0.9, lastUpdated: "2025-04" },
  { code: "CA", name: "Canada", nameEs: "Canadá", flag: "🇨🇦", region: "North America", gasoline: 1.160, diesel: 1.240, change7d: -1.8, lastUpdated: "2025-04" },
  { code: "CL", name: "Chile", nameEs: "Chile", flag: "🇨🇱", region: "South America", gasoline: 1.210, diesel: 0.880, change7d: -0.6, lastUpdated: "2025-04" },
  { code: "AR", name: "Argentina", nameEs: "Argentina", flag: "🇦🇷", region: "South America", gasoline: 0.870, diesel: 0.790, change7d: 2.1, lastUpdated: "2025-04" },
  { code: "CO", name: "Colombia", nameEs: "Colombia", flag: "🇨🇴", region: "South America", gasoline: 0.750, diesel: 0.610, change7d: 0.5, lastUpdated: "2025-04" },
  { code: "PE", name: "Peru", nameEs: "Perú", flag: "🇵🇪", region: "South America", gasoline: 1.150, diesel: 0.920, change7d: -0.3, lastUpdated: "2025-04" },
  { code: "EC", name: "Ecuador", nameEs: "Ecuador", flag: "🇪🇨", region: "South America", gasoline: 0.630, diesel: 0.395, change7d: 0, lastUpdated: "2025-04" },
  { code: "AU", name: "Australia", nameEs: "Australia", flag: "🇦🇺", region: "Oceania", gasoline: 1.135, diesel: 1.290, change7d: -5.4, lastUpdated: "2025-04" },
  { code: "NZ", name: "New Zealand", nameEs: "Nueva Zelanda", flag: "🇳🇿", region: "Oceania", gasoline: 1.610, diesel: 1.260, change7d: -2.1, lastUpdated: "2025-04" },
  { code: "JP", name: "Japan", nameEs: "Japón", flag: "🇯🇵", region: "Asia", gasoline: 1.260, diesel: 1.180, change7d: -0.8, lastUpdated: "2025-04" },
  { code: "KR", name: "South Korea", nameEs: "Corea del Sur", flag: "🇰🇷", region: "Asia", gasoline: 1.340, diesel: 1.280, change7d: -1.3, lastUpdated: "2025-04" },
  { code: "CN", name: "China", nameEs: "China", flag: "🇨🇳", region: "Asia", gasoline: 1.080, diesel: 0.950, change7d: -0.5, lastUpdated: "2025-04" },
  { code: "TH", name: "Thailand", nameEs: "Tailandia", flag: "🇹🇭", region: "Asia", gasoline: 1.190, diesel: 0.930, change7d: -1.0, lastUpdated: "2025-04" },
  { code: "PH", name: "Philippines", nameEs: "Filipinas", flag: "🇵🇭", region: "Asia", gasoline: 1.140, diesel: 0.980, change7d: 0.7, lastUpdated: "2025-04" },
  { code: "ZA", name: "South Africa", nameEs: "Sudáfrica", flag: "🇿🇦", region: "Africa", gasoline: 1.165, diesel: 1.130, change7d: 9.8, lastUpdated: "2025-04" },
  { code: "KE", name: "Kenya", nameEs: "Kenia", flag: "🇰🇪", region: "Africa", gasoline: 1.250, diesel: 1.190, change7d: 0.5, lastUpdated: "2025-04" },
  { code: "GH", name: "Ghana", nameEs: "Ghana", flag: "🇬🇭", region: "Africa", gasoline: 1.050, diesel: 1.010, change7d: 1.2, lastUpdated: "2025-04" },
  { code: "MA", name: "Morocco", nameEs: "Marruecos", flag: "🇲🇦", region: "Africa", gasoline: 1.350, diesel: 1.180, change7d: 0.3, lastUpdated: "2025-04" },
  { code: "TN", name: "Tunisia", nameEs: "Túnez", flag: "🇹🇳", region: "Africa", gasoline: 0.720, diesel: 0.620, change7d: 0, lastUpdated: "2025-04" },
  { code: "TR", name: "Turkey", nameEs: "Turquía", flag: "🇹🇷", region: "Europe", gasoline: 1.160, diesel: 1.210, change7d: 3.2, lastUpdated: "2025-04" },
  { code: "PL", name: "Poland", nameEs: "Polonia", flag: "🇵🇱", region: "Europe", gasoline: 1.420, diesel: 1.390, change7d: -1.1, lastUpdated: "2025-04" },
  { code: "RO", name: "Romania", nameEs: "Rumanía", flag: "🇷🇴", region: "Europe", gasoline: 1.257, diesel: 1.310, change7d: -5.4, lastUpdated: "2025-04" },
  { code: "CZ", name: "Czechia", nameEs: "Chequia", flag: "🇨🇿", region: "Europe", gasoline: 1.450, diesel: 1.400, change7d: -2.3, lastUpdated: "2025-04" },
  { code: "HU", name: "Hungary", nameEs: "Hungría", flag: "🇭🇺", region: "Europe", gasoline: 1.380, diesel: 1.410, change7d: -0.9, lastUpdated: "2025-04" },
  { code: "SK", name: "Slovakia", nameEs: "Eslovaquia", flag: "🇸🇰", region: "Europe", gasoline: 1.507, diesel: 1.430, change7d: 9.8, lastUpdated: "2025-04" },
  { code: "BG", name: "Bulgaria", nameEs: "Bulgaria", flag: "🇧🇬", region: "Europe", gasoline: 1.180, diesel: 1.210, change7d: -0.6, lastUpdated: "2025-04" },
  { code: "HR", name: "Croatia", nameEs: "Croacia", flag: "🇭🇷", region: "Europe", gasoline: 1.440, diesel: 1.400, change7d: 1.5, lastUpdated: "2025-04" },
  { code: "LT", name: "Lithuania", nameEs: "Lituania", flag: "🇱🇹", region: "Europe", gasoline: 1.411, diesel: 1.350, change7d: 9.8, lastUpdated: "2025-04" },
  { code: "LV", name: "Latvia", nameEs: "Letonia", flag: "🇱🇻", region: "Europe", gasoline: 1.450, diesel: 1.410, change7d: 1.2, lastUpdated: "2025-04" },
  { code: "EE", name: "Estonia", nameEs: "Estonia", flag: "🇪🇪", region: "Europe", gasoline: 1.520, diesel: 1.450, change7d: 0.8, lastUpdated: "2025-04" },
  { code: "SI", name: "Slovenia", nameEs: "Eslovenia", flag: "🇸🇮", region: "Europe", gasoline: 1.430, diesel: 1.400, change7d: -1.0, lastUpdated: "2025-04" },
  { code: "ES", name: "Spain", nameEs: "España", flag: "🇪🇸", region: "Europe", gasoline: 1.559, diesel: 1.450, change7d: -1.2, lastUpdated: "2025-04" },
  { code: "PT", name: "Portugal", nameEs: "Portugal", flag: "🇵🇹", region: "Europe", gasoline: 1.670, diesel: 1.520, change7d: -0.8, lastUpdated: "2025-04" },
  { code: "FR", name: "France", nameEs: "Francia", flag: "🇫🇷", region: "Europe", gasoline: 1.780, diesel: 1.680, change7d: -1.5, lastUpdated: "2025-04" },
  { code: "DE", name: "Germany", nameEs: "Alemania", flag: "🇩🇪", region: "Europe", gasoline: 1.720, diesel: 1.590, change7d: -2.0, lastUpdated: "2025-04" },
  { code: "IT", name: "Italy", nameEs: "Italia", flag: "🇮🇹", region: "Europe", gasoline: 1.780, diesel: 1.690, change7d: -1.7, lastUpdated: "2025-04" },
  { code: "GB", name: "United Kingdom", nameEs: "Reino Unido", flag: "🇬🇧", region: "Europe", gasoline: 1.610, diesel: 1.650, change7d: -0.9, lastUpdated: "2025-04" },
  { code: "IE", name: "Ireland", nameEs: "Irlanda", flag: "🇮🇪", region: "Europe", gasoline: 1.699, diesel: 1.620, change7d: 9.8, lastUpdated: "2025-04" },
  { code: "AT", name: "Austria", nameEs: "Austria", flag: "🇦🇹", region: "Europe", gasoline: 1.462, diesel: 1.510, change7d: -5.4, lastUpdated: "2025-04" },
  { code: "CH", name: "Switzerland", nameEs: "Suiza", flag: "🇨🇭", region: "Europe", gasoline: 1.665, diesel: 1.760, change7d: -5.5, lastUpdated: "2025-04" },
  { code: "BE", name: "Belgium", nameEs: "Bélgica", flag: "🇧🇪", region: "Europe", gasoline: 1.690, diesel: 1.700, change7d: -1.3, lastUpdated: "2025-04" },
  { code: "NL", name: "Netherlands", nameEs: "Países Bajos", flag: "🇳🇱", region: "Europe", gasoline: 2.039, diesel: 1.720, change7d: -0.5, lastUpdated: "2025-04" },
  { code: "LU", name: "Luxembourg", nameEs: "Luxemburgo", flag: "🇱🇺", region: "Europe", gasoline: 1.448, diesel: 1.390, change7d: 9.8, lastUpdated: "2025-04" },
  { code: "SE", name: "Sweden", nameEs: "Suecia", flag: "🇸🇪", region: "Europe", gasoline: 1.720, diesel: 1.780, change7d: -2.5, lastUpdated: "2025-04" },
  { code: "FI", name: "Finland", nameEs: "Finlandia", flag: "🇫🇮", region: "Europe", gasoline: 1.770, diesel: 1.680, change7d: -1.1, lastUpdated: "2025-04" },
  { code: "DK", name: "Denmark", nameEs: "Dinamarca", flag: "🇩🇰", region: "Europe", gasoline: 1.893, diesel: 1.630, change7d: -0.7, lastUpdated: "2025-04" },
  { code: "NO", name: "Norway", nameEs: "Noruega", flag: "🇳🇴", region: "Europe", gasoline: 1.957, diesel: 1.880, change7d: -1.4, lastUpdated: "2025-04" },
  { code: "IS", name: "Iceland", nameEs: "Islandia", flag: "🇮🇸", region: "Europe", gasoline: 1.850, diesel: 1.900, change7d: 0.3, lastUpdated: "2025-04" },
  { code: "GR", name: "Greece", nameEs: "Grecia", flag: "🇬🇷", region: "Europe", gasoline: 1.750, diesel: 1.560, change7d: -0.5, lastUpdated: "2025-04" },
  { code: "IL", name: "Israel", nameEs: "Israel", flag: "🇮🇱", region: "Middle East", gasoline: 1.837, diesel: 1.790, change7d: 0.6, lastUpdated: "2025-04" },
  { code: "SG", name: "Singapore", nameEs: "Singapur", flag: "🇸🇬", region: "Asia", gasoline: 2.024, diesel: 1.590, change7d: -0.4, lastUpdated: "2025-04" },
  { code: "HK", name: "Hong Kong", nameEs: "Hong Kong", flag: "🇭🇰", region: "Asia", gasoline: 2.374, diesel: 1.820, change7d: -5.5, lastUpdated: "2025-04" },
  { code: "UY", name: "Uruguay", nameEs: "Uruguay", flag: "🇺🇾", region: "South America", gasoline: 1.710, diesel: 1.340, change7d: 0, lastUpdated: "2025-04" },
  { code: "PY", name: "Paraguay", nameEs: "Paraguay", flag: "🇵🇾", region: "South America", gasoline: 0.980, diesel: 0.870, change7d: 0.4, lastUpdated: "2025-04" },
  { code: "TW", name: "Taiwan", nameEs: "Taiwán", flag: "🇹🇼", region: "Asia", gasoline: 0.940, diesel: 0.830, change7d: -0.9, lastUpdated: "2025-04" },
  { code: "VN", name: "Vietnam", nameEs: "Vietnam", flag: "🇻🇳", region: "Asia", gasoline: 0.880, diesel: 0.750, change7d: -1.2, lastUpdated: "2025-04" },
  { code: "UA", name: "Ukraine", nameEs: "Ucrania", flag: "🇺🇦", region: "Europe", gasoline: 1.210, diesel: 1.250, change7d: 2.5, lastUpdated: "2025-04" },
];

// Map ISO alpha-2 codes to ISO alpha-3 (for SVG path matching)
export const ISO2_TO_ISO3: Record<string, string> = {
  VE: "VEN", LY: "LBY", IR: "IRN", DZ: "DZA", KW: "KWT", EG: "EGY",
  KZ: "KAZ", SA: "SAU", BH: "BHR", NG: "NGA", MY: "MYS", QA: "QAT",
  AE: "ARE", OM: "OMN", RU: "RUS", PK: "PAK", BO: "BOL", ID: "IDN",
  MX: "MEX", US: "USA", IN: "IND", BR: "BRA", CA: "CAN", CL: "CHL",
  AR: "ARG", CO: "COL", PE: "PER", EC: "ECU", AU: "AUS", NZ: "NZL",
  JP: "JPN", KR: "KOR", CN: "CHN", TH: "THA", PH: "PHL", ZA: "ZAF",
  KE: "KEN", GH: "GHA", MA: "MAR", TN: "TUN", TR: "TUR", PL: "POL",
  RO: "ROU", CZ: "CZE", HU: "HUN", SK: "SVK", BG: "BGR", HR: "HRV",
  LT: "LTU", LV: "LVA", EE: "EST", SI: "SVN", ES: "ESP", PT: "PRT",
  FR: "FRA", DE: "DEU", IT: "ITA", GB: "GBR", IE: "IRL", AT: "AUT",
  CH: "CHE", BE: "BEL", NL: "NLD", LU: "LUX", SE: "SWE", FI: "FIN",
  DK: "DNK", NO: "NOR", IS: "ISL", GR: "GRC", IL: "ISR", SG: "SGP",
  HK: "HKG", UY: "URY", PY: "PRY", TW: "TWN", VN: "VNM", UA: "UKR",
};

export function getPriceColor(price: number): string {
  // Color scale: green (cheap) → yellow → orange → red (expensive)
  if (price <= 0.30) return '#10b981';
  if (price <= 0.50) return '#22c55e';
  if (price <= 0.70) return '#84cc16';
  if (price <= 0.90) return '#a3e635';
  if (price <= 1.10) return '#eab308';
  if (price <= 1.30) return '#f59e0b';
  if (price <= 1.50) return '#f97316';
  if (price <= 1.70) return '#ef4444';
  if (price <= 1.90) return '#dc2626';
  return '#991b1b';
}

export function getChangeColor(change: number): string {
  if (change > 0) return '#ef4444';
  if (change < 0) return '#22c55e';
  return '#94a3b8';
}
