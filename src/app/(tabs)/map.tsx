import { Colors, Spacing } from '@/constants/theme';
import type { DonationCenter } from '@/constants/types';
import { getCenters } from '@/data/donationCenters';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Coordinate = {
  latitude: number;
  longitude: number;
};

type MapScreenProps = {
  tabParams?: {
    centerId?: string;
  };
  isActive?: boolean;
};

const MINNEAPOLIS: Region = {
  latitude: 44.9778,
  longitude: -93.265,
  latitudeDelta: 0.24,
  longitudeDelta: 0.24,
};

export default function MapScreen({
  tabParams,
  isActive = true,
}: MapScreenProps = {}) {
  const { centerId } = useLocalSearchParams<{ centerId?: string }>();
  const insets = useSafeAreaInsets();

  const focusedCenterId =
    tabParams?.centerId ??
    (Array.isArray(centerId) ? centerId[0] : centerId);

  const [centers, setCenters] = useState<DonationCenter[]>([]);
  const [coordinates, setCoordinates] = useState<
    Record<string, Coordinate>
  >({});
  const [selectedId, setSelectedId] = useState<string | null>(
    focusedCenterId ?? null,
  );
  const [mapFocusId, setMapFocusId] = useState<string | null>(
    focusedCenterId ?? null,
  );
  const [userLocation, setUserLocation] =
    useState<Coordinate | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [markerRenderVersion, setMarkerRenderVersion] = useState(0);

  const coordinateCache = useRef<Record<string, Coordinate>>({});
  const mapRef = useRef<MapView>(null);
  const visibleRegion = useRef<Region>(MINNEAPOLIS);

  useFocusEffect(
    useCallback(() => {
      getCenters().then(setCenters);
    }, []),
  );

  /*
   * Force marker remount when the map becomes active.
   *
   * This keeps the existing marker redraw fix without trying
   * to reposition the entire MapView during the navigation
   * transition.
   */
  useEffect(() => {
    if (!isActive) {
      return;
    }

    setMarkerRenderVersion((current) => current + 1);
  }, [isActive]);

  /*
   * Only respond to a centerId that was supplied when navigating
   * to the map from another screen.
   *
   * Selecting pins on the map itself does NOT update the router,
   * so the selection won't persist when returning to Centers.
   */
  useEffect(() => {
    if (focusedCenterId === undefined) {
      return;
    }

    setMapFocusId(focusedCenterId);
    setSelectedId(focusedCenterId);
  }, [focusedCenterId]);

  useEffect(() => {
    let active = true;

    const geocodeCenters = async () => {
      const orderedCenters = mapFocusId
        ? [...centers].sort((first) =>
            first.id === mapFocusId ? -1 : 1,
          )
        : centers;

      for (const center of orderedCenters) {
        if (!active || coordinateCache.current[center.id]) {
          continue;
        }

        try {
          const [coordinate] = await Location.geocodeAsync(
            center.address,
          );

          if (active && coordinate) {
            const resolved = {
              latitude: coordinate.latitude,
              longitude: coordinate.longitude,
            };

            coordinateCache.current[center.id] = resolved;

            setCoordinates((current) => ({
              ...current,
              [center.id]: resolved,
            }));
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
        status === Location.PermissionStatus.GRANTED
          ? Location.getCurrentPositionAsync({})
          : null,
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

  const selectedCenter = centers.find(
    (center) => center.id === selectedId,
  );

  const markers = centers
    .filter(
      (center) =>
        !mapFocusId || center.id === mapFocusId,
    )
    .filter((center) => coordinates[center.id])
    .map((center) => ({
      center,
      coordinate: coordinates[center.id],
    }));

  useEffect(() => {
    if (!mapReady || !mapFocusId || !selectedCenter) {
      return;
    }

    const marker = markers.find(
      ({ center }) => center.id === mapFocusId,
    );

    if (marker) {
      mapRef.current?.animateToRegion(
        {
          ...marker.coordinate,
          latitudeDelta: 0.025,
          longitudeDelta: 0.025,
        },
        500,
      );
    }
  }, [
    mapFocusId,
    mapReady,
    markers,
    selectedCenter,
  ]);

  /*
   * Selecting a pin is intentionally LOCAL state only.
   *
   * Do not call router.setParams() here. Otherwise the selected
   * centerId survives when switching back to the Centers tab.
   */
  const focusOnCenter = (id: string) => {
    setSelectedId(id);
    setMapFocusId(id);
  };

  /*
   * Return the map to showing all centers.
   *
   * Again, this only changes local map state.
   */
  const showAllCenters = () => {
    setSelectedId(null);
    setMapFocusId(null);
  };

  const openRoute = async (
    provider: 'apple' | 'google',
  ) => {
    if (!selectedCenter) {
      return;
    }

    const destination = encodeURIComponent(
      selectedCenter.address,
    );

    const url =
      provider === 'apple'
        ? `http://maps.apple.com/?daddr=${destination}`
        : `https://www.google.com/maps/dir/?api=1&destination=${destination}`;

    await Linking.openURL(url);
  };

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: insets.top,
        },
      ]}
    >
      <View style={styles.mapCard}>
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={MINNEAPOLIS}
          showsUserLocation={false}
          removeClippedSubviews={false}
          onMapReady={() => {
            setMapReady(true);
          }}
          onRegionChangeComplete={(region) => {
            visibleRegion.current = region;
          }}
        >
          {markers.map(({ center, coordinate }) => (
            <Marker
              key={`${center.id}-${markerRenderVersion}`}
              coordinate={coordinate}
              anchor={{ x: 0.5, y: 1 }}
              onPress={() => focusOnCenter(center.id)}
            >
              <View style={styles.pinShadowWrap}>
                <Ionicons
                  name="location-outline"
                  size={22}
                  color={Colors.white}
                />
              </View>
            </Marker>
          ))}

          {userLocation ? (
            <Marker
              key={`user-location-${markerRenderVersion}`}
              coordinate={userLocation}
              anchor={{ x: 0.5, y: 1 }}
            >
              <View style={styles.pinShadowWrap}>
                <Ionicons
                  name="location-outline"
                  size={22}
                  color={Colors.primary}
                />
              </View>
            </Marker>
          ) : null}
        </MapView>

        {/* Close button */}
        {mapFocusId ? (
          <Pressable
            style={({ pressed }) => [
              styles.closeButton,
              pressed && styles.closeButtonPressed,
            ]}
            onPress={showAllCenters}
          >
            <Ionicons
              name="close"
              size={18}
              color={Colors.text}
            />
          </Pressable>
        ) : null}

        {/* Information popup */}
        <View style={styles.infoPanel}>
          {selectedCenter ? (
            <>
              <View style={styles.selectedHeader}>
                <View style={styles.selectedTextGroup}>
                  <Text
                    style={styles.selectedName}
                    numberOfLines={1}
                  >
                    {selectedCenter.name}
                  </Text>

                  <Text
                    style={styles.address}
                    numberOfLines={1}
                  >
                    {selectedCenter.address}
                  </Text>
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.routeButtons}>
                <Pressable
                  style={({ pressed }) => [
                    styles.routeButton,
                    pressed &&
                      styles.routeButtonPressed,
                  ]}
                  onPress={() => openRoute('apple')}
                >
                  <Ionicons
                    name="navigate-outline"
                    size={16}
                    color={Colors.card}
                  />

                  <Text style={styles.routeButtonText}>
                    Apple Maps
                  </Text>
                </Pressable>

                <Pressable
                  style={({ pressed }) => [
                    styles.routeButtonSecondary,
                    pressed &&
                      styles.routeButtonSecondaryPressed,
                  ]}
                  onPress={() => openRoute('google')}
                >
                  <Ionicons
                    name="navigate-outline"
                    size={16}
                    color={Colors.text}
                  />

                  <Text
                    style={
                      styles.routeButtonSecondaryText
                    }
                  >
                    Google Maps
                  </Text>
                </Pressable>
              </View>
            </>
          ) : (
            <View style={styles.emptyPanel}>
              <Text style={styles.emptyPanelText}>
                Select a pin to view information
              </Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  mapCard: {
    flex: 1,
    minHeight: 0,
    marginTop: 4,
    marginBottom: 20,
    marginHorizontal: Spacing.screen,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    backgroundColor: Colors.card,
  },

  map: {
    ...StyleSheet.absoluteFillObject,
  },

  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.card,

    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 7,
    shadowOffset: {
      width: 0,
      height: 3,
    },

    elevation: 4,
  },

  closeButtonPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.95 }],
  },

  pinShadowWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 6,
  },

  infoPanel: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    left: 10,

    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,

    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    backgroundColor: Colors.card,

    shadowColor: '#000000',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: {
      width: 0,
      height: 5,
    },

    elevation: 7,
  },

  emptyPanel: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
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
    minWidth: 0,
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

  divider: {
    height: 1,
    marginTop: 14,
    backgroundColor: Colors.border,
  },

  routeButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },

  routeButton: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 11,
    backgroundColor: Colors.primary,
  },

  routeButtonPressed: {
    opacity: 0.84,
    transform: [{ scale: 0.985 }],
  },

  routeButtonText: {
    color: Colors.card,
    fontWeight: '600',
    fontSize: 13.5,
  },

  routeButtonSecondary: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 11,
    backgroundColor: Colors.card,
  },

  routeButtonSecondaryPressed: {
    opacity: 0.65,
    transform: [{ scale: 0.985 }],
  },

  routeButtonSecondaryText: {
    color: Colors.text,
    fontWeight: '600',
    fontSize: 13.5,
  },
});