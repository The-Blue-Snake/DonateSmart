import { Colors, Spacing } from '@/constants/theme';
import type { DonationCenter, PhotoSource } from '@/constants/types';
import { getCenters } from '@/data/donationCenters';
import * as Location from 'expo-location';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

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
  const insets = useSafeAreaInsets();
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
           <Text style={styles.photoPlaceholderText}>No photos yet</Text>
         </View>
       )}

       <Text style={styles.name}>{center.name}</Text>
       <Text style={styles.address}>{center.address}</Text>
       {center.description ? <Text style={styles.description}>{center.description}</Text> : null}
       {center.phone ? <Text style={styles.detail}>Phone: {center.phone}</Text> : null}
       {center.hours ? <Text style={styles.detail}>Hours: {center.hours}</Text> : null}
       {distance !== null ? <Text style={styles.distance}>{distance.toFixed(1)} mi away</Text> : null}

       <Pressable
         style={styles.mapButton}
         onPress={() =>
           router.push({
             pathname: '/(tabs)/map',
             params: { centerId: center.id },
           })
         }
       >
         <Text style={styles.mapButtonText}>View on Map</Text>
       </Pressable>
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
    <SafeAreaView style={[styles.container, { paddingBottom: insets.bottom + 14 }]}>
     <View style={styles.headerRow}>
       <View style={styles.headerCopy}>
         <Text style={styles.title}>Donation Centers</Text>
         {deepestSelectedCategory ? <Text style={styles.resultLabel}>Results for {deepestSelectedCategory}</Text> : null}
         {centerId ? <Text style={styles.resultLabel}>Selected donation center</Text> : null}
       </View>

       {centerId ? (
         <Pressable
           style={styles.closeButton}
           onPress={() => router.push({ pathname: '/(tabs)/map', params: { centerId } })}
         >
           <Text style={styles.closeButtonText}>X</Text>
         </Pressable>
       ) : null}
     </View>

     {!selectedTopLevel && !centerId ? (
       <View style={styles.controls}>
         <TextInput
           style={styles.searchInput}
           value={query}
           onChangeText={setQuery}
           placeholder="Search by name or address"
           placeholderTextColor={Colors.textMuted}
         />
       </View>
     ) : null}

     <View style={styles.listArea}>
       <FlatList
         ref={listRef}
         data={centerId ? visibleCenters.filter(({ center }) => center.id === centerId) : visibleCenters}
         keyExtractor={({ center }) => center.id}
         renderItem={renderCenter}
         contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 32 }]}
         ListEmptyComponent={<Text style={styles.empty}>{emptyMessage}</Text>}
       />
     </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    marginHorizontal: Spacing.screen,
    paddingTop: 14,
  },
  headerCopy: {
    flex: 1,
    marginRight: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.primary,
  },
  resultLabel: {
    fontSize: 14,
    color: Colors.textMuted,
    marginTop: 4,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  closeButtonText: {
    color: Colors.text,
    fontWeight: '800',
  },
  controls: {
    paddingHorizontal: Spacing.screen,
    marginBottom: 20,
  },
  searchInput: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: Colors.text,
    fontSize: 15,
  },
  listArea: {
    flex: 1,
    paddingBottom: 12,
  },
  listContent: {
    paddingHorizontal: Spacing.screen,
    paddingBottom: 24,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  photoCarousel: {
    marginHorizontal: -18,
    marginTop: -18,
    marginBottom: 16,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
  },
  centerPhoto: {
    width: 300,
    height: 200,
    resizeMode: 'cover',
  },
  photoPlaceholder: {
    height: 180,
    marginHorizontal: -18,
    marginTop: -18,
    marginBottom: 16,
    backgroundColor: Colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
  },
  photoPlaceholderText: {
    color: Colors.textMuted,
    fontSize: 13,
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  address: {
    fontSize: 14,
    color: Colors.textMuted,
    marginTop: 2,
  },
  description: {
    fontSize: 13,
    color: Colors.primary,
    marginTop: 4,
    lineHeight: 16,
  },
  detail: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 4,
  },
  distance: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 6,
  },
  mapButton: {
    backgroundColor: Colors.text,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 14,
  },
  mapButtonText: {
    color: Colors.card,
    fontWeight: '700',
    fontSize: 14,
  },
  empty: {
    textAlign: 'center',
    color: Colors.textMuted,
    marginTop: 40,
    fontSize: 15,
    lineHeight: 22,
  },
});