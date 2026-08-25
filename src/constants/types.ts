export type PhotoSource = string | number;

export type TaxonomyCategory = {
  id: string;
  name: string;
  fullPath: string;
  topLevel: string;
  level: number;
};

export type DonationCenter = {
  id: string;
  name: string;
  address: string;
  description?: string;
  acceptedCategories: string[];
  photos?: PhotoSource[];
  hours?: string;
  phone?: string;
  website?: string;
  latitude: number;
  longitude: number;
};
