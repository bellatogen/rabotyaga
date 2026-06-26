// Мок services/api.js для jest: реальный модуль использует import.meta.env (Vite),
// который babel-jest не парсит. В smoke-рендере (renderToString) API не вызывается
// — эффекты/хендлеры не выполняются — поэтому достаточно заглушек.
// Proxy отдаёт async-функцию на любой named-импорт (ld, sv, kvGet, ...).
module.exports = new Proxy(
  { __esModule: true },
  { get: (target, prop) => (prop === '__esModule' ? true : async () => null) }
);
