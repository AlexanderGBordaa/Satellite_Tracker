import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';
import type { PassWindow, TopocentricLookAngles } from '../types/orbital';

interface PolarSkyChartProps {
  size?: number;
  pass: PassWindow | null;
  liveLookAngles?: TopocentricLookAngles | null;
  minElevationDeg?: number;
  deviceHeadingDeg?: number | null;
}

/**
 * Convierte coordenadas topocéntricas polares (Azimut 0°=Norte horario, Elevación 0°=borde, 90°=centro)
 * en coordenadas cartesianas (x, y) dentro del lienzo SVG.
 */
export function polarToCartesian(
  centerX: number,
  centerY: number,
  maxRadius: number,
  azimuthDeg: number,
  elevationDeg: number
): { x: number; y: number } {
  const clampedEl = Math.max(0, Math.min(90, elevationDeg));
  const r = maxRadius * (1 - clampedEl / 90);
  const azRad = (azimuthDeg * Math.PI) / 180;
  return {
    x: centerX + r * Math.sin(azRad),
    y: centerY - r * Math.cos(azRad),
  };
}

export const PolarSkyChart: React.FC<PolarSkyChartProps> = ({
  size = 300,
  pass,
  liveLookAngles,
  minElevationDeg = 10,
  deviceHeadingDeg = null,
}) => {
  const center = size / 2;
  const maxRadius = size / 2 - 28;

  const r30 = maxRadius * (1 - 30 / 90);
  const r60 = maxRadius * (1 - 60 / 90);
  const rMinEl = maxRadius * (1 - Math.max(0, Math.min(89, minElevationDeg)) / 90);

  // Construcción del path SVG de la trayectoria del pase seleccionado
  let pathData = '';
  let aosPoint: { x: number; y: number } | null = null;
  let tcaPoint: { x: number; y: number } | null = null;
  let losPoint: { x: number; y: number } | null = null;

  if (pass && pass.skyTrack.length >= 2) {
    const coords = pass.skyTrack.map((pt) =>
      polarToCartesian(center, center, maxRadius, pt.azimuthDeg, pt.elevationDeg)
    );
    pathData = coords
      .map((c, idx) => `${idx === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
      .join(' ');

    aosPoint = coords[0];
    losPoint = coords[coords.length - 1];
    tcaPoint = polarToCartesian(
      center,
      center,
      maxRadius,
      pass.tcaAzimuthDeg,
      pass.maxElevationDeg
    );
  }

  // Posición en vivo del satélite si se encuentra sobre el horizonte (elevación > 0°)
  const livePoint =
    liveLookAngles && liveLookAngles.elevationDeg > 0
      ? polarToCartesian(
          center,
          center,
          maxRadius,
          liveLookAngles.azimuthDeg,
          liveLookAngles.elevationDeg
        )
      : null;

  // Vector de orientación del dispositivo si se provee (para modo brújula integrado)
  const headingPoint =
    deviceHeadingDeg !== null
      ? polarToCartesian(center, center, maxRadius, deviceHeadingDeg, 0)
      : null;

  return (
    <View style={styles.container}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Fondo de la bóveda celeste */}
        <Circle
          cx={center}
          cy={center}
          r={maxRadius}
          fill="#0B1528"
          stroke="#2E4A7D"
          strokeWidth={2}
        />

        {/* Anillos concéntricos de elevación: 30° y 60° */}
        <Circle
          cx={center}
          cy={center}
          r={r30}
          fill="none"
          stroke="#1E335C"
          strokeWidth={1}
          strokeDasharray="4,4"
        />
        <Circle
          cx={center}
          cy={center}
          r={r60}
          fill="none"
          stroke="#1E335C"
          strokeWidth={1}
          strokeDasharray="4,4"
        />

        {/* Anillo de elevación mínima operativa configurada (ITU-R / VSAT) */}
        {minElevationDeg > 0 && (
          <Circle
            cx={center}
            cy={center}
            r={rMinEl}
            fill="none"
            stroke="#F59E0B"
            strokeWidth={1.2}
            strokeDasharray="6,4"
            opacity={0.75}
          />
        )}

        {/* Ejes cardinales N-S y E-O + diagonales */}
        <Line
          x1={center}
          y1={center - maxRadius}
          x2={center}
          y2={center + maxRadius}
          stroke="#1E335C"
          strokeWidth={1}
        />
        <Line
          x1={center - maxRadius}
          y1={center}
          x2={center + maxRadius}
          y2={center}
          stroke="#1E335C"
          strokeWidth={1}
        />

        {/* Etiquetas de elevación */}
        <SvgText x={center + 4} y={center - maxRadius + 12} fill="#64748B" fontSize="10">
          0°
        </SvgText>
        <SvgText x={center + 4} y={center - r30 + 12} fill="#64748B" fontSize="10">
          30°
        </SvgText>
        <SvgText x={center + 4} y={center - r60 + 12} fill="#64748B" fontSize="10">
          60°
        </SvgText>
        <SvgText x={center + 4} y={center - 4} fill="#64748B" fontSize="10">
          90°
        </SvgText>

        {/* Puntos cardinales */}
        <SvgText
          x={center}
          y={16}
          fill="#38BDF8"
          fontSize="13"
          fontWeight="bold"
          textAnchor="middle"
        >
          N
        </SvgText>
        <SvgText
          x={size - 12}
          y={center + 4}
          fill="#94A3B8"
          fontSize="12"
          fontWeight="bold"
          textAnchor="middle"
        >
          E
        </SvgText>
        <SvgText
          x={center}
          y={size - 6}
          fill="#94A3B8"
          fontSize="12"
          fontWeight="bold"
          textAnchor="middle"
        >
          S
        </SvgText>
        <SvgText
          x={12}
          y={center + 4}
          fill="#94A3B8"
          fontSize="12"
          fontWeight="bold"
          textAnchor="middle"
        >
          O
        </SvgText>

        {/* Línea de rumbo del dispositivo si está activa */}
        {headingPoint && (
          <Line
            x1={center}
            y1={center}
            x2={headingPoint.x}
            y2={headingPoint.y}
            stroke="#A855F7"
            strokeWidth={2}
            strokeDasharray="3,3"
          />
        )}

        {/* Trayectoria polar del pase (AOS -> TCA -> LOS) */}
        {pathData !== '' && (
          <G>
            <Path
              d={pathData}
              fill="none"
              stroke="#38BDF8"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Punto AOS (Inicio de visibilidad) */}
            {aosPoint && (
              <G>
                <Circle
                  cx={aosPoint.x}
                  cy={aosPoint.y}
                  r={5}
                  fill="#22C55E"
                  stroke="#052E16"
                  strokeWidth={1.5}
                />
                <SvgText
                  x={aosPoint.x + 8}
                  y={aosPoint.y + 4}
                  fill="#4ADE80"
                  fontSize="10"
                  fontWeight="bold"
                >
                  AOS
                </SvgText>
              </G>
            )}

            {/* Punto TCA / Elevación Máxima */}
            {tcaPoint && (
              <G>
                <Circle
                  cx={tcaPoint.x}
                  cy={tcaPoint.y}
                  r={6}
                  fill="#FACC15"
                  stroke="#422006"
                  strokeWidth={1.5}
                />
                <SvgText
                  x={tcaPoint.x}
                  y={tcaPoint.y - 10}
                  fill="#FDE047"
                  fontSize="10"
                  fontWeight="bold"
                  textAnchor="middle"
                >
                  {`MÁX ${pass?.maxElevationDeg.toFixed(1)}°`}
                </SvgText>
              </G>
            )}

            {/* Punto LOS (Pérdida de señal) */}
            {losPoint && (
              <G>
                <Circle
                  cx={losPoint.x}
                  cy={losPoint.y}
                  r={5}
                  fill="#EF4444"
                  stroke="#450A0A"
                  strokeWidth={1.5}
                />
                <SvgText
                  x={losPoint.x - 8}
                  y={losPoint.y + 4}
                  fill="#F87171"
                  fontSize="10"
                  fontWeight="bold"
                  textAnchor="end"
                >
                  LOS
                </SvgText>
              </G>
            )}
          </G>
        )}

        {/* Posición actual en tiempo real del satélite si está sobre el horizonte */}
        {livePoint && (
          <G>
            <Circle cx={livePoint.x} cy={livePoint.y} r={10} fill="rgba(56, 189, 248, 0.25)" />
            <Circle
              cx={livePoint.x}
              cy={livePoint.y}
              r={5.5}
              fill="#00F5D4"
              stroke="#FFFFFF"
              strokeWidth={1.5}
            />
          </G>
        )}
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

