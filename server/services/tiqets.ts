
import axios, { AxiosInstance } from 'axios';
import type { ActivityRecommendation } from '@shared/schema';

const TIQETS_API_BASE = 'https://api.tiqets.com/v2';
const API_KEY = process.env.TIQETS_API_KEY || '';

export interface TiqetsProduct {
  id: string;
  title: string;
  description: string;
  images?: Array<{ url: string }>;
  ratings?: {
    average: number;
    count: number;
  };
  pricing?: {
    from: number;
    currency: string;
  };
  location?: {
    city: string;
    country: string;
  };
  venue?: {
    name: string;
    address: string;
  };
  categories?: string[];
  highlights?: string[];
  duration?: string;
  skip_line?: boolean;
  wheelchair_access?: boolean;
  instant_delivery?: boolean;
  audio_guide_languages?: string[];
}

export interface TiqetsSearchResponse {
  data: TiqetsProduct[];
  total: number;
  page: number;
  per_page: number;
}

export class TiqetsService {
  private axiosInstance: AxiosInstance;
  private cache = new Map<string, { results: ActivityRecommendation[]; timestamp: number }>();
  private readonly CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: TIQETS_API_BASE,
      timeout: 30000,
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    console.log(`🎫 Tiqets Service: API Key present: ${!!API_KEY}`);
  }

  /**
   * Test API connectivity
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      console.log('🧪 Testing Tiqets API connection...');
      
      if (!API_KEY) {
        return { success: false, error: 'No API key configured' };
      }

      // Test with a simple venues request
      const response = await this.axiosInstance.get('/venues', {
        params: { limit: 1 }
      });

      console.log('✅ Tiqets API connection successful');
      return { success: true };
    } catch (error: any) {
      console.error('❌ Tiqets API connection failed:', error.response?.data || error.message);
      return { 
        success: false, 
        error: error.response?.data?.message || error.message 
      };
    }
  }

  /**
   * Search for products/experiences
   */
  async searchProducts(
    query: string, 
    options: {
      city?: string;
      country?: string;
      category?: string;
      limit?: number;
      currency?: string;
    } = {}
  ): Promise<ActivityRecommendation[]> {
    try {
      console.log(`🔍 Tiqets search: "${query}" with options:`, options);

      const cacheKey = `${query}-${JSON.stringify(options)}`;
      const cached = this.cache.get(cacheKey);
      
      if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
        console.log(`📋 Using cached Tiqets results for: "${query}"`);
        return cached.results;
      }

      // Build search parameters
      const searchParams: any = {
        q: query,
        limit: options.limit || 20,
        currency: options.currency || 'USD'
      };

      if (options.city) searchParams.city = options.city;
      if (options.country) searchParams.country = options.country;
      if (options.category) searchParams.category = options.category;

      console.log('📡 Making Tiqets API request with params:', searchParams);

      const response = await this.axiosInstance.get('/products/search', {
        params: searchParams
      });

      console.log(`✅ Tiqets API response: ${response.data?.data?.length || 0} products`);

      const products = response.data?.data || [];
      const transformedProducts = this.transformProducts(products);

      // Cache results
      this.cache.set(cacheKey, {
        results: transformedProducts,
        timestamp: Date.now()
      });

      return transformedProducts;

    } catch (error: any) {
      console.error('❌ Tiqets search error:', error.response?.data || error.message);
      return [];
    }
  }

  /**
   * Get product details by ID
   */
  async getProductDetails(productId: string): Promise<any> {
    try {
      console.log(`🔍 Fetching Tiqets product details for: ${productId}`);

      const response = await this.axiosInstance.get(`/products/${productId}`);
      const product = response.data;

      return this.transformProductDetails(product);

    } catch (error: any) {
      console.error(`❌ Error fetching Tiqets product ${productId}:`, error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Transform Tiqets products to WonderVoya format
   */
  private transformProducts(products: TiqetsProduct[]): ActivityRecommendation[] {
    return products.map(product => {
      const price = product.pricing ? {
        amount: product.pricing.from,
        currency: product.pricing.currency
      } : null;

      const location = this.extractLocation(product);
      const imageUrl = this.extractImage(product);
      const tags = this.extractTags(product);

      return {
        id: product.id,
        productCode: product.id,
        title: product.title,
        description: product.description || 'Experience authentic local culture and attractions.',
        price,
        rating: product.ratings?.average || 4.0,
        reviewCount: product.ratings?.count || 0,
        imageUrl,
        duration: product.duration || 'Duration varies',
        location,
        bookingUrl: `https://www.tiqets.com/en/product/${product.id}`,
        tags
      };
    });
  }

  /**
   * Transform detailed product information
   */
  private transformProductDetails(product: any): any {
    return {
      productCode: product.id,
      title: product.title,
      description: product.description,
      highlights: product.highlights || [],
      inclusions: product.whats_included || [],
      exclusions: product.whats_excluded || [],
      duration: product.duration,
      location: this.extractLocation(product),
      price: product.pricing ? {
        amount: product.pricing.from,
        currency: product.pricing.currency
      } : null,
      rating: product.ratings?.average || 4.0,
      reviewCount: product.ratings?.count || 0,
      images: product.images?.map((img: any) => img.url) || [],
      venue: product.venue,
      accessibility: {
        wheelchairAccessible: product.wheelchair_access || false,
        skipTheLine: product.skip_line || false
      },
      instantDelivery: product.instant_delivery || false,
      audioGuideLanguages: product.audio_guide_languages || [],
      bookingUrl: `https://www.tiqets.com/en/product/${product.id}`
    };
  }

  /**
   * Extract location from product data
   */
  private extractLocation(product: TiqetsProduct): string {
    if (product.venue?.name && product.location?.city) {
      return `${product.venue.name}, ${product.location.city}`;
    }
    
    if (product.location?.city && product.location?.country) {
      return `${product.location.city}, ${product.location.country}`;
    }

    if (product.venue?.name) {
      return product.venue.name;
    }

    return 'Attraction';
  }

  /**
   * Extract image URL from product data
   */
  private extractImage(product: TiqetsProduct): string {
    if (product.images && product.images.length > 0) {
      return product.images[0].url;
    }

    // Fallback image for cultural attractions
    return 'https://images.unsplash.com/photo-1513475382585-d06e58bcb0e0?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=600&q=80';
  }

  /**
   * Extract and categorize tags from product data
   */
  private extractTags(product: TiqetsProduct): string[] {
    const tags: string[] = [];

    // Add categories
    if (product.categories) {
      tags.push(...product.categories.slice(0, 2));
    }

    // Add special features
    if (product.skip_line) tags.push('Skip the Line');
    if (product.wheelchair_access) tags.push('Wheelchair Accessible');
    if (product.instant_delivery) tags.push('Instant Ticket');
    if (product.audio_guide_languages?.length) tags.push('Audio Guide');

    // Infer from title/description
    const content = `${product.title} ${product.description}`.toLowerCase();
    
    if (content.includes('museum')) tags.push('Museum');
    if (content.includes('gallery') || content.includes('art')) tags.push('Art & Culture');
    if (content.includes('theater') || content.includes('show')) tags.push('Entertainment');
    if (content.includes('castle') || content.includes('palace')) tags.push('Historical');
    if (content.includes('park') || content.includes('garden')) tags.push('Nature');

    return [...new Set(tags)].slice(0, 4); // Remove duplicates and limit to 4
  }

  /**
   * Clear cache
   */
  public clearCache(): void {
    this.cache.clear();
    console.log('🗑️ Tiqets cache cleared');
  }
}

export const tiqetsService = new TiqetsService();
