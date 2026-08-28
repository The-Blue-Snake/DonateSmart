import { Colors, Spacing } from '@/constants/theme';
import type { DonationCenter, PhotoSource } from '@/constants/types';
import { getCenters } from '@/data/donationCenters';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Location from 'expo-location';
import {
  router,
  useFocusEffect,
  useLocalSearchParams,
} from 'expo-router';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Dimensions,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
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

type CarouselItem =
  | {
      type: 'search';
      id: 'search';
    }
  | {
      type: 'center';
      id: string;
      center: DonationCenter;
      distance: number | null;
    };

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } =
  Dimensions.get('window');

const HORIZONTAL_PADDING = Spacing.screen;
const CARD_WIDTH = SCREEN_WIDTH - HORIZONTAL_PADDING * 2;

const COLLAPSED_CARD_HEIGHT = 125;
const CARD_GAP = 6;
const ITEM_HEIGHT = COLLAPSED_CARD_HEIGHT + CARD_GAP;

const EXPANDED_CARD_HEIGHT = Math.min(SCREEN_HEIGHT * 0.78, 660);

const getSingleParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const normalizeCategoryPath = (category: string) =>
  category
    .toLowerCase()
    .split('>')
    .map((part) => part.trim())
    .filter(Boolean);

const isCategoryMatch = (
  acceptedCategory: string,
  selectedCategory: string,
) => {
  const acceptedPath = normalizeCategoryPath(acceptedCategory);
  const selectedPath = normalizeCategoryPath(selectedCategory);

  if (!acceptedPath.length || !selectedPath.length) {
    return (
      acceptedCategory.toLowerCase().trim() ===
      selectedCategory.toLowerCase().trim()
    );
  }

  if (acceptedPath.length > selectedPath.length) {
    return false;
  }

  return acceptedPath.every(
    (segment, index) => segment === selectedPath[index],
  );
};

const distanceBetween = (
  first: Location.LocationObjectCoords,
  second: Location.LocationGeocodedLocation,
) => {
  const latitudeDelta = (first.latitude - second.latitude) * (Math.PI / 180);

  const longitudeDelta =
    (first.longitude - second.longitude) * (Math.PI / 180);

  const firstLatitude = first.latitude * (Math.PI / 180);
  const secondLatitude = second.latitude * (Math.PI / 180);

  const value =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.sin(longitudeDelta / 2) ** 2 *
      Math.cos(firstLatitude) *
      Math.cos(secondLatitude);

  return 3958.8 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
};

export default function CentersList() {
  const params = useLocalSearchParams<RouteParams>();

  const selectedTopLevel = getSingleParam(params.topLevel);
  const selectedCategory = getSingleParam(params.category);
  const centerId = getSingleParam(params.centerId);

  const listRef = useRef<Animated.FlatList<CarouselItem>>(null);
  const scrollY = useRef(new Animated.Value(0)).current;

  const [activeIndex, setActiveIndex] = useState(0);

  const [centers, setCenters] = useState<DonationCenter[]>([]);
  const [query, setQuery] = useState('');

  const [distances, setDistances] = useState<Record<string, number | null>>(
    {},
  );

  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const [expandedCenter, setExpandedCenter] =
    useState<CenterWithDistance | null>(null);

  const expansionProgress = useRef(new Animated.Value(0)).current;

  useFocusEffect(
    useCallback(() => {
      getCenters().then(setCenters);
    }, []),
  );

  useEffect(() => {
    let isMounted = true;

    const locateCenters = async () => {
      try {
        const permission =
          await Location.requestForegroundPermissionsAsync();

        if (permission.status !== Location.PermissionStatus.GRANTED) {
          return;
        }

        const position = await Location.getCurrentPositionAsync({});

        const entries = await Promise.all(
          centers.map(async (center) => {
            try {
              const [coordinate] = await Location.geocodeAsync(
                center.address,
              );

              return [
                center.id,
                coordinate
                  ? distanceBetween(position.coords, coordinate)
                  : null,
              ] as const;
            } catch {
              return [center.id, null] as const;
            }
          }),
        );

        if (isMounted) {
          setDistances(Object.fromEntries(entries));
        }
      } catch {
        if (isMounted) {
          setDistances({});
        }
      }
    };

    if (centers.length) {
      locateCenters();
    }

    return () => {
      isMounted = false;
    };
  }, [centers]);

  const matchesRequestedCategory = (acceptedCategory: string) => {
    const requestedPaths = [selectedCategory, selectedTopLevel].filter(
      Boolean,
    ) as string[];

    if (!requestedPaths.length) {
      return true;
    }

    return requestedPaths.some((requestedPath) =>
      isCategoryMatch(acceptedCategory, requestedPath),
    );
  };

  const visibleCenters = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    const filtered = centers
      .filter(
        (center) =>
          (!selectedCategory && !selectedTopLevel) ||
          center.acceptedCategories.some(matchesRequestedCategory),
      )
      .filter((center) => {
        if (!normalizedQuery) {
          return true;
        }

        const searchableText =
          `${center.name} ${center.address}`.toLowerCase();

        return searchableText.includes(normalizedQuery);
      })
      .map((center) => ({
        center,
        distance: distances[center.id] ?? null,
      }));

    return filtered.sort((first, second) => {
      if (normalizedQuery) {
        const firstText =
          `${first.center.name} ${first.center.address}`.toLowerCase();

        const secondText =
          `${second.center.name} ${second.center.address}`.toLowerCase();

        const firstScore = firstText.startsWith(normalizedQuery)
          ? 0
          : firstText.indexOf(normalizedQuery) + 1;

        const secondScore = secondText.startsWith(normalizedQuery)
          ? 0
          : secondText.indexOf(normalizedQuery) + 1;

        return (
          firstScore - secondScore ||
          first.center.name.localeCompare(second.center.name)
        );
      }

      if (first.distance === null) {
        return 1;
      }

      if (second.distance === null) {
        return -1;
      }

      return first.distance - second.distance;
    });
  }, [
    centers,
    distances,
    query,
    selectedCategory,
    selectedTopLevel,
  ]);

  const carouselItems = useMemo<CarouselItem[]>(() => {
    const centerItems = visibleCenters.map(({ center, distance }) => ({
      type: 'center' as const,
      id: center.id,
      center,
      distance,
    }));

    if (centerId) {
      return centerItems.filter((item) => item.id === centerId);
    }

    return [{ type: 'search' as const, id: 'search' }, ...centerItems];
  }, [centerId, visibleCenters]);

  useEffect(() => {
    setActiveIndex(0);
    setExpandedIndex(null);
    setExpandedCenter(null);
    expansionProgress.setValue(0);

    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({
        offset: 0,
        animated: false,
      });
    });
  }, [
    query,
    selectedCategory,
    selectedTopLevel,
    centerId,
    expansionProgress,
  ]);

  const resolvePhotoSource = (photo: PhotoSource) => {
    if (typeof photo === 'string') {
      return {
        uri: photo,
        cacheKey: photo,
      };
    }

    return photo;
  };

  const getPhotoUri = (photo: PhotoSource | undefined) => {
    if (!photo || typeof photo !== 'string') {
      return null;
    }

    return photo;
  };

  useEffect(() => {
    const activeItem = carouselItems[activeIndex];

    if (activeItem?.type !== 'center') {
      return;
    }

    const photo = activeItem.center.photos?.[0];
    const imageUri = getPhotoUri(photo);

    if (!imageUri) {
      return;
    }

    Image.prefetch(imageUri, 'memory-disk').catch(() => {
      // An unavailable image should not affect the rest of the screen.
    });
  }, [activeIndex, carouselItems]);

  const getItemLayout = (
    _data: ArrayLike<CarouselItem> | null | undefined,
    index: number,
  ) => ({
    length: ITEM_HEIGHT,
    offset: ITEM_HEIGHT * index,
    index,
  });

  const centerItemInViewport = (index: number, animated = true) => {
    listRef.current?.scrollToIndex({
      index,
      animated,
      viewPosition: 0.5,
    });
  };

  const openCenter = (item: CarouselItem, index: number) => {
    if (item.type !== 'center') {
      return;
    }

    if (index !== activeIndex) {
      centerItemInViewport(index);
      return;
    }

    const photo = item.center.photos?.[0];
    const imageUri = getPhotoUri(photo);

    if (imageUri) {
      Image.prefetch(imageUri, 'memory-disk').catch(() => {
        // The component still renders normally if prefetch fails.
      });
    }

    expansionProgress.stopAnimation();
    expansionProgress.setValue(0);

    setExpandedCenter({
      center: item.center,
      distance: item.distance,
    });

    setExpandedIndex(index);

    requestAnimationFrame(() => {
      Animated.timing(expansionProgress, {
        toValue: 1,
        duration: 300,
        useNativeDriver: false,
      }).start();
    });
  };

  const closeExpandedCenter = () => {
    expansionProgress.stopAnimation();

    Animated.timing(expansionProgress, {
      toValue: 0,
      duration: 250,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) {
        setExpandedIndex(null);
        setExpandedCenter(null);
      }
    });
  };

  const openMap = (center: DonationCenter) => {
    closeExpandedCenter();

    router.push({
      pathname: '/(tabs)/map',
      params: { centerId: center.id },
    });
  };

  const renderSearchCard = () => (
    <View style={styles.searchCard}>
      <View style={styles.searchInputShell}>
        <Ionicons
          name="search-outline"
          size={20}
          color={Colors.textMuted}
        />

        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search centers or addresses"
          placeholderTextColor={Colors.textMuted}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="search"
        />

        {query.length > 0 ? (
          <Pressable
            style={({ pressed }) => [
              styles.clearSearchButton,
              pressed && styles.clearSearchButtonPressed,
            ]}
            onPress={() => setQuery('')}
            hitSlop={10}
          >
            <Ionicons
              name="close-circle"
              size={20}
              color={Colors.textMuted}
            />
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  const renderCollapsedCenterCard = (
    center: DonationCenter,
    distance: number | null,
    focusOpacity: Animated.AnimatedInterpolation<string | number>,
  ) => {
    const photo = center.photos?.[0];

    return (
      <View style={styles.collapsedCenterCard}>
        {photo ? (
          <Image
            source={resolvePhotoSource(photo)}
            style={styles.collapsedPhoto}
            contentFit="cover"
            cachePolicy="memory-disk"
            priority="low"
            transition={150}
          />
        ) : (
          <View style={styles.photoFallback}>
            <Ionicons
              name="storefront-outline"
              size={27}
              color={Colors.primary}
            />
          </View>
        )}

        <View style={styles.photoOverlay} />

        <View style={styles.cardInfo}>
          <View style={styles.titleRow}>
            <Text style={styles.centerName} numberOfLines={1}>
              {center.name}
            </Text>

            {distance !== null ? (
              <View style={styles.distancePill}>
                <Ionicons
                  name="navigate"
                  size={11}
                  color="#FFFFFF"
                />

                <Text style={styles.distanceText}>
                  {distance.toFixed(1)} mi
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.addressRow}>
            <Ionicons
              name="location-outline"
              size={14}
              color="rgba(255,255,255,0.88)"
            />

            <Text style={styles.addressText} numberOfLines={1}>
              {center.address}
            </Text>
          </View>
        </View>

        <Animated.View
          pointerEvents="none"
          style={[
            styles.expandIndicator,
            {
              opacity: focusOpacity,
            },
          ]}
        >
          <Ionicons
            name="chevron-up"
            size={15}
            color="rgba(255,255,255,0.96)"
          />

          <Ionicons
            name="chevron-down"
            size={15}
            color="rgba(255,255,255,0.96)"
          />
        </Animated.View>
      </View>
    );
  };

  const renderExpandedContent = (
    center: DonationCenter,
    distance: number | null,
  ) => {
    const photo = center.photos?.[0];

    return (
      <View style={styles.expandedCard}>
        <View style={styles.expandedImageArea}>
          {photo ? (
            <Image
              source={resolvePhotoSource(photo)}
              style={styles.expandedPhoto}
              contentFit="cover"
              cachePolicy="memory-disk"
              priority="high"
              transition={150}
            />
          ) : (
            <View style={styles.expandedFallback}>
              <Ionicons
                name="storefront-outline"
                size={38}
                color={Colors.primary}
              />
            </View>
          )}

          <View style={styles.expandedImageOverlay} />

          <Pressable
            style={({ pressed }) => [
              styles.closeExpandedButton,
              pressed && styles.closeExpandedButtonPressed,
            ]}
            onPress={closeExpandedCenter}
            hitSlop={8}
          >
            <Ionicons name="close" size={20} color="#FFFFFF" />
          </Pressable>

          {distance !== null ? (
            <View style={styles.expandedDistancePill}>
              <Ionicons
                name="navigate"
                size={13}
                color="#FFFFFF"
              />

              <Text style={styles.expandedDistanceText}>
                {distance.toFixed(1)} mi away
              </Text>
            </View>
          ) : null}

          <View style={styles.expandedImageInfo}>
            <Text style={styles.expandedName} numberOfLines={2}>
              {center.name}
            </Text>

            <View style={styles.expandedAddressRow}>
              <Ionicons
                name="location-outline"
                size={16}
                color="rgba(255,255,255,0.9)"
              />

              <Text style={styles.expandedAddress} numberOfLines={2}>
                {center.address}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.expandedContent}>
          {center.description ? (
            <Text style={styles.expandedDescription}>
              {center.description}
            </Text>
          ) : (
            <Text style={styles.expandedDescriptionMuted}>
              See this location on the map for directions and current donation
              details.
            </Text>
          )}

          {center.hours ? (
            <View style={styles.expandedMetaRow}>
              <View style={styles.metaIconCircle}>
                <Ionicons
                  name="time-outline"
                  size={18}
                  color={Colors.primary}
                />
              </View>

              <View style={styles.metaCopy}>
                <Text style={styles.metaLabel}>Hours</Text>
                <Text style={styles.metaValue}>{center.hours}</Text>
              </View>
            </View>
          ) : null}

          {center.phone ? (
            <View style={styles.expandedMetaRow}>
              <View style={styles.metaIconCircle}>
                <Ionicons
                  name="call-outline"
                  size={18}
                  color={Colors.primary}
                />
              </View>

              <View style={styles.metaCopy}>
                <Text style={styles.metaLabel}>Phone</Text>
                <Text style={styles.metaValue}>{center.phone}</Text>
              </View>
            </View>
          ) : null}

          <Pressable
            style={({ pressed }) => [
              styles.mapButton,
              pressed && styles.mapButtonPressed,
            ]}
            onPress={() => openMap(center)}
          >
            <Ionicons
              name="map-outline"
              size={19}
              color="#FFFFFF"
            />

            <Text style={styles.mapButtonText}>View on map</Text>

            <Ionicons
              name="arrow-forward"
              size={18}
              color="#FFFFFF"
              style={styles.mapButtonArrow}
            />
          </Pressable>
        </View>
      </View>
    );
  };

  const renderItem = ({
    item,
    index,
  }: {
    item: CarouselItem;
    index: number;
  }) => {
    const inputRange = [
      (index - 2) * ITEM_HEIGHT,
      (index - 1) * ITEM_HEIGHT,
      index * ITEM_HEIGHT,
      (index + 1) * ITEM_HEIGHT,
      (index + 2) * ITEM_HEIGHT,
    ];

    const focusOpacity = scrollY.interpolate({
      inputRange: [
        (index - 1) * ITEM_HEIGHT,
        index * ITEM_HEIGHT - ITEM_HEIGHT * 0.42,
        index * ITEM_HEIGHT - ITEM_HEIGHT * 0.14,
        index * ITEM_HEIGHT + ITEM_HEIGHT * 0.14,
        index * ITEM_HEIGHT + ITEM_HEIGHT * 0.42,
        (index + 1) * ITEM_HEIGHT,
      ],
      outputRange: [0, 0, 1, 1, 0, 0],
      extrapolate: 'clamp',
    });

    const scale = scrollY.interpolate({
      inputRange,
      outputRange: [0.87, 0.94, 1, 0.94, 0.87],
      extrapolate: 'clamp',
    });

    const normalOpacity = scrollY.interpolate({
      inputRange,
      outputRange: [0.58, 0.8, 1, 0.8, 0.58],
      extrapolate: 'clamp',
    });

    const isExpanded = expandedIndex === index;

    const otherItemsFade = expansionProgress.interpolate({
      inputRange: [0, 1],
      outputRange: [1, 0],
    });

    const opacity =
      expandedIndex === null
        ? normalOpacity
        : isExpanded
          ? 1
          : Animated.multiply(normalOpacity, otherItemsFade);

    const translateY = scrollY.interpolate({
      inputRange,
      outputRange: [7, 3, 0, -3, -7],
      extrapolate: 'clamp',
    });

    const animatedHeight = expansionProgress.interpolate({
      inputRange: [0, 1],
      outputRange: [COLLAPSED_CARD_HEIGHT, EXPANDED_CARD_HEIGHT],
    });

    const animatedRadius = expansionProgress.interpolate({
      inputRange: [0, 1],
      outputRange: [18, 24],
    });

    const collapsedOpacity = expansionProgress.interpolate({
      inputRange: [0, 0.25, 1],
      outputRange: [1, 0, 0],
    });

    const expandedContentOpacity = expansionProgress.interpolate({
      inputRange: [0, 0.25, 1],
      outputRange: [0, 0, 1],
    });

    const cardScale = isExpanded ? 1 : scale;

    return (
      <Animated.View
        style={[
          styles.carouselItem,
          {
            opacity,
            zIndex: isExpanded ? 20 : 1,
            transform: [{ translateY }, { scale: cardScale }],
          },
        ]}
      >
        {item.type === 'search' ? (
          renderSearchCard()
        ) : (
          <Pressable
            style={styles.cardTapArea}
            onPress={() => openCenter(item, index)}
            disabled={expandedIndex !== null}
          >
            <Animated.View
              style={[
                styles.animatedCenterCard,
                {
                  height: isExpanded
                    ? animatedHeight
                    : COLLAPSED_CARD_HEIGHT,
                  borderRadius: isExpanded ? animatedRadius : 18,
                },
              ]}
            >
              {isExpanded ? (
                <>
                  <Animated.View
                    pointerEvents="none"
                    style={[
                      StyleSheet.absoluteFill,
                      {
                        opacity: collapsedOpacity,
                      },
                    ]}
                  >
                    {renderCollapsedCenterCard(
                      item.center,
                      item.distance,
                      focusOpacity,
                    )}
                  </Animated.View>

                  <Animated.View
                    style={[
                      StyleSheet.absoluteFill,
                      {
                        opacity: expandedContentOpacity,
                      },
                    ]}
                  >
                    {renderExpandedContent(
                      item.center,
                      item.distance,
                    )}
                  </Animated.View>
                </>
              ) : (
                renderCollapsedCenterCard(
                  item.center,
                  item.distance,
                  focusOpacity,
                )
              )}
            </Animated.View>
          </Pressable>
        )}
      </Animated.View>
    );
  };

  const emptyMessage = centerId
    ? 'Center details are unavailable.'
    : selectedTopLevel || selectedCategory
      ? 'No centers match this donation category yet.'
      : query.trim()
        ? 'No centers match that search.'
        : 'No donation centers are available yet.';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.listArea}>
        <Animated.FlatList
          ref={listRef}
          data={carouselItems}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          getItemLayout={getItemLayout}
          initialNumToRender={4}
          maxToRenderPerBatch={4}
          updateCellsBatchingPeriod={50}
          windowSize={5}
          removeClippedSubviews={Platform.OS === 'android'}
          showsVerticalScrollIndicator={false}
          snapToInterval={ITEM_HEIGHT}
          snapToAlignment="start"
          decelerationRate="fast"
          bounces={false}
          overScrollMode="never"
          contentContainerStyle={styles.carouselContent}
          onMomentumScrollEnd={(event) => {
            const offsetY = event.nativeEvent.contentOffset.y;

            setActiveIndex(Math.round(offsetY / ITEM_HEIGHT));
          }}
          onScroll={Animated.event(
            [
              {
                nativeEvent: {
                  contentOffset: {
                    y: scrollY,
                  },
                },
              },
            ],
            {
              useNativeDriver: false,
              listener: (event: any) => {
                if (expandedIndex !== null) {
                  return;
                }

                const offsetY = event.nativeEvent.contentOffset.y;

                const nextIndex = Math.round(offsetY / ITEM_HEIGHT);

                if (nextIndex !== activeIndex) {
                  setActiveIndex(nextIndex);
                }
              },
            },
          )}
          scrollEventThrottle={16}
          scrollEnabled={expandedIndex === null}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons
                name="storefront-outline"
                size={28}
                color={Colors.textMuted}
              />

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

  listArea: {
    flex: 1,
    minHeight: 0,
  },

  carouselContent: {
    paddingTop: Math.max(
      18,
      (SCREEN_HEIGHT - ITEM_HEIGHT) / 2 - 62,
    ),
    paddingBottom: Math.max(
      18,
      (SCREEN_HEIGHT - ITEM_HEIGHT) / 2 - 42,
    ),
  },

  carouselItem: {
    width: CARD_WIDTH,
    height: ITEM_HEIGHT,
    alignSelf: 'center',
    justifyContent: 'center',
  },

  cardTapArea: {
    flex: 1,
    justifyContent: 'center',
  },

  animatedCenterCard: {
    width: '100%',
    overflow: 'hidden',
    backgroundColor: Colors.card,

    shadowColor: '#000000',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: {
      width: 0,
      height: 6,
    },

    elevation: 5,
  },

  searchCard: {
    height: COLLAPSED_CARD_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 18,
    backgroundColor: Colors.card,

    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: {
      width: 0,
      height: 5,
    },

    elevation: 4,
  },

  searchInputShell: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 14,
    paddingRight: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 13,
    backgroundColor: Colors.background,
  },

  searchInput: {
    flex: 1,
    paddingVertical: Platform.select({
      ios: 12,
      android: 8,
      default: 10,
    }),
    color: Colors.text,
    fontSize: 15,
  },

  clearSearchButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },

  clearSearchButtonPressed: {
    opacity: 0.65,
  },

  collapsedCenterCard: {
    width: '100%',
    height: COLLAPSED_CARD_HEIGHT,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 18,
    backgroundColor: Colors.card,
  },

  collapsedPhoto: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },

  photoFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.card,
  },

  photoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
    opacity: 0.36,
  },

  cardInfo: {
    paddingHorizontal: 15,
    paddingTop: 20,
    paddingBottom: 13,
  },

  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  centerName: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.35,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowRadius: 5,
    textShadowOffset: {
      width: 0,
      height: 1,
    },
  },

  distancePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },

  distanceText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },

  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 5,
  },

  addressText: {
    flex: 1,
    color: 'rgba(255,255,255,0.92)',
    fontSize: 12.5,
    fontWeight: '500',
  },

  expandIndicator: {
    position: 'absolute',
    top: 8,
    right: 9,
    width: 30,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.30)',
  },

  emptyState: {
    alignItems: 'center',
    width: CARD_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: 28,
  },

  empty: {
    color: Colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 10,
  },

  expandedCard: {
    flex: 1,
    width: '100%',
    overflow: 'hidden',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
  },

  expandedImageArea: {
    height: 238,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    backgroundColor: Colors.background,
  },

  expandedPhoto: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },

  expandedFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },

  expandedImageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
    opacity: 0.31,
  },

  closeExpandedButton: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.42)',
  },

  closeExpandedButtonPressed: {
    backgroundColor: 'rgba(0,0,0,0.62)',
    transform: [{ scale: 0.94 }],
  },

  expandedDistancePill: {
    position: 'absolute',
    top: 16,
    left: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.47)',
  },

  expandedDistanceText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },

  expandedImageInfo: {
    position: 'absolute',
    right: 18,
    bottom: 16,
    left: 18,
  },

  expandedName: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '800',
    lineHeight: 31,
    letterSpacing: -0.7,
    textShadowColor: 'rgba(0,0,0,0.42)',
    textShadowRadius: 6,
    textShadowOffset: {
      width: 0,
      height: 1,
    },
  },

  expandedAddressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 6,
  },

  expandedAddress: {
    flex: 1,
    color: 'rgba(255,255,255,0.92)',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },

  expandedContent: {
    flex: 1,
    paddingHorizontal: 19,
    paddingTop: 18,
    paddingBottom: 18,
  },

  expandedDescription: {
    color: Colors.text,
    fontSize: 14,
    lineHeight: 19.5,
  },

  expandedDescriptionMuted: {
    color: Colors.textMuted,
    fontSize: 14,
    lineHeight: 19.5,
  },

  expandedMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
  },

  metaIconCircle: {
    width: 37,
    height: 37,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },

  metaCopy: {
    flex: 1,
    marginLeft: 11,
  },

  metaLabel: {
    color: Colors.textMuted,
    fontSize: 11.5,
    fontWeight: '600',
  },

  metaValue: {
    color: Colors.text,
    fontSize: 13.5,
    lineHeight: 19,
    marginTop: 1,
  },

  mapButton: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 17,
    marginTop: 21,
    borderRadius: 14,
    backgroundColor: Colors.primary,
  },

  mapButtonPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.985 }],
  },

  mapButtonText: {
    flex: 1,
    marginLeft: 9,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },

  mapButtonArrow: {
    marginLeft: 'auto',
  },
});