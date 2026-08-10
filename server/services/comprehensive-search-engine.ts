
/**
 * 🔍 COMPREHENSIVE SEARCH ENGINE
 * Addresses Viator API limitations with multiple search strategies
 */

import { viatorService } from './viator';
import { ActivityTermExpander } from './activity-term-expander';
import { auxiliaryDataManager } from './auxiliary-data-manager';

interface SearchResult {
  products: any[];
  strategy: string;
  confidence: number;
  apiEndpoint: string;
}

interface ComprehensiveSearchOptions {
  query: string;
  destinationId: number;
  destinationName: string;
  maxResults?: number;
  currency?: string;
}

export class ComprehensiveSearchEngine {
  private cache = new Map<string, { data: any; timestamp: number }>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * 🎯 MAIN COMPREHENSIVE SEARCH
   * Uses multiple Viator API strategies to overcome limitations
   */
  async executeComprehensiveSearch(options: ComprehensiveSearchOptions): Promise<any[]> {
    const { query, destinationId, destinationName, maxResults = 50, currency = 'USD' } = options;
    
    console.log(`🔍 COMPREHENSIVE SEARCH: "${query}" in ${destinationName} (ID: ${destinationId})`);
    
    // Generate expanded search terms
    const expansion = ActivityTermExpander.expandSearchTerms(query);
    const locationSpecific = ActivityTermExpander.getLocationSpecificTerms(destinationName, query);
    
    console.log(`📝 Expanded terms: ${expansion.expandedTerms.slice(0, 3).join(', ')}`);
    console.log(`🗺️ Location-specific: ${locationSpecific.slice(0, 3).join(', ')}`);

    // Execute multiple search strategies in parallel
    const searchPromises = [
      this.strategyFreetextSearch(query, destinationName, currency),
      this.strategyProductsSearch(query, destinationId, currency),
      this.strategyExpandedTermsSearch(expansion.expandedTerms, destinationId, currency),
      this.strategyLocationSpecificSearch(locationSpecific, destinationName, currency),
      this.strategyCategoryBasedSearch(query, destinationId, currency),
      this.strategyBroadDestinationSearch(destinationName, currency) // Fallback
    ];

    try {
      const results = await Promise.allSettled(searchPromises);
      const successfulResults: SearchResult[] = [];

      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value.products.length > 0) {
          successfulResults.push(result.value);
          console.log(`✅ Strategy ${index + 1} (${result.value.strategy}): ${result.value.products.length} results`);
        } else {
          console.log(`❌ Strategy ${index + 1} failed or returned no results`);
        }
      });

      // Combine and deduplicate results
      const combinedProducts = this.combineAndDeduplicateResults(successfulResults);
      
      // Apply relevance filtering
      const relevantProducts = this.filterForRelevance(combinedProducts, query, destinationName);
      
      console.log(`🎯 COMPREHENSIVE SEARCH COMPLETE: ${relevantProducts.length} relevant activities found`);
      
      return relevantProducts.slice(0, maxResults);

    } catch (error) {
      console.error('❌ Comprehensive search failed:', error);
      return [];
    }
  }

  /**
   * 🌐 STRATEGY 1: FREETEXT SEARCH (Most Flexible)
   */
  private async strategyFreetextSearch(query: string, destinationName: string, currency: string): Promise<SearchResult> {
    try {
      const response = await viatorService.axiosInstance.post('/search/freetext', {
        searchTerm: `${query} ${destinationName}`,
        searchTypes: [{
          searchType: 'PRODUCTS',
          pagination: { start: 1, count: 30 }
        }],
        currency: currency
      });

      const products = response.data?.searchResults?.[0]?.results || [];
      
      return {
        products,
        strategy: 'freetext_search',
        confidence: 85,
        apiEndpoint: '/search/freetext'
      };
    } catch (error) {
      console.error('Strategy 1 (Freetext) failed:', error);
      return { products: [], strategy: 'freetext_search', confidence: 0, apiEndpoint: '/search/freetext' };
    }
  }

  /**
   * 🎯 STRATEGY 2: PRODUCTS SEARCH WITH DESTINATION FILTER
   */
  private async strategyProductsSearch(query: string, destinationId: number, currency: string): Promise<SearchResult> {
    try {
      const response = await viatorService.axiosInstance.post('/products/search', {
        filtering: {
          destination: destinationId.toString(),
          includeAutomaticTranslations: true
        },
        searchTerm: query, // Some versions support this
        sorting: {
          sort: "TRAVELER_RATING",
          order: "DESCENDING"
        },
        pagination: {
          start: 1,
          count: 30
        },
        currency: currency
      });

      const products = response.data?.products || [];
      
      return {
        products,
        strategy: 'products_search_filtered',
        confidence: 90,
        apiEndpoint: '/products/search'
      };
    } catch (error) {
      console.error('Strategy 2 (Products Search) failed:', error);
      return { products: [], strategy: 'products_search_filtered', confidence: 0, apiEndpoint: '/products/search' };
    }
  }

  /**
   * 📝 STRATEGY 3: EXPANDED TERMS SEARCH
   */
  private async strategyExpandedTermsSearch(expandedTerms: string[], destinationId: number, currency: string): Promise<SearchResult> {
    try {
      // Use top 3 expanded terms
      const topTerms = expandedTerms.slice(0, 3);
      const searchTerm = topTerms.join(' ');

      const response = await viatorService.axiosInstance.post('/products/search', {
        filtering: {
          destination: destinationId.toString()
        },
        sorting: {
          sort: "TRAVELER_RATING",
          order: "DESCENDING"
        },
        pagination: {
          start: 1,
          count: 25
        },
        currency: currency
      });

      let products = response.data?.products || [];
      
      // Client-side filtering for expanded terms
      products = products.filter((product: any) => {
        const content = `${product.title || ''} ${product.shortDescription || ''}`.toLowerCase();
        return topTerms.some(term => content.includes(term.toLowerCase()));
      });

      return {
        products,
        strategy: 'expanded_terms_search',
        confidence: 75,
        apiEndpoint: '/products/search + client_filter'
      };
    } catch (error) {
      console.error('Strategy 3 (Expanded Terms) failed:', error);
      return { products: [], strategy: 'expanded_terms_search', confidence: 0, apiEndpoint: '/products/search' };
    }
  }

  /**
   * 🗺️ STRATEGY 4: LOCATION-SPECIFIC SEARCH
   */
  private async strategyLocationSpecificSearch(locationTerms: string[], destinationName: string, currency: string): Promise<SearchResult> {
    if (locationTerms.length === 0) {
      return { products: [], strategy: 'location_specific_search', confidence: 0, apiEndpoint: 'skipped' };
    }

    try {
      const searchTerm = `${locationTerms.slice(0, 2).join(' ')} ${destinationName}`;
      
      const response = await viatorService.axiosInstance.post('/search/freetext', {
        searchTerm: searchTerm,
        searchTypes: [{
          searchType: 'PRODUCTS',
          pagination: { start: 1, count: 20 }
        }],
        currency: currency
      });

      const products = response.data?.searchResults?.[0]?.results || [];
      
      return {
        products,
        strategy: 'location_specific_search',
        confidence: 80,
        apiEndpoint: '/search/freetext'
      };
    } catch (error) {
      console.error('Strategy 4 (Location Specific) failed:', error);
      return { products: [], strategy: 'location_specific_search', confidence: 0, apiEndpoint: '/search/freetext' };
    }
  }

  /**
   * 📊 STRATEGY 5: CATEGORY-BASED SEARCH
   */
  private async strategyCategoryBasedSearch(query: string, destinationId: number, currency: string): Promise<SearchResult> {
    try {
      // Determine likely categories from query
      const categories = this.inferCategories(query);
      
      if (categories.length === 0) {
        return { products: [], strategy: 'category_based_search', confidence: 0, apiEndpoint: 'skipped' };
      }

      const response = await viatorService.axiosInstance.post('/products/search', {
        filtering: {
          destination: destinationId.toString(),
          catIds: categories
        },
        sorting: {
          sort: "TRAVELER_RATING",
          order: "DESCENDING"
        },
        pagination: {
          start: 1,
          count: 25
        },
        currency: currency
      });

      const products = response.data?.products || [];
      
      return {
        products,
        strategy: 'category_based_search',
        confidence: 70,
        apiEndpoint: '/products/search'
      };
    } catch (error) {
      console.error('Strategy 5 (Category Based) failed:', error);
      return { products: [], strategy: 'category_based_search', confidence: 0, apiEndpoint: '/products/search' };
    }
  }

  /**
   * 🌍 STRATEGY 6: BROAD DESTINATION SEARCH (Fallback)
   */
  private async strategyBroadDestinationSearch(destinationName: string, currency: string): Promise<SearchResult> {
    try {
      const response = await viatorService.axiosInstance.post('/search/freetext', {
        searchTerm: destinationName,
        searchTypes: [{
          searchType: 'PRODUCTS',
          pagination: { start: 1, count: 50 }
        }],
        currency: currency
      });

      const products = response.data?.searchResults?.[0]?.results || [];
      
      return {
        products,
        strategy: 'broad_destination_search',
        confidence: 50,
        apiEndpoint: '/search/freetext'
      };
    } catch (error) {
      console.error('Strategy 6 (Broad Destination) failed:', error);
      return { products: [], strategy: 'broad_destination_search', confidence: 0, apiEndpoint: '/search/freetext' };
    }
  }

  /**
   * 🔧 COMBINE AND DEDUPLICATE RESULTS
   */
  private combineAndDeduplicateResults(results: SearchResult[]): any[] {
    const seenCodes = new Set<string>();
    const combinedProducts: any[] = [];

    // Sort results by confidence (higher confidence first)
    results.sort((a, b) => b.confidence - a.confidence);

    for (const result of results) {
      for (const product of result.products) {
        const code = product.productCode || product.id;
        if (code && !seenCodes.has(code)) {
          seenCodes.add(code);
          // Add metadata about which strategy found this
          product._searchStrategy = result.strategy;
          product._searchConfidence = result.confidence;
          combinedProducts.push(product);
        }
      }
    }

    console.log(`🔄 Combined results: ${combinedProducts.length} unique products from ${results.length} strategies`);
    return combinedProducts;
  }

  /**
   * 🎯 FILTER FOR RELEVANCE
   */
  private filterForRelevance(products: any[], query: string, destinationName: string): any[] {
    const queryLower = query.toLowerCase();
    const destLower = destinationName.toLowerCase();
    
    return products.filter(product => {
      const title = (product.title || '').toLowerCase();
      const description = (product.shortDescription || product.description || '').toLowerCase();
      const content = `${title} ${description}`;

      // Basic relevance check
      const queryWords = queryLower.split(' ').filter(word => word.length > 2);
      const hasQueryMatch = queryWords.some(word => 
        title.includes(word) || description.includes(word)
      );

      // Location relevance check
      const hasLocationMatch = content.includes(destLower) || 
        content.includes(destinationName.toLowerCase()) ||
        this.hasGeographicMarkers(content, destinationName);

      // At least one of these should be true for relevance
      return hasQueryMatch || hasLocationMatch || product._searchConfidence >= 80;
    });
  }

  /**
   * 🗺️ CHECK FOR GEOGRAPHIC MARKERS
   */
  private hasGeographicMarkers(content: string, destinationName: string): boolean {
    const locationMarkers = this.getLocationMarkers(destinationName);
    return locationMarkers.some(marker => content.includes(marker.toLowerCase()));
  }

  /**
   * 🏷️ INFER CATEGORIES FROM QUERY
   */
  private inferCategories(query: string): number[] {
    const categoryMap: { [key: string]: number[] } = {
      'food': [32, 33, 49], // Food & drink categories
      'tour': [1, 2, 3], // Tours & sightseeing
      'museum': [7, 8], // Museums & culture
      'adventure': [25, 26, 27], // Adventure & outdoor
      'water': [21, 22], // Water activities
      'fishing': [22, 107], // Fishing & marine
      'cooking': [49, 152], // Cooking classes
      'cultural': [7, 8, 9] // Cultural activities
    };

    const queryLower = query.toLowerCase();
    const matchedCategories: number[] = [];

    for (const [keyword, categories] of Object.entries(categoryMap)) {
      if (queryLower.includes(keyword)) {
        matchedCategories.push(...categories);
      }
    }

    return [...new Set(matchedCategories)]; // Remove duplicates
  }

  /**
   * 📍 GET LOCATION MARKERS
   */
  private getLocationMarkers(destinationName: string): string[] {
    const locationMap: { [key: string]: string[] } = {
      'tokyo': ['japan', 'japanese', 'shibuya', 'harajuku', 'ginza'],
      'paris': ['france', 'french', 'louvre', 'seine', 'montmartre'],
      'london': ['england', 'uk', 'british', 'thames', 'westminster'],
      'barcelona': ['spain', 'spanish', 'catalan', 'sagrada familia', 'gaudi'],
      'rome': ['italy', 'italian', 'vatican', 'colosseum', 'roman'],
      'kona': ['hawaii', 'big island', 'hawaiian', 'aloha'],
      'maui': ['hawaii', 'hawaiian', 'aloha', 'haleakala']
    };

    const destLower = destinationName.toLowerCase();
    for (const [location, markers] of Object.entries(locationMap)) {
      if (destLower.includes(location)) {
        return markers;
      }
    }

    return [];
  }
}

export const comprehensiveSearchEngine = new ComprehensiveSearchEngine();
