import { Colors, Spacing } from '@/constants/theme';
import type { DonationCenter, PhotoSource } from '@/constants/types';
import { getCenters } from '@/data/donationCenters';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type CenterWithDistance = {
  center: DonationCenter;
  distance: number | null;
};

type RouteParams = {
  topLevel?: string;
  category?: string;
  name?: string;
  centerId?: string;
};

const getSingleParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const normalizeCategoryPath = (category: string) =>
  category.toLowerCase().split('>').map((part) => part.trim()).filter(Boolean);

const isCategoryMatch = (acceptedCategory: string, selectedCategory: string) => {
  const acceptedPath = normalizeCategoryPath(acceptedCategory);
  const selectedPath = normalizeCategoryPath(selectedCategory);

  if (!acceptedPath.length || !selectedPath.length) {
    return acceptedCategory.toLowerCase().trim() === selectedCategory.toLowerCase().trim();
  }

  if (acceptedPath.length > selectedPath.length) {
    return false;
  }

  return acceptedPath.every((segment, index) => segment === selectedPath[index]);
};

const distanceBetween = (
  first: Location.LocationObjectCoords,
  second: Location.LocationGeocodedLocation,
) => {
  const latitudeDelta = (first.latitude - second.latitude) * (Math.PI / 180);
  const longitudeDelta = (first.longitude - second.longitude) * (Math.PI / 180);
  const firstLatitude = first.latitude * (Math.PI / 180);
  const secondLatitude = second.latitude * (Math.PI / 180);
  const value =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.sin(longitudeDelta / 2) ** 2 * Math.cos(firstLatitude) * Math.cos(secondLatitude);

  return 3958.8 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
};

export default function CentersList() {
  const params = useLocalSearchParams<RouteParams>();
  const selectedTopLevel = getSingleParam(params.topLevel);
  const selectedCategory = getSingleParam(params.category);
  const centerId = getSingleParam(params.centerId);
  const listRef = useRef<FlatList<CenterWithDistance>>(null);

  const [centers, setCenters] = useState<DonationCenter[]>([]);
  const [query, setQuery] = useState('');
  const [distances, setDistances] = useState<Record<string, number | null>>({});

  useFocusEffect(
    useCallback(() => {
      getCenters().then(setCenters);
    }, []),
  );

  useEffect(() => {
    let hasFocus = true;

    const locateCenters = async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== Location.PermissionStatus.GRANTED) {
          return;
        }

        const position = await Location.getCurrentPositionAsync({});
        const entries = await Promise.all(
          centers.map(async (center) => {
            try {
              const [coordinate] = await Location.geocodeAsync(center.address);
              return [center.id, coordinate ? distanceBetween(position.coords, coordinate) : null] as const;
            } catch {
              return [center.id, null] as const;
            }
          }),
        );

        if (hasFocus) {
          setDistances(Object.fromEntries(entries));
        }
      } catch {
        if (hasFocus) {
          setDistances({});
        }
      }
    };

    if (centers.length) {
      locateCenters();
    }

    return () => {
      hasFocus = false;
    };
  }, [centers]);

  const matchesRequestedCategory = (acceptedCategory: string) => {
    const requestedPaths = [selectedCategory, selectedTopLevel].filter(Boolean) as string[];
    if (!requestedPaths.length) {
      return true;
    }

    return requestedPaths.some((requestedPath) => isCategoryMatch(acceptedCategory, requestedPath));
  };

  const visibleCenters = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    const filtered = centers
      .filter((center) => (!selectedCategory && !selectedTopLevel) || center.acceptedCategories.some(matchesRequestedCategory))
      .filter((center) => {
        if (!normalizedQuery) {
          return true;
        }

        const searchableText = `${center.name} ${center.address}`.toLowerCase();
        return searchableText.includes(normalizedQuery);
      })
      .map((center) => ({ center, distance: distances[center.id] ?? null }));

    return filtered.sort((first, second) => {
      if (normalizedQuery) {
        const firstText = `${first.center.name} ${first.center.address}`.toLowerCase();
        const secondText = `${second.center.name} ${second.center.address}`.toLowerCase();
        const firstScore = firstText.startsWith(normalizedQuery) ? 0 : firstText.indexOf(normalizedQuery) + 1;
        const secondScore = secondText.startsWith(normalizedQuery) ? 0 : secondText.indexOf(normalizedQuery) + 1;

        return firstScore - secondScore || first.center.name.localeCompare(second.center.name);
      }

      if (first.distance === null) return 1;
      if (second.distance === null) return -1;
      return first.distance - second.distance;
    });
  }, [centers, distances, query, selectedCategory, selectedTopLevel]);

  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [selectedCategory, selectedTopLevel, query]);

  const resolvePhotoSource = (photo: PhotoSource) =>
    typeof photo === 'string' ? { uri: photo } : photo;

  const renderCenter = ({ item }: { item: CenterWithDistance }) => {
    const { center, distance } = item;
    const hasMeta = Boolean(center.phone || center.hours || distance !== null);

    return (
      <View style={styles.card}>
        {center.photos?.length ? (
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={styles.photoCarousel}>
            {center.photos.map((photo, index) => (
              <Image
                key={`${center.id}-photo-${index}`}
                source={resolvePhotoSource(photo)}
                style={styles.centerPhoto}
              />
            ))}
          </ScrollView>
        ) : (
          <View style={styles.photoPlaceholder}>
            <Ionicons name="image-outline" size={22} color={Colors.textMuted} />
            <Text style={styles.photoPlaceholderText}>No photos yet</Text>
          </View>
        )}

        <View style={styles.cardBody}>
          <Text style={styles.name}>{center.name}</Text>
          <Text style={styles.address}>{center.address}</Text>
          {center.description ? <Text style={styles.description}>{center.description}</Text> : null}

          {hasMeta ? (
            <View style={styles.metaGroup}>
              {center.phone ? (
                <View style={styles.metaRow}>
                  <Ionicons name="call-outline" size={15} color={Colors.textMuted} style={styles.metaIcon} />
                  <Text style={styles.metaText}>{center.phone}</Text>
                </View>
              ) : null}
              {center.hours ? (
                <View style={styles.metaRow}>
                  <Ionicons name="time-outline" size={15} color={Colors.textMuted} style={styles.metaIcon} />
                  <Text style={styles.metaText}>{center.hours}</Text>
                </View>
              ) : null}
              {distance !== null ? (
                <View style={styles.metaRow}>
                  <Ionicons name="navigate-outline" size={15} color={Colors.textMuted} style={styles.metaIcon} />
                  <Text style={styles.metaText}>{distance.toFixed(1)} mi away</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          <Pressable
            style={({ pressed }) => [styles.mapButton, pressed && styles.mapButtonPressed]}
            onPress={() =>
              router.push({
                pathname: '/(tabs)/map',
                params: { centerId: center.id },
              })
            }
          >
            <Text style={styles.mapButtonText}>View on Map</Text>
            <Ionicons name="arrow-forward" size={15} color={Colors.primary} />
          </Pressable>
        </View>
      </View>
    );
  };

  const deepestSelectedCategory = selectedCategory
    ? selectedCategory.split('>').map((segment) => segment.trim()).filter(Boolean).at(-1) ?? selectedCategory
    : params.name;

  const emptyMessage = centerId
    ? 'Center details are unavailable.'
    : selectedTopLevel || selectedCategory
      ? 'No centers found for this item yet.'
      : 'No donation centers available yet.';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>
            {centerId ? 'Selected Center' : deepestSelectedCategory ? String(deepestSelectedCategory) : 'Find a Center'}
          </Text>
        </View>

        {centerId ? (
          <Pressable
            style={({ pressed }) => [styles.closeButton, pressed && styles.closeButtonPressed]}
            onPress={() => router.push({ pathname: '/(tabs)/map', params: { centerId } })}
          >
            <Ionicons name="close" size={18} color={Colors.text} />
          </Pressable>
        ) : null}
      </View>

      {!selectedTopLevel && !centerId ? (
        <View style={styles.controls}>
          <View style={styles.searchInputWrap}>
            <Ionicons name="search-outline" size={17} color={Colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Search by name or address"
              placeholderTextColor={Colors.textMuted}
            />
          </View>
        </View>
      ) : null}

      <View style={styles.listArea}>
        <FlatList
          ref={listRef}
          data={centerId ? visibleCenters.filter(({ center }) => center.id === centerId) : visibleCenters}
          keyExtractor={({ center }) => center.id}
          renderItem={renderCenter}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="storefront-outline" size={26} color={Colors.textMuted} />
              <Text style={styles.empty}>{emptyMessage}</Text>
            </View>
          }
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
    marginHorizontal: Spacing.screen,
    paddingTop: 21,
  },
  headerCopy: {
    flex: 1,
    marginRight: 12,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: Colors.text,
    letterSpacing: -0.3,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonPressed: {
    backgroundColor: Colors.border,
  },
  controls: {
    paddingHorizontal: Spacing.screen,
    marginBottom: 18,
  },
  searchInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: Colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    color: Colors.text,
    fontSize: 15,
  },
  listArea: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: Spacing.screen,
    paddingBottom: 24,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  photoCarousel: {
    height: 170,
  },
  centerPhoto: {
    width: 320,
    height: 170,
    resizeMode: 'cover',
  },
  photoPlaceholder: {
    height: 120,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 6,
  },
  photoPlaceholderText: {
    color: Colors.textMuted,
    fontSize: 12,
  },
  cardBody: {
    padding: 18,
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  address: {
    fontSize: 13.5,
    color: Colors.textMuted,
    marginTop: 3,
  },
  description: {
    fontSize: 13.5,
    color: Colors.text,
    marginTop: 10,
    lineHeight: 19,
  },
  metaGroup: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaIcon: {
    width: 20,
  },
  metaText: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  mapButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingVertical: 11,
    marginTop: 16,
  },
  mapButtonPressed: {
    backgroundColor: Colors.background,
  },
  mapButtonText: {
    color: Colors.primary,
    fontWeight: '600',
    fontSize: 14,
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 60,
    gap: 10,
  },
  empty: {
    textAlign: 'center',
    color: Colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
});