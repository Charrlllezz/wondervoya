
import { viatorService } from './viator';
import { enhancedTiqetsService } from './enhanced-tiqets';
import { cleanRelevanceEngine } from './clean-relevance-engine';
import type { ActivityRecommendation } from '@shared/schema';

interface MultiProviderSearchRequest {
  query: string;
  destinationId?: number;
  destinationName?: string;
  currency?: string;
  limit?: number;
  sessionId?: string;
  providers?: ('viator' | 'tiqets')[];
}

interface SearchResult {
  activities: ActivityRecommendation[];
  confidence: number;
  totalFound: number;
  strategy: string;
  breakdown: {
    viator: number;
    tiqets: number;
  };
}

export class MultiProviderSearchEngine {
  private cache = new Map<string, { data: SearchResult; timestamp: number }>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Main unified search across all providers
   */
  async search(request: MultiProviderSearchRequest): Promise<SearchResult> {
    console.log(`🔍 Multi-provider search: "${request.query}" for ${request.destinationName || 'any destination'}`);

    // Create cache key
    const cacheKey = `${request.query}-${request.destinationId || request.destinationName}-${request.currency}-${(request.providers || []).join(',')}`;
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      console.log(`⚡ Using cached multi-provider results`);
      return cached.data;
    }

    const providers = request.providers || ['viator', 'tiqets'];
    const searchPromises: Promise<{ provider: string; results: ActivityRecommendation[] }>[] = [];

    // Determine search strategy based on query
    const searchStrategy = this.determineSearchStrategy(request.query);
    console.log(`🎯 Search strategy: ${searchStrategy}`);

    // Search Viator (for tours, experiences, activities)
    if (providers.includes('viator')) {
      searchPromises.push(
        this.searchViator(request).then(results => ({ provider: 'viator', results }))
      );
    }

    // Search Tiqets (for attractions, museums, cultural sites)
    if (providers.includes('tiqets')) {
      searchPromises.push(
        this.searchTiqets(request).then(results => ({ provider: 'tiqets', results }))
      );
    }

    try {
      const providerResults = await Promise.allSettled(searchPromises);
      
      let viatorResults: ActivityRecommendation[] = [];
      let tiqetsResults: ActivityRecommendation[] = [];

      providerResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          const { provider, results } = result.value;
          console.log(`✅ ${provider}: ${results.length} results`);
          
          if (provider === 'viator') {
            viatorResults = results;
          } else if (provider === 'tiqets') {
            tiqetsResults = results;
          }
        } else {
          console.log(`❌ Provider ${index} failed:`, result.reason);
        }
      });

      // Merge and rank results
      const mergedResults = this.mergeAndRankResults(
        viatorResults,
        tiqetsResults,
        request.query,
        searchStrategy
      );

      // Apply final filtering and diversity
      const finalResults = this.applyFinalFiltering(
        mergedResults,
        request.query,
        request.limit || 10
      );

      const searchResult: SearchResult = {
        activities: finalResults,
        confidence: this.calculateConfidence(finalResults, request.query),
        totalFound: viatorResults.length + tiqetsResults.length,
        strategy: `multi-provider-${searchStrategy}`,
        breakdown: {
          viator: viatorResults.length,
          tiqets: tiqetsResults.length
        }
      };

      // Cache result
      this.cache.set(cacheKey, {
        data: searchResult,
        timestamp: Date.now()
      });

      return searchResult;

    } catch (error) {
      console.error('❌ Multi-provider search error:', error);
      return {
        activities: [],
        confidence: 0,
        totalFound: 0,
        strategy: 'error',
        breakdown: { viator: 0, tiqets: 0 }
      };
    }
  }

  /**
   * Search Viator with appropriate parameters
   */
  private async searchViator(request: MultiProviderSearchRequest): Promise<ActivityRecommendation[]> {
    try {
      if (request.destinationId) {
        // Use existing clean relevance engine for destination-specific searches
        const result = await cleanRelevanceEngine.search({
          query: request.query,
          destinationId: request.destinationId,
          currency: request.currency
        });
        return result.activities as ActivityRecommendation[];
      } else {
        // Direct Viator search for general queries
        return await viatorService.searchProducts(
          request.query,
          request.currency || 'USD',
          false,
          request.sessionId,
          request.destinationId,
          request.destinationName
        );
      }
    } catch (error) {
      console.error('❌ Viator search failed:', error);
      return [];
    }
  }

  /**
   * Search Tiqets with appropriate parameters
   */
  private async searchTiqets(request: MultiProviderSearchRequest): Promise<ActivityRecommendation[]> {
    try {
      if (request.destinationName) {
        return await enhancedTiqetsService.searchByDestination(
          request.query,
          request.destinationName,
          {
            currency: request.currency,
            limit: 15,
            sessionId: request.sessionId
          }
        );
      } else {
        return await enhancedTiqetsService.searchProducts(request.query, {
          currency: request.currency,
          limit: 15,
          sessionId: request.sessionId
        });
      }
    } catch (error) {
      console.error('❌ Tiqets search failed:', error);
      return [];
    }
  }

  /**
   * Determine optimal search strategy based on query
   */
  private determineSearchStrategy(query: string): string {
    const queryLower = query.toLowerCase();

    // Cultural/Attraction queries favor Tiqets
    if (queryLower.includes('museum') || queryLower.includes('gallery') || 
        queryLower.includes('theater') || queryLower.includes('palace') ||
        queryLower.includes('castle') || queryLower.includes('monument')) {
      return 'cultural-focused';
    }

    // Adventure/Tour queries favor Viator
    if (queryLower.includes('tour') || queryLower.includes('adventure') || 
        queryLower.includes('kayak') || queryLower.includes('hike') ||
        queryLower.includes('boat') || queryLower.includes('food tour')) {
      return 'experience-focused';
    }

    // General attraction queries use balanced approach
    if (queryLower.includes('attraction') || queryLower.includes('sightseeing') ||
        queryLower.includes('things to do')) {
      return 'balanced';
    }

    return 'general';
  }

  /**
   * Merge and rank results from both providers
   */
  private mergeAndRankResults(
    viatorResults: ActivityRecommendation[],
    tiqetsResults: ActivityRecommendation[],
    query: string,
    strategy: string
  ): ActivityRecommendation[] {
    // Add provider metadata
    const viatorWithMeta = viatorResults.map(activity => ({
      ...activity,
      _provider: 'viator' as const,
      _providerScore: this.calculateProviderScore(activity, query, 'viator')
    }));

    const tiqetsWithMeta = tiqetsResults.map(activity => ({
      ...activity,
      _provider: 'tiqets' as const,
      _providerScore: this.calculateProviderScore(activity, query, 'tiqets')
    }));

    // Combine all results
    const allResults = [...viatorWithMeta, ...tiqetsWithMeta];

    // Sort by combined score (provider score + relevance + rating)
    return allResults.sort((a, b) => {
      const scoreA = this.calculateCombinedScore(a, query, strategy);
      const scoreB = this.calculateCombinedScore(b, query, strategy);
      return scoreB - scoreA;
    });
  }

  /**
   * Calculate provider-specific score
   */
  private calculateProviderScore(
    activity: ActivityRecommendation, 
    query: string, 
    provider: 'viator' | 'tiqets'
  ): number {
    const queryLower = query.toLowerCase();
    const content = `${activity.title} ${activity.description}`.toLowerCase();
    
    let score = 0;

    // Base provider strengths
    if (provider === 'tiqets') {
      // Tiqets strength in cultural attractions
      if (queryLower.includes('museum') && content.includes('museum')) score += 0.3;
      if (queryLower.includes('gallery') && content.includes('gallery')) score += 0.3;
      if (queryLower.includes('theater') && content.includes('theater')) score += 0.3;
      if (activity.tags?.some(tag => tag.includes('Skip the Line'))) score += 0.2;
      if (activity.tags?.some(tag => tag.includes('Instant Ticket'))) score += 0.1;
    }

    if (provider === 'viator') {
      // Viator strength in tours and experiences
      if (queryLower.includes('tour') && content.includes('tour')) score += 0.3;
      if (queryLower.includes('adventure') && content.includes('adventure')) score += 0.3;
      if (queryLower.includes('experience') && content.includes('experience')) score += 0.2;
      if (activity.tags?.some(tag => tag.includes('Water Sports'))) score += 0.2;
      if (activity.tags?.some(tag => tag.includes('Adventure'))) score += 0.2;
    }

    return Math.min(score, 1.0);
  }

  /**
   * Calculate combined score for ranking
   */
  private calculateCombinedScore(
    activity: ActivityRecommendation & { _provider: string; _providerScore: number },
    query: string,
    strategy: string
  ): number {
    const providerScore = activity._providerScore;
    const ratingScore = (activity.rating || 0) / 5; // Normalize to 0-1
    const reviewScore = Math.min((activity.reviewCount || 0) / 100, 1); // Normalize to 0-1

    // Query relevance
    const queryTerms = query.toLowerCase().split(' ');
    const content = `${activity.title} ${activity.description}`.toLowerCase();
    const relevanceScore = queryTerms.reduce((score, term) => {
      if (content.includes(term)) score += 0.2;
      return Math.min(score, 1);
    }, 0);

    // Strategy-based weighting
    let strategyMultiplier = 1.0;
    if (strategy === 'cultural-focused' && activity._provider === 'tiqets') {
      strategyMultiplier = 1.2;
    } else if (strategy === 'experience-focused' && activity._provider === 'viator') {
      strategyMultiplier = 1.2;
    }

    return (
      providerScore * 0.3 +
      relevanceScore * 0.3 +
      ratingScore * 0.2 +
      reviewScore * 0.2
    ) * strategyMultiplier;
  }

  /**
   * Apply final filtering and ensure diversity
   */
  private applyFinalFiltering(
    results: ActivityRecommendation[],
    query: string,
    limit: number
  ): ActivityRecommendation[] {
    // Remove duplicates by title similarity
    const uniqueResults = this.removeDuplicates(results);

    // Ensure provider diversity in top results
    const diverseResults = this.ensureProviderDiversity(uniqueResults, limit);

    return diverseResults.slice(0, limit);
  }

  /**
   * Remove duplicate activities (same attraction from different providers)
   */
  private removeDuplicates(results: ActivityRecommendation[]): ActivityRecommendation[] {
    const seen = new Set<string>();
    const unique: ActivityRecommendation[] = [];

    for (const activity of results) {
      // Create a normalized title for comparison
      const normalizedTitle = activity.title.toLowerCase()
        .replace(/[^\w\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      if (!seen.has(normalizedTitle)) {
        seen.add(normalizedTitle);
        unique.push(activity);
      }
    }

    return unique;
  }

  /**
   * Ensure good mix of providers in results
   */
  private ensureProviderDiversity(
    results: (ActivityRecommendation & { _provider?: string })[],
    limit: number
  ): ActivityRecommendation[] {
    const viatorResults = results.filter(r => r._provider === 'viator');
    const tiqetsResults = results.filter(r => r._provider === 'tiqets');

    const diverse: ActivityRecommendation[] = [];
    let viatorIndex = 0;
    let tiqetsIndex = 0;

    // Alternate between providers when possible
    for (let i = 0; i < limit && (viatorIndex < viatorResults.length || tiqetsIndex < tiqetsResults.length); i++) {
      if (i % 2 === 0 && viatorIndex < viatorResults.length) {
        diverse.push(viatorResults[viatorIndex++]);
      } else if (tiqetsIndex < tiqetsResults.length) {
        diverse.push(tiqetsResults[tiqetsIndex++]);
      } else if (viatorIndex < viatorResults.length) {
        diverse.push(viatorResults[viatorIndex++]);
      }
    }

    return diverse;
  }

  /**
   * Calculate overall confidence in search results
   */
  private calculateConfidence(activities: ActivityRecommendation[], query: string): number {
    if (activities.length === 0) return 0;

    const queryTerms = query.toLowerCase().split(' ');
    let totalRelevance = 0;

    activities.slice(0, 5).forEach(activity => {
      const content = `${activity.title} ${activity.description}`.toLowerCase();
      const matches = queryTerms.filter(term => content.includes(term)).length;
      totalRelevance += matches / queryTerms.length;
    });

    const avgRelevance = totalRelevance / Math.min(activities.length, 5);
    return Math.round(avgRelevance * 100);
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    console.log('🗑️ Multi-provider search cache cleared');
  }
}

export const multiProviderSearchEngine = new MultiProviderSearchEngine();
