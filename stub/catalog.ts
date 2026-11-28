/**
 * Seed catalogue for the local stub. Prices are illustrative demo values,
 * not live Instamart prices. Shapes follow the search_products reference.
 */
import type { SearchProduct } from '../shared/instamart.js';

interface Seed {
  id: string;
  name: string;
  brand: string;
  tags: string[];
  variants: Array<[size: string, mrp: number, offer: number]>;
}

const SEEDS: Seed[] = [
  { id: 'milk-amul-taaza', name: 'Amul Taaza Toned Milk', brand: 'Amul', tags: ['milk', 'dairy', 'toned'], variants: [['500 ml', 28, 28], ['1 L', 56, 54]] },
  { id: 'milk-amul-gold', name: 'Amul Gold Full Cream Milk', brand: 'Amul', tags: ['milk', 'dairy', 'full cream'], variants: [['500 ml', 34, 34], ['1 L', 68, 66]] },
  { id: 'milk-mother-dairy', name: 'Mother Dairy Toned Milk', brand: 'Mother Dairy', tags: ['milk', 'dairy', 'toned'], variants: [['500 ml', 28, 27], ['1 L', 56, 55]] },
  { id: 'bread-britannia-white', name: 'Britannia White Bread', brand: 'Britannia', tags: ['bread', 'white bread', 'bakery'], variants: [['400 g', 49, 49], ['700 g', 75, 72]] },
  { id: 'bread-harvest-gold-brown', name: 'Harvest Gold Brown Bread', brand: 'Harvest Gold', tags: ['bread', 'brown bread', 'bakery'], variants: [['400 g', 55, 52]] },
  { id: 'eggs-farm', name: 'Farm Fresh White Eggs', brand: 'Eggoz', tags: ['eggs', 'egg'], variants: [['6 pcs', 60, 57], ['12 pcs', 114, 109], ['30 pcs', 270, 255]] },
  { id: 'atta-aashirvaad', name: 'Aashirvaad Shudh Chakki Atta', brand: 'Aashirvaad', tags: ['atta', 'flour', 'wheat'], variants: [['1 kg', 70, 66], ['5 kg', 295, 279], ['10 kg', 560, 535]] },
  { id: 'atta-pillsbury', name: 'Pillsbury Chakki Fresh Atta', brand: 'Pillsbury', tags: ['atta', 'flour', 'wheat'], variants: [['1 kg', 65, 62], ['5 kg', 280, 262]] },
  { id: 'rice-india-gate', name: 'India Gate Basmati Rice Classic', brand: 'India Gate', tags: ['rice', 'basmati'], variants: [['1 kg', 199, 185], ['5 kg', 899, 849]] },
  { id: 'rice-daawat-rozana', name: 'Daawat Rozana Basmati Rice', brand: 'Daawat', tags: ['rice', 'basmati'], variants: [['1 kg', 120, 109], ['5 kg', 560, 520]] },
  { id: 'dal-toor-tata', name: 'Tata Sampann Unpolished Toor Dal', brand: 'Tata Sampann', tags: ['dal', 'toor', 'arhar', 'lentils'], variants: [['500 g', 99, 92], ['1 kg', 189, 178]] },
  { id: 'dal-moong', name: 'Tata Sampann Moong Dal', brand: 'Tata Sampann', tags: ['dal', 'moong', 'lentils'], variants: [['500 g', 85, 79], ['1 kg', 165, 155]] },
  { id: 'oil-fortune-sunflower', name: 'Fortune Sunlite Refined Sunflower Oil', brand: 'Fortune', tags: ['oil', 'sunflower oil', 'cooking oil'], variants: [['1 L', 165, 149], ['5 L', 799, 735]] },
  { id: 'oil-saffola-gold', name: 'Saffola Gold Refined Oil', brand: 'Saffola', tags: ['oil', 'cooking oil'], variants: [['1 L', 210, 189]] },
  { id: 'ghee-amul', name: 'Amul Pure Ghee', brand: 'Amul', tags: ['ghee', 'dairy'], variants: [['500 ml', 330, 319], ['1 L', 650, 629]] },
  { id: 'butter-amul', name: 'Amul Butter Pasteurised', brand: 'Amul', tags: ['butter', 'dairy'], variants: [['100 g', 60, 58], ['500 g', 285, 275]] },
  { id: 'paneer-amul', name: 'Amul Malai Paneer', brand: 'Amul', tags: ['paneer', 'dairy', 'cottage cheese'], variants: [['200 g', 95, 90], ['1 kg', 450, 435]] },
  { id: 'curd-mother-dairy', name: 'Mother Dairy Classic Dahi', brand: 'Mother Dairy', tags: ['curd', 'dahi', 'yogurt', 'dairy'], variants: [['400 g', 50, 48], ['1 kg', 110, 105]] },
  { id: 'cheese-amul-slices', name: 'Amul Cheese Slices', brand: 'Amul', tags: ['cheese', 'dairy'], variants: [['100 g', 75, 72], ['200 g', 145, 139]] },
  { id: 'banana-robusta', name: 'Banana Robusta', brand: 'Fresho', tags: ['banana', 'bananas', 'fruit'], variants: [['6 pcs', 48, 42], ['12 pcs', 92, 80]] },
  { id: 'apple-shimla', name: 'Shimla Apple', brand: 'Fresho', tags: ['apple', 'apples', 'fruit'], variants: [['4 pcs', 140, 125], ['1 kg', 220, 199]] },
  { id: 'onion', name: 'Onion', brand: 'Fresho', tags: ['onion', 'onions', 'pyaz', 'vegetable'], variants: [['500 g', 30, 25], ['1 kg', 58, 48], ['2 kg', 110, 92]] },
  { id: 'tomato-hybrid', name: 'Tomato Hybrid', brand: 'Fresho', tags: ['tomato', 'tomatoes', 'tamatar', 'vegetable'], variants: [['500 g', 35, 29], ['1 kg', 68, 56]] },
  { id: 'potato', name: 'Potato', brand: 'Fresho', tags: ['potato', 'potatoes', 'aloo', 'vegetable'], variants: [['1 kg', 45, 38], ['2 kg', 88, 72]] },
  { id: 'coriander', name: 'Coriander Leaves', brand: 'Fresho', tags: ['coriander', 'dhaniya', 'herbs'], variants: [['100 g', 15, 12]] },
  { id: 'chilli-green', name: 'Green Chilli', brand: 'Fresho', tags: ['chilli', 'green chilli', 'mirchi'], variants: [['100 g', 14, 11]] },
  { id: 'ginger', name: 'Ginger', brand: 'Fresho', tags: ['ginger', 'adrak'], variants: [['100 g', 22, 18], ['250 g', 50, 42]] },
  { id: 'lemon', name: 'Lemon', brand: 'Fresho', tags: ['lemon', 'nimbu'], variants: [['4 pcs', 30, 24]] },
  { id: 'sugar-madhur', name: 'Madhur Pure Sugar', brand: 'Madhur', tags: ['sugar', 'cheeni'], variants: [['1 kg', 60, 55], ['5 kg', 290, 270]] },
  { id: 'salt-tata', name: 'Tata Salt Iodised', brand: 'Tata', tags: ['salt', 'namak'], variants: [['1 kg', 28, 28]] },
  { id: 'tea-tata-gold', name: 'Tata Tea Gold', brand: 'Tata Tea', tags: ['tea', 'chai'], variants: [['250 g', 175, 160], ['500 g', 340, 310]] },
  { id: 'coffee-nescafe', name: 'Nescafe Classic Instant Coffee', brand: 'Nescafe', tags: ['coffee'], variants: [['50 g', 190, 180], ['100 g', 350, 335]] },
  { id: 'biscuit-parle-g', name: 'Parle-G Gold Biscuits', brand: 'Parle', tags: ['biscuit', 'biscuits', 'cookies'], variants: [['100 g', 10, 10], ['1 kg', 120, 112]] },
  { id: 'biscuit-good-day', name: 'Britannia Good Day Cashew Cookies', brand: 'Britannia', tags: ['biscuit', 'biscuits', 'cookies'], variants: [['200 g', 50, 47]] },
  { id: 'maggi', name: 'Maggi 2-Minute Masala Noodles', brand: 'Maggi', tags: ['noodles', 'maggi', 'instant noodles'], variants: [['70 g', 15, 15], ['280 g (4 pack)', 60, 57], ['560 g (8 pack)', 116, 110]] },
  { id: 'chips-lays', name: "Lay's Classic Salted Chips", brand: "Lay's", tags: ['chips', 'snacks'], variants: [['52 g', 20, 20], ['115 g', 50, 48]] },
  { id: 'cornflakes-kelloggs', name: "Kellogg's Corn Flakes Original", brand: "Kellogg's", tags: ['cornflakes', 'cereal', 'breakfast'], variants: [['250 g', 120, 112], ['475 g', 215, 199]] },
  { id: 'oats-quaker', name: 'Quaker Oats', brand: 'Quaker', tags: ['oats', 'breakfast'], variants: [['400 g', 99, 92], ['1 kg', 210, 195]] },
  { id: 'peanut-butter', name: 'Pintola Classic Peanut Butter Crunchy', brand: 'Pintola', tags: ['peanut butter', 'spread'], variants: [['350 g', 199, 179]] },
  { id: 'jam-kissan', name: 'Kissan Mixed Fruit Jam', brand: 'Kissan', tags: ['jam', 'spread'], variants: [['200 g', 80, 76], ['500 g', 175, 165]] },
  { id: 'ketchup-kissan', name: 'Kissan Fresh Tomato Ketchup', brand: 'Kissan', tags: ['ketchup', 'sauce'], variants: [['500 g', 120, 110], ['950 g', 190, 175]] },
  { id: 'detergent-surf', name: 'Surf Excel Easy Wash Detergent Powder', brand: 'Surf Excel', tags: ['detergent', 'washing powder', 'laundry'], variants: [['1 kg', 140, 132], ['3 kg', 399, 375]] },
  { id: 'dishwash-vim', name: 'Vim Dishwash Liquid Gel Lemon', brand: 'Vim', tags: ['dishwash', 'dish wash', 'vim'], variants: [['250 ml', 55, 52], ['750 ml', 155, 145]] },
  { id: 'soap-dettol', name: 'Dettol Original Soap', brand: 'Dettol', tags: ['soap', 'bath'], variants: [['75 g x 4', 180, 165]] },
  { id: 'toothpaste-colgate', name: 'Colgate Strong Teeth Toothpaste', brand: 'Colgate', tags: ['toothpaste'], variants: [['100 g', 62, 59], ['200 g', 120, 112]] },
  { id: 'water-bisleri', name: 'Bisleri Packaged Drinking Water', brand: 'Bisleri', tags: ['water', 'mineral water'], variants: [['1 L', 20, 20], ['5 L', 75, 70]] },
  { id: 'cola-coke', name: 'Coca-Cola Soft Drink', brand: 'Coca-Cola', tags: ['coke', 'cola', 'soft drink'], variants: [['750 ml', 40, 40], ['2.25 L', 99, 95]] },
];

export const STUB_IMAGE_BASE = ''; // no images in the stub; UI renders placeholders

export function buildCatalog(): SearchProduct[] {
  return SEEDS.map((s) => ({
    displayName: s.name,
    brand: s.brand,
    inStock: true,
    isAvail: true,
    productId: `prod_${s.id}`,
    parentProductId: `parent_${s.id}`,
    variations: s.variants.map(([size, mrp, offer], i) => ({
      spinId: `spin_${s.id}_${i}`,
      skuId: `sku_${s.id}_${i}`,
      quantityDescription: size,
      displayName: s.name,
      brandName: s.brand,
      price: { mrp, offerPrice: offer },
      isInStockAndAvailable: true,
    })),
  }));
}

export const PRODUCT_TAGS: Record<string, string[]> = Object.fromEntries(
  SEEDS.map((s) => [`prod_${s.id}`, s.tags]),
);

/** spinIds the stub's scenario flags act on. */
export const SCENARIO_TARGETS = {
  outOfStock: 'spin_milk-amul-taaza_0', // Amul Taaza 500 ml
  priceChange: { spinId: 'spin_bread-britannia-white_0', newOffer: 52 }, // ₹49 -> ₹52
  surgeFee: 25,
};

export const SEED_PRODUCT_COUNT = SEEDS.length;
