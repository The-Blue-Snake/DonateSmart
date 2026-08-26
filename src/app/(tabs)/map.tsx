import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Spacing } from '@/constants/theme';
import type { DonationCenter } from '@/constants/types';
import { getCenters } from '@/data/donationCenters';

type Coordinate = {
  latitude: number;
  longitude: number;
};

const MINNEAPOLIS: Region = {
  latitude: 44.9778,
  longitude: -93.265,
  latitudeDelta: 0.16,
  longitudeDelta: 0.16,
};

export default function MapScreen() {
  const { centerId } = useLocalSearchParams<{ centerId?: string }>();
  const focusedCenterId = Array.isArray(centerId) ? centerId[0] : centerId;

  const [centers, setCenters] = useState<DonationCenter[]>([]);
  const [coordinates, setCoordinates] = useState<Record<string, Coordinate>>({});
  const [selectedId, setSelectedId] = useState<string | null>(focusedCenterId ?? null);
  const [mapFocusId, setMapFocusId] = useState<string | null>(focusedCenterId ?? null);
  const [userLocation, setUserLocation] = useState<Coordinate | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const coordinateCache = useRef<Record<string, Coordinate>>({});
  const mapRef = useRef<MapView>(null);

  useFocusEffect(
    useCallback(() => {
      getCenters().then(setCenters);
    }, []),
  );

  useEffect(() => {
    setMapReady(false);
    setMapFocusId(focusedCenterId ?? null);
    setSelectedId(focusedCenterId ?? null);
  }, [focusedCenterId]);

  useEffect(() => {
    let active = true;

    const geocodeCenters = async () => {
      const orderedCenters = mapFocusId ? [...centers].sort((first) => (first.id === mapFocusId ? -1 : 1)) : centers;

      for (const center of orderedCenters) {
        if (!active || coordinateCache.current[center.id]) {
          continue;
        }

        try {
          const [coordinate] = await Location.geocodeAsync(center.address);
          if (active && coordinate) {
            const resolved = { latitude: coordinate.latitude, longitude: coordinate.longitude };
            coordinateCache.current[center.id] = resolved;
            setCoordinates((current) => ({ ...current, [center.id]: resolved }));
          }
        } catch {
          continue;
        }
      }
    };

    if (centers.length) {
      geocodeCenters();
    }

    return () => {
      active = false;
    };
  }, [centers, mapFocusId]);

  useEffect(() => {
    Location.requestForegroundPermissionsAsync()
      .then(({ status }) =>
        status === Location.PermissionStatus.GRANTED ? Location.getCurrentPositionAsync({}) : null,
      )
      .then((position) => {
        if (position) {
          setUserLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        }
      })
      .catch(() => undefined);
  }, []);

  const selectedCenter = centers.find((center) => center.id === selectedId);
  const markers = centers
    .filter((center) => !mapFocusId || center.id === mapFocusId)
    .filter((center) => coordinates[center.id])
    .map((center) => ({ center, coordinate: coordinates[center.id] }));

  useEffect(() => {
    if (!mapReady || !mapFocusId || !selectedCenter) {
      return;
    }

    const marker = markers.find(({ center }) => center.id === mapFocusId);
    if (marker) {
      mapRef.current?.animateToRegion(
        { ...marker.coordinate, latitudeDelta: 0.025, longitudeDelta: 0.025 },
        500,
      );
    }
  }, [mapFocusId, mapReady, markers, selectedCenter]);

  const focusOnCenter = (id: string) => {
    setMapReady(false);
    setSelectedId(id);
    setMapFocusId(id);
    router.setParams({ centerId: id });
  };

  const showAllCenters = () => {
    setMapReady(false);
    setSelectedId(null);
    setMapFocusId(null);
    router.setParams({ centerId: undefined });
  };

  const openRoute = async (provider: 'apple' | 'google') => {
    if (!selectedCenter) {
      return;
    }

    const destination = encodeURIComponent(selectedCenter.address);
    const url =
      provider === 'apple'
        ? `http://maps.apple.com/?daddr=${destination}`
        : `https://www.google.com/maps/dir/?api=1&destination=${destination}`;

    await Linking.openURL(url);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.headerSection}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Map</Text>

          {mapFocusId ? (
            <Pressable style={styles.closeButton} onPress={showAllCenters}>
              <Ionicons name="close" size={18} color={Colors.text} />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.headerDivider} />
      </View>

      <View style={styles.mapCard}>
        <View style={styles.mapWrapper}>
          <MapView
            key={mapFocusId ?? 'all-centers'}
            ref={mapRef}
            style={styles.map}
            initialRegion={MINNEAPOLIS}
            showsUserLocation={false}
            onMapReady={() => setMapReady(true)}
          >
            {markers.map(({ center, coordinate }) => (
              <Marker
                key={center.id}
                coordinate={coordinate}
                anchor={{ x: 0.5, y: 0.5 }}
                onPress={() => focusOnCenter(center.id)}
              >
                <View style={styles.pinShadowWrap}>
                  <Ionicons name="location-sharp" size={28} color={Colors.primary} />
                  <View style={styles.pinCoreBlack} />
                </View>
              </Marker>
            ))}

            {userLocation ? (
              <Marker coordinate={userLocation}>
                <View style={styles.pinShadowWrap}>
                  <Ionicons name="location-sharp" size={28} color={Colors.accent} />
                  <View style={styles.pinCoreBlack} />
                </View>
              </Marker>
            ) : null}
          </MapView>
        </View>

        <View style={styles.infoPanel}>
          {selectedCenter ? (
            <>
              <View style={styles.selectedHeader}>
                <View style={styles.selectedTextGroup}>
                  <Text style={styles.selectedName} numberOfLines={1}>
                    {selectedCenter.name}
                  </Text>
                  <Text style={styles.address} numberOfLines={1}>
                    {selectedCenter.address}
                  </Text>
                </View>

                {mapFocusId ? (
                  <Pressable
                    style={styles.detailsLink}
                    onPress={() =>
                      router.push({ pathname: '/(tabs)/centers', params: { centerId: selectedCenter.id } })
                    }
                  >
                    <Text style={styles.detailsLinkText}>More</Text>
                    <Ionicons name="chevron-forward" size={14} color={Colors.primary} />
                  </Pressable>
                ) : null}
              </View>

              <View style={styles.divider} />

              <View style={styles.routeButtons}>
                <Pressable style={styles.routeButton} onPress={() => openRoute('apple')}>
                  <Ionicons name="navigate-outline" size={16} color={Colors.card} />
                  <Text style={styles.routeButtonText}>Apple Maps</Text>
                </Pressable>
                <Pressable style={styles.routeButtonSecondary} onPress={() => openRoute('google')}>
                  <Ionicons name="navigate-outline" size={16} color={Colors.text} />
                  <Text style={styles.routeButtonSecondaryText}>Google Maps</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <View style={styles.emptyPanel}>
              <Text style={styles.emptyPanelText}>Select a pin to view information</Text>
            </View>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  headerSection: {
    paddingHorizontal: Spacing.screen,
    paddingTop: 10,
    marginBottom: 18,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    color: Colors.text,
    letterSpacing: -0.4,
  },
  headerDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginTop: 12,
    marginHorizontal: -Spacing.screen,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapCard: {
    flex: 1,
    minHeight: 0,
    marginBottom: 20,
    marginHorizontal: Spacing.screen,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    overflow: 'hidden',
  },
  mapWrapper: {
    flex: 1,
    minHeight: 0,
  },
  map: {
    flex: 1,
  },
  pinShadowWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 8,
    position: 'relative',
  },
  pinCoreBlack: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#111111',
    top: 7,
    left: '50%',
    marginLeft: -4,
  },
  infoPanel: {
    backgroundColor: Colors.card,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingHorizontal: Spacing.screen,
    paddingTop: 18,
    paddingBottom: 20,
  },
  emptyPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  emptyPanelText: {
    color: Colors.textMuted,
    fontSize: 14,
    fontWeight: '500',
  },
  selectedHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  selectedTextGroup: {
    flex: 1,
  },
  selectedName: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  address: {
    color: Colors.textMuted,
    fontSize: 13,
    marginTop: 3,
  },
  detailsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingTop: 2,
  },
  detailsLinkText: {
    color: Colors.primary,
    fontWeight: '600',
    fontSize: 13,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginTop: 16,
  },
  routeButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  routeButton: {
    flex: 1,
    flexDirection: 'row',
    gap: 7,
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeButtonText: {
    color: Colors.card,
    fontWeight: '600',
    fontSize: 14,
  },
  routeButtonSecondary: {
    flex: 1,
    flexDirection: 'row',
    gap: 7,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeButtonSecondaryText: {
    color: Colors.text,
    fontWeight: '600',
    fontSize: 14,
  },
});