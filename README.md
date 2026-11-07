# 🛰️ TP N° 7 — Satellite Tracker (React Native + SGP4/SDP4)

**Licenciatura en Sistemas de Información — Programación Móvil (2026)**  
**Facultad de Ciencia y Tecnología (FCyT — UADER, Sede Concepción del Uruguay)**

Aplicación móvil multiplataforma desarrollada en **React Native (Expo SDK 58 + TypeScript)** que calcula en tiempo real la posición de satélites artificiales en órbitas **LEO**, **MEO** y **GEO** mediante propagación analítica **SGP4/SDP4** (`satellite.js` v7.1.0), proyecta su punto subsatelital, *ground track* (con corte en el antimeridiano $\pm 180^\circ$), *footprint* y capa de constelación **Starlink SupGP** sobre un mapa mundial, predice ventanas de visibilidad (**AOS / TCA / LOS**) mediante refinamiento en dos etapas (*Grueso $\to$ Fino*), grafica trayectorias en un **Sky Chart Polar SVG**, ofrece un **Modo Brújula de orientación asistida**, programa notificaciones de pase y valida experimentalmente las posiciones contra **Where the ISS at?** y **N2YO**.

---

## 📚 Documentos Técnicos Entregables (Sección 6)

1. 📄 **[Modelo de Propagación Orbital, Supuestos y Limitaciones](docs/01_Modelo_Propagacion_Orbital.md)** — Formulación SGP4/SDP4, soporte dual CCSDS OMM/JSON (6 dígitos) y TLE, transformaciones ECI $\to$ Geodésico (WGS-84) $\to$ ECEF $\to$ Topocéntrico (SEZ), cálculo de Doppler en banda Ku, geometría esférica del *footprint*, corte en antimeridiano y algoritmo de predicción *Grueso $\to$ Fino* (Bisección + Sección Áurea).
2. 📊 **[Informe de Validación Experimental](docs/02_Informe_Validacion_Experimental.md)** — Tabla de errores superficiales (Haversine) y tridimensionales (ECEF) en kilómetros entre el cálculo SGP4 local y **Where the ISS at?** / **N2YO**, análisis de sensibilidad según la antigüedad del elemento orbital (TTL) y conclusiones.
3. 🏛️ **[Decisiones sobre Fuentes de Datos y Caso Starlink](docs/03_Decisiones_Fuentes_Datos_y_Starlink.md)** — Análisis de las APIs de Starlink (*Enterprise APIs* vs. *Space Traffic Coordination API* con certificado mTLS firmado por SpaceX), justificación del set suplementario **CelesTrak SupGP**, límites de tasa por proveedor y arquitectura de caché con TTL y *fallback* automático.

---

## 🗺️ Matriz de Trazabilidad de Requisitos Funcionales (`RF-01` a `RF-16`)

| ID | Requisito Funcional | Prioridad | Implementación Principal en el Código |
| :---: | :--- | :---: | :--- |
| **RF-01** | Buscar y seleccionar satélites por nombre o NORAD ID desde CelesTrak/Space-Track | Alta | [`src/app/catalog.tsx`](src/app/catalog.tsx), [`src/providers/dataProviderOrchestrator.ts`](src/providers/dataProviderOrchestrator.ts) |
| **RF-02** | Calcular posición actual (`lat/lon/alt` y velocidad) mediante SGP4 local | Alta | [`src/orbital/orbitalEngine.ts`](src/orbital/orbitalEngine.ts) (`propagateSubsatellitePoint`) |
| **RF-03** | Calcular azimut/elevación, rango oblicuo y Doppler respecto al usuario | Alta | [`src/orbital/orbitalEngine.ts`](src/orbital/orbitalEngine.ts) (`computeLookAngles`) |
| **RF-04** | Determinar próximas ventanas de visibilidad (AOS, punto máximo TCA, LOS) | Alta | [`src/prediction/passPredictor.ts`](src/prediction/passPredictor.ts) (`predictUpcomingPasses`) |
| **RF-05** | Graficar la trayectoria del pase en un Sky Chart polar (SVG) | Alta | [`src/components/PolarSkyChart.tsx`](src/components/PolarSkyChart.tsx), [`src/app/passes.tsx`](src/app/passes.tsx) |
| **RF-06** | Notificar al usuario $N$ minutos antes de un pase configurado | Media | [`src/services/notificationService.ts`](src/services/notificationService.ts) (`schedulePassReminder`) |
| **RF-07** | Modo brújula: overlay indicando hacia dónde apuntar el dispositivo (Az/El) | Media | [`src/app/compass.tsx`](src/app/compass.tsx), [`src/services/observerService.ts`](src/services/observerService.ts) |
| **RF-08** | Filtrar catálogo por constelación (Starlink, ISS/Estaciones, GPS, Clima, GEO/ARSAT) | Media | [`src/app/catalog.tsx`](src/app/catalog.tsx), [`src/providers/celestrakProvider.ts`](src/providers/celestrakProvider.ts) |
| **RF-09** | Actualizar automáticamente datos orbitales al superar su TTL (12–24 h) respetando límites | Media | [`src/providers/orbitalCache.ts`](src/providers/orbitalCache.ts), [`src/providers/rateLimiter.ts`](src/providers/rateLimiter.ts) |
| **RF-10** | Mapa mundial con posición en tiempo real del satélite (refresco local cada 1–5 s) | Alta | [`src/components/OrbitalWorldMap.tsx`](src/components/OrbitalWorldMap.tsx), [`src/app/index.tsx`](src/app/index.tsx) |
| **RF-11** | Ground track: trayectoria pasada y futura ($\ge 1$ órbita) resolviendo cruce del antimeridiano | Alta | [`src/orbital/orbitalEngine.ts`](src/orbital/orbitalEngine.ts) (`computeGroundTrackSegments`) |
| **RF-12** | Footprint: área de cobertura según altitud y elevación mínima configurable | Media | [`src/orbital/orbitalEngine.ts`](src/orbital/orbitalEngine.ts) (`computeFootprintRadiusKm`) |
| **RF-13** | Capa de constelación: mostrar múltiples satélites Starlink con límite configurable | Media | [`src/orbital/orbitalEngine.ts`](src/orbital/orbitalEngine.ts) (`propagateConstellationBatch`) |
| **RF-14** | Abstracción de proveedores (`DataProvider`) con caché local y fallback automático | Alta | [`src/providers/dataProviderOrchestrator.ts`](src/providers/dataProviderOrchestrator.ts) |
| **RF-15** | Modo validación: comparar posición contra N2YO y Where the ISS at? mostrando error en km | Media | [`src/app/validation.tsx`](src/app/validation.tsx), [`scripts/run-live-validation.mjs`](scripts/run-live-validation.mjs) |
| **RF-16** | Indicar antigüedad de los datos orbitales usados y alertar cuando estén desactualizados | Baja | [`src/app/index.tsx`](src/app/index.tsx), [`src/app/catalog.tsx`](src/app/catalog.tsx) |

---

## 🚀 Instalación y Ejecución

### 1. Instalar dependencias e iniciar servidor de desarrollo (Metro / Expo Go)
```bash
npm install
npx expo start
```
* Escanee el código QR con **Expo Go** en Android/iOS, o presione `a` para abrir en emulador Android / `w` para abrir la vista en navegador web.

### 2. Verificación de tipos y validación científica en vivo por consola
```bash
# Verificación estática de TypeScript
npx tsc --noEmit

# Ejecutar validación experimental SGP4 vs Where the ISS at? en vivo
node scripts/run-live-validation.mjs
```

---

## 🎬 Guion Sugerido para el Video Demo (Sección 6)

1. **Catálogo y Constelaciones (`Pestaña Catálogo`):**
   * Mostrar la selección de estación terrena (**Concepción del Uruguay - FCyT UADER** o **Usar mi GPS**).
   * Filtrar entre **Estaciones / ISS**, **Starlink (SupGP)**, **GPS Navstar (MEO)** y **GEO / ARSAT** (mostrando ARSAT-1 y ARSAT-2).
   * Seleccionar **ISS (ZARYA) `#25544`**.
2. **Mapa Mundial en Tiempo Real (`Pestaña Mapa Orbital`):**
   * Mostrar el marcador de la ISS actualizándose cada 2 segundos mediante SGP4 local, junto con su telemetría (latitud, longitud, altitud, velocidad, azimut, elevación, *slant range* y corrimiento Doppler Ku).
   * Mostrar el **Ground Track** pasado (línea punteada ámbar) y futuro (línea continua cian) dividido limpiamente en el cruce del antimeridiano ($\pm 180^\circ$).
   * Cambiar el ángulo de elevación mínima operativa ($0^\circ \to 10^\circ \to 25^\circ \to 40^\circ$) y observar cómo varía dinámicamente el radio del **Footprint** sobre el mapa.
   * Activar el botón **✨ Starlink** para superponer en tiempo real la capa de constelación Starlink (con selector de 25 / 48 / 80 objetos simultáneos sin degradar la fluidez de la UI).
3. **Predicción de Pases, Sky Chart y Notificación (`Pestaña Sky Chart`):**
   * Mostrar las próximas ventanas de visibilidad calculadas con el algoritmo *Grueso $\to$ Fino* (AOS, TCA/Elevación Máxima y LOS).
   * Tocar un pase de la lista para visualizar su curva polar en el **Sky Chart SVG**.
   * Presionar **🚀 Disparar Alerta Demo (2s)** (o programar recordatorio $N$ min antes) y mostrar la notificación push local emergiendo en pantalla.
4. **Orientación Asistida (`Pestaña Brújula`):**
   * Mostrar cómo la rosa de los vientos y la mira 2D guían al usuario indicando cuántos grados girar a izquierda/derecha (Azimut) e inclinar arriba/abajo (Elevación) hasta alcanzar el estado **✅ SATÉLITE ALINEADO EN LA MIRA**.
5. **Validación Cruzada y APIs (`Pestaña Validación`):**
   * Presionar **🛰️ Validar ISS vs Where the ISS at?** y mostrar la tabla comparativa con un error superficial $< 1\text{ km}$ (y $< 0.01\text{ km}$ a igualdad de época), además del estado del *Rate Limiter*, TTL de caché y bitácora del orquestador de *fallback*.

