
/**
 * CSV-Based Viator Tag Management System
 * Uses the comprehensive Viator Tag Taxonomy CSV for precise tag matching
 */

import fs from 'fs';
import path from 'path';

export interface TaxonomyTag {
  tagId: number;
  tagName: string;
  level: 'L1' | 'L2' | 'L3' | 'L4';
  parentId?: number;
  parentName?: string;
  category: string;
  subcategory?: string;
  fullPath: string[];
  searchTerms: string[];
}

export interface TagSearchResult {
  matchedTags: TaxonomyTag[];
  tagIds: number[];
  confidence: number;
  categoryBreakdown: { [category: string]: number };
}

class CSVTagManager {
  private tags: Map<number, TaxonomyTag> = new Map();
  private tagsByName: Map<string, TaxonomyTag[]> = new Map();
  private tagsByCategory: Map<string, TaxonomyTag[]> = new Map();
  private searchIndex: Map<string, TaxonomyTag[]> = new Map();
  private initialized = false;

  // Enhanced category mappings for better intent detection
  private readonly CATEGORY_INTENT_MAP = {
    'food_wine': [
      'Food & Drink', 'Food Tours', 'Food & Drink Classes', 'Desserts & Sweets', 
      'Coffee & Tea', 'Wine, Beer & Spirits', 'Dining Experiences', 'Restaurants',
      'Cooking Classes', 'Wine Tastings', 'Brewery Tours', 'Culinary Tours'
    ],
    'outdoor_adventure': [
      'Outdoor Activities', 'Extreme Sports', 'Winter Sports', 'Nature and Wildlife Tours',
      'Motor Sports', 'Active & Outdoor Classes', 'Water Sports', 'Hiking', 'Adventure Tours'
    ],
    'cultural_arts': [
      'Art & Culture', 'Shows & Performances', 'Arts & Design', 'Museums',
      'Cultural Tours', 'Historical Tours', 'Art Galleries', 'Theater Shows'
    ],
    'tours_sightseeing': [
      'Tours, Sightseeing & Cruises', 'Sightseeing Tours', 'City Tours', 
      'Boat Tours', 'Air Tours', 'Walking Tours', 'Private Sightseeing Tours'
    ],
    'attractions_entertainment': [
      'Tickets & Passes', 'Attractions & Museums', 'Amusement Parks', 'Theme Parks',
      'Shows', 'Entertainment', 'Water Parks', 'Zoos'
    ]
  };

  // Enhanced semantic keyword expansion with hierarchical awareness
  private readonly SEMANTIC_EXPANSIONS: { [key: string]: string[] } = {
    // Food & Culinary - Enhanced with hierarchical awareness
    'food': ['culinary', 'cuisine', 'gastronomy', 'dining', 'restaurant', 'cooking', 'chef', 'market', 'tasting', 'foodie', 'gourmet'],
    'cooking': ['culinary class', 'chef experience', 'kitchen', 'recipe', 'ingredients', 'preparation', 'baking'],
    'wine': ['vineyard', 'winery', 'sommelier', 'cellar', 'viticulture', 'vintage', 'grape', 'tasting', 'pairing'],
    'beer': ['brewery', 'brewing', 'craft beer', 'pub', 'ale', 'lager', 'hops', 'microbrewery'],
    
    // Museums & Arts - New comprehensive mappings
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
    'walking': ['walking tour', 'pedestrian', 'on foot', 'stroll', 'guided walk', 'city walk']
  };

  constructor() {
    this.initializeFromCSV();
  }

  /**
   * Initialize tag database from CSV file
   */
  private async initializeFromCSV(): Promise<void> {
    try {
      console.log('🏷️ Initializing CSV-based tag manager...');
      
      const csvPath = path.join(process.cwd(), 'attached_assets', 'Viator Tag Taxonomy Tree_1755536808893.csv');
      
      if (!fs.existsSync(csvPath)) {
        throw new Error(`CSV file not found at ${csvPath}`);
      }

      const csvContent = fs.readFileSync(csvPath, 'utf-8');
      await this.parseCSVContent(csvContent);
      
      console.log(`✅ CSV tag manager initialized with ${this.tags.size} tags`);
      this.initialized = true;
    } catch (error) {
      console.error('❌ Failed to initialize CSV tag manager:', error);
      throw error;
    }
  }

  /**
   * Parse CSV content and build tag database
   */
  private async parseCSVContent(csvContent: string): Promise<void> {
    const lines = csvContent.split('\n').filter(line => line.trim());
    
    // Skip header row
    const dataLines = lines.slice(1);
    
    for (const line of dataLines) {
      const columns = this.parseCSVLine(line);
      
      if (columns.length < 6) continue;
      
      const [l1Id, l1Name, l2Id, l2Name, l3Id, l3Name, l4Id, l4Name] = columns;
      
      // Process each level that has data
      this.processTagLevel('L1', parseInt(l1Id), l1Name, null, null, [l1Name]);
      
      if (l2Id && l2Name) {
        this.processTagLevel('L2', parseInt(l2Id), l2Name, parseInt(l1Id), l1Name, [l1Name, l2Name]);
      }
      
      if (l3Id && l3Name) {
        this.processTagLevel('L3', parseInt(l3Id), l3Name, parseInt(l2Id), l2Name, [l1Name, l2Name, l3Name]);
      }
      
      if (l4Id && l4Name) {
        this.processTagLevel('L4', parseInt(l4Id), l4Name, parseInt(l3Id), l3Name, [l1Name, l2Name, l3Name, l4Name]);
      }
    }
    
    console.log(`📊 Processed taxonomy: ${this.tags.size} total tags`);
    this.buildSearchIndices();
  }

  /**
   * Parse a CSV line handling quoted values
   */
  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    result.push(current.trim());
    return result;
  }

  /**
   * Process a tag at a specific level
   */
  private processTagLevel(
    level: 'L1' | 'L2' | 'L3' | 'L4',
    tagId: number,
    tagName: string,
    parentId: number | null,
    parentName: string | null,
    fullPath: string[]
  ): void {
    if (!tagId || !tagName || this.tags.has(tagId)) return;
    
    // Generate search terms
    const searchTerms = this.generateSearchTerms(tagName, fullPath);
    
    const tag: TaxonomyTag = {
      tagId,
      tagName,
      level,
      parentId: parentId || undefined,
      parentName: parentName || undefined,
      category: fullPath[0] || 'Unknown',
      subcategory: fullPath[1] || undefined,
      fullPath,
      searchTerms
    };
    
    this.tags.set(tagId, tag);
    
    // Index by category
    const category = tag.category;
    if (!this.tagsByCategory.has(category)) {
      this.tagsByCategory.set(category, []);
    }
    this.tagsByCategory.get(category)!.push(tag);
  }

  /**
   * Generate search terms for a tag
   */
  private generateSearchTerms(tagName: string, fullPath: string[]): string[] {
    const terms = new Set<string>();
    
    // Add the tag name itself
    terms.add(tagName.toLowerCase());
    
    // Add variations without common words
    const cleanName = tagName.replace(/\b(tours?|tickets?|classes?|shows?)\b/gi, '').trim();
    if (cleanName && cleanName !== tagName) {
      terms.add(cleanName.toLowerCase());
    }
    
    // Add words from the tag name
    const words = tagName.toLowerCase().split(/[\s&\-,]+/).filter(word => 
      word.length > 2 && !['and', 'the', 'for', 'with', 'tours', 'tour', 'tickets', 'ticket'].includes(word)
    );
    words.forEach(word => terms.add(word));
    
    // Add semantic expansions
    words.forEach(word => {
      const expansions = this.SEMANTIC_EXPANSIONS[word];
      if (expansions) {
        expansions.forEach(expansion => terms.add(expansion));
      }
    });
    
    return Array.from(terms);
  }

  /**
   * Build search indices for fast lookups
   */
  private buildSearchIndices(): void {
    console.log('🔍 Building search indices...');
    
    for (const tag of Array.from(this.tags.values())) {
      // Index by tag name
      const nameKey = tag.tagName.toLowerCase();
      if (!this.tagsByName.has(nameKey)) {
        this.tagsByName.set(nameKey, []);
      }
      this.tagsByName.get(nameKey)!.push(tag);
      
      // Index by search terms
      for (const term of tag.searchTerms) {
        if (!this.searchIndex.has(term)) {
          this.searchIndex.set(term, []);
        }
        this.searchIndex.get(term)!.push(tag);
      }
    }
    
    console.log(`🗂️ Built search indices: ${this.tagsByName.size} name entries, ${this.searchIndex.size} search terms`);
  }

  /**
   * Find matching tags based on user interests
   */
  async findMatchingTags(interests: string): Promise<TagSearchResult> {
    if (!this.initialized) {
      await this.initializeFromCSV();
    }
    
    console.log(`🔍 CSV tag search for: "${interests}"`);
    
    const searchTerms = this.parseInterests(interests);
    const matches = new Map<number, { tag: TaxonomyTag; score: number }>();
    
    // Primary matching: exact term matches
    for (const term of searchTerms) {
      const exactMatches = this.searchIndex.get(term) || [];
      for (const tag of exactMatches) {
        const existing = matches.get(tag.tagId);
        const score = this.calculateTagScore(tag, term, searchTerms);
        if (!existing || score > existing.score) {
          matches.set(tag.tagId, { tag, score });
        }
      }
    }
    
    // Secondary matching: partial matches
    if (matches.size < 5) {
      for (const term of searchTerms) {
        for (const [indexTerm, tags] of Array.from(this.searchIndex.entries())) {
          if (indexTerm.includes(term) || term.includes(indexTerm)) {
            for (const tag of tags) {
              if (!matches.has(tag.tagId)) {
                const score = this.calculateTagScore(tag, term, searchTerms) * 0.7; // Reduced score for partial matches
                matches.set(tag.tagId, { tag, score });
              }
            }
          }
        }
      }
    }
    
    // Sort by score, prioritize L3/L4 tags, and limit results
    const sortedMatches = Array.from(matches.values())
      .filter(m => m.tag.level === 'L3' || m.tag.level === 'L4') // L3/L4 only
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);
    
    // If we have too few L3/L4 results, add some L2 as backup
    if (sortedMatches.length < 5) {
      const l2Backup = Array.from(matches.values())
        .filter(m => m.tag.level === 'L2')
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
      sortedMatches.push(...l2Backup);
    }
    
    const matchedTags = sortedMatches.map(m => m.tag);
    const confidence = this.calculateConfidence(matchedTags, searchTerms);
    const categoryBreakdown = this.getCategoryBreakdown(matchedTags);
    
    console.log(`✅ CSV matching: ${matchedTags.length} tags, ${confidence.toFixed(1)}% confidence`);
    console.log(`🏷️ Top matches: ${matchedTags.slice(0, 5).map(t => t.tagName).join(', ')}`);
    
    return {
      matchedTags,
      tagIds: matchedTags.map(t => t.tagId),
      confidence,
      categoryBreakdown
    };
  }

  /**
   * Parse user interests into search terms
   */
  private parseInterests(interests: string): string[] {
    const terms = interests
      .toLowerCase()
      .split(/[,;|&+\n\s]+/)
      .map(term => term.trim())
      .filter(term => term.length > 2)
      .map(term => term.replace(/[^\w\s]/g, ''))
      .filter(term => term.length > 0);
    
    // Add semantic expansions
    const expandedTerms = new Set(terms);
    for (const term of terms) {
      for (const [key, expansions] of Object.entries(this.SEMANTIC_EXPANSIONS)) {
        if (term.includes(key)) {
          expansions.forEach((expansion: string) => expandedTerms.add(expansion));
        }
      }
    }
    
    return Array.from(expandedTerms);
  }

  /**
   * ENHANCED: Calculate tag relevance score with hierarchical awareness
   */
  private calculateTagScore(tag: TaxonomyTag, searchTerm: string, allTerms: string[]): number {
    let score = 0;
    
    // 1. EXACT MATCH SCORING (highest priority)
    const tagNameLower = tag.tagName.toLowerCase();
    const searchTermLower = searchTerm.toLowerCase();
    
    if (tagNameLower === searchTermLower) {
      score += 1000; // Perfect match
    } else if (tagNameLower.includes(searchTermLower) || searchTermLower.includes(tagNameLower)) {
      score += 500; // Partial exact match
    }
    
    // 2. SEMANTIC RELEVANCE SCORING
    const semanticScore = this.calculateSemanticRelevance(tag, allTerms);
    score += semanticScore * 300; // Weight semantic relevance highly
    
    // 3. HIERARCHICAL PATH SCORING (leverages L1→L2→L3→L4 structure)
    const pathScore = this.calculateHierarchicalScore(tag, allTerms);
    score += pathScore * 200;
    
    // 4. SEARCH TERMS MATCHING
    const matchingTerms = tag.searchTerms.filter(term => 
      allTerms.some(userTerm => 
        term.includes(userTerm) || 
        userTerm.includes(term) ||
        this.areSemanticallySimilar(term, userTerm)
      )
    ).length;
    score += matchingTerms * 50;
    
    // 5. CATEGORY INTENT ALIGNMENT
    const categoryBonus = this.getCategoryRelevance(tag.category, allTerms);
    score += categoryBonus * 100;
    
    // 6. LEVEL-BASED SPECIFICITY SCORING (L3/L4 ONLY - heavily favor specific tags)
    const levelMultiplier = {
      'L1': 0.1,  // Strongly discourage general categories
      'L2': 0.3,  // Discourage subcategories  
      'L3': 2.0,  // Strongly favor specific activities
      'L4': 2.5   // Most specific get highest priority
    };
    score *= levelMultiplier[tag.level];
    
    // 7. FREQUENCY & POPULARITY BOOST
    score *= this.getPopularityMultiplier(tag);
    
    return Math.round(score);
  }
  
  /**
   * Calculate semantic relevance between tag and user terms
   */
  private calculateSemanticRelevance(tag: TaxonomyTag, userTerms: string[]): number {
    let relevanceScore = 0;
    
    for (const userTerm of userTerms) {
      // Check if any search terms are semantically related
      for (const tagTerm of tag.searchTerms) {
        if (this.areSemanticallySimilar(userTerm, tagTerm)) {
          relevanceScore += 1;
        }
      }
      
      // Check hierarchical path for semantic matches
      for (const pathElement of tag.fullPath) {
        if (this.areSemanticallySimilar(userTerm, pathElement.toLowerCase())) {
          relevanceScore += 0.7; // Lower weight for path matches
        }
      }
    }
    
    return Math.min(relevanceScore, 3); // Cap at 3 for normalization
  }
  
  /**
   * Calculate score based on hierarchical path structure
   */
  private calculateHierarchicalScore(tag: TaxonomyTag, userTerms: string[]): number {
    let pathScore = 0;
    
    // Weight path elements by their level (L1 > L2 > L3 > L4 in breadth)
    const pathWeights = [1.0, 0.8, 0.9, 1.2]; // L4 gets highest weight for specificity
    
    tag.fullPath.forEach((pathElement, index) => {
      const elementLower = pathElement.toLowerCase();
      for (const userTerm of userTerms) {
        if (elementLower.includes(userTerm) || userTerm.includes(elementLower)) {
          pathScore += pathWeights[index] || 0.5;
        }
        
        // Check semantic expansions
        const expansions = this.SEMANTIC_EXPANSIONS[userTerm] as string[] || [];
        for (const expansion of expansions) {
          if (elementLower.includes(expansion) || expansion.includes(elementLower)) {
            pathScore += (pathWeights[index] || 0.5) * 0.7; // Reduced weight for semantic matches
          }
        }
      }
    });
    
    return pathScore;
  }
  
  /**
   * Check if two terms are semantically similar
   */
  private areSemanticallySimilar(term1: string, term2: string): boolean {
    const t1 = term1.toLowerCase();
    const t2 = term2.toLowerCase();
    
    // Direct match
    if (t1 === t2 || t1.includes(t2) || t2.includes(t1)) {
      return true;
    }
    
    // Check semantic expansions
    const expansions1 = this.SEMANTIC_EXPANSIONS[t1] as string[] || [];
    const expansions2 = this.SEMANTIC_EXPANSIONS[t2] as string[] || [];
    
    return expansions1.includes(t2) || 
           expansions2.includes(t1) ||
           expansions1.some((exp: string) => expansions2.includes(exp));
  }
  
  /**
   * Get popularity multiplier based on tag characteristics
   */
  private getPopularityMultiplier(tag: TaxonomyTag): number {
    // Common popular activity types get slight boost
    const popularCategories = [
      'Tours, Sightseeing & Cruises', 'Food & Drink', 'Art & Culture',
      'Outdoor Activities', 'Shows & Performances'
    ];
    
    const popularTags = [
      'walking tours', 'food tours', 'museums', 'boat tours', 'city tours',
      'cooking classes', 'wine tasting', 'cultural tours', 'historical tours'
    ];
    
    let multiplier = 1.0;
    
    if (popularCategories.includes(tag.category)) {
      multiplier += 0.1;
    }
    
    const tagNameLower = tag.tagName.toLowerCase();
    if (popularTags.some(popular => tagNameLower.includes(popular))) {
      multiplier += 0.15;
    }
    
    return multiplier;
  }

  /**
   * Get category relevance based on search terms
   */
  private getCategoryRelevance(category: string, searchTerms: string[]): number {
    for (const [intent, categories] of Object.entries(this.CATEGORY_INTENT_MAP)) {
      if (categories.some(cat => category.includes(cat))) {
        const relevantTerms = this.getIntentTerms(intent);
        const matches = searchTerms.filter(term => 
          relevantTerms.some(relevantTerm => 
            term.includes(relevantTerm) || relevantTerm.includes(term)
          )
        );
        if (matches.length > 0) {
          return matches.length / searchTerms.length;
        }
      }
    }
    return 0;
  }

  /**
   * Get terms associated with an intent category
   */
  private getIntentTerms(intent: string): string[] {
    const intentTerms = {
      'food_wine': ['food', 'wine', 'culinary', 'dining', 'restaurant', 'cooking', 'chef', 'tasting'],
      'outdoor_adventure': ['outdoor', 'adventure', 'hiking', 'climbing', 'extreme', 'sport', 'nature'],
      'cultural_arts': ['culture', 'art', 'museum', 'gallery', 'historical', 'heritage', 'show', 'performance'],
      'tours_sightseeing': ['tour', 'sightseeing', 'guided', 'excursion', 'visit', 'explore'],
      'attractions_entertainment': ['attraction', 'theme', 'park', 'entertainment', 'ticket', 'show']
    };
    return intentTerms[intent as keyof typeof intentTerms] || [];
  }

  /**
   * Calculate overall confidence score
   */
  private calculateConfidence(tags: TaxonomyTag[], searchTerms: string[]): number {
    if (tags.length === 0) return 0;
    
    const tagScore = Math.min(tags.length / 5, 1) * 40; // Up to 40 points for tag count
    const specificityScore = this.getSpecificityScore(tags) * 30; // Up to 30 points for specificity
    const coverageScore = this.getCoverageScore(tags, searchTerms) * 30; // Up to 30 points for term coverage
    
    return Math.min(tagScore + specificityScore + coverageScore, 100);
  }

  /**
   * Get specificity score based on tag levels
   */
  private getSpecificityScore(tags: TaxonomyTag[]): number {
    const levelWeights = { 'L1': 0.25, 'L2': 0.5, 'L3': 0.75, 'L4': 1.0 };
    const avgSpecificity = tags.reduce((sum, tag) => sum + levelWeights[tag.level], 0) / tags.length;
    return avgSpecificity;
  }

  /**
   * Get coverage score based on how many search terms are covered
   */
  private getCoverageScore(tags: TaxonomyTag[], searchTerms: string[]): number {
    const coveredTerms = new Set<string>();
    
    for (const tag of tags) {
      for (const term of searchTerms) {
        if (tag.searchTerms.some(searchTerm => 
          searchTerm.includes(term) || term.includes(searchTerm)
        )) {
          coveredTerms.add(term);
        }
      }
    }
    
    return searchTerms.length > 0 ? coveredTerms.size / searchTerms.length : 0;
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
   * Get tag details by IDs
   */
  getTagsByIds(tagIds: number[]): TaxonomyTag[] {
    return tagIds
      .map(id => this.tags.get(id))
      .filter((tag): tag is TaxonomyTag => tag !== undefined);
  }

  /**
   * Get all tags in a category
   */
  getTagsByCategory(category: string): TaxonomyTag[] {
    return this.tagsByCategory.get(category) || [];
  }

  /**
   * Get cache status
   */
  getCacheStatus(): { size: number; initialized: boolean; categories: number } {
    return {
      size: this.tags.size,
      initialized: this.initialized,
      categories: this.tagsByCategory.size
    };
  }

  /**
   * Find tag IDs by interest (main interface method)
   */
  async findTagIdsByInterest(interestString: string): Promise<number[]> {
    const result = await this.findMatchingTags(interestString);
    
    // Return tags if confidence is reasonable
    if (result.confidence >= 30) { // Lower threshold since CSV matching is more precise
      return result.tagIds;
    }
    
    console.log(`⚠️ CSV tag confidence ${result.confidence}% below threshold, but returning best matches`);
    return result.tagIds.slice(0, 6); // Return top 6 even if confidence is low
  }
}

// Create and export singleton instance
export const csvTagManager = new CSVTagManager();
