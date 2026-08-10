/**
 * 🌍 ENHANCED DESTINATION SERVICE
 * 
 * Improves Viator destination data with better country mapping,
 * smart caching, and integration with ultimate search engine
 */

import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';

const VIATOR_API_BASE = 'https://api.viator.com/partner';
const API_KEY = process.env.VIATOR_API_KEY || '';
const DESTINATIONS_CACHE_FILE = 'viator-destinations-enhanced.json';

export interface EnhancedDestination {
  id: number;
  destinationId: number;
  name: string;
  destinationName: string;
  country: string;
  countryCode: string;
  timeZone: string;
  productCount: number;
  attractionCount: number;
  tourCount: number;
  lookupId: string;
  selectable: boolean;
  sortOrder: number;
  center?: {
    latitude: number;
    longitude: number;
  };
  type: 'COUNTRY' | 'REGION' | 'CITY' | 'ATTRACTION';
  parentDestinationId?: number;
  defaultCurrencyCode: string;
  isPopular: boolean;
  tier: 1 | 2 | 3; // Popularity tier for smart matching
}

export class EnhancedDestinationService {
  private axiosInstance;
  private destinations: EnhancedDestination[] = [];
  private countryMapping = new Map<number, string>();
  private lastRefresh: Date | null = null;
  private readonly CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: VIATOR_API_BASE,
      headers: {
        'exp-api-key': API_KEY,
        'Accept': 'application/json;version=2.0',

      },
      timeout: 30000,
    });

    this.initializeCountryMapping();
  }

  /**
   * Initialize country code to name mapping
   */
  private initializeCountryMapping() {
    // Major destination country mappings for better data quality
    const countries = {
      // Europe
      1: 'United Kingdom', 2: 'France', 3: 'Germany', 4: 'Italy', 5: 'Spain',
      6: 'Netherlands', 7: 'Austria', 8: 'Switzerland', 9: 'Belgium', 10: 'Portugal',
      64: 'Romania', 65: 'Greece', 66: 'Turkey', 67: 'Czech Republic',
      
      // North America  
      77: 'United States', 78: 'Canada', 79: 'Mexico',
      
      // Asia Pacific
      343: 'Japan', 344: 'China', 345: 'Thailand', 346: 'Singapore', 347: 'Australia',
      348: 'New Zealand', 349: 'South Korea', 350: 'Malaysia', 351: 'Indonesia',
      352: 'Philippines', 353: 'Vietnam', 354: 'Cambodia', 355: 'India',
      
      // Other popular destinations
      2632: 'United Arab Emirates', 2633: 'Egypt', 2634: 'South Africa',
      2635: 'Morocco', 2636: 'Jordan', 2637: 'Israel',
      
      // South America
      2638: 'Brazil', 2639: 'Argentina', 2640: 'Chile', 2641: 'Peru',
    };

    for (const [id, name] of Object.entries(countries)) {
      this.countryMapping.set(parseInt(id), name);
    }
  }

  /**
   * Get enhanced destinations with improved data quality
   */
  async getEnhancedDestinations(): Promise<EnhancedDestination[]> {
    // Check if cache is valid
    if (this.destinations.length > 0 && this.lastRefresh) {
      const cacheAge = Date.now() - this.lastRefresh.getTime();
      if (cacheAge < this.CACHE_DURATION) {
        console.log('✅ Using cached enhanced destinations');
        return this.destinations;
      }
    }

    // Try to load from file cache first
    try {
      const cacheData = await fs.readFile(DESTINATIONS_CACHE_FILE, 'utf-8');
      const cached = JSON.parse(cacheData);
      if (cached.destinations && cached.lastUpdated) {
        const fileAge = Date.now() - new Date(cached.lastUpdated).getTime();
        if (fileAge < this.CACHE_DURATION) {
          console.log('✅ Loaded enhanced destinations from file cache');
          this.destinations = cached.destinations;
          this.lastRefresh = new Date(cached.lastUpdated);
          return this.destinations;
        }
      }
    } catch (error) {
      console.log('📄 No valid file cache found, fetching fresh data');
    }

    // Fetch fresh data from API
    return await this.refreshDestinations();
  }

  /**
   * Refresh destinations from Viator API with enhancements
   */
  private async refreshDestinations(): Promise<EnhancedDestination[]> {
    console.log('🔄 Refreshing destinations from Viator API...');
    
    try {
      const response = await this.axiosInstance.get('/destinations');
      const rawDestinations = response.data?.destinations || response.data || [];
      
      if (!Array.isArray(rawDestinations)) {
        console.warn('Invalid destinations response format:', response.data);
        // Fallback to existing cache if available
        if (this.destinations.length > 0) {
          console.log('Using existing cached destinations');
          return this.destinations;
        }
        throw new Error('Invalid destinations API response format');
      }
      
      console.log(`📥 Fetched ${rawDestinations.length} raw destinations`);
      
      // Enhanced processing
      const enhanced = await this.enhanceDestinations(rawDestinations);
      
      // Filter and sort for quality
      this.destinations = enhanced
        .filter(d => d.name && d.name.trim().length > 0)
        .sort((a, b) => {
          // Sort by tier, then by product count, then alphabetically
          if (a.tier !== b.tier) return a.tier - b.tier;
          if (b.productCount !== a.productCount) return b.productCount - a.productCount;
          return a.name.localeCompare(b.name);
        });

      this.lastRefresh = new Date();

      // Save to file cache
      await this.saveToFileCache();

      console.log(`✅ Enhanced ${this.destinations.length} destinations`);
      return this.destinations;

    } catch (error) {
      console.error('❌ Failed to refresh destinations:', error);
      throw error;
    }
  }

  /**
   * Enhance raw destination data with better country mapping and categorization
   */
  private async enhanceDestinations(rawDestinations: any[]): Promise<EnhancedDestination[]> {
    const enhanced: EnhancedDestination[] = [];
    const countryDestinations = new Map<number, any>();

    // First pass: identify countries and regions
    for (const dest of rawDestinations) {
      if (dest.type === 'COUNTRY') {
        countryDestinations.set(dest.destinationId, dest);
      }
    }

    // Second pass: enhance all destinations
    for (const dest of rawDestinations) {
      try {
        const enhanced_dest: EnhancedDestination = {
          id: dest.destinationId,
          destinationId: dest.destinationId,
          name: dest.name,
          destinationName: dest.name,
          country: this.determineCountry(dest, countryDestinations),
          countryCode: this.determineCountryCode(dest, countryDestinations),
          timeZone: dest.timeZone || 'UTC',
          productCount: dest.productCount || 0,
          attractionCount: dest.attractionCount || 0,
          tourCount: dest.tourCount || 0,
          lookupId: dest.lookupId,
          selectable: dest.selectable !== false,
          sortOrder: this.calculateSortOrder(dest),
          center: dest.center,
          type: dest.type || 'CITY',
          parentDestinationId: dest.parentDestinationId,
          defaultCurrencyCode: dest.defaultCurrencyCode || 'USD',
          isPopular: this.isPopularDestination(dest),
          tier: this.calculateTier(dest)
        };

        enhanced.push(enhanced_dest);
      } catch (error) {
        console.warn(`Failed to enhance destination ${dest.name}:`, error);
      }
    }

    return enhanced;
  }

  /**
   * Determine country name with better logic
   */
  private determineCountry(dest: any, countryDestinations: Map<number, any>): string {
    // Direct mapping from our enhanced country list
    if (this.countryMapping.has(dest.destinationId)) {
      return this.countryMapping.get(dest.destinationId)!;
    }

    // Check parent destinations for country
    if (dest.parentDestinationId && countryDestinations.has(dest.parentDestinationId)) {
      const parentCountry = countryDestinations.get(dest.parentDestinationId);
      if (this.countryMapping.has(parentCountry.destinationId)) {
        return this.countryMapping.get(parentCountry.destinationId)!;
      }
      return parentCountry.name;
    }

    // Parse lookupId for country info
    if (dest.lookupId) {
      const parts = dest.lookupId.split('.');
      if (parts.length >= 2) {
        const countryId = parseInt(parts[1]);
        if (this.countryMapping.has(countryId)) {
          return this.countryMapping.get(countryId)!;
        }
      }
    }

    // Fallback based on timezone
    if (dest.timeZone) {
      const timezoneToCountry: { [key: string]: string } = {
        'Europe/London': 'United Kingdom',
        'Europe/Paris': 'France',
        'Europe/Rome': 'Italy',
        'Europe/Madrid': 'Spain',
        'Europe/Berlin': 'Germany',
        'America/New_York': 'United States',
        'America/Los_Angeles': 'United States',
        'America/Toronto': 'Canada',
        'Asia/Tokyo': 'Japan',
        'Australia/Sydney': 'Australia',
        // Add more mappings as needed
      };

      if (timezoneToCountry[dest.timeZone]) {
        return timezoneToCountry[dest.timeZone];
      }

      // Extract from timezone
      const tzParts = dest.timeZone.split('/');
      if (tzParts.length >= 2) {
        return tzParts[1].replace('_', ' ');
      }
    }

    return 'Unknown Country';
  }

  private determineCountryCode(dest: any, countryDestinations: Map<number, any>): string {
    // Simple country code mapping - extend as needed
    const countryToCode: { [key: string]: string } = {
      'United Kingdom': 'GB', 'France': 'FR', 'Germany': 'DE', 'Italy': 'IT',
      'Spain': 'ES', 'United States': 'US', 'Canada': 'CA', 'Japan': 'JP',
      'Australia': 'AU', 'Netherlands': 'NL', 'Switzerland': 'CH'
    };

    const country = this.determineCountry(dest, countryDestinations);
    return countryToCode[country] || 'XX';
  }

  private calculateSortOrder(dest: any): number {
    // Popular cities get lower sort order (appear first)
    const popularCities = [
      'tokyo', 'london', 'paris', 'new york', 'barcelona', 'rome', 'madrid',
      'berlin', 'amsterdam', 'sydney', 'toronto', 'los angeles', 'san francisco'
    ];
    
    const cityName = dest.name.toLowerCase();
    const popularIndex = popularCities.indexOf(cityName);
    
    if (popularIndex >= 0) {
      return popularIndex; // 0-12 for most popular
    }

    // Product count influences sort order
    const productBonus = Math.min(dest.productCount || 0, 100);
    return 100 - productBonus; // Higher product count = lower sort order
  }

  private isPopularDestination(dest: any): boolean {
    return (dest.productCount || 0) > 50 || this.calculateTier(dest) === 1;
  }

  private calculateTier(dest: any): 1 | 2 | 3 {
    const productCount = dest.productCount || 0;
    const name = dest.name.toLowerCase();
    
    // Tier 1: Major international destinations
    const tier1Cities = ['tokyo', 'london', 'paris', 'new york', 'barcelona', 'rome'];
    if (tier1Cities.includes(name) || productCount > 200) {
      return 1;
    }
    
    // Tier 2: Regional centers and popular destinations  
    if (productCount > 50 || dest.type === 'COUNTRY') {
      return 2;
    }
    
    // Tier 3: Everything else
    return 3;
  }

  private async saveToFileCache(): Promise<void> {
    try {
      const cacheData = {
        destinations: this.destinations,
        lastUpdated: this.lastRefresh?.toISOString(),
        version: '1.0'
      };
      
      await fs.writeFile(
        DESTINATIONS_CACHE_FILE, 
        JSON.stringify(cacheData, null, 2),
        'utf-8'
      );
      
      console.log('💾 Saved enhanced destinations to file cache');
    } catch (error) {
      console.warn('Failed to save destinations cache:', error);
    }
  }

  /**
   * Find destinations matching a query with enhanced matching
   */
  findMatchingDestinations(query: string, maxResults: number = 10): EnhancedDestination[] {
    if (!query || query.trim().length < 1) return [];

    const normalizedQuery = query.toLowerCase().trim();
    const matches: { dest: EnhancedDestination; score: number }[] = [];

    for (const dest of this.destinations) {
      const score = this.calculateDestinationMatchScore(normalizedQuery, dest);
      if (score > 0) {
        matches.push({ dest, score });
      }
    }

    return matches
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)
      .map(m => m.dest);
  }

  private calculateDestinationMatchScore(query: string, dest: EnhancedDestination): number {
    const name = dest.name.toLowerCase();
    const country = dest.country.toLowerCase();
    
    let score = 0;

    // Exact match
    if (name === query) score += 1000;
    else if (name.startsWith(query)) score += 800;
    else if (name.includes(query)) score += 400;

    // Country match
    if (country.includes(query)) score += 200;

    // Tier bonus (popular destinations ranked higher)
    score += (4 - dest.tier) * 100;

    // Product count bonus
    score += Math.min(dest.productCount, 50);

    return score;
  }
}

export const enhancedDestinationService = new EnhancedDestinationService();