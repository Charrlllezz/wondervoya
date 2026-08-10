
import { tiqetsService } from './tiqets';
import type { ActivityRecommendation } from '@shared/schema';

interface TiqetsSearchOptions {
  currency?: string;
  limit?: number;
  city?: string;
  country?: string;
  category?: string;
  sessionId?: string;
}

export class EnhancedTiqetsService {
  private diversityCache = new Map<string, Set<string>>();

  /**
   * Search products with enhanced filtering and diversity
   */
  async searchProducts(
    query: string,
    options: TiqetsSearchOptions = {}
  ): Promise<ActivityRecommendation[]> {
    console.log(`🎫 Enhanced Tiqets search: "${query}"`);

    try {
      // Get raw results from base service
      const rawResults = await tiqetsService.searchProducts(query, {
        city: options.city,
        country: options.country,
        category: options.category,
        limit: options.limit || 20,
        currency: options.currency || 'USD'
      });

      // Apply intelligent filtering
      const filteredResults = this.applyIntelligentFiltering(rawResults, query);

      // Apply diversity filtering if session provided
      if (options.sessionId) {
        return this.applyDiversityFilter(filteredResults, options.sessionId, query);
      }

      return filteredResults.slice(0, options.limit || 10);

    } catch (error) {
      console.error('❌ Enhanced Tiqets search error:', error);
      return [];
    }
  }

  /**
   * Get product details
   */
  async getProductDetails(productId: string) {
    return await tiqetsService.getProductDetails(productId);
  }

  /**
   * Search by destination and query
   */
  async searchByDestination(
    query: string,
    destinationName: string,
    options: TiqetsSearchOptions = {}
  ): Promise<ActivityRecommendation[]> {
    console.log(`🎫 Tiqets destination search: "${query}" in ${destinationName}`);

    // Extract city/country from destination name
    const locationInfo = this.parseDestination(destinationName);

    return await this.searchProducts(query, {
      ...options,
      city: locationInfo.city,
      country: locationInfo.country
    });
  }

  /**
   * Apply intelligent filtering based on query intent
   */
  private applyIntelligentFiltering(
    results: ActivityRecommendation[],
    query: string
  ): ActivityRecommendation[] {
    const queryLower = query.toLowerCase();

    // Category-specific filtering
    if (queryLower.includes('museum') || queryLower.includes('gallery')) {
      return results.filter(activity => {
        const content = `${activity.title} ${activity.description}`.toLowerCase();
        return content.includes('museum') || 
               content.includes('gallery') || 
               content.includes('art') ||
               content.includes('exhibition');
      });
    }

    if (queryLower.includes('theater') || queryLower.includes('show') || queryLower.includes('concert')) {
      return results.filter(activity => {
        const content = `${activity.title} ${activity.description}`.toLowerCase();
        return content.includes('theater') || 
               content.includes('show') || 
               content.includes('performance') ||
               content.includes('concert');
      });
    }

    if (queryLower.includes('attraction') || queryLower.includes('landmark')) {
      return results.filter(activity => {
        const tags = activity.tags?.join(' ').toLowerCase() || '';
        const content = `${activity.title} ${activity.description}`.toLowerCase();
        return content.includes('tower') || 
               content.includes('palace') || 
               content.includes('castle') ||
               content.includes('monument') ||
               tags.includes('historical') ||
               tags.includes('skip the line');
      });
    }

    // Apply general quality filtering
    return results.filter(activity => {
      // Filter out low-quality or irrelevant results
      const title = activity.title.toLowerCase();
      
      // Exclude restaurant reservations, transfers, etc.
      const excludeTerms = [
        'restaurant reservation', 'dinner reservation', 'transfer',
        'hotel pickup', 'transport only', 'parking'
      ];
      
      return !excludeTerms.some(term => title.includes(term));
    });
  }

  /**
   * Apply diversity filtering to prevent similar attractions
   */
  private applyDiversityFilter(
    results: ActivityRecommendation[],
    sessionId: string,
    query: string
  ): ActivityRecommendation[] {
    if (!this.diversityCache.has(sessionId)) {
      this.diversityCache.set(sessionId, new Set());
    }

    const shownProducts = this.diversityCache.get(sessionId)!;

    // Filter out already shown products
    const newResults = results.filter(activity => 
      !shownProducts.has(activity.productCode)
    );

    // Apply venue-based diversity (similar to your Viator implementation)
    const diverseResults = this.applyVenueDiversity(newResults, query);

    // Track shown products
    diverseResults.forEach(activity => shownProducts.add(activity.productCode));

    // Clean up old sessions
    if (this.diversityCache.size > 100) {
      const oldestSession = Array.from(this.diversityCache.keys())[0];
      this.diversityCache.delete(oldestSession);
    }

    console.log(`✅ Tiqets diversity filter: ${diverseResults.length} unique attractions`);
    return diverseResults.slice(0, 8);
  }

  /**
   * Apply venue-based diversity to ensure different attractions
   */
  private applyVenueDiversity(
    results: ActivityRecommendation[],
    query: string
  ): ActivityRecommendation[] {
    const venueMap = new Map<string, ActivityRecommendation[]>();
    
    // Group by venue/attraction
    results.forEach(activity => {
      const venue = this.extractVenueName(activity.title);
      if (!venueMap.has(venue)) {
        venueMap.set(venue, []);
      }
      venueMap.get(venue)!.push(activity);
    });

    const diverseResults: ActivityRecommendation[] = [];
    
    // For cultural attractions, prefer one per venue
    const maxPerVenue = query.toLowerCase().includes('museum') ? 1 : 2;
    
    for (const [venue, activities] of venueMap.entries()) {
      const sortedActivities = activities.sort((a, b) => 
        (b.rating || 0) - (a.rating || 0)
      );
      diverseResults.push(...sortedActivities.slice(0, maxPerVenue));
      
      if (diverseResults.length >= 8) break;
    }

    return diverseResults;
  }

  /**
   * Extract venue name from activity title
   */
  private extractVenueName(title: string): string {
    const titleLower = title.toLowerCase();
    
    // Common venue patterns
    const venuePatterns = [
      /(louvre)/i,
      /(versailles)/i,
      /(notre.?dame)/i,
      /(eiffel tower)/i,
      /(sagrada familia)/i,
      /(colosseum)/i,
      /(vatican)/i,
      /(big ben)/i,
      /(tower bridge)/i,
      /^([^:]+museum)/i,
      /^([^:]+gallery)/i,
      /^([^:]+theater)/i,
      /^([^:]+palace)/i
    ];
    
    for (const pattern of venuePatterns) {
      const match = title.match(pattern);
      if (match) {
        return match[1].trim().toLowerCase();
      }
    }
    
    // Fallback: use first 3 words
    return title.split(' ').slice(0, 3).join(' ').toLowerCase();
  }

  /**
   * Parse destination name to extract city/country
   */
  private parseDestination(destinationName: string): { city?: string; country?: string } {
    const destLower = destinationName.toLowerCase();
    
    // Common destination mappings
    const destinationMap: { [key: string]: { city: string; country: string } } = {
      'paris': { city: 'Paris', country: 'France' },
      'london': { city: 'London', country: 'United Kingdom' },
      'rome': { city: 'Rome', country: 'Italy' },
      'barcelona': { city: 'Barcelona', country: 'Spain' },
      'amsterdam': { city: 'Amsterdam', country: 'Netherlands' },
      'berlin': { city: 'Berlin', country: 'Germany' },
      'madrid': { city: 'Madrid', country: 'Spain' },
      'vienna': { city: 'Vienna', country: 'Austria' },
      'florence': { city: 'Florence', country: 'Italy' },
      'prague': { city: 'Prague', country: 'Czech Republic' }
    };

    // Check for direct matches
    for (const [key, location] of Object.entries(destinationMap)) {
      if (destLower.includes(key)) {
        return location;
      }
    }

    // Try to parse "City, Country" format
    if (destinationName.includes(',')) {
      const parts = destinationName.split(',').map(p => p.trim());
      return {
        city: parts[0],
        country: parts[1]
      };
    }

    // Default to using the full name as city
    return { city: destinationName };
  }

  /**
   * Get suggested categories for a destination
   */
  getSuggestedCategories(destinationName: string): string[] {
    const destLower = destinationName.toLowerCase();
    
    // Destination-specific category suggestions
    if (destLower.includes('paris')) {
      return ['museums', 'monuments', 'attractions', 'art-galleries'];
    }
    
    if (destLower.includes('london')) {
      return ['theaters', 'museums', 'royal-palaces', 'attractions'];
    }
    
    if (destLower.includes('rome')) {
      return ['historical-sites', 'museums', 'religious-sites', 'monuments'];
    }
    
    // Default categories
    return ['museums', 'attractions', 'monuments', 'entertainment'];
  }

  /**
   * Clear caches
   */
  public clearCache(): void {
    tiqetsService.clearCache();
    this.diversityCache.clear();
    console.log('🗑️ Enhanced Tiqets cache cleared');
  }
}

export const enhancedTiqetsService = new EnhancedTiqetsService();
