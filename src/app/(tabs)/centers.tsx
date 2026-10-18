import { useAppTabNavigation } from '@/components/app-tab-navigation';
import { Border, Colors, Spacing } from '@/constants/theme';
import type { DonationCenter, PhotoSource } from '@/constants/types';
import { getCenters, isCategoryMatch } from '@/data/donationCenters';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { isLikelyOpenNow } from '@/lib/hours';
import * as Location from 'expo-location';
import {
  useFocusEffect,
  useLocalSearchParams
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
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type RouteParams = {
  topLevel?: string;
  category?: string;
  name?: string;
  centerId?: string;
};

type CentersListProps = {
  tabParams?: Partial<RouteParams>;
};

type CarouselItem = {
  type: 'center';
  id: string;
  center: DonationCenter;
  distance: number | null;
};

type SortMode = 'nearby' | 'alphabetical';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } =
  Dimensions.get('window');

const HORIZONTAL_PADDING = Spacing.screen;
const CARD_WIDTH = SCREEN_WIDTH - HORIZONTAL_PADDING * 2;

const CENTER_CARD_BORDER_WIDTH = 1.5;
const EXPANDED_CONTENT_WIDTH =
  CARD_WIDTH - CENTER_CARD_BORDER_WIDTH * 2;

const COLLAPSED_CARD_HEIGHT = 125;
const CARD_GAP = 6;
const ITEM_HEIGHT = COLLAPSED_CARD_HEIGHT + CARD_GAP;

const EXPANDED_CARD_HEIGHT = Math.min(
  SCREEN_HEIGHT * 0.78,
  660,
);

// The search header takes up the same vertical space as two regular cards,
// so the first real center card can sit exactly where a focused card would.
const SEARCH_CARD_HEIGHT = ITEM_HEIGHT * 2 + 8 - CARD_GAP;

// A bit more breathing room between the header and the first card than the
// standard gap used between regular cards.
const HEADER_TO_LIST_GAP = CARD_GAP + 5;

// Same "center the focused card on screen" formula the carousel already used.
const FOCUS_OFFSET = Math.max(
  18,
  (SCREEN_HEIGHT - ITEM_HEIGHT) / 2 - 62,
);

// Leading padding above the header, chosen so header + gap + first card
// lines up with FOCUS_OFFSET.
const HEADER_LEADING_SPACE = Math.max(
  0,
  FOCUS_OFFSET -
    SEARCH_CARD_HEIGHT -
    HEADER_TO_LIST_GAP,
);

const getSingleParam = (
  value: string | string[] | undefined,
) => (Array.isArray(value) ? value[0] : value);

const distanceBetween = (
  first: Location.LocationObjectCoords,
  second: Pick<DonationCenter, 'latitude' | 'longitude'>,
) => {
  const latitudeDelta =
    (first.latitude - second.latitude) *
    (Math.PI / 180);

  const longitudeDelta =
    (first.longitude - second.longitude) *
    (Math.PI / 180);

  const firstLatitude =
    first.latitude * (Math.PI / 180);

  const secondLatitude =
    second.latitude * (Math.PI / 180);

  const value =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.sin(longitudeDelta / 2) ** 2 *
      Math.cos(firstLatitude) *
      Math.cos(secondLatitude);

  return (
    3958.8 *
    2 *
    Math.atan2(
      Math.sqrt(value),
      Math.sqrt(1 - value),
    )
  );
};

export default function CentersList({
  tabParams,
}: CentersListProps = {}) {
  const params =
    useLocalSearchParams<RouteParams>();

const { navigateToTab, resetTabParams } = useAppTabNavigation();

  const mergedParams = {
    ...params,
    ...tabParams,
  };

  const selectedTopLevel =
    getSingleParam(mergedParams.topLevel);

  const selectedCategory =
    getSingleParam(mergedParams.category);

  const selectedResultName =
    getSingleParam(mergedParams.name);

  const centerId =
    getSingleParam(mergedParams.centerId);

  const listRef =
    useRef<Animated.FlatList<CarouselItem>>(null);

  const [scrollY] =
    useState(() => new Animated.Value(0));

  const [activeIndex, setActiveIndex] =
    useState(0);

  const [centers, setCenters] =
    useState<DonationCenter[]>([]);

  const [query, setQuery] = useState('');

  const {
    savedCenterIds: savedIds,
    toggleSavedCenter,
  } = useAppTabNavigation();

  const [showSavedOnly, setShowSavedOnly] =
    useState(false);

  const [showOpenOnly, setShowOpenOnly] =
    useState(false);

  const [sortMode, setSortMode] =
    useState<SortMode>('nearby');

  const [distances, setDistances] =
    useState<Record<string, number | null>>(
      {},
    );

  const [expandedIndex, setExpandedIndex] =
    useState<number | null>(null);

  const [expandedCenterId, setExpandedCenterId] =
    useState<string | null>(null);

  const [activePhotoIndex, setActivePhotoIndex] =
    useState(0);

  const [isPhotoViewerOpen, setIsPhotoViewerOpen] =
    useState(false);

  const expandedPhotoScrollRef =
    useRef<ScrollView | null>(null);
  const photoViewerScrollRef =
    useRef<ScrollView | null>(null);

  const [expansionProgress] =
    useState(() => new Animated.Value(0));

  const otherItemsFade =
    expansionProgress.interpolate({
      inputRange: [0, 1],
      outputRange: [1, 0],
    });

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

        if (
          permission.status !==
          Location.PermissionStatus.GRANTED
        ) {
          return;
        }

        const position =
          await Location.getCurrentPositionAsync(
            {},
          );

        const entries = centers.map((center) => [
          center.id,
          Number.isFinite(center.latitude) &&
          Number.isFinite(center.longitude)
            ? distanceBetween(
                position.coords,
                center,
              )
            : null,
        ] as const);

        if (isMounted) {
          setDistances(
            Object.fromEntries(entries),
          );
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

  const matchesRequestedCategory = useCallback(
    (acceptedCategory: string) => {
      const requestedCategory =
        selectedCategory || selectedTopLevel;

      if (!requestedCategory) {
        return true;
      }

      return isCategoryMatch(
        acceptedCategory,
        requestedCategory,
      );
    },
    [selectedCategory, selectedTopLevel],
  );

  const visibleCenters = useMemo(() => {
    const normalizedQuery =
      query.trim().toLowerCase();

    const filtered = centers
      .filter(
        (center) =>
          (!selectedCategory &&
            !selectedTopLevel) ||
          center.acceptedCategories.some(
            matchesRequestedCategory,
          ),
      )
      .filter(
        (center) =>
          !showSavedOnly ||
          savedIds.has(center.id),
      )
      .filter(
        (center) =>
          !showOpenOnly ||
          isLikelyOpenNow(center.hours),
      )
      .filter((center) => {
        if (!normalizedQuery) {
          return true;
        }

        const searchableText =
          `${center.name} ${center.address}`.toLowerCase();

        return searchableText.includes(
          normalizedQuery,
        );
      })
      .map((center) => ({
        center,
        distance:
          distances[center.id] ?? null,
      }));

    return filtered.sort((first, second) => {
      if (normalizedQuery) {
        const firstText =
          `${first.center.name} ${first.center.address}`.toLowerCase();

        const secondText =
          `${second.center.name} ${second.center.address}`.toLowerCase();

        const firstScore =
          firstText.startsWith(normalizedQuery)
            ? 0
            : firstText.indexOf(normalizedQuery) + 1;

        const secondScore =
          secondText.startsWith(normalizedQuery)
            ? 0
            : secondText.indexOf(normalizedQuery) + 1;

        return (
          firstScore - secondScore ||
          first.center.name.localeCompare(
            second.center.name,
          )
        );
      }

      if (sortMode === 'alphabetical') {
        return first.center.name.localeCompare(
          second.center.name,
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
    showSavedOnly,
    showOpenOnly,
    savedIds,
    sortMode,
    matchesRequestedCategory,
  ]);

  const carouselItems =
    useMemo<CarouselItem[]>(
      () =>
        visibleCenters.map(
          ({ center, distance }) => ({
            type: 'center',
            id: center.id,
            center,
            distance,
          }),
        ),
      [visibleCenters],
    );

  useEffect(() => {
    if (
      !centerId ||
      !carouselItems.length
    ) {
      return;
    }

    const centerIndex =
      carouselItems.findIndex(
        (item) => item.id === centerId,
      );

    if (centerIndex === -1) {
      return;
    }

    expansionProgress.stopAnimation();
    expansionProgress.setValue(1);

    const frame = requestAnimationFrame(() => {
      setActiveIndex(centerIndex);
      setExpandedIndex(centerIndex);
      setExpandedCenterId(centerId);

      if (centerIndex === 0) {
        listRef.current?.scrollToOffset({
          offset: 0,
          animated: false,
        });
      } else {
        listRef.current?.scrollToIndex({
          index: centerIndex,
          animated: false,
          viewPosition: 0.5,
        });
      }
    });

    return () => cancelAnimationFrame(frame);
  }, [
    centerId,
    carouselItems,
    expansionProgress,
  ]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setActiveIndex(0);

      if (!centerId) {
        setExpandedIndex(null);
        setExpandedCenterId(null);
        expansionProgress.setValue(0);
      }

      listRef.current?.scrollToOffset({
        offset: 0,
        animated: false,
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [
    query,
    selectedCategory,
    selectedTopLevel,
    showSavedOnly,
    showOpenOnly,
    sortMode,
    centerId,
    expansionProgress,
  ]);

  useEffect(() => {
    if (
      !showSavedOnly ||
      !expandedCenterId ||
      savedIds.has(expandedCenterId)
    ) {
      return;
    }

    expansionProgress.stopAnimation();
    expansionProgress.setValue(0);

    const frame = requestAnimationFrame(() => {
      setExpandedIndex(null);
      setExpandedCenterId(null);
      setActiveIndex(0);
      listRef.current?.scrollToOffset({
        offset: 0,
        animated: false,
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [
    expandedCenterId,
    expansionProgress,
    savedIds,
    showSavedOnly,
  ]);

  const resolvePhotoSource = (
    photo: PhotoSource,
  ) => {
    if (typeof photo === 'string') {
      return {
        uri: photo,
        cacheKey: photo,
      };
    }

    return photo;
  };

  const getPhotoUri = (
    photo: PhotoSource | undefined,
  ) => {
    if (!photo || typeof photo !== 'string') {
      return null;
    }

    return photo;
  };

  useEffect(() => {
    const activeItem =
      carouselItems[activeIndex];

    if (!activeItem) {
      return;
    }

    const photo =
      activeItem.center.photos?.[0];

    const imageUri = getPhotoUri(photo);

    if (!imageUri) {
      return;
    }

    Image.prefetch(
      imageUri,
      'memory-disk',
    ).catch(() => {});
  }, [activeIndex, carouselItems]);

  const getItemLayout = (
    _data:
      | ArrayLike<CarouselItem>
      | null
      | undefined,
    index: number,
  ) => ({
    length: ITEM_HEIGHT,
    offset:
      HEADER_LEADING_SPACE +
      SEARCH_CARD_HEIGHT +
      HEADER_TO_LIST_GAP +
      ITEM_HEIGHT * index,
    index,
  });

  const centerItemInViewport = (
    index: number,
    animated = true,
  ) => {
    if (index === 0) {
      listRef.current?.scrollToOffset({
        offset: 0,
        animated,
      });
      return;
    }

    listRef.current?.scrollToIndex({
      index,
      animated,
      viewPosition: 0.5,
    });
  };

  const openCenter = (
    item: CarouselItem,
    index: number,
  ) => {
    if (index !== activeIndex) {
      centerItemInViewport(index);
      return;
    }

    if (index === 0) {
      listRef.current?.scrollToOffset({
        offset: 0,
        animated: false,
      });
    }

    const photo =
      item.center.photos?.[0];

    const imageUri = getPhotoUri(photo);

    if (imageUri) {
      Image.prefetch(
        imageUri,
        'memory-disk',
      ).catch(() => {});
    }

    expansionProgress.stopAnimation();
    expansionProgress.setValue(0);

    setExpandedIndex(index);
    setExpandedCenterId(item.id);
    setActivePhotoIndex(0);

    requestAnimationFrame(() => {
      Animated.timing(
        expansionProgress,
        {
          toValue: 1,
          duration: 300,
          useNativeDriver: false,
        },
      ).start();
    });
  };

  const closeExpandedCenter = () => {
    expansionProgress.stopAnimation();

    Animated.timing(
      expansionProgress,
      {
        toValue: 0,
        duration: 250,
        useNativeDriver: false,
      },
    ).start(({ finished }) => {
      if (finished) {
        setExpandedIndex(null);
        setExpandedCenterId(null);
      }
    });
  };

  const openPhotoViewer = () => {
    setIsPhotoViewerOpen(true);
  };

  const closePhotoViewer = () => {
    setIsPhotoViewerOpen(false);
  };

  const showPhotoInViewer = (index: number) => {
    setActivePhotoIndex(index);
    expandedPhotoScrollRef.current?.scrollTo({
      x: index * EXPANDED_CONTENT_WIDTH,
      animated: false,
    });
  };

  const toggleSavedCenterFromExpanded = (id: string) => {
    if (showSavedOnly && savedIds.has(id)) {
      expansionProgress.stopAnimation();
      expansionProgress.setValue(0);
      setExpandedIndex(null);
      setExpandedCenterId(null);
      setActiveIndex(0);
      requestAnimationFrame(() => {
        listRef.current?.scrollToOffset({
          offset: 0,
          animated: false,
        });
      });
    }

    toggleSavedCenter(id);
  };

  const openMap = (
    center: DonationCenter,
  ) => {
    navigateToTab('map', {
      centerId: center.id,
    });
  };

  const openPhone = (phone: string) => {
    const dialablePhone = phone.replace(
      /[^\d+]/g,
      '',
    );

    void Linking.openURL(`tel:${dialablePhone}`);
  };

  const openWebsite = (website: string) => {
    void Linking.openURL(website);
  };

  const emailCenter = (email: string) => {
    void Linking.openURL(`mailto:${email}`);
  };

  const getCardMotion = (
    index: number,
  ) => {
    const inputRange = [
      (index - 2) * ITEM_HEIGHT,
      (index - 1) * ITEM_HEIGHT,
      index * ITEM_HEIGHT,
      (index + 1) * ITEM_HEIGHT,
      (index + 2) * ITEM_HEIGHT,
    ];

    const focusOpacity =
      scrollY.interpolate({
        inputRange: [
          (index - 1) * ITEM_HEIGHT,
          index * ITEM_HEIGHT -
            ITEM_HEIGHT * 0.42,
          index * ITEM_HEIGHT -
            ITEM_HEIGHT * 0.14,
          index * ITEM_HEIGHT +
            ITEM_HEIGHT * 0.14,
          index * ITEM_HEIGHT +
            ITEM_HEIGHT * 0.42,
          (index + 1) * ITEM_HEIGHT,
        ],
        outputRange: [
          0,
          0,
          1,
          1,
          0,
          0,
        ],
        extrapolate: 'clamp',
      });

    const scale =
      scrollY.interpolate({
        inputRange,
        outputRange: [
          0.87,
          0.94,
          1,
          0.94,
          0.87,
        ],
        extrapolate: 'clamp',
      });

    const normalOpacity =
      scrollY.interpolate({
        inputRange,
        outputRange: [
          0.58,
          0.8,
          1,
          0.8,
          0.58,
        ],
        extrapolate: 'clamp',
      });

    const translateY =
      scrollY.interpolate({
        inputRange,
        outputRange: [
          7,
          3,
          0,
          -3,
          -7,
        ],
        extrapolate: 'clamp',
      });

    return {
      focusOpacity,
      scale,
      normalOpacity,
      translateY,
    };
  };

  const renderSearchHeader = () => {
    const {
      normalOpacity,
      scale,
    } = getCardMotion(0);

    const opacity =
      expandedIndex === null
        ? normalOpacity
        : Animated.multiply(
            normalOpacity,
            otherItemsFade,
          );

    return (
      <Animated.View
        style={[
          styles.searchHeaderCard,
          {
            opacity,
            transform: [
              { translateY: 0 },
              { scale },
            ],
          },
        ]}
      >
        {selectedResultName ? (
          <View
            style={
              styles.resultContextShell
            }
          >
            <View
              style={
                styles.resultContextContent
              }
            >
              <Text
                style={
                  styles.resultContextLabel
                }
              >
                Results for
              </Text>

              <Text
                style={
                  styles.resultContextValue
                }
                numberOfLines={2}
              >
                {selectedResultName}
              </Text>
            </View>

            <Pressable
                style={({ pressed }) => [
                  styles.resultContextClearButton,
                  pressed && styles.resultContextClearButtonPressed,
                ]}
                onPress={() => resetTabParams('centers')}
                hitSlop={8}
              >
              <Ionicons
                name="close-circle"
                size={20}
                color={Colors.textMuted}
              />
            </Pressable>
          </View>
        ) : (
          <View
            style={styles.searchInputShell}
          >
            <Ionicons
              name="search-outline"
              size={20}
              color={Colors.textMuted}
            />

            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Search by name or address"
              placeholderTextColor={
                Colors.textMuted
              }
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="search"
            />

            {query.length > 0 ? (
              <Pressable
                style={({ pressed }) => [
                  styles.clearSearchButton,
                  pressed &&
                    styles.clearSearchButtonPressed,
                ]}
                onPress={() =>
                  setQuery('')
                }
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
        )}

        <View style={styles.sortSection}>
          <Text style={styles.sortLabel}>
            Sort by:
          </Text>

          <View
            style={styles.sortOptions}
          >
            <Pressable
              style={({ pressed }) => [
                styles.sortOption,
                sortMode === 'nearby' &&
                  styles.sortOptionActive,
                pressed &&
                  styles.sortOptionPressed,
              ]}
              onPress={() =>
                setSortMode('nearby')
              }
            >
              <Ionicons
                name="navigate-outline"
                size={15}
                color={
                  sortMode === 'nearby'
                    ? '#FFFFFF'
                    : Colors.textMuted
                }
              />

              <Text
                style={[
                  styles.sortOptionText,
                  sortMode === 'nearby' &&
                    styles.sortOptionTextActive,
                ]}
              >
                Distance
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.sortOption,
                sortMode ===
                  'alphabetical' &&
                  styles.sortOptionActive,
                pressed &&
                  styles.sortOptionPressed,
              ]}
              onPress={() =>
                setSortMode(
                  'alphabetical',
                )
              }
            >
              <Ionicons
                name="text-outline"
                size={15}
                color={
                  sortMode ===
                  'alphabetical'
                    ? '#FFFFFF'
                    : Colors.textMuted
                }
              />

              <Text
                style={[
                  styles.sortOptionText,
                  sortMode ===
                    'alphabetical' &&
                    styles.sortOptionTextActive,
                ]}
              >
                A–Z
              </Text>
            </Pressable>
          </View>
        </View>

        <View
          style={styles.filterDivider}
        />

        <View style={styles.toggleRow}>
          <Pressable
            style={({ pressed }) => [
              styles.toggleButton,
              showSavedOnly &&
                styles.toggleButtonActive,
              pressed &&
                styles.toggleButtonPressed,
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
                styles.toggleButtonText,
                showSavedOnly &&
                  styles.toggleButtonTextActive,
              ]}
            >
              Saved centers
            </Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.toggleButton,
              showOpenOnly &&
                styles.toggleButtonActive,
              pressed &&
                styles.toggleButtonPressed,
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
                styles.toggleButtonText,
                showOpenOnly &&
                  styles.toggleButtonTextActive,
              ]}
            >
              Open now
            </Text>
          </Pressable>
        </View>
      </Animated.View>
    );
  };

  const renderCollapsedCenterCard = (
    center: DonationCenter,
    distance: number | null,
    focusOpacity: Animated.AnimatedInterpolation<
      string | number
    >,
  ) => {
    const photo = center.photos?.[0];

    return (
      <View
        style={styles.collapsedCenterCard}
      >
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
          <View
            style={styles.photoFallback}
          >
            <Ionicons
              name="storefront-outline"
              size={27}
              color={Colors.primary}
            />
          </View>
        )}

        <View
          style={styles.photoOverlay}
        />

        <View style={styles.cardInfo}>
          <View style={styles.titleRow}>
            <Text
              style={styles.centerName}
              numberOfLines={1}
            >
              {center.name}
            </Text>

            {distance !== null ? (
              <View
                style={styles.distancePill}
              >
                <View style={styles.distancePillFill}>
                  <Ionicons
                    name="navigate"
                    size={11}
                    color="#FFFFFF"
                  />

                  <Text
                    style={styles.distanceText}
                  >
                    {distance.toFixed(1)} mi
                  </Text>
                </View>
              </View>
            ) : null}
          </View>

          <View
            style={styles.addressRow}
          >
            <Ionicons
              name="location-outline"
              size={14}
              color="rgba(255,255,255,0.88)"
            />

            <Text
              style={styles.addressText}
              numberOfLines={1}
            >
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
  ) => {
    const photos = center.photos ?? [];
    const isSaved = savedIds.has(
      center.id,
    );

    return (
      <View style={styles.expandedCard}>
        <View
          style={styles.expandedImageArea}
        >
          {photos.length > 0 ? (
            <ScrollView
              ref={expandedPhotoScrollRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={
                false
              }
              bounces={false}
              decelerationRate="fast"
              style={
                styles.expandedPhotoScroll
              }
              contentContainerStyle={
                styles.expandedPhotoScrollContent
              }
              onMomentumScrollEnd={(event) => {
                const index = Math.round(
                  event.nativeEvent.contentOffset.x /
                    EXPANDED_CONTENT_WIDTH,
                );
                setActivePhotoIndex(index);
                photoViewerScrollRef.current?.scrollTo({
                  x: index * SCREEN_WIDTH,
                  animated: false,
                });
              }}
            >
              {photos.map(
                (photo, index) => (
                  <View
                    key={`${center.id}-expanded-photo-${index}`}
                    style={
                      styles.expandedPhotoPage
                    }
                  >
                    <Image
                      source={resolvePhotoSource(
                        photo,
                      )}
                      style={
                        styles.expandedPhoto
                      }
                      contentFit="cover"
                      cachePolicy="memory-disk"
                      priority="high"
                      transition={150}
                    />

                    <View
                      style={
                        styles.expandedImageOverlay
                      }
                    />
                  </View>
                ),
              )}
            </ScrollView>
          ) : (
            <View
              style={styles.expandedFallback}
            >
              <Ionicons
                name="storefront-outline"
                size={38}
                color={Colors.primary}
              />
            </View>
          )}

          {photos.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Expand photos"
              style={({ pressed }) => [
                styles.photoExpandButton,
                pressed && styles.photoExpandButtonPressed,
              ]}
              onPress={openPhotoViewer}
              hitSlop={8}
            >
              <Ionicons
                name="expand-outline"
                size={18}
                color="#FFFFFF"
              />
              <Text style={styles.photoExpandButtonText}>
                Expand photos
              </Text>
            </Pressable>
          ) : null}

          <Pressable
            style={({ pressed }) => [
              styles.savedToggleButton,
              pressed &&
                styles.savedToggleButtonPressed,
            ]}
            onPress={() => toggleSavedCenterFromExpanded(center.id)}
            hitSlop={8}
          >
            <Ionicons
              name={
                isSaved
                  ? 'bookmark'
                  : 'bookmark-outline'
              }
              size={19}
              color="#FFFFFF"
            />
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.closeExpandedButton,
              pressed &&
                styles.closeExpandedButtonPressed,
            ]}
            onPress={closeExpandedCenter}
            hitSlop={8}
          >
            <Ionicons
              name="close"
              size={20}
              color="#FFFFFF"
            />
          </Pressable>

          <View
            style={styles.expandedImageInfo}
          >
            <Text
              style={styles.expandedName}
              numberOfLines={2}
            >
              {center.name}
            </Text>

            <View
              style={
                styles.expandedAddressRow
              }
            >
              <Text
                style={
                  styles.expandedAddress
                }
                numberOfLines={2}
              >
                {center.address}
              </Text>
            </View>
          </View>
        </View>

        <View
          style={styles.expandedContent}
        >
          <ScrollView
            style={styles.expandedDetailsScroll}
            contentContainerStyle={
              styles.expandedDetailsContent
            }
            showsVerticalScrollIndicator={false}
          >
          {center.description ? (
            <Text
              style={
                styles.expandedDescription
              }
            >
              {center.description}
            </Text>
          ) : (
            <Text
              style={
                styles.expandedDescriptionMuted
              }
            >
              See this location on the map
              for directions and current
              donation details.
            </Text>
          )}

          {center.hours ? (
            <View
              style={
                styles.expandedMetaRow
              }
            >
              <View
                style={
                  styles.metaIconCircle
                }
              >
                <Ionicons
                  name="time-outline"
                  size={18}
                  color={Colors.white}
                />
              </View>

              <View
                style={styles.metaCopy}
              >
                <Text
                  style={styles.metaLabel}
                >
                  Hours
                </Text>

                <Text
                  style={styles.metaValue}
                  numberOfLines={2}
                >
                  {center.hours}
                </Text>
              </View>
            </View>
          ) : null}

          {center.phone ? (
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                center.phone &&
                openPhone(center.phone)
              }
              style={({ pressed }) => [
                styles.expandedMetaRow,
                pressed &&
                  styles.expandedMetaRowPressed,
              ]}
            >
              <View
                style={
                  styles.metaIconCircle
                }
              >
                <Ionicons
                  name="call-outline"
                  size={18}
                  color={Colors.white}
                />
              </View>

              <View
                style={styles.metaCopy}
              >
                <Text
                  style={styles.metaLabel}
                >
                  Phone
                </Text>

                <Text
                  style={styles.metaValue}
                  numberOfLines={1}
                >
                  {center.phone}
                </Text>
              </View>
            </Pressable>
          ) : null}

          {center.website ? (
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                center.website &&
                openWebsite(center.website)
              }
              style={({ pressed }) => [
                styles.expandedMetaRow,
                pressed &&
                  styles.expandedMetaRowPressed,
              ]}
            >
              <View
                style={
                  styles.metaIconCircle
                }
              >
                <Ionicons
                  name="globe-outline"
                  size={18}
                  color={Colors.white}
                />
              </View>

              <View
                style={styles.metaCopy}
              >
                <Text
                  style={styles.metaLabel}
                >
                  Website
                </Text>

                <Text
                  style={styles.metaValue}
                  numberOfLines={1}
                >
                  {center.website}
                </Text>
              </View>
            </Pressable>
          ) : null}

          {center.email ? (
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                center.email &&
                emailCenter(center.email)
              }
              style={({ pressed }) => [
                styles.expandedMetaRow,
                pressed &&
                  styles.expandedMetaRowPressed,
              ]}
            >
              <View
                style={
                  styles.metaIconCircle
                }
              >
                <Ionicons
                  name="mail-outline"
                  size={18}
                  color={Colors.white}
                />
              </View>

              <View
                style={styles.metaCopy}
              >
                <Text
                  style={styles.metaLabel}
                >
                  Email
                </Text>

                <Text
                  style={styles.metaValue}
                  numberOfLines={1}
                >
                  {center.email}
                </Text>
              </View>
            </Pressable>
          ) : null}
          </ScrollView>

          <Pressable
            style={({ pressed }) => [
              styles.mapButton,
              pressed &&
                styles.mapButtonPressed,
            ]}
            onPress={() =>
              openMap(center)
            }
          >
            <Ionicons
              name="map-outline"
              size={19}
              color="#FFFFFF"
            />

            <Text
              style={styles.mapButtonText}
            >
              View on map
            </Text>

            <Ionicons
              name="arrow-forward"
              size={18}
              color="#FFFFFF"
              style={
                styles.mapButtonArrow
              }
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
    const {
      focusOpacity,
      scale,
      normalOpacity,
      translateY,
    } = getCardMotion(index);

    const isExpanded =
      expandedCenterId === item.id;

    const opacity =
      expandedIndex === null
        ? normalOpacity
        : isExpanded
          ? 1
          : Animated.multiply(
              normalOpacity,
              otherItemsFade,
            );

    const animatedHeight =
      expansionProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [
          COLLAPSED_CARD_HEIGHT,
          EXPANDED_CARD_HEIGHT,
        ],
      });

    const animatedRadius =
      expansionProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [18, 24],
      });

    const collapsedOpacity =
      expansionProgress.interpolate({
        inputRange: [0, 0.25, 1],
        outputRange: [1, 0, 0],
      });

    const expandedContentOpacity =
      expansionProgress.interpolate({
        inputRange: [0, 0.25, 1],
        outputRange: [0, 0, 1],
      });

    const cardScale = isExpanded
      ? 1
      : scale;

    return (
      <Animated.View
        style={[
          styles.carouselItem,
          {
            opacity,
            zIndex: isExpanded ? 20 : 1,
            transform: [
              { translateY },
              { scale: cardScale },
            ],
          },
        ]}
      >
        <Pressable
          style={styles.cardTapArea}
          onPress={() =>
            openCenter(item, index)
          }
          disabled={
            expandedIndex !== null
          }
        >
          <Animated.View
            style={[
              styles.animatedCenterCard,
              {
                height: isExpanded
                  ? animatedHeight
                  : COLLAPSED_CARD_HEIGHT,
                borderRadius: isExpanded
                  ? animatedRadius
                  : 18,
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
                      opacity:
                        collapsedOpacity,
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
                      opacity:
                        expandedContentOpacity,
                    },
                  ]}
                >
                  {renderExpandedContent(
                    item.center,
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
            <Animated.View
              pointerEvents="none"
              style={[
                styles.centerCardBorderOverlay,
                {
                  borderRadius: isExpanded
                    ? animatedRadius
                    : 18,
                },
              ]}
            />
          </Animated.View>
        </Pressable>
      </Animated.View>
    );
  };

  const emptyMessage = centerId
    ? 'Center details are unavailable.'
    : selectedTopLevel ||
        selectedCategory
      ? 'No centers match this donation category yet.'
      : showSavedOnly
        ? "You haven't saved any centers yet."
        : showOpenOnly
          ? 'No centers are open right now.'
          : query.trim()
            ? 'No centers match that search.'
            : 'No donation centers are available yet.';

  const expandedCenter = carouselItems.find(
    (item) => item.id === expandedCenterId,
  )?.center;
  const expandedPhotos = expandedCenter?.photos ?? [];

  return (
    <>
      <SafeAreaView
        style={styles.container}
        edges={['top']}
      >
        <View style={styles.listArea}>
          <Animated.FlatList
          ref={listRef}
          data={carouselItems}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          getItemLayout={getItemLayout}
          ListHeaderComponent={renderSearchHeader()}
          initialNumToRender={4}
          maxToRenderPerBatch={4}
          updateCellsBatchingPeriod={50}
          windowSize={5}
          removeClippedSubviews={
            Platform.OS === 'android'
          }
          showsVerticalScrollIndicator={false}
          snapToInterval={ITEM_HEIGHT}
          snapToAlignment="start"
          decelerationRate="fast"
          bounces={false}
          overScrollMode="never"
          contentContainerStyle={
            styles.carouselContent
          }
          onMomentumScrollEnd={(event) => {
            const offsetY =
              event.nativeEvent
                .contentOffset.y;

            setActiveIndex(
              Math.round(
                offsetY / ITEM_HEIGHT,
              ),
            );
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
                if (
                  expandedIndex !== null
                ) {
                  return;
                }

                const offsetY =
                  event.nativeEvent
                    .contentOffset.y;

                const nextIndex =
                  Math.round(
                    offsetY / ITEM_HEIGHT,
                  );

                if (
                  nextIndex !== activeIndex
                ) {
                  setActiveIndex(
                    nextIndex,
                  );
                }
              },
            },
          )}
          scrollEventThrottle={16}
          scrollEnabled={
            expandedIndex === null
          }
          ListEmptyComponent={
            <View
              style={styles.emptyState}
            >
              <Text
                style={styles.empty}
              >
                {emptyMessage}
              </Text>
            </View>
          }
          />
        </View>
      </SafeAreaView>

      <Modal
        visible={isPhotoViewerOpen}
        animationType="fade"
        presentationStyle="fullScreen"
        onRequestClose={closePhotoViewer}
        onShow={() =>
          photoViewerScrollRef.current?.scrollTo({
            x: activePhotoIndex * SCREEN_WIDTH,
            animated: false,
          })
        }
      >
        <View style={styles.photoViewer}>
          <ScrollView
            key={expandedCenterId ?? 'photo-viewer'}
            ref={photoViewerScrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            bounces={false}
            contentOffset={{
              x: activePhotoIndex * SCREEN_WIDTH,
              y: 0,
            }}
            onMomentumScrollEnd={(event) =>
              showPhotoInViewer(
                Math.round(
                  event.nativeEvent.contentOffset.x /
                    SCREEN_WIDTH,
                ),
              )
            }
          >
            {expandedPhotos.map((photo, index) => (
              <View
                key={`${expandedCenterId}-viewer-photo-${index}`}
                style={styles.photoViewerPage}
              >
                <Image
                  source={resolvePhotoSource(photo)}
                  style={styles.photoViewerImage}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                  priority="high"
                />
              </View>
            ))}
          </ScrollView>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close photo viewer"
            style={({ pressed }) => [
              styles.photoViewerClose,
              pressed && styles.photoViewerButtonPressed,
            ]}
            onPress={closePhotoViewer}
            hitSlop={8}
          >
            <Ionicons
              name="close"
              size={24}
              color="#FFFFFF"
            />
          </Pressable>

          {expandedPhotos.length > 1 ? (
            <View
              pointerEvents="none"
              style={styles.photoViewerCounter}
            >
              <Text style={styles.photoViewerCounterText}>
                {activePhotoIndex + 1} / {expandedPhotos.length}
              </Text>
            </View>
          ) : null}
        </View>
      </Modal>
    </>
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
    paddingTop: HEADER_LEADING_SPACE,
    paddingBottom: Math.max(
      18,
      (SCREEN_HEIGHT - ITEM_HEIGHT) / 2 -
        42,
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

  centerCardBorderOverlay: {
    ...StyleSheet.absoluteFill,
    borderWidth: CENTER_CARD_BORDER_WIDTH,
    borderColor: Colors.border,
  },

  searchHeaderCard: {
    width: CARD_WIDTH,
    height: SEARCH_CARD_HEIGHT,
    alignSelf: 'center',
    marginBottom: HEADER_TO_LIST_GAP,
    justifyContent: 'center',
    paddingHorizontal: 15,
    paddingVertical: 14,
    borderWidth: Border.width,
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
    borderWidth: Border.width,
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

  resultContextShell: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: Border.width,
    borderColor: Colors.border,
    borderRadius: 13,
    backgroundColor: Colors.background,
  },

  resultContextContent: {
    flex: 1,
    justifyContent: 'center',
  },

  resultContextLabel: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },

  resultContextValue: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginTop: 2,
  },

  resultContextClearButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },

  resultContextClearButtonPressed: {
    opacity: 0.6,
  },

  sortSection: {
    marginTop: 13,
  },

  sortLabel: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 12,
  },

  sortOptions: {
    height: 39,
    flexDirection: 'row',
    padding: 3,
    borderRadius: 11,
    backgroundColor: Colors.background,
    borderWidth: Border.width,
    borderColor: Colors.border,
  },

  sortOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 8,
  },

  sortOptionActive: {
    backgroundColor: Colors.primary,
  },

  sortOptionPressed: {
    opacity: 0.78,
  },

  sortOptionText: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },

  sortOptionTextActive: {
    color: '#FFFFFF',
  },

  filterDivider: {
    height: 1,
    width: '100%',
    marginVertical: 13,
    backgroundColor: Colors.border,
  },

  toggleRow: {
    flexDirection: 'row',
    gap: 8,
  },

  toggleButton: {
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

  toggleButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },

  toggleButtonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.985 }],
  },

  toggleButtonText: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '700',
  },

  toggleButtonTextActive: {
    color: '#FFFFFF',
  },

  collapsedCenterCard: {
    width: '100%',
    height: COLLAPSED_CARD_HEIGHT,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    borderWidth: CENTER_CARD_BORDER_WIDTH,
    borderColor: Colors.border,
    borderRadius: 18,
    backgroundColor: Colors.card,
  },

  collapsedPhoto: {
    ...StyleSheet.absoluteFill,
    width: '100%',
    height: '100%',
  },

  photoFallback: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.card,
  },

  photoOverlay: {
    ...StyleSheet.absoluteFill,
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
    textShadowColor:
      'rgba(0,0,0,0.4)',
    textShadowRadius: 5,
    textShadowOffset: {
      width: 0,
      height: 1,
    },
  },

  distancePill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: Border.width,
    borderColor: Colors.border,
    borderRadius: 14,
    overflow: 'hidden',
  },

  distancePillFill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: Colors.secondary,
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
    color:
      'rgba(255,255,255,0.92)',
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
    backgroundColor:
      'rgba(0,0,0,0.30)',
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
    borderWidth: CENTER_CARD_BORDER_WIDTH,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
  },

  expandedImageArea: {
    height: 258,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    backgroundColor: Colors.background,
  },

  expandedPhotoScroll: {
    ...StyleSheet.absoluteFill,
    width: '100%',
    height: '100%',
  },

  expandedPhotoScrollContent: {
    alignItems: 'stretch',
  },

  /*
   * Match the actual inner width of expandedCard.
   * expandedCard has a 1px border on both sides,
   * so its content is CARD_WIDTH - 2.
   */
  expandedPhotoPage: {
    width: EXPANDED_CONTENT_WIDTH,
    height: '100%',
    position: 'relative',
  },

  expandedPhoto: {
    ...StyleSheet.absoluteFill,
    width: '100%',
    height: '100%',
  },

  expandedFallback: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },

  expandedImageOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#000000',
    opacity: 0.31,
  },

  photoExpandButton: {
    position: 'absolute',
    top: 14,
    alignSelf: 'center',
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 12,
    height: 36,
    borderRadius: 18,
    borderWidth: Border.width,
    borderColor: Colors.border,
    backgroundColor: 'rgba(0,0,0,0.48)',
  },

  photoExpandButtonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.96 }],
  },

  photoExpandButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },

  photoViewer: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: '#000000',
  },

  photoViewerPage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },

  photoViewerImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },

  photoViewerClose: {
    position: 'absolute',
    top: 48,
    right: 20,
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: Border.width,
    borderColor: 'rgba(255,255,255,0.75)',
    borderRadius: 21,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },

  photoViewerButtonPressed: {
    opacity: 0.8,
  },

  photoViewerCounter: {
    position: 'absolute',
    bottom: 36,
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },

  photoViewerCounterText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },

  savedToggleButton: {
    position: 'absolute',
    top: 14,
    left: 14,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    borderWidth: Border.width,
    borderColor: Colors.border,
    backgroundColor: Colors.secondary,
  },

  savedToggleButtonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.94 }],
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
    borderWidth: Border.width,
    borderColor: Colors.border,
    backgroundColor: Colors.secondary,
  },

  closeExpandedButtonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.94 }],
  },

  expandedDistancePill: {
    position: 'absolute',
    top: 18,
    left: 115,
    right: 115,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: Border.width,
    borderColor: Colors.border,
    borderRadius: 16,
    overflow: 'hidden',
  },

  expandedDistancePillFill: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: Colors.secondary,
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
    textShadowColor:
      'rgba(0,0,0,0.42)',
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
    color:
      'rgba(255,255,255,0.92)',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },

  expandedContent: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
  },

  expandedDetailsScroll: {
    flex: 1,
  },

  expandedDetailsContent: {
    paddingBottom: 8,
  },

  expandedDescription: {
    color: Colors.text,
    fontSize: 13,
    lineHeight: 16,
    marginBottom: 6,
  },

  expandedDescriptionMuted: {
    color: Colors.textMuted,
    fontSize: 13,
    lineHeight: 16,
    marginBottom: 6,
  },

  expandedMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 7,
  },

  expandedMetaRowPressed: {
    opacity: 0.7,
  },

  metaIconCircle: {
    width: 29,
    height: 29,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    borderWidth: Border.width,
    borderColor: Colors.border,
    backgroundColor: Colors.secondary,
  },

  metaCopy: {
    flex: 1,
    marginLeft: 8,
  },

  metaLabel: {
    color: Colors.textMuted,
    fontSize: 10,
    fontWeight: '600',
  },

  metaValue: {
    color: Colors.text,
    fontSize: 12,
    lineHeight: 15,
  },

  mapButton: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 17,
    marginTop: 8,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    flexShrink: 0,
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