/**
 * 🎯 THEMATIC SEARCH ENGINE
 * Search engine that maps a user's free-text interest directly onto
 * Viator's own tag taxonomy (see csv-tag-manager.ts) rather than through a
 * fixed, hand-picked list of "themes" — that pre-filtering step used to
 * cap what the app could search for at a handful of predefined interests
 * (food, museums, fishing, etc.) and, being keyword-matched independently
 * of the taxonomy, was a repeated source of misclassification bugs.
 *
 * Based on Viator API documentation analysis:
 * - Uses TRAVELER_RATING for proper sorting
 * - Leverages /search/freetext and /products/search endpoints
 * - Implements tag-based filtering for precise categorization
 * - Multi-strategy approach for maximum coverage
 */

import { viatorService } from './viator';
import { csvTagManager } from './csv-tag-manager';
import type { ActivityRecommendation } from '@shared/schema';

/**
 * Loose same-word check for two already-tokenized words, tolerant of
 * simple English inflection (plurals, -ing, -al) that exact word-boundary
 * matching misses — e.g. "castle" vs "castles", "history" vs "historical",
 * "snorkel" vs "snorkeling". Compares only a short shared prefix, so it's
 * approximate rather than real stemming, but that's enough to stop a
 * query word from being treated as unmatched just because the taxonomy
 * tag happens to use a different grammatical form of the same word.
 */
function sharesWordStem(a: string, b: string): boolean {
  if (a === b) return true;
  const minLen = Math.min(a.length, b.length);
  if (minLen < 3) return false;
  const prefixLen = Math.min(5, minLen);
  return a.slice(0, prefixLen) === b.slice(0, prefixLen);
}

/**
 * Word-boundary-aware substring check. Plain `.includes()` false-positives on
 * short keywords like "art" or "mall" matching inside unrelated words such as
 * "start"/"participant" or "small" — this avoids that.
 */
function containsWord(content: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(content);
}

interface ThematicSearchResult {
  products: any[];
  strategy: string;
  confidence: number;
  thematicRelevance: number;
}

/**
 * What a user's query resolved to in the taxonomy: which tags to search
 * with, and search-term phrases (drawn from the matched tags' own names)
 * to use for the freetext/fuzzy strategies.
 */
interface TaxonomyContext {
  query: string;
  tagIds: number[];
  searchTerms: string[];
  primaryCategory: string;
}

export class ThematicSearchEngine {
  /**
   * Resolve a user's query directly against the Viator taxonomy CSV. This
   * is the single source of truth for both "what is this about" and
   * "which Viator tags apply" — no separate hand-maintained theme list.
   */
  private static async resolveTaxonomyContext(query: string): Promise<TaxonomyContext | null> {
    const result = await csvTagManager.findMatchingTags(query);
    if (result.tagIds.length === 0) {
      return null;
    }

    // Even with even-handed scoring, a query's own generic words ("tours",
    // "want", "and") appear in almost every candidate tag name ("Walking
    // Tours", "Night Tours", "Shopping Tours", ...), so using them as an
    // on-topic signal doesn't discriminate between them at all. Filter
    // those out so a distinctive word like "shopping" actually outweighs
    // "tours" when deciding which matches are genuinely on-topic, rather
    // than every tours-suffixed tag looking equally relevant.
    const GENERIC_QUERY_WORDS = new Set([
      'tour', 'tours', 'ticket', 'tickets', 'and', 'the', 'for', 'with',
      'want', 'need', 'like', 'get', 'find', 'looking', 'visit', 'see',
      'explore', 'experience', 'experiences', 'activity', 'activities',
      'sightseeing', 'sightsee',
    ]);
    const queryWords = query.toLowerCase().split(/\W+/)
      .filter(w => w.length > 2 && !GENERIC_QUERY_WORDS.has(w));
    const onTopic = result.matchedTags.filter(t => {
      const tagWords = t.tagName.toLowerCase().split(/\W+/);
      return queryWords.some(qw => tagWords.some(tw => sharesWordStem(qw, tw)));
    });
    const rest = result.matchedTags.filter(t => !onTopic.includes(t));
    const orderedTags = [...onTopic, ...rest];

    console.log(
      `🏷️ TAXONOMY MATCH: "${query}" → ${orderedTags.length} tags ` +
      `(${result.confidence.toFixed(0)}% confidence, ${onTopic.length} on-topic): ` +
      `${orderedTags.slice(0, 6).map(t => t.tagName).join(', ')}`
    );

    // The matched tags' own names are real Viator category names, so
    // they're at least as good a freetext/fuzzy search phrase as any
    // hand-picked list would be — and they can't drift out of sync with
    // the taxonomy the way a separately-maintained list would.
    const searchTerms = Array.from(new Set(
      orderedTags.slice(0, 5).map(t => t.tagName.toLowerCase())
    ));

    return {
      query,
      tagIds: orderedTags.map(t => t.tagId),
      searchTerms: searchTerms.length > 0 ? searchTerms : [query],
      primaryCategory: orderedTags[0]?.category || '',
    };
  }

  /**
   * Execute a taxonomy-driven search with multiple strategies
   */
  static async executeThematicSearch(
    query: string,
    destinationId: number,
    destinationName: string,
    currency: string = 'USD',
    maxResults: number = 10
  ): Promise<ActivityRecommendation[]> {
    console.log(`🎭 TAXONOMY SEARCH: "${query}" in ${destinationName} (${destinationId})`);

    const context = await this.resolveTaxonomyContext(query);
    if (!context) {
      console.log('❌ No taxonomy tags matched, falling back to generic search');
      return [];
    }

    // Execute multiple search strategies in parallel
    const searchPromises = [
      this.taxonomyFreetextSearch(context, destinationName, currency),
      this.taxonomyTagSearch(context, destinationId, currency),
      this.taxonomyExpandedSearch(context, destinationId, currency),
    ];

    try {
      const results = await Promise.allSettled(searchPromises);
      const successfulResults: ThematicSearchResult[] = [];

      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value.products.length > 0) {
          successfulResults.push(result.value);
          console.log(`✅ Strategy ${index + 1} (${result.value.strategy}): ${result.value.products.length} results`);
        } else {
          console.log(`❌ Strategy ${index + 1} failed or returned no results`);
        }
      });

      // Combine and rank results
      const combinedProducts = this.combineResults(successfulResults);

      // Apply location validation and relevance sorting
      const filteredProducts = this.applyRelevanceFiltering(combinedProducts, context, destinationName);

      console.log(`🎭 TAXONOMY SEARCH COMPLETE: ${filteredProducts.length} relevant activities found`);

      return filteredProducts.slice(0, maxResults);

    } catch (error) {
      console.error('❌ Taxonomy search failed:', error);
      return [];
    }
  }

  /**
   * Strategy 1: Freetext search using the top matched taxonomy category
   */
  private static async taxonomyFreetextSearch(
    context: TaxonomyContext,
    destinationName: string,
    currency: string
  ): Promise<ThematicSearchResult> {
    try {
      const searchQuery = `${context.searchTerms[0]} ${destinationName}`;

      console.log(`🔍 TAXONOMY FREETEXT: Searching for "${searchQuery}"`);

      const response = await viatorService.axiosInstance.post('/search/freetext', {
        searchTerm: searchQuery,
        searchTypes: [{
          searchType: 'PRODUCTS',
          pagination: { start: 1, count: 25 }
        }],
        currency: currency
      });

      const products = response.data?.products?.products ||
                      response.data?.searchResults?.[0]?.results ||
                      response.data?.products || [];

      console.log(`📊 FREETEXT: Found ${products.length} products`);

      return {
        products,
        strategy: 'taxonomy_freetext',
        confidence: 90,
        thematicRelevance: 90
      };
    } catch (error) {
      console.error('Taxonomy freetext search failed:', error);
      const errorDetails = error instanceof Error ? error.message : 'Unknown error';
      const responseData = (error as any)?.response?.data;
      console.error('Error details:', responseData || errorDetails);
      return { products: [], strategy: 'taxonomy_freetext', confidence: 0, thematicRelevance: 0 };
    }
  }

  /**
   * Strategy 2: Products search filtered by taxonomy tags
   */
  private static async taxonomyTagSearch(
    context: TaxonomyContext,
    destinationId: number,
    currency: string
  ): Promise<ThematicSearchResult> {
    // Viator's filtering.tags is an AND filter — a product must carry every
    // listed tag to match, not any of them. Sending the whole taxonomy
    // match list (often 8-12 tags spanning several category levels) as one
    // filter means almost nothing ever matches all of them at once, so
    // this strategy would silently return 0 results no matter which tags
    // were chosen. Query the top taxonomy tags individually instead — same
    // pattern taxonomyExpandedSearch uses for search terms — and merge the
    // per-tag result sets, so each tag acts as an independent OR-branch.
    // Some individual tags return 0 products for a given destination even
    // when they're genuinely on-topic (a destination's catalog simply
    // isn't tagged that granularly), so query more than the bare minimum
    // to leave room for that before falling back to less specific tags.
    const priorityTags = context.tagIds.slice(0, 6);
    console.log(`🎯 TAXONOMY TAG SEARCH: Querying ${priorityTags.length} tags individually (${priorityTags.join(', ')})`);

    const allProducts: any[] = [];
    for (const tagId of priorityTags) {
      try {
        const requestBody = {
          filtering: {
            destination: destinationId, // Viator API expects 'destination' not 'destinationId'
            tags: [tagId],
            includeAutomaticTranslations: true
          },
          sort: "TRAVELER_RATING",
          order: "DESCENDING",
          pagination: { start: 1, count: 15 },
          currency
        };

        const response = await viatorService.axiosInstance.post('/products/search', requestBody);
        const products = response.data?.products?.results || response.data?.products || [];
        console.log(`📊 TAG ${tagId}: Found ${products.length} products`);
        allProducts.push(...products);

        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (tagError) {
        const errorMsg = tagError instanceof Error ? tagError.message : 'unknown error';
        console.log(`❌ Tag ${tagId} search failed:`, errorMsg);
      }
    }

    const uniqueProducts = allProducts.filter((product, index, self) =>
      index === self.findIndex(p => p.productCode === product.productCode)
    );
    console.log(`📊 TAXONOMY TAG SEARCH TOTAL: ${allProducts.length} → ${uniqueProducts.length} unique products`);

    return {
      products: uniqueProducts,
      strategy: 'taxonomy_tag_search',
      confidence: 95, // Viator's own curated tags, highest-confidence source
      thematicRelevance: 95
    };
  }

  /**
   * Strategy 3: Expanded fuzzy search across the top matched category names
   */
  private static async taxonomyExpandedSearch(
    context: TaxonomyContext,
    destinationId: number,
    currency: string
  ): Promise<ThematicSearchResult> {
    try {
      const searchTerms = context.searchTerms.slice(0, 3);
      let allProducts: any[] = [];

      console.log(`🔄 EXPANDED SEARCH: Trying ${searchTerms.length} search terms`);

      for (const searchTerm of searchTerms) {
        try {
          console.log(`🔍 EXPANDED: Searching "${searchTerm}" in destination ${destinationId}`);

          const response = await viatorService.axiosInstance.post('/products/search', {
            searchTerms: [{
              searchTerm: searchTerm,
              match: "FUZZY"
            }],
            filtering: {
              destination: destinationId
            },
            sort: "TRAVELER_RATING",
            order: "DESCENDING",
            pagination: {
              start: 1,
              count: 15
            },
            currency: currency
          });

          const products = response.data?.products?.results || response.data?.products || [];
          console.log(`📊 EXPANDED "${searchTerm}": Found ${products.length} products`);
          allProducts.push(...products);

          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (termError) {
          const errorMsg = termError instanceof Error ? termError.message : 'unknown error';
          console.log(`❌ Failed search term "${searchTerm}":`, errorMsg);
        }
      }

      const uniqueProducts = allProducts.filter((product, index, self) =>
        index === self.findIndex(p => p.productCode === product.productCode)
      );

      console.log(`🔄 EXPANDED TOTAL: ${allProducts.length} → ${uniqueProducts.length} unique products`);

      return {
        products: uniqueProducts,
        strategy: 'taxonomy_expanded_search',
        confidence: 75,
        thematicRelevance: 80
      };
    } catch (error) {
      console.error('Taxonomy expanded search failed:', error);
      const errorDetails = error instanceof Error ? error.message : 'Unknown error';
      const responseData = (error as any)?.response?.data;
      console.error('Error details:', responseData || errorDetails);
      return { products: [], strategy: 'taxonomy_expanded_search', confidence: 0, thematicRelevance: 0 };
    }
  }

  /**
   * Combine results from multiple search strategies, deduping by product code
   */
  private static combineResults(results: ThematicSearchResult[]): any[] {
    const allProducts: any[] = [];
    const productCodes = new Set();

    for (const result of results) {
      for (const product of result.products) {
        if (!productCodes.has(product.productCode)) {
          productCodes.add(product.productCode);
          product._thematicScore = result.thematicRelevance;
          product._strategy = result.strategy;
          allProducts.push(product);
        }
      }
    }

    console.log(`🔄 Combined results: ${allProducts.length} unique products from ${results.length} strategies`);
    return allProducts;
  }

  /**
   * Validate destination relevance and rank by strategy confidence
   */
  private static applyRelevanceFiltering(
    products: any[],
    context: TaxonomyContext,
    destinationName: string
  ): any[] {
    console.log(`🎯 RELEVANCE FILTERING: Processing ${products.length} products for "${context.query}"`);

    const filteredProducts = products.filter(product => {
      const title = (product.title || '').toLowerCase();
      const description = (product.shortDescription || product.description || '').toLowerCase();
      const content = `${title} ${description}`;

      // ENHANCED LOCATION VALIDATION: Ensure activities match the destination
      const targetLocation = destinationName.toLowerCase();

      const locationExclusions = {
        banff: ['hawaii', 'maui', 'kona', 'honolulu', 'oahu', 'big island', 'pacific', 'luau', 'aloha', 'tokyo', 'japan', 'paris', 'france', 'europe'],
        hawaii: ['banff', 'canada', 'alberta', 'rockies', 'calgary', 'tokyo', 'japan', 'paris', 'france', 'europe', 'lisbon', 'portugal'],
        tokyo: ['hawaii', 'banff', 'canada', 'alberta', 'paris', 'france', 'europe', 'lisbon', 'portugal'],
        paris: ['hawaii', 'banff', 'canada', 'alberta', 'tokyo', 'japan', 'lisbon', 'portugal'],
        lisbon: ['hawaii', 'maui', 'kona', 'honolulu', 'oahu', 'big island', 'pacific', 'luau', 'aloha', 'tokyo', 'japan', 'banff', 'canada', 'alberta'],
        portugal: ['hawaii', 'maui', 'kona', 'honolulu', 'oahu', 'big island', 'pacific', 'luau', 'aloha', 'tokyo', 'japan', 'banff', 'canada', 'alberta']
      };

      for (const [region, excludeTerms] of Object.entries(locationExclusions)) {
        if (targetLocation.includes(region)) {
          const hasWrongLocation = excludeTerms.some(term => content.includes(term));
          if (hasWrongLocation) {
            const matchedTerm = excludeTerms.find(term => content.includes(term));
            console.log(`🚫 GEOGRAPHIC MISMATCH: Excluding "${product.title}" (contains "${matchedTerm}" for ${region} search)`);
            return false;
          }
        }
      }

      if (targetLocation.includes('banff')) {
        const banffRelevantTerms = ['banff', 'canada', 'alberta', 'rockies', 'mountain', 'calgary', 'jasper', 'lake louise', 'canadian'];
        if (!banffRelevantTerms.some(term => content.includes(term))) {
          console.log(`❌ LOCATION VALIDATION FAILED: "${product.title}" has no Banff/Canada relevance`);
          return false;
        }
      }

      if (targetLocation.includes('hawaii')) {
        const hawaiiRelevantTerms = ['hawaii', 'maui', 'oahu', 'kona', 'honolulu', 'big island', 'kauai', 'hawaiian', 'pacific'];
        if (!hawaiiRelevantTerms.some(term => content.includes(term))) {
          console.log(`❌ LOCATION VALIDATION FAILED: "${product.title}" has no Hawaii relevance`);
          return false;
        }
      }

      if (targetLocation.includes('lisbon') || targetLocation.includes('portugal')) {
        const lisbonRelevantTerms = ['lisbon', 'portugal', 'portuguese', 'porto', 'sintra', 'cascais', 'iberian', 'europe', 'european'];
        if (!lisbonRelevantTerms.some(term => content.includes(term))) {
          console.log(`❌ LOCATION VALIDATION FAILED: "${product.title}" has no Lisbon/Portugal relevance`);
          return false;
        }
      }

      // Category relevance was already decided upstream by Viator's own
      // taxonomy tags (context.tagIds, sent as filtering.tags in
      // taxonomyTagSearch) rather than by re-deriving it here from regex/
      // keyword matching against title+description text — that approach is
      // what previously discarded genuine results over incidental word
      // matches. Score here is advisory only, used for sort order.
      let relevanceScore = product._thematicScore || 0;
      if (containsWord(content, destinationName.toLowerCase())) {
        relevanceScore += 5;
      }
      product._finalThematicScore = relevanceScore;

      return true;
    });

    filteredProducts.sort((a, b) => (b._finalThematicScore || 0) - (a._finalThematicScore || 0));

    const diverseProducts = this.applyVenueDiversityFiltering(filteredProducts, context.primaryCategory);

    console.log(`🎯 RELEVANCE FILTERING RESULT: ${products.length} → ${diverseProducts.length} products`);

    return diverseProducts.map(product => this.transformToActivityRecommendation(product));
  }

  /**
   * Cap how many listings from the same venue/attraction can appear, so
   * results aren't dominated by near-duplicate tickets for one landmark.
   * Attraction/museum-heavy categories tend to have many such duplicates
   * (e.g. five different "Louvre skip-the-line" listings), so they get a
   * tighter cap than experience-based categories like food or water tours.
   */
  private static applyVenueDiversityFiltering(products: any[], primaryCategory: string): any[] {
    const venueMap = new Map<string, any[]>();

    products.forEach(product => {
      const venue = this.extractVenueName(product.title);
      if (!venueMap.has(venue)) {
        venueMap.set(venue, []);
      }
      venueMap.get(venue)!.push(product);
    });

    console.log(`🏛️ VENUE DIVERSITY: Found ${venueMap.size} different venues from ${products.length} relevant products`);

    const strictCategories = ['tickets & passes', 'attractions', 'museum', 'art & culture'];
    const isStrict = strictCategories.some(c => primaryCategory.toLowerCase().includes(c));
    const maxPerVenue = isStrict ? 1 : 2;

    const diverseResults: any[] = [];
    for (const [, activities] of Array.from(venueMap.entries())) {
      const sortedActivities = activities.sort((a: any, b: any) =>
        (b._finalThematicScore || 0) - (a._finalThematicScore || 0)
      );
      diverseResults.push(...sortedActivities.slice(0, maxPerVenue));

      if (diverseResults.length >= 12) break;
    }

    return diverseResults.slice(0, 12);
  }

  /**
   * Extract venue name for grouping activities
   */
  private static extractVenueName(title: string): string {
    // Venue patterns for common landmark naming conventions
    const venuePatterns = [
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

      // Generic patterns
      /^([^:]+museum)/i,
      /^([^:]+gallery)/i,
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
    return title.split(' ').slice(0, 3).join(' ').toLowerCase();
  }

  /**
   * Transform Viator product to ActivityRecommendation
   */
  private static transformToActivityRecommendation(product: any): ActivityRecommendation {
    return {
      productCode: product.productCode,
      title: product.title,
      description: product.shortDescription || product.description || '',
      imageUrl: this.extractImageUrl(product),
      price: this.extractPrice(product),
      rating: product.reviews?.combinedAverageRating || 4.5,
      reviewCount: product.reviews?.totalReviews || 0,
      duration: this.extractDuration(product),
      location: this.extractLocation(product),
      destination: 'Travel Destination',
      bookingUrl: product.productUrl || `https://www.viator.com/tours/${product.productCode}`,
      tags: this.extractTags(product),
      finalScore: product._finalThematicScore || 0.5
    };
  }

  private static extractDuration(product: any): string {
    if (product.duration?.text) {
      return product.duration.text;
    }
    if (product.durationInMinutes) {
      const hours = Math.round(product.durationInMinutes / 60);
      if (hours > 0) return `${hours}h`;
    }
    return 'Duration varies';
  }

  private static extractImageUrl(product: any): string {
    return product.images?.[0]?.url ||
           product.images?.[0]?.variants?.[0]?.url ||
           `/api/placeholder-image`;
  }

  private static extractPrice(product: any): { amount: number; currency: string } | null {
    if (product.pricingInfo?.summary?.fromPrice) {
      return {
        amount: product.pricingInfo.summary.fromPrice,
        currency: product.pricingInfo.summary.currency || 'USD'
      };
    }

    if (product.pricing?.fromPrice) {
      return {
        amount: product.pricing.fromPrice,
        currency: product.pricing.currency || 'USD'
      };
    }

    if (product.fromPrice) {
      return {
        amount: product.fromPrice,
        currency: 'USD'
      };
    }

    return null;
  }

  private static extractLocation(product: any): string {
    return product.destinations?.[0]?.name ||
           product.destination?.name ||
           product.location ||
           'Travel Destination';
  }

  private static extractTags(product: any): string[] {
    return product.tags || [];
  }
}

export const thematicSearchEngine = ThematicSearchEngine;
