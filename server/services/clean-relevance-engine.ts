/**
 * 🎯 CLEAN RELEVANCE ENGINE
 * A focused, streamlined approach to activity relevance and geographic accuracy
 */

import axios, { AxiosInstance } from 'axios';

interface ActivityRecommendation {
  id: string;
  title: string;
  description: string;
  imageUrl?: string;
  duration?: string;
  price?: {
    amount: number;
    currency: string;
  } | null;
  rating?: number;
  reviewCount?: number;
  location?: string;
  tags?: string[];
  category?: string;
  productCode?: string;
  destination?: string;
  bookingUrl?: string;
}

interface SearchRequest {
  query: string;
  destinationId?: number;
  destinationName?: string;
  currency?: string;
  limit?: number;
  tags?: number[];
  isAmbiguous?: boolean;
}

interface SearchResponse {
  activities: ActivityRecommendation[];
  confidence: number;
  totalFound: number;
  strategy: string;
}

// Placeholder for the enhanced Viator service to avoid runtime errors if not provided
// In a real scenario, this would be imported and properly configured.
const enhancedViatorService = {
  searchActivitiesOptimized: async (query: string, destinationId: number, options: any): Promise<any[]> => {
    console.warn("Placeholder enhancedViatorService.searchActivitiesOptimized called. This should be replaced with actual implementation.");
    // Simulate fetching some data, or throw an error if this is unexpected
    if (destinationId === 1 && query === "tokyo") { // Mock for Tokyo
      return [
        { id: "T1", title: "Tokyo Skytree Tour", destination: { name: "Tokyo", destinationId: 1 } },
        { id: "T2", title: "Shinjuku Gyoen National Garden Visit", destination: { name: "Tokyo", destinationId: 1 } },
        { id: "T3", title: "Asakusa Walking Tour", destination: { name: "Tokyo", destinationId: 1 } },
      ];
    } else if (destinationId === 479 && query === "paris") { // Mock for Paris
      return [
        { id: "P1", title: "Eiffel Tower Summit Access", destination: { name: "Paris", destinationId: 479 } },
        { id: "P2", title: "Louvre Museum Guided Tour", destination: { name: "Paris", destinationId: 479 } },
      ];
    } else {
      return [];
    }
  }
};


export class CleanRelevanceEngine {
  private axiosInstance: AxiosInstance;
  private cache = new Map<string, { data: SearchResponse; timestamp: number }>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  // Correct destination mapping - using verified Viator destination IDs
  private readonly DESTINATION_MAP: { [key: number]: { name: string; country: string; region: string } } = {
    1: { name: 'tokyo', country: 'japan', region: 'asia' }, // Tokyo, Japan
    334: { name: 'tokyo', country: 'japan', region: 'asia' }, // Tokyo Prefecture (alternative ID)
    479: { name: 'paris', country: 'france', region: 'europe' }, // Paris, France (MAIN ID)
    684: { name: 'paris', country: 'france', region: 'europe' }, // Paris alternative ID
    10: { name: 'paris', country: 'france', region: 'europe' }, // Paris third ID
    50648: { name: 'london', country: 'england', region: 'europe' },
    737: { name: 'london', country: 'uk', region: 'europe' }, // London UK main ID
    706: { name: 'london', country: 'uk', region: 'europe' },
    511: { name: 'rome', country: 'italy', region: 'europe' },
    562: { name: 'barcelona', country: 'spain', region: 'europe' },
    645: { name: 'los angeles', country: 'usa', region: 'north_america' },
    685: { name: 'new york', country: 'usa', region: 'north_america' }
  };

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: 'https://api.viator.com/partner',
      headers: {
        'Accept': 'application/json;version=2.0',
        'Accept-Language': 'en-US', // Required for Viator API
        'Content-Type': 'application/json',
        'exp-api-key': process.env.VIATOR_API_KEY
      },
      timeout: 30000,
      transformRequest: [function (data, headers) {
        // Ensure Accept-Language header is properly set for Viator API
        headers['Accept-Language'] = 'en-US';
        // For GET requests, data is undefined, return as-is
        // For POST requests, ensure data is properly stringified if it's an object
        if (data && typeof data === 'object') {
          return JSON.stringify(data);
        }
        return data;
      }]
    });

    console.log(`🔧 Clean Engine: API Key present: ${!!process.env.VIATOR_API_KEY}`);
  }

  /**
   * 🎯 GET RELEVANT ACTIVITIES - Direct search without complex caching
   */
  async getRelevantActivities(request: {
    destinationId: number;
    destinationName: string;
    searchQuery: string;
    messageText: string;
    limit?: number;
  }): Promise<any[]> {
    console.log(`🎯 GET RELEVANT ACTIVITIES: "${request.searchQuery}" for ${request.destinationName}`);

    try {
      // Use direct product fetch for cleaner results
      const rawProducts = await this.fetchProductsWithDestinationId(
        request.searchQuery,
        request.destinationId,
        'USD'
      );

      console.log(`📊 Fetched ${rawProducts.length} raw products`);

      if (rawProducts.length === 0) {
        return [];
      }

      // Apply geographic filtering
      const geographicallyValid = this.applyMinimalGeographicFiltering(rawProducts, request.destinationName);
      console.log(`🌍 Geographic filtering: ${rawProducts.length} → ${geographicallyValid.length} products`);

      // Apply relevance filtering
      const relevant = this.filterRelevance(geographicallyValid, request.searchQuery, request.destinationName);
      console.log(`🎯 Relevance filtering: ${geographicallyValid.length} → ${relevant.length} products`);

      // Transform and rank (with location bonuses preserved)
      const activities = this.transformAndRank(relevant, request.searchQuery, request.destinationName);
      console.log(`✅ Final ranking: ${activities.length} activities`);

      return activities.slice(0, request.limit || 10);

    } catch (error) {
      console.error(`❌ Get relevant activities error:`, error);
      return [];
    }
  }

  /**
   * 🎯 MAIN SEARCH METHOD V1 (Original Implementation)
   */
  async searchV1(request: SearchRequest): Promise<SearchResponse> {
    console.log(`🎯 CLEAN SEARCH: "${request.query}" for destination ${request.destinationId || request.destinationName}`);
    console.log(`🔑 API Key check: ${process.env.VIATOR_API_KEY ? 'Present' : 'MISSING'}`);

    // Get destination name - either from direct input or by converting ID
    let destinationName: string | null = null;

    if (request.destinationName) {
      destinationName = request.destinationName;
      console.log(`🌍 Using provided destination name: "${destinationName}"`);
    } else if (request.destinationId) {
      destinationName = await this.getDestinationName(request.destinationId);
      if (!destinationName) {
        console.log(`❌ Could not resolve destination ID: ${request.destinationId}`);
        return {
          activities: [],
          confidence: 0,
          totalFound: 0,
          strategy: 'invalid_destination'
        };
      }
      console.log(`🌍 Resolved destination ID ${request.destinationId} to: "${destinationName}"`);
    } else {
      console.log(`❌ No destination ID or name provided`);
      return {
        activities: [],
        confidence: 0,
        totalFound: 0,
        strategy: 'no_destination'
      };
    }

    // Create cache key that includes query to ensure different searches get different results
    // ENHANCED-KEYWORDS-SYNONYMS VERSION - force fresh search with enhanced keyword matching
    const cacheKey = `v5-enhanced-keywords-${request.query.toLowerCase()}-${destinationName.toLowerCase()}-${request.destinationId}-${request.currency}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      console.log(`⚡ CACHE HIT: Returning cached results for ${cacheKey}`);
      return cached;
    }

    // CRITICAL FIX: Clear cache if this is a different search query for same destination
    const destinationCacheKeys = Array.from(this.cache.keys()).filter(key =>
      key.includes(destinationName.toLowerCase()) && !key.includes(request.query.toLowerCase())
    );
    if (destinationCacheKeys.length > 0) {
      console.log(`🧹 CLEARING different search caches for ${destinationName}: ${destinationCacheKeys.length} entries`);
      destinationCacheKeys.forEach(key => this.cache.delete(key));
    }

    try {
      // Step 1: Get raw products from Viator using destination ID (more precise)
      const rawProducts = await this.fetchProductsWithDestinationId(request.query, request.destinationId!, request.currency);
      console.log(`📊 Fetched ${rawProducts.length} raw products`);

      // Step 2: Minimal geographic filtering (since we used destination ID in API call)
      const geographicallyValid = this.applyMinimalGeographicFiltering(rawProducts, destinationName);
      console.log(`🌍 Geographic filtering: ${rawProducts.length} → ${geographicallyValid.length} products`);

      // Step 3: Apply relevance filtering
      const relevant = this.filterRelevance(geographicallyValid, request.query, destinationName);
      console.log(`🎯 Relevance filtering: ${geographicallyValid.length} → ${relevant.length} products`);

      // Step 4: Transform and rank (with location bonuses preserved)
      const activities = this.transformAndRank(relevant, request.query, destinationName);
      console.log(`✅ Final ranking: ${activities.length} activities`);

      // Step 5: Calculate confidence
      const confidence = this.calculateConfidence(activities, request.query);

      const result: SearchResponse = {
        activities: activities.slice(0, Math.min(request.limit || 10, 10)),
        confidence,
        totalFound: activities.length,
        strategy: 'clean-relevance-name-based'
      };

      this.setCache(cacheKey, result);
      return result;

    } catch (error) {
      console.error(`❌ Clean engine search error:`, (error as any)?.response?.data || (error instanceof Error ? error.message : String(error)));
      return {
        activities: [],
        confidence: 0,
        totalFound: 0,
        strategy: 'error'
      };
    }
  }

  /**
   * 🎯 MAIN SEARCH METHOD V2 (New Development Path)
   */
  async searchV2(request: SearchRequest): Promise<SearchResponse> {
    // TODO: Implement new search logic here
    // For now, this is empty and ready for development
    console.log(`🎯 SEARCH V2: Starting new search implementation for "${request.query}"`);
    
    return {
      activities: [],
      confidence: 0,
      totalFound: 0,
      strategy: 'searchV2-not-implemented'
    };
  }

  /**
   * 🎯 MAIN SEARCH METHOD (Delegates to V1 for now)
   */
  async search(request: SearchRequest): Promise<SearchResponse> {
    // Currently delegating to V1, switch to V2 when ready
    return this.searchV1(request);
  }

  /**
   * 🏷️ GET DESTINATION NAME FROM ID
   */
  private async getDestinationName(destinationId: number): Promise<string | null> {
    try {
      // Dynamically import auxiliaryDataManager to avoid circular dependencies or issues
      const { auxiliaryDataManager } = await import('./auxiliary-data-manager');
      const destinations = await auxiliaryDataManager.getDestinations();

      const destination = destinations.find(dest =>
        dest.id === destinationId || (dest as any).destinationId === destinationId
      );

      if (destination) {
        const name = destination.name || (destination as any).destinationName;
        console.log(`✅ Resolved destination ID ${destinationId} to name: "${name}"`);
        return name;
      }

      // Fallback to our destination map
      const mappedDestination = this.DESTINATION_MAP[destinationId];
      if (mappedDestination) {
        const capitalizedName = mappedDestination.name.charAt(0).toUpperCase() + mappedDestination.name.slice(1);
        console.log(`✅ Using mapped destination: "${capitalizedName}" for ID ${destinationId}`);
        return capitalizedName;
      }

      console.log(`❌ Could not resolve destination ID ${destinationId}`);
      return null;
    } catch (error) {
      console.error('Error resolving destination name:', error);
      return null;
    }
  }

  /**
   * 🎯 FETCH PRODUCTS USING COMPREHENSIVE SEARCH ENGINE
   */
  private async fetchProductsWithDestinationId(query: string, destinationId: number, currency = 'USD'): Promise<any[]> {
    console.log(`🎯 COMPREHENSIVE SEARCH: "${query}" in destination ${destinationId}`);

    try {
      // Get destination name
      const destinationName = await this.getDestinationName(destinationId);
      if (!destinationName) {
        console.log(`❌ Could not resolve destination name for ID ${destinationId}`);
        return [];
      }

      // Import and use comprehensive search engine
      const { comprehensiveSearchEngine } = await import('./comprehensive-search-engine');
      
      const products = await comprehensiveSearchEngine.executeComprehensiveSearch({
        query,
        destinationId,
        destinationName,
        maxResults: 50,
        currency
      });

      console.log(`✅ COMPREHENSIVE SEARCH: Retrieved ${products.length} relevant products`);
      
      // Log strategy breakdown
      if (products.length > 0) {
        const strategyBreakdown = products.reduce((acc, product) => {
          const strategy = product._searchStrategy || 'unknown';
          acc[strategy] = (acc[strategy] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);
        
        console.log(`📊 Strategy breakdown:`, strategyBreakdown);
      }

      return products;

    } catch (error) {
      console.error(`❌ Comprehensive search failed:`, error);
      
      // Fallback to original method
      console.log(`🔄 Falling back to original search method`);
      return this.fetchProductsWithDestinationIdOriginal(query, destinationId, currency);
    }
  }

  /**
   * 🔄 ORIGINAL SEARCH METHOD (FALLBACK)
   */
  private async fetchProductsWithDestinationIdOriginal(query: string, destinationId: number, currency = 'USD'): Promise<any[]> {
    console.log(`🎯 FALLBACK: Original destination-specific search for "${query}" in destination ${destinationId}`);

    try {
      let products: any[] = [];

      // Import the viator service to use its properly configured axios instance
      const { viatorService } = await import('./viator');

      const destinationSearchResponse = await viatorService.axiosInstance.post('/products/search', {
        filtering: {
          destination: destinationId.toString(),
          includeAutomaticTranslations: true
        },
        sorting: {
          sort: "DEFAULT",
          order: "DESCENDING"
        },
        pagination: {
          start: 1,
          count: 30
        },
        currency: currency
      });

      if (destinationSearchResponse.data?.products) {
        products = destinationSearchResponse.data.products;
        
        // Apply basic keyword filtering
        const queryKeywords = query.toLowerCase().split(/\s+/).filter(word => word.length > 2);
        const keywordFilteredProducts = products.filter(product => {
          const content = `${product.title || ''} ${product.description || ''} ${product.shortDescription || ''}`.toLowerCase();
          return queryKeywords.some(keyword => content.includes(keyword));
        });

        console.log(`🔄 FALLBACK: ${products.length} → ${keywordFilteredProducts.length} products after keyword filtering`);
        return keywordFilteredProducts;
      }

      return [];

    } catch (error) {
      console.error(`❌ Fallback search also failed:`, error);
      return [];
    }
  }

  /**
   * 🔍 VALIDATE DESTINATION ID AGAINST CACHED VIATOR DATA
   */
  private async validateDestinationId(destinationId: number): Promise<number | null> {
    try {
      // Dynamically import auxiliaryDataManager to avoid circular dependencies or issues
      const { auxiliaryDataManager } = await import('./auxiliary-data-manager');
      const destinations = await auxiliaryDataManager.getDestinations();

      console.log(`🔍 Validating destination ID ${destinationId} against ${destinations.length} cached destinations`);

      const validDestination = destinations.find(dest =>
        dest.id === destinationId ||
        (dest as any).destinationId === destinationId
      );

      if (validDestination) {
        const destName = validDestination.name || (validDestination as any).destinationName;
        console.log(`✅ Validated destination: ${destName} (ID: ${destinationId})`);

        // Additional validation - ensure destination matches expected location based on our map
        const expectedLocation = this.DESTINATION_MAP[destinationId];
        if (expectedLocation) {
          const destNameLower = destName.toLowerCase();
          if (!destNameLower.includes(expectedLocation.name)) {
            console.log(`⚠️ Destination name mismatch: Expected "${expectedLocation.name}" but got "${destName}" for ID ${destinationId}`);

            // Try to find the correct destination by name from our map using the provided ID
            const correctDestination = destinations.find(dest => {
              const name = (dest.name || (dest as any).destinationName || '').toLowerCase();
              return name.includes(expectedLocation.name) && name.includes(expectedLocation.country);
            });

            if (correctDestination) {
              const correctedId = correctDestination.id || (correctDestination as any).destinationId;
              console.log(`🔄 Using corrected destination for ID ${destinationId}: ${correctDestination.name} (ID: ${correctedId})`);
              return correctedId;
            } else {
              console.log(`❌ Could not find corrected destination for ${expectedLocation.name}, ${expectedLocation.country}`);
            }
          }
        }

        return destinationId; // Return original ID if no issues found or no alternative mapping
      } else {
        console.log(`❌ Destination ID ${destinationId} not found directly in cached Viator destinations`);

        // Try to find alternative destination IDs for known cities based on our map
        const expectedLocation = this.DESTINATION_MAP[destinationId];
        if (expectedLocation) {
          console.log(`🔍 Searching for alternative destination for ${expectedLocation.name}, ${expectedLocation.country}`);

          const alternative = destinations.find(dest => {
            const name = (dest.name || (dest as any).destinationName || '').toLowerCase();
            // Match by name and either country or region for broader matching
            return name.includes(expectedLocation.name) &&
                   (name.includes(expectedLocation.country) || name.includes(expectedLocation.region));
          });

          if (alternative) {
            const altId = alternative.id || (alternative as any).destinationId;
            console.log(`🔄 Found alternative destination for ${destinationId}: ${alternative.name} (ID: ${altId})`);
            return altId;
          } else {
            console.log(`❌ No alternative destination found for ${expectedLocation.name}`);
          }
        }

        return null; // Return null if ID not found and no alternative could be mapped
      }
    } catch (error) {
      console.error('Error validating destination ID:', error);
      return null; // Do not fallback, force proper validation or fail gracefully
    }
  }

  /**
   * 🌐 FETCH PRODUCTS FROM VIATOR
   */
  private async fetchProducts(request: SearchRequest): Promise<any[]> {
    console.log(`🔍 CLEAN ENGINE: Fetching products for destination ${request.destinationId} with query "${request.query}"`);

    // CRITICAL: Use multiple search strategies to ensure location accuracy
    const searchStrategies = [
      // Strategy 1: Destination-constrained freetext search (often more precise)
      {
        name: 'destination_constrained',
        endpoint: '/search/freetext',
        params: {
          searchTerm: request.query,
          searchTypes: [
            {
              searchType: 'PRODUCTS',
              pagination: { start: 1, count: 30 } // Fetch a reasonable number of initial results
            }
          ],
          currency: request.currency || 'USD',
          filtering: {
            destination: request.destinationId // This is the key parameter to test
          }
        }
      },
      // Strategy 2: Products search with destination filter (alternative endpoint)
      {
        name: 'products_search',
        endpoint: '/products/search',
        params: {
          destId: request.destinationId, // Another way to specify destination
          searchTerm: request.query,
          pageSize: 20,
          currency: request.currency || 'USD'
        }
      }
    ];

    let allProducts: any[] = [];

    for (const strategy of searchStrategies) {
      try {
        console.log(`🎯 Trying search strategy: ${strategy.name}`);
        // console.log(`🌐 API Request Params:`, JSON.stringify(strategy.params, null, 2)); // Verbose logging

        const response = await this.axiosInstance.post(strategy.endpoint, strategy.params);

        // console.log(`🔍 ${strategy.name} response status: ${response.status}`); // Verbose logging

        let products: any[] = [];
        if (response.data?.products?.results) {
          products = response.data.products.results;
        } else if (response.data?.data) {
          products = response.data.data;
        } else if (Array.isArray(response.data)) {
          products = response.data;
        }

        console.log(`📊 ${strategy.name}: Retrieved ${products.length} products`);

        if (products.length > 0) {
          // Log sample product for debugging
          // const sample = products[0];
          // console.log(`🔍 Sample from ${strategy.name}: "${sample.title}" - destinations:`, sample.destinations);

          // Add strategy metadata to products for potential analysis later
          products.forEach(product => {
            product._searchStrategy = strategy.name;
          });

          allProducts.push(...products);
        }

        // Heuristic: If we get a good number of results from the destination-constrained search,
        // we can potentially break early to prioritize more accurate results.
        if (strategy.name === 'destination_constrained' && products.length >= 10) {
          console.log(`✅ Good results from destination-constrained search, prioritizing these.`);
          break;
        }

      } catch (error) {
        console.error(`❌ ${strategy.name} search failed:`, (error as any)?.response?.data || (error instanceof Error ? error.message : String(error)));
        // Continue to the next strategy if one fails
      }
    }

    // Remove duplicates based on product code or ID
    const uniqueProducts = [];
    const seenCodes = new Set<string>();

    for (const product of allProducts) {
      const code = product.productCode || product.id;
      if (code && !seenCodes.has(code)) {
        seenCodes.add(code);
        uniqueProducts.push(product);
      }
    }

    console.log(`📊 Total unique products after deduplication: ${uniqueProducts.length}`);
    return uniqueProducts;
  }

  /**
   * 🌍 APPLY STRICT GEOGRAPHIC FILTERING
   */
  private applyMinimalGeographicFiltering(products: any[], destinationName: string): any[] {
    console.log(`🌍 Applying STRICT filtering for destination: "${destinationName}"`);

    const destLower = destinationName.toLowerCase();
    let requiredTerms: string[] = [];
    let forbiddenTerms: string[] = [];

    // TOKYO-SPECIFIC FILTERING
    if (destLower.includes('tokyo')) {
      requiredTerms = ['tokyo', 'japan', 'japanese', 'shibuya', 'shinjuku', 'harajuku', 'ginza', 'akihabara', 'tsukiji', 'asakusa', 'roppongi'];
      forbiddenTerms = [
        'kuala lumpur', 'malaysia', 'bangkok', 'thailand', 'singapore', 'hong kong', 'seoul', 'korea',
        'manila', 'philippines', 'jakarta', 'indonesia', 'vietnam', 'cambodia', 'myanmar', 'laos',
        'delhi', 'mumbai', 'india', 'dubai', 'abu dhabi', 'qatar', 'saudi arabia', 'taiwan', 'china', 'beijing', 'shanghai'
      ];
    }
    // HAWAII-SPECIFIC FILTERING
    else if (destLower.includes('hawaii') || destLower.includes('kona') || destLower.includes('maui') || destLower.includes('honolulu') || destLower.includes('oahu')) {
      requiredTerms = ['hawaii', 'kona', 'maui', 'honolulu', 'oahu', 'hilo', 'big island', 'kauai', 'lanai', 'molokai', 'aloha', 'pacific'];
      forbiddenTerms = [
        'dubai', 'morocco', 'thailand', 'bali', 'indonesia', 'moorea', 'tahiti', 'fiji', 'maldives', 'caribbean',
        'florida', 'california', 'mexico', 'costa rica', 'barbados', 'jamaica', 'puerto rico',
        'australia', 'new zealand', 'philippines', 'malaysia', 'vietnam', 'cambodia', 'sri lanka',
        'turkey', 'greece', 'spain', 'italy', 'france', 'egypt', 'jordan', 'oman', 'qatar',
        'krabi', 'phuket', 'curacao', 'aruba', 'dominican republic', 'bahamas', 'bermuda', 'kuala lumpur'
      ];
    }
    // PARIS-SPECIFIC FILTERING
    else if (destLower.includes('paris')) {
      requiredTerms = ['paris', 'france', 'french', 'louvre', 'eiffel', 'seine', 'montmartre', 'versailles'];
      forbiddenTerms = [
        'tokyo', 'japan', 'kuala lumpur', 'malaysia', 'bangkok', 'thailand', 'singapore',
        'london', 'rome', 'barcelona', 'madrid', 'berlin', 'amsterdam', 'brussels'
      ];
    }
    // LONDON-SPECIFIC FILTERING
    else if (destLower.includes('london')) {
      requiredTerms = ['london', 'england', 'uk', 'britain', 'thames', 'westminster', 'tower bridge'];
      forbiddenTerms = [
        'tokyo', 'japan', 'kuala lumpur', 'malaysia', 'bangkok', 'thailand', 'singapore',
        'paris', 'france', 'rome', 'italy', 'barcelona', 'spain'
      ];
    }

    return products.filter(product => {
      const title = (product.title || '').toLowerCase();
      const description = (product.shortDescription || product.description || '').toLowerCase();
      const content = `${title} ${description}`;

      // STRICT: Check for forbidden terms (immediate exclusion)
      for (const forbidden of forbiddenTerms) {
        if (content.includes(forbidden)) {
          console.log(`🚫 STRICT: Geographic mismatch - "${product.title}" contains forbidden location "${forbidden}"`);
          return false;
        }
      }

      // STRICT: For specific destinations, require evidence
      if (requiredTerms.length > 0) {
        const hasRequiredTerm = requiredTerms.some(term => content.includes(term));

        if (hasRequiredTerm) {
          console.log(`✅ STRICT: Geographic match - "${product.title}" contains required location term`);
          return true;
        }

        // Check destinations array for location evidence
        if (product.destinations && Array.isArray(product.destinations)) {
          const productDestinations = product.destinations.map((d: any) => (d.name || d.destinationName || '').toLowerCase());
          const hasDestinationMatch = productDestinations.some((dest: string) =>
            requiredTerms.some(term => dest.includes(term))
          );
          if (hasDestinationMatch) {
            console.log(`✅ STRICT: Destination array match - "${product.title}" has correct destination`);
            return true;
          }
        }

        // For major destinations, require explicit location evidence
        console.log(`🚫 STRICT: No location evidence - "${product.title}" lacks required location terms for ${destinationName}`);
        return false;
      }

      // Default: allow if no specific filtering rules
      return true;
    });
  }

  /**
   * 🚫 LEGACY: FILTER GEOGRAPHIC MISMATCHES BY DESTINATION NAME (STRICT)
   */
  private filterGeographicMismatchesByName(products: any[], destinationName: string): any[] {
    const destinationLower = destinationName.toLowerCase();
    console.log(`🌍 Filtering for destination: "${destinationName}"`);

    // Extract key location info from destination name
    let targetCity = '';
    let targetCountry = '';

    // Handle "City, Country" format
    if (destinationName.includes(',')) {
      const parts = destinationName.split(',').map(p => p.trim());
      targetCity = parts[0].toLowerCase();
      targetCountry = parts[1].toLowerCase();
    } else {
      // Single name - check our mappings
      targetCity = destinationLower;
      const mapping = Object.values(this.DESTINATION_MAP).find(m => m.name === destinationLower);
      if (mapping) {
        targetCountry = mapping.country;
      }
    }

    console.log(`🎯 Target location: city="${targetCity}", country="${targetCountry}"`);

    return products.filter(product => {
      const title = (product.title || '').toLowerCase();
      const description = (product.shortDescription || product.description || '').toLowerCase();
      const content = `${title} ${description}`;

      // 1. PERMISSIVE: Allow activities that mention the target location anywhere
      const hasTargetLocation = content.includes(targetCity) ||
                               content.includes(destinationLower) ||
                               (targetCountry && content.includes(targetCountry));

      if (!hasTargetLocation) {
        console.log(`🚫 Location mismatch: "${product.title}" - doesn't contain "${targetCity}" or "${destinationLower}"`);
        return false;
      }

      // 2. TRUST TITLE OVER METADATA: If title contains location, that's sufficient
      if (title.includes(targetCity) || title.includes(destinationLower) ||
          (targetCountry && title.includes(targetCountry))) {
        // Title clearly mentions the target location - trust it
        return true;
      }

      // 3. CHECK DESTINATIONS ONLY IF TITLE DOESN'T CONTAIN LOCATION
      if (product.destinations && Array.isArray(product.destinations)) {
        const productDestinations = product.destinations.map((d: any) => ({
          name: (d.name || d.destinationName || '').toLowerCase(),
        }));

        const hasMatchingDestination = productDestinations.some((dest: { name: string }) =>
          dest.name.includes(targetCity) ||
          dest.name.includes(destinationLower) ||
          (targetCountry && dest.name.includes(targetCountry))
        );

        if (!hasMatchingDestination) {
          console.log(`🚫 Destination mismatch: "${product.title}" destinations don't match "${destinationName}"`);
          return false;
        }
      }

      return true;
    });
  }

  /**
   * 🚫 FILTER GEOGRAPHIC MISMATCHES (Legacy method using destination ID)
   */
  private filterGeographicMismatches(products: any[], destinationId: number): any[] {
    const destination = this.DESTINATION_MAP[destinationId];
    if (!destination) {
      console.log(`⚠️ Unknown destination ID: ${destinationId} for geographic filtering, allowing all products.`);
      return products;
    }

    console.log(`🌍 Filtering for destination: ${destination.name}, ${destination.country} (region: ${destination.region})`);

    // Define forbidden terms based on region to exclude unrelated content
    const FORBIDDEN_TERMS: { [region: string]: string[] } = {
      asia: [
        'charleston', 'south carolina', 'hilton head', 'myrtle beach', 'savannah', 'atlanta', 'miami', 'florida', 'california',
        'ontario canada', 'london ontario', 'quebec', 'canada', 'toronto', 'montreal', 'vancouver',
        'jamaica', 'montego bay', 'bahamas', 'cancun', 'mexico', 'costa rica', 'central america',
        'namibia', 'walvis bay', 'swakopmund', 'sandwich harbour', 'cape town', 'durban',
        'africa', 'south africa', 'botswana', 'zimbabwe', 'zambia', 'kenya', 'tanzania', 'egypt',
        'windhoek', 'katutura', 'etosha', 'sossusvlei', 'pelican point', 'kruger national park', 'victoria falls',
        'australia', 'sydney', 'melbourne', 'new zealand'
      ],
      europe: [
        'charleston', 'south carolina', 'hilton head', 'myrtle beach', 'savannah', 'atlanta', 'miami', 'florida', 'california', 'texas', 'new york', 'los angeles',
        'ontario canada', 'london ontario', 'quebec', 'canada', 'toronto', 'montreal', 'vancouver',
        'jamaica', 'montego bay', 'bahamas', 'cancun', 'mexico', 'costa rica', 'central america',
        'namibia', 'walvis bay', 'swakopmund', 'sandwich harbour', 'cape town', 'durban',
        'africa', 'south africa', 'botswana', 'zimbabwe', 'zambia', 'kenya', 'tanzania', 'egypt',
        'windhoek', 'katutura', 'etosha', 'sossusvlei', 'pelican point', 'kruger national park', 'victoria falls',
        'japan', 'china', 'tokyo', 'shanghai', 'beijing', 'bangkok', 'asia'
      ],
      north_america: [
        'namibia', 'walvis bay', 'swakopmund', 'sandwich harbour', 'cape town',
        'africa', 'south africa', 'botswana', 'zimbabwe', 'zambia', 'kenya', 'tanzania', 'egypt',
        'windhoek', 'katutura', 'etosha', 'sossusvlei', 'pelican point', 'kruger national park', 'victoria falls',
        'paris france', 'london uk', 'rome italy', 'barcelona spain', 'europe', 'asia', 'japan', 'china', 'tokyo', 'shanghai'
      ]
    };

    // Required terms for specific destinations to ensure relevance
    const REQUIRED_TERMS: { [key: string]: string[] } = {
      paris: ['paris', 'france', 'french', 'louvre', 'eiffel', 'seine', 'montmartre', 'latin quarter', 'champs-élysées'],
      tokyo: ['tokyo', 'japan', 'japanese', 'shibuya', 'shinjuku', 'harajuku', 'ginza', 'akihabara', 'edo'],
      london: ['london', 'england', 'british', 'uk', 'thames', 'westminster', 'tower bridge', 'covent garden'],
      rome: ['rome', 'italy', 'italian', 'vatican', 'colosseum', 'trevi fountain', 'spanish steps', 'roman'],
      barcelona: ['barcelona', 'spain', 'catalan', 'sagrada familia', 'gaudi', 'las ramblas', 'gothic quarter']
    };

    const forbidden = FORBIDDEN_TERMS[destination.region] || [];
    const required = REQUIRED_TERMS[destination.name] || [];

    return products.filter(product => {
      const title = (product.title || '').toLowerCase();
      const description = (product.shortDescription || product.description || '').toLowerCase();
      const content = `${title} ${description}`;

      // 1. Check for forbidden geographic terms (STRICT)
      for (const term of forbidden) {
        if (content.includes(term)) {
          // console.log(`🚫 Geographic mismatch: "${product.title}" contains forbidden term "${term}"`);
          return false;
        }
      }

      // 2. For specific destinations, require at least one matching term
      if (required.length > 0) {
        const hasRequiredTerm = required.some(term => content.includes(term));
        if (!hasRequiredTerm) {
          // console.log(`🚫 Location validation failed: "${product.title}" - no required terms found for ${destination.name}`);
          return false;
        }
      }

      // 3. STRICT: Check product's own destination data
      if (product.destinations && Array.isArray(product.destinations)) {
        const productDestinations = product.destinations.map((d: any) => ({
          name: (d.name || d.destinationName || '').toLowerCase(),
          id: d.destinationId || d.id
        }));

        // console.log(`🔍 Product destinations for "${product.title}":`, productDestinations.map(d => `${d.name} (${d.id})`).join(', '));

        // Ensure at least one product destination matches our target destination ID or name/country
        const hasExactDestinationMatch = productDestinations.some((dest: { name: string; id: any }) =>
          dest.id === destinationId || // Direct ID match
          (dest.name.includes(destination.name) && dest.name.includes(destination.country)) // Name/Country match
        );

        // Broader check: if no exact match, check if any destination is geographically related (e.g., same country/region)
        const hasGeographicMatch = productDestinations.some((dest: { name: string }) =>
          dest.name.includes(destination.name) || dest.name.includes(destination.country)
        );

        if (!hasExactDestinationMatch && !hasGeographicMatch) {
          // console.log(`🚫 STRICT destination mismatch: "${product.title}" destinations [${productDestinations.map(d => d.name).join(', ')}] don't match ${destination.name}, ${destination.country}`);
          return false;
        }

        // Additional check: ensure no forbidden regions appear in product's destinations
        const hasForbiddenDestinationRegion = productDestinations.some((dest: { name: string }) => {
          const destRegions = [
            this.getRegionFromDestinationName(dest.name), // Try to infer region from name
            // Potentially add more sophisticated region mapping if available
          ].filter((r): r is string => Boolean(r)); // Filter out null/undefined regions

          return destRegions.some(region => forbidden.includes(region));
        });

        if (hasForbiddenDestinationRegion) {
          // console.log(`🚫 Forbidden region in product destinations for "${product.title}"`);
          return false;
        }
      } else {
        // If no destination data is available in the product, and we require it (specific search), reject.
        if (destination && (required.length > 0 || destination.name === 'tokyo')) { // Example: Tokyo requires destination data
          // console.log(`⚠️ No destination data available for "${product.title}" - rejecting for location-specific search.`);
          return false;
        }
      }

      // 4. Filter out overly broad or irrelevant tours
      const BROAD_TOUR_INDICATORS = [
        '15-day', '12-day', '10-day', '11-day', '16-day', 'multi-day', 'week-long', 'long weekend',
        'all inclusive', 'comprehensive tour', 'grand tour', 'discover japan tour', 'explore japan',
        'helicopter tour', 'luxury helicopter', 'private jet', 'wedding reception', 'business trip',
        'city pass', 'hop-on hop-off' // These might be too generic for specific searches
      ];

      for (const indicator of BROAD_TOUR_INDICATORS) {
        if (content.includes(indicator)) {
          // console.log(`🎯 Broad tour filtered: "${product.title}" - too broad`);
          return false;
        }
      }

      // console.log(`✅ Geographic validation passed: "${product.title}"`);
      return true;
    });
  }

  /**
   * 🎯 ENHANCED RELEVANCE FILTERING - COMPREHENSIVE ACTIVITY MATCHING
   */
  private filterRelevance(products: any[], query: string, destinationName?: string): any[] {
    const queryLower = query.toLowerCase();
    console.log(`🎯 RELEVANCE FILTER: Processing ${products.length} products for query "${query}"`);

    // Determine primary activity category from query with weighted scoring
    let primaryCategory = null;
    let categoryConfidence = 0;

    const ACTIVITY_CATEGORIES = {
      food_culinary: {
        primary: ['food', 'culinary', 'cuisine', 'cooking', 'tasting', 'chef', 'restaurant', 'market', 'gastronomy', 'dining', 'meal', 'eat'],
        contextual: ['michelin', 'authentic', 'local', 'traditional', 'gourmet', 'artisanal', 'farm-to-table', 'street food'],
        semantic: ['flavor', 'dish', 'recipe', 'kitchen', 'spices', 'ingredients', 'wine pairing'],
        quality_indicators: ['master chef', 'award-winning', 'signature dish', 'culinary expert'],
        base_score: 65,
        title_multiplier: 2.0,
        description_multiplier: 1.0
      },
      water_activities: {
        primary: ['boat', 'sailing', 'yacht', 'cruise', 'catamaran', 'ferry', 'maritime', 'nautical', 'snorkeling', 'diving', 'kayaking', 'fishing', 'angling', 'charter'],
        contextual: ['private', 'luxury', 'sunset', 'swimming', 'dolphin', 'whale watching', 'island hopping', 'deep sea', 'sport fishing', 'big game'],
        semantic: ['sea', 'ocean', 'water', 'harbor', 'captain', 'marine life', 'coral reef', 'catch', 'rod', 'reel', 'bait', 'tackle'],
        quality_indicators: ['licensed captain', 'small group', 'professional crew', 'safety certified', 'experienced guide', 'fishing gear included'],
        base_score: 75,
        title_multiplier: 2.2,
        description_multiplier: 1.1
      },
      cultural_heritage: {
        primary: ['museum', 'gallery', 'art', 'exhibition', 'collection', 'cultural', 'heritage', 'temple', 'palace', 'castle'],
        contextual: ['guided', 'expert', 'exclusive', 'private', 'masterpiece', 'ancient', 'historical'],
        semantic: ['artifact', 'sculpture', 'painting', 'history', 'architecture', 'civilization'],
        quality_indicators: ['expert guide', 'skip-the-line', 'exclusive access', 'art historian'],
        base_score: 55,
        title_multiplier: 1.8,
        description_multiplier: 1.2
      },
      adventure_outdoor: {
        primary: ['adventure', 'hiking', 'outdoor', 'nature', 'wildlife', 'extreme', 'safari', 'volcano', 'mountain'],
        contextual: ['scenic', 'thrilling', 'unique', 'adrenaline', 'breathtaking', 'panoramic'],
        semantic: ['wilderness', 'trail', 'expedition', 'active', 'natural habitat', 'ecosystem'],
        quality_indicators: ['certified guide', 'safety equipment', 'professional instructor', 'eco-friendly'],
        base_score: 60,
        title_multiplier: 1.9,
        description_multiplier: 1.0
      },
      tours_sightseeing: {
        primary: ['tour', 'guided', 'walking', 'sightseeing', 'explore', 'excursion', 'journey', 'visit'],
        contextual: ['private', 'expert', 'local', 'insider', 'small group', 'comprehensive', 'highlights'],
        semantic: ['guide', 'discover', 'experience', 'landmarks', 'attractions', 'storytelling'],
        quality_indicators: ['local expert', 'personalized', 'intimate group', 'insider knowledge'],
        base_score: 45,
        title_multiplier: 1.5,
        description_multiplier: 1.1
      }
    };

    for (const [category, data] of Object.entries(ACTIVITY_CATEGORIES)) {
      const primaryMatches = data.primary.filter((keyword: string) => queryLower.includes(keyword)).length;
      const contextualMatches = data.contextual.filter((keyword: string) => queryLower.includes(keyword)).length;
      const semanticMatches = data.semantic.filter((keyword: string) => queryLower.includes(keyword)).length;

      const totalKeywords = data.primary.length + data.contextual.length + data.semantic.length;
      const totalMatches = primaryMatches + contextualMatches + semanticMatches;

      // Weight primary matches more heavily
      let confidence = (primaryMatches * 2 + contextualMatches * 1.5 + semanticMatches) / (totalKeywords * 1.5);

      if (confidence > categoryConfidence) {
        categoryConfidence = confidence;
        primaryCategory = category;
      }
    }

    console.log(`🎯 Primary category detected: ${primaryCategory} (confidence: ${categoryConfidence.toFixed(2)})`);

    const filtered = products.filter(product => {
      const title = (product.title || '').toLowerCase();
      const description = (product.shortDescription || product.description || '').toLowerCase();
      const content = `${title} ${description}`;

      // CATEGORY-SPECIFIC FILTERING: Apply strict filtering based on search intent
      const searchIntent = this.detectSearchIntent(queryLower);

      if (searchIntent === 'food_tours') {
        const foodTerms = ['food', 'culinary', 'cuisine', 'cooking', 'tasting', 'chef', 'restaurant', 'market', 'gastronomy', 'dining', 'meal', 'eat', 'sushi', 'ramen', 'sake', 'izakaya', 'street food', 'fish market', 'tsukiji', 'toyosu'];
        const hasFoodTerms = foodTerms.some(term => content.includes(term));

        if (!hasFoodTerms) {
          console.log(`🚫 FOOD TOUR FILTER: "${product.title}" - missing food-related terms for food tour search`);
          return false;
        }

        console.log(`🍽️ FOOD TOUR MATCH: "${product.title}" - contains food-related terms`);
      }

      if (searchIntent === 'cultural_historical') {
        // For ninja/samurai/cultural searches, exclude food activities unless they're cultural dining
        const foodActivities = ['food tour', 'culinary tour', 'tasting tour', 'cooking class', 'food experience', 'dining experience', 'tapas tour', 'wine tour'];
        const culturalDining = ['traditional', 'cultural', 'geisha', 'authentic', 'ceremonial'];

        const isFoodActivity = foodActivities.some(term => content.includes(term));
        const isCulturalDining = culturalDining.some(term => content.includes(term));

        if (isFoodActivity && !isCulturalDining) {
          console.log(`🚫 CULTURAL FILTER: "${product.title}" - excluding non-cultural food activity from cultural search`);
          return false;
        }
      }

      if (searchIntent === 'museums') {
        const foodActivities = ['food tour', 'culinary tour', 'tasting tour', 'cooking class', 'food experience', 'dining experience', 'tapas tour', 'wine tour'];
        const isFoodActivity = foodActivities.some(term => content.includes(term));

        if (isFoodActivity) {
          console.log(`🚫 MUSEUM FILTER: "${product.title}" - excluding food activity from museum search`);
          return false;
        }
      }

      // STRICT CATEGORY MATCHING: If we detected a specific category, enforce it
      if (primaryCategory && categoryConfidence > 0.3) {
        const categoryData = (ACTIVITY_CATEGORIES as any)[primaryCategory];

        // Check for matches across all keyword types
        const primaryMatches = categoryData.primary.filter((keyword: string) =>
          content.includes(keyword)
        ).length;

        const contextualMatches = categoryData.contextual.filter((keyword: string) =>
          content.includes(keyword)
        ).length;

        const semanticMatches = categoryData.semantic.filter((keyword: string) =>
          content.includes(keyword)
        ).length;

        const totalKeywords = categoryData.primary.length + categoryData.contextual.length + categoryData.semantic.length;
        const weightedMatches = primaryMatches * 2 + contextualMatches * 1.5 + semanticMatches;
        const categoryRelevance = weightedMatches / (totalKeywords * 1.5);

        // For food tours, be even more strict
        if (primaryCategory === 'food_culinary' && categoryConfidence > 0.5) {
          if (categoryRelevance < 0.2) {
            console.log(`🚫 STRICT FOOD FILTER: "${product.title}" - insufficient food relevance (${categoryRelevance.toFixed(3)})`);
            return false;
          }
        }

        // For high-confidence category detection, require strong category alignment
        if (categoryConfidence > 0.7 && categoryRelevance < 0.15) {
          console.log(`🚫 CATEGORY MISMATCH: "${product.title}" - doesn't match ${primaryCategory} category`);
          return false;
        }

        // For medium-confidence detection, require some category alignment
        if (categoryConfidence > 0.3 && categoryRelevance < 0.05) {
          console.log(`🚫 WEAK CATEGORY MATCH: "${product.title}" - minimal ${primaryCategory} relevance`);
          return false;
        }
      }

      // CALCULATE COMPREHENSIVE RELEVANCE SCORE
      let relevanceScore = 0;
      const queryTerms = queryLower.split(' ').filter(term => term.length > 2);

      // 1. Direct query term matching (40% weight)
      let directMatches = 0;
      for (const term of queryTerms) {
        if (title.includes(term)) directMatches += 2; // Title matches worth more
        if (description.includes(term)) directMatches += 1;
      }
      relevanceScore += (directMatches / (queryTerms.length * 3)) * 0.4;

      // 2. Category alignment score (35% weight)
      if (primaryCategory) {
        const categoryData = (ACTIVITY_CATEGORIES as any)[primaryCategory];
        const primaryMatches2 = categoryData.primary.filter((keyword: string) => content.includes(keyword)).length;
        const contextualMatches2 = categoryData.contextual.filter((keyword: string) => content.includes(keyword)).length;
        const semanticMatches2 = categoryData.semantic.filter((keyword: string) => content.includes(keyword)).length;

        const totalKeywords2 = categoryData.primary.length + categoryData.contextual.length + categoryData.semantic.length;
        const categoryScore = (primaryMatches2 * 2 + contextualMatches2 * 1.5 + semanticMatches2) / (totalKeywords2 * 1.5);
        relevanceScore += categoryScore * 0.35;
      }

      // 3. Semantic quality indicators (20% weight)
      const qualityIndicators = [
        'experience', 'tour', 'activity', 'adventure', 'guided', 'professional',
        'certified', 'equipment included', 'small group', 'private'
      ];
      const qualityMatches = qualityIndicators.filter(indicator => content.includes(indicator)).length;
      relevanceScore += (qualityMatches / qualityIndicators.length) * 0.2;

      // 4. Location preference bonus for Hawaii searches (15% weight)
      if (destinationName && destinationName.toLowerCase().includes('hawaii')) {
        const hawaiiTerms = ['hawaii', 'kona', 'maui', 'honolulu', 'oahu', 'hilo', 'big island', 'kauai', 'waikiki', 'aloha'];
        const locationBonus = hawaiiTerms.filter(term => content.includes(term)).length;
        if (locationBonus > 0) {
          relevanceScore += 0.3; // Major bonus for Hawaii-specific activities
          console.log(`🏝️ Hawaii location bonus applied to "${product.title}": +0.3 (found ${locationBonus} Hawaii terms)`);
        }
      }

      // DYNAMIC THRESHOLD BASED ON CATEGORY CONFIDENCE
      // For food tours, use higher threshold to ensure quality
      let minThreshold = categoryConfidence > 0.7 ? 0.15 :
                        categoryConfidence > 0.3 ? 0.12 : 0.08;

      if (primaryCategory === 'food_culinary' && queryLower.includes('food')) {
        minThreshold = Math.max(minThreshold, 0.15); // Ensure higher threshold for food searches
      }

      const isRelevant = relevanceScore >= minThreshold;

      if (!isRelevant) {
        console.log(`🔍 LOW RELEVANCE: "${product.title}" (score: ${relevanceScore.toFixed(2)}, threshold: ${minThreshold})`);
      } else {
        console.log(`✅ RELEVANT: "${product.title}" (score: ${relevanceScore.toFixed(2)})`);
      }

      return isRelevant;
    });

    console.log(`🎯 RELEVANCE FILTER RESULT: ${products.length} → ${filtered.length} products`);
    return filtered;
  }

  /**
   * 🏷️ CHECK CATEGORY ALIGNMENT
   */
  private hasGoodCategoryAlignment(title: string, description: string, query: string): boolean {
    const content = `${title} ${description}`;

    const CATEGORIES = {
      food: ['food', 'cooking', 'culinary', 'restaurant', 'dining', 'chef', 'cuisine', 'wine', 'tasting', 'market', 'eat', 'drink'],
      culture: ['museum', 'gallery', 'art', 'exhibition', 'collection', 'cultural', 'heritage', 'temple', 'palace', 'castle', 'history', 'historical', 'ancient', 'monument', 'ruins', 'archaeological'],
      adventure: ['adventure', 'hiking', 'kayaking', 'outdoor', 'nature', 'wildlife', 'extreme', 'safari', 'volcano', 'mountain', 'climbing', 'trekking', 'bike', 'cycling'],
      tours: ['tour', 'guided', 'walking', 'sightseeing', 'excursion', 'journey', 'visit', 'explore'],
      water: ['boat', 'cruise', 'sailing', 'yacht', 'catamaran', 'ferry', 'maritime', 'nautical', 'water', 'beach', 'ocean', 'river', 'harbor', 'kayak', 'surf', 'snorkeling', 'diving', 'fishing', 'angling', 'charter']
    };

    for (const [category, keywords] of Object.entries(CATEGORIES)) {
      // Check if query keywords align with category keywords
      const queryHasCategory = keywords.some(keyword => query.includes(keyword));
      // Check if content keywords align with category keywords
      const contentHasCategory = keywords.some(keyword => content.includes(keyword));

      if (queryHasCategory && contentHasCategory) {
        return true; // Good category match found
      }
    }

    return false;
  }

  /**
   * 🏆 TRANSFORM AND RANK PRODUCTS - PRESERVES LOCATION BONUSES
   */
  private transformAndRank(products: any[], query: string, destinationName?: string): ActivityRecommendation[] {
    const queryLower = query.toLowerCase();
    const queryTerms = Array.from(new Set(queryLower.split(' ').filter(term => term.length > 2)));

    return products
      .map(product => {
        const activity = this.transformProduct(product);
        // Use enhanced relevance score that includes location bonuses
        const relevanceScore = this.calculateEnhancedRelevanceScore(product, queryTerms, destinationName);
        return { ...activity, relevanceScore };
      })
      .sort((a, b) => {
        // Primary sort by enhanced relevance score (includes location bonuses)
        if (Math.abs(b.relevanceScore - a.relevanceScore) > 0.01) {
          return b.relevanceScore - a.relevanceScore;
        }
        // Secondary sort by rating (higher is better)
        const ratingDiff = (b.rating || 0) - (a.rating || 0);
        if (ratingDiff !== 0) {
          return ratingDiff;
        }
        // Tertiary sort by review count (more reviews can indicate popularity/reliability)
        return (b.reviewCount || 0) - (a.reviewCount || 0);
      })
      .map(({ relevanceScore, ...activity }) => activity); // Remove the score from the final output
  }

  /**
   * 🔄 TRANSFORM PRODUCT TO ACTIVITY RECOMMENDATION FORMAT
   */
  private transformProduct(product: any): ActivityRecommendation {
    // Extract price, handling various possible structures from Viator API
    const priceSummary = product.pricing?.summary;
    const priceFrom = product.priceFrom;
    const priceObj = product.price;

    let amount = 0;
    let currency = 'USD';

    if (priceSummary?.fromPrice) {
      amount = priceSummary.fromPrice;
      currency = priceSummary.currency || currency;
    } else if (priceFrom?.amount) {
      amount = priceFrom.amount;
      currency = priceFrom.currency || currency;
    } else if (priceObj?.amount) {
      amount = priceObj.amount;
      currency = priceObj.currency || currency;
    }

    const price: ActivityRecommendation['price'] = amount > 0 ? { amount, currency } : null;

    // Extract rating and review count, handling different possible structures
    const reviews = product.reviews;
    const ratingObj = product.rating;

    let rating = 4.0; // Default rating
    let reviewCount = 0;

    if (reviews?.combinedAverageRating) {
      rating = reviews.combinedAverageRating;
      reviewCount = reviews.totalReviews || 0;
    } else if (ratingObj?.average) {
      rating = ratingObj.average;
      reviewCount = ratingObj.count || 0;
    } else if (typeof product.rating === 'number' && product.rating > 0) {
      // Handle case where product.rating is just a number (e.g., 4.5)
      rating = product.rating;
      // We don't have review count in this case, so it remains 0
    } else if (product.reviewCount) {
      // Fallback if only reviewCount is available
      reviewCount = product.reviewCount;
    }

    // Get booking URL, fallback to a general Viator URL if needed
    const bookingUrl = product.productUrl || (product.productCode ? `https://www.viator.com/tours/${product.productCode}` : null);

    // Get location, using a helper for robustness
    const location = this.extractLocation(product);

    return {
      id: product.productCode || product.id || '',
      productCode: product.productCode || product.id || '',
      title: product.title || 'Untitled Activity',
      description: product.shortDescription || product.description || 'No description available.',
      imageUrl: product.images?.[0]?.variants?.find((v: any) => v.width >= 400)?.url ||
               product.images?.[0]?.url ||
               'https://images.unsplash.com/photo-1488646953014-85cb44e25828?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=600&q=80', // Placeholder image
      duration: this.extractDuration(product),
      price,
      rating,
      reviewCount,
      location: location, // Extracted and potentially cleaned location
      destination: this.getDestinationNameFromProduct(product), // Get the primary destination name
      bookingUrl: bookingUrl || '',
      tags: product.tags?.map((tag: any) => tag.text) || []
    };
  }

  /**
   * 📊 CALCULATE ENHANCED RELEVANCE SCORE - ADVANCED MULTI-FACTOR SCORING
   */
  private calculateEnhancedRelevanceScore(product: any, queryTerms: string[], destinationName?: string): number {
    const title = (product.title || '').toLowerCase();
    const description = (product.shortDescription || product.description || '').toLowerCase();
    const content = `${title} ${description}`;

    let score = 0;

    // 1. ADVANCED SEMANTIC MATCHING (35% weight)
    const semanticScore = this.calculateSemanticRelevance(content, queryTerms);
    score += semanticScore * 0.35;

    // 2. VENUE-SPECIFIC MATCHING (25% weight) - Enhanced for AI recommendations
    const venueScore = this.calculateVenueSpecificScore(content, queryTerms);
    score += venueScore * 0.25;

    // 3. QUALITY AND TRUST INDICATORS (20% weight)
    const qualityScore = this.calculateQualityScore(product);
    score += qualityScore * 0.20;

    // 4. LOCATION AND DESTINATION ALIGNMENT (20% weight)
    const locationScore = this.calculateLocationRelevance(content, destinationName, queryTerms);
    score += locationScore * 0.20;

    // 5. AI VENUE MATCHING BONUS - Check if this matches AI extracted venues
    if (product._aiVenue) {
      const aiBonus = this.calculateAIVenueMatchingBonus(product, content);
      score += aiBonus;
      console.log(`🧠 AI VENUE BONUS: "${product.title}" matches AI venue "${product._aiVenue}" (+${aiBonus.toFixed(2)})`);
    }

    console.log(`🎯 ENHANCED SCORE: "${product.title}" = ${score.toFixed(3)} (semantic: ${semanticScore.toFixed(2)}, venue: ${venueScore.toFixed(2)}, quality: ${qualityScore.toFixed(2)}, location: ${locationScore.toFixed(2)})`);

    return Math.min(score, 1.0); // Ensure score doesn't exceed 1.0
  }

  /**
   * 🧠 CALCULATE SEMANTIC RELEVANCE USING ADVANCED NLP CONCEPTS
   */
  private calculateSemanticRelevance(content: string, queryTerms: string[]): number {
    let semanticScore = 0;

    // Direct term matching with position weighting
    let exactMatches = 0;
    let titleMatches = 0;
    
    for (const term of queryTerms) {
      // Exact matches get full credit
      if (content.includes(term)) {
        exactMatches++;
        // Title matches get extra weight
        if (content.substring(0, 100).includes(term)) {
          titleMatches++;
        }
      }
    }

    // Base semantic score from direct matches
    semanticScore = (exactMatches / queryTerms.length) * 0.6;
    semanticScore += (titleMatches / queryTerms.length) * 0.2;

    // Semantic expansion - related terms
    const semanticExpansions = this.getSemanticExpansions(queryTerms);
    let expansionMatches = 0;
    for (const expansion of semanticExpansions) {
      if (content.includes(expansion)) {
        expansionMatches++;
      }
    }
    semanticScore += (expansionMatches / Math.max(semanticExpansions.length, 1)) * 0.2;

    return Math.min(semanticScore, 1.0);
  }

  /**
   * 🏛️ CALCULATE VENUE-SPECIFIC SCORE FOR MUSEUMS, LANDMARKS, ETC.
   */
  private calculateVenueSpecificScore(content: string, queryTerms: string[]): number {
    let venueScore = 0;

    // Museum and cultural venue matching
    if (queryTerms.some(term => ['museum', 'gallery', 'exhibition', 'art'].includes(term))) {
      const museumTerms = ['museum', 'gallery', 'exhibition', 'collection', 'art', 'masterpiece', 'guided tour', 'audio guide'];
      const museumMatches = museumTerms.filter(term => content.includes(term)).length;
      venueScore += (museumMatches / museumTerms.length) * 0.8;
    }

    // Landmark and architectural matching
    if (queryTerms.some(term => ['cathedral', 'palace', 'castle', 'tower', 'monument'].includes(term))) {
      const landmarkTerms = ['cathedral', 'palace', 'castle', 'tower', 'monument', 'architecture', 'historic', 'heritage'];
      const landmarkMatches = landmarkTerms.filter(term => content.includes(term)).length;
      venueScore += (landmarkMatches / landmarkTerms.length) * 0.8;
    }

    // Activity type matching
    if (queryTerms.some(term => ['tour', 'experience', 'activity', 'visit'].includes(term))) {
      const activityTerms = ['tour', 'experience', 'visit', 'explore', 'discover', 'skip-the-line', 'priority access'];
      const activityMatches = activityTerms.filter(term => content.includes(term)).length;
      venueScore += (activityMatches / activityTerms.length) * 0.6;
    }

    return Math.min(venueScore, 1.0);
  }

  /**
   * ⭐ CALCULATE QUALITY SCORE BASED ON REVIEWS AND RATINGS
   */
  private calculateQualityScore(product: any): number {
    const rating = product.reviews?.combinedAverageRating || product.rating || 0;
    const reviewCount = product.reviews?.totalReviews || product.reviewCount || 0;

    let qualityScore = 0;

    // Rating score (0-1 scale)
    if (rating > 0) {
      qualityScore += Math.max(0, (rating - 3.0) / 2.0) * 0.6; // Normalize 3-5 to 0-1
    }

    // Review count score (logarithmic scale)
    if (reviewCount > 0) {
      qualityScore += Math.min(Math.log10(reviewCount + 1) / 3, 1.0) * 0.4; // Log scale, max at 1000 reviews
    }

    // Quality indicators in content
    const content = `${product.title || ''} ${product.shortDescription || ''}`.toLowerCase();
    const qualityIndicators = ['bestseller', 'top rated', 'highly recommended', 'award winning', 'certified', 'professional guide'];
    const qualityMatches = qualityIndicators.filter(indicator => content.includes(indicator)).length;
    qualityScore += (qualityMatches / qualityIndicators.length) * 0.2;

    return Math.min(qualityScore, 1.0);
  }

  /**
   * 🌍 CALCULATE LOCATION RELEVANCE AND DESTINATION MATCHING
   */
  private calculateLocationRelevance(content: string, destinationName: string | undefined, queryTerms: string[]): number {
    if (!destinationName) return 0.5; // Neutral if no destination

    const destLower = destinationName.toLowerCase();
    let locationScore = 0;

    // Direct destination matching
    if (content.includes(destLower)) {
      locationScore += 0.4;
    }

    // Specific location bonuses
    if (destLower.includes('hawaii')) {
      const hawaiiTerms = ['hawaii', 'kona', 'maui', 'honolulu', 'oahu', 'hilo', 'big island', 'kauai', 'waikiki', 'aloha'];
      const hawaiiMatches = hawaiiTerms.filter(term => content.includes(term)).length;
      if (hawaiiMatches > 0) {
        locationScore += 0.8; // Strong Hawaii bonus
      }
    } else if (destLower.includes('paris')) {
      const parisTerms = ['paris', 'louvre', 'eiffel', 'seine', 'champs', 'montmartre', 'versailles'];
      const parisMatches = parisTerms.filter(term => content.includes(term)).length;
      locationScore += (parisMatches / parisTerms.length) * 0.6;
    } else if (destLower.includes('barcelona')) {
      const barcelonaTerms = ['barcelona', 'sagrada familia', 'gaudi', 'gothic quarter', 'park guell', 'las ramblas'];
      const barcelonaMatches = barcelonaTerms.filter(term => content.includes(term)).length;
      locationScore += (barcelonaMatches / barcelonaTerms.length) * 0.6;
    }

    return Math.min(locationScore, 1.0);
  }

  /**
   * 🧠 CALCULATE AI VENUE MATCHING BONUS
   */
  private calculateAIVenueMatchingBonus(product: any, content: string): number {
    if (!product._aiVenue || !product._aiConfidence) return 0;

    const venueName = product._aiVenue.toLowerCase();
    let bonus = 0;

    // Exact venue name match
    if (content.includes(venueName)) {
      bonus += 0.3 * product._aiConfidence;
    }

    // Partial venue matches
    const venueWords = venueName.split(' ').filter((word: string) => word.length > 3);
    let partialMatches = 0;
    for (const word of venueWords) {
      if (content.includes(word)) {
        partialMatches++;
      }
    }

    if (venueWords.length > 0) {
      bonus += (partialMatches / venueWords.length) * 0.2 * product._aiConfidence;
    }

    return bonus;
  }

  /**
   * 🔤 GET SEMANTIC EXPANSIONS FOR QUERY TERMS
   */
  private getSemanticExpansions(queryTerms: string[]): string[] {
    const expansions: string[] = [];

    const semanticMap: { [key: string]: string[] } = {
      'museum': ['gallery', 'exhibition', 'collection', 'art center', 'cultural center'],
      'gallery': ['museum', 'exhibition', 'art space', 'collection'],
      'cathedral': ['church', 'basilica', 'chapel', 'religious site'],
      'palace': ['castle', 'royal residence', 'mansion', 'chateau'],
      'tour': ['guided tour', 'walking tour', 'excursion', 'visit', 'experience'],
      'food': ['culinary', 'dining', 'gastronomy', 'cuisine', 'tasting'],
      'adventure': ['outdoor', 'active', 'extreme', 'thrill', 'exciting'],
      'cultural': ['heritage', 'traditional', 'historic', 'authentic', 'local']
    };

    for (const term of queryTerms) {
      if (semanticMap[term]) {
        expansions.push(...semanticMap[term]);
      }
    }

    return expansions;
  }

  /**
   * 📊 CALCULATE RELEVANCE SCORE FOR A SINGLE PRODUCT (LEGACY METHOD)
   */
  private calculateRelevanceScore(product: any, query: string, primaryCategory?: { category: string | null, confidence: number }): number {
    const title = (product.title || '').toLowerCase();
    const description = (product.shortDescription || product.description || '').toLowerCase();
    const content = `${title} ${description}`;
    const queryLower = query.toLowerCase();
    const queryTerms = Array.from(new Set(queryLower.split(' ').filter(term => term.length > 2)));

    let score = 0;

    // 1. Direct query term matching (40% weight)
    let directMatches = 0;
    for (const term of queryTerms) {
      if (title.includes(term)) directMatches += 2; // Title matches worth more
      if (description.includes(term)) directMatches += 1;
    }
    score += (directMatches / (queryTerms.length * 3)) * 0.4;

    // 2. Category alignment score (35% weight)
    if (primaryCategory && primaryCategory.category) {
      // Use the same categories as in detectPrimaryCategory
      const ACTIVITY_CATEGORIES = {
        food_culinary: { primary: ['food', 'culinary', 'cuisine', 'cooking', 'tasting', 'chef', 'restaurant', 'market', 'gastronomy', 'dining', 'meal', 'eat'] },
        water_activities: { primary: ['boat', 'sailing', 'yacht', 'cruise', 'catamaran', 'ferry', 'maritime', 'nautical', 'snorkeling', 'diving', 'kayaking', 'fishing', 'angling', 'charter'] },
        cultural_heritage: { primary: ['museum', 'gallery', 'art', 'exhibition', 'collection', 'cultural', 'heritage', 'temple', 'palace', 'castle'] },
        adventure_outdoor: { primary: ['adventure', 'hiking', 'outdoor', 'nature', 'wildlife', 'extreme', 'safari', 'volcano', 'mountain'] },
        tours_sightseeing: { primary: ['tour', 'guided', 'walking', 'sightseeing', 'explore', 'excursion', 'journey', 'visit'] }
      };
      const categoryData = (ACTIVITY_CATEGORIES as any)[primaryCategory.category];
      if (categoryData) {
        const primaryMatches2 = categoryData.primary.filter((keyword: string) => content.includes(keyword)).length;
        const categoryScore = primaryMatches2 / categoryData.primary.length;
        score += categoryScore * 0.35;
      }
    }

    // 3. Semantic quality indicators (20% weight)
    const qualityIndicators = [
      'experience', 'tour', 'activity', 'adventure', 'guided', 'professional',
      'certified', 'equipment included', 'small group', 'private'
    ];
    const qualityMatches = qualityIndicators.filter(indicator => content.includes(indicator)).length;
    score += (qualityMatches / qualityIndicators.length) * 0.2;

    // 4. Location preference bonus for Hawaii searches (15% weight)
    // This bonus is handled in calculateEnhancedRelevanceScore, not here.

    return Math.min(score, 1.0); // Ensure score doesn't exceed 1.0
  }

  /**
   * 🎯 DETECT PRIMARY ACTIVITY CATEGORY FROM QUERY
   */
  private detectPrimaryCategory(query: string): { category: string | null, confidence: number } {
    const queryLower = query.toLowerCase();
    let primaryCategory = null;
    let categoryConfidence = 0;

    const ACTIVITY_CATEGORIES = {
      food_culinary: { primary: ['food', 'culinary', 'cuisine', 'cooking', 'tasting', 'chef', 'restaurant', 'market', 'gastronomy', 'dining', 'meal', 'eat'], base_score: 65, title_multiplier: 2.0, description_multiplier: 1.0 },
      water_activities: { primary: ['boat', 'sailing', 'yacht', 'cruise', 'catamaran', 'ferry', 'maritime', 'nautical', 'snorkeling', 'diving', 'kayaking', 'fishing', 'angling', 'charter'], base_score: 75, title_multiplier: 2.2, description_multiplier: 1.1 },
      cultural_heritage: { primary: ['museum', 'gallery', 'art', 'exhibition', 'collection', 'cultural', 'heritage', 'temple', 'palace', 'castle'], base_score: 55, title_multiplier: 1.8, description_multiplier: 1.2 },
      adventure_outdoor: { primary: ['adventure', 'hiking', 'outdoor', 'nature', 'wildlife', 'extreme', 'safari', 'volcano', 'mountain'], base_score: 60, title_multiplier: 1.9, description_multiplier: 1.0 },
      tours_sightseeing: { primary: ['tour', 'guided', 'walking', 'sightseeing', 'explore', 'excursion', 'journey', 'visit'], base_score: 45, title_multiplier: 1.5, description_multiplier: 1.1 }
    };

    for (const [category, data] of Object.entries(ACTIVITY_CATEGORIES)) {
      const matches = data.primary.filter((keyword: string) => queryLower.includes(keyword)).length;
      const confidence = matches > 0 ? (matches / data.primary.length) : 0;

      if (confidence > categoryConfidence) {
        categoryConfidence = confidence;
        primaryCategory = category;
      }
    }

    return { category: primaryCategory, confidence: categoryConfidence };
  }

  /**
   * 🎯 APPLY RELEVANCE FILTER WITH IMPROVED THRESHOLD AND SELECTION
   */
  private applyRelevanceFilter(products: any[], query: string, destinationName?: string): any[] {
    console.log(`🎯 RELEVANCE FILTER: Processing ${products.length} products for query "${query}"`);

    const primaryCategory = this.detectPrimaryCategory(query);
    console.log(`🎯 Primary category detected: ${primaryCategory.category} (confidence: ${primaryCategory.confidence.toFixed(2)})`);

    // More lenient threshold for better activity discovery
    const baseThreshold = 0.05; // Lowered from 0.08
    const threshold = Math.max(0.03, baseThreshold - (primaryCategory.confidence * 0.05));

    const scoredProducts = products.map(product => {
      const score = this.calculateRelevanceScore(product, query, primaryCategory);
      return { ...product, relevanceScore: score };
    });

    // Sort by relevance first
    const sortedProducts = scoredProducts.sort((a, b) => b.relevanceScore - a.relevanceScore);

    // Take top performers even if they're slightly below threshold
    const topCount = Math.min(15, products.length);
    const topProducts = sortedProducts.slice(0, topCount);

    // Filter by threshold but ensure we keep at least the top 8 results
    const filtered = sortedProducts.filter(product => {
      const isRelevant = product.relevanceScore >= threshold;

      if (isRelevant) {
        console.log(`✅ RELEVANT: "${product.title}" (score: ${product.relevanceScore.toFixed(2)})`);
      } else {
        console.log(`🔍 LOW RELEVANCE: "${product.title}" (score: ${product.relevanceScore.toFixed(2)}, threshold: ${threshold.toFixed(2)})`);
      }

      return isRelevant;
    });

    // Ensure we return at least 8 activities if available
    const finalResults = filtered.length >= 8 ? filtered : topProducts.slice(0, Math.max(8, filtered.length));

    console.log(`🎯 RELEVANCE FILTER RESULT: ${products.length} → ${finalResults.length} products (threshold: ${threshold.toFixed(2)})`);
    return finalResults;
  }

  /**
   * ✅ APPLY FINAL RANKING WITH QUALITY SCORES AND BETTER SELECTION
   */
  private applyFinalRanking(products: any[]): any[] {
    console.log(`✅ Final ranking: ${products.length} activities`);

    // Enhanced ranking with multiple factors
    const ranked = products.sort((a, b) => {
      const scoreA = a.relevanceScore || 0;
      const scoreB = b.relevanceScore || 0;

      // Add small bonus for higher-rated activities
      const ratingBonusA = (a.rating || 0) * 0.01;
      const ratingBonusB = (b.rating || 0) * 0.01;

      // Add small bonus for activities with reviews
      const reviewBonusA = (a.reviewCount && a.reviewCount > 10) ? 0.02 : 0;
      const reviewBonusB = (b.reviewCount && b.reviewCount > 10) ? 0.02 : 0;

      const finalScoreA = scoreA + ratingBonusA + reviewBonusA;
      const finalScoreB = scoreB + ratingBonusB + reviewBonusB;

      return finalScoreB - finalScoreA;
    });

    // Log top results for debugging
    ranked.slice(0, 5).forEach((product, index) => {
      console.log(`🏆 #${index + 1}: "${product.title}" (score: ${(product.relevanceScore || 0).toFixed(3)}, rating: ${product.rating || 'N/A'})`);
    });

    return ranked;
  }

  /**
   * 📊 CALCULATE OVERALL CONFIDENCE SCORE FOR THE SEARCH RESULTS
   */
  private calculateConfidence(activities: ActivityRecommendation[], query: string): number {
    if (activities.length === 0) return 0;

    const queryTerms = Array.from(new Set(query.toLowerCase().split(' ').filter(term => term.length > 2)));
    let totalRelevance = 0;
    const topN = Math.min(5, activities.length); // Consider top 5 activities for confidence calculation

    for (let i = 0; i < topN; i++) {
      const activity = activities[i];
      const title = activity.title.toLowerCase();
      const description = activity.description.toLowerCase();

      let activityRelevance = 0;

      // Term matching in title
      const titleMatches = queryTerms.filter(term => title.includes(term)).length;
      if (queryTerms.length > 0) {
        activityRelevance += (titleMatches / queryTerms.length) * 0.7; // Higher weight for title in confidence
      }

      // Term matching in description
      const descMatches = queryTerms.filter(term => description.includes(term)).length;
      if (queryTerms.length > 0) {
        activityRelevance += (descMatches / queryTerms.length) * 0.3;
      }

      totalRelevance += activityRelevance;
    }

    const averageRelevance = totalRelevance / topN;
    const confidence = Math.round(averageRelevance * 100);

    // Ensure a minimum confidence score if results are found, otherwise 0
    return Math.max(confidence, activities.length > 0 ? 25 : 0);
  }

  /**
   * 🕒 EXTRACT DURATION TEXT FROM PRODUCT DATA
   */
  private extractDuration(product: any): string | undefined {
    if (product.duration?.text) {
      return product.duration.text;
    }
    if (product.durationInMinutes) {
      const hours = Math.round(product.durationInMinutes / 60);
      if (hours > 0) return `${hours}h`;
    }
    return undefined; // Return undefined if no duration info found
  }

  /**
   * 📍 EXTRACT AND CLEAN LOCATION NAME FROM PRODUCT DATA
   */
  private extractLocation(product: any): string {
    // Prioritize specific fields that usually contain the primary location
    let location = product.destination?.destinationName ||
                   product.location?.name ||
                   product.destination?.name ||
                   product.location?.destinationName ||
                   '';

    // If still empty, check product's own destinations array
    if (!location && product.destinations && Array.isArray(product.destinations) && product.destinations.length > 0) {
      location = product.destinations[0].name || product.destinations[0].destinationName || '';
    }

    // If we have a location, clean and standardize it
    if (location) {
      const lowerLocation = location.toLowerCase();

      // Comprehensive location standardization
      const locationMappings = [
        // Major Cities with Country
        { patterns: ['paris'], standardized: 'Paris, France' },
        { patterns: ['tokyo', 'edo'], standardized: 'Tokyo, Japan' },
        { patterns: ['london'], standardized: 'London, UK' },
        { patterns: ['rome', 'roma'], standardized: 'Rome, Italy' },
        { patterns: ['barcelona'], standardized: 'Barcelona, Spain' },
        { patterns: ['amsterdam'], standardized: 'Amsterdam, Netherlands' },
        { patterns: ['berlin'], standardized: 'Berlin, Germany' },
        { patterns: ['madrid'], standardized: 'Madrid, Spain' },
        { patterns: ['vienna'], standardized: 'Vienna, Austria' },
        { patterns: ['prague'], standardized: 'Prague, Czech Republic' },
        { patterns: ['dublin'], standardized: 'Dublin, Ireland' },
        { patterns: ['moscow'], standardized: 'Moscow, Russia' },

        // US Cities
        { patterns: ['los angeles', 'hollywood', 'beverly hills'], standardized: 'Los Angeles, USA' },
        { patterns: ['new york', 'manhattan', 'brooklyn', 'nyc'], standardized: 'New York, USA' },
        { patterns: ['san francisco', 'silicon valley'], standardized: 'San Francisco, USA' },
        { patterns: ['las vegas', 'vegas'], standardized: 'Las Vegas, USA' },
        { patterns: ['chicago'], standardized: 'Chicago, USA' },
        { patterns: ['miami', 'south beach'], standardized: 'Miami, USA' },
        { patterns: ['orlando'], standardized: 'Orlando, USA' },
        { patterns: ['seattle'], standardized: 'Seattle, USA' },
        { patterns: ['boston'], standardized: 'Boston, USA' },
        { patterns: ['washington'], standardized: 'Washington DC, USA' },

        // Hawaii specific
        { patterns: ['kona', 'kailua-kona', 'kailua kona'], standardized: 'Kona, Hawaii' },
        { patterns: ['maui', 'lahaina'], standardized: 'Maui, Hawaii' },
        { patterns: ['oahu', 'honolulu', 'waikiki'], standardized: 'Oahu, Hawaii' },
        { patterns: ['kauai'], standardized: 'Kauai, Hawaii' },
        { patterns: ['molokai'], standardized: 'Molokai, Hawaii' },
        { patterns: ['lanai'], standardized: 'Lanai, Hawaii' },
        { patterns: ['big island', 'hawaii island'], standardized: 'Big Island, Hawaii' },

        // Other popular destinations
        { patterns: ['dubai'], standardized: 'Dubai, UAE' },
        { patterns: ['sydney'], standardized: 'Sydney, Australia' },
        { patterns: ['melbourne'], standardized: 'Melbourne, Australia' },
        { patterns: ['toronto'], standardized: 'Toronto, Canada' },
        { patterns: ['vancouver'], standardized: 'Vancouver, Canada' },
        { patterns: ['montreal'], standardized: 'Montreal, Canada' },
        { patterns: ['cancun'], standardized: 'Cancun, Mexico' },
        { patterns: ['bali', 'ubud'], standardized: 'Bali, Indonesia' },
        { patterns: ['santorini'], standardized: 'Santorini, Greece' },
        { patterns: ['mykonos'], standardized: 'Mykonos, Greece' },
        { patterns: ['reykjavik'], standardized: 'Reykjavik, Iceland' }
      ];

      // Find matching standardized location
      for (const mapping of locationMappings) {
        if (mapping.patterns.some(pattern => lowerLocation.includes(pattern))) {
          console.log(`📍 Standardized location: "${location}" → "${mapping.standardized}"`);
          return mapping.standardized;
        }
      }

      // Clean up the original location if no mapping found
      let cleanedLocation = location.trim();

      // Remove common prefixes/suffixes that make location names confusing
      cleanedLocation = cleanedLocation.replace(/^(Greater|Metropolitan|City of)\s+/i, '');
      cleanedLocation = cleanedLocation.replace(/\s+(Area|Region|District|County|Prefecture)$/i, '');

      return cleanedLocation;
    }

    // If no location found, try to extract from product content
    const titleAndDesc = `${product.title || ''} ${product.description || ''}`.toLowerCase();

    // Quick location extraction from content
    const contentLocationMappings = [
      { patterns: ['paris', 'louvre', 'eiffel'], location: 'Paris, France' },
      { patterns: ['tokyo', 'shibuya', 'shinjuku', 'harajuku'], location: 'Tokyo, Japan' },
      { patterns: ['london', 'big ben', 'westminster'], location: 'London, UK' },
      { patterns: ['rome', 'colosseum', 'vatican'], location: 'Rome, Italy' },
      { patterns: ['barcelona', 'sagrada familia'], location: 'Barcelona, Spain' },
      { patterns: ['kona', 'big island'], location: 'Kona, Hawaii' },
      { patterns: ['maui', 'haleakala'], location: 'Maui, Hawaii' },
      { patterns: ['oahu', 'waikiki', 'honolulu'], location: 'Oahu, Hawaii' }
    ];

    for (const mapping of contentLocationMappings) {
      if (mapping.patterns.some(pattern => titleAndDesc.includes(pattern))) {
        console.log(`📍 Extracted location from content: "${mapping.location}" for product ${product.productCode || 'unknown'}`);
        return mapping.location;
      }
    }

    // Final fallback - use a helpful generic message
    console.log(`📍 No location found for product ${product.productCode || 'unknown'}, using generic location`);
    return 'Travel Destination';
  }

  /**
   * Helper to get the primary destination name from the product
   */
  private getDestinationNameFromProduct(product: any): string {
    let destinationName = '';
    if (product.destination?.destinationName) {
      destinationName = product.destination.destinationName;
    } else if (product.destination?.name) {
      destinationName = product.destination.name;
    } else if (product.locations && Array.isArray(product.locations) && product.locations.length > 0) {
      destinationName = product.locations[0].name || product.locations[0].destinationName || '';
    } else if (product.destinations && Array.isArray(product.destinations) && product.destinations.length > 0) {
      destinationName = product.destinations[0].name || product.destinations[0].destinationName || '';
    }

    if (!destinationName) {
      return 'Travel Destination';
    }

    // Use the same standardization logic as extractLocation
    const lowerLocation = destinationName.toLowerCase();

    // Comprehensive location standardization
    const locationMappings = [
      // Major Cities with Country
      { patterns: ['paris'], standardized: 'Paris, France' },
      { patterns: ['tokyo', 'edo'], standardized: 'Tokyo, Japan' },
      { patterns: ['london'], standardized: 'London, UK' },
      { patterns: ['rome', 'roma'], standardized: 'Rome, Italy' },
      { patterns: ['barcelona'], standardized: 'Barcelona, Spain' },
      { patterns: ['amsterdam'], standardized: 'Amsterdam, Netherlands' },
      { patterns: ['berlin'], standardized: 'Berlin, Germany' },
      { patterns: ['madrid'], standardized: 'Madrid, Spain' },
      { patterns: ['vienna'], standardized: 'Vienna, Austria' },

      // US Cities
      { patterns: ['los angeles', 'hollywood', 'beverly hills'], standardized: 'Los Angeles, USA' },
      { patterns: ['new york', 'manhattan', 'brooklyn', 'nyc'], standardized: 'New York, USA' },
      { patterns: ['san francisco', 'silicon valley'], standardized: 'San Francisco, USA' },
      { patterns: ['las vegas', 'vegas'], standardized: 'Las Vegas, USA' },
      { patterns: ['chicago'], standardized: 'Chicago, USA' },
      { patterns: ['miami', 'south beach'], standardized: 'Miami, USA' },
      { patterns: ['orlando'], standardized: 'Orlando, USA' },
      { patterns: ['seattle'], standardized: 'Seattle, USA' },
      { patterns: ['boston'], standardized: 'Boston, USA' },
      { patterns: ['washington'], standardized: 'Washington DC, USA' },

      // Hawaii specific
      { patterns: ['kona', 'kailua-kona', 'kailua kona'], standardized: 'Kona, Hawaii' },
      { patterns: ['maui', 'lahaina'], standardized: 'Maui, Hawaii' },
      { patterns: ['oahu', 'honolulu', 'waikiki'], standardized: 'Oahu, Hawaii' },
      { patterns: ['kauai'], standardized: 'Kauai, Hawaii' },
      { patterns: ['molokai'], standardized: 'Molokai, Hawaii' },
      { patterns: ['lanai'], standardized: 'Lanai, Hawaii' },
      { patterns: ['big island', 'hawaii island'], standardized: 'Big Island, Hawaii' },

      // Other destinations
      { patterns: ['dubai'], standardized: 'Dubai, UAE' },
      { patterns: ['sydney'], standardized: 'Sydney, Australia' },
      { patterns: ['toronto'], standardized: 'Toronto, Canada' },
      { patterns: ['vancouver'], standardized: 'Vancouver, Canada' },
      { patterns: ['cancun'], standardized: 'Cancun, Mexico' },
      { patterns: ['bali', 'ubud'], standardized: 'Bali, Indonesia' },
      { patterns: ['santorini'], standardized: 'Santorini, Greece' },
      { patterns: ['mykonos'], standardized: 'Mykonos, Greece' }
    ];

    // Find matching standardized location
    for (const mapping of locationMappings) {
      if (mapping.patterns.some(pattern => lowerLocation.includes(pattern))) {
        return mapping.standardized;
      }
    }

    // Clean up the original destination name if no mapping found
    let cleanedName = destinationName.trim();

    // Remove common prefixes/suffixes that make location names confusing
    cleanedName = cleanedName.replace(/^(Greater|Metropolitan|City of)\s+/i, '');
    cleanedName = cleanedName.replace(/\s+(Area|Region|District|County|Prefecture)$/i, '');

    return cleanedName;
  }

  /**
   * 🌍 GET REGION FOR DESTINATION NAME
   */
  private getRegionForDestination(destinationName: string): string | null {
    const lowerName = destinationName.toLowerCase();
    // Check major cities first
    if (['tokyo', 'kyoto', 'osaka'].some(city => lowerName.includes(city)) || lowerName.includes('japan')) return 'asia';
    if (['paris', 'london', 'rome', 'barcelona', 'madrid', 'berlin'].some(city => lowerName.includes(city)) ||
        ['france', 'uk', 'italy', 'spain', 'germany'].some(country => lowerName.includes(country))) return 'europe';
    if (['new york', 'los angeles', 'chicago', 'miami', 'boston'].some(city => lowerName.includes(city)) ||
        ['usa', 'united states', 'america'].some(country => lowerName.includes(country))) return 'north_america';

    // Fallback to country matching
    return this.getRegionFromDestinationName(destinationName);
  }

  /**
   * 🚫 GET FORBIDDEN TERMS FOR REGION
   */
  private getForbiddenTermsForRegion(region: string, destinationName: string): string[] {
    const baseTerms: { [region: string]: string[] } = {
      asia: [
        'charleston', 'south carolina', 'namibia', 'walvis bay', 'swakopmund', 'sandwich harbour',
        'cape town', 'durban', 'africa', 'south africa', 'paris france', 'london uk', 'rome italy'
      ],
      europe: [
        'charleston', 'south carolina', 'namibia', 'walvis bay', 'swakopmund', 'sandwich harbour',
        'cape town', 'durban', 'africa', 'south africa', 'japan', 'china', 'tokyo', 'asia'
      ],
      north_america: [
        'namibia', 'walvis bay', 'swakopmund', 'sandwich harbour', 'cape town', 'africa',
        'south africa', 'paris france', 'london uk', 'rome italy', 'europe', 'asia', 'japan', 'china'
      ]
    };

    return baseTerms[region] || [];
  }

  /**
   * Helper to infer region from a destination name (basic implementation)
   */
  private getRegionFromDestinationName(name: string): string | null {
    const lowerName = name.toLowerCase();
    if (['japan', 'china', 'thailand', 'vietnam', 'indonesia', 'korea'].some(country => lowerName.includes(country))) return 'asia';
    if (['france', 'italy', 'spain', 'uk', 'germany', 'greece'].some(country => lowerName.includes(country))) return 'europe';
    if (['usa', 'canada', 'mexico'].some(country => lowerName.includes(country))) return 'north_america';
    if (['australia', 'new zealand'].some(country => lowerName.includes(country))) return 'oceania';
    if (['south africa', 'kenya', 'egypt', 'morocco'].some(country => lowerName.includes(country))) return 'africa';
    return null;
  }

  /**
   * 💾 CACHE MANAGEMENT HELPERS
   */
  private getFromCache(key: string): SearchResponse | null {
    const cached = this.cache.get(key);
    // Check if cache entry exists and is still valid (within TTL)
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }
    // If cache is expired or doesn't exist, remove potential old entry and return null
    this.cache.delete(key);
    return null;
  }

  private setCache(key: string, data: SearchResponse): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }


  /**
   * 🎯 ENHANCED ACTIVITY RELEVANCE SCORING
   * Advanced semantic matching with contextual understanding and quality weighting
   */
  private static calculateActivityRelevance(
    activity: ActivityRecommendation,
    geoFilter: GeographicFilter,
    userActivityQuery?: string
  ): number {
    let activityScore = 0;
    const title = activity.title.toLowerCase();
    const description = (activity.description || '').toLowerCase();
    const textToAnalyze = `${title} ${description}`;

    // Enhanced activity categories with improved semantic understanding
    const activityCategories = {
      'food_culinary': {
        primary: ['food', 'culinary', 'cuisine', 'cooking', 'tasting', 'chef', 'restaurant', 'market', 'gastronomy', 'dining', 'meal', 'eat'],
        contextual: ['michelin', 'authentic', 'local', 'traditional', 'gourmet', 'artisanal', 'farm-to-table', 'street food'],
        semantic: ['flavor', 'dish', 'recipe', 'kitchen', 'spices', 'ingredients', 'wine pairing'],
        quality_indicators: ['master chef', 'award-winning', 'signature dish', 'culinary expert'],
        base_score: 65,
        title_multiplier: 2.0,
        description_multiplier: 1.0
      },
      'water_activities': {
        primary: ['boat', 'sailing', 'yacht', 'cruise', 'catamaran', 'ferry', 'maritime', 'nautical', 'snorkeling', 'diving', 'kayaking'],
        contextual: ['private', 'luxury', 'sunset', 'swimming', 'dolphin', 'whale watching', 'island hopping'],
        semantic: ['sea', 'ocean', 'water', 'harbor', 'captain', 'marine life', 'coral reef'],
        quality_indicators: ['licensed captain', 'small group', 'professional crew', 'safety certified'],
        base_score: 75,
        title_multiplier: 2.2,
        description_multiplier: 1.1
      },
      'cultural_heritage': {
        primary: ['museum', 'gallery', 'art', 'exhibition', 'collection', 'cultural', 'heritage', 'temple', 'palace', 'castle'],
        contextual: ['guided', 'expert', 'exclusive', 'private', 'masterpiece', 'ancient', 'historical'],
        semantic: ['artifact', 'sculpture', 'painting', 'history', 'architecture', 'civilization'],
        quality_indicators: ['expert guide', 'skip-the-line', 'exclusive access', 'art historian'],
        base_score: 55,
        title_multiplier: 1.8,
        description_multiplier: 1.2
      },
      'adventure_outdoor': {
        primary: ['adventure', 'hiking', 'outdoor', 'nature', 'wildlife', 'extreme', 'safari', 'volcano', 'mountain'],
        contextual: ['scenic', 'thrilling', 'unique', 'adrenaline', 'breathtaking', 'panoramic'],
        semantic: ['wilderness', 'trail', 'expedition', 'active', 'natural habitat', 'ecosystem'],
        quality_indicators: ['certified guide', 'safety equipment', 'professional instructor', 'eco-friendly'],
        base_score: 60,
        title_multiplier: 1.9,
        description_multiplier: 1.0
      },
      'tours_sightseeing': {
        primary: ['tour', 'guided', 'walking', 'sightseeing', 'explore', 'excursion', 'journey', 'visit'],
        contextual: ['private', 'expert', 'local', 'insider', 'small group', 'comprehensive', 'highlights'],
        semantic: ['guide', 'discover', 'experience', 'landmarks', 'attractions', 'storytelling'],
        quality_indicators: ['local expert', 'personalized', 'intimate group', 'insider knowledge'],
        base_score: 45,
        title_multiplier: 1.5,
        description_multiplier: 1.1
      }
    };

    // Advanced query intent detection with contextual weighting
    const queryAnalysis = this.analyzeQueryIntent(userActivityQuery);

    // Calculate relevance for each category
    for (const [category, config] of Object.entries(activityCategories)) {
      const categoryScore = this.calculateCategoryRelevance(
        textToAnalyze, title, description, config, queryAnalysis
      );

      if (categoryScore > 0) {
        activityScore += categoryScore;
        console.log(`🎯 "${category}" relevance: +${categoryScore} points`);
      }
    }

    // Apply quality multipliers based on activity characteristics
    const qualityMultiplier = this.calculateQualityMultiplier(activity, textToAnalyze);
    activityScore *= qualityMultiplier;

    // Apply query intent boost with contextual understanding
    const intentBoost = this.calculateIntentBoost(queryAnalysis, textToAnalyze, title);
    activityScore += intentBoost;

    // Penalty system for low-quality or generic activities
    const penalties = this.calculateRelevancePenalties(textToAnalyze, title);
    activityScore -= penalties;

    console.log(`📊 Final activity relevance score: ${Math.round(activityScore)}`);
    return Math.max(0, Math.round(activityScore));
  }

  /**
   * 🧠 ADVANCED QUERY INTENT ANALYSIS
   */
  private static analyzeQueryIntent(query?: string): any {
    if (!query) return { confidence: 0, categories: [], specificity: 'low' };

    const queryLower = query.toLowerCase();
    const words = queryLower.split(/\s+/);

    const intentSignals = {
      specificity_indicators: {
        high: ['best', 'top', 'recommended', 'famous', 'must-see', 'exclusive', 'authentic'],
        medium: ['good', 'popular', 'nice', 'interesting', 'unique'],
        low: ['some', 'any', 'general', 'various']
      },
      experience_level: {
        premium: ['luxury', 'premium', 'vip', 'exclusive', 'private', 'high-end'],
        standard: ['guided', 'professional', 'organized'],
        budget: ['budget', 'cheap', 'affordable', 'economical']
      },
      urgency_indicators: ['today', 'now', 'urgent', 'asap', 'immediately'],
      group_indicators: ['family', 'couple', 'solo', 'group', 'friends', 'kids', 'children']
    };

    let confidence = 0;
    let specificity = 'low';
    const categories: string[] = [];

    // Analyze specificity
    if (intentSignals.specificity_indicators.high.some(term => queryLower.includes(term))) {
      specificity = 'high';
      confidence += 30;
    } else if (intentSignals.specificity_indicators.medium.some(term => queryLower.includes(term))) {
      specificity = 'medium';
      confidence += 15;
    }

    // Analyze experience level expectations
    let experienceLevel = 'standard';
    if (intentSignals.experience_level.premium.some(term => queryLower.includes(term))) {
      experienceLevel = 'premium';
      confidence += 20;
    } else if (intentSignals.experience_level.budget.some(term => queryLower.includes(term))) {
      experienceLevel = 'budget';
      confidence += 10;
    }

    return {
      confidence,
      specificity,
      experienceLevel,
      categories,
      wordCount: words.length,
      hasLocationContext: words.some(w => w.length > 4), // Rough location detection
      query: queryLower
    };
  }

  /**
   * 🎯 CATEGORY RELEVANCE CALCULATION
   */
  private static calculateCategoryRelevance(textToAnalyze: string, title: string, description: string, config: any, queryAnalysis: any): number {
    let score = 0;
    let primaryMatches = 0;
    let contextualMatches = 0;
    let semanticMatches = 0;
    let qualityMatches = 0;

    // Count matches in different sections with different weights
    config.primary.forEach((keyword: string) => {
      if (title.includes(keyword)) {
        primaryMatches++;
        score += config.base_score * 0.4; // High weight for title matches
      } else if (description.includes(keyword)) {
        primaryMatches++;
        score += config.base_score * 0.2; // Lower weight for description matches
      }
    });

    config.contextual.forEach((keyword: string) => {
      if (textToAnalyze.includes(keyword)) {
        contextualMatches++;
        score += config.base_score * 0.1;
      }
    });

    config.semantic.forEach((keyword: string) => {
      if (textToAnalyze.includes(keyword)) {
        semanticMatches++;
        score += config.base_score * 0.08;
      }
    });

    config.quality_indicators.forEach((indicator: string) => {
      if (textToAnalyze.includes(indicator)) {
        qualityMatches++;
        score += config.base_score * 0.15; // Quality indicators get good weight
      }
    });

    // Apply multipliers based on match distribution
    if (primaryMatches > 0) {
      const titleBonus = title.split(' ').some((word: string) =>
        config.primary.some((keyword: string) => word.includes(keyword))
      ) ? config.title_multiplier : 1.0;
      score *= titleBonus;
    }

    return Math.round(score);
  }

  /**
   * 🌟 QUALITY MULTIPLIER CALCULATION
   */
  private static calculateQualityMultiplier(activity: ActivityRecommendation, textToAnalyze: string): number {
    let multiplier = 1.0;

    // Rating-based multiplier
    if (activity.rating) {
      if (activity.rating >= 4.5) multiplier += 0.2;
      else if (activity.rating >= 4.0) multiplier += 0.1;
      else if (activity.rating < 3.5) multiplier -= 0.1;
    }

    // Review count multiplier
    if (activity.reviewCount) {
      if (activity.reviewCount >= 100) multiplier += 0.15;
      else if (activity.reviewCount >= 50) multiplier += 0.1;
      else if (activity.reviewCount >= 20) multiplier += 0.05;
    }

    // Quality indicators in text
    const qualityTerms = ['award-winning', 'certified', 'professional', 'expert', 'authentic', 'exclusive', 'premium'];
    const qualityCount = qualityTerms.filter(term => textToAnalyze.includes(term)).length;
    multiplier += qualityCount * 0.05;

    return Math.min(multiplier, 1.5); // Cap at 50% bonus
  }

  /**
   * 🚀 INTENT BOOST CALCULATION
   */
  private static calculateIntentBoost(queryAnalysis: any, textToAnalyze: string, title: string): number {
    let boost = 0;

    // Specificity boost
    if (queryAnalysis.specificity === 'high') {
      const qualityTerms = ['best', 'top', 'premium', 'exclusive', 'recommended'];
      const hasQualityTerms = qualityTerms.some(term => textToAnalyze.includes(term));
      if (hasQualityTerms) boost += 40;
    }

    // Experience level alignment boost
    if (queryAnalysis.experienceLevel === 'premium') {
      const premiumTerms = ['luxury', 'private', 'vip', 'exclusive', 'premium'];
      const hasPremiumTerms = premiumTerms.some(term => textToAnalyze.includes(term));
      if (hasPremiumTerms) boost += 35;
    } else if (queryAnalysis.experienceLevel === 'budget') {
      const budgetFriendlyTerms = ['group', 'shared', 'walking', 'self-guided'];
      const hasBudgetTerms = budgetFriendlyTerms.some(term => textToAnalyze.includes(term));
      if (hasBudgetTerms) boost += 20;
    }

    // Query length bonus (detailed queries get preference)
    if (queryAnalysis.wordCount >= 4) boost += 15;
    if (queryAnalysis.wordCount >= 6) boost += 10;

    return boost;
  }

  /**
   * ⚠️ RELEVANCE PENALTIES
   */
  private static calculateRelevancePenalties(textToAnalyze: string, title: string): number {
    let penalties = 0;

    // Generic activity penalties
    const genericTerms = ['general', 'various', 'multiple', 'combo', 'mixed', 'standard package'];
    genericTerms.forEach(term => {
      if (textToAnalyze.includes(term)) penalties += 20;
    });

    // Overly broad title penalties
    const broadTerms = ['experience', 'activity', 'package', 'deal'];
    const titleWords = title.split(' ');
    if (titleWords.length <= 3 && broadTerms.some(term => title.includes(term))) {
      penalties += 15;
    }

    // Low engagement indicators
    const lowEngagementTerms = ['basic', 'simple', 'short', 'quick stop'];
    lowEngagementTerms.forEach(term => {
      if (textToAnalyze.includes(term)) penalties += 10;
    });

    return penalties;
  }


  /**
   * 🧮 ENHANCED GEOGRAPHIC SCORING ALGORITHM
   * Advanced location matching with contextual understanding and semantic analysis
   */
  private static calculateGeographicScore(
    activity: ActivityRecommendation,
    geoFilter: GeographicFilter,
    userActivityQuery?: string
  ): number {
    let score = 0;
    const destinationName = geoFilter.destinationName.toLowerCase();
    const country = geoFilter.country.toLowerCase();

    // Text sources for comprehensive analysis
    const titleLower = activity.title.toLowerCase();
    const descLower = (activity.description || '').toLowerCase();
    const locationLower = (activity.location || '').toLowerCase();
    const allText = `${titleLower} ${descLower} ${locationLower}`;

    // TIER 1: EXACT DESTINATION MATCHING (Highest Priority)
    const tier1Score = this.calculateTier1LocationScore(titleLower, descLower, locationLower, destinationName, country);
    score += tier1Score;

    // TIER 2: CONTEXTUAL LOCATION MATCHING
    const tier2Score = this.calculateTier2ContextualScore(allText, destinationName, country, geoFilter);
    score += tier2Score;

    // TIER 3: REGIONAL AND CULTURAL CONTEXT
    const tier3Score = this.calculateTier3RegionalScore(allText, geoFilter);
    score += tier3Score;

    // GEOGRAPHIC AUTHENTICITY BONUS
    const authenticityBonus = this.calculateAuthenticityBonus(activity, geoFilter);
    score += authenticityBonus;

    // NEGATIVE SCORING: Advanced location conflict detection
    const locationPenalty = this.calculateAdvancedLocationPenalty(activity, geoFilter);
    score -= locationPenalty;

    // ACTIVITY RELEVANCE INTEGRATION
    const activityScore = this.calculateActivityRelevance(activity, geoFilter, userActivityQuery);
    score += activityScore;

    // QUALITY AMPLIFICATION: Better activities get geographic preference
    const qualityAmplifier = this.calculateQualityAmplifier(activity);
    score *= qualityAmplifier;

    console.log(`📊 Enhanced geographic score for "${activity.title}": ${Math.round(score)}`);
    return Math.max(0, Math.round(score));
  }

  /**
   * 🎯 TIER 1: EXACT DESTINATION MATCHING
   */
  private static calculateTier1LocationScore(title: string, desc: string, location: string, destination: string, country: string): number {
    let tier1Score = 0;

    // CRITICAL: Destination name in title (highest weight)
    if (title.includes(destination)) {
      // Extra bonus for destination being prominent in title
      const titleWords = title.split(' ');
      const destinationPosition = titleWords.findIndex(word => word.includes(destination));
      if (destinationPosition <= 2) { // Early in title = more relevant
        tier1Score += 120;
        console.log(`🏆 Destination "${destination}" prominent in title: +120 points`);
      } else {
        tier1Score += 100;
        console.log(`📍 Destination "${destination}" in title: +100 points`);
      }
    }

    // HIGH: Destination in description with context analysis
    if (desc.includes(destination)) {
      // Bonus if destination appears multiple times
      const occurrences = (desc.match(new RegExp(destination, 'g')) || []).length;
      const basePoints = 60;
      const bonusPoints = Math.min((occurrences - 1) * 10, 20);
      tier1Score += basePoints + bonusPoints;
      console.log(`📝 Destination "${destination}" in description: +${basePoints + bonusPoints} points (${occurrences} occurrences)`);
    }

    // MEDIUM-HIGH: Specific location field analysis
    if (location && location !== 'Location not specified') {
      if (location.includes(destination)) {
        tier1Score += 85;
        console.log(`📌 Destination "${destination}" in location field: +85 points`);
      } else if (location.includes(country)) {
        tier1Score += 45;
        console.log(`🌍 Country "${country}" in location field: +45 points`);
      } else {
        tier1Score += 25; // Generic location bonus
        console.log(`📍 Specific location provided: +25 points`);
      }
    } else {
      tier1Score -= 25; // Penalty for generic location
      console.log(`❌ Generic/missing location field: -25 points`);
    }

    return tier1Score;
  }

  /**
   * 🌐 TIER 2: CONTEXTUAL LOCATION MATCHING
   */
  private static calculateTier2ContextualScore(allText: string, destination: string, country: string, geoFilter: GeographicFilter): number {
    let tier2Score = 0;

    // Known destination synonyms and local names
    const destinationSynonyms = this.getDestinationSynonyms(destination);
    destinationSynonyms.forEach(synonym => {
      if (allText.includes(synonym.toLowerCase())) {
        tier2Score += 70;
        console.log(`🔄 Destination synonym "${synonym}" found: +70 points`);
      }
    });

    // Country context with regional awareness
    if (allText.includes(country)) {
      tier2Score += 40;
      console.log(`🌏 Country "${country}" context: +40 points`);
    }

    // Regional indicators
    const regionalTerms = this.getRegionalTerms(geoFilter);
    regionalTerms.forEach(term => {
      if (allText.includes(term.toLowerCase())) {
        tier2Score += 25;
        console.log(`🗺️ Regional term "${term}" found: +25 points`);
      }
    });

    return tier2Score;
  }

  /**
   * 🏛️ TIER 3: REGIONAL AND CULTURAL CONTEXT
   */
  private static calculateTier3RegionalScore(allText: string, geoFilter: GeographicFilter): number {
    let tier3Score = 0;

    // Cultural and landmark references
    const culturalLandmarks = this.getCulturalLandmarks(geoFilter.destinationName);
    culturalLandmarks.forEach(landmark => {
      if (allText.includes(landmark.toLowerCase())) {
        tier3Score += 30;
        console.log(`🏛️ Cultural landmark "${landmark}" referenced: +30 points`);
      }
    });

    // Local language terms and cultural references
    const localTerms = this.getLocalCulturalTerms(geoFilter.destinationName);
    localTerms.forEach(term => {
      if (allText.includes(term.toLowerCase())) {
        tier3Score += 20;
        console.log(`🌸 Local cultural term "${term}" found: +20 points`);
      }
    });

    return tier3Score;
  }

  /**
   * ✨ AUTHENTICITY BONUS CALCULATION
   */
  private static calculateAuthenticityBonus(activity: ActivityRecommendation, geoFilter: GeographicFilter): number {
    let bonus = 0;
    const allText = `${activity.title || ''} ${activity.description || ''}`.toLowerCase();

    // Authentic experience indicators
    const authenticityTerms = ['authentic', 'traditional', 'local', 'genuine', 'original', 'heritage', 'cultural'];
    authenticityTerms.forEach(term => {
      if (allText.includes(term)) {
        bonus += 15;
      }
    });

    // Local business indicators
    const localIndicators = ['family-owned', 'locally-run', 'community', 'artisan', 'craftsman'];
    localIndicators.forEach(indicator => {
      if (allText.includes(indicator)) {
        bonus += 20;
      }
    });

    if (bonus > 0) {
      console.log(`✨ Authenticity bonus: +${bonus} points`);
    }

    return bonus;
  }

  /**
   * 🚨 ADVANCED LOCATION CONFLICT DETECTION
   */
  private static calculateAdvancedLocationPenalty(activity: ActivityRecommendation, geoFilter: GeographicFilter): number {
    let penalty = 0;
    const allText = `${activity.title || ''} ${activity.description || ''}`.toLowerCase();

    // Comprehensive wrong location detection
    const conflictingLocations = this.getConflictingLocations(geoFilter);
    conflictingLocations.forEach(location => {
      if (allText.includes(location.name.toLowerCase())) {
        penalty += location.severity;
        console.log(`🚨 Location conflict "${location.name}": +${location.severity} penalty`);
      }
    });

    return penalty;
  }

  /**
   * 🌟 QUALITY AMPLIFIER
   */
  private static calculateQualityAmplifier(activity: ActivityRecommendation): number {
    let amplifier = 1.0;

    // High-quality activities get geographic preference
    if (activity.rating && activity.rating >= 4.5) amplifier += 0.1;
    if (activity.reviewCount && activity.reviewCount >= 100) amplifier += 0.08;

    // Premium indicators
    const premiumTerms = ['private', 'exclusive', 'premium', 'luxury', 'vip'];
    const activityText = `${activity.title || ''} ${activity.description || ''}`.toLowerCase();
    const premiumCount = premiumTerms.filter(term => activityText.includes(term)).length;
    amplifier += premiumCount * 0.03;

    return Math.min(amplifier, 1.25); // Cap at 25% amplification
  }

  /**
   * 🔍 HELPER METHODS FOR CONTEXTUAL ANALYSIS
   */
  private static getDestinationSynonyms(destination: string): string[] {
    const synonymMap: { [key: string]: string[] } = {
      'tokyo': ['edo', 'tokyo metropolitan', 'greater tokyo'],
      'paris': ['city of light', 'ile-de-france'],
      'london': ['greater london', 'the city'],
      'rome': ['eternal city', 'roma'],
      'barcelona': ['barca', 'ciutat comtal'],
      'mykonos': ['mikonos', 'myconos']
    };
    return synonymMap[destination.toLowerCase()] || [];
  }

  private static getRegionalTerms(geoFilter: GeographicFilter): string[] {
    const regionMap: { [key: string]: string[] } = {
      'greece': ['aegean', 'cyclades', 'hellenic'],
      'japan': ['honshu', 'kanto', 'japanese'],
      'france': ['french', 'gallic', 'francophone'],
      'italy': ['italian', 'mediterranean'],
      'spain': ['spanish', 'iberian', 'catalonia']
    };
    return regionMap[geoFilter.country.toLowerCase()] || [];
  }

  private static getCulturalLandmarks(destination: string): string[] {
    const landmarkMap: { [key: string]: string[] } = {
      'tokyo': ['skytree', 'shibuya', 'harajuku', 'asakusa', 'ginza', 'tsukiji'],
      'paris': ['eiffel tower', 'louvre', 'champs-elysees', 'montmartre', 'seine'],
      'mykonos': ['windmills', 'little venice', 'paradise beach', 'super paradise'],
      'rome': ['colosseum', 'vatican', 'trevi fountain', 'pantheon'],
      'barcelona': ['sagrada familia', 'park guell', 'las ramblas', 'gothic quarter']
    };
    return landmarkMap[destination.toLowerCase()] || [];
  }

  private static getLocalCulturalTerms(destination: string): string[] {
    const culturalMap: { [key: string]: string[] } = {
      'tokyo': ['sake', 'sushi', 'ramen', 'tempura', 'kabuki', 'geisha'],
      'paris': ['croissant', 'cafe', 'bistro', 'patisserie', 'baguette'],
      'mykonos': ['ouzo', 'taverna', 'mezze', 'souvlaki'],
      'rome': ['gelato', 'pasta', 'espresso', 'cappuccino', 'pizza'],
      'barcelona': ['tapas', 'paella', 'sangria', 'flamenco', 'gaudi']
    };
    return culturalMap[destination.toLowerCase()] || [];
  }

  private static getConflictingLocations(geoFilter: GeographicFilter): any[] {
    // This would be expanded based on geographic knowledge
    const majorConflicts = [
      { name: 'new york', severity: 100 },
      { name: 'los angeles', severity: 100 },
      { name: 'london', severity: geoFilter.destinationName.toLowerCase() !== 'london' ? 80 : 0 },
      { name: 'paris', severity: geoFilter.destinationName.toLowerCase() !== 'paris' ? 80 : 0 }
    ];

    return majorConflicts.filter(conflict => conflict.severity > 0);
  }

  private detectSearchIntent(queryLower: string): string {
    // Food-related searches
    if ((queryLower.includes('food') && queryLower.includes('tour')) ||
        queryLower.includes('culinary') || queryLower.includes('tasting')) {
      return 'food_tours';
    }

    // Cultural/historical searches (ninja, samurai, etc.)
    if (queryLower.includes('ninja') || queryLower.includes('samurai') ||
        queryLower.includes('cultural') || queryLower.includes('traditional') ||
        queryLower.includes('historical') || queryLower.includes('heritage')) {
      return 'cultural_historical';
    }

    // Museum searches
    if (queryLower.includes('museum') || queryLower.includes('gallery')) {
      return 'museums';
    }

    return 'general';
  }
}

interface GeographicFilter {
  destinationName: string;
  country: string;
  region: string;
}

const cleanRelevanceEngine = new CleanRelevanceEngine();
export { cleanRelevanceEngine };
export default cleanRelevanceEngine;