# Documento Técnico 1: Modelo de Propagación Orbital SGP4/SDP4, Geometría Satelital, Supuestos y Limitaciones

**Asignatura:** Programación Móvil — Licenciatura en Sistemas de Información (FCyT - UADER)  
**Trabajo Práctico N° 7:** Satellite Tracker — Visualización de geoposiciones satelitales en tiempo real y predictor de visibilidad con propagación orbital SGP4

---

## 1. Modelo Matemático de Propagación Orbital (SGP4 / SDP4)

La aplicación calcula en tiempo real la posición y velocidad de satélites artificiales en órbitas **LEO** (*Low Earth Orbit*), **MEO** (*Medium Earth Orbit*) y **GEO** (*Geostationary Orbit*) utilizando el propagador analítico estándar de la industria **SGP4/SDP4** (*Simplified General Perturbations 4 / Simplified Deep Space Perturbations 4*), implementado en TypeScript sobre la librería [`satellite.js`](https://github.com/shashwatak/satellite-js) (v7.1.0, basada en la revisión unificada de Vallado et al., *AIAA 2006-6753*).

### 1.1 Selección Automática entre SGP4 (Near-Earth) y SDP4 (Deep-Space)
Al inicializar el registro satelital (`SatRec`) mediante [`getSatRec`](file:///c:/Users/alebo/OneDrive/Escritorio/Facu/lic%20y%20an%20en%20Sistemas/4to%20A%C3%B1o/Programaci%C3%B3n%20M%C3%B3vil/Trabajos%20Practicos/TP%207%20Satellite%20Tracker/src/orbital/orbitalEngine.ts#L38-L62), el propagador evalúa el período orbital nodal $T$ a partir del movimiento medio $n_0$ (en revoluciones por día):

$$T = \frac{1440}{n_0} \quad [\text{minutos}]$$

* **Régimen Cercano a la Tierra (*Near-Earth*, $T < 225\text{ min}$, equivalente a $n_0 \ge 6.4\text{ rev/día}$):** Se emplea **SGP4** (p. ej., ISS a $\approx 92.9\text{ min}$, constelación Starlink a $\approx 95.6\text{ min}$, satélites meteorológicos NOAA/SAOCOM a $\approx 101\text{ min}$). Modela perturbaciones gravitacionales seculares y periódicas de los armónicos zonales terrestres ($J_2, J_3, J_4$) según la teoría de Brouwer y el decaimiento por arrastre atmosférico mediante una atmósfera estática de densidad exponencial parametrizada por el coeficiente balístico modificado $B^*$.
* **Régimen de Espacio Profundo (*Deep-Space*, $T \ge 225\text{ min}$, equivalente a $n_0 < 6.4\text{ rev/día}$):** Se conmuta automáticamente a **SDP4** (p. ej., constelación GPS Navstar MEO con $T \approx 718\text{ min}$ y satélites de telecomunicaciones GEO como ARSAT-1, ARSAT-2 y GOES-16 con $T \approx 1436.1\text{ min}$). Incorpora términos de perturbación gravitacional de tercer cuerpo (Sol y Luna) y efectos de resonancia sectorial/teseral terrestre para períodos de 12 horas (resonancia Molniya/GPS) y 24 horas (resonancia síncrona/GEO).

### 1.2 Soporte Dual de Formatos: CCSDS OMM (JSON) y TLE Clásico
El formato clásico **TLE** (*Two-Line Element*) reserva únicamente 5 columnas numéricas para el número de catálogo NORAD (`NORAD_CAT_ID`), agotándose en el objeto `99999` (a menos que se recurra a la codificación híbrida Alpha-5). Siguiendo el requisito técnico de la Sección 4.1, el motor orbital prioriza el estándar **CCSDS OMM (*Orbit Mean-Elements Message*) en JSON** mediante `json2satrec(orbital.omm)`, el cual admite identificadores `NORAD_CAT_ID` enteros de 6 o más dígitos sin ambigüedad, manteniendo retrocompatibilidad con `twoline2satrec(line1, line2)` para fuentes basadas en TLE (como N2YO o Where the ISS at?).

---

## 2. Cadena de Transformaciones de Coordenadas

La propagación en un instante $t$ (UTC) produce el vector de estado en el marco inercial **TEME** (*True Equator, Mean Equinox*, variante de **ECI** — *Earth-Centered Inertial*):

$$\mathbf{r}_{\text{ECI}}(t) = [x, y, z]^T \ [\text{km}], \qquad \mathbf{v}_{\text{ECI}}(t) = [\dot{x}, \dot{y}, \dot{z}]^T \ [\text{km/s}]$$

### 2.1 Punto Subsatelital (ECI $\to$ Geodésico WGS-84)
1. Se calcula el **Tiempo Sidéreo Medio de Greenwich (GMST)** $\theta_{\text{GMST}}(t)$ a partir de la fecha juliana UTC (`gstime(date)`).
2. Mediante el método iterativo de Bowring/Vallado (`eciToGeodetic`), se proyecta $\mathbf{r}_{\text{ECI}}(t)$ sobre el elipsoide de referencia **WGS-84** ($R_E = 6378.137\text{ km}$, achatamiento $f = 1/298.257223563$), obteniendo:
   * **Latitud geodésica** $\phi \in [-90^\circ, +90^\circ]$
   * **Longitud geodésica** $\lambda \in [-180^\circ, +180^\circ]$
   * **Altitud elipsoidal** $h \ [\text{km}]$

### 2.2 Coordenadas Topocéntricas y Efecto Doppler (ECI $\to$ ECEF $\to$ SEZ)
Para determinar hacia dónde debe apuntar una antena terrena o el dispositivo móvil del usuario ubicado en $(\phi_{\text{obs}}, \lambda_{\text{obs}}, h_{\text{obs}})$:
1. Se rota $\mathbf{r}_{\text{ECI}}$ al sistema fijo a la Tierra **ECEF** (*Earth-Centered, Earth-Fixed*) usando el ángulo sidéreo $\theta_{\text{GMST}}$ (`eciToEcf`).
2. Se calcula el vector rango relativo $\boldsymbol{\rho}_{\text{ECEF}} = \mathbf{r}_{\text{ECEF}} - \mathbf{r}_{\text{obs,ECEF}}$ y se rota al marco local horizontal **SEZ** (*South-East-Zenith*):
   * **Distancia oblicua (*Slant Range*):** $\rho = \|\boldsymbol{\rho}_{\text{SEZ}}\|$
   * **Elevación ($\varepsilon$):** $\varepsilon = \arcsin\left(\frac{\rho_Z}{\rho}\right) \in [-90^\circ, +90^\circ]$
   * **Azimut ($A_z$):** $A_z = \text{atan2}(\rho_E, -\rho_S) \pmod{360^\circ}$ (medido en sentido horario desde el Norte geográfico).
3. **Desplazamiento Doppler en Enlaces de Telecomunicaciones:** A partir de la velocidad relativa proyectada sobre la línea de vista $\dot{\rho} = \frac{\boldsymbol{\rho} \cdot \dot{\boldsymbol{\rho}}}{\rho}$, se estima el corrimiento Doppler para una portadora de referencia en banda X/Ku ($f_0 = 10\text{ GHz}$):
   $$\Delta f = -f_0 \frac{\dot{\rho}}{c}$$

---

## 3. Geometría del Footprint y Corte en el Antimeridiano

### 3.1 Cálculo del Footprint (Área de Cobertura)
Dado un satélite a altitud $h$ y un ángulo de elevación mínima operativa $\varepsilon_{\min}$ (recomendaciones **ITU-R S.524 / S.731**, típicamente $10^\circ$ para telemetría general y $25^\circ\text{–}40^\circ$ para terminales de usuario Starlink/VSAT en banda Ku/Ka), el ángulo nadir $\eta$ y el ángulo central geocéntrico $\Lambda$ se obtienen por el teorema del seno en el triángulo Centro de la Tierra–Observador–Satélite:

$$\eta = \arcsin\left(\frac{R_E}{R_E + h} \cos\varepsilon_{\min}\right), \qquad \Lambda = \frac{\pi}{2} - \varepsilon_{\min} - \eta$$

El radio superficial del área de cobertura sobre la esfera terrestre es:

$$d_{\text{footprint}} = R_E \cdot \Lambda \quad [\text{km}]$$

### 3.2 Resolución del Cruce del Antimeridiano ($\pm 180^\circ$) en el Ground Track
Cuando un satélite cruza el meridiano $\pm 180^\circ$, dos muestras consecutivas presentan un salto $|\lambda_{i+1} - \lambda_i| > 180^\circ$. En [`computeGroundTrackSegments`](file:///c:/Users/alebo/OneDrive/Escritorio/Facu/lic%20y%20an%20en%20Sistemas/4to%20A%C3%B1o/Programaci%C3%B3n%20M%C3%B3vil/Trabajos%20Practicos/TP%207%20Satellite%20Tracker/src/orbital/orbitalEngine.ts#L220-L307), el motor detecta esta discontinuidad, interpola linealmente la latitud exacta $\phi_{\text{cruce}}$ sobre la frontera $\pm 180^\circ$, cierra el segmento actual en $(\phi_{\text{cruce}}, \pm 180^\circ)$ e inicia un nuevo segmento desde $(\phi_{\text{cruce}}, \mp 180^\circ)$, evitando trazos espurios que atraviesen horizontalmente el mapa.

---

## 4. Algoritmo de Predicción de Pases en Dos Etapas (Grueso $\to$ Fino)

Para evitar el bloqueo del hilo de JavaScript al predecir pases de 24–48 horas (lo que de forma *naive* con paso de 1 s requeriría $86.400$ propagaciones SGP4 por satélite), [`predictUpcomingPasses`](file:///c:/Users/alebo/OneDrive/Escritorio/Facu/lic%20y%20an%20en%20Sistemas/4to%20A%C3%B1o/Programaci%C3%B3n%20M%C3%B3vil/Trabajos%20Practicos/TP%207%20Satellite%20Tracker/src/prediction/passPredictor.ts#L126-L249) implementa:

1. **Barrido Grueso Adaptativo (*Coarse Scan*):** Evalúa la elevación con paso de $40\text{ s}$ cuando el satélite se aproxima al horizonte y duplica el paso a $90\text{ s}$ cuando $\varepsilon(t) < -25^\circ$. Esto reduce la cantidad de evaluaciones SGP4 en más de **60 veces**.
2. **Refinamiento Fino de Cruces de Horizonte (AOS y LOS):** Al detectar un cambio de signo en $\varepsilon(t)$ entre $[t_i, t_{i+1}]$, aplica **8 iteraciones del método de Bisección** (`refineHorizonCrossing`), reduciendo la incertidumbre temporal de $40\text{ s}$ a $\frac{40}{2^8} \approx 0.15\text{ segundos}$.
3. **Búsqueda de Sección Áurea para el TCA (*Max Elevation*):** Dentro del intervalo acotado $[t_{\text{AOS}}, t_{\text{LOS}}]$, aplica **10 iteraciones de búsqueda por razón áurea** ($\varphi - 1 \approx 0.618034$) en `refineMaxElevation` para hallar el instante de máxima elevación $\varepsilon_{\max}$ y mínimo rango oblicuo.

---

## 5. Supuestos y Limitaciones del Modelo Implementado

1. **Teoría de Elementos Medios Simplificados:** SGP4/SDP4 trunca el potencial gravitacional terrestre en $J_4$ (ignorando armónicos de orden superior como $J_{2,2}$ para órbitas bajas) y su error intrínseco en la época del elemento orbital es del orden de $1\text{–}3\text{ km}$.
2. **Modelo Atmosférico Estático:** El término de arrastre $B^*$ asume una atmósfera de decaimiento exponencial fija y no incorpora variaciones dinámicas en tiempo real del flujo solar ($F_{10.7}$) ni tormentas geomagnéticas ($K_p / A_p$). En órbitas muy bajas ($350\text{–}550\text{ km}$ como ISS o Starlink), el error longitudinal (*along-track*) crece cuadráticamente con el tiempo transcurrido desde la época del GP/TLE (típicamente $\approx 1\text{–}3\text{ km/día}$).
3. **Ausencia de Propulsión Continua en SGP4:** Los satélites Starlink utilizan propulsores iónicos de efecto Hall (criptón/argón) para mantenimiento de estación y ascenso orbital continuo. Como SGP4 modela únicamente trayectorias balísticas pasivas, las efemérides pierden vigencia rápidamente si no se refrescan cada 12–24 horas mediante los sets suplementarios (`SupGP`).
4. **Horizonte Geométrico sin Refracción Troposférica Fina:** El cálculo topocéntrico determina la línea de vista geométrica sobre el elipsoide WGS-84 sin aplicar corrección de refracción atmosférica en ángulos rasantes ($\approx 0.57^\circ$ en $\varepsilon = 0^\circ$) ni máscaras de obstrucción topográfica local (edificios o relieve).
5. **Precesión/Nutación Simplificada:** La transformación TEME $\to$ ECEF emplea rotación por GMST sin aplicar los ángulos de movimiento polar ($x_p, y_p$) ni $\Delta\text{UT1}$ de boletines IERS, introduciendo una diferencia menor a $15\text{ metros}$, despreciable frente a la incertidumbre propia de SGP4.

