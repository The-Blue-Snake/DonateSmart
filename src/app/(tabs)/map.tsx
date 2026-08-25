import * as Location from 'expo-location';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

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
  const insets = useSafeAreaInsets();
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

  const extraBottomSpacing = insets.bottom + 26;

  return (
    <SafeAreaView style={[styles.container, { paddingBottom: extraBottomSpacing }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Map</Text>

        {mapFocusId ? (
          <Pressable style={styles.closeButton} onPress={showAllCenters}>
            <Text style={styles.closeButtonText}>X</Text>
          </Pressable>
        ) : null}
      </View>

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
            <View style={styles.centerMarker} />
          </Marker>
        ))}

        {userLocation ? (
          <Marker coordinate={userLocation}>
            <View style={styles.userMarker} />
          </Marker>
        ) : null}
      </MapView>

      {selectedCenter ? (
        <View style={[styles.bottomPanel, { paddingBottom: extraBottomSpacing + 8 }]}>
          <Text style={styles.selectedName}>{selectedCenter.name}</Text>
          <Text style={styles.address}>{selectedCenter.address}</Text>

          {mapFocusId ? (
            <Pressable
              style={styles.detailsButton}
              onPress={() => router.push({ pathname: '/(tabs)/centers', params: { centerId: selectedCenter.id } })}
            >
              <Text style={styles.detailsButtonText}>More details</Text>
            </Pressable>
          ) : null}

          <View style={styles.routeButtons}>
            <Pressable style={styles.routeButton} onPress={() => openRoute('apple')}>
              <Text style={styles.routeButtonText}>Apple Maps</Text>
            </Pressable>
            <Pressable style={styles.routeButton} onPress={() => openRoute('google')}>
              <Text style={styles.routeButtonText}>Google Maps</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
  },
  header: {
    height: 52,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.screen,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.primary,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    color: Colors.text,
    fontWeight: '800',
  },
  map: {
    flex: 1,
    minHeight: 0,
    marginTop: 6,
  },
  userMarker: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.accent,
    borderWidth: 2,
    borderColor: Colors.accentDark,
  },
  bottomPanel: {
    backgroundColor: Colors.card,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingHorizontal: Spacing.screen,
    paddingTop: 16,
    paddingBottom: 24,
    height: 190,
  },
  selectedName: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  address: {
    color: Colors.textMuted,
    fontSize: 14,
    marginTop: 4,
  },
  detailsButton: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 12,
  },
  detailsButtonText: {
    color: Colors.text,
    fontWeight: '700',
    fontSize: 14,
  },
  routeButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  routeButton: {
    flex: 1,
    backgroundColor: Colors.text,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  routeButtonText: {
    color: Colors.card,
    fontWeight: '700',
    fontSize: 14,
  },
  centerMarker: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.text,
    borderWidth: 2,
    borderColor: Colors.textMuted,
  },
});
