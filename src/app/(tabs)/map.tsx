import { Colors, Spacing } from '@/constants/theme';
import { useAppTabNavigation } from '@/components/app-tab-navigation';
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
import { isLikelyOpenNow } from './centers';

type Coordinate = {
  latitude: number;
  longitude: number;
};

type MapScreenProps = {
  tabParams?: {
    centerId?: string;
  };
};

const MINNEAPOLIS: Region = {
  latitude: 44.9778,
  longitude: -93.265,
  latitudeDelta: 0.24,
  longitudeDelta: 0.24,
};

export default function MapScreen({
  tabParams,
}: MapScreenProps = {}) {
  const { centerId } = useLocalSearchParams<{ centerId?: string }>();
  const insets = useSafeAreaInsets();
  const {
    savedCenterIds,
    toggleSavedCenter,
  } = useAppTabNavigation();

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
  const [showSavedOnly, setShowSavedOnly] =
    useState(false);
  const [showOpenOnly, setShowOpenOnly] =
    useState(false);
  const [mapRenderVersion, setMapRenderVersion] =
    useState(0);
  const coordinateCache = useRef<Record<string, Coordinate>>({});
  const mapRef = useRef<MapView>(null);

  useFocusEffect(
    useCallback(() => {
      getCenters().then(setCenters);
    }, []),
  );

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
    .filter(
      (center) =>
        !showSavedOnly ||
        savedCenterIds.has(center.id),
    )
    .filter(
      (center) =>
        !showOpenOnly ||
        isLikelyOpenNow(center.hours),
    )
    .filter((center) => coordinates[center.id])
    .map((center) => ({
      center,
      coordinate: coordinates[center.id],
    }));

  const focusedCoordinate = mapFocusId
    ? coordinates[mapFocusId]
    : undefined;
  const mapInitialRegion: Region = focusedCoordinate
    ? {
        ...focusedCoordinate,
        latitudeDelta: 0.025,
        longitudeDelta: 0.025,
      }
    : MINNEAPOLIS;

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

  const toggleMapFilter = (
    filter: 'saved' | 'open',
  ) => {
    if (filter === 'saved') {
      setShowSavedOnly((current) => !current);
    } else {
      setShowOpenOnly((current) => !current);
    }

    setSelectedId(null);
    setMapFocusId(null);
    setMapRenderVersion((current) => current + 1);
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
          key={`${mapFocusId ?? 'all-centers'}-${focusedCoordinate?.latitude ?? ''}-${focusedCoordinate?.longitude ?? ''}-${mapRenderVersion}`}
          ref={mapRef}
          style={styles.map}
          initialRegion={mapInitialRegion}
          showsUserLocation={false}
          removeClippedSubviews={false}
        >
          {markers.map(({ center, coordinate }) => (
            <Marker
              key={center.id}
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
              key="user-location"
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

                <Pressable
                  style={({ pressed }) => [
                    styles.savedCenterButton,
                    savedCenterIds.has(
                      selectedCenter.id,
                    ) && styles.savedCenterButtonActive,
                    pressed &&
                      styles.savedCenterButtonPressed,
                  ]}
                  onPress={() =>
                    toggleSavedCenter(selectedCenter.id)
                  }
                  hitSlop={8}
                >
                  <Ionicons
                    name={
                      savedCenterIds.has(selectedCenter.id)
                        ? 'bookmark'
                        : 'bookmark-outline'
                    }
                    size={18}
                    color={
                      savedCenterIds.has(selectedCenter.id)
                        ? '#FFFFFF'
                        : Colors.text
                    }
                  />
                </Pressable>
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

              <View style={styles.filterRow}>
                <Pressable
                  style={({ pressed }) => [
                    styles.filterButton,
                    showSavedOnly &&
                      styles.filterButtonActive,
                    pressed &&
                      styles.filterButtonPressed,
                  ]}
                  onPress={() => toggleMapFilter('saved')}
                >
                  <Ionicons
                    name={
                      showSavedOnly
                        ? 'bookmark'
                        : 'bookmark-outline'
                    }
                    size={16}
                    color={
                      showSavedOnly
                        ? '#FFFFFF'
                        : Colors.text
                    }
                  />
                  <Text
                    style={[
                      styles.filterButtonText,
                      showSavedOnly &&
                        styles.filterButtonTextActive,
                    ]}
                  >
                    Saved centers
                  </Text>
                </Pressable>

                <Pressable
                  style={({ pressed }) => [
                    styles.filterButton,
                    showOpenOnly &&
                      styles.filterButtonActive,
                    pressed &&
                      styles.filterButtonPressed,
                  ]}
                  onPress={() => toggleMapFilter('open')}
                >
                  <Ionicons
                    name={
                      showOpenOnly
                        ? 'time'
                        : 'time-outline'
                    }
                    size={16}
                    color={
                      showOpenOnly
                        ? '#FFFFFF'
                        : Colors.text
                    }
                  />
                  <Text
                    style={[
                      styles.filterButtonText,
                      showOpenOnly &&
                        styles.filterButtonTextActive,
                    ]}
                  >
                    Open now
                  </Text>
                </Pressable>
              </View>
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

  filterRow: {
    width: '100%',
    flexDirection: 'row',
    gap: 8,
    marginTop: 13,
  },

  filterButton: {
    flex: 1,
    minHeight: 43,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 10,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },

  filterButtonActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },

  filterButtonPressed: {
    opacity: 0.8,
  },

  filterButtonText: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '700',
  },

  filterButtonTextActive: {
    color: '#FFFFFF',
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

  savedCenterButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    backgroundColor: Colors.background,
  },

  savedCenterButtonActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },

  savedCenterButtonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.96 }],
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