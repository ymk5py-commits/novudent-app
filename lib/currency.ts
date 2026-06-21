/** Monedas soportadas (LATAM + USD). La clínica elige la suya en Configuración;
 *  `fmtGs`/`fmtMoney` formatean según la moneda activa. NO hay conversión de tipo
 *  de cambio: cambiar de moneda solo cambia símbolo y formato, no los montos. */

export type CurrencyCode =
  | "PYG" | "USD" | "ARS" | "BOB" | "BRL" | "CLP" | "COP" | "CRC" | "DOP"
  | "GTQ" | "HNL" | "MXN" | "NIO" | "PAB" | "PEN" | "UYU" | "VES";

export interface CurrencyDef {
  code: CurrencyCode;
  symbol: string;
  name: string;
  /** locale para el separador de miles/decimales */
  locale: string;
  /** dígitos decimales a mostrar */
  decimals: number;
}

export const DEFAULT_CURRENCY: CurrencyCode = "PYG";

/** Registro de monedas, ordenado por uso en la región. */
export const CURRENCIES: Record<CurrencyCode, CurrencyDef> = {
  PYG: { code: "PYG", symbol: "Gs",  name: "Guaraní paraguayo",       locale: "es-PY", decimals: 0 },
  USD: { code: "USD", symbol: "US$", name: "Dólar estadounidense",    locale: "en-US", decimals: 2 },
  ARS: { code: "ARS", symbol: "$",   name: "Peso argentino",          locale: "es-AR", decimals: 2 },
  BOB: { code: "BOB", symbol: "Bs",  name: "Boliviano",               locale: "es-BO", decimals: 2 },
  BRL: { code: "BRL", symbol: "R$",  name: "Real brasileño",          locale: "pt-BR", decimals: 2 },
  CLP: { code: "CLP", symbol: "$",   name: "Peso chileno",            locale: "es-CL", decimals: 0 },
  COP: { code: "COP", symbol: "$",   name: "Peso colombiano",         locale: "es-CO", decimals: 0 },
  CRC: { code: "CRC", symbol: "₡",   name: "Colón costarricense",     locale: "es-CR", decimals: 0 },
  DOP: { code: "DOP", symbol: "RD$", name: "Peso dominicano",         locale: "es-DO", decimals: 2 },
  GTQ: { code: "GTQ", symbol: "Q",   name: "Quetzal guatemalteco",    locale: "es-GT", decimals: 2 },
  HNL: { code: "HNL", symbol: "L",   name: "Lempira hondureño",       locale: "es-HN", decimals: 2 },
  MXN: { code: "MXN", symbol: "$",   name: "Peso mexicano",           locale: "es-MX", decimals: 2 },
  NIO: { code: "NIO", symbol: "C$",  name: "Córdoba nicaragüense",    locale: "es-NI", decimals: 2 },
  PAB: { code: "PAB", symbol: "B/.", name: "Balboa panameño",         locale: "es-PA", decimals: 2 },
  PEN: { code: "PEN", symbol: "S/",  name: "Sol peruano",             locale: "es-PE", decimals: 2 },
  UYU: { code: "UYU", symbol: "$U",  name: "Peso uruguayo",           locale: "es-UY", decimals: 2 },
  VES: { code: "VES", symbol: "Bs",  name: "Bolívar venezolano",      locale: "es-VE", decimals: 2 },
};

/** Lista para selects (orden del registro). */
export const CURRENCY_LIST: CurrencyDef[] = Object.values(CURRENCIES);

/** Formatea un monto en la moneda dada (símbolo + número con separadores locales). */
export function formatMoney(value: number, code: CurrencyCode = DEFAULT_CURRENCY): string {
  const c = CURRENCIES[code] ?? CURRENCIES[DEFAULT_CURRENCY];
  const n = (Number.isFinite(value) ? value : 0).toLocaleString(c.locale, {
    minimumFractionDigits: c.decimals,
    maximumFractionDigits: c.decimals,
  });
  return `${c.symbol} ${n}`;
}
