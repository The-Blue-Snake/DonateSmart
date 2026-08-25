import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_DONATION_CENTERS } from './defaultDonationCenters';
import type { DonationCenter } from '@/constants/types';

const STORAGE_KEY = 'donatesmart_donation_centers';
const SEED_VERSION_KEY = 'donatesmart_donation_centers_seed_version';
const SEED_VERSION = '4';

export async function getCenters(): Promise<DonationCenter[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  const storedCenters: DonationCenter[] = raw ? JSON.parse(raw) : [];
  const centers: DonationCenter[] = storedCenters.map((center: DonationCenter) => ({
    ...center,
    acceptedCategories: center.acceptedCategories.filter((category) => category !== 'Mature'),
  }));
  const defaultLookup = new Map(DEFAULT_DONATION_CENTERS.map((center) => [center.id, center]));
  const hydratedCenters = centers.map((center) => {
    const defaultCenter = defaultLookup.get(center.id);
    if (!defaultCenter) return center;
    if (center.photos && center.photos.length > 0) return center;
    return { ...center, photos: defaultCenter.photos ?? center.photos };
  });
  const seedVersion = await AsyncStorage.getItem(SEED_VERSION_KEY);
  const needsDefaultSeed = seedVersion !== SEED_VERSION
    || DEFAULT_DONATION_CENTERS.some((defaultCenter) => {
      const currentCenter = hydratedCenters.find((center) => center.id === defaultCenter.id);
      return !currentCenter || !currentCenter.photos || currentCenter.photos.length === 0;
    });

  if (needsDefaultSeed) {
    const userCenters = hydratedCenters.filter((center) => !center.id.startsWith('default-'));
    const mergedCenters = [
      ...userCenters,
      ...DEFAULT_DONATION_CENTERS,
    ];
    await saveCenters(mergedCenters);
    await AsyncStorage.setItem(SEED_VERSION_KEY, SEED_VERSION);
    return mergedCenters;
  }

  return hydratedCenters;
}

export async function saveCenters(centers: DonationCenter[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(centers));
}

export async function getCentersForCategory(topLevel: string): Promise<DonationCenter[]> {
  const centers = await getCenters();
  const categoryPathMatches = (acceptedCategory: string, selectedCategory: string) => {
    const normalize = (value: string) => value.toLowerCase().split('>').map((part) => part.trim()).filter(Boolean);
    const acceptedPath = normalize(acceptedCategory);
    const selectedPath = normalize(selectedCategory);

    if (acceptedPath.length === 0 || selectedPath.length === 0) {
      return acceptedCategory.toLowerCase().trim() === selectedCategory.toLowerCase().trim();
    }

    if (acceptedPath.length > selectedPath.length) {
      return false;
    }

    return acceptedPath.every((segment, index) => segment === selectedPath[index]);
  };

  return centers.filter((center) => center.acceptedCategories.some((acceptedCategory) =>
    categoryPathMatches(acceptedCategory, topLevel)));
}