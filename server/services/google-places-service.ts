/**
 * Google Places Service - Cost-conscious venue data fetching
 * Transforms data into ActivityRecommendation format for seamless integration
 */

import type { ActivityRecommendation } from '@shared/schema';

interface GooglePlacePhoto {
  name: string;
  width_px: number;
  height_px: number;
}

interface GooglePlace {
  id: string;
  displayName: {
    text: string;
  };
  formattedAddress: string;
  rating?: number;
  userRatingCount?: number;
  photos?: GooglePlacePhoto[];
  websiteUri?: string;
  regularOpeningHours?: {
    openNow: boolean;
    weekdayDescriptions: string[];
  };
  priceLevel?: 'PRICE_LEVEL_FREE' | 'PRICE_LEVEL_INEXPENSIVE' | 'PRICE_LEVEL_MODERATE' | 'PRICE_LEVEL_EXPENSIVE' | 'PRICE_LEVEL_VERY_EXPENSIVE';
  types: string[];
  location: {
    latitude: number;
    longitude: number;
  };
}

interface GooglePlacesSearchResponse {
  places: GooglePlace[];
}

class GooglePlacesService {
  private apiKey: string;
  private baseUrl = 'https://places.googleapis.com/v1/places';
  private requestCount = 0;
  private maxRequestsPerSession = 20; // Strict limit to control costs
  private lastResetTime = Date.now();

  constructor() {
    this.apiKey = process.env.GOOGLE_PLACES_API_KEY || '';
    if (!this.apiKey) {
      console.warn('⚠️ Google Places API key not found. Direct venue search will be disabled.');
    } else {
      console.log('✅ Google Places service initialized with API key present');
    }
  }

  /**
   * Cost-conscious request tracking
   */
  private checkRequestLimit(): boolean {
    // Reset counter every hour
    const now = Date.now();
    if (now - this.lastResetTime > 3600000) {
      this.requestCount = 0;
      this.lastResetTime = now;
    }

    if (this.requestCount >= this.maxRequestsPerSession) {
      console.warn(`🚫 Google Places request limit reached (${this.maxRequestsPerSession}/hour). Skipping venue search.`);
      return false;
    }

    return true;
  }

  /**
   * Get location bias for destination (avoid hardcoded Tokyo!)
   */
  private getLocationBiasForDestination(destinationName: string): any {
    const lowerName = destinationName.toLowerCase();
    
    // Major destinations with known coordinates
    const coordinates = {
      'tokyo': { latitude: 35.6762, longitude: 139.6503, radius: 30000 },
      'paris': { latitude: 48.8566, longitude: 2.3522, radius: 25000 },
      'london': { latitude: 51.5074, longitude: -0.1278, radius: 30000 },
      'new york': { latitude: 40.7128, longitude: -74.0060, radius: 35000 },
      'rome': { latitude: 41.9028, longitude: 12.4964, radius: 25000 },
      'barcelona': { latitude: 41.3851, longitude: 2.1734, radius: 25000 }
    };
    
    for (const [city, coords] of Object.entries(coordinates)) {
      if (lowerName.includes(city)) {
        console.log(`🎯 GOOGLE PLACES: Using ${city} coordinates for "${destinationName}"`);
        return {
          circle: {
            center: { latitude: coords.latitude, longitude: coords.longitude },
            radius: coords.radius
          }
        };
      }
    }
    
    console.log(`⚠️ GOOGLE PLACES: No coordinates found for "${destinationName}", using no location bias`);
    return null;
  }

  /**
   * Search for specific venues mentioned in AI responses - COST OPTIMIZED
   */
  async searchVenues(query: string, destinationName: string): Promise<ActivityRecommendation[]> {
    if (!this.apiKey) {
      console.log('⚠️ Google Places API key not available, skipping venue search');
      return [];
    }

    if (!this.checkRequestLimit()) {
      return [];
    }

    try {
      this.requestCount++;
      console.log(`🏛️ GOOGLE PLACES: Request ${this.requestCount}/${this.maxRequestsPerSession} - Searching for "${query}" in ${destinationName}`);

      const searchQuery = `${query} ${destinationName}`;
      const requestBody = {
        textQuery: searchQuery,
        maxResultCount: 8, // Increased for museums to get more venues
        // Dynamic locationBias based on destination - NO hardcoded Tokyo!
        ...(this.getLocationBiasForDestination(destinationName) && {
          locationBias: this.getLocationBiasForDestination(destinationName)
        })
      };

      const fieldMask = 'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.photos,places.websiteUri,places.priceLevel,places.types';
      
      const response = await fetch(`${this.baseUrl}:searchText`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.apiKey,
          'X-Goog-FieldMask': fieldMask
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`❌ Google Places API error: ${response.status} ${response.statusText}`);
        console.error(`📋 Request body:`, JSON.stringify(requestBody, null, 2));
        console.error(`📋 Error response:`, errorBody);
        return [];
      }

      const data: GooglePlacesSearchResponse = await response.json();
      
      if (!data.places || data.places.length === 0) {
        console.log(`ℹ️ No venues found for "${query}" in ${destinationName}`);
        return [];
      }

      console.log(`✅ GOOGLE PLACES: Found ${data.places.length} venues (${this.requestCount}/${this.maxRequestsPerSession} requests used)`);

      const activities = data.places.map(place => this.transformPlaceToActivity(place, destinationName));
      return activities.filter(activity => activity !== null) as ActivityRecommendation[];

    } catch (error) {
      console.error('❌ Google Places search failed:', error);
      return [];
    }
  }

  /**
   * Transform Google Place data into ActivityRecommendation format
   */
  private transformPlaceToActivity(place: GooglePlace, destinationName: string): ActivityRecommendation | null {
    try {
      // Generate secure proxy image URL (no API key exposure)
      let imageUrl = '/api/placeholder/400/300';
      if (place.photos && place.photos.length > 0) {
        const photo = place.photos[0];
        // Use secure server-side proxy to fetch images without exposing API key
        const encodedPhotoName = encodeURIComponent(photo.name);
        imageUrl = `/api/google-places/photo/${encodedPhotoName}?maxWidthPx=300&maxHeightPx=200`;
      }

      // Determine price from Google's price level
      let price: { amount: number; currency: string } | null = null;
      if (place.priceLevel) {
        const priceMap = {
          'PRICE_LEVEL_FREE': { amount: 0, currency: 'USD' },
          'PRICE_LEVEL_INEXPENSIVE': { amount: 15, currency: 'USD' },
          'PRICE_LEVEL_MODERATE': { amount: 30, currency: 'USD' },
          'PRICE_LEVEL_EXPENSIVE': { amount: 60, currency: 'USD' },
          'PRICE_LEVEL_VERY_EXPENSIVE': { amount: 100, currency: 'USD' }
        };
        price = priceMap[place.priceLevel];
      }

      // Generate description based on venue type
      const venueTypes = place.types || [];
      let description = 'Visit this venue directly at your own pace.';
      
      if (venueTypes.includes('museum')) {
        description = 'Explore this museum with self-guided access. Check website for current exhibitions and opening hours.';
      } else if (venueTypes.includes('art_gallery')) {
        description = 'Discover art collections and exhibitions at this gallery. Visit independently or check for guided tours.';
      } else if (venueTypes.includes('tourist_attraction')) {
        description = 'Experience this popular attraction. Plan your visit and check for any entry requirements.';
      }

      // Determine duration based on venue type
      let duration = 'Flexible timing';
      if (venueTypes.includes('museum') || venueTypes.includes('art_gallery')) {
        duration = '1-3 hours (self-guided)';
      } else if (venueTypes.includes('park')) {
        duration = '30 minutes - all day';
      }

      const activity: ActivityRecommendation = {
        productCode: '', // Empty to prevent availability checks for direct venues
        title: place.displayName.text,
        description,
        price,
        rating: place.rating || 0,
        reviewCount: place.userRatingCount || 0,
        imageUrl,
        duration,
        location: place.formattedAddress,
        bookingUrl: place.websiteUri || `https://www.google.com/maps/place/?q=place_id:${place.id}`,
        tags: ['direct-visit', 'google-places', ...venueTypes.slice(0, 3)]
      };

      console.log(`🏛️ TRANSFORMED VENUE: "${activity.title}" - ${activity.rating}⭐ (${activity.reviewCount} reviews)`);
      return activity;

    } catch (error) {
      console.error(`❌ Failed to transform place:`, error);
      return null;
    }
  }

  /**
   * Extract venue names from AI assistant message for targeted searches
   */
  extractVenueNames(aiMessage: string): string[] {
    console.log(`🔍 VENUE EXTRACTION: Processing AI message (length: ${aiMessage.length})`);
    console.log(`🔍 VENUE EXTRACTION: Message content: "${aiMessage.substring(0, 200)}${aiMessage.length > 200 ? '...' : ''}"`);
    
    const venues: string[] = [];
    
    // Enhanced venue patterns with better casual language detection and confidence scoring
    const venuePatterns = [
      // Museum patterns - formal and casual
      { regex: /(?:visit|see|explore|check out|don't miss)\s+([^,.\n]+?(?:museum|gallery|art center|museo))/gi, confidence: 0.9 },
      // Specific venue mentions with quotes or emphasis
      { regex: /"([^"]+)"/g, confidence: 0.95 },
      { regex: /\*([^*]+)\*/g, confidence: 0.9 },
      // Landmark patterns - expanded
      { regex: /(?:visit|see|explore|check out|must see)\s+([^,.\n]+?(?:cathedral|church|basilica|palace|castle|tower|monument|plaza|square))/gi, confidence: 0.85 },
      // Famous landmarks by structure patterns
      { regex: /(Casa [A-Z][a-z]+|Park [A-Z][a-z]+|Palau [A-Z][a-z]+|[A-Z][a-z]+ House|[A-Z][a-z]+ Palace)/gi, confidence: 0.9 },
      // Casual recommendation patterns
      { regex: /(?:check out|don't miss|must see|highly recommend)\s+([A-Z][^,.\n]{5,35})/gi, confidence: 0.8 },
      // Generic venue extraction for cultural sites
      { regex: /the\s+([^,.\n]+?(?:museum|gallery|center|cathedral|palace|monument|tower|building|market|plaza))/gi, confidence: 0.75 },
      // Barcelona-specific enhanced patterns
      { regex: /(Museu Picasso|MNAC|Joan Miró Foundation|MACBA|Museum of Contemporary Art|Casa Batlló|Casa Milà|La Pedrera|Sagrada Familia|Park Güell|Gothic Quarter|Born District|Boqueria Market)/gi, confidence: 0.95 },
      // Neighborhood and district patterns
      { regex: /([A-Z][a-z]+\s+(?:Quarter|District|Neighborhood|Area|Barrio|Gothic|Born))/gi, confidence: 0.8 },
      // Architecture and building patterns
      { regex: /([A-Z][a-z\s]+(?:designed by|built by|architect))/gi, confidence: 0.7 }
    ];

    for (const pattern of venuePatterns) {
      let match;
      while ((match = pattern.regex.exec(aiMessage)) !== null) {
        const venue = match[1]?.trim();
        if (venue && venue.length > 3 && venue.length < 50) {
          // Filter out generic terms and common words
          const genericTerms = ['the city', 'the area', 'the place', 'the location', 'this place', 'many places', 'various locations'];
          const isGeneric = genericTerms.some(term => venue.toLowerCase().includes(term.toLowerCase()));
          
          if (!isGeneric && !venues.some(v => this.isSimilarVenue(v, venue))) {
            venues.push(venue);
          }
        }
      }
    }

    // Remove duplicates and clean up, increased limit for better coverage
    const uniqueVenues = Array.from(new Set(venues))
      .filter(venue => venue.length > 3)
      .slice(0, 6); // Increased from 3 to 6 for better coverage

    if (uniqueVenues.length > 0) {
      console.log(`🎯 EXTRACTED VENUES: ${uniqueVenues.join(', ')}`);
    }

    return uniqueVenues;
  }

  /**
   * Check if two venue names refer to the same place
   */
  private isSimilarVenue(venue1: string, venue2: string): boolean {
    const normalize = (name: string) => name.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    
    const name1 = normalize(venue1);
    const name2 = normalize(venue2);
    
    // Exact match
    if (name1 === name2) return true;
    
    // Check if one contains the other (for variations like "Casa Batlló" vs "Casa Batlló House")
    if (name1.includes(name2) || name2.includes(name1)) return true;
    
    // Check for common venue name patterns
    const extractCore = (name: string) => {
      // Remove common prefixes/suffixes
      return name.replace(/(museum|gallery|casa|palace|house|center|centre)$/, '')
        .replace(/^(the|museo|museu|palau)\s+/, '')
        .trim();
    };
    
    const core1 = extractCore(name1);
    const core2 = extractCore(name2);
    
    return core1 === core2 && core1.length > 2;
  }

  /**
   * Check if Google Places API is available
   */
  isAvailable(): boolean {
    return !!this.apiKey && this.checkRequestLimit();
  }

  /**
   * Get current usage stats for monitoring
   */
  getUsageStats(): { requests: number; limit: number; remaining: number } {
    return {
      requests: this.requestCount,
      limit: this.maxRequestsPerSession,
      remaining: this.maxRequestsPerSession - this.requestCount
    };
  }
}

export const googlePlacesService = new GooglePlacesService();