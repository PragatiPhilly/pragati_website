/**
 * Durga Pujo 2026 food menu — the single source for the homepage Thali and the
 * event page "What's cooking" section. Parsed from the committee's menu poster
 * (public/menu/durga-2026-menu.jpg).
 *
 * To change a dish: edit its line below. To swap a photo: drop a square image
 * into public/menu/dishes/<slug>.webp (any top-down shot of the food, ideally
 * 250–400px) and update `photoCredits` if it's from a stock site.
 *
 * `plate`:  'both' — everyone gets it
 *           'nv'   — non-veg plate only
 *           'veg'  — veg plate only (the poster's "(Veg Only)" items, served
 *                    in place of the non-veg dish at that meal)
 */

export type Plate = 'both' | 'nv' | 'veg';

export type Dish = {
  slug: string;
  name: string;
  bn?: string;
  plate: Plate;
  about?: string;
  /** headline dish for its plate — sits in the centre of the thali */
  star?: boolean;
  /** flagged "Pujo special" on the event page */
  special?: boolean;
};

export type Meal = {
  id: string;
  dayKey: 'fri' | 'sat' | 'sun';
  day: string;
  short: string;
  date: string; // YYYY-MM-DD, event-local
  meal: 'Lunch' | 'Dinner';
  bn: string;
  adults: Dish[];
  kids: Dish[];
};

const d = (
  slug: string,
  name: string,
  bn: string,
  plate: Plate,
  about: string,
  flags: { star?: boolean; special?: boolean } = {},
): Dish => ({ slug, name, bn, plate, about, ...flags });

const k = (slug: string, name: string, plate: Plate, star = false): Dish => ({
  slug,
  name,
  plate,
  star,
});

export const PUJO_MENU = {
  theme: 'durga',
  year: 2026,
  /** last day the homepage section shows (event-local) */
  lastDay: '2026-10-11',
  poster: '/menu/durga-2026-menu.jpg',
  meals: [
    {
      id: 'fri-dinner',
      dayKey: 'fri',
      day: 'Friday',
      short: 'Fri 9',
      date: '2026-10-09',
      meal: 'Dinner',
      bn: 'শুক্রবার · রাতের খাবার',
      adults: [
        d('peas-kochuri', 'Peas Kochuri', 'কড়াইশুঁটির কচুরি', 'both', 'Deep-fried puffs stuffed with spiced green peas.'),
        d('aloo-dum', 'Aloo Dum', 'আলুর দম', 'both', 'Baby potatoes slow-cooked in a thick, spiced gravy.'),
        d('veg-pulao', 'Veg Pulao', 'ভেজ পোলাও', 'both', 'Fragrant rice with ghee, whole spices and vegetables.'),
        d('chicken-kosha', 'Chicken Kosha', 'চিকেন কষা', 'nv', 'Chicken slow-fried with onion and spices until dark and rich.', { star: true }),
        d('malai-kofta', 'Malai Kofta', 'মালাই কোফতা', 'veg', 'Soft dumplings in a mild, creamy gravy.', { star: true }),
        d('mixed-fruit-chatni', 'Mixed Fruit Chatni', 'ফলের চাটনি', 'both', 'Sweet-sour chutney of mixed fruit.'),
        d('papad', 'Papad', 'পাঁপড়', 'both', 'Crisp lentil wafer.'),
        d('mishti', 'Mishti', 'মিষ্টি', 'both', 'A Bengali sweet to finish.'),
      ],
      kids: [
        k('veg-fried-rice', 'Veg Fried Rice', 'both'),
        k('garlic-chicken', 'Garlic Chicken (boneless)', 'nv', true),
        k('malai-kofta', 'Malai Kofta', 'veg', true),
      ],
    },
    {
      id: 'sat-lunch',
      dayKey: 'sat',
      day: 'Saturday',
      short: 'Sat 10',
      date: '2026-10-10',
      meal: 'Lunch',
      bn: 'শনিবার · দুপুরের খাবার',
      adults: [
        d('thakurbarir-khichuri', 'Thakurbarir Khichuri', 'ঠাকুরবাড়ির খিচুড়ি', 'both', 'Rice-and-moong khichuri in the Tagore-household style.', { star: true, special: true }),
        d('panchmisali-labra', 'Panchmisali Labra', 'পাঁচমিশালি লাবড়া', 'both', 'A five-vegetable medley, the classic Pujo side.', { special: true }),
        d('beguni', 'Beguni', 'বেগুনি', 'both', 'Eggplant slices fried in gram-flour batter.'),
        d('tomato-khejur-chatni', 'Tomato Khejur Chatni', 'টমেটো খেজুরের চাটনি', 'both', 'Tomato and date chutney.'),
        d('papad', 'Papad', 'পাঁপড়', 'both', 'Crisp lentil wafer.'),
        d('mishti', 'Mishti', 'মিষ্টি', 'both', 'A Bengali sweet to finish.'),
      ],
      kids: [
        k('chicken-alfredo-pasta', 'Chicken Alfredo Pasta', 'nv', true),
        k('fries', 'Fries', 'both'),
        k('veg-pasta', 'Veg Pasta', 'veg', true),
      ],
    },
    {
      id: 'sat-dinner',
      dayKey: 'sat',
      day: 'Saturday',
      short: 'Sat 10',
      date: '2026-10-10',
      meal: 'Dinner',
      bn: 'শনিবার · রাতের খাবার',
      adults: [
        d('basmati-rice', 'Sugandhi Basmati Rice', 'সুগন্ধি বাসমতী ভাত', 'both', 'Steamed aromatic basmati.'),
        d('moong-daal', 'Vegetable Moong Daal', 'সবজি মুগ ডাল', 'both', 'Moong dal cooked with vegetables.'),
        d('fish-fry', 'Fish Fry', 'ফিশ ফ্রাই', 'nv', 'Kolkata-style fried fish fillet.'),
        d('mochar-chop', 'Mochar Chop', 'মোচার চপ', 'veg', 'Banana-flower croquette.', { star: true }),
        d('echor', 'Echor', 'এঁচোড়', 'both', 'Young jackfruit curry.', { special: true }),
        d('mutton-kosha', 'Mutton Kosha', 'মটন কষা', 'nv', 'Goat meat slow-cooked the Bengali way.', { star: true }),
        d('malai-paneer', 'Malai Paneer', 'মালাই পনির', 'veg', 'Paneer in a mild, creamy gravy.'),
        d('mango-chatni', 'Mango Chatni', 'আমের চাটনি', 'both', 'Sweet-tangy mango chutney.'),
        d('papad', 'Papad', 'পাঁপড়', 'both', 'Crisp lentil wafer.'),
        d('nolen-gurer-rosogolla', 'Nolen Gurer Rosogolla', 'নলেন গুড়ের রসগোল্লা', 'both', 'Rosogolla made with date-palm jaggery.', { special: true }),
      ],
      kids: [
        k('naan', 'Naan', 'both'),
        k('chicken-butter-masala', 'Chicken Butter Masala', 'nv', true),
        k('malai-paneer', 'Malai Paneer', 'veg', true),
      ],
    },
    {
      id: 'sun-lunch',
      dayKey: 'sun',
      day: 'Sunday',
      short: 'Sun 11',
      date: '2026-10-11',
      meal: 'Lunch',
      bn: 'রবিবার · দুপুরের খাবার',
      adults: [
        d('basmati-rice', 'Sugandhi Basmati Rice', 'সুগন্ধি বাসমতী ভাত', 'both', 'Steamed aromatic basmati.'),
        d('moong-daal', 'Vegetable Moong Daal', 'সবজি মুগ ডাল', 'both', 'Moong dal cooked with vegetables.'),
        d('jhuri-aloo-bhaja', 'Jhuri Aloo Bhaja', 'ঝুরি আলুভাজা', 'both', 'Shoestring-thin fried potatoes.'),
        d('aloo-potol-dorma', 'Aloo Potol Dorma', 'আলু পটলের দোরমা', 'both', 'Pointed gourd and potato in a rich, spiced gravy.'),
        d('ilish-bhapa', 'Ilish Bhapa', 'ইলিশ ভাপা', 'nv', 'Hilsa steamed in mustard paste.', { star: true, special: true }),
        d('chanar-paturi', 'Chanar Paturi', 'ছানার পাতুরি', 'veg', 'Spiced chhena steamed in banana leaf.', { star: true, special: true }),
        d('dhokar-dalna', 'Rajsaahi Dhokar Dalna', 'রাজশাহী ধোঁকার ডালনা', 'veg', 'Lentil cakes simmered in a spiced gravy.'),
        d('pineapple-chatni', 'Pineapple Chatni', 'আনারসের চাটনি', 'both', 'Sweet pineapple chutney.'),
        d('papad', 'Papad', 'পাঁপড়', 'both', 'Crisp lentil wafer.'),
        d('mishti', 'Mishti', 'মিষ্টি', 'both', 'A Bengali sweet to finish.'),
      ],
      kids: [
        k('cheese-pizza', 'Cheese Pizza', 'both', true),
        k('chicken-tender', 'Chicken Tender', 'nv'),
        k('fries', 'Fries', 'veg'),
      ],
    },
    {
      id: 'sun-dinner',
      dayKey: 'sun',
      day: 'Sunday',
      short: 'Sun 11',
      date: '2026-10-11',
      meal: 'Dinner',
      bn: 'রবিবার · রাতের খাবার',
      adults: [
        d('chicken-biryani', 'Kolkata Style Chicken Biryani', 'কলকাতা চিকেন বিরিয়ানি', 'nv', 'Fragrant Kolkata-style chicken biryani.', { star: true, special: true }),
        d('chicken-tengri-kabab', 'Chicken Tengri Kabab', 'চিকেন টেংরি কাবাব', 'nv', 'Spiced chicken drumsticks, roasted kabab-style.'),
        d('veg-fried-rice', 'Veg Fried Rice', 'ভেজ ফ্রায়েড রাইস', 'veg', 'Indo-Chinese fried rice with vegetables.'),
        d('gobi-manchurian', 'Gobi Manchurian', 'গোবি মাঞ্চুরিয়ান', 'veg', 'Cauliflower in a tangy Indo-Chinese gravy.', { star: true }),
      ],
      kids: [
        k('chowmein', 'Chowmein', 'both', true),
        k('sweet-sour-chicken', 'Sweet n Sour Chicken', 'nv'),
        k('gobi-manchurian', 'Gobi Manchurian', 'veg'),
      ],
    },
  ] satisfies Meal[],
};

export type MenuMeal = (typeof PUJO_MENU.meals)[number];

/** Dishes on one plate: shared dishes + that plate's own. */
export function plateFor(meal: Meal, veg: boolean, kids: boolean): Dish[] {
  const list = kids ? meal.kids : meal.adults;
  return list.filter((x) => x.plate === 'both' || x.plate === (veg ? 'veg' : 'nv'));
}

export function starOf(list: Dish[]): Dish {
  return list.find((x) => x.star) ?? list[0];
}

export const dishPhoto = (slug: string) => `/menu/dishes/${slug}.webp`;

/** Today's date in Philadelphia, as YYYY-MM-DD. */
export function todayET(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(now);
}

/** True when this menu belongs to the given event (Durga Pujo of the menu's year). */
export function menuMatchesEvent(event: { theme: string; startsAt: Date } | null | undefined): boolean {
  if (!event || event.theme !== PUJO_MENU.theme) return false;
  const y = Number(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric' }).format(new Date(event.startsAt)),
  );
  return y === PUJO_MENU.year;
}

/** Homepage shows the menu for the matching event until its last day has passed. */
export function menuOnHomepage(event: { theme: string; startsAt: Date } | null | undefined, now = new Date()): boolean {
  return menuMatchesEvent(event) && todayET(now) <= PUJO_MENU.lastDay;
}

/**
 * Stock photos (Unsplash License — free to use, credit appreciated). They show
 * what each dish looks like; the Pujo kitchen's plating will differ.
 * [unsplash photo id, photographer]
 */
export const photoCredits: Record<string, [string, string]> = {
  'aloo-dum': ['7Uxdzv9-kG4', 'Dr Muhammad Amer'],
  'aloo-potol-dorma': ['3oEcy656LIE', 'Lampos Aritonang'],
  'basmati-rice': ['xmuIgjuQG0M', 'Pille R. Priske'],
  beguni: ['E6mpHlHCKCw', 'Natalia Gusakova'],
  'chanar-paturi': ['60kMO-HkSMA', 'Rangga Andika Wibisana'],
  'cheese-pizza': ['y71WqJKAbpo', 'Zayed Ahmed Zadu'],
  'chicken-alfredo-pasta': ['Jrvcg9My0B4', 'Engin Akyurt'],
  'chicken-biryani': ['ysmeQt1dzcw', 'Mario Raj'],
  'chicken-butter-masala': ['sqcH2q7lkvo', 'Raman'],
  'chicken-kosha': ['bz1UuCW-M68', 'Imad 786'],
  'chicken-tender': ['iGQRdE2WSVI', 'Samuel Isaacs'],
  'chicken-tengri-kabab': ['xMbtXlkqjt4', 'Pushpak Dsilva'],
  chowmein: ['_2N4aKtju_w', 'Zoshua Colah'],
  'dhokar-dalna': ['PqsImnjuElM', 'charlesdeluvio'],
  echor: ['Xnb826JWdDI', 'Sushmita Chatterjee'],
  'fish-fry': ['Z0eTfWkK6PY', 'Iker Merodio'],
  fries: ['lpsbMRRqMQw', 'Joyce Panda'],
  'garlic-chicken': ['8qFMa9-ljD8', 'Karolina Kołodziejczak'],
  'gobi-manchurian': ['BUPlkEeDmMk', 'Alex Bayev'],
  'ilish-bhapa': ['Lsiv0oAIfFk', 'Abhik Paul'],
  'jhuri-aloo-bhaja': ['H2RzlOijhlQ', 'Fernanda Martinez'],
  'malai-kofta': ['IOeXR0RCZtE', 'Rimsha Noor'],
  'malai-paneer': ['vgTntT8PmIM', 'Kalyani Akella'],
  'mango-chatni': ['JNGQdUcFrCc', 'Harshad Khandare'],
  mishti: ['JnIsuk9c06U', 'Gaurav Kumar'],
  'mixed-fruit-chatni': ['N-M8057fFcQ', 'Madeline Liu'],
  'mochar-chop': ['YvEll88RRU8', 'Natalia Gusakova'],
  'moong-daal': ['2beCqCd8mAc', 'Karyna Panchenko'],
  'mutton-kosha': ['al9eh9QkdPA', 'VK bro'],
  naan: ['WrE3ruckrwI', 'Ajeet Panesar'],
  'nolen-gurer-rosogolla': ['XH0XpbicHAo', 'Mustafa Fatemi'],
  'panchmisali-labra': ['UyOO2E8Ap-Y', 'Rimsha Noor'],
  papad: ['MIrFiTeKQAA', 'Zoshua Colah'],
  'peas-kochuri': ['UI0AsDyxn6Y', 'Ashwini Chaudhary'],
  'pineapple-chatni': ['wZxpOw84QTU', 'Megumi Nachev'],
  'sweet-sour-chicken': ['CteaqWgFq3M', 'Janesca'],
  'thakurbarir-khichuri': ['0ni63gRt4PE', 'Mario Raj'],
  'tomato-khejur-chatni': ['fpEJSJ9mxAw', 'Jaikishan Patel'],
  'veg-fried-rice': ['MVMohJBieo4', 'Herry Shani'],
  'veg-pasta': ['w0GyGNyGo6Y', 'Orkun Orcan'],
  'veg-pulao': ['EE6nlhmmhJo', 'Zoshua Colah'],
};
