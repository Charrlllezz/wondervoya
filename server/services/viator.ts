import axios from 'axios';
import type { ActivityRecommendation } from '@shared/schema';
import { exchangeRateManager } from './exchange-rate-manager';
import { auxiliaryDataManager } from './auxiliary-data-manager';
import { smartDestinationMatcher } from './smart-destination-matcher';

const VIATOR_API_BASE = 'https://api.viator.com/partner';
const API_KEY = process.env.VIATOR_API_KEY || '';

export interface ViatorProduct {
  productCode: string;
  title: string;
  description: string;
  images?: Array<{ url: string }>;
  reviews?: {
    combinedAverageRating: number;
    totalReviews: number;
  };
  pricingInfo?: {
    summary?: {
      fromPrice: number;
      fromPriceFormatted: string;
    };
  };
  timeZone?: string;
  destinations?: Array<{ name: string }>;
  productUrl?: string;
  tags?: number[];
}

export interface ViatorSearchResponse {
  products: ViatorProduct[];
  totalCount?: number;
}

export class ViatorService {
  public axiosInstance;
  private searchCache = new Map<string, { results: ActivityRecommendation[]; timestamp: number }>();
  private diversityCache = new Map<string, Set<string>>(); // Track shown products per session
  private productDetailsCache = new Map<string, { details: any; timestamp: number }>();
  private availabilityCache = new Map<string, { data: any; timestamp: number }>();
  private readonly CACHE_DURATION = 10 * 60 * 1000; // 10 minutes for better performance
  private readonly AVAILABILITY_CACHE_DURATION = 60 * 60 * 1000; // 1 hour for availability data (more aggressive caching)
  private readonly AVAILABILITY_BACKGROUND_REFRESH = 30 * 60 * 1000; // 30 minutes - refresh in background
  private readonly MAX_CACHE_SIZE = 200; // Increased cache size

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: VIATOR_API_BASE,
      timeout: 120000, // 120 second timeout as required by Viator
      headers: {
        'Accept': 'application/json;version=2.0',
        'Accept-Language': 'en-US', // Required for Viator API
        'exp-api-key': API_KEY
      },
      transformRequest: [function (data, headers) {
        // Ensure Accept-Language header is properly set for Viator API
        headers['Accept-Language'] = 'en-US';
        // CRITICAL: Set Content-Type to application/json for POST requests
        headers['Content-Type'] = 'application/json';
        // For GET requests, data is undefined, return as-is
        // For POST requests, ensure data is properly stringified if it's an object
        if (data && typeof data === 'object') {
          return JSON.stringify(data);
        }
        return data;
      }]
    });

    // CRITICAL: Clear potentially contaminated cache on startup
    this.clearContaminatedCache();
  }

  // Clear cache that may contain cross-contaminated results
  public clearContaminatedCache() {
    const originalSize = this.searchCache.size;
    this.searchCache.clear();
    this.diversityCache.clear();
    console.log(`🧹 Cleared contaminated cache (${originalSize} entries) to prevent destination mixing`);
  }

  async searchProducts(searchTerm: string, currency: string = 'USD', randomize: boolean = false, sessionId?: string, destinationId?: number, locationContext?: string): Promise<ActivityRecommendation[]> {
    try {
      console.log(`🚨 VIATOR SEARCH CALLED: "${searchTerm}", dest: ${destinationId}, location: ${locationContext}`);

      // CRITICAL FIX: Always bypass cache for destination-specific searches
      if (destinationId) {
        console.log(`🎯 DESTINATION-SPECIFIC SEARCH: Bypassing all cache for destination ${destinationId}`);
      } else {
        // Only check cache for generic searches
        const normalizedSearchTerm = searchTerm.toLowerCase().trim().replace(/\s+/g, ' ');
        const cacheKey = `${normalizedSearchTerm}-${currency}`;
        const cached = this.searchCache.get(cacheKey);

        if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
          console.log(`✅ Using cached results for generic search: "${searchTerm}" (${cached.results.length} activities)`);
          let results = cached.results;

          // Apply diversity filtering if session provided
          if (sessionId) {
            results = this.applyDiversityFilter(results, sessionId, searchTerm);
          }

          return results;
        }
      }

      // Clean cache if it's getting too large
      if (this.searchCache.size > this.MAX_CACHE_SIZE) {
        const oldestKey = Array.from(this.searchCache.entries())
          .sort(([,a], [,b]) => a.timestamp - b.timestamp)[0][0];
        this.searchCache.delete(oldestKey);
      }

      // Import comprehensive search expansion
      const { ActivityTermExpander } = await import('./activity-term-expander');

      // Create comprehensive search strategies for better activity coverage
      let searchStrategies: string[] = [searchTerm];

      if (locationContext) {
        const comprehensiveSearch = ActivityTermExpander.createComprehensiveSearchQuery(locationContext, searchTerm);
        console.log(`🔍 Comprehensive search for "${searchTerm}" in ${locationContext}:`);
        console.log(`   Primary searches: ${comprehensiveSearch.primarySearches.slice(0, 3).join(', ')}`);
        console.log(`   Location-specific terms: ${comprehensiveSearch.locationSpecific.slice(0, 3).join(', ')}`);

        // Use primary searches first, then fallbacks if needed
        searchStrategies = [...comprehensiveSearch.primarySearches, ...comprehensiveSearch.fallbackSearches];
      }

      console.log(`Searching Viator API for: "${searchTerm}" in ${currency} (${searchStrategies.length} strategies)`);

      // Try structured search first with destination extraction
      let destinations: Array<{ id: number; name: string; }> = [];
      try {
        destinations = await this.getDestinations();
        console.log(`Retrieved ${destinations.length} destinations from Viator API`);
      } catch (destError) {
        console.log('Failed to retrieve destinations, falling back to freetext search:', destError);
      }

      const searchDestination = this.extractDestinationFromSearch(searchTerm, destinations);

      // Use comprehensive multi-strategy search for maximum activity coverage
      let allResults: ViatorProduct[] = [];
      let searchSuccessful = false;

      // Strategy 1: Destination-specific structured search with expanded terms
      if (destinationId && searchStrategies.length > 0) {
        console.log(`🎯 Using COMPREHENSIVE DESTINATION-SPECIFIC search for destination ID: ${destinationId}`);

        // Try multiple search terms to maximize coverage
        for (const strategy of searchStrategies.slice(0, 5)) {
          try {
            const structuredResponse = await this.axiosInstance.post('/products/search', {
              searchTerms: [
                {
                  searchTerm: strategy,
                  match: "FUZZY"
                }
              ],
              destinationReferences: [
                {
                  destinationId: destinationId,
                  locationType: "DESTINATION"
                }
              ],
              currency: currency,
              sort: "TRAVELER_RATING",
              order: "DESCENDING",
              topX: 15,
              pagination: {
                start: 1,
                count: 15
              }
            });

            if (structuredResponse.data?.products?.results && structuredResponse.data.products.results.length > 0) {
              console.log(`✅ Structured search SUCCESS: ${structuredResponse.data.products.results.length} products for "${strategy}" in destination ${destinationId}`);
              allResults.push(...structuredResponse.data.products.results);
              searchSuccessful = true;
            }
          } catch (structuredError: any) {
            console.log(`Structured search failed for "${strategy}":`, structuredError?.message || 'Unknown error');
          }

          // Small delay between requests
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        // If we got results from structured search, process and return them
        if (searchSuccessful && allResults.length > 0) {
          // Remove duplicates based on productCode
          const uniqueResults = allResults.filter((product, index, self) => 
            index === self.findIndex(p => p.productCode === product.productCode)
          );

          console.log(`🎯 Comprehensive structured search found ${uniqueResults.length} unique activities`);
          const transformedProducts = await this.transformProducts(uniqueResults, currency, searchTerm);

          // Cache destination-specific results with proper key
          const normalizedSearchTerm = searchTerm.toLowerCase().trim().replace(/\s+/g, ' ');
          const destinationCacheKey = `${normalizedSearchTerm}-${currency}-dest-${destinationId}`;
          this.searchCache.set(destinationCacheKey, {
            results: transformedProducts,
            timestamp: Date.now()
          });
          console.log(`💾 Cached destination-specific results: ${destinationCacheKey}`);

          return sessionId ? this.applyDiversityFilter(transformedProducts, sessionId, searchTerm) : transformedProducts;
        }
      }

      // Strategy 2: Comprehensive freetext search with expanded terms
      console.log('Using comprehensive freetext search with expanded terms and enhanced geographic filtering');

      // Try multiple search strategies with freetext
      for (const strategy of searchStrategies.slice(0, 3)) {
        try {
          const freetextResponse = await this.axiosInstance.post('/search/freetext?campaign-value=travel-ai-app', {
            searchTerm: strategy,
            searchTypes: [
              {
                searchType: 'PRODUCTS',
                pagination: { start: 1, count: 15 }
              }
            ],
            currency
          });

          if (freetextResponse.data?.products?.results && freetextResponse.data.products.results.length > 0) {
            console.log(`✅ Freetext search SUCCESS: ${freetextResponse.data.products.results.length} products for "${strategy}"`);
            allResults.push(...freetextResponse.data.products.results);
            searchSuccessful = true;
          }
        } catch (freetextError: any) {
          console.log(`Freetext search failed for "${strategy}":`, freetextError?.message || 'Unknown error');
        }

        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Process all collected results
      if (!searchSuccessful || allResults.length === 0) {
        console.log('All search strategies failed, returning empty results');
        return [];
      }

      // Remove duplicates and process results
      const uniqueResults = allResults.filter((product, index, self) => 
        index === self.findIndex(p => p.productCode === product.productCode)
      );

      console.log(`🎯 Total unique products found: ${uniqueResults.length} from comprehensive search`);

      const transformedProducts = await this.transformProducts(uniqueResults, currency, searchTerm);

      // Cache the results for future requests with proper cache key
      const normalizedSearchTerm = searchTerm.toLowerCase().trim().replace(/\s+/g, ' ');
      const searchCacheKey = destinationId ? `${normalizedSearchTerm}-${currency}-dest-${destinationId}` : `${normalizedSearchTerm}-${currency}`;
      this.searchCache.set(searchCacheKey, {
        results: transformedProducts,
        timestamp: Date.now()
      });
      console.log(`💾 Cached results: ${searchCacheKey} (${transformedProducts.length} activities)`);

      // Apply diversity filtering if session provided
      if (sessionId) {
        return this.applyDiversityFilter(transformedProducts, sessionId, searchTerm);
      }

      return transformedProducts;
    } catch (error: any) {
      console.error('Viator search error:', error);

      if (error?.code === 'ECONNABORTED') {
        console.log('Viator API request timed out');
      }

      // Return empty array instead of throwing - the conversation can continue without recommendations
      console.log('No API results available - authentic data requires valid API credentials');
      return [];
    }
  }

  // ENHANCED: Apply diversity filtering to prevent showing multiple activities from the same venue
  private applyDiversityFilter(results: ActivityRecommendation[], sessionId: string, searchQuery: string): ActivityRecommendation[] {
    if (!this.diversityCache.has(sessionId)) {
      this.diversityCache.set(sessionId, new Set());
    }

    const shownProducts = this.diversityCache.get(sessionId)!;

    // Filter out already shown products completely - prioritize fresh content
    const newResults = results.filter(activity => !shownProducts.has(activity.productCode));

    // ENHANCED: Apply venue-based diversity filtering for museums/attractions
    const diverseResults = this.applyVenueDiversityFilter(newResults, searchQuery);

    // If we have fewer than 6 diverse results, use category diversification as fallback
    if (diverseResults.length < 6) {
      console.log(`🔄 Only ${diverseResults.length} venue-diverse results found for "${searchQuery}", applying category diversification`);
      const categoryDiverseResults = this.diversifyByCategory(diverseResults, shownProducts);
      const finalResults = categoryDiverseResults.slice(0, 8);
      
      // Track shown products
      finalResults.forEach(activity => shownProducts.add(activity.productCode));
      console.log(`✅ Category-diversified results: ${finalResults.length} activities for "${searchQuery}"`);
      return finalResults;
    }

    // Track shown products
    diverseResults.forEach(activity => shownProducts.add(activity.productCode));

    // Clean up old sessions periodically
    if (this.diversityCache.size > 100) {
      const oldestSession = Array.from(this.diversityCache.keys())[0];
      this.diversityCache.delete(oldestSession);
    }

    console.log(`✅ Venue-diversified results: ${diverseResults.length} activities (${shownProducts.size} total shown this session) for "${searchQuery}"`);
    return diverseResults.slice(0, 8);
  }

  // NEW: Apply venue-based diversity to ensure different museums/attractions
  private applyVenueDiversityFilter(results: ActivityRecommendation[], searchQuery: string): ActivityRecommendation[] {
    const venueMap = new Map<string, ActivityRecommendation[]>();
    const lowerQuery = searchQuery.toLowerCase();
    
    // Group activities by venue/attraction
    results.forEach(activity => {
      const venue = this.extractVenueName(activity.title);
      if (!venueMap.has(venue)) {
        venueMap.set(venue, []);
      }
      venueMap.get(venue)!.push(activity);
    });

    console.log(`🏛️ VENUE DIVERSITY: Found ${venueMap.size} different venues from ${results.length} activities`);
    
    // For museum/cultural queries, prioritize venue diversity
    const isMuseumQuery = /museum|gallery|art|cultural|heritage|exhibition/.test(lowerQuery);
    const isAttractionQuery = /tower|palace|castle|monument|landmark/.test(lowerQuery);
    
    if (isMuseumQuery || isAttractionQuery) {
      return this.selectDiverseVenues(venueMap, isMuseumQuery);
    }
    
    // For other queries, allow up to 2 activities per venue
    const diverseResults: ActivityRecommendation[] = [];
    for (const [venue, activities] of venueMap.entries()) {
      // Sort by rating/quality and take top 2 per venue
      const sortedActivities = activities.sort((a, b) => (b.rating || 0) - (a.rating || 0));
      diverseResults.push(...sortedActivities.slice(0, 2));
      
      if (diverseResults.length >= 8) break;
    }
    
    return diverseResults;
  }

  // Extract venue name from activity title for grouping
  private extractVenueName(title: string): string {
    const titleLower = title.toLowerCase();
    
    // Common venue patterns for museums and attractions
    const venuePatterns = [
      // Museums & Cultural Sites
      /(louvre)/i,
      /(versailles)/i,
      /(notre.?dame)/i,
      /(eiffel tower)/i,
      /(arc de triomphe)/i,
      /(mont.?martre)/i,
      /(sacre.?coeur)/i,
      /(pompidou)/i,
      /(musee d'orsay|orsay)/i,
      /(rodin)/i,
      /(palais)/i,
      /(invalides)/i,
      /(conciergerie)/i,
      /(sainte.?chapelle)/i,
      /(pantheon)/i,
      /^([^:]+museum)/i,
      /^([^:]+gallery)/i,
      
      // Activity types that should be grouped
      /(walking tour)/i,
      /(food tour)/i,
      /(boat tour|cruise)/i,
      /(hop.?on hop.?off)/i,
    ];
    
    for (const pattern of venuePatterns) {
      const match = title.match(pattern);
      if (match) {
        return match[1].trim().toLowerCase();
      }
    }
    
    // Fallback: use first 3 words as venue identifier
    const words = title.split(' ').slice(0, 3).join(' ').toLowerCase();
    return words;
  }

  // Select diverse venues prioritizing different museums/attractions
  private selectDiverseVenues(venueMap: Map<string, ActivityRecommendation[]>, isMuseumQuery: boolean): ActivityRecommendation[] {
    const diverseResults: ActivityRecommendation[] = [];
    const selectedVenues = new Set<string>();
    
    // Priority venues for museum queries (should only show one activity each)
    const priorityVenues = isMuseumQuery ? [
      'louvre', 'versailles', 'notre dame', 'arc de triomphe', 'eiffel tower',
      'pompidou', 'musee d\'orsay', 'orsay', 'rodin', 'montmartre', 'sacre coeur',
      'invalides', 'conciergerie', 'sainte chapelle', 'pantheon'
    ] : [];
    
    // First pass: Select one activity from each priority venue
    for (const priorityVenue of priorityVenues) {
      for (const [venue, activities] of venueMap.entries()) {
        if (venue.includes(priorityVenue) && !selectedVenues.has(venue)) {
          // Select the highest-rated activity from this venue
          const bestActivity = activities.sort((a, b) => (b.rating || 0) - (a.rating || 0))[0];
          diverseResults.push(bestActivity);
          selectedVenues.add(venue);
          console.log(`🎯 Priority venue selected: ${venue} → "${bestActivity.title}"`);
          break;
        }
      }
      
      if (diverseResults.length >= 8) break; // Leave room for other venues
    }
    
    // Second pass: Fill remaining slots with other venues (max 1 per venue for museums)
    for (const [venue, activities] of venueMap.entries()) {
      if (!selectedVenues.has(venue)) {
        const maxActivitiesPerVenue = isMuseumQuery ? 1 : 2;
        const sortedActivities = activities.sort((a, b) => (b.rating || 0) - (a.rating || 0));
        diverseResults.push(...sortedActivities.slice(0, maxActivitiesPerVenue));
        selectedVenues.add(venue);
        
        if (diverseResults.length >= 8) break;
      }
    }
    
    console.log(`🏛️ VENUE SELECTION: ${selectedVenues.size} venues selected: [${Array.from(selectedVenues).join(', ')}]`);
    return diverseResults.slice(0, 8);
  }

  // Diversify results by activity categories to provide variety
  private diversifyByCategory(newResults: ActivityRecommendation[], shownProducts: Set<string>): ActivityRecommendation[] {
    const categoryMap = new Map<string, ActivityRecommendation[]>();

    // Group activities by primary category/tag
    newResults.forEach(activity => {
      const primaryTag = activity.tags?.[0] || 'general';
      if (!categoryMap.has(primaryTag)) {
        categoryMap.set(primaryTag, []);
      }
      categoryMap.get(primaryTag)!.push(activity);
    });

    // Select up to 2 activities from each category for variety
    const diverseResults: ActivityRecommendation[] = [];
    const categories = Array.from(categoryMap.keys());
    for (const category of categories) {
      const activities = categoryMap.get(category)!;
      const categoryActivities = activities.slice(0, 2); // Max 2 per category
      diverseResults.push(...categoryActivities);

      if (diverseResults.length >= 8) break;
    }

    return diverseResults;
  }

  // CRITICAL: Add destination validation to prevent cross-contamination
  private validateActivityForDestination(activity: ActivityRecommendation, targetDestinationId: number): boolean {
    const activityLocation = (activity.location || '').toLowerCase();
    const activityTitle = (activity.title || '').toLowerCase();
    const activityDescription = (activity.description || '').toLowerCase();
    const activityContent = `${activityTitle} ${activityDescription} ${activityLocation}`;

    // Major city validation mapping with strict ID checking
    const destinationValidation: { [key: number]: { valid: string[], forbidden: string[] } } = {
      645: { 
        valid: ['los angeles', 'hollywood', 'beverly hills', 'santa monica', 'la', 'california'],
        forbidden: ['paris', 'tokyo', 'london', 'namibia', 'africa']
      },
      479: { // Paris main ID
        valid: ['paris', 'france', 'french', 'louvre', 'eiffel', 'seine', 'montmartre'],
        forbidden: ['namibia', 'walvis bay', 'swakopmund', 'sandwich harbour', 'cape town', 'africa', 'windhoek', 'tokyo', 'london', 'new york']
      },
      684: { // Paris alternative ID
        valid: ['paris', 'france', 'french', 'louvre', 'eiffel', 'seine', 'montmartre'],
        forbidden: ['namibia', 'walvis bay', 'swakopmund', 'sandwich harbour', 'cape town', 'africa', 'windhoek', 'tokyo', 'london', 'new york']
      },
      10: { // Paris third ID
        valid: ['paris', 'france', 'french', 'louvre', 'eiffel', 'seine', 'montmartre'],
        forbidden: ['namibia', 'walvis bay', 'swakopmund', 'sandwich harbour', 'cape town', 'africa', 'windhoek', 'tokyo', 'london', 'new york']
      },
      737: { 
        valid: ['london', 'uk', 'england', 'british', 'thames', 'westminster'],
        forbidden: ['paris', 'tokyo', 'namibia', 'africa', 'new york']
      },
      706: { 
        valid: ['london', 'uk', 'england', 'british', 'thames', 'westminster'],
        forbidden: ['paris', 'tokyo', 'namibia', 'africa', 'new york']
      },
      334: {
        valid: ['tokyo', 'japan', 'japanese', 'shibuya', 'shinjuku', 'harajuku'],
        forbidden: ['paris', 'london', 'namibia', 'africa', 'new york']
      },
      685: { 
        valid: ['new york', 'nyc', 'manhattan', 'brooklyn', 'usa'],
        forbidden: ['paris', 'tokyo', 'london', 'namibia', 'africa']
      }
    };

    const validation = destinationValidation[targetDestinationId];
    if (validation) {
      // Check for forbidden terms first (immediate disqualification)
      const hasForbiddenTerm = validation.forbidden.some(term => activityContent.includes(term));
      if (hasForbiddenTerm) {
        console.log(`🚫 FORBIDDEN: "${activity.title}" contains forbidden terms for destination ${targetDestinationId}`);
        return false;
      }

      // Check for valid terms
      const hasValidTerm = validation.valid.some(term => activityContent.includes(term));
      console.log(`🔍 Validating "${activity.title}" for destination ${targetDestinationId}: ${hasValidTerm ? 'VALID' : 'INVALID'}`);
      return hasValidTerm;
    }

    // If no specific validation rules, allow it (but log for monitoring)
    console.log(`⚠️ No validation rules for destination ${targetDestinationId}, allowing activity: ${activity.title}`);
    return true;
  }

  async getDestinations(): Promise<Array<{ id: number; name: string; }>> {
    try {
      // Always use cached destinations from auxiliary data manager
      const destinations = await auxiliaryDataManager.getDestinations();
      console.log(`🗄️ Retrieved ${destinations.length} destinations from Viator cache`);
      return destinations;
    } catch (error) {
      console.error('Error getting destinations from cache, falling back to direct API:', error);

      // Fallback to direct API call
      try {
        const response = await this.axiosInstance.get('/destinations');
        const destinations = response.data?.destinations?.map((dest: any) => ({
          id: dest.destinationId,
          name: dest.destinationName,
        })) || [];
        console.log(`🌐 Retrieved ${destinations.length} destinations from direct API call`);
        return destinations;
      } catch (apiError) {
        console.error('Viator destinations API error:', apiError);
        return [];
      }
    }
  }



  async getExchangeRates(sourceCurrencies: string[], targetCurrencies: string[]): Promise<any[]> {
    try {
      const response = await this.axiosInstance.post('/exchange-rates', {
        sourceCurrencies,
        targetCurrencies,
      });
      return response.data?.rates || [];
    } catch (error) {
      console.error('Viator exchange rates API error:', error);
      return [];
    }
  }

  async getProductDetails(productCode: string) {
    try {
      // Check cache first
      const cacheKey = `details_${productCode}`;
      if (this.productDetailsCache.has(cacheKey)) {
        const cached = this.productDetailsCache.get(cacheKey)!;
        if (Date.now() - cached.timestamp < this.CACHE_DURATION) {
          console.log(`📋 Using cached product details for ${productCode}`);
          return cached.details;
        }
      }

      console.log(`🔍 Fetching comprehensive details for product: ${productCode}`);
      const response = await this.axiosInstance.get(`/products/${productCode}`);
      const product = response.data;

      console.log(`🔍 RAW VIATOR API RESPONSE for ${productCode}:`);
      console.log(`- Response keys:`, Object.keys(product));
      console.log(`- pricingInfo structure:`, product.pricingInfo ? Object.keys(product.pricingInfo) : 'MISSING');
      console.log(`- productOptions count:`, product.productOptions ? product.productOptions.length : 0);

      // Look for pricing in multiple possible locations
      console.log(`🔍 PRICING DEBUG for ${productCode}:`);
      console.log(`- product.price:`, product.price);
      console.log(`- product.pricing:`, product.pricing);
      console.log(`- product.cost:`, product.cost);
      console.log(`- product.rates:`, product.rates);
      console.log(`- product.bookableItems:`, product.bookableItems ? `Array of ${product.bookableItems.length} items` : 'MISSING');

      // Extract comprehensive image gallery with enhanced fallback
      const images: string[] = [];
      const additionalImages: string[] = [];
      let primaryImageUrl: string | null = null;

      if (product.images && Array.isArray(product.images)) {
        console.log(`🖼️ Processing ${product.images.length} images for product ${productCode}`);

        for (let i = 0; i < product.images.length; i++) {
          const img = product.images[i];
          let imageUrl: string | null = null;

          if (img.variants && Array.isArray(img.variants)) {
            // Prefer high-resolution images (720x480 or larger)
            const largeVariant = img.variants.find((variant: any) => variant.width >= 720) ||
                               img.variants.find((variant: any) => variant.width >= 400) ||
                               img.variants[img.variants.length - 1]; // Fall back to largest available
            imageUrl = largeVariant?.url || null;

            // For single image products, create a gallery from different variants
            if (product.images.length === 1 && img.variants.length > 3 && imageUrl) {
              console.log(`🎯 Single image detected, creating gallery from ${img.variants.length} variants`);

              // Add primary high-res image
              images.push(imageUrl);
              primaryImageUrl = imageUrl;

              // Add different sized variants as additional gallery images for visual diversity
              const mediumVariants = img.variants.filter((v: any) => v.width >= 400 && v.width < 720);
              const wideVariants = img.variants.filter((v: any) => v.width >= 600);

              // Add up to 3 additional variants for gallery diversity
              const selectedVariants = [
                ...wideVariants.slice(0, 2),
                ...mediumVariants.slice(0, 1)
              ].filter((v: any) => v.url !== imageUrl); // Avoid duplicates

              selectedVariants.forEach((variant: any) => {
                if (additionalImages.length < 4) { // Limit gallery size
                  additionalImages.push(variant.url);
                }
              });

              console.log(`✅ Created gallery with ${additionalImages.length} additional images from variants`);
            }
          } else if (img.url) {
            imageUrl = img.url;
          }

          if (imageUrl && product.images.length > 1) {
            if (i === 0) {
              images.push(imageUrl); // Primary image
              primaryImageUrl = imageUrl;
            } else {
              additionalImages.push(imageUrl);
            }
          } else if (imageUrl && i === 0) {
            primaryImageUrl = imageUrl;
          }
        }

        // Ensure at least the primary image is set
        if (images.length === 0 && primaryImageUrl) {
          images.push(primaryImageUrl);
        }
      }

      // Extract comprehensive pricing information with extensive debugging
      let pricing = null;
      console.log(`🔍 PRICING EXTRACTION for ${productCode}:`);

      if (product.pricingInfo?.summary?.fromPrice) {
        pricing = {
          amount: product.pricingInfo.summary.fromPrice,
          currency: 'USD',
          formatted: product.pricingInfo.summary.fromPriceFormatted || `$${product.pricingInfo.summary.fromPrice}`
        };
        console.log(`✅ Extracted pricing from pricingInfo.summary:`, pricing);
      } else {
        console.log(`❌ No pricing found in pricingInfo.summary`);

        // Try productOptions for pricing (this is where Viator often stores pricing)
        if (product.productOptions && Array.isArray(product.productOptions)) {
          console.log(`🔍 Checking productOptions for pricing...`);
          for (let i = 0; i < product.productOptions.length; i++) {
            const option = product.productOptions[i];
            console.log(`- ProductOption ${i}:`, option.title, option.pricing ? 'HAS PRICING' : 'NO PRICING');

            if (option.pricing?.summary?.fromPrice) {
              pricing = {
                amount: option.pricing.summary.fromPrice,
                currency: 'USD',
                formatted: option.pricing.summary.fromPriceFormatted || `$${option.pricing.summary.fromPrice}`
              };
              console.log(`✅ Found pricing in productOption ${i}:`, pricing);
              break;
            }
          }
        }

        // Try bookableItems as fallback
        if (!pricing && product.bookableItems && Array.isArray(product.bookableItems)) {
          console.log(`🔍 Checking bookableItems for pricing...`);
          for (let i = 0; i < product.bookableItems.length; i++) {
            const item = product.bookableItems[i];
            if (item.pricing?.summary?.fromPrice) {
              pricing = {
                amount: item.pricing.summary.fromPrice,
                currency: 'USD',
                formatted: item.pricing.summary.fromPriceFormatted || `$${item.pricing.summary.fromPrice}`
              };
              console.log(`✅ Found pricing in bookableItem ${i}:`, pricing);
              break;
            }
          }
        }
      }

      // Extract detailed itinerary and what to expect
      const itinerary = [];
      const whatToExpect = [];

      if (product.itinerary && Array.isArray(product.itinerary)) {
        for (const item of product.itinerary) {
          const itineraryItem: any = {
            title: item.title || `Stop ${itinerary.length + 1}`,
            description: item.description || item.summary || 'Details will be provided during the tour',
            duration: item.duration || null,
            location: item.pointOfInterestLocation?.location?.ref || null
          };
          itinerary.push(itineraryItem);
          whatToExpect.push(`${itineraryItem.title}: ${itineraryItem.description}`);
        }
      }

      // Extract highlights as what to expect if no itinerary
      if (whatToExpect.length === 0 && product.highlights && Array.isArray(product.highlights)) {
        whatToExpect.push(...product.highlights);
      }

      // Extract comprehensive inclusions and exclusions
      const inclusions = [];
      const exclusions = [];

      if (product.inclusions && Array.isArray(product.inclusions)) {
        inclusions.push(...product.inclusions.map((item: any) => 
          typeof item === 'string' ? item : item.description || item.title || 'Included service'
        ));
      }

      if (product.exclusions && Array.isArray(product.exclusions)) {
        exclusions.push(...product.exclusions.map((item: any) => 
          typeof item === 'string' ? item : item.description || item.title || 'Not included'
        ));
      }

      // Extract meeting and pickup information
      const meetingAndPickup = {
        meetingPoint: product.logistics?.start?.location?.ref || 
                     product.logistics?.meetingPoint || 
                     product.meetingPoint || 
                     'Meeting point details will be provided after booking',
        pickupOffered: product.logistics?.pickupOffered || false,
        pickupDetails: product.logistics?.pickupDetails || null,
        endPoint: product.logistics?.end?.location?.ref || null
      };

      // Extract cancellation policy as a string for React rendering
      const cancellationPolicy = product.cancellationPolicy?.description || 
                                 product.bookingTerms?.cancellationPolicy || 
                                 'Standard cancellation policy applies';

      // Extract language and accessibility information
      const languages = product.languages && Array.isArray(product.languages) ? 
                        product.languages : ['English'];

      const accessibility = {
        wheelchairAccessible: product.accessibility?.wheelchairAccessible || false,
        mobilityImpaired: product.accessibility?.mobilityImpaired || false,
        visuallyImpaired: product.accessibility?.visuallyImpaired || false,
        hearingImpaired: product.accessibility?.hearingImpaired || false,
        description: product.accessibility?.description || null
      };

      // Extract group size information
      const groupSize = {
        minimum: product.groupSize?.minimum || 1,
        maximum: product.groupSize?.maximum || null,
        description: product.groupSize?.description || null
      };

      // Extract additional information
      const additionalInfo = [];
      if (product.additionalInfo && Array.isArray(product.additionalInfo)) {
        additionalInfo.push(...product.additionalInfo);
      }
      if (product.importantInfo && Array.isArray(product.importantInfo)) {
        additionalInfo.push(...product.importantInfo.map((info: any) => `Important: ${info}`));
      }

      // Comprehensive description combining multiple fields
      const description = product.description || 
                         product.summary || 
                         product.longDescription ||
                         product.highlights?.join('. ') ||
                         product.overview ||
                         'This experience offers authentic local activities and memorable moments.';

      const enhancedProduct = {
        productCode: product.productCode,
        title: product.title,
        description,
        fullDescription: description,
        imageUrl: images[0] || null,
        images: additionalImages,
        additionalImages,
        price: pricing,
        pricing,
        rating: product.reviews?.combinedAverageRating || 4.5,
        reviewCount: product.reviews?.totalReviews || 0,
        duration: this.extractDuration(product),
        location: this.extractLocation(product),
        bookingUrl: product.productUrl || `https://www.viator.com/tours/${product.productCode}?mcid=42383&campaign=travel-ai-app&pid=P00253951&medium=api&api_version=2.0`,
        tags: this.extractTags(product),

        // Enhanced details for itinerary view
        inclusions,
        exclusions,
        whatToExpect,
        itinerary,
        additionalInfo,
        cancellationPolicy,
        languages,
        accessibility,
        groupSize,
        meetingAndPickup,

        // Additional metadata
        timeZone: product.timeZone || null,
        destinations: product.destinations || [],
        operatingDays: product.operatingSchedule?.operatingDays || null,
        specialRequirements: product.specialRequirements || []
      };

      console.log(`✅ Enhanced product details fetched for ${productCode} with ${additionalImages.length} images`);

      // Cache the result
      this.productDetailsCache.set(cacheKey, {
        details: enhancedProduct,
        timestamp: Date.now()
      });

      // Limit cache size
      if (this.productDetailsCache.size > this.MAX_CACHE_SIZE) {
        const oldestKey = Array.from(this.productDetailsCache.keys())[0];
        this.productDetailsCache.delete(oldestKey);
      }

      return enhancedProduct;

    } catch (error) {
      console.error(`❌ Error fetching product details for ${productCode}:`, error);
      throw error;
    }
  }

  private async transformProducts(products: ViatorProduct[], currency: string, searchQuery?: string): Promise<ActivityRecommendation[]> {
    console.log(`Starting with ${products.length} products from Viator API`);

    const filteredProducts = products.filter(product => {
        if (!product.productCode || !product.title) {
          return false;
        }

        const title = product.title.toLowerCase();
        const description = (product.description || '').toLowerCase();

        // Filter out digital/virtual experiences, audio tours, and restaurants
        const irrelevantKeywords = [
          'audio tour', 'audio guide', 'self-guided', 'driving tour', 'gps tour',
          'app only', 'mobile app', 'digital download', 'virtual reality',
          'online experience', 'zoom tour', 'livestream', 'recorded tour',
          'restaurant', 'dining', 'dinner reservation', 'lunch reservation',
          'breakfast reservation', 'brunch reservation', 'fine dining',
          'restaurant experience', 'meal reservation', 'table reservation'
        ];

        const hasIrrelevantKeyword = irrelevantKeywords.some(keyword => 
          title.includes(keyword) || description.includes(keyword)
        );

        if (hasIrrelevantKeyword) {
          return false;
        }

        return true;
      })
      // Sort by relevance - prioritize activities that match common search intents
      .sort((a, b) => {
        const titleA = a.title.toLowerCase();
        const titleB = b.title.toLowerCase();
        const descA = (a.description || '').toLowerCase();
        const descB = (b.description || '').toLowerCase();

        // Prioritize activities with specific keywords
        const preferredKeywords = ['kayak', 'snorkel', 'dive', 'boat', 'tour', 'adventure', 'experience'];

        const scoreA = preferredKeywords.reduce((score, keyword) => {
          if (titleA.includes(keyword)) score += 3;
          if (descA.includes(keyword)) score += 1;
          return score;
        }, 0);

        const scoreB = preferredKeywords.reduce((score, keyword) => {
          if (titleB.includes(keyword)) score += 3;
          if (descB.includes(keyword)) score += 1;
          return score;
        }, 0);

        return scoreB - scoreA;
      })
      .slice(0, 6); // Limit to 6 recommendations

    // Skip expensive pricing calls - only fetch when user requests details
    console.log(`Skipping pricing fetch for faster response - ${filteredProducts.length} products`);
    const productsWithPricing = filteredProducts.map(product => ({
      ...product,
      availabilityData: null // Will be fetched on-demand
    }));

    // Transform products with enhanced descriptions
    const enhancedProducts = await Promise.all(
      productsWithPricing.map(async product => {
        const price = this.extractPrice(product, currency);
        const image = this.extractImage(product);
        const location = this.extractLocation(product);

        // Use full original description to preserve complete information
        const enhancedDescription = product.description || '';

        // Skip expensive product details calls to improve performance
        let additionalImages: string[] = [];

        const finalPrice = price ? {
          amount: price.amount,
          currency: price.currency || 'USD',
        } : (product.pricingInfo?.summary?.fromPrice ? {
          amount: product.pricingInfo.summary.fromPrice,
          currency: 'USD'
        } : null);

        console.log(`💰 Final pricing for ${product.productCode}:`, finalPrice, 'from raw data:', product.pricingInfo?.summary);

        return {
          productCode: product.productCode,
          title: product.title,
          description: enhancedDescription,
          price: finalPrice,
          rating: product.reviews?.combinedAverageRating || 4.5,
          reviewCount: product.reviews?.totalReviews || 0,
          imageUrl: image,
          additionalImages,
          duration: this.extractDuration(product),
          location,
          bookingUrl: product.productUrl || `https://www.viator.com/tours/${product.productCode}`,
          tags: this.extractTags(product),
        };
      })
    );

    return enhancedProducts;
  }

  private convertToUSD(amount: number, fromCurrency: string): number {
    // Basic currency conversion rates (approximate)
    const exchangeRates: { [key: string]: number } = {
      'USD': 1.0,
      'CAD': 0.74,
      'EUR': 1.09,
      'GBP': 1.27,
      'AUD': 0.66,
      'JPY': 0.0067,
    };

    const rate = exchangeRates[fromCurrency] || 1.0;
    return Math.round(amount * rate * 100) / 100; // Round to 2 decimal places
  }

  private extractPrice(product: any, currency: string) {
    // Check availability/pricing data first (from availability/schedules endpoint)
    const availabilityData = product.availabilityData;
    if (availabilityData?.summary?.fromPrice) {
      console.log(`Using availability pricing for ${product.productCode}: ${availabilityData.summary.fromPrice} ${availabilityData.currency}`);
      const originalAmount = availabilityData.summary.fromPrice;
      const originalCurrency = availabilityData.currency;
      const convertedAmount = this.convertToUSD(originalAmount, originalCurrency);

      return {
        amount: convertedAmount,
        currency: 'USD',
      };
    }

    // Check formatted price from availability data
    if (availabilityData?.summary?.fromPriceFormatted) {
      const match = availabilityData.summary.fromPriceFormatted.match(/[\d,]+\.?\d*/);
      if (match) {
        const amount = parseFloat(match[0].replace(',', ''));
        console.log(`Extracted price from availability formatted string for ${product.productCode}: ${amount} ${availabilityData.currency}`);
        return { amount, currency: availabilityData.currency };
      }
    }

    // Fallback to original pricing info if available (from search results)
    if (product.pricingInfo?.summary?.fromPrice) {
      console.log(`Using search pricing for ${product.productCode}: ${product.pricingInfo.summary.fromPrice} ${currency}`);
      const originalAmount = product.pricingInfo.summary.fromPrice;
      const originalCurrency = product.pricingInfo.summary.currency || currency;
      const convertedAmount = this.convertToUSD(originalAmount, originalCurrency);

      return {
        amount: convertedAmount,
        currency: 'USD',
      };
    }

    // Check if product has formatted pricing string
    if (product.pricingInfo?.summary?.fromPriceFormatted) {
      const priceMatch = product.pricingInfo.summary.fromPriceFormatted.match(/[\d,]+\.?\d*/);
      if (priceMatch) {
        const amount = parseFloat(priceMatch[0].replace(',', ''));
        console.log(`Using formatted pricing for ${product.productCode}: ${amount} ${currency}`);
        return { amount, currency };
      }
    }

    // If no pricing available, return null to indicate authentic pricing needs to be fetched
    console.log(`No pricing data available for product ${product.productCode}`);
    return null;
  }

  private extractImage(product: ViatorProduct): string {
    // Check for images in the Viator product data
    if (product.images && product.images.length > 0) {
      const firstImage = product.images[0];

      // Try to get the highest quality image URL
      if (firstImage.url) {
        console.log(`Using Viator image for ${product.productCode}: ${firstImage.url}`);
        return firstImage.url;
      }

      // Check for variants with different sizes
      if ((firstImage as any).variants && (firstImage as any).variants.length > 0) {
        // Sort variants by size (if available) and pick the largest
        const largestVariant = (firstImage as any).variants.reduce((largest: any, current: any) => {
          if (current.width && largest.width && current.width > largest.width) {
            return current;
          }
          return largest;
        });
        console.log(`Using Viator image variant for ${product.productCode}: ${largestVariant.url}`);
        return largestVariant.url;
      }
    }

    // Log when we can't find images to help debug
    console.log('No image found for product:', product.productCode);
    if (product.images && product.images.length > 0) {
      console.log('Image structure sample:', JSON.stringify(product.images[0], null, 2));
    }

    // Use a higher quality fallback image
    return 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&h=600&q=80';
  }

  private extractLocation(product: ViatorProduct): string {
    // Try to extract location from product destinations first
    if (product.destinations && product.destinations.length > 0) {
      const destination = product.destinations[0];
      if (destination.name) {
        // Clean up destination name - remove unnecessary details
        let locationName = destination.name;
        
        // Remove common prefixes/suffixes that make location names confusing
        locationName = locationName.replace(/^(Greater|Metropolitan|City of)\s+/i, '');
        locationName = locationName.replace(/\s+(Area|Region|District|County|Prefecture)$/i, '');
        
        return locationName;
      }
    }

    // Try to extract from product title or description as fallback
    const titleAndDesc = `${product.title || ''} ${product.description || ''}`.toLowerCase();

    // Comprehensive location patterns for major destinations
    const locationPatterns = [
      // Major US Cities
      // "la\b" (no leading boundary) matched the tail of any word ending in
      // "la" — e.g. "gondola ride" was misread as a Los Angeles mention.
      { pattern: /los angeles|hollywood|beverly hills|santa monica|\bla\b/i, location: 'Los Angeles, USA' },
      { pattern: /new york|nyc|manhattan|brooklyn|queens|bronx/i, location: 'New York, USA' },
      { pattern: /san francisco|sf\b|silicon valley|bay area/i, location: 'San Francisco, USA' },
      { pattern: /las vegas|vegas\b/i, location: 'Las Vegas, USA' },
      { pattern: /chicago|windy city/i, location: 'Chicago, USA' },
      { pattern: /miami|south beach/i, location: 'Miami, USA' },
      { pattern: /orlando|disney world/i, location: 'Orlando, USA' },
      { pattern: /seattle|emerald city/i, location: 'Seattle, USA' },
      { pattern: /boston|beantown/i, location: 'Boston, USA' },
      { pattern: /washington\s*d\.?c\.?|capitol/i, location: 'Washington DC, USA' },
      
      // International Cities
      { pattern: /paris|city of light|louvre|eiffel/i, location: 'Paris, France' },
      { pattern: /london|big ben|westminster|thames/i, location: 'London, UK' },
      { pattern: /tokyo|shibuya|shinjuku|harajuku|ginza|edo/i, location: 'Tokyo, Japan' },
      { pattern: /rome|eternal city|colosseum|vatican/i, location: 'Rome, Italy' },
      { pattern: /barcelona|sagrada familia|gaudi/i, location: 'Barcelona, Spain' },
      { pattern: /amsterdam/i, location: 'Amsterdam, Netherlands' },
      { pattern: /berlin|brandenburg/i, location: 'Berlin, Germany' },
      { pattern: /dubai|burj khalifa/i, location: 'Dubai, UAE' },
      { pattern: /sydney|opera house|harbour bridge/i, location: 'Sydney, Australia' },
      
      // Hawaii specific locations
      { pattern: /kona|kailua-kona|big island|hawaii island/i, location: 'Kona, Hawaii' },
      { pattern: /maui|lahaina|haleakala/i, location: 'Maui, Hawaii' },
      { pattern: /oahu|honolulu|waikiki|pearl harbor/i, location: 'Oahu, Hawaii' },
      { pattern: /kauai|garden isle/i, location: 'Kauai, Hawaii' },
      { pattern: /molokai/i, location: 'Molokai, Hawaii' },
      { pattern: /lanai/i, location: 'Lanai, Hawaii' },
      { pattern: /hawaii(?!an)|hawaiian islands/i, location: 'Hawaii, USA' },
      
      // Other popular destinations
      { pattern: /cancun|riviera maya/i, location: 'Cancun, Mexico' },
      { pattern: /bali|ubud|denpasar/i, location: 'Bali, Indonesia' },
      { pattern: /santorini|mykonos|greek islands/i, location: 'Greek Islands, Greece' },
      // "san jose" alone is ambiguous — San Jose, California is a much more
      // common destination than Costa Rica's capital of the same name.
      { pattern: /costa rica/i, location: 'Costa Rica' },
      { pattern: /iceland|reykjavik/i, location: 'Iceland' }
    ];

    for (const { pattern, location } of locationPatterns) {
      if (pattern.test(titleAndDesc)) {
        console.log(`🏙️ Extracted location from content: "${location}" for product ${product.productCode}`);
        return location;
      }
    }

    // If no specific location found, return a generic but helpful message
    console.log(`📍 No specific location found for product ${product.productCode}, using generic location`);
    return 'Travel Destination';
  }

  private extractDuration(product: ViatorProduct): string {
    // Extract actual duration from Viator product data
    const textToSearch = `${product.title || ''} ${product.description || ''}`.toLowerCase();

    // More comprehensive duration patterns
    const durationPatterns = [
      // Decimal hours: "3.5 hours", "2.75 hours"
      /(\d+(?:\.\d+)?)\s*(?:and\s*a\s*half|\.\d+)?\s*hours?/i,
      // Hours with fractions: "3 and a half hours", "2 1/2 hours"
      /(\d+)\s*(?:and\s*a\s*half|\s*1\/2)\s*hours?/i,
      // Days: "3 days", "1 day"
      /(\d+)\s*days?/i,
      // Minutes: "90 minutes", "30 minutes"
      /(\d+)\s*(?:mins?|minutes?)/i,
      // Common phrases
      /full\s*day/i,
      /half\s*day/i,
      /multi[- ]?day/i,
      // Hour ranges: "4-6 hours", "2 to 3 hours"
      /(\d+)[-–to\s]+(\d+)\s*hours?/i,
      // Day ranges: "5-7 days"
      /(\d+)[-–to\s]+(\d+)\s*days?/i,
    ];

    for (const pattern of durationPatterns) {
      const match = textToSearch.match(pattern);
      if (match) {
        // Handle decimal hours
        if (pattern.source.includes('(?:\\.\\d+)?') && match[1]) {
          const hours = parseFloat(match[1]);
          if (hours % 1 === 0.5) {
            return `${Math.floor(hours)} and a half hours`;
          } else if (hours % 1 !== 0) {
            return `${hours} hours`;
          } else {
            return hours === 1 ? '1 hour' : `${hours} hours`;
          }
        }
        // Handle "and a half" patterns
        else if (pattern.source.includes('and\\s*a\\s*half') && match[1]) {
          const hours = parseInt(match[1]);
          return `${hours} and a half hours`;
        }
        // Handle hour ranges
        else if (pattern.source.includes('[-–to\\s]+') && pattern.source.includes('hours') && match[1] && match[2]) {
          return `${match[1]}-${match[2]} hours`;
        }
        // Handle day ranges
        else if (pattern.source.includes('[-–to\\s]+') && pattern.source.includes('days') && match[1] && match[2]) {
          return `${match[1]}-${match[2]} days`;
        }
        // Handle single days
        else if (pattern.source.includes('days') && match[1]) {
          const days = parseInt(match[1]);
          return days === 1 ? '1 day' : `${days} days`;
        }
        // Handle single hours
        else if (pattern.source.includes('hours') && match[1]) {
          const hours = parseInt(match[1]);
          return hours === 1 ? '1 hour' : `${hours} hours`;
        }
        // Handle minutes
        else if (pattern.source.includes('mins') && match[1]) {
          const minutes = parseInt(match[1]);
          if (minutes >= 60) {
            const hours = Math.floor(minutes / 60);
            const remainingMins = minutes % 60;
            if (remainingMins === 0) {
              return hours === 1 ? '1 hour' : `${hours} hours`;
            } else {
              return `${hours}h ${remainingMins}m`;
            }
          }
          return `${minutes} minutes`;
        }
        // Handle common phrases
        else if (pattern.source.includes('full')) {
          return 'Full day';
        } else if (pattern.source.includes('half')) {
          return 'Half day';
        } else if (pattern.source.includes('multi')) {
          return 'Multi-day';
        }
      }
    }

    // Check if it's likely a cruise or multi-day tour based on price
    if (product.pricingInfo?.summary?.fromPrice && product.pricingInfo.summary.fromPrice > 1000) {
      return 'Multi-day';
    }

    // Default fallback
    return 'Duration varies';
  }

  private extractTags(product: ViatorProduct): string[] {
    // Enhanced tag mapping with more comprehensive categories
    const tagMap: Record<number, string> = {
      // Activity Types
      20226: 'Sightseeing',
      21957: 'Cultural',
      21954: 'Adventure',
      12011: 'Water Sports',
      21953: 'Family Friendly',
      11930: 'Photography',
      12075: 'Food & Drink',

      // Additional activity categories
      12009: 'Nature & Wildlife',
      12010: 'Historical',
      12012: 'City Tours',
      12013: 'Beach Activities',
      12014: 'Extreme Sports',
      12015: 'Romantic',
      12016: 'Group Activities',
      12017: 'Educational',
      12018: 'Seasonal',
      12019: 'Nightlife',
      12020: 'Shopping',
      12021: 'Transportation',
      12022: 'Wellness & Spa',
      12023: 'Religious',
      12024: 'Art & Museums',

      // Duration-based tags
      21958: 'Half Day',
      21959: 'Full Day',
      21960: 'Multi Day',

      // Difficulty levels
      21961: 'Easy',
      21962: 'Moderate',
      21963: 'Challenging',

      // Special interests
      21964: 'Local Cuisine',
      21965: 'Architecture',
      21966: 'Festivals & Events',
      21967: 'Off the Beaten Path'
    };

    if (product.tags && product.tags.length > 0) {
      const mappedTags = product.tags
        .map(tagId => tagMap[tagId])
        .filter(Boolean);

      if (mappedTags.length > 0) {
        // Prioritize most relevant tags
        const priorityOrder = [
          'Adventure', 'Water Sports', 'Cultural', 'Nature & Wildlife',
          'Food & Drink', 'Photography', 'Sightseeing', 'Family Friendly'
        ];

        const sortedTags = mappedTags.sort((a, b) => {
          const aIndex = priorityOrder.indexOf(a);
          const bIndex = priorityOrder.indexOf(b);
          if (aIndex === -1 && bIndex === -1) return 0;
          if (aIndex === -1) return 1;
          if (bIndex === -1) return -1;
          return aIndex - bIndex;
        });

        return sortedTags.slice(0, 3);
      }
    }

    // Infer tags from title and description if no tags available
    const title = product.title?.toLowerCase() || '';
    const description = product.description?.toLowerCase() || '';
    const text = `${title} ${description}`;

    const inferredTags = [];
    if (text.includes('kayak') || text.includes('snorkel') || text.includes('dive')) {
      inferredTags.push('Water Sports');
    }
    if (text.includes('hike') || text.includes('climb') || text.includes('adventure')) {
      inferredTags.push('Adventure');
    }
    if (text.includes('culture') || text.includes('history') || text.includes('museum')) {
      inferredTags.push('Cultural');
    }
    if (text.includes('food') || text.includes('dining') || text.includes('cuisine')) {
      inferredTags.push('Food & Drink');
    }
    if (text.includes('photo') || text.includes('scenic') || text.includes('view')) {
      inferredTags.push('Photography');
    }

    return inferredTags.length > 0 ? inferredTags.slice(0, 3) : ['Experience'];
  }

  private truncateDescription(description: string): string {
    // Return full description without truncation to preserve cached data
    return description;
  }

  private async enhanceDescription(description: string, title: string): Promise<string> {
    try {
      if (!process.env.HUGGINGFACE_API_KEY) {
        return this.truncateDescription(description);
      }

      const { HfInference } = await import('@huggingface/inference');
      const hf = new HfInference(process.env.HUGGINGFACE_API_KEY);

      const prompt = `Rewrite this travel activity description to be more engaging and highlight key experiences. Keep it under 150 characters:

"${title}: ${description}"

Enhanced:`;

      const result = await hf.textGeneration({
        model: 'microsoft/DialoGPT-medium',
        inputs: prompt,
        parameters: {
          max_new_tokens: 40,
          temperature: 0.7,
          return_full_text: false,
        },
      });

      const enhanced = result.generated_text?.trim() || description;
      return this.truncateDescription(enhanced);
    } catch (error) {
      console.error('Description enhancement error:', error);
      return this.truncateDescription(description);
    }
  }

  private extractLocationKeywords(query: string): string[] {
    const locationWords = [];

    // Common location patterns
    const cityStatePattern = /([a-z]+)\s+(colorado|hawaii|california|florida|nevada|utah|arizona|texas|new york|washington)/gi;
    const cityCountryPattern = /([a-z]+)\s+(usa|us|america|canada)/gi;
    const canadaCityPattern = /([a-z]+)\s+(alberta|british columbia|bc|ontario|quebec)/gi;

    // Extract city-state combinations
    let match;
    while ((match = cityStatePattern.exec(query)) !== null) {
      locationWords.push(match[1].toLowerCase(), match[2].toLowerCase());
    }

    // Extract city-country combinations
    while ((match = cityCountryPattern.exec(query)) !== null) {
      locationWords.push(match[1].toLowerCase());
    }

    // Extract Canadian city-province combinations
    while ((match = canadaCityPattern.exec(query)) !== null) {
      locationWords.push(match[1].toLowerCase(), match[2].toLowerCase());
    }

    // Common cities and locations including Canada and US
    const knownLocations = [
      // Canadian locations
      'banff', 'calgary', 'vancouver', 'toronto', 'montreal', 'ottawa', 'victoria',
      'alberta', 'british columbia', 'bc', 'ontario', 'quebec', 'canada',
      'jasper', 'lake louise', 'whistler', 'niagara falls',
      // US locations with specific Hawaii island distinctions
      'boulder', 'colorado', 'denver', 'aspen', 'vail',
      'kona', 'big island', 'hawaii island', 'hilo', 'volcano',
      'honolulu', 'waikiki', 'oahu', 'pearl harbor',
      'maui', 'lahaina', 'haleakala', 'road to hana',
      'kauai', 'molokai', 'lanai',
      'hawaii', // Keep general Hawaii but it's less specific
      'san francisco', 'los angeles', 'california', 'san diego',
      'miami', 'florida', 'orlando', 'key west',
      'las vegas', 'nevada', 'utah', 'arizona', 'sedona',
      'seattle', 'washington', 'portland', 'oregon'
    ];

    // Find location keywords in the query
    knownLocations.forEach(location => {
      if (query.includes(location)) {
        locationWords.push(location);
      }
    });

    // Remove duplicates manually to avoid TypeScript issues
    const uniqueWords: string[] = [];
    locationWords.forEach(word => {
      if (!uniqueWords.includes(word)) {
        uniqueWords.push(word);
      }
    });
    return uniqueWords;
  }

  private extractDestinationFromSearch(searchTerm: string, destinations: Array<{ id: number; name: string; }>): { id: number; name: string; } | null {
    console.log(`Smart destination matching for: "${searchTerm}". Available destinations: ${destinations.length}`);

    // Enhanced major city mapping with better Los Angeles coverage
    const majorCityMap = {
      'Los Angeles': ['Los Angeles', 'LA', 'Hollywood', 'Beverly Hills', 'Santa Monica', 'West Hollywood'],
      'New York': ['New York', 'NYC', 'Manhattan', 'Brooklyn'],
      'San Francisco': ['San Francisco', 'SF', 'Silicon Valley'],
      'Las Vegas': ['Las Vegas', 'Vegas'],
      'Chicago': ['Chicago'],
      'Miami': ['Miami', 'South Beach'],
      'Orlando': ['Orlando', 'Disney World'],
      'Seattle': ['Seattle'],
      'Boston': ['Boston'],
      'Washington': ['Washington', 'DC', 'Washington DC']
    };

    const searchLower = searchTerm.toLowerCase();

    // Enhanced parsing for "City, Country" format with better matching
    const cityCountryMatch = searchTerm.match(/^(.+?),\s*(united states|usa|us|america)$/i);
    if (cityCountryMatch) {
      const cityName = cityCountryMatch[1].trim();
      console.log(`🔍 Detected "City, Country" format: "${cityName}, ${cityCountryMatch[2]}"`);

      // Check if this city is in our major cities list
      for (const [viatorCity, aliases] of Object.entries(majorCityMap)) {
        if (aliases.some(alias => alias.toLowerCase() === cityName.toLowerCase())) {
          console.log(`✅ Found major city match for: "${cityName}" → "${viatorCity}"`);

          // Find the Viator destination that matches this city - be more specific
          const match = destinations.find(dest => {
            const destName = dest.name.toLowerCase();
            const destParts = destName.split(',');

            // Prefer destinations that start with the city name and contain USA/US
            if (destParts.length >= 2) {
              const destCity = destParts[0].trim();
              const destCountry = destParts[1].trim();

              return (destCity.includes(viatorCity.toLowerCase()) || destCity.includes(cityName.toLowerCase())) &&
                     (destCountry.includes('usa') || destCountry.includes('united states') || destCountry.includes('america'));
            }

            // Fallback to basic matching
            return destName.includes(viatorCity.toLowerCase()) && destName.includes('usa');
          });

          if (match) {
            console.log(`🎯 City,Country match: "${searchTerm}" → "${match.name}"`);
            return match;
          }
        }
      }

      // If not in major cities, try direct search with country filtering
      const cityMatch = destinations.find(dest => {
        const destName = dest.name.toLowerCase();
        return destName.includes(cityName.toLowerCase()) && 
               (destName.includes('usa') || destName.includes('united states') || destName.includes('america'));
      });
      if (cityMatch) {
        console.log(`🎯 Direct city match with country filter: "${cityName}" → "${cityMatch.name}"`);
        return cityMatch;
      }
    }

    // Check for major cities in the search term (fallback)
    for (const [viatorCity, aliases] of Object.entries(majorCityMap)) {
      for (const alias of aliases) {
        if (searchLower.includes(alias.toLowerCase())) {
          // Find the Viator destination that matches this city
          const match = destinations.find(dest => {
            const destName = dest.name.toLowerCase();
            return destName.includes(viatorCity.toLowerCase()) || 
                   destName.includes(alias.toLowerCase()) ||
                   destName.startsWith(viatorCity.toLowerCase()) ||
                   destName.startsWith(alias.toLowerCase());
          });
          if (match) {
            console.log(`🎯 Direct major city match: "${searchTerm}" → "${match.name}" via "${alias}"`);
            return match;
          } else {
            console.log(`❌ No match found for "${viatorCity}" in destinations.`);
            // Debug: Show available destinations that contain the city name
            const partialMatches = destinations.filter(dest => 
              dest.name.toLowerCase().includes(viatorCity.toLowerCase())
            ).slice(0, 3);
            console.log(`🔍 Partial matches for "${viatorCity}":`, partialMatches.map(d => d.name));
          }
        }
      }
    }

    console.log(`🔄 Falling back to smart destination matcher for: "${searchTerm}"`);
    return smartDestinationMatcher.extractDestinationFromSearch(searchTerm, destinations);
  }

  // Background refresh to prevent user delays
  private async refreshAvailabilityInBackground(productCode: string, startDate: string, endDate: string, cacheKey: string) {
    try {
      console.log(`🔄 Background refresh starting for ${productCode}...`);
      // Don't await - let this run in background
      setTimeout(async () => {
        try {
          const freshData = await this.fetchAvailabilityData(productCode, startDate, endDate);
          this.availabilityCache.set(cacheKey, {
            data: freshData,
            timestamp: Date.now()
          });
          console.log(`✅ Background refresh completed for ${productCode}`);
        } catch (error) {
          console.log(`❌ Background refresh failed for ${productCode}:`, error);
        }
      }, 1000); // Small delay to not impact current request
    } catch (error) {
      console.log(`❌ Background refresh setup failed for ${productCode}:`, error);
    }
  }

  // Public method to clear cache for specific product
  clearAvailabilityCache(productCode: string, startDate?: string, endDate?: string) {
    const cacheKey = `availability_${productCode}`;
    this.availabilityCache.delete(cacheKey);
    console.log(`🗑️ Cleared availability cache for ${productCode}`);
  }

  async getProductAvailabilityAndPricing(productCode: string, startDate: string, endDate: string) {
    try {
      console.log(`🔍 Fetching availability for product ${productCode} from ${startDate} to ${endDate}`);

      // Use normalized cache key to improve hit rate
      const cacheKey = `availability_${productCode}`;
      const cached = this.availabilityCache.get(cacheKey);

      if (cached) {
        const age = Date.now() - cached.timestamp;

        // Return cached data immediately if it's valid
        if (age < this.AVAILABILITY_CACHE_DURATION && 
            cached.data.extractedStartTimes && cached.data.extractedStartTimes.length > 0) {
          console.log(`📋 Cache HIT for ${productCode} with ${cached.data.extractedStartTimes.length} times (age: ${Math.round(age/1000/60)}min)`);

          // Background refresh if data is getting old but still valid
          if (age > this.AVAILABILITY_BACKGROUND_REFRESH) {
            console.log(`🔄 Background refresh triggered for ${productCode}`);
            this.refreshAvailabilityInBackground(productCode, startDate, endDate, cacheKey);
          }

          return cached.data;
        } else {
          console.log(`🗑️ Cache EXPIRED for ${productCode} - age: ${Math.round(age/1000/60)}min, times: ${cached.data.extractedStartTimes?.length || 0}`);
          this.availabilityCache.delete(cacheKey);
        }
      } else {
        console.log(`❌ Cache MISS for ${productCode}`);
      }

      return await this.fetchAvailabilityData(productCode, startDate, endDate);
    } catch (error) {
      console.error(`❌ Error fetching availability for ${productCode}:`, error);
      return { 
        extractedStartTimes: [],
        rawData: null
      };
    }
  }

  // Extracted availability fetching logic for reuse
  private async fetchAvailabilityData(productCode: string, startDate: string, endDate: string) {
    const extractedStartTimes = [];

    // Use the availability/schedules endpoint which is better for calendar generation
    try {
        console.log(`🔍 Fetching availability schedules for ${productCode}`);

        const schedulesResponse = await this.axiosInstance.get(`/availability/schedules/${productCode}`);
        const scheduleData = schedulesResponse.data;

        console.log(`🔍 RAW SCHEDULES RESPONSE for ${productCode}:`, JSON.stringify(scheduleData, null, 2));

        if (scheduleData && scheduleData.bookableItems) {
          const start = new Date(startDate);
          const end = new Date(endDate);

          for (const bookableItem of scheduleData.bookableItems) {
            console.log(`🔍 Processing bookable item:`, bookableItem.productOptionCode);

            if (bookableItem.seasons && Array.isArray(bookableItem.seasons)) {
              for (const season of bookableItem.seasons) {
                console.log(`🔍 Processing season from ${season.startDate} to ${season.endDate}`);

                // Check if season overlaps with requested date range
                const seasonStart = new Date(season.startDate);
                const seasonEnd = new Date(season.endDate);

                if (seasonStart <= end && seasonEnd >= start) {
                  if (season.pricingRecords && Array.isArray(season.pricingRecords)) {
                    for (const record of season.pricingRecords) {
                      console.log(`🔍 Processing pricing record:`, record.daysOfWeek);
                      console.log(`🔍 Record structure:`, Object.keys(record));
                      console.log(`🔍 TimedEntries:`, record.timedEntries);

                      // Generate availability for each day in the range that matches the record
                      for (let d = new Date(Math.max(start.getTime(), seasonStart.getTime())); 
                           d <= new Date(Math.min(end.getTime(), seasonEnd.getTime())); 
                           d.setDate(d.getDate() + 1)) {

                        const dateStr = d.toISOString().split('T')[0];
                        const dayOfWeek = d.getDay(); // 0 = Sunday, 1 = Monday, etc.

                        // Map JavaScript day numbers to Viator day names
                        const dayNames = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
                        const dayName = dayNames[dayOfWeek];

                        console.log(`🔍 Checking availability for ${dateStr} (${dayName}), allowed days:`, record.daysOfWeek);

                        // Check if this day is available based on daysOfWeek
                        if (!record.daysOfWeek || record.daysOfWeek.length === 0 || 
                            record.daysOfWeek.includes(dayName)) {

                          // Extract pricing from pricingDetails array
                          let pricing = scheduleData.summary?.fromPrice; // Default fallback
                          if (record.pricingDetails && Array.isArray(record.pricingDetails)) {
                            for (const pricingDetail of record.pricingDetails) {
                              if (pricingDetail.ageBand === 'ADULT' && pricingDetail.price?.original?.recommendedRetailPrice) {
                                pricing = pricingDetail.price.original.recommendedRetailPrice;
                                break;
                              }
                            }
                          }

                          console.log(`🔍 Extracted pricing for ${dateStr}: ${pricing}`);

                          if (record.timedEntries && Array.isArray(record.timedEntries)) {
                            for (const entry of record.timedEntries) {
                              console.log(`🔍 Found timed entry for ${dateStr}: ${entry.startTime}`);

                              extractedStartTimes.push({
                                date: dateStr,
                                startTime: entry.startTime,
                                endTime: entry.endTime || null,
                                pricing: pricing
                              });
                            }
                          } else {
                            // No specific times, add common tour times
                            if (pricing) {
                              console.log(`🔍 Adding common times for ${dateStr} with pricing: ${pricing}`);
                              const commonTimes = ['10:00', '12:00', '14:00', '16:00'];
                              for (const time of commonTimes) {
                                extractedStartTimes.push({
                                  date: dateStr,
                                  startTime: time,
                                  endTime: null,
                                  pricing: pricing
                                });
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }

      } catch (schedulesError) {
        console.error(`❌ Error fetching schedules for ${productCode}:`, schedulesError);

        // Fallback: Try individual availability check for a few key dates
        const start = new Date(startDate);
        const end = new Date(endDate);
        const sampleDates = [];

        // Sample a few dates instead of checking every day
        for (let d = new Date(start); d <= end && sampleDates.length < 3; d.setDate(d.getDate() + 2)) {
          sampleDates.push(d.toISOString().split('T')[0]);
        }

        for (const dateStr of sampleDates) {
          try {
            console.log(`🔍 Fallback availability check for ${productCode} on ${dateStr}`);

            const availabilityResponse = await this.axiosInstance.post('/availability/check', {
              productCode: productCode,
              travelDate: dateStr,
              currency: 'USD',
              paxMix: [
                {
                  ageBand: 'ADULT',
                  numberOfTravelers: 2
                }
              ]
            });

            if (availabilityResponse.data && availabilityResponse.data.bookableItems) {
              for (const bookableItem of availabilityResponse.data.bookableItems) {
                if (bookableItem.seasons && Array.isArray(bookableItem.seasons)) {
                  for (const season of bookableItem.seasons) {
                    if (season.pricingRecords && Array.isArray(season.pricingRecords)) {
                      for (const record of season.pricingRecords) {
                        const pricing = record.price?.original?.recommendedRetailPrice || 
                                      bookableItem.price?.original?.recommendedRetailPrice;

                        if (pricing) {
                          const commonTimes = ['10:00', '14:00'];
                          for (const time of commonTimes) {
                            extractedStartTimes.push({
                              date: dateStr,
                              startTime: time,
                              endTime: null,
                              pricing: pricing
                            });
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          } catch (checkError) {
            console.error(`❌ Error in fallback check for ${productCode} on ${dateStr}:`, checkError);
          }
        }

        // Final fallback: Use product details pricing
        if (extractedStartTimes.length === 0) {
          try {
            const productDetails = await this.getProductDetails(productCode);
            if (productDetails && productDetails.price) {
              console.log(`🔍 Using product details fallback pricing: ${productDetails.price.amount}`);

              for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                const dateStr = d.toISOString().split('T')[0];
                const commonTimes = ['10:00', '14:00'];
                for (const time of commonTimes) {
                  extractedStartTimes.push({
                    date: dateStr,
                    startTime: time,
                    endTime: null,
                    pricing: productDetails.price.amount
                  });
                }
              }
            }
          } catch (detailError) {
            console.error(`❌ Error fetching product details fallback for ${productCode}:`, detailError);
          }
        }
      }

      console.log(`✅ Extracted ${extractedStartTimes.length} time slots for ${productCode} with pricing info`);

      const result = {
        extractedStartTimes,
        rawData: { availabilityScheduled: true },
        dateRange: { startDate, endDate },
        productCode
      };

      // Cache the result with simplified key
      const cacheKey = `availability_${productCode}`;
      this.availabilityCache.set(cacheKey, {
        data: result,
        timestamp: Date.now()
      });

      console.log(`💾 Cached availability for ${productCode} (${extractedStartTimes.length} slots)`);

      // Limit cache size - remove oldest entries
      if (this.availabilityCache.size > this.MAX_CACHE_SIZE) {
        const entries = Array.from(this.availabilityCache.entries());
        entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
        const toRemove = entries.slice(0, Math.floor(this.MAX_CACHE_SIZE * 0.2)); // Remove oldest 20%
        toRemove.forEach(([key]) => this.availabilityCache.delete(key));
        console.log(`🧹 Cleaned ${toRemove.length} old cache entries`);
      }

      return result;
  }

  async getAvailabilitySchedules(productCode: string, date: string) {
    try {
      console.log(`🔍 VIATOR: Getting availability schedules for ${productCode} on ${date}`);

      const cacheKey = `schedules-${productCode}-${date}`;
      const cached = this.availabilityCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.AVAILABILITY_CACHE_DURATION) {
        console.log(`💾 VIATOR: Using cached schedules for ${productCode}`);
        return cached.data;
      }

      // Get availability schedules for specific product and date
      const response = await this.axiosInstance.get(`/availability/schedules/${productCode}`, {
        params: {
          month: date.substring(0, 7), // YYYY-MM format
          year: date.substring(0, 4)
        }
      });

      const schedules = response.data?.bookableItems || [];

      // Filter for the specific date and extract start times
      const dateSchedules = schedules.filter((item: any) => 
        item.startDateTime && item.startDateTime.startsWith(date)
      ).map((item: any) => ({
        startTime: item.startDateTime.split('T')[1]?.substring(0, 5), // Extract HH:MM
        endTime: item.endDateTime ? item.endDateTime.split('T')[1]?.substring(0, 5) : null,
        availableSpaces: item.vacancyCount || 0,
        price: item.pricing?.summary?.fromPrice || null
      })).filter((item: any) => item.startTime); // Only include items with valid start times

      this.availabilityCache.set(cacheKey, {
        data: dateSchedules,
        timestamp: Date.now()
      });

      console.log(`✅ VIATOR: Retrieved ${dateSchedules.length} schedule slots for ${productCode} on ${date}`);
      return dateSchedules;
    } catch (error) {
      console.error(`❌ VIATOR: Failed to get schedules for ${productCode}:`, error);
      return [];
    }
  }
}

export const viatorService = new ViatorService();