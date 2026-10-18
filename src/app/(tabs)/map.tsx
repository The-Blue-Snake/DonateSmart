import { useAppTabNavigation } from '@/components/app-tab-navigation';
import { Border, Colors, Spacing } from '@/constants/theme';
import type { DonationCenter } from '@/constants/types';
import { getCenters } from '@/data/donationCenters';
import { Ionicons } from '@expo/vector-icons';
import { isLikelyOpenNow } from '@/lib/hours';
import * as Location from 'expo-location';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
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
};

const MINNEAPOLIS: Region = {
  latitude: 44.9778,
  longitude: -93.265,
  latitudeDelta: 0.6,
  longitudeDelta: 0.6,
};

const CLUSTER_SIZE = 56;
const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } =
  Dimensions.get('window');

const getStoredCoordinate = (
  center: DonationCenter,
): Coordinate | undefined =>
  Number.isFinite(center.latitude) &&
  Number.isFinite(center.longitude)
    ? {
        latitude: center.latitude,
        longitude: center.longitude,
      }
    : undefined;

type CenterMarker = {
  center: DonationCenter;
  coordinate: Coordinate;
};

type CenterCluster = {
  id: string;
  centers: CenterMarker[];
  coordinate: Coordinate;
};

const clusterMarkers = (
  markers: CenterMarker[],
  region: Region,
): CenterCluster[] => {
  const latitudeCellSize =
    (region.latitudeDelta * CLUSTER_SIZE) /
    SCREEN_HEIGHT;
  const longitudeCellSize =
    (region.longitudeDelta * CLUSTER_SIZE) /
    SCREEN_WIDTH;
  const groups = new Map<string, CenterMarker[]>();

  markers.forEach((marker) => {
    const latitudeCell = Math.floor(
      marker.coordinate.latitude / latitudeCellSize,
    );
    const longitudeCell = Math.floor(
      marker.coordinate.longitude / longitudeCellSize,
    );
    const key = `${latitudeCell}:${longitudeCell}`;
    const group = groups.get(key);

    if (group) {
      group.push(marker);
    } else {
      groups.set(key, [marker]);
    }
  });

  return Array.from(groups.values()).map((centers) => ({
    id: centers.map(({ center }) => center.id).join(':'),
    centers,
    coordinate: {
      latitude:
        centers.reduce(
          (total, marker) => total + marker.coordinate.latitude,
          0,
        ) / centers.length,
      longitude:
        centers.reduce(
          (total, marker) => total + marker.coordinate.longitude,
          0,
        ) / centers.length,
    },
  }));
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
  const [mapRegion, setMapRegion] =
    useState<Region>(MINNEAPOLIS);
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

    const frame = requestAnimationFrame(() => {
      setMapFocusId(focusedCenterId);
      setSelectedId(focusedCenterId);
    });

    return () => cancelAnimationFrame(frame);
  }, [focusedCenterId]);

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

  const markers = useMemo(
    () =>
      centers
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
        .map((center) => ({
          center,
          coordinate: getStoredCoordinate(center),
        }))
        .filter(
          (
            marker,
          ): marker is {
            center: DonationCenter;
            coordinate: Coordinate;
          } => Boolean(marker.coordinate),
        ),
    [
      centers,
      mapFocusId,
      savedCenterIds,
      showOpenOnly,
      showSavedOnly,
    ],
  );

  const focusedCenter = mapFocusId
    ? centers.find((center) => center.id === mapFocusId)
    : undefined;
  const focusedCoordinate = focusedCenter
    ? getStoredCoordinate(focusedCenter)
    : undefined;
  const mapKey = mapFocusId ?? 'all-centers';
  const mapInitialRegion: Region = focusedCoordinate
    ? {
        ...focusedCoordinate,
        latitudeDelta: 0.025,
        longitudeDelta: 0.025,
      }
    : MINNEAPOLIS;
  const markerClusters = useMemo(
    () => clusterMarkers(markers, mapRegion),
    [markers, mapRegion],
  );

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
    setMapRegion(MINNEAPOLIS);
  };

  const expandCluster = (cluster: CenterCluster) => {
    mapRef.current?.animateToRegion(
      {
        ...cluster.coordinate,
        latitudeDelta: Math.max(
          mapRegion.latitudeDelta * 0.35,
          0.005,
        ),
        longitudeDelta: Math.max(
          mapRegion.longitudeDelta * 0.35,
          0.005,
        ),
      },
      300,
    );
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
          key={mapKey}
          ref={mapRef}
          style={styles.map}
          initialRegion={mapInitialRegion}
          onRegionChangeComplete={(region) =>
            setMapRegion(region)
          }
          mapType="standard"
          tintColor={Colors.secondary}
          userInterfaceStyle="light"
          showsUserLocation={false}
          removeClippedSubviews={false}
        >
          {markerClusters.map((cluster) => (
            <Marker
              key={cluster.id}
              coordinate={cluster.coordinate}
              anchor={{ x: 0.5, y: 0.5 }}
              onPress={() => {
                if (cluster.centers.length === 1) {
                  focusOnCenter(cluster.centers[0].center.id);
                } else {
                  expandCluster(cluster);
                }
              }}
            >
              <View
                style={
                  cluster.centers.length === 1
                    ? styles.pinShadowWrap
                    : styles.clusterShadowWrap
                }
              >
                {cluster.centers.length === 1 ? (
                  <View style={styles.centerPin}>
                    <Ionicons
                      name="heart"
                      size={16}
                      color={Colors.white}
                    />
                  </View>
                ) : (
                  <View style={styles.clusterPin}>
                    <Text style={styles.clusterCount}>
                      {cluster.centers.length}
                    </Text>
                  </View>
                )}
              </View>
            </Marker>
          ))}

          {userLocation ? (
            <Marker
              key="user-location"
              coordinate={userLocation}
              anchor={{ x: 0.5, y: 0.5 }}
              zIndex={1000}
            >
              <View style={styles.pinShadowWrap}>
                <View style={styles.userPin}>
                  <Ionicons
                    name="navigate"
                    size={15}
                    color={Colors.white}
                  />
                </View>
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
              size={20}
              color="#FFFFFF"
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
                    color="#FFFFFF"
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
                    color={Colors.white}
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
                  onPress={() =>
                    setShowSavedOnly(
                      (current) => !current,
                    )
                  }
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
                  onPress={() =>
                    setShowOpenOnly(
                      (current) => !current,
                    )
                  }
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
    borderWidth: Border.width,
    borderColor: Colors.border,
    borderRadius: 16,
    backgroundColor: Colors.card,
  },

  map: {
    ...StyleSheet.absoluteFill,
  },

  closeButton: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    borderWidth: Border.width,
    borderColor: Colors.border,
    backgroundColor: Colors.secondary,
  },

  closeButtonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.94 }],
  },

  pinShadowWrap: {
    width: 28,
    height: 28,
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

  clusterShadowWrap: {
    minWidth: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 6,
  },

  clusterPin: {
    minWidth: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    borderWidth: Border.width / 1.5,
    borderColor: Colors.border,
    borderRadius: 17,
    backgroundColor: Colors.primary,
  },

  clusterCount: {
    color: Colors.white,
    fontSize: 13,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },

  centerPin: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: Border.width / 1.5,
    borderColor: Colors.border,
    borderRadius: 12,
    backgroundColor: Colors.primary,
  },

  userPin: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: Border.width / 1.5,
    borderColor: Colors.border,
    borderRadius: 12,
    backgroundColor: Colors.secondary,
  },

  infoPanel: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    left: 10,

    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,

    borderWidth: Border.width,
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
    borderWidth: Border.width,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },

  filterButtonActive: {
    borderColor: Colors.secondary,
    backgroundColor: Colors.secondary,
  },

  filterButtonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.985 }],
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
    borderWidth: Border.width,
    borderColor: Colors.border,
    borderRadius: 18,
    backgroundColor: Colors.secondary,
  },

  savedCenterButtonActive: {
    borderColor: Colors.border,
    backgroundColor: Colors.secondary,
  },

  savedCenterButtonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.94 }],
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
    color: Colors.white,
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
    borderWidth: Border.width,
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