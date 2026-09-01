// Mirrors backend/app/schemas.py — keep these in sync by hand for now.
// (A generated client from the OpenAPI schema is a reasonable later upgrade,
// not needed for a project this size yet.)

export interface Portion {
  label: string;
  grams: number;
}

export interface UsdaMatch {
  fdc_id: string;
  matched_description: string;
  calories_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fat_per_100g: number;
  portions: Portion[];
}

export interface MealItemCandidate {
  name: string;
  confidence: number;
  usda: UsdaMatch | null;
  suggested_grams: number | null;
}

export interface IdentifyResponse {
  meal_id: string;
  items: MealItemCandidate[];
}

export interface GramsEntry {
  name: string;
  fdc_id: string;
  grams: number;
}

export interface CalculateRequest {
  meal_id: string;
  items: GramsEntry[];
}

export interface ComputedItem {
  name: string;
  grams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface CalculateResponse {
  items: ComputedItem[];
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fat: number;
}

export interface MealItemRow {
  id: string;
  food_name: string;
  fdc_id: string | null;
  suggested_grams: number | null;
  grams: number | null;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  match_confidence: number | null;
}

export interface MealSummary {
  id: string;
  image_url: string | null;
  created_at: string;
  status: string;
  items: MealItemRow[];
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fat: number;
}

export interface MealListResponse {
  meals: MealSummary[];
}

export interface DailyStatsResponse {
  date: string;
  meal_count: number;
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fat: number;
}
