// lib/predictions/subtype-defaults.ts
// Sprint S6D Day 4 (12.05.2026) — fallback ingredient distribution коли
// menu НЕ available (UpMenu-blocked OR new prospect без menu data).
//
// Format: per subtype → array of {ingredient, grams_per_visit, popularity}
//   - grams_per_visit: average grams used per typical customer visit
//   - popularity: 0-1, % of visits що include цей ingredient
//
// Aggregation:
//   monthly_grams = visits_mid × popularity × grams_per_visit
//
// These defaults are STARTING POINT — Vadym корегує через UI manual
// over time. Saved до dish_ingredient_mappings under created_by='subtype_default'.

import type { RestaurantSubtype } from './restaurant-volume'

export interface SubtypeIngredient {
  name: string
  name_normalized: string
  grams_per_visit: number
  popularity: number  // 0-1
}

const def = (name: string, grams: number, popularity: number): SubtypeIngredient => ({
  name,
  name_normalized: name.toLowerCase().replace(/\s+/g, '_'),
  grams_per_visit: grams,
  popularity,
})

export const SUBTYPE_INGREDIENT_DEFAULTS: Record<RestaurantSubtype, SubtypeIngredient[]> = {
  sushi_bar: [
    def('ryż sushi', 80, 1.0),
    def('nori (algi)', 8, 0.9),
    def('łosoś', 50, 0.7),
    def('tuńczyk', 40, 0.4),
    def('ogórek', 20, 0.8),
    def('awokado', 25, 0.5),
    def('serek kremowy', 20, 0.6),
    def('imbir marynowany', 10, 0.95),
    def('sos sojowy', 15, 0.95),
    def('wasabi', 3, 0.9),
  ],
  pizzeria: [
    def('mąka pszenna', 200, 1.0),
    def('mozarella', 100, 0.95),
    def('passata pomidorowa', 80, 0.95),
    def('oliwa z oliwek', 15, 0.9),
    def('szynka/wędlina', 40, 0.5),
    def('salami/pepperoni', 35, 0.4),
    def('grzyby', 30, 0.3),
    def('cebula', 20, 0.4),
    def('bazylia', 5, 0.7),
    def('parmezan', 10, 0.5),
  ],
  kebabnia: [
    def('kurczak', 150, 0.7),
    def('wołowina/jagnięcina', 120, 0.3),
    def('lavash', 80, 0.95),
    def('sałata', 30, 0.95),
    def('pomidor', 40, 0.95),
    def('ogórek świeży', 30, 0.85),
    def('ogórek kiszony', 15, 0.3),
    def('cebula', 25, 0.8),
    def('frytki', 200, 0.6),
    def('sos czosnkowy', 30, 0.8),
    def('sos ostry', 20, 0.4),
    def('biały ser feta', 25, 0.2),
  ],
  bar_mleczny: [
    def('mąka pszenna', 80, 0.7),
    def('ziemniaki', 200, 0.8),
    def('kapusta kiszona', 100, 0.5),
    def('kapusta świeża', 80, 0.4),
    def('twaróg', 60, 0.5),
    def('mięso mielone', 70, 0.4),
    def('cebula', 30, 0.9),
    def('marchew', 40, 0.5),
    def('śmietana', 30, 0.7),
    def('jajka', 50, 0.4),
    def('buraki', 50, 0.3),
  ],
  kawiarnia: [
    def('kawa', 18, 0.95),
    def('mleko', 100, 0.7),
    def('cukier', 5, 0.5),
    def('mąka pszenna', 60, 0.5),
    def('masło', 30, 0.4),
    def('jajka', 40, 0.4),
    def('śmietana', 20, 0.3),
    def('owoce sezonowe', 50, 0.3),
    def('herbata', 3, 0.3),
    def('woda', 250, 0.5),
  ],
  restauracja: [
    def('mięso (mix)', 150, 0.7),
    def('ziemniaki', 200, 0.6),
    def('ryż', 80, 0.3),
    def('makaron', 100, 0.3),
    def('sałata mix', 40, 0.7),
    def('pomidor', 50, 0.6),
    def('cebula', 30, 0.7),
    def('marchew', 30, 0.4),
    def('śmietana', 20, 0.4),
    def('oliwa з oliwek', 15, 0.6),
    def('zioła', 5, 0.7),
    def('ryba', 100, 0.2),
  ],
  fine_dining: [
    def('mięso premium', 180, 0.8),
    def('ryba premium (dorsz/halibut/łosoś)', 150, 0.6),
    def('owoce morza', 80, 0.3),
    def('warzywa sezonowe', 100, 0.9),
    def('wino do degustacji', 100, 0.7),
    def('truflowa oliwa', 5, 0.3),
    def('parmezan', 15, 0.4),
    def('zioła świeże', 8, 0.95),
  ],
  inne: [
    def('mięso (mix)', 100, 0.5),
    def('warzywa (mix)', 80, 0.7),
    def('pieczywo', 60, 0.5),
    def('sos', 30, 0.6),
  ],
}
