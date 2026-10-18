import type { DonationCenter, TaxonomyCategory } from '@/constants/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import taxonomyData from './taxonomy.json';
import { DEFAULT_DONATION_CENTERS } from './defaultDonationCenters';

const STORAGE_KEY = 'donatesmart_donation_centers';
const SEED_VERSION_KEY = 'donatesmart_donation_centers_seed_version';
const SEED_VERSION = '14';
const taxonomyCategories = taxonomyData as TaxonomyCategory[];
const categoriesById = new Map(
  taxonomyCategories.map((category) => [category.id, category]),
);

function getCategoryPath(category: string): string {
  return categoriesById.get(category.trim())?.fullPath ?? category;
}

function isMatureCategory(category: string): boolean {
  return category === 'Mature'
    || categoriesById.get(category.trim())?.topLevel === 'Mature';
}

export function isCategoryMatch(
  acceptedCategory: string,
  selectedCategory: string,
): boolean {
  const acceptedPath = getCategoryPath(acceptedCategory)
    .toLowerCase()
    .split('>')
    .map((part) => part.trim())
    .filter(Boolean);
  const selectedPath = getCategoryPath(selectedCategory)
    .toLowerCase()
    .split('>')
    .map((part) => part.trim())
    .filter(Boolean);

  if (!acceptedPath.length || !selectedPath.length) {
    return acceptedCategory.toLowerCase().trim()
      === selectedCategory.toLowerCase().trim();
  }

  return acceptedPath.length <= selectedPath.length
    && acceptedPath.every(
      (segment, index) => segment === selectedPath[index],
    );
}

export async function getCenters(): Promise<DonationCenter[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  const storedCenters: DonationCenter[] = raw ? JSON.parse(raw) : [];
  const centers: DonationCenter[] = storedCenters.map((center: DonationCenter) => ({
    ...center,
    acceptedCategories: center.acceptedCategories.filter((category) => !isMatureCategory(category)),
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
  return centers.filter((center) => center.acceptedCategories.some((acceptedCategory) =>
    isCategoryMatch(acceptedCategory, topLevel)));
}