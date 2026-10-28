// ==============================================================================
// Server Automated Match Scoring Utility
// Compares a Lost report and a Found report to calculate a similarity confidence score (0-100%).
// Task 9: Smarter match scoring with synonyms, brand & color extraction, and stopword filtering.
// ==============================================================================

// Campus & conversational stopwords that should NOT count as distinct keyword matches
const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with",
  "by", "from", "up", "about", "into", "over", "after", "is", "are", "was", "were",
  "be", "been", "being", "have", "has", "had", "do", "does", "did", "this", "that",
  "these", "those", "i", "me", "my", "myself", "we", "our", "you", "your", "he",
  "she", "it", "they", "them", "what", "which", "who", "when", "where", "why", "how",
  "lost", "found", "item", "items", "please", "help", "turned", "csa", "office",
  "room", "building", "floor", "near", "area", "beside", "inside", "outside",
  "around", "front", "back", "hallway", "corridor", "stair", "stairs", "staircase",
  "bench", "table", "chair", "desk", "cr", "comfort", "washroom", "yesterday",
  "today", "morning", "afternoon", "evening", "night", "someone", "anyone", "left",
  "looking", "reward", "contact", "thank", "thanks", "kindly", "return", "surrender",
  "surrendered", "claiming", "owner", "good", "bad", "just", "very", "any"
]);

// Synonym clusters grouping interchangeable item terms
const SYNONYM_CLUSTERS = [
  { name: "Phone / Mobile", terms: ["phone", "cellphone", "cell", "smartphone", "mobile", "iphone", "android", "handset"] },
  { name: "Laptop / Computer", terms: ["laptop", "notebook", "macbook", "chromebook", "netbook", "computer", "pc"] },
  { name: "Tablet", terms: ["tablet", "ipad", "pad", "tab"] },
  { name: "Audio / Earbuds", terms: ["earphones", "earphone", "earbuds", "earbud", "airpods", "airpod", "headphones", "headphone", "headset", "inpods", "earpiece"] },
  { name: "Tumbler / Water Bottle", terms: ["tumbler", "bottle", "flask", "hydroflask", "aquaflask", "thermos", "waterbottle", "jug", "cup", "mug", "tyeso", "stanley", "kleankanteen"] },
  { name: "Wallet / Purse", terms: ["wallet", "purse", "billfold", "coinpurse", "pouch", "clutch", "moneyclip"] },
  { name: "Bag / Backpack", terms: ["bag", "backpack", "knapsack", "tote", "totebag", "sling", "slingbag", "shoulderbag", "handbag", "duffel", "duffle", "pack", "bodybag"] },
  { name: "ID / Card / Pass", terms: ["id", "identification", "badge", "idcard", "card", "rfid", "lanyard", "license", "atm", "pass", "schoolid", "beepcard"] },
  { name: "Eyewear", terms: ["glasses", "eyeglasses", "spectacles", "specs", "sunglasses", "shades", "frames"] },
  { name: "Outerwear / Clothes", terms: ["jacket", "hoodie", "sweater", "cardigan", "coat", "windbreaker", "pullover", "blazer", "uniform", "shirt"] },
  { name: "Watch / Wearable", terms: ["watch", "smartwatch", "timepiece", "wristwatch", "iwatch", "band"] },
  { name: "Keys", terms: ["key", "keys", "keychain", "fob", "keyring"] },
  { name: "Calculator", terms: ["calculator", "scical", "calcu", "calculators"] },
  { name: "Umbrella", terms: ["umbrella", "parasol"] },
  { name: "Charger / Cable", terms: ["charger", "cord", "cable", "adapter", "powerbank", "wire", "plug", "fastcharger"] },
  { name: "Stationery", terms: ["pen", "pencil", "ballpen", "ballpoint", "marker", "highlighter", "pencilcase", "case", "organizer", "binder", "notebook", "book", "textbook"] }
];

// Color mapping with shade normalization
const COLOR_MAP = {
  black: "black", dark: "black", jet: "black",
  white: "white", ivory: "white", pearl: "white",
  blue: "blue", navy: "blue", cyan: "blue", teal: "blue", aqua: "blue", sky: "blue", indigo: "blue",
  red: "red", maroon: "red", burgundy: "red", crimson: "red", scarlet: "red",
  green: "green", olive: "green", emerald: "green", mint: "green", lime: "green", forest: "green",
  yellow: "yellow", gold: "yellow", golden: "yellow", amber: "yellow", mustard: "yellow",
  orange: "orange", coral: "orange", peach: "orange",
  pink: "pink", rose: "pink", magenta: "pink",
  purple: "purple", violet: "purple", lavender: "purple", lilac: "purple",
  silver: "silver", metallic: "silver",
  gray: "gray", grey: "gray", charcoal: "gray", ash: "gray",
  brown: "brown", tan: "brown", beige: "brown", khaki: "brown",
  clear: "transparent", transparent: "transparent"
};

// Known popular campus brands
const KNOWN_BRANDS = [
  "apple", "iphone", "ipad", "macbook", "airpods", "samsung", "galaxy", "xiaomi", "redmi",
  "realme", "oppo", "vivo", "huawei", "infinix", "poco", "oneplus", "google", "pixel",
  "sony", "asus", "rog", "acer", "predator", "lenovo", "thinkpad", "dell", "hp", "toshiba",
  "casio", "canon", "nikon", "jbl", "marshall", "bose", "sennheiser", "logitech", "razer",
  "anker", "baseus", "romoss", "aquaflask", "hydroflask", "kleankanteen", "tyeso", "stanley",
  "starbucks", "yeti", "thermos", "corkcicle", "nike", "adidas", "puma", "underarmour",
  "converse", "vans", "jansport", "anello", "fjallraven", "kanken", "herschel", "uniqlo",
  "zara", "gshock", "babyg", "seiko", "citizen", "swatch", "timex"
];

function normalizeText(text) {
  if (!text || typeof text !== "string") return "";
  let clean = text.toLowerCase();
  clean = clean.replace(/aqua\s*flask/g, "aquaflask");
  clean = clean.replace(/hydro\s*flask/g, "hydroflask");
  clean = clean.replace(/air\s*pods/g, "airpods");
  clean = clean.replace(/ear\s*buds/g, "earbuds");
  clean = clean.replace(/g\s*[-_]?\s*shock/g, "gshock");
  clean = clean.replace(/sci\s*[-_]?\s*cal/g, "scical");
  clean = clean.replace(/water\s*bottle/g, "waterbottle");
  clean = clean.replace(/power\s*bank/g, "powerbank");
  clean = clean.replace(/id\s*card/g, "idcard");
  return clean;
}

export function tokenize(text) {
  const norm = normalizeText(text);
  if (!norm) return new Set();
  const words = norm.replace(/[^\w\s]/g, " ").split(/\s+/).filter((w) => w.length > 2);
  const filtered = words.filter((w) => !STOPWORDS.has(w));
  return new Set(filtered);
}

function extractColors(text) {
  const norm = normalizeText(text);
  if (!norm) return new Set();
  const words = norm.replace(/[^\w\s]/g, " ").split(/\s+/);
  const colors = new Set();
  for (const w of words) {
    if (COLOR_MAP[w]) {
      colors.add(COLOR_MAP[w]);
    }
  }
  return colors;
}

function extractBrands(text) {
  const norm = normalizeText(text);
  if (!norm) return new Set();
  const brands = new Set();
  for (const brand of KNOWN_BRANDS) {
    const regex = new RegExp(`\\b${brand}\\b`, "i");
    if (regex.test(norm)) {
      let canonical = brand;
      if (brand === "iphone" || brand === "ipad" || brand === "macbook" || brand === "airpods") {
        canonical = "apple";
      } else if (brand === "galaxy") {
        canonical = "samsung";
      } else if (brand === "redmi" || brand === "poco") {
        canonical = "xiaomi";
      } else if (brand === "gshock" || brand === "babyg") {
        canonical = "casio";
      }
      brands.add(canonical);
    }
  }
  return brands;
}

function extractSynonyms(text) {
  const norm = normalizeText(text);
  if (!norm) return new Set();
  const matchedClusters = new Set();
  for (let i = 0; i < SYNONYM_CLUSTERS.length; i++) {
    const cluster = SYNONYM_CLUSTERS[i];
    for (const term of cluster.terms) {
      const regex = new RegExp(`\\b${term}\\b`, "i");
      if (regex.test(norm)) {
        matchedClusters.add(cluster.name);
        break;
      }
    }
  }
  return matchedClusters;
}

/**
 * Calculates similarity score (0 to 100) between a lost report and a found report.
 *
 * Scoring Breakdown:
 * - Category Match & Semantic Overlap: up to 30 points
 * - Campus Location, Building, Floor & Pin Proximity: up to 25 points
 * - Date Proximity: up to 20 points
 * - Smart Attributes (Brand, Color, Synonym Type & Specific Keywords): up to 25 points
 *
 * @param {Object} lost - Lost report object
 * @param {Object} found - Found report object
 * @returns {{ score: number, confidence: 'high' | 'medium' | 'low', reasons: string[] }}
 */
export function calculateMatchScore(lost, found) {
  if (!lost || !found) {
    return { score: 0, confidence: "low", reasons: [] };
  }

  let score = 0;
  const reasons = [];

  // Normalize field values (supporting camelCase and snake_case properties)
  const lostCat = String(lost.category || lost.category_name || lost.categoryName || "").trim().toLowerCase();
  const foundCat = String(found.category || found.category_name || found.categoryName || "").trim().toLowerCase();

  const lostBuilding = String(lost.building || lost.building_name || lost.buildingName || "").trim().toLowerCase();
  const foundBuilding = String(found.building || found.building_name || found.buildingName || "").trim().toLowerCase();

  const lostFloor = String(lost.floor || lost.floor_name || lost.floorName || "").trim().toLowerCase();
  const foundFloor = String(found.floor || found.floor_name || found.floorName || "").trim().toLowerCase();

  const lostLoc = String(lost.location || lost.room || lost.room_name || lost.locationDescription || "").trim().toLowerCase();
  const foundLoc = String(found.location || found.room || found.room_name || found.locationDescription || "").trim().toLowerCase();

  const lostDate = lost.date || lost.date_reported || lost.dateReported;
  const foundDate = found.date || found.date_reported || found.dateReported;

  const lostText = `${lost.title || ""} ${lost.description || ""}`;
  const foundText = `${found.title || ""} ${found.description || ""}`;

  // 1. Category Match (Up to 30 points)
  if (lostCat && foundCat && lostCat === foundCat) {
    score += 30;
    reasons.push(`Matching category: ${lost.category || lostCat}`);
  } else {
    // Cross-category semantic overlap via synonyms
    const lostSyn = extractSynonyms(lostText);
    const foundSyn = extractSynonyms(foundText);
    let synCategoryMatch = false;
    for (const s of lostSyn) {
      if (foundSyn.has(s)) {
        synCategoryMatch = true;
        break;
      }
    }
    if (synCategoryMatch) {
      score += 15;
      reasons.push("Related item category overlap");
    }
  }

  // 2. Location / Building / Floor / Room & Pin Proximity (Up to 25 points)
  let locationScore = 0;
  const isGeneric = (b) => !b || b === "campus area" || b === "others" || b === "all floors";

  if (lostBuilding && foundBuilding && lostBuilding === foundBuilding && !isGeneric(lostBuilding)) {
    locationScore += 14;
    reasons.push(`Same building: ${lost.building || lostBuilding}`);
  }

  if (lostFloor && foundFloor && lostFloor === foundFloor && !isGeneric(lostFloor)) {
    locationScore += 5;
    reasons.push(`Same floor: ${lost.floor || lostFloor}`);
  }

  if (lostLoc && foundLoc && !isGeneric(lostLoc) && !isGeneric(foundLoc)) {
    if (lostLoc.includes(foundLoc) || foundLoc.includes(lostLoc)) {
      locationScore += 6;
      reasons.push(`Similar room/area: ${lost.location || lost.room || found.location || foundLoc}`);
    }
  }

  // Coordinate distance bonus if both reports are pinned to campus map
  const lostX = lost.mapX ?? lost.map_x;
  const lostY = lost.mapY ?? lost.map_y;
  const foundX = found.mapX ?? found.map_x;
  const foundY = found.mapY ?? found.map_y;

  if (lostX != null && lostY != null && foundX != null && foundY != null) {
    const dx = Number(lostX) - Number(foundX);
    const dy = Number(lostY) - Number(foundY);
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= 10) { // within 10% distance on map
      locationScore += 5;
      reasons.push("Map location proximity (<10m)");
    }
  }

  score += Math.min(25, locationScore);

  // 3. Date Proximity (Up to 20 points)
  if (lostDate && foundDate) {
    const lostTime = new Date(lostDate).getTime();
    const foundTime = new Date(foundDate).getTime();
    if (!isNaN(lostTime) && !isNaN(foundTime)) {
      const diffDays = Math.round((foundTime - lostTime) / (1000 * 60 * 60 * 24));
      // Found item date is expected to be on or shortly after lost date
      if (diffDays >= 0 && diffDays <= 3) {
        score += 20;
        reasons.push("Found within 3 days of loss");
      } else if (diffDays >= -1 && diffDays <= 7) {
        score += 15;
        reasons.push("Found within 1 week");
      } else if (diffDays >= -3 && diffDays <= 14) {
        score += 10;
        reasons.push("Found within 2 weeks");
      } else if (diffDays >= -7 && diffDays <= 30) {
        score += 5;
      }
    }
  }

  // 4. Smart Attributes, Synonyms & Non-Stopword Keywords (Up to 25 points)
  let attributeScore = 0;

  // A. Matching Brand (10 points)
  const lostBrands = extractBrands(lostText);
  const foundBrands = extractBrands(foundText);
  for (const b of lostBrands) {
    if (foundBrands.has(b)) {
      attributeScore += 10;
      const brandDisplay = b.charAt(0).toUpperCase() + b.slice(1);
      reasons.push(`Matching brand: ${brandDisplay}`);
      break;
    }
  }

  // B. Matching Item Type / Synonym (8 points)
  const lostSyns = extractSynonyms(lostText);
  const foundSyns = extractSynonyms(foundText);
  for (const syn of lostSyns) {
    if (foundSyns.has(syn)) {
      attributeScore += 8;
      reasons.push(`Matching item type: ${syn}`);
      break;
    }
  }

  // C. Matching Color (6 points)
  const lostColors = extractColors(lostText);
  const foundColors = extractColors(foundText);
  for (const c of lostColors) {
    if (foundColors.has(c)) {
      attributeScore += 6;
      const colorDisplay = c.charAt(0).toUpperCase() + c.slice(1);
      reasons.push(`Matching color: ${colorDisplay}`);
      break;
    }
  }

  // D. General filtered keyword overlap (3 points per matched keyword, max 8 points)
  const lostTokens = tokenize(lostText);
  const foundTokens = tokenize(foundText);
  const matchedTokens = [];
  for (const t of lostTokens) {
    if (foundTokens.has(t)) {
      matchedTokens.push(t);
    }
  }

  if (matchedTokens.length > 0) {
    attributeScore += Math.min(8, matchedTokens.length * 3);
    const preview = matchedTokens.slice(0, 3).join(", ");
    reasons.push(`Keywords matched: ${preview}`);
  }

  score += Math.min(25, attributeScore);

  const finalScore = Math.max(0, Math.min(100, Math.round(score)));
  let confidence = "low";
  if (finalScore >= 70) confidence = "high";
  else if (finalScore >= 45) confidence = "medium";

  return {
    score: finalScore,
    confidence,
    reasons,
  };
}
