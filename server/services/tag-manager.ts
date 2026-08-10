
/**
 * Enhanced Viator Tag Management System with Semantic Matching
 * Handles caching and intelligent matching of Viator product tags for surgical precision
 */

import axios, { AxiosInstance } from 'axios';
import { HfInference } from '@huggingface/inference';

export interface ViatorTag {
  tagId: number;
  tagName?: string;
  allNamesForTag?: string[];
  allNamesByLocale?: Record<string, string>;
  category?: string;
  semanticEmbedding?: number[];
  semanticScore?: number;
}

export interface TagSearchResult {
  matchedTags: ViatorTag[];
  tagIds: number[];
  confidence: number;
  exclusionTags?: number[];
  semanticScore?: number;
}

export interface CategoryExclusions {
  [category: string]: {
    excludeCategories: string[];
    excludeKeywords: string[];
    strictMode: boolean;
  };
}

class TagManager {
  private axiosInstance: AxiosInstance;
  private hf: HfInference;
  private tagCache: Map<number, ViatorTag> = new Map();
  private tagsByName: Map<string, ViatorTag[]> = new Map();
  private tagsByCategory: Map<string, ViatorTag[]> = new Map();
  private semanticCache: Map<string, number[]> = new Map();
  private lastCacheUpdate: number = 0;
  private readonly CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
  private readonly SEMANTIC_THRESHOLD = 0.75; // High threshold for precision
  private readonly CONFIDENCE_THRESHOLD = 0.6; // 60% confidence minimum

  // ENHANCED: Strict category exclusions for surgical precision
  private readonly CATEGORY_EXCLUSIONS: CategoryExclusions = {
    'food_wine': {
      excludeCategories: ['museums', 'adventure_sports', 'water_sports', 'cultural_sites', 'hiking', 'outdoor_extreme'],
      excludeKeywords: ['museum', 'gallery', 'hiking', 'climbing', 'adventure', 'water sports', 'kayaking', 'snorkeling', 'diving'],
      strictMode: true
    },
    'museums': {
      excludeCategories: ['food_wine', 'adventure_sports', 'water_sports', 'outdoor_activities', 'nightlife'],
      excludeKeywords: ['food', 'wine', 'restaurant', 'culinary', 'adventure', 'extreme', 'water', 'boat', 'diving'],
      strictMode: true
    },
    'adventure_sports': {
      excludeCategories: ['museums', 'cultural_sites', 'food_wine', 'indoor_activities', 'shopping'],
      excludeKeywords: ['museum', 'gallery', 'indoor', 'shopping', 'mall', 'restaurant', 'dining'],
      strictMode: true
    },
    'water_sports': {
      excludeCategories: ['museums', 'desert_activities', 'mountain_activities', 'cultural_indoor'],
      excludeKeywords: ['museum', 'desert', 'mountain climbing', 'indoor', 'gallery', 'shopping'],
      strictMode: true
    },
    'cultural_sites': {
      excludeCategories: ['adventure_sports', 'extreme_sports', 'water_sports', 'nightlife'],
      excludeKeywords: ['extreme', 'adventure', 'bungee', 'skydiving', 'nightclub', 'bar'],
      strictMode: false
    }
  };

  // ENHANCED: Comprehensive semantic mappings aligned with CSV tag manager
  private readonly SEMANTIC_MAPPINGS: { [term: string]: string[] } = {
    // Food & Culinary - Enhanced with hierarchical awareness
    'food': ['culinary', 'cuisine', 'gastronomy', 'dining', 'restaurant', 'cooking', 'chef', 'market', 'tasting', 'foodie', 'gourmet'],
    'cooking': ['culinary class', 'chef experience', 'kitchen', 'recipe', 'ingredients', 'preparation', 'baking'],
    'wine': ['vineyard', 'winery', 'sommelier', 'cellar', 'viticulture', 'vintage', 'grape', 'tasting', 'pairing'],
    'beer': ['brewery', 'brewing', 'craft beer', 'pub', 'ale', 'lager', 'hops', 'microbrewery'],
    
    // Museums & Arts - Comprehensive mappings
    'museum': ['gallery', 'exhibition', 'collection', 'artifacts', 'curator', 'cultural center', 'heritage site'],
    'art': ['painting', 'sculpture', 'gallery', 'artist', 'artwork', 'exhibition', 'contemporary', 'modern', 'classical'],
    'history': ['historical', 'heritage', 'ancient', 'archaeological', 'monument', 'landmark', 'ruins', 'civilization'],
    
    // Adventure & Outdoor - Enhanced with specificity
    'adventure': ['extreme', 'thrill', 'adrenaline', 'outdoor', 'active', 'sport', 'hiking', 'climbing', 'expedition'],
    'hiking': ['trekking', 'walking', 'trail', 'mountain', 'nature walk', 'outdoor', 'wilderness'],
    'climbing': ['rock climbing', 'mountaineering', 'bouldering', 'via ferrata', 'rappelling'],
    
    // Water Activities - Detailed breakdown  
    'water': ['marine', 'ocean', 'sea', 'beach', 'diving', 'swimming', 'boat', 'cruise', 'sailing', 'aquatic'],
    'diving': ['scuba', 'snorkeling', 'underwater', 'marine life', 'reef', 'submarine'],
    'boat': ['sailing', 'yacht', 'catamaran', 'ferry', 'cruise', 'charter', 'maritime'],
    'fishing': ['angling', 'charter', 'deep sea', 'sport fishing', 'fly fishing', 'catch', 'tackle'],
    
    // Cultural & Heritage - Hierarchical structure
    'culture': ['cultural', 'heritage', 'traditional', 'historical', 'art', 'museum', 'gallery', 'exhibition', 'customs'],
    'temple': ['shrine', 'religious', 'spiritual', 'monastery', 'cathedral', 'church', 'sacred'],
    'traditional': ['authentic', 'local', 'indigenous', 'folk', 'heritage', 'customs', 'cultural'],
    
    // Nature & Wildlife - Ecosystem-based
    'nature': ['wildlife', 'eco', 'natural', 'parks', 'animals', 'safari', 'bird', 'forest', 'ecosystem'],
    'wildlife': ['animals', 'safari', 'zoo', 'aquarium', 'birdwatching', 'marine life', 'conservation'],
    'park': ['national park', 'nature reserve', 'conservation', 'wildlife', 'hiking', 'outdoor'],
    
    // Entertainment & Shows - Performance types
    'music': ['concert', 'performance', 'show', 'live', 'acoustic', 'classical', 'jazz', 'dance', 'symphony'],
    'show': ['performance', 'theater', 'concert', 'entertainment', 'live', 'stage', 'venue'],
    'dance': ['flamenco', 'ballet', 'folk dance', 'traditional dance', 'performance', 'cultural show'],
    
    // Transportation & Tours - Method-based
    'tour': ['sightseeing', 'guided', 'excursion', 'trip', 'visit', 'explore', 'discover', 'walking tour'],
    'walking': ['walking tour', 'pedestrian', 'on foot', 'stroll', 'guided walk', 'city walk'],
    
    // Martial Arts & Traditional Combat
    'ninja': ['samurai', 'martial arts', 'warrior', 'feudal', 'bushido', 'katana', 'dojo', 'traditional combat'],
    'samurai': ['ninja', 'warrior', 'bushido', 'katana', 'feudal', 'martial arts', 'sword', 'honor']
  };

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: 'https://api.viator.com/partner',
      headers: {
        'Accept': 'application/json;version=2.0',

        'Content-Type': 'application/json',
        'exp-api-key': process.env.VIATOR_API_KEY
      },
      timeout: 30000
    });

    this.hf = new HfInference(process.env.HUGGINGFACE_API_KEY || '');
  }

  /**
   * ENHANCED: Initialize tag cache with semantic embeddings
   */
  async initializeTagCache(): Promise<void> {
    try {
      console.log('🏷️ Initializing Enhanced Viator tag cache...');
      
      // Set a timeout for the entire initialization process
      const initPromise = this.refreshTagCache();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Tag cache initialization timeout')), 30000)
      );
      
      await Promise.race([initPromise, timeoutPromise]);
      console.log(`✅ Enhanced tag cache initialized with ${this.tagCache.size} tags`);
    } catch (error: any) {
      console.error('❌ Failed to initialize enhanced tag cache:', error?.response?.data || error.message);
      console.log('🔄 Loading basic tag cache without semantic embeddings...');
      
      // Fallback: Load basic tag cache without semantic processing
      try {
        await this.loadBasicTagCache();
        console.log(`✅ Basic tag cache loaded with ${this.tagCache.size} tags`);
      } catch (fallbackError: any) {
        console.error('❌ Failed to load even basic tag cache:', fallbackError.message);
        // Continue without tags - will fall back to keyword search
      }
    }
  }

  /**
   * ENHANCED: Generate semantic embeddings for text
   */
  private async getSemanticEmbedding(text: string): Promise<number[]> {
    try {
      if (this.semanticCache.has(text)) {
        return this.semanticCache.get(text)!;
      }

      const response = await this.hf.featureExtraction({
        model: 'sentence-transformers/all-mpnet-base-v2',
        inputs: text
      });

      let embedding: number[];
      if (Array.isArray(response) && Array.isArray(response[0])) {
        embedding = response[0] as number[];
      } else if (Array.isArray(response)) {
        embedding = response as number[];
      } else {
        console.warn('Unexpected embedding response format');
        return new Array(768).fill(0);
      }

      this.semanticCache.set(text, embedding);
      return embedding;
    } catch (error) {
      console.error('Semantic embedding error:', error);
      return new Array(768).fill(0);
    }
  }

  /**
   * ENHANCED: Calculate cosine similarity between embeddings
   */
  private calculateCosineSimilarity(embedding1: number[], embedding2: number[]): number {
    if (embedding1.length !== embedding2.length) return 0;

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }

    const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }

  /**
   * ENHANCED: Refresh tag cache with semantic processing and categorization
   */
  private async refreshTagCache(): Promise<void> {
    try {
      const response = await this.axiosInstance.get('/products/tags');
      const tags: ViatorTag[] = response.data?.tags || [];

      // Clear existing cache
      this.tagCache.clear();
      this.tagsByName.clear();
      this.tagsByCategory.clear();

      console.log(`🔄 Processing ${tags.length} tags with semantic enhancement...`);

      // Process tags in batches to avoid rate limits
      const batchSize = 50;
      for (let i = 0; i < tags.length; i += batchSize) {
        const batch = tags.slice(i, i + batchSize);
        await this.procesTagBatch(batch);
        
        // Small delay between batches
        if (i + batchSize < tags.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      this.lastCacheUpdate = Date.now();
      console.log(`✅ Enhanced tag cache refreshed: ${this.tagCache.size} tags with semantic embeddings`);
    } catch (error: any) {
      console.error('❌ Failed to refresh enhanced tag cache:', error?.response?.data || error.message);
      throw error;
    }
  }

  /**
   * ENHANCED: Process a batch of tags with semantic embeddings
   */
  private async procesTagBatch(tags: ViatorTag[]): Promise<void> {
    for (const tag of tags) {
      if (!tag.tagId) {
        console.warn('⚠️ Skipping tag without tagId:', tag);
        continue;
      }
      
      // Extract all searchable terms
      const searchTerms: string[] = [];
      
      if (tag.tagName && typeof tag.tagName === 'string') {
        searchTerms.push(tag.tagName.toLowerCase());
      }
      
      if (tag.allNamesForTag && Array.isArray(tag.allNamesForTag)) {
        const validNames = tag.allNamesForTag
          .filter(name => name && typeof name === 'string')
          .map(name => name.toLowerCase());
        searchTerms.push(...validNames);
      }
      
      if (tag.allNamesByLocale && typeof tag.allNamesByLocale === 'object') {
        const englishKeys = ['en', 'en_US', 'en_GB', 'en_AU'];
        for (const key of englishKeys) {
          const name = tag.allNamesByLocale[key];
          if (name && typeof name === 'string') {
            searchTerms.push(name.toLowerCase());
            break;
          }
        }
      }
      
      if (searchTerms.length === 0) {
        continue;
      }

      // ENHANCED: Categorize tag based on content
      const category = this.categorizeTag(searchTerms);
      
      // SEMANTIC EMBEDDINGS DISABLED FOR STABILITY
      const primaryTerm = searchTerms[0];
      let semanticEmbedding: number[] = []; // Empty - no semantic embeddings
      
      // Create enhanced tag
      const enhancedTag: ViatorTag = {
        tagId: tag.tagId,
        tagName: primaryTerm,
        allNamesForTag: searchTerms,
        allNamesByLocale: tag.allNamesByLocale,
        category,
        semanticEmbedding
      };
      
      this.tagCache.set(tag.tagId, enhancedTag);

      // Index by name
      for (const term of searchTerms) {
        if (!this.tagsByName.has(term)) {
          this.tagsByName.set(term, []);
        }
        this.tagsByName.get(term)!.push(enhancedTag);
      }

      // Index by category
      if (category) {
        if (!this.tagsByCategory.has(category)) {
          this.tagsByCategory.set(category, []);
        }
        this.tagsByCategory.get(category)!.push(enhancedTag);
      }
    }
  }

  /**
   * BASIC: Load tag cache without semantic embeddings (fallback)
   */
  private async loadBasicTagCache(): Promise<void> {
    try {
      const response = await this.axiosInstance.get('/products/tags');
      const tags: ViatorTag[] = response.data?.tags || [];

      this.tagCache.clear();
      this.tagsByName.clear();
      this.tagsByCategory.clear();

      console.log(`🔄 Loading ${tags.length} tags without semantic processing...`);

      for (const tag of tags) {
        if (!tag.tagId) continue;
        
        const searchTerms: string[] = [];
        
        if (tag.tagName && typeof tag.tagName === 'string') {
          searchTerms.push(tag.tagName.toLowerCase());
        }
        
        if (tag.allNamesForTag && Array.isArray(tag.allNamesForTag)) {
          const validNames = tag.allNamesForTag
            .filter(name => name && typeof name === 'string')
            .map(name => name.toLowerCase());
          searchTerms.push(...validNames);
        }
        
        if (searchTerms.length === 0) continue;

        const basicTag: ViatorTag = {
          tagId: tag.tagId,
          tagName: searchTerms[0],
          allNamesForTag: searchTerms,
          allNamesByLocale: tag.allNamesByLocale,
          category: this.categorizeTag(searchTerms),
          semanticEmbedding: [] // No embeddings in basic mode
        };
        
        this.tagCache.set(tag.tagId, basicTag);

        for (const term of searchTerms) {
          if (!this.tagsByName.has(term)) {
            this.tagsByName.set(term, []);
          }
          this.tagsByName.get(term)!.push(basicTag);
        }

        if (basicTag.category) {
          if (!this.tagsByCategory.has(basicTag.category)) {
            this.tagsByCategory.set(basicTag.category, []);
          }
          this.tagsByCategory.get(basicTag.category)!.push(basicTag);
        }
      }

      this.lastCacheUpdate = Date.now();
      console.log(`✅ Basic tag cache loaded: ${this.tagCache.size} tags`);
    } catch (error: any) {
      console.error('❌ Failed to load basic tag cache:', error?.response?.data || error.message);
      throw error;
    }
  }

  /**
   * ENHANCED: Categorize tags based on hierarchical content analysis with L3/L4 focus
   */
  private categorizeTag(searchTerms: string[]): string | undefined {
    const combinedText = searchTerms.join(' ').toLowerCase();

    // Enhanced category patterns with hierarchical weights (L3/L4 specific terms get higher priority)
    const categoryPatterns = {
      'food_wine': {
        l3l4_terms: ['food tours', 'cooking classes', 'wine tasting', 'culinary experiences', 'market tours', 'chef experiences'],
        l2_terms: ['food', 'wine', 'culinary', 'cuisine', 'cooking', 'restaurant', 'dining', 'tasting', 'chef', 'gastronomy', 'vineyard', 'winery'],
        weight: 1.0
      },
      'museums': {
        l3l4_terms: ['museum tours', 'art galleries', 'cultural tours', 'historical sites', 'art museums', 'heritage tours'],
        l2_terms: ['museum', 'gallery', 'art', 'exhibition', 'cultural', 'heritage', 'collection'],
        weight: 0.9
      },
      'adventure_sports': {
        l3l4_terms: ['rock climbing', 'hiking tours', 'adventure sports', 'extreme sports', 'outdoor adventures'],
        l2_terms: ['adventure', 'extreme', 'climbing', 'hiking', 'rafting', 'bungee', 'skydiving'],
        weight: 0.8
      },
      'water_sports': {
        l3l4_terms: ['scuba diving', 'snorkeling tours', 'boat tours', 'fishing charters', 'sailing trips', 'kayaking tours'],
        l2_terms: ['water', 'marine', 'diving', 'snorkeling', 'kayaking', 'sailing', 'fishing', 'boat'],
        weight: 0.9
      },
      'cultural_sites': {
        l3l4_terms: ['cultural tours', 'historical tours', 'heritage sites', 'temple visits', 'cultural experiences'],
        l2_terms: ['cultural', 'historical', 'heritage', 'monument', 'castle', 'palace', 'temple'],
        weight: 0.8
      },
      'entertainment': {
        l3l4_terms: ['live shows', 'theater performances', 'concerts', 'cultural shows', 'entertainment experiences'],
        l2_terms: ['show', 'performance', 'theater', 'concert', 'music', 'entertainment'],
        weight: 0.7
      },
      'shopping': {
        l3l4_terms: ['shopping tours', 'market visits', 'local markets', 'souvenir shopping'],
        l2_terms: ['shopping', 'market', 'boutique', 'retail', 'souvenir'],
        weight: 0.6
      },
      'nightlife': {
        l3l4_terms: ['nightlife tours', 'bar hopping', 'night entertainment', 'cocktail experiences'],
        l2_terms: ['nightlife', 'bar', 'club', 'pub', 'cocktail'],
        weight: 0.5
      }
    };

    let bestMatch = { category: '', score: 0, specificity: 0 };

    for (const [category, config] of Object.entries(categoryPatterns)) {
      let score = 0;
      let specificity = 0;

      // L3/L4 specific terms get 3x weight (highly specific activities)
      for (const term of config.l3l4_terms) {
        if (combinedText.includes(term)) {
          score += term.length * 3 * config.weight;
          specificity += 3;
        }
      }

      // L2 general terms get 1x weight
      for (const term of config.l2_terms) {
        if (combinedText.includes(term)) {
          score += term.length * 1 * config.weight;
          specificity += 1;
        }
      }

      // Prioritize categories with higher specificity (L3/L4 matches)
      const totalScore = score + (specificity * 10);

      if (totalScore > bestMatch.score) {
        bestMatch = { category, score: totalScore, specificity };
      }
    }

    return bestMatch.score > 0 ? bestMatch.category : undefined;
  }

  /**
   * Calculate hierarchical relevance score for tag matching
   */
  private calculateHierarchicalRelevance(tag: ViatorTag, searchTerms: string[]): number {
    let relevanceScore = 0;
    const tagText = `${tag.tagName} ${tag.allNamesForTag?.join(' ') || ''}`.toLowerCase();

    for (const term of searchTerms) {
      // Exact match gets highest score
      if (tagText.includes(term.toLowerCase())) {
        relevanceScore += term.length * 2;
      }

      // Semantic expansion matches
      const expansions = this.SEMANTIC_MAPPINGS[term.toLowerCase()] || [];
      for (const expansion of expansions) {
        if (tagText.includes(expansion)) {
          relevanceScore += expansion.length * 1.5;
        }
      }
    }

    // Apply category-specific bonuses
    if (tag.category) {
      const categoryBonus = this.getCategoryRelevanceBonus(tag.category, searchTerms);
      relevanceScore *= (1 + categoryBonus);
    }

    return relevanceScore;
  }

  /**
   * Get category-specific relevance bonus
   */
  private getCategoryRelevanceBonus(category: string, searchTerms: string[]): number {
    const searchText = searchTerms.join(' ').toLowerCase();
    
    const categoryBonuses: { [category: string]: string[] } = {
      'food_wine': ['food', 'culinary', 'wine', 'dining', 'cooking'],
      'museums': ['museum', 'art', 'culture', 'gallery', 'history'],
      'adventure_sports': ['adventure', 'extreme', 'hiking', 'climbing'],
      'water_sports': ['water', 'diving', 'boat', 'marine', 'sailing'],
      'cultural_sites': ['cultural', 'heritage', 'traditional', 'temple']
    };

    const relevantTerms = categoryBonuses[category] || [];
    const matches = relevantTerms.filter((term: string) => searchText.includes(term)).length;
    
    return matches > 0 ? matches * 0.2 : 0; // 20% bonus per matching category term
  }

  /**
   * ENHANCED: Detect primary category from user interests
   */
  private detectPrimaryCategory(interests: string): string | null {
    const normalizedInterests = interests.toLowerCase();
    
    // Food and wine detection
    if (this.hasAnyKeyword(normalizedInterests, ['food', 'wine', 'culinary', 'cuisine', 'restaurant', 'dining', 'tasting', 'cooking', 'chef', 'gastronomy', 'market', 'gourmet'])) {
      return 'food_wine';
    }
    
    // Museums and cultural sites
    if (this.hasAnyKeyword(normalizedInterests, ['museum', 'gallery', 'art', 'cultural', 'history', 'heritage', 'exhibition', 'collection'])) {
      return 'museums';
    }
    
    // Adventure sports
    if (this.hasAnyKeyword(normalizedInterests, ['adventure', 'extreme', 'climbing', 'hiking', 'sports', 'adrenaline', 'zip', 'bungee'])) {
      return 'adventure_sports';
    }
    
    // Water sports
    if (this.hasAnyKeyword(normalizedInterests, ['water', 'diving', 'snorkeling', 'kayaking', 'boat', 'sailing', 'swimming', 'surf'])) {
      return 'water_sports';
    }
    
    // Cultural sites (broader than museums)
    if (this.hasAnyKeyword(normalizedInterests, ['temple', 'shrine', 'monument', 'palace', 'castle', 'traditional', 'cultural'])) {
      return 'cultural_sites';
    }
    
    return null;
  }

  /**
   * Helper method to check if text contains any of the specified keywords
   */
  private hasAnyKeyword(text: string, keywords: string[]): boolean {
    return keywords.some(keyword => text.includes(keyword));
  }

  /**
   * ENHANCED: Apply strict category filtering with negative scoring
   */
  private applyStrictCategoryFiltering(tags: ViatorTag[], primaryCategory: string | null): ViatorTag[] {
    if (!primaryCategory || !this.CATEGORY_EXCLUSIONS[primaryCategory]) {
      return tags; // No filtering if category not detected
    }

    const categoryRules = this.CATEGORY_EXCLUSIONS[primaryCategory];
    const filteredTags: ViatorTag[] = [];

    for (const tag of tags) {
      let shouldExclude = false;
      let negativeScore = 0;

      // Check category exclusions
      if (tag.category && categoryRules.excludeCategories.includes(tag.category)) {
        if (categoryRules.strictMode) {
          shouldExclude = true;
        } else {
          negativeScore += 0.3; // Soft penalty
        }
      }

      // Check keyword exclusions
      const tagText = `${tag.tagName} ${tag.allNamesForTag?.join(' ') || ''}`.toLowerCase();
      for (const excludeKeyword of categoryRules.excludeKeywords) {
        if (tagText.includes(excludeKeyword.toLowerCase())) {
          if (categoryRules.strictMode) {
            shouldExclude = true;
            break;
          } else {
            negativeScore += 0.2; // Soft penalty per keyword
          }
        }
      }

      if (!shouldExclude) {
        // Apply negative scoring
        if (negativeScore > 0) {
          tag.semanticScore = (tag.semanticScore || 0.5) - negativeScore;
          tag.semanticScore = Math.max(tag.semanticScore, 0.1); // Minimum threshold
        }

        // Only include if score is still above threshold
        if ((tag.semanticScore || 0.5) >= 0.3) {
          filteredTags.push(tag);
        }
      }
    }

    console.log(`🎯 Category filtering (${primaryCategory}): ${tags.length} → ${filteredTags.length} tags`);
    return filteredTags;
  }

  /**
   * Get tag IDs that should be excluded for a given category
   */
  private getExclusionTagIds(category: string): number[] {
    const rules = this.CATEGORY_EXCLUSIONS[category];
    if (!rules) return [];

    const exclusionTags: number[] = [];
    
    for (const excludeCategory of rules.excludeCategories) {
      const categoryTags = this.tagsByCategory.get(excludeCategory) || [];
      exclusionTags.push(...categoryTags.map(tag => tag.tagId));
    }

    return exclusionTags;
  }

  /**
   * ENHANCED: Find matching tags with strict category filtering and semantic thresholds
   */
  async findMatchingTags(interests: string): Promise<TagSearchResult> {
    console.log(`🔍 ENHANCED tag search for: "${interests}"`);

    // Refresh cache if stale
    if (Date.now() - this.lastCacheUpdate > this.CACHE_DURATION) {
      try {
        await this.refreshTagCache();
      } catch (error) {
        console.warn('⚠️ Failed to refresh stale tag cache, using existing cache');
      }
    }

    if (this.tagCache.size === 0) {
      console.warn('⚠️ Tag cache is empty, returning no matches');
      return { matchedTags: [], tagIds: [], confidence: 0 };
    }

    // Step 1: Detect primary category for strict filtering
    const primaryCategory = this.detectPrimaryCategory(interests);
    console.log(`🎯 Detected primary category: ${primaryCategory || 'none'}`);

    // Step 2: Parse interests with semantic expansion
    const interestTerms = this.parseInterestsEnhanced(interests);
    console.log(`📝 Enhanced terms: ${interestTerms.join(', ')}`);

    // Step 3: Multi-strategy matching with semantic similarity
    let allMatches: ViatorTag[] = [];
    
    // Semantic matching (primary strategy)
    if (this.semanticCache.size > 0) {
      const semanticMatches = await this.findSemanticMatches(interests, new Set());
      allMatches.push(...semanticMatches);
      console.log(`🧠 Semantic matches: ${semanticMatches.length} tags`);
    }

    // Keyword matching (fallback/supplement)
    const keywordMatches = await this.findKeywordMatches(interestTerms, new Set(allMatches.map(t => t.tagId)));
    allMatches.push(...keywordMatches);
    console.log(`🔤 Keyword matches: ${keywordMatches.length} additional tags`);

    // Step 4: Apply strict category filtering
    let filteredTags = this.applyStrictCategoryFiltering(allMatches, primaryCategory);

    // Step 5: Apply final semantic similarity threshold
    filteredTags = filteredTags.filter(tag => {
      const score = tag.semanticScore || 0.5;
      return score >= 0.4; // Final threshold for inclusion
    });

    // Step 6: Sort by relevance and limit results
    filteredTags.sort((a, b) => (b.semanticScore || 0) - (a.semanticScore || 0));
    const topTags = filteredTags.slice(0, 8); // Reduced for precision

    // Step 7: Calculate confidence
    const avgSimilarity = topTags.length > 0 
      ? topTags.reduce((sum, tag) => sum + (tag.semanticScore || 0.5), 0) / topTags.length 
      : 0;
    const finalConfidence = Math.min(avgSimilarity * 100, 95);

    console.log(`✅ Enhanced matching: ${topTags.length} tags, ${finalConfidence.toFixed(1)}% confidence`);
    console.log(`🏷️ Matched tags: ${topTags.map(t => t.tagName).slice(0, 5).join(', ')}`);

    return {
      matchedTags: topTags,
      tagIds: topTags.map(tag => tag.tagId),
      exclusionTags: primaryCategory ? this.getExclusionTagIds(primaryCategory) : undefined,
      confidence: finalConfidence,
      semanticScore: topTags[0]?.semanticScore
    };
  }

  /**
   * ENHANCED: Find keyword-based matches with hierarchical scoring and L3/L4 prioritization
   */
  private async findKeywordMatches(terms: string[], excludeIds: Set<number>): Promise<ViatorTag[]> {
    const tagScores = new Map<number, { tag: ViatorTag; score: number }>();
    
    for (const term of terms) {
      // Direct name matches
      if (this.tagsByName.has(term)) {
        const tags = this.tagsByName.get(term)!;
        for (const tag of tags) {
          if (!excludeIds.has(tag.tagId)) {
            const relevanceScore = this.calculateHierarchicalRelevance(tag, terms);
            const existing = tagScores.get(tag.tagId);
            
            if (!existing || relevanceScore > existing.score) {
              tagScores.set(tag.tagId, { tag, score: relevanceScore });
            }
          }
        }
      }

      // Semantic expansion matches
      const expansions = this.SEMANTIC_MAPPINGS[term.toLowerCase()] || [];
      for (const expansion of expansions) {
        if (this.tagsByName.has(expansion)) {
          const tags = this.tagsByName.get(expansion)!;
          for (const tag of tags) {
            if (!excludeIds.has(tag.tagId)) {
              const relevanceScore = this.calculateHierarchicalRelevance(tag, terms) * 0.8; // Slight reduction for semantic matches
              const existing = tagScores.get(tag.tagId);
              
              if (!existing || relevanceScore > existing.score) {
                tagScores.set(tag.tagId, { tag, score: relevanceScore });
              }
            }
          }
        }
      }
    }

    // Sort by score and assign semantic scores
    const sortedMatches = Array.from(tagScores.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 12); // Limit results for performance

    // Assign normalized semantic scores
    const maxScore = sortedMatches[0]?.score || 1;
    return sortedMatches.map(({ tag, score }) => {
      tag.semanticScore = Math.min(score / maxScore, 1.0);
      return tag;
    });
  }

  /**
   * ENHANCED: Parse interests with semantic expansion
   */
  private parseInterestsEnhanced(interests: string): string[] {
    const baseTerms = interests
      .toLowerCase()
      .split(/[,;|&+\n]/)
      .map(term => term.trim())
      .filter(term => term.length > 2)
      .map(term => term.replace(/[^\w\s]/g, ''))
      .filter(term => term.length > 0);

    const expandedTerms = new Set(baseTerms);
    
    // Add semantic mappings
    for (const term of baseTerms) {
      for (const [key, mappings] of Object.entries(this.SEMANTIC_MAPPINGS)) {
        if (term.includes(key)) {
          mappings.forEach(mapping => expandedTerms.add(mapping));
        }
      }
    }

    return Array.from(expandedTerms);
  }



  /**
   * ENHANCED: Perform multi-strategy matching
   */
  private async performEnhancedMatching(terms: string[], intentCategory?: string): Promise<{
    matchedTags: ViatorTag[];
    tagIds: number[];
  }> {
    const matchedTags: ViatorTag[] = [];
    const matchedTagIds = new Set<number>();

    // Strategy 1: Exact name matching (highest priority)
    for (const term of terms) {
      const exactMatches = this.tagsByName.get(term) || [];
      for (const tag of exactMatches) {
        if (!matchedTagIds.has(tag.tagId)) {
          matchedTags.push(tag);
          matchedTagIds.add(tag.tagId);
        }
      }
    }

    // Strategy 2: Category-based matching
    if (intentCategory && this.tagsByCategory.has(intentCategory)) {
      const categoryTags = this.tagsByCategory.get(intentCategory)!;
      for (const tag of categoryTags.slice(0, 10)) { // Limit to top 10
        if (!matchedTagIds.has(tag.tagId)) {
          matchedTags.push(tag);
          matchedTagIds.add(tag.tagId);
        }
      }
    }

    // Strategy 3: Semantic similarity matching
    if (terms.length > 0) {
      const semanticMatches = await this.findSemanticMatches(terms[0], matchedTagIds);
      matchedTags.push(...semanticMatches);
      semanticMatches.forEach(tag => matchedTagIds.add(tag.tagId));
    }

    return {
      matchedTags,
      tagIds: Array.from(matchedTagIds)
    };
  }

  /**
   * ENHANCED: Find semantic matches using embeddings
   */
  private async findSemanticMatches(queryTerm: string, excludeIds: Set<number>): Promise<ViatorTag[]> {
    try {
      const queryEmbedding = await this.getSemanticEmbedding(queryTerm);
      const semanticMatches: { tag: ViatorTag; similarity: number }[] = [];

      for (const tag of Array.from(this.tagCache.values())) {
        if (excludeIds.has(tag.tagId) || !tag.semanticEmbedding) continue;

        const similarity = this.calculateCosineSimilarity(queryEmbedding, tag.semanticEmbedding);
        if (similarity > this.SEMANTIC_THRESHOLD) {
          semanticMatches.push({ tag, similarity });
        }
      }

      // Sort by similarity and return top 5
      return semanticMatches
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 5)
        .map(match => match.tag);

    } catch (error) {
      console.error('Semantic matching error:', error);
      return [];
    }
  }

  /**
   * ENHANCED: Apply strict exclusions based on category
   */
  private applyStrictExclusions(results: { matchedTags: ViatorTag[]; tagIds: number[] }, intentCategory?: string): {
    matchedTags: ViatorTag[];
    tagIds: number[];
    exclusionTags: number[];
  } {
    if (!intentCategory || !this.CATEGORY_EXCLUSIONS[intentCategory]) {
      return { ...results, exclusionTags: [] };
    }

    const exclusionConfig = this.CATEGORY_EXCLUSIONS[intentCategory];
    const exclusionTags: number[] = [];
    
    const filteredTags = results.matchedTags.filter(tag => {
      // Check category exclusions
      if (tag.category && exclusionConfig.excludeCategories.includes(tag.category)) {
        exclusionTags.push(tag.tagId);
        return false;
      }

      // Check keyword exclusions
      const tagText = (tag.allNamesForTag || []).join(' ').toLowerCase();
      const hasExcludedKeyword = exclusionConfig.excludeKeywords.some(keyword => 
        tagText.includes(keyword)
      );

      if (hasExcludedKeyword) {
        exclusionTags.push(tag.tagId);
        return false;
      }

      return true;
    });

    console.log(`🚫 Excluded ${exclusionTags.length} tags for category: ${intentCategory}`);

    return {
      matchedTags: filteredTags,
      tagIds: filteredTags.map(tag => tag.tagId),
      exclusionTags
    };
  }

  /**
   * ENHANCED: Calculate semantic confidence score
   */
  private async calculateSemanticConfidence(interests: string, tags: ViatorTag[]): Promise<number> {
    if (tags.length === 0) return 0;

    try {
      const interestEmbedding = await this.getSemanticEmbedding(interests);
      let totalSimilarity = 0;
      let validTags = 0;

      for (const tag of tags) {
        if (tag.semanticEmbedding) {
          const similarity = this.calculateCosineSimilarity(interestEmbedding, tag.semanticEmbedding);
          totalSimilarity += similarity;
          validTags++;
        }
      }

      return validTags > 0 ? (totalSimilarity / validTags) * 100 : 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * ENHANCED: Calculate overall confidence
   */
  private calculateOverallConfidence(results: { matchedTags: ViatorTag[]; tagIds: number[] }, semanticScore: number): number {
    const tagCount = results.matchedTags.length;
    const tagScore = Math.min(tagCount / 5, 1) * 40; // Up to 40 points for tag count
    const semanticWeight = semanticScore * 0.6; // Up to 60 points for semantic similarity
    
    return Math.min(Math.round(tagScore + semanticWeight), 100);
  }

  /**
   * Enhanced function to convert free-text interests into specific Viator tagIds
   */
  async findTagIdsByInterest(interestString: string): Promise<number[]> {
    const result = await this.findMatchingTags(interestString);
    
    // Only return tags if confidence is above threshold
    if (result.confidence >= this.CONFIDENCE_THRESHOLD * 100) {
      return result.tagIds;
    }
    
    console.log(`⚠️ Tag confidence ${result.confidence}% below threshold ${this.CONFIDENCE_THRESHOLD * 100}%`);
    return [];
  }

  /**
   * Get tag cache status
   */
  getCacheStatus(): { size: number; lastUpdate: number; isStale: boolean; hasSemantics: boolean } {
    const isStale = Date.now() - this.lastCacheUpdate > this.CACHE_DURATION;
    const hasSemantics = Array.from(this.tagCache.values()).some(tag => tag.semanticEmbedding);
    
    return {
      size: this.tagCache.size,
      lastUpdate: this.lastCacheUpdate,
      isStale,
      hasSemantics
    };
  }

  /**
   * Get tag details by IDs
   */
  getTagsByIds(tagIds: number[]): ViatorTag[] {
    return tagIds
      .map(id => this.tagCache.get(id))
      .filter((tag): tag is ViatorTag => tag !== undefined);
  }

  /**
   * Get all available tags (for debugging)
   */
  getAllTags(): ViatorTag[] {
    return Array.from(this.tagCache.values());
  }

  /**
   * Get tags by category (for debugging)
   */
  getTagsByCategory(category: string): ViatorTag[] {
    return this.tagsByCategory.get(category) || [];
  }
}

// Create and export singleton instance
export const tagManager = new TagManager();
