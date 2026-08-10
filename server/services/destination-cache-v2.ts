import { destinationFetcher } from './destination-fetcher';
import { csvTagManager } from './csv-tag-manager';
import { intentParser } from './intent-parser';
import { enhancedTagMatcher } from './enhanced-tag-matcher';
import { viatorService } from './viator';

interface Destination {
  id: number;
  name: string;
  lastUpdated: string;
}

interface DestinationCacheEntry {
  data: Destination[];
  timestamp: number;
  ttl: number;
  strategy: string;
}

export class DestinationCacheV2 {
  private cache: Map<string, DestinationCacheEntry> = new Map();
  private readonly CACHE_TTL = {
    STANDARD: 24 * 60 * 60 * 1000, // 24 hours
    EXTENDED: 7 * 24 * 60 * 60 * 1000, // 7 days
    QUICK: 60 * 60 * 1000 // 1 hour
  };

  /**
   * 🎯 DESTINATION CACHE V2 (New Implementation)
   */
  async getDestinationsV2(strategy: 'aggressive' | 'conservative' | 'hybrid' = 'hybrid'): Promise<Destination[]> {
    console.log(`🎯 DESTINATION CACHE V2: Using ${strategy} strategy`);

    const cacheKey = `destinations_${strategy}`;
    const cached = this.cache.get(cacheKey);

    // Check cache validity
    if (cached && this.isCacheValid(cached)) {
      console.log(`⚡ Cache V2 HIT: Found ${cached.data.length} destinations (${strategy} strategy)`);
      return cached.data;
    }

    // Cache miss or expired - fetch fresh data
    console.log(`🔄 Cache V2 MISS: Fetching fresh destinations with ${strategy} strategy`);
    const destinations = await this.fetchWithStrategy(strategy);

    // Cache the results
    this.cacheDestinations(cacheKey, destinations, strategy);

    return destinations;
  }

  /**
   * 📊 STRATEGY-BASED FETCHING
   */
  private async fetchWithStrategy(strategy: string): Promise<Destination[]> {
    switch (strategy) {
      case 'aggressive':
        return this.fetchAggressiveStrategy();
      case 'conservative':
        return this.fetchConservativeStrategy();
      case 'hybrid':
      default:
        return this.fetchHybridStrategy();
    }
  }

  /**
   * 🚀 AGGRESSIVE STRATEGY - Prioritize speed, use stale data if necessary
   */
  private async fetchAggressiveStrategy(): Promise<Destination[]> {
    try {
      // Try database first
      const dbDestinations = await destinationFetcher.getAllDestinations();
      if (dbDestinations.length > 0) {
        console.log(`🚀 Aggressive V2: Using database (${dbDestinations.length} destinations)`);
        return this.formatDestinations(dbDestinations);
      }

      // Fallback to any cached data, even if stale
      const staleCache = Array.from(this.cache.values()).find(entry => entry.data.length > 0);
      if (staleCache) {
        console.log(`🚀 Aggressive V2: Using stale cache (${staleCache.data.length} destinations)`);
        return staleCache.data;
      }

      // Last resort: minimal fallback
      return this.getMinimalFallback();
    } catch (error) {
      console.error('❌ Aggressive strategy failed:', error);
      return this.getMinimalFallback();
    }
  }

  /**
   * 🛡️ CONSERVATIVE STRATEGY - Prioritize data freshness and accuracy
   */
  private async fetchConservativeStrategy(): Promise<Destination[]> {
    try {
      // Always try to get fresh data from database
      const dbDestinations = await destinationFetcher.getAllDestinations();

      // Only use database if it has comprehensive coverage
      if (dbDestinations.length > 3000) {
        console.log(`🛡️ Conservative V2: Using fresh database (${dbDestinations.length} destinations)`);
        return this.formatDestinations(dbDestinations);
      }

      // If database is incomplete, try to refresh it
      console.log('🛡️ Conservative V2: Database incomplete, attempting refresh...');
      const refreshResult = await destinationFetcher.fetchAndStoreAllDestinations();

      if (refreshResult.success && refreshResult.count > 3000) {
        const refreshedDestinations = await destinationFetcher.getAllDestinations();
        console.log(`🛡️ Conservative V2: Refreshed database (${refreshedDestinations.length} destinations)`);
        return this.formatDestinations(refreshedDestinations);
      }

      // Fallback with warning
      console.warn('⚠️ Conservative V2: Could not ensure data freshness, using fallback');
      return this.getQualityFallback();
    } catch (error) {
      console.error('❌ Conservative strategy failed:', error);
      return this.getQualityFallback();
    }
  }

  /**
   * ⚖️ HYBRID STRATEGY - Balance speed and accuracy
   */
  private async fetchHybridStrategy(): Promise<Destination[]> {
    try {
      // Quick database check
      const dbDestinations = await destinationFetcher.getAllDestinations();

      if (dbDestinations.length > 3000) {
        console.log(`⚖️ Hybrid V2: Using database (${dbDestinations.length} destinations)`);
        return this.formatDestinations(dbDestinations);
      } else if (dbDestinations.length > 1000) {
        console.log(`⚖️ Hybrid V2: Using partial database (${dbDestinations.length} destinations)`);
        return this.formatDestinations(dbDestinations);
      }

      // Try to enhance with cached data
      const cachedData = Array.from(this.cache.values())
        .filter(entry => this.isCacheValid(entry, this.CACHE_TTL.EXTENDED))
        .sort((a, b) => b.timestamp - a.timestamp)[0];

      if (cachedData) {
        console.log(`⚖️ Hybrid V2: Using recent cache (${cachedData.data.length} destinations)`);
        return cachedData.data;
      }

      // Fallback
      return this.getBalancedFallback();
    } catch (error) {
      console.error('❌ Hybrid strategy failed:', error);
      return this.getBalancedFallback();
    }
  }

  /**
   * 🔧 CACHE MANAGEMENT
   */
  private cacheDestinations(key: string, destinations: Destination[], strategy: string): void {
    const ttl = this.getTTLForStrategy(strategy);

    this.cache.set(key, {
      data: destinations,
      timestamp: Date.now(),
      ttl,
      strategy
    });

    console.log(`💾 Cached V2: ${destinations.length} destinations with ${strategy} strategy (TTL: ${ttl/1000/60}min)`);
  }

  /**
   * 🧹 DETECT AND CLEAR CONTAMINATED CACHE
   */
  detectCacheContamination(): boolean {
    const cacheEntries = Array.from(this.cache.entries());
    let contaminated = false;

    for (const [key, entry] of cacheEntries) {
      const destinations = entry.data;
      
      // Check for suspicious mixing of distant destinations
      const hasJapan = destinations.some(d => d.name.toLowerCase().includes('japan') || d.name.toLowerCase().includes('tokyo'));
      const hasHawaii = destinations.some(d => d.name.toLowerCase().includes('hawaii'));
      const hasCanada = destinations.some(d => d.name.toLowerCase().includes('canada') || d.name.toLowerCase().includes('banff'));
      const hasFrance = destinations.some(d => d.name.toLowerCase().includes('france') || d.name.toLowerCase().includes('paris'));

      const mixedRegions = [hasJapan, hasHawaii, hasCanada, hasFrance].filter(Boolean).length;
      
      if (mixedRegions > 2) {
        console.warn(`🚨 Cache contamination detected in ${key}: Mixed regions (Japan: ${hasJapan}, Hawaii: ${hasHawaii}, Canada: ${hasCanada}, France: ${hasFrance})`);
        contaminated = true;
      }
    }

    return contaminated;
  }

  /**
   * 🧹 CLEAR CONTAMINATED CACHE
   */
  clearContaminatedCache(): void {
    if (this.detectCacheContamination()) {
      console.log('🧹 Clearing contaminated cache to prevent destination mixing...');
      this.cache.clear();
      console.log('✅ Cache cleared - fresh data will be fetched on next request');
    }
  }

  private isCacheValid(entry: DestinationCacheEntry, customTTL?: number): boolean {
    const ttl = customTTL || entry.ttl;
    return Date.now() - entry.timestamp < ttl;
  }

  private getTTLForStrategy(strategy: string): number {
    switch (strategy) {
      case 'aggressive':
        return this.CACHE_TTL.EXTENDED; // Cache longer for speed
      case 'conservative':
        return this.CACHE_TTL.QUICK; // Cache shorter for freshness
      case 'hybrid':
      default:
        return this.CACHE_TTL.STANDARD; // Balanced TTL
    }
  }

  /**
   * 📋 FALLBACK STRATEGIES
   */
  private getMinimalFallback(): Destination[] {
    return [
      { id: 1, name: 'Tokyo, Japan', lastUpdated: new Date().toISOString() },
      { id: 479, name: 'Paris, France', lastUpdated: new Date().toISOString() },
      { id: 737, name: 'London, United Kingdom', lastUpdated: new Date().toISOString() },
      { id: 511, name: 'Rome, Italy', lastUpdated: new Date().toISOString() },
      { id: 562, name: 'Barcelona, Spain', lastUpdated: new Date().toISOString() }
    ];
  }

  private getQualityFallback(): Destination[] {
    // More comprehensive fallback for conservative strategy
    return [
      { id: 1, name: 'Tokyo, Japan', lastUpdated: new Date().toISOString() },
      { id: 479, name: 'Paris, France', lastUpdated: new Date().toISOString() },
      { id: 737, name: 'London, United Kingdom', lastUpdated: new Date().toISOString() },
      { id: 511, name: 'Rome, Italy', lastUpdated: new Date().toISOString() },
      { id: 562, name: 'Barcelona, Spain', lastUpdated: new Date().toISOString() },
      { id: 32, name: 'Los Angeles, USA', lastUpdated: new Date().toISOString() },
      { id: 8, name: 'New York, USA', lastUpdated: new Date().toISOString() },
      { id: 28, name: 'Sydney, Australia', lastUpdated: new Date().toISOString() },
      { id: 24, name: 'Bangkok, Thailand', lastUpdated: new Date().toISOString() },
      { id: 23, name: 'Dubai, UAE', lastUpdated: new Date().toISOString() }
    ];
  }

  private getBalancedFallback(): Destination[] {
    // Hybrid approach - medium size fallback
    return [
      { id: 1, name: 'Tokyo, Japan', lastUpdated: new Date().toISOString() },
      { id: 479, name: 'Paris, France', lastUpdated: new Date().toISOString() },
      { id: 737, name: 'London, United Kingdom', lastUpdated: new Date().toISOString() },
      { id: 511, name: 'Rome, Italy', lastUpdated: new Date().toISOString() },
      { id: 562, name: 'Barcelona, Spain', lastUpdated: new Date().toISOString() },
      { id: 32, name: 'Los Angeles, USA', lastUpdated: new Date().toISOString() },
      { id: 8, name: 'New York, USA', lastUpdated: new Date().toISOString() }
    ];
  }

  private formatDestinations(dbDestinations: any[]): Destination[] {
    return dbDestinations.map(dest => ({
      id: dest.id,
      name: dest.name,
      lastUpdated: new Date().toISOString()
    }));
  }

  /**
   * 📊 CACHE STATISTICS
   */
  getCacheStats() {
    const stats = {
      totalCacheEntries: this.cache.size,
      strategies: {} as Record<string, any>
    };

    for (const [key, entry] of this.cache.entries()) {
      const age = Date.now() - entry.timestamp;
      const isValid = this.isCacheValid(entry);

      stats.strategies[key] = {
        strategy: entry.strategy,
        destinationCount: entry.data.length,
        ageMinutes: Math.round(age / 1000 / 60),
        isValid,
        ttlMinutes: Math.round(entry.ttl / 1000 / 60)
      };
    }

    return stats;
  }

  /**
   * 🎯 LOCATION RESOLVER - Find destination ID by location name
   */
  async resolveLocationToId(locationName: string): Promise<number | null> {
    if (!locationName || typeof locationName !== 'string') {
      console.warn('⚠️ Invalid location name provided to resolveLocationToId');
      return null;
    }

    const searchTerm = locationName.toLowerCase().trim();
    console.log(`🔍 Resolving location "${locationName}" to destination ID...`);

    try {
      // Get destinations from cache using hybrid strategy
      const destinations = await this.getDestinationsV2('hybrid');

      if (!destinations || destinations.length === 0) {
        console.warn('⚠️ No destinations available for location resolution');
        return null;
      }

      // Strategy 1: Exact match (case insensitive)
      let match = destinations.find(dest =>
        dest.name.toLowerCase() === searchTerm
      );

      if (match) {
        console.log(`✅ Exact match found: "${match.name}" (ID: ${match.id})`);
        return match.id;
      }

      // Strategy 2: Contains match (destination contains search term)
      match = destinations.find(dest =>
        dest.name.toLowerCase().includes(searchTerm)
      );

      if (match) {
        console.log(`✅ Contains match found: "${match.name}" (ID: ${match.id})`);
        return match.id;
      }

      // Strategy 3: Partial match (search term contains destination name)
      match = destinations.find(dest =>
        searchTerm.includes(dest.name.toLowerCase())
      );

      if (match) {
        console.log(`✅ Partial match found: "${match.name}" (ID: ${match.id})`);
        return match.id;
      }

      // Strategy 4: City-level matching (extract city from "City, Country" format)
      const cityMatch = this.extractCityFromLocation(searchTerm);
      if (cityMatch) {
        match = destinations.find(dest => {
          const destCity = this.extractCityFromLocation(dest.name.toLowerCase());
          return destCity === cityMatch;
        });

        if (match) {
          console.log(`✅ City-level match found: "${match.name}" (ID: ${match.id})`);
          return match.id;
        }
      }

      // Strategy 5: Fuzzy matching with scoring
      const fuzzyMatch = this.findBestFuzzyMatch(searchTerm, destinations);
      if (fuzzyMatch) {
        console.log(`✅ Fuzzy match found: "${fuzzyMatch.name}" (ID: ${fuzzyMatch.id}) with score ${fuzzyMatch.score}`);
        return fuzzyMatch.id;
      }

      console.log(`❌ No destination found for location: "${locationName}"`);
      return null;

    } catch (error) {
      console.error('❌ Error resolving location to ID:', error);
      return null;
    }
  }

  /**
   * 🏙️ Extract city name from location string
   */
  private extractCityFromLocation(location: string): string | null {
    if (!location) return null;

    // Handle "City, Country" format
    const parts = location.split(',').map(p => p.trim());
    if (parts.length >= 2) {
      return parts[0]; // First part is usually the city
    }

    return location; // Return as-is if no comma found
  }

  /**
   * 🎯 Find best fuzzy match using simple scoring
   */
  private findBestFuzzyMatch(searchTerm: string, destinations: Destination[]): (Destination & { score: number }) | null {
    const scoredMatches = destinations.map(dest => {
      const destName = dest.name.toLowerCase();
      let score = 0;

      // Word overlap scoring
      const searchWords = searchTerm.split(/\s+/);
      const destWords = destName.split(/\s+/);

      for (const searchWord of searchWords) {
        for (const destWord of destWords) {
          if (destWord.includes(searchWord) || searchWord.includes(destWord)) {
            score += Math.min(searchWord.length, destWord.length);
          }
        }
      }

      // Length similarity bonus
      const lengthDiff = Math.abs(searchTerm.length - destName.length);
      const lengthBonus = Math.max(0, 10 - lengthDiff);
      score += lengthBonus;

      return { ...dest, score };
    })
    .filter(match => match.score > 5) // Minimum score threshold
    .sort((a, b) => b.score - a.score);

    return scoredMatches.length > 0 ? scoredMatches[0] : null;
  }

  /**
   * 🔍 SEARCH V2 - Enhanced product search using Viator /products/search endpoint
   */
  /**
   * Resolve a free-text location name (e.g. "paris") to a cached destination.
   * Used by searchV2 to turn a locationName into a destinationId when the
   * caller didn't already supply one.
   */
  async findDestinationByName(name: string): Promise<{ destinationId: number; name: string } | null> {
    const destinations = await this.getDestinationsV2('hybrid');
    const searchName = name.toLowerCase().trim();

    let match = destinations.find(dest => dest.name.toLowerCase() === searchName);
    if (!match) {
      match = destinations.find(dest => dest.name.toLowerCase().includes(searchName));
    }

    return match ? { destinationId: match.id, name: match.name } : null;
  }

  async searchV2(params: {
    searchTerm: string;
    destinationId?: number;
    locationName?: string;
    currency?: string;
    maxResults?: number;
    sort?: 'TRAVELER_RATING' | 'PRICE_FROM_LOW_TO_HIGH' | 'PRICE_FROM_HIGH_TO_LOW';
    tags?: number[];
    isAmbiguous?: boolean;
  }): Promise<any[]> {
    console.log(`🔍 SearchV2: Starting enhanced search for "${params.searchTerm}"`);

    try {
      const searchPayload: any = {
        searchTerms: [
          {
            searchTerm: params.searchTerm,
            match: "FUZZY"
          }
        ],
        currency: params.currency || "USD",
        sort: params.sort || "TRAVELER_RATING",
        order: "DESCENDING",
        topX: params.maxResults || 15,
        pagination: {
          start: 1,
          count: params.maxResults || 15
        }
      };

      let resolvedDestinationId = params.destinationId;

      // 🎯 LOCATION RESOLUTION - Try to resolve location name to destination ID if no ID provided
      if (!resolvedDestinationId && params.locationName) {
        console.log(`🔍 SearchV2: Attempting to resolve location "${params.locationName}" to destination ID`);
        const locationMatch = await this.findDestinationByName(params.locationName);
        if (locationMatch) {
          resolvedDestinationId = locationMatch.destinationId;
          console.log(`✅ SearchV2: Resolved "${params.locationName}" to destination ID: ${resolvedDestinationId}`);
        } else {
          console.warn(`⚠️ SearchV2: Could not resolve location "${params.locationName}" to destination ID`);
        }
      }

      // Build filtering object only if we have filters to apply
      const filtering: any = {};

      // Add tag filtering with enhanced interest mapping
      if (params.tags && params.tags.length > 0) {
        // Use explicitly provided tags
        filtering.tags = params.tags;
        console.log(`🏷️ SearchV2: Using provided tag filters: ${params.tags.join(', ')}`);
      } else {
        // PHASE 3: AMBIGUITY-AWARE TAG MAPPING

        // Step 2: Parse user intent for tags and filters using enhanced matcher
        const tagResult = await enhancedTagMatcher.matchUserInterests(params.searchTerm);
        const tagIds = tagResult.tagIds;

        console.log(`🏷️ SEARCH V2: Enhanced tag matching results:`);
        console.log(`   - Found ${tagIds.length} tags: [${tagIds.slice(0, 8).join(', ')}${tagIds.length > 8 ? '...' : ''}]`);
        console.log(`   - Confidence: ${tagResult.confidence}%`);
        console.log(`   - Strategy: ${tagResult.matchStrategy}`);
        console.log(`   - Categories: ${Object.entries(tagResult.categoryBreakdown).map(([k,v]) => `${k}(${v})`).join(', ')}`);

        const flags = intentParser.mapFeatureFlags(params.searchTerm);
        const priceRange = intentParser.parseBudget(params.searchTerm);


        // Combine with emphasis on L3/L4 specificity for ambiguous queries
        const l3l4FallbackTags = [
            12028, // L3: Cultural Tours
            12029, // L3: Historical Tours
            21648, // L3: Museums
            11965, // L3: Dinner Cruises
            12047, // L3: Kayaking Tours
            21729, // L3: Sightseeing Cruises
            13109  // L3: Museums (specific)
        ];

        const allTagIds = [...new Set([...tagIds.slice(0, 4), ...(params.tags || []).slice(0, 3), ...l3l4FallbackTags])];

        filtering.tags = allTagIds;
        console.log(`🎯 SearchV2 (AMBIGUOUS): Using diversified tags (${allTagIds.length} total)`);
        console.log(`   - Intent tags: ${tagIds.length}, CSV tags: ${(params.tags || []).length}, Popular tags: 7`);

      }

      // Add destination filter if provided
      if (resolvedDestinationId) { // Use resolvedDestinationId
        searchPayload.filtering = {
          destination: resolvedDestinationId, // Fix: Viator API expects 'destination' not 'destinationId'
          includeAutomaticTranslations: true
        };
        console.log(`🎯 SearchV2: Adding destination filter for ID ${resolvedDestinationId}`);
      }

      // Add feature flags from intent parser
      const featureFlags = intentParser.mapFeatureFlags(params.searchTerm);

      if (featureFlags.length > 0) {
        filtering.flags = featureFlags;
        console.log(`🏴 SearchV2: Added feature flags: ${featureFlags.join(', ')}`);
      }

      // PRICE CONSTRAINT INTEGRATION: Parse and apply price constraints from search term
      const parsedBudget = intentParser.parseBudget(params.searchTerm);
      if (parsedBudget?.range) {
        const priceRange = parsedBudget.range;

        // Add pricing filter to the filtering object
        filtering.pricing = {
          priceRange: {
            minPrice: priceRange.min,
            maxPrice: priceRange.max,
            currency: priceRange.currency || 'USD'
          }
        };

        console.log(`💰 SearchV2: Added price constraints: $${priceRange.min}-$${priceRange.max} ${priceRange.currency}`);
        console.log(`💰 SearchV2: Budget confidence: ${parsedBudget.confidence}, preference: ${parsedBudget.preference}`);
      }

      // Only add filtering object if we have filters to apply
      if (Object.keys(filtering).length > 0) {
        searchPayload.filtering = filtering;
      }

      console.log(`📡 SearchV2: Making POST request to /products/search`);
      console.log(`📋 SearchV2: Payload:`, JSON.stringify(searchPayload, null, 2));

      // Make the API call to Viator's /products/search endpoint
      const response = await fetch('https://api.viator.com/partner/products/search', {
        method: 'POST',
        headers: {
          'Accept': 'application/json;version=2.0',
          'Accept-Language': 'en-US',
          'Content-Type': 'application/json',
          'exp-api-key': process.env.VIATOR_API_KEY || ''
        },
        body: JSON.stringify(searchPayload)
      });

      if (!response.ok) {
        console.error(`❌ SearchV2: API request failed with status ${response.status}`);
        const errorText = await response.text();
        console.error(`❌ SearchV2: Error response:`, errorText);
        throw new Error(`Viator API request failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log(`✅ SearchV2: API response received`);
      console.log(`📊 SearchV2: Response structure:`, Object.keys(data));

      // Extract products from response
      const products = data?.products?.results || data?.products || [];
      console.log(`🎯 SearchV2: Extracted ${products.length} products from API response`);

      // Log first product for debugging
      if (products.length > 0) {
        console.log(`🔍 SearchV2: Sample product:`, {
          productCode: products[0].productCode,
          title: products[0].title,
          destination: products[0].destinations?.[0]?.name || 'N/A'
        });
      }

      return products;

    } catch (error) {
      console.error(`❌ SearchV2: Search failed:`, error);

      // Return empty array on error to allow graceful degradation
      return [];
    }
  }

  /**
   * 🧹 CACHE CLEANUP
   */
  clearCache(): void {
    this.cache.clear();
    console.log('🧹 Destination Cache V2 cleared');
  }
}

export const destinationCacheV2 = new DestinationCacheV2();