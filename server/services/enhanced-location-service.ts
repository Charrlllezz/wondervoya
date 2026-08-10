/**
 * 🌍 ENHANCED LOCATION SERVICE
 * Advanced destination search and categorization for Plan Your Adventure modal
 * Provides intelligent location suggestions with contextual categorization
 */

import { auxiliaryDataManager } from './auxiliary-data-manager';

export interface EnhancedDestination {
  id: number;
  name: string;
  country?: string;
  category: 'popular' | 'beach' | 'cultural' | 'adventure' | 'city' | 'other';
  score: number;
  region?: string;
  // For deduplication - store all merged IDs
  alternativeIds?: number[];
  displayName?: string;
}

export interface LocationSearchResult {
  destinations: EnhancedDestination[];
  popularSuggestions: EnhancedDestination[];
  categorizedResults: {
    popular: EnhancedDestination[];
    beach: EnhancedDestination[];
    cultural: EnhancedDestination[];
    adventure: EnhancedDestination[];
    cities: EnhancedDestination[];
  };
}

class EnhancedLocationService {
  private static readonly POPULAR_DESTINATIONS = [
    'paris', 'london', 'tokyo', 'rome', 'barcelona', 'new york', 'hawaii', 
    'amsterdam', 'dubai', 'singapore', 'istanbul', 'bangkok', 'sydney', 'rio'
  ];

  private static readonly BEACH_DESTINATIONS = [
    'hawaii', 'maldives', 'bali', 'cancun', 'miami', 'santorini', 'ibiza', 
    'mykonos', 'phuket', 'barbados', 'seychelles', 'fiji'
  ];

  private static readonly CULTURAL_DESTINATIONS = [
    'tokyo', 'kyoto', 'rome', 'florence', 'istanbul', 'cairo', 'prague', 
    'vienna', 'jerusalem', 'varanasi', 'cusco', 'marrakech'
  ];

  private static readonly ADVENTURE_DESTINATIONS = [
    'queenstown', 'interlaken', 'banff', 'patagonia', 'iceland', 'nepal', 
    'costa rica', 'peru', 'norway', 'chile', 'new zealand'
  ];

  /**
   * Enhanced destination search with intelligent categorization
   */
  async searchDestinations(
    query: string, 
    limit: number = 15
  ): Promise<LocationSearchResult> {
    try {
      const allDestinations = await auxiliaryDataManager.getDestinations();
      const queryLower = query.toLowerCase().trim();
      
      console.log(`🌍 Enhanced location search: "${query}" across ${allDestinations.length} destinations`);

      // Enhanced matching and scoring
      const matchedDestinations = allDestinations
        .filter(dest => {
          const name = (dest.name || '').toLowerCase();
          const country = ((dest as any).country || '').toLowerCase();
          
          return name.includes(queryLower) || 
                 name.startsWith(queryLower) ||
                 country.includes(queryLower) ||
                 queryLower.includes(name.split(' ')[0]) ||
                 queryLower.includes(name.split(',')[0]);
        })
        .map(dest => EnhancedLocationService.enhanceDestination(dest, queryLower));

      // Smart deduplication - merge similar destinations
      const deduplicatedDestinations = EnhancedLocationService.smartDeduplicate(matchedDestinations);
      
      // Sort and limit after deduplication
      const finalResults = deduplicatedDestinations
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      // Categorize results
      const categorizedResults = EnhancedLocationService.categorizeDestinations(finalResults);

      // Get popular suggestions if query is empty or short
      const popularSuggestions = queryLower.length < 3 
        ? await this.getPopularSuggestions(10)
        : [];

      console.log(`✅ Enhanced search results: ${finalResults.length} matches (deduplicated from ${matchedDestinations.length}), ${popularSuggestions.length} popular suggestions`);

      return {
        destinations: finalResults,
        popularSuggestions,
        categorizedResults
      };

    } catch (error) {
      console.error('❌ Enhanced location search error:', error);
      return {
        destinations: [],
        popularSuggestions: [],
        categorizedResults: {
          popular: [],
          beach: [],
          cultural: [],
          adventure: [],
          cities: []
        }
      };
    }
  }

  /**
   * Enhance destination with categorization and scoring
   */
  private static enhanceDestination(dest: any, query: string): EnhancedDestination {
    const name = (dest.name || '').toLowerCase();
    const country = ((dest as any).country || '').toLowerCase();
    let score = 0;
    
    // Base scoring
    if (name === query) score = 100;
    else if (name.startsWith(query)) score = 80;
    else if (name.includes(query)) score = 60;
    else if (country.includes(query)) score = 50;
    else if (query.includes(name.split(' ')[0])) score = 40;

    // Category determination and bonus scoring
    let category: EnhancedDestination['category'] = 'other';
    
    if (EnhancedLocationService.POPULAR_DESTINATIONS.some(pop => name.includes(pop))) {
      category = 'popular';
      score += 20;
    } else if (EnhancedLocationService.BEACH_DESTINATIONS.some(beach => name.includes(beach))) {
      category = 'beach';
      score += 15;
    } else if (EnhancedLocationService.CULTURAL_DESTINATIONS.some(cultural => name.includes(cultural))) {
      category = 'cultural';
      score += 15;
    } else if (EnhancedLocationService.ADVENTURE_DESTINATIONS.some(adventure => name.includes(adventure))) {
      category = 'adventure';
      score += 15;
    } else if (name.includes('city') || country.length > 0) {
      category = 'city';
      score += 5;
    }

    return {
      id: dest.id || dest.destinationId,
      name: dest.name || (dest as any).destinationName || 'Unknown',
      country: (dest as any).country,
      category,
      score,
      region: EnhancedLocationService.determineRegion(country, dest.name || (dest as any).destinationName)
    };
  }

  /**
   * Smart deduplication - merge similar destinations for cleaner display
   */
  private static smartDeduplicate(destinations: EnhancedDestination[]): EnhancedDestination[] {
    const deduplicatedMap = new Map<string, EnhancedDestination>();
    
    destinations.forEach(dest => {
      const nameKey = EnhancedLocationService.generateDeduplicationKey(dest.name);
      
      if (deduplicatedMap.has(nameKey)) {
        const existing = deduplicatedMap.get(nameKey)!;
        
        // Merge destinations - keep the one with higher score but combine info
        if (dest.score > existing.score) {
          // New destination has higher score, make it primary
          const merged: EnhancedDestination = {
            ...dest,
            alternativeIds: [existing.id, ...(existing.alternativeIds || [])],
            displayName: EnhancedLocationService.chooseBestDisplayName(dest.name, existing.name)
          };
          deduplicatedMap.set(nameKey, merged);
        } else {
          // Existing has higher score, just add this ID as alternative
          existing.alternativeIds = existing.alternativeIds || [];
          existing.alternativeIds.push(dest.id);
          existing.displayName = EnhancedLocationService.chooseBestDisplayName(existing.name, dest.name);
        }
      } else {
        // First occurrence of this destination key
        deduplicatedMap.set(nameKey, {
          ...dest,
          displayName: dest.name
        });
      }
    });
    
    return Array.from(deduplicatedMap.values());
  }

  /**
   * Generate deduplication key for similar destinations
   */
  private static generateDeduplicationKey(name: string): string {
    let key = name.toLowerCase().trim();
    
    // Remove common suffixes/prefixes that create duplicates
    key = key.replace(/\s*(prefecture|state|province|city|metro|metropolitan|area|region)$/i, '');
    key = key.replace(/^(greater|metro|metropolitan)\s*/i, '');
    
    // For destinations like "Tokyo, Japan" vs "Tokyo" - use just the city name
    const commaIndex = key.indexOf(',');
    if (commaIndex > 0) {
      key = key.substring(0, commaIndex).trim();
    }
    
    // Remove extra spaces
    key = key.replace(/\s+/g, ' ').trim();
    
    return key;
  }

  /**
   * Choose the best display name from similar destinations
   */
  private static chooseBestDisplayName(name1: string, name2: string): string {
    // Prefer the more descriptive name (usually includes country/region)
    if (name1.includes(',') && !name2.includes(',')) return name1;
    if (!name1.includes(',') && name2.includes(',')) return name2;
    
    // Prefer shorter names if both are similar
    if (Math.abs(name1.length - name2.length) < 3) {
      return name1.length <= name2.length ? name1 : name2;
    }
    
    // Prefer longer descriptive names
    return name1.length > name2.length ? name1 : name2;
  }

  /**
   * Categorize destinations for organized display
   */
  private static categorizeDestinations(destinations: EnhancedDestination[]) {
    return {
      popular: destinations.filter(d => d.category === 'popular'),
      beach: destinations.filter(d => d.category === 'beach'),
      cultural: destinations.filter(d => d.category === 'cultural'),
      adventure: destinations.filter(d => d.category === 'adventure'),
      cities: destinations.filter(d => d.category === 'city')
    };
  }

  /**
   * Get popular destination suggestions (public method)
   */
  async getPopularSuggestions(limit: number): Promise<EnhancedDestination[]> {
    try {
      const allDestinations = await auxiliaryDataManager.getDestinations();
      
      const popularMatches = allDestinations
        .filter(dest => {
          const name = (dest.name || '').toLowerCase();
          return EnhancedLocationService.POPULAR_DESTINATIONS.some(pop => name.includes(pop));
        })
        .map(dest => EnhancedLocationService.enhanceDestination(dest, ''));

      // Apply smart deduplication to popular suggestions too
      const deduplicatedPopular = EnhancedLocationService.smartDeduplicate(popularMatches);
      
      return deduplicatedPopular
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    } catch (error) {
      console.error('❌ Error getting popular suggestions:', error);
      return [];
    }
  }

  /**
   * Determine geographical region from destination name or country
   */
  private static determineRegion(country?: string, destinationName?: string): string {
    const name = (destinationName || '').toLowerCase();
    const countryLower = (country || '').toLowerCase();
    
    // Enhanced region detection using both country and destination name
    
    // North America
    if (['usa', 'united states', 'canada', 'mexico', 'us '].some(c => countryLower.includes(c) || name.includes(c)) ||
        name.includes('puerto rico') || name.includes('puerto del') || name.includes('puerto vallarta')) {
      return 'North America';
    }
    
    // Europe
    if (['uk', 'united kingdom', 'france', 'italy', 'spain', 'germany', 'netherlands', 'belgium', 
         'switzerland', 'austria', 'portugal', 'greece', 'ireland', 'norway', 'sweden', 'denmark'].some(c => 
         countryLower.includes(c) || name.includes(c))) {
      return 'Europe';
    }
    
    // Asia
    if (['japan', 'china', 'thailand', 'singapore', 'indonesia', 'malaysia', 'philippines', 'vietnam',
         'korea', 'india', 'taiwan', 'hong kong', 'macau', 'myanmar', 'cambodia', 'laos'].some(c => 
         countryLower.includes(c) || name.includes(c)) ||
        name.includes('tokyo') || name.includes('kyoto') || name.includes('osaka')) {
      return 'Asia';
    }
    
    // Oceania
    if (['australia', 'new zealand', 'fiji', 'vanuatu', 'samoa'].some(c => 
         countryLower.includes(c) || name.includes(c)) ||
        name.includes('sydney') || name.includes('melbourne') || name.includes('auckland')) {
      return 'Oceania';
    }
    
    // South America
    if (['brazil', 'argentina', 'chile', 'peru', 'colombia', 'venezuela', 'ecuador', 'bolivia',
         'uruguay', 'paraguay'].some(c => countryLower.includes(c) || name.includes(c)) ||
        name.includes('rio de') || name.includes('buenos aires') || name.includes('lima')) {
      return 'South America';
    }
    
    // Central America & Caribbean
    if (['costa rica', 'panama', 'guatemala', 'belize', 'honduras', 'nicaragua', 'el salvador',
         'jamaica', 'cuba', 'dominican republic', 'haiti', 'bahamas', 'barbados', 'trinidad'].some(c => 
         countryLower.includes(c) || name.includes(c))) {
      return 'Central America';
    }
    
    // Africa
    if (['south africa', 'kenya', 'tanzania', 'egypt', 'morocco', 'tunisia', 'ghana', 'nigeria',
         'senegal', 'gambia', 'madagascar', 'mauritius', 'seychelles'].some(c => 
         countryLower.includes(c) || name.includes(c)) ||
        name.includes('cape town') || name.includes('marrakech') || name.includes('cairo')) {
      return 'Africa';
    }
    
    // Middle East
    if (['israel', 'jordan', 'lebanon', 'syria', 'turkey', 'uae', 'dubai', 'qatar', 'kuwait',
         'saudi arabia', 'oman', 'bahrain'].some(c => countryLower.includes(c) || name.includes(c))) {
      return 'Middle East';
    }
    
    // If we can't determine from explicit mappings, return a more descriptive fallback
    if (country && country !== 'Unknown') {
      return country;
    }
    
    return 'International';
  }
}

export const enhancedLocationService = new EnhancedLocationService();