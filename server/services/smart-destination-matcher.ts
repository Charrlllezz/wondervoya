export interface Destination {
  id: number;
  name: string;
  country?: string; // Added for better matching
  region?: string; // Added for better matching
}

export interface DestinationMatch {
  destination: Destination;
  score: number;
  matchType: 'exact' | 'starts_with' | 'contains' | 'fuzzy';
}

export class SmartDestinationMatcher {
  private destinations: Destination[] = [];
  private readonly MINIMUM_CONFIDENCE_THRESHOLD = 50; // Minimum score to consider a match valid

  setDestinations(destinations: Destination[]) {
    this.destinations = destinations.filter(d => d.name && d.name.trim().length > 0);
    console.log(`Smart matcher loaded ${this.destinations.length} destinations`);

    // Check for Hawaii-related destinations
    const hawaiiDestinations = this.destinations.filter(d =>
      d.name.toLowerCase().includes('hawaii') ||
      d.name.toLowerCase().includes('honolulu') ||
      d.name.toLowerCase().includes('maui') ||
      d.name.toLowerCase().includes('oahu')
    );
    console.log(`🏝️ Hawaii-related destinations found: ${hawaiiDestinations.length}`,
      hawaiiDestinations.map(d => `${d.name} (ID: ${d.id})`));

    // Log a few examples for debugging
    const examples = this.destinations.slice(0, 10).map(d => d.name);
    console.log('Sample destinations:', examples);
  }

  findBestMatches(query: string, maxResults: number = 5): DestinationMatch[] {
    if (!query || query.trim().length < 1) return [];

    const normalizedQuery = this.normalizeString(query.trim());
    const matches: DestinationMatch[] = [];

    for (const destination of this.destinations) {
      const normalizedName = this.normalizeString(destination.name);
      const score = this.calculateMatchScore(normalizedQuery, normalizedName, destination.name);

      if (score > 0) {
        const matchType = this.getMatchType(normalizedQuery, normalizedName);
        matches.push({ destination, score, matchType });
      }
    }

    // Sort by score (descending), then by match type priority, then alphabetically
    return matches
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;

        const typePriority = { exact: 4, starts_with: 3, contains: 2, fuzzy: 1 };
        const priorityDiff = typePriority[b.matchType] - typePriority[a.matchType];
        if (priorityDiff !== 0) return priorityDiff;

        return a.destination.name.localeCompare(b.destination.name);
      })
      .slice(0, maxResults);
  }

  private normalizeString(str: string): string {
    return str.toLowerCase()
      .replace(/[àáâãäå]/g, 'a')
      .replace(/[èéêë]/g, 'e')
      .replace(/[ìíîï]/g, 'i')
      .replace(/[òóôõö]/g, 'o')
      .replace(/[ùúûü]/g, 'u')
      .replace(/[ñ]/g, 'n')
      .replace(/[ç]/g, 'c')
      .replace(/[^\w\s]/g, '')
      .trim();
  }

  private calculateMatchScore(query: string, name: string, originalName: string): number {
    if (!query || !name) return 0;

    let score = 0;

    // Exact name match
    if (name === query) {
      score += 100;
    } else if (name.includes(query) || query.includes(name)) {
      score += 80;
    }

    // Enhanced Canadian destination matching
    const isCanadianQuery = query.includes('canada') || query.includes('canadian') ||
                           query.includes('alberta') || query.includes('british columbia') ||
                           query.includes('banff') || query.includes('calgary') ||
                           query.includes('vancouver') || query.includes('toronto') ||
                           query.includes('rockies') || query.includes('canadian rockies');

    const isCanadianDestination = originalName.toLowerCase().includes('canada') ||
                                 originalName.toLowerCase().includes('alberta') ||
                                 originalName.toLowerCase().includes('british columbia');

    if (isCanadianQuery && isCanadianDestination) {
      score += 100; // Strong boost for Canadian queries matching Canadian destinations
      console.log(`🇨🇦 Canadian destination boost: ${originalName}`);
    }

    // Specific Banff prioritization
    if (query.includes('banff')) {
      if (name.includes('banff') || originalName.toLowerCase().includes('banff')) {
        score += 150; // Very high priority for Banff-specific searches
        console.log(`🏔️ Banff specific boost: ${originalName}`);
      }

      // Also boost other Canadian Rockies destinations
      if (originalName.toLowerCase().includes('alberta') ||
          originalName.toLowerCase().includes('calgary') ||
          originalName.toLowerCase().includes('jasper')) {
        score += 75;
        console.log(`🏔️ Canadian Rockies region boost: ${originalName}`);
      }
    }

    // Check country/region patterns
    if (name.includes(query) && originalName.toLowerCase().includes('canada')) { // Use originalName for country check
      score += 30;
    }

    // Starts with match (very high score)
    if (name.startsWith(query)) {
      const lengthRatio = query.length / name.length;
      // Boost score for short queries that match start of destination
      const shortQueryBonus = query.length <= 3 ? 200 : 0;

      // Major city prioritization based on international importance
      const cityName = originalName.split(',')[0].trim().toLowerCase();
      let majorCityBonus = 0;

      // Tier 1: Global capitals and major international cities
      const tier1Cities = ['tokyo', 'london', 'paris', 'new york', 'barcelona', 'rome', 'madrid', 'berlin', 'amsterdam', 'sydney', 'toronto', 'fiji'];
      if (tier1Cities.includes(cityName)) {
        majorCityBonus = 200;
      }
      // Tier 2: Regional capitals and important cities
      else {
        const tier2Cities = ['vienna', 'prague', 'budapest', 'athens', 'dublin', 'stockholm', 'copenhagen', 'oslo', 'helsinki'];
        if (tier2Cities.includes(cityName)) {
          majorCityBonus = 75;
        }
        // Tier 3: Other significant cities
        else {
          const tier3Cities = ['toledo', 'toulouse', 'geneva', 'zurich', 'florence', 'venice'];
          if (tier3Cities.includes(cityName)) {
            majorCityBonus = 50;
          }
        }
      }

      score = Math.max(score, 800 + (lengthRatio * 100) + shortQueryBonus + majorCityBonus);
    }

    // Word boundary start match
    const words = name.split(/\s+/);
    const queryWords = query.split(/\s+/);

    let wordMatchScore = 0;
    for (const word of words) {
      for (const qWord of queryWords) {
        if (word.startsWith(qWord)) {
          wordMatchScore += 400 + (qWord.length / word.length * 100);
        }
      }
    }
    if (wordMatchScore > 0) score = Math.max(score, wordMatchScore);

    // Contains match
    if (name.includes(query)) {
      const position = name.indexOf(query);
      const lengthRatio = query.length / name.length;
      score = Math.max(score, 300 + (lengthRatio * 100) - (position * 2));
    }

    // MUCH more restrictive fuzzy match using Levenshtein distance
    const distance = this.levenshteinDistance(query, name);
    const maxLength = Math.max(query.length, name.length);
    const minLength = Math.min(query.length, name.length);

    // Only allow fuzzy matches if:
    // 1. Very high similarity (90%+)
    // 2. Similar lengths (70%+ length ratio)
    // 3. Very small edit distance (max 2 characters)
    const similarity = 1 - (distance / maxLength);
    const lengthRatio = minLength / maxLength;

    if (similarity >= 0.9 && lengthRatio >= 0.7 && distance <= 2) {
      score = Math.max(score, Math.floor(similarity * 100)); // Much lower score for fuzzy matches
    }

    // Acronym match (e.g., "NYC" for "New York City")
    if (this.matchesAcronym(query, originalName)) {
      score = Math.max(score, 250);
    }

    return score;
  }

  private getMatchType(query: string, name: string): 'exact' | 'starts_with' | 'contains' | 'fuzzy' {
    if (name === query) return 'exact';
    if (name.startsWith(query)) return 'starts_with';
    if (name.includes(query)) return 'contains';
    return 'fuzzy';
  }

  private levenshteinDistance(a: string, b: string): number {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }

  private matchesAcronym(query: string, name: string): boolean {
    if (query.length < 2 || query.length > 5) return false;

    const words = name.split(/\s+/).filter(word => word.length > 0);
    if (words.length < 2 || query.length !== words.length) return false;

    const acronym = words.map(word => word[0].toLowerCase()).join('');
    return acronym === query.toLowerCase();
  }

  // Enhanced destination extraction with better scoring
  extractDestinationFromSearch(searchTerm: string, destinations: Destination[]): Destination | null {
    this.setDestinations(destinations);

    console.log(`🔍 Analyzing search term: "${searchTerm}"`);

    // Enhanced parsing for "City, Country" format with better matching
      const cityCountryMatch = searchTerm.match(/^(.+?),\s*(united states|usa|us|america|canada|france|italy|spain|germany|japan|australia|uk|united kingdom|england|britain|great britain)$/i);
      if (cityCountryMatch) {
        const cityName = cityCountryMatch[1].trim();
        const countryName = cityCountryMatch[2].trim();
        console.log(`🎯 Detected "City, Country" format: "${cityName}, ${countryName}"`);

        // SPECIAL CASE: London with UK/England/Britain indicators
        if (cityName.toLowerCase().includes('london') &&
            (countryName.toLowerCase().includes('uk') ||
             countryName.toLowerCase().includes('united kingdom') ||
             countryName.toLowerCase().includes('england') ||
             countryName.toLowerCase().includes('britain'))) {

          // Force London UK destination (ID: 737)
          const londonUK = destinations.find(dest =>
            (dest.id === 737 || (dest as any).destinationId === 737) ||
            (dest.name && dest.name.toLowerCase().includes('london') &&
             ((dest as any).country || '').toLowerCase().includes('united kingdom'))
          );

          if (londonUK) {
            console.log(`🇬🇧 FORCED London UK match: "${searchTerm}" → "${londonUK.name}" (ID: ${londonUK.id || (londonUK as any).destinationId}) - Country: ${(londonUK as any).country}`);
            return londonUK;
          } else {
            console.log(`⚠️ Could not find London UK in destinations cache, using ID 737 as fallback`);
            return { id: 737, name: 'London' };
          }
        }

        // Find destination that contains the city name
        const cityMatches = this.findBestMatches(cityName, 5);
        if (cityMatches.length > 0) {
          console.log(`✅ Found ${cityMatches.length} matches for city "${cityName}"`);
          // Prefer matches that also mention the country or have higher scores
          const bestMatch = cityMatches[0]; // Already sorted by score
          console.log(`🎯 Best match for "${searchTerm}": ${bestMatch.destination.name} (score: ${bestMatch.score})`);
          return bestMatch.destination;
        }
      }

    // Try direct exact matches for known cities - use more precise matching
    const searchLower = searchTerm.toLowerCase();

    // Extract potential destinations using better pattern matching - avoid date patterns
    const destinationPatterns = [
      // "traveling to Tokyo", "going to Paris", etc. - but not if followed by date patterns
      /(?:traveling|going|visiting|trip|vacation)\s+(?:to\s+)?([A-Z][a-zA-Z\s,]+?)(?=\s+(?:on|in|for|with|from)\s+(?!(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d)))/gi,
      // "Solo traveling to Tokyo, Japan" - strict city, country format only
      /(?:solo|group|family)?\s*(?:traveling|going|visiting|trip|vacation)\s+(?:to\s+)?([A-Z][a-z]+,\s*[A-Z][a-z]+)(?=\s|$)/gi,
      // Only explicit city, country pairs and exclude date patterns - with better word boundary handling
      /\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]+)?\s*,\s*[A-Z][a-z]{3,})\b(?!\s*(?:on|→|\d))/g,
      // Single major cities only when in proper travel context - exclude if followed by dates
      /(?:to|visit|in|at|from)\s+(Tokyo|Paris|London|Rome|Barcelona|Madrid|Berlin|Amsterdam|Vienna|Prague|Sydney|Melbourne|New York|Los Angeles|San Francisco|Chicago|Miami|Las Vegas|Orlando|Boston|Seattle|Vancouver|Toronto|Montreal|Fiji|Bali|Hawaii|Maldives|Seychelles|Mauritius|Lisbon|Portugal)(?!\s*(?:on|→|\d))/gi,
      // Enhanced Hawaii pattern matching - catch "fishing Hawaii", "snorkeling Hawaii", etc.
      /\b(fishing|snorkeling|tours?|sightseeing|activities?|adventure)\s+(in\s+)?Hawaii\b/gi,
      // Lisbon-specific patterns - catch "Lisbon food", "food in Lisbon", etc.
      /\b(food|culinary|cuisine|dining|tours?|activities?|adventure|museums?|history|cultural?)\s+(?:in\s+|at\s+)?Lisbon\b/gi,
      /\bLisbon\s+(food|culinary|cuisine|dining|tours?|activities?|adventure|museums?|history|cultural?)\b/gi,
      // Portugal patterns
      /\b(museums?|history|cultural?|food|tours?|activities?)\s+(?:in\s+|at\s+)?Portugal\b/gi,
      /\bPortugal\s+(museums?|history|cultural?|food|tours?|activities?)\b/gi,
      // Direct Lisbon mentions
      /\bLisbon\b/gi,
      /\bPortugal\b/gi
    ];

    const potentialDestinations = new Set<string>();

    for (const pattern of destinationPatterns) {
      let match;
      while ((match = pattern.exec(searchTerm)) !== null) {
        // Handle patterns with and without capture groups
        const destination = match[1] ? match[1].trim() : match[0].trim();
        
        // Skip if destination is empty or undefined
        if (!destination) continue;
        
        console.log(`🔍 Pattern match found: "${destination}" from pattern: ${pattern.source}`);

        // Enhanced filtering to prevent false positives
        const isValidDestination = (
          // Must be reasonable length
          destination.length >= 3 && destination.length <= 50 &&
          // Must not start with numbers or contain obvious non-destination patterns
          !destination.match(/^\d+\./) && // Skip numbered list items
          !destination.match(/^\d+\s/) && // Skip numbers followed by space
          !destination.match(/^(i\s|and\s|or\s|the\s|a\s|an\s)/i) && // Skip starting with articles/pronouns
          // Must not contain obvious interest/activity words
          !destination.match(/\b(enjoy|like|love|want|prefer|museums?|food|tours?|budget|activities?|experience|restaurant|beach|hiking|shopping|nightlife|cultural|adventure|sightseeing)\b/i) &&
          // Must not be common non-destination words or date patterns
          !destination.match(/^(july?|june?|may|april|march|february|january|mon|tue|wed|thu|fri|sat|sun|morning|afternoon|evening|night|day|week|month|year)$/i) &&
          // Exclude date arrow patterns and common date fragments
          !destination.match(/\d+\s*→\s*\w+/i) && // Skip "2 → Sun" patterns
          !destination.match(/\b(jul|jun|may|apr|mar|feb|jan|aug|sep|oct|nov|dec)\s*\d+/i) && // Skip "Jul 2" patterns
          !destination.match(/\b(sun|mon|tue|wed|thu|fri|sat),?\s*(jul|jun|may|apr|mar|feb|jan|aug|sep|oct|nov|dec)/i) && // Skip "Sun, Jul" patterns
          // Must contain at least one properly capitalized word (indicating proper noun)
          destination.match(/[A-Z][a-z]/)
        );

        if (isValidDestination) {
          // Additional validation against known false positives from date patterns
          const isFalsePositive = (
            // Common date-related false positives
            destination.match(/\b(sun|mon|tue|wed|thu|fri|sat)\b/i) ||
            destination.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i) ||
            destination.match(/\d+/) || // Contains any numbers
            destination.length < 4 || // Too short to be a real destination
            destination.split(/\s+/).length > 3 // Too many words (likely a sentence fragment)
          );

          if (!isFalsePositive) {
            console.log(`✅ Adding potential destination: "${destination}"`);
            potentialDestinations.add(destination);
          } else {
            console.log(`❌ Rejected false positive: "${destination}"`);
          }
        } else {
          console.log(`❌ Filtered out: "${destination}" (failed validation)`);
        }
      }
    }

    // If no patterns matched, try the search term itself as a potential destination
    if (potentialDestinations.size === 0) {
      console.log(`🔄 No patterns matched, trying direct search term: "${searchTerm}"`);

      // Enhanced Hawaii detection - check if search contains "Hawaii" directly
      if (searchLower.includes('hawaii')) {
        console.log(`🏝️ HAWAII DETECTED in direct search: Adding "Hawaii" as potential destination`);
        potentialDestinations.add('Hawaii');
      }

      // Enhanced Lisbon detection - check if search contains "Lisbon" directly
      if (searchLower.includes('lisbon')) {
        console.log(`🇵🇹 LISBON DETECTED in direct search: Adding "Lisbon, Portugal" as potential destination`);
        potentialDestinations.add('Lisbon, Portugal');
        potentialDestinations.add('Lisbon');
      }

      potentialDestinations.add(searchTerm.trim());
    }

    // 🏝️ SPECIAL HAWAII HANDLING: If search contains Hawaii but no destinations match,
    // check if we can find any Hawaiian destinations by alternate names
    if (searchLower.includes('hawaii') && potentialDestinations.size === 0) {
      console.log(`🏝️ Special Hawaii search detected: "${searchTerm}"`);

      // Look for common Hawaiian destination patterns
      const hawaiianAlternates = [
        'honolulu', 'maui', 'oahu', 'big island', 'kauai', 'molokai', 'lanai'
      ];

      for (const alternate of hawaiianAlternates) {
        const hawaiiMatches = this.findBestMatches(alternate, 3);
        if (hawaiiMatches.length > 0) {
          console.log(`🎯 Found Hawaiian destination via "${alternate}": ${hawaiiMatches[0].destination.name}`);
          return hawaiiMatches[0].destination;
        }
      }

      // If still no match, add a fallback Hawaii destination if we can find any US destination
      const usDestinations = destinations.filter(d =>
        d.name.toLowerCase().includes('usa') ||
        d.name.toLowerCase().includes('united states')
      );

      if (usDestinations.length > 0) {
        console.log(`🏝️ Hawaii fallback: Using generic US destination until Hawaii cache is fixed`);
        // Create a synthetic Hawaii destination for now
        return {
          id: usDestinations[0].id,
          name: 'Hawaii, USA'
        };
      }
    }

    // Check for exact city matches first
    for (const potential of Array.from(potentialDestinations)) {
      const exactMatches = destinations.filter(dest => {
        const destName = dest.name.toLowerCase();
        const potentialLower = potential.toLowerCase();
        // More precise matching - check if destination name is contained or starts with potential
        return destName.includes(potentialLower) || potentialLower.includes(destName);
      });

      if (exactMatches.length > 0) {
        // Prioritize by relevance and major cities
        const prioritized = exactMatches.sort((a, b) => {
          const aName = a.name.toLowerCase();
          const bName = b.name.toLowerCase();
          const potentialLower = potential.toLowerCase();

          // 🎯 KONA HAWAII PRIORITY: Prefer specific locations over general ones
          if (potentialLower.includes('kona') && potentialLower.includes('hawaii')) {
            // Prioritize "Kona, Hawaii" over general "Hawaii"
            const aIsKonaSpecific = aName.includes('kona') && aName.includes('hawaii');
            const bIsKonaSpecific = bName.includes('kona') && bName.includes('hawaii');
            const aIsGeneralHawaii = aName === 'hawaii' && !aName.includes('kona');
            const bIsGeneralHawaii = bName === 'hawaii' && !bName.includes('kona');

            if (aIsKonaSpecific && bIsGeneralHawaii) {
              console.log(`🏝️ KONA PRIORITY: Preferring "${a.name}" (ID: ${a.id}) over "${b.name}" (ID: ${b.id})`);
              return -1;
            }
            if (bIsKonaSpecific && aIsGeneralHawaii) {
              console.log(`🏝️ KONA PRIORITY: Preferring "${b.name}" (ID: ${b.id}) over "${a.name}" (ID: ${a.id})`);
              return 1;
            }
          }

          // Exact matches get highest priority
          if (aName === potentialLower && bName !== potentialLower) return -1;
          if (bName === potentialLower && aName !== potentialLower) return 1;

          // Major cities get priority (prefer lower IDs for popular destinations)
          const majorCities = ['tokyo', 'paris', 'london', 'new york', 'rome', 'barcelona', 'berlin', 'los angeles', 'san francisco', 'las vegas', 'chicago', 'miami', 'orlando', 'seattle', 'boston'];
          const aMajor = majorCities.some(city => aName.includes(city));
          const bMajor = majorCities.some(city => bName.includes(city));

          // 🎯 ENHANCED: Use country information for intelligent destination prioritization
          if (aName.includes(potentialLower) && bName.includes(potentialLower)) {
            // Prioritize destinations with proper country information
            const aCountry = ((a as any).country || '').toLowerCase();
            const bCountry = ((b as any).country || '').toLowerCase();

            console.log(`🌍 Country comparison for "${potentialLower}": A="${aCountry}" vs B="${bCountry}"`);

            // For major cities, prioritize commonly searched countries
            const majorCountryPriority: { [key: string]: string[] } = {
              'london': ['united kingdom', 'uk', 'england', 'britain'],
              'paris': ['france'],
              'new york': ['united states', 'usa', 'us'],
              'tokyo': ['japan'],
              'rome': ['italy'],
              'barcelona': ['spain'],
              'amsterdam': ['netherlands'],
              'lisbon': ['portugal'] // Added Lisbon country priority
            };

            const cityKey = Object.keys(majorCountryPriority).find(city => potentialLower.includes(city));
            if (cityKey && majorCountryPriority[cityKey]) {
              const preferredCountries = majorCountryPriority[cityKey];
              const aIsPreferred = preferredCountries.some((country: string) => aCountry.includes(country));
              const bIsPreferred = preferredCountries.some((country: string) => bCountry.includes(country));

              console.log(`🔍 City "${cityKey}" priority check: A preferred=${aIsPreferred}, B preferred=${bIsPreferred}`);

              if (aIsPreferred && !bIsPreferred) {
                console.log(`✅ Prioritizing A (${a.name}) due to preferred country: ${aCountry}`);
                return -1;
              }
              if (bIsPreferred && !aIsPreferred) {
                console.log(`✅ Prioritizing B (${b.name}) due to preferred country: ${bCountry}`);
                return 1;
              }
            }
          }

          // For same city names, prefer lower ID (more popular destination)
          if (aName.includes(potentialLower) && bName.includes(potentialLower)) {
            const aId = a.id || (a as any).destinationId || 999999;
            const bId = b.id || (b as any).destinationId || 999999;
            return aId - bId; // Lower ID wins
          }

          if (aMajor && !bMajor) return -1;
          if (!aMajor && bMajor) return 1;

          // Otherwise prefer longer matches
          return b.name.length - a.name.length;
        });

        console.log(`Direct destination match: "${searchTerm}" → "${prioritized[0].name}"`);
        return prioritized[0];
      }
    }

    // Only if no direct matches, try pattern extraction with very strict criteria
    const words = searchTerm.toLowerCase().split(/\s+/);
    const possibleDestinations: string[] = [];

    // Skip common words and fragments that shouldn't be matched as destinations
    const skipWords = new Set([
      'to', 'in', 'at', 'on', 'for', 'and', 'or', 'the', 'a', 'an', 'is', 'are', 'was', 'were',
      'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'can', 'must', 'shall', 'solo', 'trip', 'travel', 'vacation',
      'holiday', 'visit', 'going', 'planning', 'activities', 'things', 'stuff', 'with', 'from',
      'museums', 'culture', 'budget', 'wed', 'jul', 'sat', 'enjoy', 'food', 'tours', 'fri'
    ]);

    // Add patterns to completely skip
    const skipPatterns = [
      /^\d+\./, // Skip numbered list items like "18. i enjoy"
      /^i\s/, // Skip sentences starting with "i"
      /enjoy|museums|food|budget|tours/i // Skip interest-related words
    ];

    // Look for destination patterns, prioritize longer matches
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const fullFragment = words.slice(i).join(' ');

      // Skip if matches any skip pattern
      if (skipPatterns.some(pattern => pattern.test(fullFragment))) continue;

      // Skip common words or short words
      if (skipWords.has(word) || word.length < 4) continue;

      // Only add candidates that could reasonably be destination names
      if (word.length >= 4 && !word.match(/^\d+$/) && !word.match(/enjoy|museums|food|budget/i)) {
        possibleDestinations.push(word);
      }

      // Two word destinations - with stricter filtering
      if (i < words.length - 1 && !skipWords.has(words[i + 1]) && words[i + 1].length >= 3) {
        const candidate = `${words[i]} ${words[i + 1]}`;
        const candidateFragment = words.slice(i, i + 2).join(' ');

        // Skip if contains problematic patterns
        if (!skipPatterns.some(pattern => pattern.test(candidateFragment)) &&
            candidate.length >= 6 &&
            !candidate.match(/enjoy|museums|food|budget/i)) {
          possibleDestinations.push(candidate);
        }
      }
    }

    // Sort by length (longer matches are more likely to be accurate)
    possibleDestinations.sort((a, b) => b.length - a.length);

    // Find best matches for each possible destination with VERY strict criteria
    let bestMatch: DestinationMatch | null = null;

    for (const candidate of possibleDestinations) {
      const matches = this.findBestMatches(candidate, 1);
      if (matches.length > 0) {
        const match = matches[0];
        // EXTREMELY strict threshold - only accept near-exact matches
        // Only exact matches (1000) or very strong starts_with matches (900+)
        if (match.score >= 900 || (match.score >= 950 && match.matchType === 'starts_with')) {
          if (!bestMatch || match.score > bestMatch.score) {
            bestMatch = match;
            console.log(`Smart destination match: "${candidate}" → "${bestMatch.destination.name}" (score: ${bestMatch.score})`);
          }
        }
      }
    }

    return bestMatch?.destination || null;
  }
}

export const smartDestinationMatcher = new SmartDestinationMatcher();

export function extractDestinationFromMessage(message: string): string | null {
  console.log('🔍 Extracting destination from current message:', message);

  // First, try to find explicit city mentions with common travel keywords
  const explicitPatterns = [
    /(?:museum.*in|museums.*in|adventure in|trip to|travel to|visit|explore|planning.*in)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi,
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),?\s+(?:France|Germany|Italy|Spain|UK|Japan|USA|Canada|Australia|Portugal)/gi,
    /your\s+(?:\w+\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:trip|adventure|visit|experience)/gi,
    /(?:in|to)\s+([A-Z][a-z]+)(?:\s+from\s+|\s+is\s+|\s+has\s+|\s+offers\s+)/gi,
    /(?:trip to|traveling to|visiting|exploring)\s+(Lisbon)(?:\s+for|\s+in|\s+with)/gi // Explicit Lisbon pattern
  ];

  for (const pattern of explicitPatterns) {
    const matches = Array.from(message.matchAll(pattern));
    if (matches.length > 0) {
      const destination = matches[matches.length - 1][1];
      console.log('🔍 Found explicit destination pattern:', destination);
      return destination;
    }
  }

  // Try City, Country pattern
  const cityCountryMatch = message.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/);
  if (cityCountryMatch) {
    const destination = `${cityCountryMatch[1]}, ${cityCountryMatch[2]}`;
    console.log('🔍 Found City, Country pattern:', destination);
    return destination;
  }

  // Look for common destination names at start of sentences
  const sentenceStartPattern = /(?:^|\.\s+)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:is|has|offers|provides|features)/g;
  const sentenceMatch = message.match(sentenceStartPattern);
  if (sentenceMatch) {
    const match = sentenceMatch[0].match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:is|has|offers|provides|features)/);
    if (match) {
      console.log('🔍 Found sentence start pattern:', match[1]);
      return match[1];
    }
  }

  return null;
}