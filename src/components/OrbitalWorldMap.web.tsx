import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import type { OrbitalWorldMapProps } from './OrbitalWorldMap';

const MAP_W = 720;
const MAP_H = 360;

function lonToX(lon: number): number {
  return ((lon + 180) / 360) * MAP_W;
}

function latToY(lat: number): number {
  return ((90 - lat) / 180) * MAP_H;
}

export const OrbitalWorldMap: React.FC<OrbitalWorldMapProps> = ({
  telemetry,
  groundTrackSegments,
  observer,
  showFootprint,
  showGroundTrack,
  showConstellationLayer,
  constellationPoints,
}) => {
  const satX = telemetry ? lonToX(telemetry.subsatellite.longitudeDeg) : MAP_W / 2;
  const satY = telemetry ? latToY(telemetry.subsatellite.latitudeDeg) : MAP_H / 2;
  const obsX = lonToX(observer.longitudeDeg);
  const obsY = latToY(observer.latitudeDeg);

  // Aproximación equirectangular del radio del footprint (1° ~ 111.32 km)
  const footprintRadiusPx = telemetry
    ? (telemetry.footprintRadiusKm / 111.32) * (MAP_H / 180)
    : 0;

  return (
    <View style={styles.container}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${MAP_W} ${MAP_H}`}>
        <Rect x={0} y={0} width={MAP_W} height={MAP_H} fill="#071120" />

        {/* Grilla de paralelos y meridianos cada 30° */}
        {[-60, -30, 0, 30, 60].map((lat) => (
          <Line
            key={`lat-${lat}`}
            x1={0}
            y1={latToY(lat)}
            x2={MAP_W}
            y2={latToY(lat)}
            stroke={lat === 0 ? '#1E3A8A' : '#112240'}
            strokeWidth={lat === 0 ? 1.5 : 1}
          />
        ))}
        {[-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150].map((lon) => (
          <Line
            key={`lon-${lon}`}
            x1={lonToX(lon)}
            y1={0}
            x2={lonToX(lon)}
            y2={MAP_H}
            stroke={lon === 0 ? '#1E3A8A' : '#112240'}
            strokeWidth={lon === 0 ? 1.5 : 1}
          />
        ))}

        {/* Ground Track con corte en antimeridiano */}
        {showGroundTrack &&
          groundTrackSegments.map((seg) => {
            const d = seg.coordinates
              .map(
                (c, idx) =>
                  `${idx === 0 ? 'M' : 'L'} ${lonToX(c.longitude).toFixed(1)} ${latToY(
                    c.latitude
                  ).toFixed(1)}`
              )
              .join(' ');
            return (
              <Path
                key={seg.id}
                d={d}
                fill="none"
                stroke={seg.isPast ? '#FACC15' : '#38BDF8'}
                strokeWidth={seg.isPast ? 1.5 : 2.5}
                strokeDasharray={seg.isPast ? '4,4' : undefined}
              />
            );
          })}

        {/* Footprint */}
        {showFootprint && telemetry && footprintRadiusPx > 2 && (
          <Circle
            cx={satX}
            cy={satY}
            r={footprintRadiusPx}
            fill="rgba(56, 189, 248, 0.16)"
            stroke="#38BDF8"
            strokeWidth={1.5}
          />
        )}

        {/* Capa de constelación Starlink */}
        {showConstellationLayer &&
          constellationPoints.map((pt) => (
            <Circle
              key={`web-sl-${pt.noradId}`}
              cx={lonToX(pt.longitudeDeg)}
              cy={latToY(pt.latitudeDeg)}
              r={3}
              fill="#FACC15"
            />
          ))}

        {/* Observador */}
        <G>
          <Circle cx={obsX} cy={obsY} r={5} fill="#22C55E" />
          <SvgText x={obsX + 8} y={obsY + 4} fill="#4ADE80" fontSize="10" fontWeight="bold">
            OBS
          </SvgText>
        </G>

        {/* Satélite seleccionado */}
        {telemetry && (
          <G>
            <Circle cx={satX} cy={satY} r={11} fill="rgba(56, 189, 248, 0.28)" />
            <Circle cx={satX} cy={satY} r={5} fill="#38BDF8" stroke="#FFF" strokeWidth={1.5} />
            <SvgText
              x={satX + 9}
              y={satY - 6}
              fill="#F8FAFC"
              fontSize="11"
              fontWeight="bold"
            >
              {telemetry.orbital.name}
            </SvgText>
          </G>
        )}
      </Svg>
      <View style={styles.webBanner}>
        <Text style={styles.webBannerText}>
          Vista Proyección Equirectangular (Web) • En Android/iOS utiliza react-native-maps nativo
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#071120',
  },
  webBanner: {
    position: 'absolute',
    bottom: 6,
    left: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  webBannerText: {
    color: '#94A3B8',
    fontSize: 10,
  },
});

