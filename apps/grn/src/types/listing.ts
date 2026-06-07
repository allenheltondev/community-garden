export interface CatalogCrop {
  id: string;
  slug: string;
  commonName: string;
  scientificName: string | null;
  category: string | null;
  description: string | null;
  /** Garden pyramid layer 1=Foundation..5=Joy; null when not part of the food pyramid. */
  pyramidTier?: number | null;
}

export interface CatalogVariety {
  id: string;
  cropId: string;
  slug: string;
  name: string;
  description: string | null;
}

export interface GrowerCropItem {
  id: string;
  userId: string;
  canonicalId: string | null;
  cropName: string;
  varietyId: string | null;
  status: string;
  visibility: string;
  surplusEnabled: boolean;
  nickname: string | null;
  defaultUnit: string | null;
  notes: string | null;
  bedId: string | null;
  bedName: string | null;
  plantingDate: string | null;
  expectedHarvestDate: string | null;
  plantCount: number | null;
  spacingInches: number | null;
  /** Garden pyramid layer resolved from the linked catalog crop; null when unlinked or not in the pyramid. */
  pyramidTier?: number | null;
  createdAt: string;
  updatedAt: string;
}

export type SunExposure =
  | 'full_sun'
  | 'partial_sun'
  | 'partial_shade'
  | 'full_shade'
  | 'mixed';

export type BedType = 'in_ground' | 'raised' | 'mound';
export type BedShape = 'rect' | 'circle' | 'polygon';

export interface BedPolygonPoint {
  x: number;
  y: number;
}

export interface GardenBed {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  sunExposure: SunExposure | null;
  soilType: string | null;
  lengthInches: number | null;
  widthInches: number | null;
  locationNotes: string | null;
  sortOrder: number;
  bedType: BedType;
  shape: BedShape;
  positionX: number | null;
  positionY: number | null;
  rotationDeg: number;
  points: BedPolygonPoint[] | null;
  color: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GardenCanvas {
  id: string;
  userId: string;
  widthInches: number;
  heightInches: number;
  backgroundImageKey: string | null;
  backgroundImageUrl: string | null;
  backgroundOpacity: number;
  northOffsetDeg: number;
  createdAt: string;
  updatedAt: string;
}

export type AnnotationShape = 'rect' | 'circle' | 'polygon' | 'line';

export interface GardenAnnotation {
  id: string;
  userId: string;
  label: string;
  icon: string | null;
  shape: AnnotationShape;
  positionX: number | null;
  positionY: number | null;
  lengthInches: number | null;
  widthInches: number | null;
  rotationDeg: number;
  points: BedPolygonPoint[] | null;
  color: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Listing {
  id: string;
  userId: string;
  growerCropId: string | null;
  cropId: string;
  varietyId: string | null;
  title: string;
  unit: string;
  quantityTotal: string;
  quantityRemaining: string;
  availableStart: string;
  availableEnd: string;
  status: string;
  pickupLocationText: string | null;
  pickupAddress: string | null;
  pickupDisclosurePolicy: string;
  pickupNotes: string | null;
  contactPref: string;
  geoKey: string | null;
  lat: number;
  lng: number;
  createdAt: string;
}

export interface ListMyListingsResponse {
  items: Listing[];
  limit: number;
  offset: number;
  hasMore: boolean;
  nextOffset: number | null;
}

export interface DiscoverListingsResponse {
  items: Listing[];
  limit: number;
  offset: number;
  hasMore: boolean;
  nextOffset: number | null;
}

export interface UpsertListingRequest {
  title: string;
  cropId?: string;  // For catalog crops
  growerCropId?: string;  // For user-defined crops
  varietyId?: string;
  quantityTotal: number;
  unit: string;
  availableStart: string;
  availableEnd: string;
  pickupLocationText?: string;
  pickupAddress?: string;
  pickupDisclosurePolicy?: 'immediate' | 'after_confirmed' | 'after_accepted';
  pickupNotes?: string;
  contactPref?: 'app_message' | 'phone' | 'knock';
  lat: number;
  lng: number;
  status?: 'active' | 'pending' | 'claimed' | 'expired' | 'completed';
}
