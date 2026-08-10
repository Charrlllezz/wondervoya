/**
 * 🎯 ENHANCED TAG MATCHER
 * Complete overhaul of tag matching with better semantic understanding and CSV integration
 */

import { csvTagManager, type TaxonomyTag } from './csv-tag-manager';

export interface TagMatchResult {
  matchedTags: TaxonomyTag[];
  tagIds: number[];
  confidence: number;
  matchStrategy: string;
  categoryBreakdown: { [category: string]: number };
  semanticScore: number;
}

export interface UserInterest {
  term: string;
  weight: number;
  category?: string;
  synonyms: string[];
}

class EnhancedTagMatcher {
  // Comprehensive semantic mapping with weighted importance
  private readonly SEMANTIC_CLUSTERS: { [category: string]: { primary: string[]; secondary: string[]; tertiary: string[]; weight: number } } = {
    'food_dining': {
      primary: ['food', 'dining', 'culinary', 'cuisine', 'restaurant', 'meal', 'eat', 'eating'],
      secondary: ['chef', 'cooking', 'kitchen', 'gastronomy', 'menu', 'dish', 'recipe'],
      tertiary: ['gourmet', 'flavor', 'taste', 'ingredient', 'local food', 'street food'],
      weight: 1.0
    },
    'food_tours': {
      primary: ['food tour', 'food tours', 'culinary tour', 'culinary tours', 'food walk', 'food experience', 'food tasting', 'tours'],
      secondary: ['food guide', 'food journey', 'culinary experience', 'taste tour', 'sightseeing'],
      tertiary: ['food discovery', 'local cuisine tour', 'gastronomic tour', 'tour'],
      weight: 1.3
    },
    'wine_spirits': {
      primary: ['wine', 'wine tasting', 'vineyard', 'winery', 'sommelier', 'spirits'],
      secondary: ['cellar', 'vintage', 'grape', 'brewery', 'beer', 'cocktail'],
      tertiary: ['distillery', 'tasting room', 'wine bar', 'wine country'],
      weight: 0.9
    },
    'cooking_classes': {
      primary: ['cooking class', 'cooking lesson', 'chef class', 'culinary class'],
      secondary: ['cooking workshop', 'cooking experience', 'kitchen class'],
      tertiary: ['baking class', 'pastry class', 'cooking school'],
      weight: 0.8
    },
    'markets_local': {
      primary: ['market', 'local market', 'food market', 'farmers market'],
      secondary: ['bazaar', 'food hall', 'market tour', 'local shopping'],
      tertiary: ['street market', 'night market', 'fish market'],
      weight: 0.7
    },
    'cultural_heritage': {
      primary: ['culture', 'cultural', 'heritage', 'traditional', 'historic', 'history'],
      secondary: ['museum', 'temple', 'shrine', 'monument', 'palace', 'castle'],
      tertiary: ['art', 'gallery', 'exhibition', 'cultural site'],
      weight: 0.9
    },
    'tours_sightseeing': {
      primary: ['tour', 'sightseeing', 'guided', 'excursion', 'visit', 'explore'],
      secondary: ['walking tour', 'city tour', 'private tour', 'group tour'],
      tertiary: ['half day', 'full day', 'discovery', 'highlights'],
      weight: 0.8
    }
  };

  // Enhanced category priority mapping
  private readonly CATEGORY_PRIORITIES: { [category: string]: number } = {
    'Food & Drink': 1.0,
    'Tours, Sightseeing & Cruises': 0.9,
    'Art & Culture': 0.8,
    'Outdoor Activities': 0.7,
    'Attractions & Museums': 0.8,
    'Shows & Performances': 0.6
  };

  // Stop words to filter out
  private readonly STOP_WORDS = new Set([
    'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
    'the', 'a', 'an', 'this', 'that', 'these', 'those', 'i', 'you', 'we',
    'they', 'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have',
    'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
    'may', 'might', 'can', 'must', 'shall'
  ]);

  /**
   * Main method to match user interests to Viator tags
   */
  async matchUserInterests(userInput: string): Promise<TagMatchResult> {
    console.log(`🎯 ENHANCED TAG MATCHING: "${userInput}"`);

    // Step 1: Parse and analyze user interests
    const interests = this.parseUserInterests(userInput);
    console.log(`📝 Parsed interests:`, interests.map(i => `${i.term} (${i.weight})`));

    // Step 2: Multi-strategy tag matching
    const strategies = await Promise.all([
      this.semanticClusterMatching(interests),
      this.directTermMatching(interests),
      this.fuzzyMatching(interests),
      this.categoryBasedMatching(interests)
    ]);

    // Step 3: Combine and score results
    const combinedResult = this.combineMatchingStrategies(strategies, userInput);

    console.log(`✅ Enhanced matching complete: ${combinedResult.tagIds.length} tags, ${combinedResult.confidence}% confidence`);
    console.log(`🏷️ Top matches: ${combinedResult.matchedTags.slice(0, 5).map(t => t.tagName).join(', ')}`);

    return combinedResult;
  }

  /**
   * Parse user input into structured interests with weights
   */
  private parseUserInterests(userInput: string): UserInterest[] {
    const interests: UserInterest[] = [];
    const normalizedInput = userInput.toLowerCase();

    // First pass: Look for semantic clusters
    for (const [clusterName, cluster] of Object.entries(this.SEMANTIC_CLUSTERS)) {
      // Check primary terms (highest weight)
      for (const term of cluster.primary) {
        if (normalizedInput.includes(term)) {
          interests.push({
            term,
            weight: cluster.weight * 1.0,
            category: clusterName,
            synonyms: [...cluster.secondary, ...cluster.tertiary]
          });
        }
      }

      // Check secondary terms (medium weight)
      for (const term of cluster.secondary) {
        if (normalizedInput.includes(term) && !interests.some(i => i.term === term)) {
          interests.push({
            term,
            weight: cluster.weight * 0.7,
            category: clusterName,
            synonyms: cluster.primary
          });
        }
      }

      // Check tertiary terms (lower weight)
      for (const term of cluster.tertiary) {
        if (normalizedInput.includes(term) && !interests.some(i => i.term === term)) {
          interests.push({
            term,
            weight: cluster.weight * 0.5,
            category: clusterName,
            synonyms: cluster.primary
          });
        }
      }
    }

    // Second pass: Extract individual significant words
    const words = normalizedInput
      .split(/[\s,;|&+\-()]+/)
      .filter(word => word.length > 2 && !this.STOP_WORDS.has(word))
      .filter(word => !interests.some(i => i.term.includes(word)));

    for (const word of words) {
      if (!interests.some(i => i.term === word)) {
        interests.push({
          term: word,
          weight: 0.4,
          synonyms: []
        });
      }
    }

    return interests.sort((a, b) => b.weight - a.weight);
  }

  /**
   * Strategy 1: Semantic cluster matching
   */
  private async semanticClusterMatching(interests: UserInterest[]): Promise<Partial<TagMatchResult>> {
    const tagWeights = new Map<number, number>();
    const matchedTags: TaxonomyTag[] = [];

    for (const interest of interests) {
      if (!interest.category) continue;

      // Get all terms for this cluster
      const cluster = this.SEMANTIC_CLUSTERS[interest.category];
      if (!cluster) continue;

      const allTerms = [...cluster.primary, ...cluster.secondary, ...cluster.tertiary];

      for (const term of allTerms) {
        const csvResult = await csvTagManager.findMatchingTags(term);

        for (const tag of csvResult.matchedTags) {
          const existingWeight = tagWeights.get(tag.tagId) || 0;
          const newWeight = existingWeight + (interest.weight * this.getCategoryBonus(tag.category));

          tagWeights.set(tag.tagId, newWeight);

          if (!matchedTags.some(t => t.tagId === tag.tagId)) {
            matchedTags.push(tag);
          }
        }
      }
    }

    // Sort by weight
    const sortedTags = matchedTags
      .map(tag => ({ tag, weight: tagWeights.get(tag.tagId) || 0 }))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 15)
      .map(item => item.tag);

    return {
      matchedTags: sortedTags,
      tagIds: sortedTags.map(t => t.tagId),
      matchStrategy: 'semantic_cluster',
      semanticScore: sortedTags.length > 0 ? 90 : 0
    };
  }

  /**
   * Strategy 2: Direct term matching
   */
  private async directTermMatching(interests: UserInterest[]): Promise<Partial<TagMatchResult>> {
    const allMatches: TaxonomyTag[] = [];
    const tagWeights = new Map<number, number>();

    for (const interest of interests) {
      const csvResult = await csvTagManager.findMatchingTags(interest.term);

      for (const tag of csvResult.matchedTags) {
        const weight = interest.weight * this.getCategoryBonus(tag.category);
        const existingWeight = tagWeights.get(tag.tagId) || 0;

        tagWeights.set(tag.tagId, existingWeight + weight);

        if (!allMatches.some(t => t.tagId === tag.tagId)) {
          allMatches.push(tag);
        }
      }
    }

    const sortedTags = allMatches
      .map(tag => ({ tag, weight: tagWeights.get(tag.tagId) || 0 }))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 12)
      .map(item => item.tag);

    return {
      matchedTags: sortedTags,
      tagIds: sortedTags.map(t => t.tagId),
      matchStrategy: 'direct_term',
      semanticScore: sortedTags.length > 0 ? 80 : 0
    };
  }

  /**
   * Strategy 3: Fuzzy matching for typos and variations
   */
  private async fuzzyMatching(interests: UserInterest[]): Promise<Partial<TagMatchResult>> {
    const matches: TaxonomyTag[] = [];

    for (const interest of interests) {
      // Simple fuzzy matching - look for partial matches
      const csvResult = await csvTagManager.findMatchingTags(interest.term);

      // Also try with common variations
      const variations = this.generateVariations(interest.term);

      for (const variation of variations) {
        const varResult = await csvTagManager.findMatchingTags(variation);
        csvResult.matchedTags.push(...varResult.matchedTags);
      }

      // Remove duplicates and add to matches
      const uniqueTags = csvResult.matchedTags.filter(tag => 
        !matches.some(m => m.tagId === tag.tagId)
      );

      matches.push(...uniqueTags.slice(0, 5));
    }

    return {
      matchedTags: matches.slice(0, 8),
      tagIds: matches.slice(0, 8).map(t => t.tagId),
      matchStrategy: 'fuzzy',
      semanticScore: matches.length > 0 ? 60 : 0
    };
  }

  /**
   * Strategy 4: Category-based matching
   */
  private async categoryBasedMatching(interests: UserInterest[]): Promise<Partial<TagMatchResult>> {
    const categoryMatches: TaxonomyTag[] = [];

    // Identify dominant categories from interests
    const categoryScores = new Map<string, number>();

    for (const interest of interests) {
      if (interest.category) {
        const currentScore = categoryScores.get(interest.category) || 0;
        categoryScores.set(interest.category, currentScore + interest.weight);
      }
    }

    // Get top categories
    const topCategories = Array.from(categoryScores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2);

    for (const [category] of topCategories) {
      const cluster = this.SEMANTIC_CLUSTERS[category];
      if (cluster) {
        // Search for tags using primary terms from this category
        for (const term of cluster.primary.slice(0, 3)) {
          const csvResult = await csvTagManager.findMatchingTags(term);

          for (const tag of csvResult.matchedTags.slice(0, 5)) {
            if (!categoryMatches.some(t => t.tagId === tag.tagId)) {
              categoryMatches.push(tag);
            }
          }
        }
      }
    }

    return {
      matchedTags: categoryMatches.slice(0, 10),
      tagIds: categoryMatches.slice(0, 10).map(t => t.tagId),
      matchStrategy: 'category_based',
      semanticScore: categoryMatches.length > 0 ? 70 : 0
    };
  }

  /**
   * Combine results from all matching strategies
   */
  private combineMatchingStrategies(
    strategies: Partial<TagMatchResult>[], 
    originalInput: string
  ): TagMatchResult {
    const allTags = new Map<number, { tag: TaxonomyTag; score: number; strategies: string[] }>();

    // Combine all strategies with weighted scoring
    const strategyWeights: { [strategy: string]: number } = { semantic_cluster: 1.0, direct_term: 0.8, category_based: 0.6, fuzzy: 0.4 };

    for (const strategy of strategies) {
      if (!strategy.matchedTags || !strategy.matchStrategy) continue;

      const weight = strategyWeights[strategy.matchStrategy] || 0.5;

      for (let i = 0; i < strategy.matchedTags.length; i++) {
        const tag = strategy.matchedTags[i];
        const positionBonus = Math.max(0, (10 - i) / 10); // Higher score for earlier results
        const score = (strategy.semanticScore || 50) * weight * positionBonus;

        const existing = allTags.get(tag.tagId);
        if (existing) {
          existing.score += score;
          existing.strategies.push(strategy.matchStrategy);
        } else {
          allTags.set(tag.tagId, {
            tag,
            score,
            strategies: [strategy.matchStrategy]
          });
        }
      }
    }

    // Sort by combined score and take top results
    const sortedResults = Array.from(allTags.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);

    const finalTags = sortedResults.map(item => item.tag);
    const confidence = this.calculateConfidence(sortedResults, originalInput);
    const categoryBreakdown = this.getCategoryBreakdown(finalTags);

    return {
      matchedTags: finalTags,
      tagIds: finalTags.map(t => t.tagId),
      confidence,
      matchStrategy: 'combined_enhanced',
      categoryBreakdown,
      semanticScore: sortedResults.length > 0 ? sortedResults[0].score : 0
    };
  }

  /**
   * Generate common variations of a term
   */
  private generateVariations(term: string): string[] {
    const variations: string[] = [];

    // Plural/singular variations
    if (term.endsWith('s')) {
      variations.push(term.slice(0, -1));
    } else {
      variations.push(term + 's');
    }

    // Common food-related variations
    const foodVariations: { [term: string]: string[] } = {
      'food': ['cuisine', 'culinary', 'dining', 'meal'],
      'tour': ['trip', 'experience', 'excursion', 'visit'],
      'cooking': ['culinary', 'chef', 'kitchen'],
      'wine': ['vineyard', 'winery', 'tasting'],
      'market': ['bazaar', 'shopping', 'local market']
    };

    const termVariations = foodVariations[term];
    if (termVariations) {
      variations.push(...termVariations);
    }

    return variations;
  }

  /**
   * Get category bonus multiplier
   */
  private getCategoryBonus(category: string): number {
    return this.CATEGORY_PRIORITIES[category] || 0.5;
  }

  /**
   * Calculate overall confidence score
   */
  private calculateConfidence(results: Array<{ tag: TaxonomyTag; score: number; strategies: string[] }>, input: string): number {
    if (results.length === 0) return 0;

    const baseScore = Math.min(results.length / 8, 1) * 40; // Up to 40 points for quantity
    const qualityScore = Math.min(results[0].score / 100, 1) * 40; // Up to 40 points for quality
    const diversityScore = this.calculateDiversityScore(results) * 20; // Up to 20 points for diversity

    return Math.min(Math.round(baseScore + qualityScore + diversityScore), 100);
  }

  /**
   * Calculate diversity score based on different strategies used
   */
  private calculateDiversityScore(results: Array<{ strategies: string[] }>): number {
    const allStrategies = new Set<string>();
    results.forEach(result => result.strategies.forEach(s => allStrategies.add(s)));
    return Math.min(allStrategies.size / 4, 1); // Max diversity when all 4 strategies used
  }

  /**
   * Get category breakdown
   */
  private getCategoryBreakdown(tags: TaxonomyTag[]): { [category: string]: number } {
    const breakdown: { [category: string]: number } = {};

    for (const tag of tags) {
      breakdown[tag.category] = (breakdown[tag.category] || 0) + 1;
    }

    return breakdown;
  }

  /**
   * Get specificity score based on tag levels (L3/L4 focused)
   */
  private getSpecificityScore(tags: TaxonomyTag[]): number {
    const levelWeights = { 'L1': 0.1, 'L2': 0.3, 'L3': 0.85, 'L4': 1.0 };
    const avgSpecificity = tags.reduce((sum, tag) => sum + levelWeights[tag.level], 0) / tags.length;
    return avgSpecificity;
  }
}

// Create and export singleton instance
export const enhancedTagMatcher = new EnhancedTagMatcher();