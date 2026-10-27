// ==============================================================================
// Automated Match Scoring Utility
// Compares a Lost report and a Found report to calculate a similarity confidence score (0-100%).
// ==============================================================================

/**
 * Normalizes text for keyword matching.
 */
function tokenize(text) {
  if (!text || typeof text !== "string") return new Set();
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

/**
 * Calculates similarity score (0 to 100) between a lost report and a found report.
 *
 * Scoring Breakdown:
 * - Category Match: 35 points
 * - Campus Location / Building / Room: 30 points
 * - Date Proximity: 20 points
 * - Title & Description Keyword Overlap: 15 points
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

  // 1. Category Match (35 points)
  const lostCat = String(lost.category || "").trim().toLowerCase();
  const foundCat = String(found.category || "").trim().toLowerCase();
  if (lostCat && foundCat && lostCat === foundCat) {
    score += 35;
    reasons.push(`Matching category: ${lost.category}`);
  }

  // 2. Location / Building / Room Match (30 points)
  const lostBuilding = String(lost.building || "").trim().toLowerCase();
  const foundBuilding = String(found.building || "").trim().toLowerCase();
  const lostLoc = String(lost.location || lost.locationDescription || "").trim().toLowerCase();
  const foundLoc = String(found.location || found.locationDescription || "").trim().toLowerCase();

  let locationScore = 0;
  if (lostBuilding && foundBuilding && lostBuilding === foundBuilding && lostBuilding !== "campus area") {
    locationScore += 18;
    reasons.push(`Same building: ${lost.building}`);
  }

  if (lost.floor && found.floor && String(lost.floor).toLowerCase() === String(found.floor).toLowerCase()) {
    locationScore += 6;
  }

  if (lostLoc && foundLoc && (lostLoc.includes(foundLoc) || foundLoc.includes(lostLoc))) {
    locationScore += 6;
    reasons.push(`Similar room/area: ${lost.location || found.location}`);
  }

  score += Math.min(30, locationScore);

  // 3. Date Proximity (20 points)
  if (lost.date && found.date) {
    const lostTime = new Date(lost.date).getTime();
    const foundTime = new Date(found.date).getTime();
    if (!isNaN(lostTime) && !isNaN(foundTime)) {
      const diffDays = Math.round((foundTime - lostTime) / (1000 * 60 * 60 * 24));
      // Found item date is expected to be on or after lost date
      if (diffDays >= 0 && diffDays <= 3) {
        score += 20;
        reasons.push("Found within 3 days of reported loss");
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

  // 4. Keyword Overlap in Title and Description (15 points)
  const lostWords = new Set([...tokenize(lost.title), ...tokenize(lost.description)]);
  const foundWords = new Set([...tokenize(found.title), ...tokenize(found.description)]);

  if (lostWords.size > 0 && foundWords.size > 0) {
    let matches = 0;
    const matchedTokens = [];
    for (const word of lostWords) {
      if (foundWords.has(word)) {
        matches++;
        if (matchedTokens.length < 3) matchedTokens.push(word);
      }
    }

    if (matches > 0) {
      const keywordScore = Math.min(15, matches * 5);
      score += keywordScore;
      reasons.push(`Keyword matches: ${matchedTokens.join(", ")}`);
    }
  }

  // Cap score between 0 and 100
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
