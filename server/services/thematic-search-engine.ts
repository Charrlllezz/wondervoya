/**
 * 🎯 THEMATIC SEARCH ENGINE
 * Advanced search engine optimized for thematic accuracy using Viator API best practices
 * 
 * Based on Viator API documentation analysis:
 * - Uses TRAVELER_RATING for proper sorting
 * - Leverages /products/search and /search/freetext endpoints
 * - Implements tag-based filtering for precise categorization
 * - Multi-strategy approach for maximum coverage
 */

import { viatorService } from './viator';
import { csvTagManager } from './csv-tag-manager';
import type { ActivityRecommendation } from '@shared/schema';

/**
 * Word-boundary-aware substring check. Plain `.includes()` false-positives on
 * short keywords like "art" or "mall" matching inside unrelated words such as
 * "start"/"participant" or "small" — this avoids that.
 */
function containsWord(content: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(content);
}

// Theme names that have a bespoke pass/fail filter in passesThemeSpecificFiltering
// (everything except the generic fallback used for undetected/unknown themes).
const THEMES_WITH_DEDICATED_FILTERING = new Set([
  'Food & Culinary Tours',
  'Museums & Arts',
  'Ninja & Samurai Experiences',
  'Fishing Activities',
  'Royal History & Knights',
  'Water Activities',
  'Cultural Heritage',
]);

interface ThematicSearchResult {
  products: any[];
  strategy: string;
  confidence: number;
  thematicRelevance: number;
}

interface SearchTheme {
  name: string;
  keywords: string[];
  searchTerms: string[];
  excludeKeywords: string[];
  tagIds?: number[];
  priority: number;
}

export class ThematicSearchEngine {
  // Comprehensive theme definitions with Viator Tags integration
  // ORDER MATTERS: More specific themes first to ensure proper detection
  private static SEARCH_THEMES: { [key: string]: SearchTheme } = {
    ninja_samurai: {
      name: 'Ninja & Samurai Experiences',
      keywords: ['ninja', 'samurai', 'warrior', 'katana', 'bushido', 'shogun', 'dojo', 'martial arts', 'sword', 'feudal', 'swordsmanship', 'culture', 'temples', 'traditional'],
      searchTerms: ['ninja experience', 'samurai tour', 'ninja museum', 'samurai house', 'martial arts', 'ninja village', 'samurai district', 'temple tour', 'cultural tour'],
      excludeKeywords: ['food', 'dining', 'culinary', 'restaurant', 'modern', 'shopping', 'technology', 'digital'],
      tagIds: [], // Auto-populated with cultural/historical experience tags
      priority: 100 // Highest priority for specific cultural experiences
    },

    fishing: {
      name: 'Fishing Activities',
      keywords: ['fishing', 'fish', 'charter', 'angling', 'catch', 'rod', 'reel', 'bait', 'tackle', 'deep sea', 'sport fish'],
      searchTerms: ['fishing charter', 'fishing tour', 'deep sea fishing', 'sport fishing', 'fishing excursion', 'angling', 'fishing boat'],
      excludeKeywords: ['museum', 'art', 'gallery', 'shopping', 'mall'],
      tagIds: [], // Will be auto-populated with Viator fishing tag IDs
      priority: 95
    },

    food_tours: {
      name: 'Food & Culinary Tours',
      keywords: ['food', 'culinary', 'dining', 'food tour', 'food tours', 'cuisine', 'restaurant', 'chef', 'cooking', 'tasting', 'market', 'food experience'],
      searchTerms: ['food tour', 'culinary tour', 'food experience', 'cooking class', 'food tasting', 'market tour', 'street food tour', 'dining experience'],
      excludeKeywords: ['ninja', 'samurai', 'warrior', 'sword', 'museum', 'art', 'gallery', 'shopping', 'mall', 'monument'],
      tagIds: [], // Will be auto-populated with Viator food tag IDs
      priority: 90 // Lower priority than specific cultural themes
    },

    royal_history: {
      name: 'Royal History & Knights',
      keywords: ['royal', 'king', 'queen', 'knight', 'castle', 'palace', 'crown', 'throne', 'medieval', 'monarchy', 'nobility'],
      searchTerms: ['royal palace', 'castle tour', 'royal history', 'medieval tour', 'palace visit', 'crown jewels', 'royal residences'],
      excludeKeywords: ['modern', 'contemporary', 'shopping', 'restaurant'],
      tagIds: [], // Auto-populated with historical/cultural heritage tags
      priority: 90
    },

    museums_arts: {
      name: 'Museums & Arts',
      keywords: ['museum', 'museums', 'art', 'gallery', 'galleries', 'exhibition', 'collection', 'artifacts', 'paintings', 'sculpture', 'cultural center', 'museum visit'],
      searchTerms: [
        // CRITICAL FIX: Use broader terms that Viator actually has in their inventory
        'cultural tour', 'historical tour', 'art tour', 'heritage tour', 
        'cultural experience', 'historical experience', 'cultural attraction',
        'museum', 'art gallery', 'cultural site'
      ],
      excludeKeywords: ['food', 'dining', 'culinary', 'restaurant', 'cooking', 'market', 'shopping', 'modern technology', 'd-day', 'normandy', 'war', 'battlefield', 'cemetery', 'landing', 'beaches', 'military', 'soldiers', 'cruise', 'boat tour', 'river', 'dinner', 'lunch'],
      tagIds: [], // Auto-populated with museum/arts tags
      priority: 95 // High priority for museum-specific searches
    },

    cultural_heritage: {
      name: 'Cultural Heritage',
      keywords: ['culture', 'heritage', 'tradition', 'history', 'temple', 'shrine', 'monument', 'historical site', 'archaeological'],
      searchTerms: ['cultural tour', 'heritage site', 'historical tour', 'cultural experience', 'historical visit'],
      excludeKeywords: ['shopping', 'modern', 'technology', 'food', 'dining'],
      tagIds: [], // Auto-populated with cultural heritage tags
      priority: 85
    },

    water_activities: {
      name: 'Water Activities',
      keywords: ['water', 'ocean', 'sea', 'boat', 'cruise', 'marine', 'aquatic', 'swimming', 'diving', 'snorkeling'],
      searchTerms: ['boat tour', 'marine experience', 'water activities', 'ocean tour', 'sea excursion'],
      excludeKeywords: ['land', 'mountain', 'desert', 'city'],
      tagIds: [], // Auto-populated with water/marine activity tags
      priority: 80
    }
  };

  /**
   * Initialize theme with relevant Viator tags from CSV taxonomy
   */
  private static async initializeThemeWithTags(theme: SearchTheme): Promise<SearchTheme> {
    try {
      // ALWAYS use hardcoded CSV-verified tags for maximum precision
      theme.tagIds = this.getHardcodedTagsForTheme(theme.name);
      console.log(`🎯 CSV HARDCODED MAPPING: "${theme.name}" using verified taxonomy tags: ${theme.tagIds?.join(', ') || 'none'}`);

      // Multi-system tag verification for comprehensive coverage
      try {
        const searchQuery = theme.keywords.slice(0, 5).join(' ');
        
        // CSV Tag Manager (primary - hierarchical L3/L4 focus)
        const csvResult = await csvTagManager.findMatchingTags(searchQuery);
        if (csvResult.matchedTags && csvResult.matchedTags.length > 0) {
          console.log(`🏷️ CSV VERIFICATION: Found ${csvResult.matchedTags.length} matching tags with ${csvResult.confidence}% confidence`);
          console.log(`📋 CSV matches: ${csvResult.matchedTags.slice(0, 5).map((t: any) => t.tagName).join(', ')}`);
          
          // Add L3/L4 prioritized tags from CSV system
          const l3l4Tags = csvResult.matchedTags
            .filter((t: any) => t.level === 'L3' || t.level === 'L4')
            .slice(0, 8)
            .map((t: any) => t.tagId);
          
          theme.tagIds = [...new Set([...theme.tagIds, ...l3l4Tags])];
        }

        // Enhanced Tag Matcher (secondary - semantic clustering)
        try {
          // Note: enhancedTagMatcher not currently available
          // const enhancedResult = await enhancedTagMatcher.matchUserInterests(searchQuery);
          console.log(`⚠️ Enhanced tag matcher not available - using CSV fallback`);
        } catch (enhancedError) {
          console.warn(`⚠️ Enhanced tag matcher failed:`, (enhancedError as Error)?.message);
        }

        // Tag Manager (fallback - comprehensive semantic mappings)
        try {
          const tagManagerResult = await csvTagManager.findMatchingTags(searchQuery);
          if (tagManagerResult.confidence > 60) {
            const fallbackTags = tagManagerResult.tagIds.slice(0, 4);
            theme.tagIds = [...new Set([...theme.tagIds, ...fallbackTags])];
            console.log(`🔄 TAG MANAGER VERIFICATION: Added ${fallbackTags.length} fallback tags with ${tagManagerResult.confidence}% confidence`);
          }
        } catch (tagManagerError) {
          console.warn(`⚠️ Tag manager verification failed:`, (tagManagerError as Error)?.message);
        }

        console.log(`🏆 FINAL TAG CONSOLIDATION: ${theme.tagIds.length} total tags for theme "${theme.name}"`);
        
      } catch (verifyError) {
        console.warn(`⚠️ Multi-system tag verification failed:`, (verifyError as Error)?.message);
      }

      return theme;
    } catch (error) {
      console.warn(`⚠️ Failed to load CSV tags for theme "${theme.name}":`, (error as Error)?.message || 'unknown error');
      // Fallback to hardcoded mapping
      theme.tagIds = this.getHardcodedTagsForTheme(theme.name);
      return theme;
    }
  }

  /**
   * HIERARCHICAL CSV tag mapping using L1 → L2 → L3 → L4 structure
   */
  private static getHardcodedTagsForTheme(themeName: string): number[] {
    const tagMappings: { [key: string]: number[] } = {
      'Museums & Arts': [
        // L1: Top-level categories for maximum coverage
        21912, // L1: Tickets & Passes (primary for museum tickets)
        21910, // L1: Art & Culture (cultural activities)
        // L2: Museum and cultural parent categories
        12716, // L2: Attractions & Museums (direct museum parent)
        21511, // L2: Culture (cultural parent)
        21509, // L2: Arts & Design (art-focused)
        // L3: Specific museum and cultural activities (most targeted)
        13109, // L3: Museums (primary museum tag)
        21598, // L3: Art Galleries (art-focused searches)
        12028, // L3: Cultural Tours (cultural experiences)
        12029, // L3: Historical Tours (history-focused)
        21617, // L3: Historical Landmarks (historical sites)
        21638, // L3: Religious Sites (cathedrals, churches)
        12013, // L3: Architecture Tours (architectural heritage)
        21654, // L3: Ancient Ruins (archaeological sites)
        20227, // L3: Cultural Experiences (general cultural)
        21648  // L3: Cultural Activities (additional cultural tag)
      ],
      'Fishing Activities': [
        // L1: Multiple broad categories for maximum coverage
        21909, // L1: Outdoor Activities (primary)
        12520, // L1: Activities (alternative broad category)
        // L2: Water activities parent category  
        21442, // L2: On the Water (direct parent of fishing)
        12722, // L2: Outdoor Activities (alternative)
        // L3: All fishing-specific activities (most targeted)
        12036, // L3: Fishing Charters (primary)
        13129, // L3: Fishing (general)
        21434, // L3: Ice Fishing
        // L3: Related water activities (backup)
        11932, // L3: Boat Rentals
        11888, // L3: Sailing
        12047  // L3: Kayaking Tours
      ],
      'Ninja & Samurai Experiences': [
        // L1: Multiple broad categories for Japan cultural activities
        21910, // L1: Art & Culture
        21912, // L1: Tickets & Passes (for temple/shrine visits)
        // L2: Cultural parent categories
        21511, // L2: Culture (parent)
        21509, // L2: Arts & Design (for traditional arts)
        12716, // L2: Attractions & Museums
        // L3: Japan-specific cultural activities (most targeted)
        21523, // L3: Historical Reenactments (verified)
        21648, // L3: Swordsmanship (martial arts)
        21553, // L3: Swordsmanship Classes
        20227, // L3: Martial Arts Classes
        12028, // L3: Cultural Tours
        12029, // L3: Historical Tours  
        13109, // L3: Museums
        21617, // L3: Historical Landmarks
        21638, // L3: Religious Sites (temples/shrines)  
        12013, // L3: Architecture Tours (traditional buildings)
        21598, // L3: Art Galleries (traditional arts)
        21511, // L3: Culture (broad cultural category)
        12716  // L3: Attractions & Museums (backup)
      ],
      'Royal History & Knights': [
        // L1: Top-level tickets category
        21912, // L1: Tickets & Passes
        // L2: Attractions parent category
        12716, // L2: Attractions & Museums (parent)
        21725, // L2: Sightseeing Tours (parent) 
        // L3: Royal-specific attractions (most targeted)
        13108, // L3: Castles
        21606, // L3: Castle Tours
        13109, // L3: Museums
        21617, // L3: Historical Landmarks
        21654  // L3: Ancient Ruins
      ],
      'Cultural Heritage': [
        // L1: Top-level art & culture category
        21910, // L1: Art & Culture
        21912, // L1: Tickets & Passes (for museums)
        // L2: Cultural parent categories
        21511, // L2: Culture (parent)
        12716, // L2: Attractions & Museums (parent)
        // L3: Specific cultural institutions (most targeted)
        13109, // L3: Museums
        21617, // L3: Historical Landmarks
        21638, // L3: Religious Sites
        21654, // L3: Ancient Ruins
        12028  // L3: Cultural Tours
      ],
      'Water Activities': [
        // L1: Multiple broad categories for maximum coverage
        21909, // L1: Outdoor Activities (primary)
        21913, // L1: Tours, Sightseeing & Cruises (for cruises)
        // L2: Water activities parent categories
        21442, // L2: On the Water (primary)
        21701, // L2: Cruises & Sailing (for sailing activities)
        // L3: Comprehensive water activities (most targeted)
        12047, // L3: Kayaking Tours
        12021, // L3: Scuba Diving
        11912, // L3: Snorkeling
        11888, // L3: Sailing
        20204, // L3: Catamaran Cruises
        11963, // L3: Sunset Cruises
        12052, // L3: Whale Watching
        21729  // L3: Sightseeing Cruises
      ],
      'Food & Culinary Tours': [
        // L1: Multiple broad categories for maximum coverage
        21913, // L1: Tours, Sightseeing & Cruises (parent for food tours)
        21910, // L1: Art & Culture (some culinary experiences are cultural)
        // L2: Food and tour parent categories
        21701, // L2: Cruises & Sailing (for dining cruises)
        21725, // L2: Sightseeing Tours (for food tours)
        21526, // L2: Food & Dining (direct food category)
        // L3: Comprehensive food activities (most targeted)
        12028, // L3: Cultural Tours (for food culture tours)
        11965, // L3: Dinner Cruises
        11964, // L3: Lunch Cruises  
        11967, // L3: Brunch Cruises
        21707, // L3: Breakfast Cruises
        21711, // L3: Coffee Cruises
        12015, // L3: Food Tours (primary)
        12016, // L3: Wine Tours
        12017, // L3: Cooking Classes
        21598, // L3: Market Tours
        21648, // L3: Cultural Experiences (food culture)
        20204, // L3: Catamaran Cruises (food-friendly)
        11888  // L3: Sailing (dining/sunset combo)
      ]
    };

    return tagMappings[themeName] || [];
  }

  /**
   * SEMANTIC MAPPING: Connect user intent to taxonomy tags
   */
  private static getSemanticMappings(): { [userIntent: string]: string[] } {
    return {
      // Japanese Cultural Intent → Taxonomy Concepts (Enhanced)
      'ninja': ['swordsmanship', 'martial arts', 'historical reenactments', 'culture', 'history', 'temples', 'traditional'],
      'samurai': ['swordsmanship', 'martial arts', 'historical tours', 'culture', 'temples', 'history', 'traditional', 'museums'],
      'bushido': ['martial arts', 'culture', 'historical tours', 'temples', 'swordsmanship'],
      'katana': ['swordsmanship', 'martial arts', 'museums', 'historical'],
      'dojo': ['martial arts', 'swordsmanship', 'culture', 'traditional'],
      'warrior': ['martial arts', 'swordsmanship', 'historical tours', 'culture'],

      // Fishing Intent → Taxonomy Concepts  
      'fishing': ['fishing charters', 'boat rentals', 'outdoor activities', 'water'],
      'angling': ['fishing charters', 'fishing', 'outdoor activities'],
      'charter': ['fishing charters', 'boat rentals', 'sailing'],

      // Cultural Intent → Taxonomy Concepts
      'knights': ['historical reenactments', 'castles', 'museums', 'history'],
      'medieval': ['historical tours', 'castles', 'museums', 'history'],
      'royal': ['palaces', 'castles', 'historical landmarks', 'museums'],

      // Museum Intent → Taxonomy Concepts  
      'museum': ['museums', 'art galleries', 'exhibitions', 'cultural centers', 'history'],
      'museums': ['museums', 'art galleries', 'exhibitions', 'cultural centers', 'history'],
      'gallery': ['art galleries', 'museums', 'exhibitions', 'art'],
      'art': ['art galleries', 'museums', 'exhibitions', 'cultural']
    };
  }

  /**
   * Enhanced theme detection with semantic mapping
   */
  private static detectTheme(query: string): SearchTheme | null {
    const queryLower = query.toLowerCase();
    let bestMatch: { theme: SearchTheme; score: number } | null = null;

    // SEMANTIC ENHANCEMENT: Expand query with related concepts (but prevent cross-contamination)
    const semanticMappings = this.getSemanticMappings();
    let expandedQuery = queryLower;

    // Only add semantic concepts if they don't conflict with primary intent
    const hasMuseumIntent = queryLower.includes('museum') || queryLower.includes('history') || queryLower.includes('art');
    const hasFoodIntent = queryLower.includes('food') || queryLower.includes('culinary') || queryLower.includes('dining');

    for (const [userIntent, concepts] of Object.entries(semanticMappings)) {
      if (queryLower.includes(userIntent)) {
        // Prevent cross-contamination: don't add food concepts to museum queries and vice versa
        if (hasMuseumIntent && ['food', 'culinary', 'dining', 'restaurant'].includes(userIntent)) {
          console.log(`🚫 SEMANTIC BLOCKING: Skipping food concept "${userIntent}" for museum-focused query`);
          continue;
        }
        if (hasFoodIntent && ['museum', 'art', 'gallery', 'history'].includes(userIntent)) {
          console.log(`🚫 SEMANTIC BLOCKING: Skipping museum concept "${userIntent}" for food-focused query`);
          continue;
        }
        
        expandedQuery += ' ' + concepts.join(' ');
        console.log(`🧠 SEMANTIC MAPPING: "${userIntent}" → [${concepts.join(', ')}]`);
      }
    }

    // MUSEUMS-FIRST DETECTION: Check for museum themes explicitly first
    const museumTheme = this.SEARCH_THEMES.museums_arts;
    let museumScore = 0;
    let museumMatches = 0;

    for (const keyword of museumTheme.keywords) {
      if (queryLower.includes(keyword)) {
        museumMatches++;
        // Give extra weight to primary museum keywords
        if (['museum', 'museums', 'art', 'gallery', 'galleries', 'exhibition', 'history', 'historical'].includes(keyword)) {
          museumScore += museumTheme.priority * 3; // Triple weight for primary museum terms
        } else {
          museumScore += museumTheme.priority * 1.5;
        }
      }
    }

    // If we have strong museum indicators, prioritize museum theme
    if (museumMatches >= 1 || queryLower.includes('museum') || queryLower.includes('history') || queryLower.includes('art')) {
      console.log(`🏛️ MUSEUM-FIRST DETECTION: Strong museum indicators (${museumMatches} matches), prioritizing museum theme`);
      console.log(`🎯 THEME DETECTION: "${museumTheme.name}" selected with prioritized museum score ${museumScore} for query "${query}"`);
      return museumTheme;
    }

    // FOOD-FIRST DETECTION: Check for food themes only if no museums detected
    const foodTheme = this.SEARCH_THEMES.food_tours;
    let foodScore = 0;
    let foodMatches = 0;

    for (const keyword of foodTheme.keywords) {
      if (queryLower.includes(keyword)) {
        foodMatches++;
        // Give extra weight to primary food keywords
        if (['food', 'culinary', 'cuisine', 'food tour', 'food tours', 'dining', 'cooking', 'tasting'].includes(keyword)) {
          foodScore += foodTheme.priority * 3; // Triple weight for primary food terms
        } else {
          foodScore += foodTheme.priority * 1.5;
        }
      }
    }

    // Only prioritize food if we have strong food indicators AND no museum indicators
    if ((foodMatches >= 2 || queryLower.includes('food tour') || queryLower.includes('culinary') || queryLower.includes('cuisine')) && museumMatches === 0) {
      console.log(`🍽️ FOOD-FIRST DETECTION: Strong food indicators (${foodMatches} matches), prioritizing food theme`);
      console.log(`🎯 THEME DETECTION: "${foodTheme.name}" selected with prioritized food score ${foodScore} for query "${query}"`);
      return foodTheme;
    }

    // ENHANCED THEME DETECTION: Prioritize specific themes over generic ones
    for (const theme of Object.values(this.SEARCH_THEMES)) {
      let score = 0;
      let specificMatches = 0;
      let genericMatches = 0;

      // Check for keyword matches with specificity scoring (use expanded query)
      for (const keyword of theme.keywords) {
        if (expandedQuery.includes(keyword)) {
          // Specific keywords get higher weight
          if (this.isSpecificKeyword(keyword)) {
            score += theme.priority * 2; // Double weight for specific terms
            specificMatches++;
          } else {
            score += theme.priority * 0.5; // Lower weight for generic terms
            genericMatches++;
          }
        }
      }

      // PRIORITY BOOST: Give massive boost to themes with specific matches
      if (specificMatches > 0) {
        score += 1000; // Ensure specific themes always win
      }

      // Penalize for exclude keywords
      for (const excludeKeyword of theme.excludeKeywords) {
        if (queryLower.includes(excludeKeyword)) {
          score -= 50;
        }
      }

      // Only consider themes with actual matches
      if (score > 0 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { theme, score };
      }
    }

    if (bestMatch) {
      console.log(`🎯 THEME DETECTION: "${bestMatch.theme.name}" selected with score ${bestMatch.score} for query "${query}"`);
    }

    return bestMatch?.theme || null;
  }

  /**
   * Determine if a keyword is specific (not generic)
   */
  private static isSpecificKeyword(keyword: string): boolean {
    const genericKeywords = [
      'tour', 'tours', 'experience', 'visit', 'explore', 'guided', 'excursion',
      'activity', 'activities', 'sightseeing', 'cultural', 'traditional'
    ];

    return !genericKeywords.includes(keyword.toLowerCase());
  }

  /**
   * Execute thematic search with multiple strategies
   */
  static async executeThematicSearch(
    query: string, 
    destinationId: number, 
    destinationName: string,
    currency: string = 'USD',
    maxResults: number = 10
  ): Promise<ActivityRecommendation[]> {
    console.log(`🎭 THEMATIC SEARCH: "${query}" in ${destinationName} (${destinationId})`);

    const detectedTheme = this.detectTheme(query);
    if (!detectedTheme) {
      console.log('❌ No theme detected, falling back to generic search');
      return [];
    }

    console.log(`🎯 THEME DETECTED: ${detectedTheme.name} (priority: ${detectedTheme.priority})`);

    // ENHANCED: Initialize theme with relevant Viator tags
    const enhancedTheme = await this.initializeThemeWithTags(detectedTheme);

    // Execute multiple search strategies in parallel with enhanced theme
    const searchPromises = [
      this.thematicFreetextSearch(enhancedTheme, destinationName, currency),
      this.thematicProductsSearchWithTags(enhancedTheme, destinationId, currency),
      this.thematicExpandedSearch(enhancedTheme, destinationId, currency),
    ];

    try {
      const results = await Promise.allSettled(searchPromises);
      const successfulResults: ThematicSearchResult[] = [];

      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value.products.length > 0) {
          successfulResults.push(result.value);
          console.log(`✅ Thematic Strategy ${index + 1} (${result.value.strategy}): ${result.value.products.length} results`);
        } else {
          console.log(`❌ Thematic Strategy ${index + 1} failed or returned no results`);
        }
      });

      // Combine and rank results
      const combinedProducts = this.combineThematicResults(successfulResults, enhancedTheme);

      // Apply thematic relevance filtering
      const filteredProducts = this.applyThematicFiltering(combinedProducts, enhancedTheme, destinationName);

      console.log(`🎭 THEMATIC SEARCH COMPLETE: ${filteredProducts.length} relevant activities found`);

      return filteredProducts.slice(0, maxResults);

    } catch (error) {
      console.error('❌ Thematic search failed:', error);
      return [];
    }
  }

  /**
   * Strategy 1: Freetext search with thematic terms
   */
  private static async thematicFreetextSearch(
    theme: SearchTheme, 
    destinationName: string, 
    currency: string
  ): Promise<ThematicSearchResult> {
    try {
      // Use the most relevant search term for this theme
      const primarySearchTerm = theme.searchTerms[0];
      const searchQuery = `${primarySearchTerm} ${destinationName}`;

      console.log(`🔍 THEMATIC FREETEXT: Searching for "${searchQuery}"`);

      const response = await viatorService.axiosInstance.post('/search/freetext', {
        searchTerm: searchQuery,
        searchTypes: [{
          searchType: 'PRODUCTS',
          pagination: { start: 1, count: 25 }
        }],
        currency: currency
      });

      console.log(`📊 FREETEXT RESPONSE structure:`, Object.keys(response.data || {}));

      const products = response.data?.products?.products || 
                      response.data?.searchResults?.[0]?.results || 
                      response.data?.products || [];

      console.log(`📊 FREETEXT: Found ${products.length} products`);

      return {
        products,
        strategy: 'thematic_freetext',
        confidence: 90,
        thematicRelevance: 95
      };
    } catch (error) {
      console.error('Thematic freetext search failed:', error);
      const errorDetails = error instanceof Error ? error.message : 'Unknown error';
      const responseData = (error as any)?.response?.data;
      console.error('Error details:', responseData || errorDetails);
      return { products: [], strategy: 'thematic_freetext', confidence: 0, thematicRelevance: 0 };
    }
  }

  /**
   * Strategy 2: Products search with destination filter and Viator Tags
   */
  private static async thematicProductsSearchWithTags(
    theme: SearchTheme, 
    destinationId: number, 
    currency: string
  ): Promise<ThematicSearchResult> {
    try {
      const requestBody: any = {
        filtering: {
          destination: destinationId, // Viator API expects 'destination' not 'destinationId'
          includeAutomaticTranslations: true
        },
        sort: "TRAVELER_RATING",
        order: "DESCENDING",
        pagination: {
          start: 1,
          count: 50
        },
        currency: currency
      };

      // L3/L4 SPECIFIC TAG FILTERING: Use only specific tags for precision  
      if (theme.tagIds && theme.tagIds.length > 0) {
        // Use only top 8 most relevant tags to avoid over-filtering
        const priorityTags = theme.tagIds.slice(0, 8);
        requestBody.filtering.tags = priorityTags;
        console.log(`🎯 OPTIMIZED TAG FILTERING: Using ${priorityTags.length} of ${theme.tagIds.length} available tags (${priorityTags.join(', ')}) to prevent over-filtering`);
      }

      console.log(`📡 THEMATIC API REQUEST:`, JSON.stringify(requestBody, null, 2));

      const response = await viatorService.axiosInstance.post('/products/search', requestBody);

      const products = response.data?.products?.results || response.data?.products || [];
      console.log(`📊 THEMATIC API RESPONSE: ${products.length} products returned`);

      const hasTagFiltering = theme.tagIds && theme.tagIds.length > 0;
      return {
        products,
        strategy: hasTagFiltering ? 'thematic_products_search_with_tags' : 'thematic_products_search',
        confidence: hasTagFiltering ? 95 : 85, // Higher confidence with tag filtering
        thematicRelevance: hasTagFiltering ? 95 : 80 // Much higher relevance with tags
      };
    } catch (error) {
      console.error('Thematic products search with tags failed:', error);
      const errorDetails = error instanceof Error ? error.message : 'Unknown error';
      const responseData = (error as any)?.response?.data;
      console.error('Error details:', responseData || errorDetails);
      return { products: [], strategy: 'thematic_products_search_with_tags', confidence: 0, thematicRelevance: 0 };
    }
  }

  /**
   * Strategy 3: Expanded search with multiple theme terms
   */
  private static async thematicExpandedSearch(
    theme: SearchTheme, 
    destinationId: number, 
    currency: string
  ): Promise<ThematicSearchResult> {
    try {
      // Try multiple search terms for this theme
      const searchTerms = theme.searchTerms.slice(0, 3); // Use top 3 terms
      let allProducts: any[] = [];

      console.log(`🔄 EXPANDED SEARCH: Trying ${searchTerms.length} search terms`);

      for (const searchTerm of searchTerms) {
        try {
          console.log(`🔍 EXPANDED: Searching "${searchTerm}" in destination ${destinationId}`);

          // Use products/search instead of freetext for better destination filtering
          const response = await viatorService.axiosInstance.post('/products/search', {
            searchTerms: [{
              searchTerm: searchTerm,
              match: "FUZZY"
            }],
            filtering: {
              destination: destinationId // Fix: use 'destination' not 'destinationId'
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

          // Small delay between requests
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (termError) {
          const errorMsg = termError instanceof Error ? termError.message : 'unknown error';
          console.log(`❌ Failed search term "${searchTerm}":`, errorMsg);
        }
      }

      // Remove duplicates
      const uniqueProducts = allProducts.filter((product, index, self) => 
        index === self.findIndex(p => p.productCode === product.productCode)
      );

      console.log(`🔄 EXPANDED TOTAL: ${allProducts.length} → ${uniqueProducts.length} unique products`);

      return {
        products: uniqueProducts,
        strategy: 'thematic_expanded_search',
        confidence: 75,
        thematicRelevance: 85
      };
    } catch (error) {
      console.error('Thematic expanded search failed:', error);
      const errorDetails = error instanceof Error ? error.message : 'Unknown error';
      const responseData = (error as any)?.response?.data;
      console.error('Error details:', responseData || errorDetails);
      return { products: [], strategy: 'thematic_expanded_search', confidence: 0, thematicRelevance: 0 };
    }
  }

  /**
   * Combine results from multiple thematic strategies
   */
  private static combineThematicResults(
    results: ThematicSearchResult[], 
    theme: SearchTheme
  ): any[] {
    const allProducts: any[] = [];
    const productCodes = new Set();

    for (const result of results) {
      for (const product of result.products) {
        if (!productCodes.has(product.productCode)) {
          productCodes.add(product.productCode);
          // Add thematic scoring metadata
          product._thematicScore = result.thematicRelevance;
          product._strategy = result.strategy;
          allProducts.push(product);
        }
      }
    }

    console.log(`🔄 Combined thematic results: ${allProducts.length} unique products from ${results.length} strategies`);
    return allProducts;
  }

  /**
   * Apply thematic filtering to ensure relevance
   */
  private static applyThematicFiltering(
    products: any[], 
    theme: SearchTheme, 
    destinationName: string
  ): any[] {
    console.log(`🎯 THEMATIC FILTERING: Processing ${products.length} products for theme "${theme.name}"`);

    const filteredProducts = products.filter(product => {
      const title = (product.title || '').toLowerCase();
      const description = (product.shortDescription || product.description || '').toLowerCase();
      const content = `${title} ${description}`;

      // ENHANCED LOCATION VALIDATION: Ensure activities match the destination
      const targetLocation = destinationName.toLowerCase();
      
      // Define geographic exclusions for major regions
      const locationExclusions = {
        banff: ['hawaii', 'maui', 'kona', 'honolulu', 'oahu', 'big island', 'pacific', 'luau', 'aloha', 'tokyo', 'japan', 'paris', 'france', 'europe'],
        hawaii: ['banff', 'canada', 'alberta', 'rockies', 'calgary', 'tokyo', 'japan', 'paris', 'france', 'europe', 'lisbon', 'portugal'],
        tokyo: ['hawaii', 'banff', 'canada', 'alberta', 'paris', 'france', 'europe', 'lisbon', 'portugal'],
        paris: ['hawaii', 'banff', 'canada', 'alberta', 'tokyo', 'japan', 'lisbon', 'portugal'],
        lisbon: ['hawaii', 'maui', 'kona', 'honolulu', 'oahu', 'big island', 'pacific', 'luau', 'aloha', 'tokyo', 'japan', 'banff', 'canada', 'alberta'],
        portugal: ['hawaii', 'maui', 'kona', 'honolulu', 'oahu', 'big island', 'pacific', 'luau', 'aloha', 'tokyo', 'japan', 'banff', 'canada', 'alberta']
      };

      // Check for geographic mismatches
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
      
      // Positive location validation for specific destinations
      if (targetLocation.includes('banff')) {
        const banffRelevantTerms = ['banff', 'canada', 'alberta', 'rockies', 'mountain', 'calgary', 'jasper', 'lake louise', 'canadian'];
        const hasBanffContent = banffRelevantTerms.some(term => content.includes(term));
        
        if (!hasBanffContent) {
          console.log(`❌ LOCATION VALIDATION FAILED: "${product.title}" has no Banff/Canada relevance`);
          return false; // Now exclude completely for stricter filtering
        }
      }

      if (targetLocation.includes('hawaii')) {
        const hawaiiRelevantTerms = ['hawaii', 'maui', 'oahu', 'kona', 'honolulu', 'big island', 'kauai', 'hawaiian', 'pacific'];
        const hasHawaiiContent = hawaiiRelevantTerms.some(term => content.includes(term));
        
        if (!hasHawaiiContent) {
          console.log(`❌ LOCATION VALIDATION FAILED: "${product.title}" has no Hawaii relevance`);
          return false;
        }
      }

      if (targetLocation.includes('lisbon') || targetLocation.includes('portugal')) {
        const lisbonRelevantTerms = ['lisbon', 'portugal', 'portuguese', 'porto', 'sintra', 'cascais', 'iberian', 'europe', 'european'];
        const hasLisbonContent = lisbonRelevantTerms.some(term => content.includes(term));
        
        if (!hasLisbonContent) {
          console.log(`❌ LOCATION VALIDATION FAILED: "${product.title}" has no Lisbon/Portugal relevance`);
          return false;
        }
      }

      // THEME-SPECIFIC STRICT FILTERING - Apply sophisticated filtering to all themes
      if (!this.passesThemeSpecificFiltering(product, theme, content)) {
        return false;
      }

      // Check for theme keyword matches
      let thematicScore = 0;
      for (const keyword of theme.keywords) {
        if (containsWord(content, keyword)) {
          thematicScore += 10;
        }
      }

      // Penalize for exclude keywords
      for (const excludeKeyword of theme.excludeKeywords) {
        if (containsWord(content, excludeKeyword)) {
          thematicScore -= 20; // Increased penalty for better filtering
        }
      }

      // Bonus for destination relevance
      if (containsWord(content, destinationName.toLowerCase())) {
        thematicScore += 5;
      }

      product._finalThematicScore = thematicScore;

      // Named themes (everything except the generic fallback) already ran a
      // dedicated, theme-specific pass/fail check above via
      // passesThemeSpecificFiltering — e.g. filterFoodTours() already decided
      // this is a genuine food tour. Re-vetoing that verdict here based on a
      // generic keyword score (which penalizes incidental mentions like a
      // food tour's description name-dropping a "monument" it walks past)
      // double-guesses a more precise decision that was already made. Keep
      // the score for sort ordering, but only use it as a hard filter for
      // themes that fell through to the generic filter.
      if (THEMES_WITH_DEDICATED_FILTERING.has(theme.name)) {
        return true;
      }

      const threshold = -10;
      return thematicScore > threshold;
    });

    // Sort by thematic relevance
    filteredProducts.sort((a, b) => (b._finalThematicScore || 0) - (a._finalThematicScore || 0));

    // ENHANCED: Apply venue diversity filtering
    const diverseProducts = this.applyVenueDiversityFiltering(filteredProducts, theme);

    console.log(`🎯 THEMATIC FILTERING RESULT: ${products.length} → ${diverseProducts.length} products`);

    return diverseProducts.map(product => this.transformToActivityRecommendation(product));
  }

  /**
   * Apply venue diversity filtering to ensure varied recommendations
   */
  private static applyVenueDiversityFiltering(products: any[], theme: SearchTheme): any[] {
    // STEP 1: Apply strict thematic filtering now (after getting many results)
    const strictlyFilteredProducts = this.applyStrictThematicFilter(products, theme);

    const venueMap = new Map<string, any[]>();

    // Group products by venue/attraction
    strictlyFilteredProducts.forEach(product => {
      const venue = this.extractVenueName(product.title);
      if (!venueMap.has(venue)) {
        venueMap.set(venue, []);
      }
      venueMap.get(venue)!.push(product);
    });

    console.log(`🏛️ VENUE DIVERSITY: Found ${venueMap.size} different venues from ${strictlyFilteredProducts.length} thematically relevant products`);

    // Determine venue diversity strategy based on theme characteristics
    const requiresStrictDiversity = this.requiresStrictVenueDiversity(theme);
    const maxActivitiesPerVenue = this.getMaxActivitiesPerVenue(theme);

    if (requiresStrictDiversity) {
      return this.selectDiverseVenues(venueMap, true, theme.name);
    }

    // For other themes, apply theme-specific venue limits
    const diverseResults: any[] = [];
    for (const [venue, activities] of Array.from(venueMap.entries())) {
      // Sort by thematic score and take top N per venue based on theme
      const sortedActivities = activities.sort((a: any, b: any) => 
        (b._finalThematicScore || 0) - (a._finalThematicScore || 0)
      );
      diverseResults.push(...sortedActivities.slice(0, maxActivitiesPerVenue));

      if (diverseResults.length >= 12) break;
    }

    return diverseResults;
  }

  /**
   * Determine if theme requires strict venue diversity (one activity per venue)
   */
  private static requiresStrictVenueDiversity(theme: SearchTheme): boolean {
    const strictDiversityThemes = [
      'Museums & Arts',
      'Royal History & Knights', 
      'Cultural Heritage'
    ];

    return strictDiversityThemes.includes(theme.name) ||
           theme.keywords.some(k => ['museum', 'gallery', 'art', 'palace', 'castle', 'monument'].includes(k));
  }

  /**
   * Get maximum activities per venue based on theme type
   */
  private static getMaxActivitiesPerVenue(theme: SearchTheme): number {
    switch (theme.name) {
      case 'Museums & Arts':
      case 'Royal History & Knights':
      case 'Cultural Heritage':
        return 1; // Strict diversity for cultural/historical themes

      case 'Fishing Activities':
      case 'Water Activities':
        return 3; // More variety allowed for activity-based themes

      case 'Food & Culinary Tours':
        return 2; // Moderate diversity for experience-based themes

      case 'Ninja & Samurai Experiences':
        return 2; // Moderate diversity for specialized cultural themes

      default:
        return 2; // Default moderate diversity
    }
  }

  /**
   * Theme-specific filtering with sophisticated exclusion rules for all themes
   */
  private static passesThemeSpecificFiltering(product: any, theme: SearchTheme, content: string): boolean {
    const title = (product.title || '').toLowerCase();

    switch (theme.name) {
      case 'Food & Culinary Tours':
        return this.filterFoodTours(content, title);
      
      case 'Museums & Arts':
        return this.filterMuseumsArts(content, title);
      
      case 'Ninja & Samurai Experiences':
        return this.filterNinjaSamurai(content, title);
      
      case 'Fishing Activities':
        return this.filterFishing(content, title);
      
      case 'Royal History & Knights':
        return this.filterRoyalHistory(content, title);
      
      case 'Water Activities':
        return this.filterWaterActivities(content, title);
      
      case 'Cultural Heritage':
        return this.filterCulturalHeritage(content, title);
      
      default:
        return this.filterGenericTheme(content, title, theme); // Apply basic filtering for all themes
    }
  }

  /**
   * Food tours filtering with strict food-focused requirements
   */
  private static filterFoodTours(content: string, title: string): boolean {
    // STRICT EXCLUSIONS: Activities that should never be considered food tours
    const strictExclusions = [
      // Transportation and sightseeing
      'mt fuji', 'mount fuji', 'hakone', 'bullet train', 'shinkansen',
      'transfer only', 'airport transfer', 'private car service', 'chauffeur service',
      'car rental', 'transportation only', 'pickup service only',
      'customizable private tour', 'government-licensed guide', 'tailored to your interests',
      'private driving tour', 'sightseeing bus', 'city tour', 'walking tour',
      // Non-food entertainment
      'sumo wrestling', 'sumo show', 'wrestling', 'martial arts', 'entertainment show',
      'theater', 'performance', 'show', 'museum only', 'temple only', 'shrine visit',
      // Generic activities
      'go-kart', 'karting', 'robot', 'technology', 'anime', 'manga'
    ];

    // PRIMARY FOOD REQUIREMENTS: Must have strong food focus
    const primaryFoodTerms = [
      'food tour', 'culinary tour', 'cooking class', 'baking class', 'food experience', 'culinary experience',
      'food market', 'street food', 'restaurant tour', 'dining experience', 'chef experience',
      'sushi class', 'ramen tour', 'sake tasting', 'wine tasting', 'brewery tour',
      'food tasting', 'culinary class', 'kitchen', 'cooking', 'baking', 'local cuisine',
      'dinner cruise', 'lunch cruise', 'gourmet dinner', 'gourmet lunch', '3 course', 'tasting menu',
      'food & wine tour', 'food and wine tour', 'wine & food tour', 'wine and food tour',
      'gastronomy tour', 'foodie tour', 'tapas tour', 'food walking tour'
    ];

    for (const exclusion of strictExclusions) {
      if (containsWord(content, exclusion)) {
        // Exception: Allow ONLY if explicitly labeled as a food tour/cooking class.
        // Real listings often phrase this as "food & wine tour" / "food and wine
        // tour" rather than the literal phrase "food tour", so reuse the broader
        // primaryFoodTerms list here instead of a narrower duplicate.
        const hasExplicitFoodActivity = primaryFoodTerms.some(term => containsWord(content, term));
        if (!hasExplicitFoodActivity) {
          console.log(`❌ FOOD FILTER: Excluding "${title}" (contains: ${exclusion})`);
          return false;
        }
      }
    }

    const hasPrimaryFoodFocus = primaryFoodTerms.some(term => containsWord(content, term));

    if (hasPrimaryFoodFocus) {
      console.log(`✅ FOOD FILTER: Accepting "${title}" (primary food activity detected)`);
      return true;
    }

    // SECONDARY CHECK: Allow with lower threshold for food indicators
    const secondaryFoodTerms = ['restaurant', 'dining', 'sushi', 'ramen', 'meal', 'dishes', 'chef', 'traditional food', 'bistro', 'cafe', 'cuisine', 'wine', 'tasting'];
    const secondaryMatches = secondaryFoodTerms.filter(term => containsWord(content, term));

    // More specific entertainment exclusions - don't exclude dinner shows/cruises
    const isEntertainment = ['wrestling', 'theater', 'concert', 'comedy show', 'cabaret show'].some(term => containsWord(content, term));
    
    // Accept if single strong food indicator or multiple weak ones
    if ((secondaryMatches.length >= 1 && !isEntertainment) || secondaryMatches.length >= 2) {
      console.log(`✅ FOOD FILTER: Accepting "${title}" (food indicators: ${secondaryMatches.join(', ')})`);
      return true;
    }
    
    if (isEntertainment) {
      console.log(`❌ FOOD FILTER: Excluding "${title}" (entertainment activity with incidental food)`);
      return false;
    }

    console.log(`❌ FOOD FILTER: Excluding "${title}" (insufficient food focus - only ${secondaryMatches.length} indicators)`);
    return false;
  }

  /**
   * Museums & Arts filtering with strict must-include/must-exclude patterns
   */
  private static filterMuseumsArts(content: string, title: string): boolean {
    // STRICT MUST-EXCLUDE: Activities that should never be considered museums
    const mustExclusions = [
      'go-kart', 'go kart', 'gokart', 'kart', 'mario kart', 'drift', 'racing',
      'sumo', 'wrestling', 'entertainment show', 'hotpot', 'hot pot',
      'theme park', 'amusement park', 'arcade', 'video game', 'gaming',
      'driving tour', 'car rental', 'scooter rental', 'bike rental',
      // NEW: Transport and adventure exclusions per architect feedback
      'airport', 'transfer', 'shuttle', 'taxi', 'driver', 'bus pass', 
      'paragliding', 'skydiving', 'helicopter', 'rafting', 'bungee'
    ];
    
    for (const exclusion of mustExclusions) {
      if (content.toLowerCase().includes(exclusion.toLowerCase()) || title.toLowerCase().includes(exclusion.toLowerCase())) {
        console.log(`❌ MUSEUMS FILTER: Excluding "${title}" (must-exclude: ${exclusion})`);
        return false;
      }
    }

    // FOCUSED MUSEUM INDICATORS: Accept museum/gallery/cultural content only
    const museumIndicators = [
      'museum', 'gallery', 'exhibit', 'exhibition', 'art museum', 'history museum', 
      'ticket', 'admission', 'entry', 'skip the line', 'skip-the-line',
      'guided tour', 'audio guide', 'cultural tour', 'heritage', 'cultural', 'historic',
      'palace', 'castle', 'cathedral', 'temple', 'shrine', 'monument', 'landmark',
      'art', 'culture', 'historical', 'unesco'
    ];
    
    const hasMuseumIndicator = museumIndicators.some(indicator => 
      content.toLowerCase().includes(indicator.toLowerCase()) || 
      title.toLowerCase().includes(indicator.toLowerCase())
    );
    
    // RE-ENABLED: Reject if no museum indicators found
    if (!hasMuseumIndicator) {
      console.log(`❌ MUSEUMS FILTER: Excluding "${title}" (no museum/cultural keywords found)`);
      return false;
    }

    // Additional exclusions for non-museum content
    const secondaryExclusions = [
      'dinner cruise', 'lunch cruise', 'food tour', 'cooking class', 'wine tasting',
      'mt fuji', 'mount fuji', 'hakone', 'day trip', 'bullet train', 'shinkansen',
      'national park', 'hiking', 'volcano', 'scenic tour', 'sightseeing tour'
    ];
    for (const exclusion of secondaryExclusions) {
      if (content.includes(exclusion) || title.includes(exclusion)) {
        console.log(`❌ MUSEUMS FILTER: Excluding "${title}" (non-museum activity: ${exclusion})`);
        return false;
      }
    }

    // War/military content only allowed if explicitly museum/art focused
    const militaryTerms = ['d-day', 'normandy', 'war', 'battlefield', 'cemetery', 'military'];
    const hasMilitary = militaryTerms.some(term => content.includes(term));
    if (hasMilitary) {
      const hasArtCulture = ['museum', 'art', 'gallery', 'cultural center', 'heritage'].some(keyword => content.includes(keyword));
      if (!hasArtCulture) {
        console.log(`❌ MUSEUMS FILTER: Excluding "${title}" (military content without museum focus)`);
        return false;
      }
    }
    
    console.log(`✅ MUSEUMS FILTER: Accepting "${title}" (found required museum indicators)`);  
    return true;
  }

  /**
   * Ninja & Samurai filtering with cultural authenticity requirements
   */
  private static filterNinjaSamurai(content: string, title: string): boolean {
    // Exclude modern entertainment and non-cultural activities
    const modernExclusions = ['theme park', 'amusement', 'robot', 'technology', 'shopping', 'mall', 'karaoke', 'anime', 'manga'];
    for (const exclusion of modernExclusions) {
      if (content.includes(exclusion)) {
        const hasCulturalContext = ['temple', 'shrine', 'traditional', 'historical', 'museum', 'heritage'].some(keyword => content.includes(keyword));
        if (!hasCulturalContext) {
          console.log(`❌ NINJA/SAMURAI FILTER: Excluding "${title}" (modern content: ${exclusion}, no cultural context)`);
          return false;
        }
      }
    }

    // Exclude pure transportation
    const transportExclusions = ['transfer', 'airport', 'train', 'bus tour', 'transportation only'];
    for (const exclusion of transportExclusions) {
      if (content.includes(exclusion)) {
        console.log(`❌ NINJA/SAMURAI FILTER: Excluding "${title}" (transportation: ${exclusion})`);
        return false;
      }
    }

    // Require cultural/historical relevance
    const requiredKeywords = ['ninja', 'samurai', 'temple', 'shrine', 'martial arts', 'traditional', 'cultural', 'historical', 'heritage', 'museum', 'castle'];
    const hasRelevantKeyword = requiredKeywords.some(keyword => content.includes(keyword));
    
    if (!hasRelevantKeyword) {
      console.log(`❌ NINJA/SAMURAI FILTER: Excluding "${title}" (no cultural/historical keywords)`);
      return false;
    }

    return true;
  }

  /**
   * Fishing activities filtering with authenticity requirements
   */
  private static filterFishing(content: string, title: string): boolean {
    // Exclude non-fishing water activities
    const nonFishingExclusions = ['swimming', 'beach club', 'resort', 'hotel', 'spa', 'sunbathing', 'parasailing', 'jet ski'];
    for (const exclusion of nonFishingExclusions) {
      if (content.includes(exclusion)) {
        const hasFishingContext = ['fishing', 'charter', 'angling', 'catch', 'rod', 'reel'].some(keyword => content.includes(keyword));
        if (!hasFishingContext) {
          console.log(`❌ FISHING FILTER: Excluding "${title}" (non-fishing water activity: ${exclusion})`);
          return false;
        }
      }
    }

    // Exclude pure sightseeing
    const sightseeingExclusions = ['city tour', 'museum visit', 'shopping', 'cultural tour', 'walking tour'];
    for (const exclusion of sightseeingExclusions) {
      if (content.includes(exclusion)) {
        console.log(`❌ FISHING FILTER: Excluding "${title}" (sightseeing: ${exclusion})`);
        return false;
      }
    }

    // Require fishing relevance
    const requiredKeywords = ['fishing', 'charter', 'angling', 'deep sea', 'sport fish', 'catch', 'rod', 'reel', 'bait', 'tackle'];
    const hasRelevantKeyword = requiredKeywords.some(keyword => content.includes(keyword));
    
    if (!hasRelevantKeyword) {
      console.log(`❌ FISHING FILTER: Excluding "${title}" (no fishing keywords)`);
      return false;
    }

    return true;
  }

  /**
   * Royal History & Knights filtering with historical authenticity
   */
  private static filterRoyalHistory(content: string, title: string): boolean {
    // Exclude modern attractions
    const modernExclusions = ['theme park', 'amusement', 'shopping', 'mall', 'restaurant tour', 'food experience'];
    for (const exclusion of modernExclusions) {
      if (content.includes(exclusion)) {
        console.log(`❌ ROYAL HISTORY FILTER: Excluding "${title}" (modern attraction: ${exclusion})`);
        return false;
      }
    }

    // Exclude pure nature activities
    const natureExclusions = ['hiking', 'nature walk', 'wildlife', 'beach', 'swimming', 'diving'];
    for (const exclusion of natureExclusions) {
      if (content.includes(exclusion)) {
        const hasHistoricalContext = ['castle', 'palace', 'royal', 'historical', 'heritage'].some(keyword => content.includes(keyword));
        if (!hasHistoricalContext) {
          console.log(`❌ ROYAL HISTORY FILTER: Excluding "${title}" (nature activity: ${exclusion}, no historical context)`);
          return false;
        }
      }
    }

    // Require royal/historical relevance
    const requiredKeywords = ['royal', 'castle', 'palace', 'king', 'queen', 'knight', 'medieval', 'crown', 'throne', 'monarchy', 'historical', 'heritage'];
    const hasRelevantKeyword = requiredKeywords.some(keyword => content.includes(keyword));
    
    if (!hasRelevantKeyword) {
      console.log(`❌ ROYAL HISTORY FILTER: Excluding "${title}" (no royal/historical keywords)`);
      return false;
    }

    return true;
  }

  /**
   * Water activities filtering with aquatic focus requirements
   */
  private static filterWaterActivities(content: string, title: string): boolean {
    // Exclude land-based activities
    const landExclusions = ['museum', 'shopping', 'city tour', 'walking tour', 'cultural tour', 'food tour', 'hiking', 'mountain'];
    for (const exclusion of landExclusions) {
      if (content.includes(exclusion)) {
        const hasWaterContext = ['boat', 'cruise', 'sailing', 'diving', 'snorkeling', 'water', 'ocean', 'sea'].some(keyword => content.includes(keyword));
        if (!hasWaterContext) {
          console.log(`❌ WATER ACTIVITIES FILTER: Excluding "${title}" (land-based: ${exclusion}, no water context)`);
          return false;
        }
      }
    }

    // Require water activity relevance
    const requiredKeywords = ['water', 'ocean', 'sea', 'boat', 'cruise', 'sailing', 'diving', 'snorkeling', 'swimming', 'marine', 'aquatic', 'kayak', 'catamaran'];
    const hasRelevantKeyword = requiredKeywords.some(keyword => content.includes(keyword));
    
    if (!hasRelevantKeyword) {
      console.log(`❌ WATER ACTIVITIES FILTER: Excluding "${title}" (no water activity keywords)`);
      return false;
    }

    return true;
  }

  /**
   * Cultural Heritage filtering with authentic cultural focus
   */
  private static filterCulturalHeritage(content: string, title: string): boolean {
    // Exclude commercial/modern activities
    const commercialExclusions = ['shopping', 'mall', 'restaurant', 'food court', 'theme park', 'amusement', 'nightlife', 'bar'];
    for (const exclusion of commercialExclusions) {
      if (content.includes(exclusion)) {
        const hasCulturalContext = ['temple', 'shrine', 'monument', 'heritage', 'historical', 'cultural', 'traditional'].some(keyword => content.includes(keyword));
        if (!hasCulturalContext) {
          console.log(`❌ CULTURAL HERITAGE FILTER: Excluding "${title}" (commercial: ${exclusion}, no cultural context)`);
          return false;
        }
      }
    }

    // Exclude pure adventure/sports
    const adventureExclusions = ['extreme sports', 'bungee', 'zip line', 'rock climbing', 'adrenaline'];
    for (const exclusion of adventureExclusions) {
      if (content.includes(exclusion)) {
        console.log(`❌ CULTURAL HERITAGE FILTER: Excluding "${title}" (adventure sport: ${exclusion})`);
        return false;
      }
    }

    // Require cultural/heritage relevance
    const requiredKeywords = ['culture', 'heritage', 'tradition', 'history', 'temple', 'shrine', 'monument', 'historical', 'archaeological', 'cultural center', 'traditional'];
    const hasRelevantKeyword = requiredKeywords.some(keyword => content.includes(keyword));
    
    if (!hasRelevantKeyword) {
      console.log(`❌ CULTURAL HERITAGE FILTER: Excluding "${title}" (no cultural/heritage keywords)`);
      return false;
    }

    return true;
  }

  /**
   * Generic filtering for all themes to exclude clearly irrelevant activities
   */
  private static filterGenericTheme(content: string, title: string, theme: SearchTheme): boolean {
    // Universal exclusions for all themes
    const universalExclusions = [
      'airport transfer', 'transportation only', 'car rental', 'chauffeur service',
      'wifi service', 'parking', 'accommodation booking', 'hotel reservation'
    ];

    for (const exclusion of universalExclusions) {
      if (content.includes(exclusion)) {
        console.log(`❌ GENERIC FILTER: Excluding "${title}" (universal exclusion: ${exclusion})`);
        return false;
      }
    }

    // Check for theme relevance using keywords
    const hasThemeKeywords = theme.keywords.some(keyword => content.includes(keyword.toLowerCase()));
    
    if (!hasThemeKeywords) {
      console.log(`❌ GENERIC FILTER: Excluding "${title}" (no theme keywords found)`);
      return false;
    }

    return true;
  }

  /**
   * Apply strict thematic filtering after initial collection
   */
  private static applyStrictThematicFilter(products: any[], theme: SearchTheme): any[] {
    return products.filter(product => {
      const title = (product.title || '').toLowerCase();
      const description = (product.shortDescription || product.description || '').toLowerCase();
      const content = `${title} ${description}`;

      // Apply comprehensive theme-specific filtering
      return this.passesThemeSpecificFiltering(product, theme, content);
    });
  }

  /**
   * Extract venue name for grouping activities
   */
  private static extractVenueName(title: string): string {
    const titleLower = title.toLowerCase();

    // Venue patterns for museums and attractions
    const venuePatterns = [
      // Major Paris Attractions
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
    const words = title.split(' ').slice(0, 3).join(' ').toLowerCase();
    return words;
  }

  /**
   * Select diverse venues with theme-specific prioritization
   */
  private static selectDiverseVenues(venueMap: Map<string, any[]>, requiresStrictDiversity: boolean, themeName?: string): any[] {
    const diverseResults: any[] = [];
    const selectedVenues = new Set<string>();

    // Theme-specific priority venues
    const priorityVenues = this.getPriorityVenuesForTheme(themeName || '');

    // First pass: Select one activity from each priority venue
    for (const priorityVenue of priorityVenues) {
      for (const [venue, activities] of Array.from(venueMap.entries())) {
        if (venue.includes(priorityVenue) && !selectedVenues.has(venue)) {
          // Select the highest-scored activity from this venue
          const bestActivity = activities.sort((a: any, b: any) => 
            (b._finalThematicScore || 0) - (a._finalThematicScore || 0)
          )[0];
          diverseResults.push(bestActivity);
          selectedVenues.add(venue);
          console.log(`🎯 Priority venue selected: ${venue} → "${bestActivity.title}"`);
          break;
        }
      }

      if (diverseResults.length >= 10) break;
    }

    // Second pass: Fill remaining slots with other venues
    for (const [venue, activities] of Array.from(venueMap.entries())) {
      if (!selectedVenues.has(venue)) {
        const maxActivitiesPerVenue = requiresStrictDiversity ? 1 : 2;
        const sortedActivities = activities.sort((a: any, b: any) => 
          (b._finalThematicScore || 0) - (a._finalThematicScore || 0)
        );
        diverseResults.push(...sortedActivities.slice(0, maxActivitiesPerVenue));
        selectedVenues.add(venue);

        if (diverseResults.length >= 12) break;
      }
    }

    console.log(`🏛️ VENUE SELECTION: ${selectedVenues.size} venues selected: [${Array.from(selectedVenues).join(', ')}]`);
    return diverseResults.slice(0, 12);
  }

  /**
   * Get priority venues based on theme type
   */
  private static getPriorityVenuesForTheme(themeName: string): string[] {
    switch (themeName) {
      case 'Museums & Arts':
        return [
          'louvre', 'versailles', 'notre dame', 'arc de triomphe', 'eiffel tower',
          'pompidou', 'musee d\'orsay', 'orsay', 'rodin', 'montmartre', 'sacre coeur',
          'invalides', 'conciergerie', 'sainte chapelle', 'pantheon'
        ];

      case 'Royal History & Knights':
        return [
          'versailles', 'louvre', 'notre dame', 'arc de triomphe', 'invalides',
          'conciergerie', 'sainte chapelle', 'pantheon', 'castle', 'palace'
        ];

      case 'Cultural Heritage':
        return [
          'temple', 'shrine', 'heritage site', 'monument', 'historical landmark',
          'cultural center', 'traditional', 'archaeological'
        ];

      case 'Water Activities':
        return [
          'marina', 'harbor', 'pier', 'waterfront', 'boat tour', 'cruise',
          'diving center', 'water sports'
        ];

      case 'Fishing Activities':
        return [
          'fishing charter', 'marina', 'harbor', 'fishing pier', 'boat rental',
          'deep sea', 'sport fishing'
        ];

      case 'Food & Culinary Tours':
        return [
          'market', 'food hall', 'restaurant district', 'culinary school',
          'local market', 'food tour', 'cooking class'
        ];

      case 'Ninja & Samurai Experiences':
        return [
          'temple', 'shrine', 'castle', 'historical district', 'cultural center',
          'traditional village', 'museum', 'heritage site'
        ];

      default:
        return [];
    }
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
    // Try different price sources from Viator API
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