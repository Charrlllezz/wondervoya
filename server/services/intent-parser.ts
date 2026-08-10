/**
 * 🧠 INTENT PARSER MODULE
 * Translates natural language queries into structured objects for API requests
 * Integrates with existing semantic and relevance engines
 */

import { enhancedTagMatcher } from './enhanced-tag-matcher';

export interface ParsedIntent {
  // Core intent structure
  destination: {
    id?: number;
    name?: string;
    confidence: number;
    alternatives?: string[];
  };

  // Activity preferences
  activities: {
    primary: string[];
    secondary: string[];
    categories: string[];
    keywords: string[];
  };

  // Temporal information
  timeframe: {
    dates?: {
      start?: string;
      end?: string;
      flexible: boolean;
    };
    duration?: {
      value: number;
      unit: 'hours' | 'days' | 'weeks';
      preference: 'exact' | 'approximate' | 'minimum' | 'maximum';
    };
    timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night' | 'flexible';
  };

  // Budget constraints
  budget: {
    range?: {
      min: number;
      max: number;
      currency: string;
    };
    preference: 'budget' | 'standard' | 'premium' | 'luxury' | 'flexible';
    confidence: number;
  };

  // Group information
  group: {
    size: number;
    type: 'solo' | 'couple' | 'family' | 'friends' | 'business' | 'group';
    ageGroups?: string[];
    specialNeeds?: string[];
  };

  // Experience preferences
  experience: {
    level: 'beginner' | 'intermediate' | 'advanced' | 'expert' | 'any';
    style: 'adventure' | 'cultural' | 'relaxation' | 'luxury' | 'educational' | 'mixed';
    intensity: 'low' | 'moderate' | 'high' | 'extreme';
  };

  // Query metadata
  metadata: {
    originalQuery: string;
    confidence: number;
    language: string;
    queryType: 'search' | 'booking' | 'information' | 'planning';
    specificity: 'low' | 'medium' | 'high';
    urgency: 'low' | 'medium' | 'high';
  };

  // API request structure
  apiRequest: {
    endpoint: string;
    method: 'GET' | 'POST';
    params: Record<string, any>;
    filters: Record<string, any>;
    sorting: {
      field: string;
      order: 'asc' | 'desc';
    }[];
  };
}

export class IntentParser {
  private destinationPatterns: Map<string, number> = new Map();
  private activityCategories: Map<string, string[]> = new Map();
  private temporalPatterns: RegExp[] = [];
  private budgetIndicators: Map<string, string> = new Map();

  constructor() {
    this.initializePatterns();
  }

  /**
   * 🎯 MAIN PARSING METHOD
   * Translates natural language query into structured intent
   */
  async parseQuery(query: string, context?: {
    userId?: string;
    conversationHistory?: any[];
    userPreferences?: any;
  }): Promise<ParsedIntent> {
    const normalizedQuery = this.normalizeQuery(query);

    // parseDestination needs the original casing preserved — see its doc
    // comment. Every other parser below is case-insensitive and uses the
    // normalized query as before.
    const destination = await this.parseDestination(query, context);
    const activities = this.parseActivities(normalizedQuery);
    const timeframe = this.parseTimeframe(normalizedQuery);
    const budget = this.parseBudget(normalizedQuery);
    const group = this.parseGroup(normalizedQuery);
    const experience = this.parseExperience(normalizedQuery);
    const metadata = this.analyzeQueryMetadata(normalizedQuery, query);

    // Generate API request structure
    const apiRequest = this.generateApiRequest({
      destination,
      activities,
      timeframe,
      budget,
      group,
      experience,
      metadata
    });

    return {
      destination,
      activities,
      timeframe,
      budget,
      group,
      experience,
      metadata,
      apiRequest
    };
  }

  /**
   * 🌍 DESTINATION PARSING
   *
   * Relies on capitalized words (e.g. "Tokyo") to identify a destination
   * mention and — just as importantly — to know where it ENDS: a run of
   * capitalized words stops as soon as it hits an ordinary lowercase word
   * ("next", "week", ...), which is what keeps "visiting Tokyo next week"
   * from over-capturing into "Tokyo next week".
   *
   * This only works on the original, un-lowercased query. It used to be
   * called with a pre-lowercased query (normalizeQuery() ran first), which
   * defeated both the identification AND the stopping behavior — with the
   * regex's own case-insensitive flag, "[A-Z][a-z]+" degrades to matching
   * *any* word, so it just greedily grabbed the rest of the sentence.
   * Un-capitalized input (most casual chat messages) still won't extract a
   * destination this way — that's a pre-existing limitation of a
   * capitalization-based heuristic, not something this fix attempts to
   * solve. A real fix for that would match against the destination gazetteer
   * instead of a regex heuristic.
   */
  private async parseDestination(query: string, context?: any): Promise<ParsedIntent['destination']> {
    const destinationPatterns = [
      // Direct city/country mentions
      /(?:in|to|at|visit|visiting|traveling to|going to)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g,
      // Location-specific phrases
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:trip|vacation|travel|tour|visit)/g,
      // Geographical references
      /(?:near|around|close to)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g
    ];

    const matches: string[] = [];
    let confidence = 0;

    for (const pattern of destinationPatterns) {
      const found = [...query.matchAll(pattern)];
      found.forEach(match => {
        if (match[1] && match[1].length > 2) {
          matches.push(match[1].trim());
          confidence += 0.3;
        }
      });
    }

    // Check context for destination hints
    if (context?.userPreferences?.destination) {
      matches.push(context.userPreferences.destination);
      confidence += 0.2;
    }

    if (matches.length === 0) {
      return {
        confidence: 0,
        alternatives: []
      };
    }

    // Find most likely destination
    const destinationCounts = new Map<string, number>();
    matches.forEach(dest => {
      const normalized = this.normalizeDestinationName(dest);
      destinationCounts.set(normalized, (destinationCounts.get(normalized) || 0) + 1);
    });

    const sortedDestinations = Array.from(destinationCounts.entries())
      .sort(([,a], [,b]) => b - a);

    const primaryDestination = sortedDestinations[0][0];
    const alternatives = sortedDestinations.slice(1, 4).map(([name]) => name);

    return {
      name: primaryDestination,
      confidence: Math.min(confidence, 1.0),
      alternatives,
      id: this.destinationPatterns.get(primaryDestination.toLowerCase())
    };
  }

  /**
   * 🎨 ACTIVITIES PARSING
   */
  private parseActivities(query: string): ParsedIntent['activities'] {
    const activityPatterns = {
      // Culinary
      culinary: ['food', 'cooking', 'culinary', 'restaurant', 'dining', 'wine', 'tasting', 'chef', 'cuisine', 'market'],
      // Cultural
      cultural: ['museum', 'art', 'culture', 'history', 'heritage', 'temple', 'church', 'traditional', 'local'],
      // Adventure
      adventure: ['adventure', 'hiking', 'outdoor', 'extreme', 'climbing', 'kayaking', 'diving', 'safari', 'wildlife'],
      // Relaxation
      relaxation: ['spa', 'relax', 'beach', 'peaceful', 'calm', 'massage', 'wellness', 'yoga', 'meditation'],
      // Entertainment
      entertainment: ['show', 'concert', 'theater', 'nightlife', 'bar', 'club', 'festival', 'performance'],
      // Sightseeing
      sightseeing: ['tour', 'sightseeing', 'landmark', 'attraction', 'monument', 'viewpoint', 'scenic']
    };

    const primary: string[] = [];
    const secondary: string[] = [];
    const categories: string[] = [];
    const keywords: string[] = [];

    const queryLower = query.toLowerCase();
    const words = queryLower.split(/\s+/);

    // Match activity patterns
    Object.entries(activityPatterns).forEach(([category, terms]) => {
      const matches = terms.filter(term => queryLower.includes(term));
      if (matches.length > 0) {
        categories.push(category);
        primary.push(...matches.slice(0, 2)); // Top 2 matches per category
        keywords.push(...matches);
      }
    });

    // Extract specific activity mentions
    const specificActivityPatterns = [
      /(?:want to|looking for|interested in|planning to)\s+([a-z\s]{3,30}?)(?:\s+(?:in|at|near|around))/gi,
      /([a-z\s]{3,20}?)\s+(?:experience|activity|tour|class|lesson)/gi
    ];

    specificActivityPatterns.forEach(pattern => {
      const matches = [...queryLower.matchAll(pattern)];
      matches.forEach(match => {
        if (match[1] && match[1].trim().length > 3) {
          secondary.push(match[1].trim());
        }
      });
    });

    return {
      primary: [...new Set(primary)],
      secondary: [...new Set(secondary)],
      categories: [...new Set(categories)],
      keywords: [...new Set(keywords)]
    };
  }

  /**
   * ⏰ TIMEFRAME PARSING
   */
  private parseTimeframe(query: string): ParsedIntent['timeframe'] {
    const timeframe: ParsedIntent['timeframe'] = {};

    // Date patterns
    const datePatterns = [
      /(\d{1,2}\/\d{1,2}\/\d{4})/g, // MM/DD/YYYY
      /(\d{4}-\d{2}-\d{2})/g, // YYYY-MM-DD
      /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/gi,
      /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})/gi
    ];

    const dates: string[] = [];
    datePatterns.forEach(pattern => {
      const matches = [...query.matchAll(pattern)];
      matches.forEach(match => dates.push(match[0]));
    });

    if (dates.length > 0) {
      timeframe.dates = {
        start: dates[0],
        end: dates[1] || dates[0],
        flexible: query.includes('flexible') || query.includes('around')
      };
    }

    // Duration patterns
    const durationPatterns = [
      /(\d+)\s*(hour|hours|hr|hrs)/gi,
      /(\d+)\s*(day|days)/gi,
      /(\d+)\s*(week|weeks)/gi,
      /(half\s+day|full\s+day|whole\s+day)/gi
    ];

    durationPatterns.forEach(pattern => {
      const match = query.match(pattern);
      if (match) {
        const value = match[1] === 'half' ? 0.5 : 
                     match[1] === 'full' || match[1] === 'whole' ? 1 : 
                     parseInt(match[1]);
        const unit = match[2]?.includes('hour') ? 'hours' :
                    match[2]?.includes('week') ? 'weeks' : 'days';

        timeframe.duration = {
          value,
          unit,
          preference: query.includes('exactly') ? 'exact' :
                     query.includes('at least') ? 'minimum' :
                     query.includes('no more than') ? 'maximum' : 'approximate'
        };
      }
    });

    // Time of day
    const timeOfDayPatterns = {
      morning: /morning|sunrise|early|dawn|am\b/gi,
      afternoon: /afternoon|lunch|midday|noon/gi,
      evening: /evening|sunset|dusk|dinner/gi,
      night: /night|nighttime|late|midnight/gi
    };

    Object.entries(timeOfDayPatterns).forEach(([time, pattern]) => {
      if (pattern.test(query)) {
        timeframe.timeOfDay = time as any;
      }
    });

    return timeframe;
  }

  /**
   * 💰 BUDGET PARSING
   */
  parseBudget(query: string): ParsedIntent['budget'] {
    const budget: ParsedIntent['budget'] = {
      preference: 'flexible',
      confidence: 0
    };

    // Enhanced budget range patterns for comprehensive price constraint parsing
    const rangePatterns = [
      // Range patterns: $50-100, $50 to 100, 50-100 dollars
      /\$(\d+)(?:\s*-\s*|\s+to\s+)\$?(\d+)/gi,
      /(\d+)(?:\s*-\s*|\s+to\s+)(\d+)\s*(?:dollars?|usd|\$)/gi,

      // Upper limit patterns: under $100, less than $150, below $200, max $75
      /(?:under|less\s+than|below|maximum|max)\s+\$?(\d+)/gi,

      // Lower limit patterns: over $50, more than $100, above $75, minimum $25, min $30
      /(?:over|more\s+than|above|minimum|min|at\s+least)\s+\$?(\d+)/gi,

      // Exact amount patterns: around $100, about $150, approximately $75
      /(?:around|about|approximately|roughly)\s+\$?(\d+)/gi,

      // Budget of patterns: budget of $100, spending $150
      /(?:budget\s+of|spending|spend)\s+\$?(\d+)/gi,

      // Per person patterns: $100 per person, $50 each
      /\$?(\d+)\s+(?:per\s+person|each|pp)/gi
    ];

    let detectedMin: number | null = null;
    let detectedMax: number | null = null;

    rangePatterns.forEach((pattern, index) => {
      const matches = [...query.matchAll(pattern)];
      matches.forEach(match => {
        const amount1 = parseInt(match[1]);
        const amount2 = match[2] ? parseInt(match[2]) : null;

        if (index === 0 || index === 1) {
          // Range patterns: min-max
          detectedMin = Math.min(amount1, amount2 || amount1);
          detectedMax = Math.max(amount1, amount2 || amount1);
          budget.confidence = 0.9;
        } else if (index === 2) {
          // Upper limit patterns: under, less than, below, max
          detectedMax = amount1;
          budget.confidence = 0.8;
        } else if (index === 3) {
          // Lower limit patterns: over, more than, above, min
          detectedMin = amount1;
          budget.confidence = 0.8;
        } else if (index === 4 || index === 5) {
          // Exact amount patterns: around, budget of
          detectedMin = Math.max(0, amount1 - (amount1 * 0.2)); // 20% below
          detectedMax = amount1 + (amount1 * 0.3); // 30% above
          budget.confidence = 0.7;
        } else if (index === 6) {
          // Per person patterns
          detectedMin = Math.max(0, amount1 - (amount1 * 0.1)); // 10% below
          detectedMax = amount1 + (amount1 * 0.2); // 20% above
          budget.confidence = 0.75;
        }
      });
    });

    // Set the final range if constraints were detected
    if (detectedMin !== null || detectedMax !== null) {
      budget.range = {
        min: detectedMin || 0,
        max: detectedMax || 10000, // Default high limit if only min specified
        currency: 'USD'
      };
    }

    // Budget preference indicators (fallback if no specific amounts found)
    const preferenceIndicators = {
      budget: ['budget', 'cheap', 'affordable', 'economical', 'inexpensive', 'low cost', 'bargain'],
      standard: ['reasonable', 'moderate', 'standard', 'normal', 'fair price'],
      premium: ['premium', 'upscale', 'quality', 'nice', 'higher end'],
      luxury: ['luxury', 'high-end', 'exclusive', 'vip', 'first-class', 'expensive', 'splurge']
    };

    const queryLower = query.toLowerCase();
    Object.entries(preferenceIndicators).forEach(([pref, indicators]) => {
      if (indicators.some(indicator => queryLower.includes(indicator))) {
        budget.preference = pref as any;

        // If no specific amount was found, set confidence based on preference
        if (budget.confidence === 0) {
          budget.confidence = 0.6;
        }

        // Add default ranges for preferences when no specific amounts are mentioned
        if (!budget.range) {
          const defaultRanges = {
            budget: { min: 0, max: 50, currency: 'USD' },
            standard: { min: 50, max: 150, currency: 'USD' },
            premium: { min: 150, max: 300, currency: 'USD' },
            luxury: { min: 300, max: 1000, currency: 'USD' }
          };
          budget.range = defaultRanges[pref as keyof typeof defaultRanges];
        }
      }
    });

    return budget;
  }

  /**
   * 👥 GROUP PARSING
   */
  private parseGroup(query: string): ParsedIntent['group'] {
    const group: ParsedIntent['group'] = {
      size: 1,
      type: 'solo'
    };

    // Group size patterns
    const sizePatterns = [
      /(\d+)\s+(?:people|persons?|adults?|travelers?)/gi,
      /group\s+of\s+(\d+)/gi,
      /party\s+of\s+(\d+)/gi,
      /(\d+)\s+of\s+us/gi
    ];

    sizePatterns.forEach(pattern => {
      const match = query.match(pattern);
      if (match) {
        group.size = parseInt(match[1]);
      }
    });

    // Group type indicators
    const typeIndicators = {
      solo: ['solo', 'alone', 'myself', 'individual'],
      couple: ['couple', 'two of us', 'my partner', 'romantic', 'honeymoon'],
      family: ['family', 'kids', 'children', 'child', 'baby', 'toddler'],
      friends: ['friends', 'buddies', 'mates', 'gang'],
      business: ['business', 'corporate', 'colleagues', 'team building'],
      group: ['group', 'large group', 'party', 'crowd']
    };

    const queryLower = query.toLowerCase();
    Object.entries(typeIndicators).forEach(([type, indicators]) => {
      if (indicators.some(indicator => queryLower.includes(indicator))) {
        group.type = type as any;
      }
    });

    // Age group detection
    const ageGroups: string[] = [];
    if (queryLower.includes('kid') || queryLower.includes('child')) ageGroups.push('children');
    if (queryLower.includes('teen') || queryLower.includes('adolescent')) ageGroups.push('teenagers');
    if (queryLower.includes('senior') || queryLower.includes('elderly')) ageGroups.push('seniors');

    if (ageGroups.length > 0) {
      group.ageGroups = ageGroups;
    }

    return group;
  }

  /**
   * 🎯 EXPERIENCE PARSING
   */
  private parseExperience(query: string): ParsedIntent['experience'] {
    const experience: ParsedIntent['experience'] = {
      level: 'any',
      style: 'mixed',
      intensity: 'moderate'
    };

    const queryLower = query.toLowerCase();

    // Experience level
    const levelIndicators = {
      beginner: ['beginner', 'new to', 'first time', 'novice', 'easy'],
      intermediate: ['intermediate', 'some experience', 'moderate'],
      advanced: ['advanced', 'experienced', 'expert', 'challenging'],
      expert: ['expert', 'professional', 'master', 'extreme']
    };

    Object.entries(levelIndicators).forEach(([level, indicators]) => {
      if (indicators.some(indicator => queryLower.includes(indicator))) {
        experience.level = level as any;
      }
    });

    // Experience style
    const styleIndicators = {
      adventure: ['adventure', 'thrill', 'adrenaline', 'extreme', 'outdoor'],
      cultural: ['cultural', 'traditional', 'authentic', 'local', 'heritage'],
      relaxation: ['relax', 'peaceful', 'calm', 'spa', 'wellness'],
      luxury: ['luxury', 'premium', 'exclusive', 'vip', 'upscale'],
      educational: ['learn', 'educational', 'workshop', 'class', 'course']
    };

    Object.entries(styleIndicators).forEach(([style, indicators]) => {
      if (indicators.some(indicator => queryLower.includes(indicator))) {
        experience.style = style as any;
      }
    });

    // Intensity level
    if (queryLower.includes('intense') || queryLower.includes('extreme')) {
      experience.intensity = 'extreme';
    } else if (queryLower.includes('challenging') || queryLower.includes('active')) {
      experience.intensity = 'high';
    } else if (queryLower.includes('easy') || queryLower.includes('gentle')) {
      experience.intensity = 'low';
    }

    return experience;
  }

  /**
   * 📊 QUERY METADATA ANALYSIS
   */
  private analyzeQueryMetadata(normalizedQuery: string, originalQuery: string): ParsedIntent['metadata'] {
    const wordCount = normalizedQuery.split(/\s+/).length;

    // Determine query type
    let queryType: 'search' | 'booking' | 'information' | 'planning' = 'search';
    if (originalQuery.includes('book') || originalQuery.includes('reserve')) {
      queryType = 'booking';
    } else if (originalQuery.includes('?') || originalQuery.includes('how') || originalQuery.includes('what')) {
      queryType = 'information';
    } else if (originalQuery.includes('plan') || originalQuery.includes('itinerary')) {
      queryType = 'planning';
    }

    // Determine specificity
    let specificity: 'low' | 'medium' | 'high' = 'low';
    if (wordCount > 10) specificity = 'high';
    else if (wordCount > 5) specificity = 'medium';

    // Determine urgency
    let urgency: 'low' | 'medium' | 'high' = 'low';
    const urgentTerms = ['urgent', 'asap', 'immediately', 'today', 'tomorrow', 'soon'];
    if (urgentTerms.some(term => normalizedQuery.includes(term))) {
      urgency = 'high';
    } else if (normalizedQuery.includes('next week') || normalizedQuery.includes('this weekend')) {
      urgency = 'medium';
    }

    // Calculate confidence
    const hasDestination = normalizedQuery.match(/(?:in|to|at)\s+[A-Z][a-z]+/) ? 0.3 : 0;
    const hasActivity = normalizedQuery.match(/(tour|visit|see|do|experience)/) ? 0.3 : 0;
    const hasTimeframe = normalizedQuery.match(/(\d+\/\d+|\d+\s+days?|week|month)/) ? 0.2 : 0;
    const hasBudget = normalizedQuery.match(/(\$\d+|budget|cheap|expensive)/) ? 0.2 : 0;

    const confidence = hasDestination + hasActivity + hasTimeframe + hasBudget;

    return {
      originalQuery,
      confidence,
      language: 'en', // Could be enhanced with language detection
      queryType,
      specificity,
      urgency
    };
  }

  /**
   * 🔧 API REQUEST GENERATION
   */
  private generateApiRequest(intent: Partial<ParsedIntent>): ParsedIntent['apiRequest'] {
    const { destination, activities, budget, group, timeframe } = intent;

    // Determine endpoint based on intent
    let endpoint = '/api/products/search';
    if (destination?.name && activities?.categories.length === 0) {
      endpoint = '/api/attractions/search';
    }

    // Build parameters
    const params: Record<string, any> = {};

    if (destination?.id) {
      params.destId = destination.id;
    } else if (destination?.name) {
      params.destination = destination.name;
    }

    if (activities?.keywords.length) {
      params.searchTerms = activities.keywords.join(' ');
    }

    if (budget?.range) {
      params.minPrice = budget.range.min;
      params.maxPrice = budget.range.max;
      params.currency = budget.range.currency;
    }

    if (group?.size) {
      params.groupSize = group.size;
    }

    // Build filters
    const filters: Record<string, any> = {};

    if (activities?.categories.length) {
      filters.categories = activities.categories;
    }

    if (timeframe?.timeOfDay) {
      filters.timeOfDay = timeframe.timeOfDay;
    }

    // Add feature flags to filters
    if (intent.metadata?.originalQuery) {
      const featureFlags = this.mapFeatureFlags(intent.metadata.originalQuery);
      if (featureFlags.length > 0) {
        filters.flags = featureFlags;
      }
    }

    // Build sorting
    const sorting: { field: string; order: 'asc' | 'desc' }[] = [
      { field: 'relevance', order: 'desc' },
      { field: 'rating', order: 'desc' }
    ];

    if (budget?.preference === 'budget') {
      sorting.unshift({ field: 'price', order: 'asc' as const });
    } else if (budget?.preference === 'luxury') {
      sorting.unshift({ field: 'price', order: 'desc' as const });
    }

    return {
      endpoint,
      method: 'POST',
      params,
      filters,
      sorting
    };
  }

  /**
   * 🧹 HELPER METHODS
   */
  private normalizeQuery(query: string): string {
    return query
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private normalizeDestinationName(destination: string): string {
    return destination
      .toLowerCase()
      .replace(/\b(city|town|area|region)\b/g, '')
      .trim();
  }

  private initializePatterns(): void {
    // Initialize common destination mappings
    this.destinationPatterns.set('tokyo', 294);
    this.destinationPatterns.set('paris', 479);
    this.destinationPatterns.set('bangkok', 293);
    this.destinationPatterns.set('london', 511);
    this.destinationPatterns.set('new york', 684);
    this.destinationPatterns.set('rome', 517);
    this.destinationPatterns.set('barcelona', 485);

    // Add more destination mappings as needed
  }

  /**
   * 🏷️ INTEREST-TO-TAG MAPPING
   * Maps common user interests to arrays of relevant Viator tag IDs
   */
  async mapInterestsToTagIds(query: string): Promise<number[]> {
    console.log(`🎯 MAPPING INTERESTS TO TAGS: "${query}"`);

    try {
      const result = await enhancedTagMatcher.matchUserInterests(query);

      console.log(`✅ Enhanced matching complete:`);
      console.log(`   - ${result.tagIds.length} tags found`);
      console.log(`   - ${result.confidence}% confidence`);
      console.log(`   - Strategy: ${result.matchStrategy}`);
      console.log(`   - Categories: ${Object.keys(result.categoryBreakdown).join(', ')}`);

      return result.tagIds;
    } catch (error) {
      console.error('❌ Enhanced tag matching failed:', error);
      console.log('🔄 Falling back to basic tag matching...');

      // Simple fallback - basic keyword matching
      const fallbackTags: number[] = [];
      const normalizedQuery = query.toLowerCase();

      if (normalizedQuery.includes('food') || normalizedQuery.includes('culinary') || normalizedQuery.includes('dining')) {
        fallbackTags.push(21912, 21516, 20214); // Food & Drink categories
      }

      if (normalizedQuery.includes('tour') || normalizedQuery.includes('sightseeing')) {
        fallbackTags.push(11930, 11920, 11923); // Tours & Sightseeing
      }

      if (normalizedQuery.includes('culture') || normalizedQuery.includes('museum') || normalizedQuery.includes('art')) {
        fallbackTags.push(12716, 11901, 21598); // Cultural categories
      }

      console.log(`🔄 Fallback tags: [${fallbackTags.join(', ')}]`);
      return fallbackTags;
    }
  }

  /**
   * 🏴 FEATURE FLAGS MAPPING
   * Maps keywords to special features for the filtering.flags property
   */
  mapFeatureFlags(query: string): string[] {
    const normalizedQuery = query.toLowerCase();
    const flags = new Set<string>();

    // Define feature flag mappings based on keywords
    const featureFlagMap: { [key: string]: string[] } = {
      // Tour Types
      'private': ['PRIVATE_TOUR', 'EXCLUSIVE_ACCESS'],
      'private tour': ['PRIVATE_TOUR'],
      'exclusive': ['EXCLUSIVE_ACCESS', 'VIP_EXPERIENCE'],
      'vip': ['VIP_EXPERIENCE', 'PRIORITY_ACCESS'],
      'small group': ['SMALL_GROUP', 'INTIMATE_EXPERIENCE'],
      'group tour': ['GROUP_TOUR'],
      'guided': ['GUIDED_TOUR', 'EXPERT_GUIDE'],
      'self guided': ['SELF_GUIDED', 'AUDIO_GUIDE'],
      'audio guide': ['AUDIO_GUIDE'],

      // Access Types
      'skip the line': ['SKIP_THE_LINE', 'FAST_TRACK'],
      'skip line': ['SKIP_THE_LINE'],
      'fast track': ['FAST_TRACK'],
      'priority': ['PRIORITY_ACCESS'],
      'fast pass': ['FAST_PASS'],
      'express': ['EXPRESS_ENTRY'],
      'no wait': ['SKIP_THE_LINE'],

      // Transportation
      'hotel pickup': ['HOTEL_PICKUP', 'TRANSPORTATION_INCLUDED'],
      'pickup': ['HOTEL_PICKUP'],
      'transport included': ['TRANSPORTATION_INCLUDED'],
      'transfer': ['TRANSPORTATION_INCLUDED'],
      'roundtrip': ['ROUNDTRIP_TRANSPORT'],

      // Meal Options
      'lunch included': ['LUNCH_INCLUDED', 'MEAL_INCLUDED'],
      'dinner included': ['DINNER_INCLUDED', 'MEAL_INCLUDED'],
      'meal included': ['MEAL_INCLUDED'],
      'refreshments': ['REFRESHMENTS_INCLUDED'],
      'snacks included': ['SNACKS_INCLUDED'],

      // Special Features
      'photo opportunity': ['PHOTO_OPPORTUNITIES'],
      'instagram': ['PHOTO_OPPORTUNITIES', 'SOCIAL_MEDIA_WORTHY'],
      'photogenic': ['PHOTO_OPPORTUNITIES'],
      'sunset': ['SUNSET_EXPERIENCE'],
      'sunrise': ['SUNRISE_EXPERIENCE'],
      'night tour': ['NIGHT_EXPERIENCE'],
      'evening': ['EVENING_EXPERIENCE'],

      // Accessibility
      'wheelchair accessible': ['WHEELCHAIR_ACCESSIBLE'],
      'accessible': ['ACCESSIBILITY_FEATURES'],
      'mobility': ['ACCESSIBILITY_FEATURES'],

      // Age Restrictions
      'family friendly': ['FAMILY_FRIENDLY'],
      'kids': ['FAMILY_FRIENDLY', 'CHILD_APPROPRIATE'],
      'children': ['FAMILY_FRIENDLY', 'CHILD_APPROPRIATE'],
      'adults only': ['ADULTS_ONLY'],
      '18+': ['ADULTS_ONLY'],
      'mature': ['ADULTS_ONLY'],

      // Duration Types
      'half day': ['HALF_DAY_TOUR'],
      'full day': ['FULL_DAY_TOUR'],
      'multi day': ['MULTI_DAY_TOUR'],
      'overnight': ['OVERNIGHT_TOUR'],

      // Seasonal/Weather
      'indoor': ['INDOOR_ACTIVITY'],
      'outdoor': ['OUTDOOR_ACTIVITY'],
      'weather dependent': ['WEATHER_DEPENDENT'],
      'rain or shine': ['ALL_WEATHER'],

      // Equipment/Gear
      'equipment included': ['EQUIPMENT_PROVIDED'],
      'gear included': ['EQUIPMENT_PROVIDED'],
      'equipment provided': ['EQUIPMENT_PROVIDED'],

      // Booking Features
      'free cancellation': ['FREE_CANCELLATION'],
      'instant confirmation': ['INSTANT_CONFIRMATION'],
      'mobile ticket': ['MOBILE_TICKET'],
      'flexible': ['FLEXIBLE_BOOKING'],

      // Experience Level
      'beginner friendly': ['BEGINNER_FRIENDLY'],
      'expert guide': ['EXPERT_GUIDE'],
      'professional': ['PROFESSIONAL_GUIDE'],
      'certified': ['CERTIFIED_GUIDE'],

      // Special Interests
      'eco friendly': ['ECO_FRIENDLY', 'SUSTAINABLE_TOURISM'],
      'sustainable': ['SUSTAINABLE_TOURISM'],
      'local experience': ['LOCAL_EXPERIENCE', 'AUTHENTIC_EXPERIENCE'],
      'authentic': ['AUTHENTIC_EXPERIENCE'],
      'cultural immersion': ['CULTURAL_IMMERSION'],
      'behind the scenes': ['BEHIND_THE_SCENES'],

      // Safety Features
      'safety equipment': ['SAFETY_EQUIPMENT_PROVIDED'],
      'life jacket': ['SAFETY_EQUIPMENT_PROVIDED'],
      'helmet': ['SAFETY_EQUIPMENT_PROVIDED'],
      'safety briefing': ['SAFETY_BRIEFING_INCLUDED']
    };

    // Exact phrase matching first (higher priority)
    for (const [keyword, flagList] of Object.entries(featureFlagMap)) {
      if (normalizedQuery.includes(keyword)) {
        flagList.forEach(flag => flags.add(flag));
      }
    }

    // Word-based matching for broader coverage
    const words = normalizedQuery.split(/\s+/).filter(word => word.length > 2);
    for (const word of words) {
      for (const [keyword, flagList] of Object.entries(featureFlagMap)) {
        // Check if the word is part of a compound keyword
        if (keyword.includes(word) && keyword !== word) {
          // Add flags but with lower priority (only first flag)
          flags.add(flagList[0]);
        }
      }
    }

    // Special semantic groupings
    const semanticFlags: { [key: string]: string[] } = {
      'convenience': ['HOTEL_PICKUP', 'SKIP_THE_LINE', 'MOBILE_TICKET'],
      'luxury': ['PRIVATE_TOUR', 'VIP_EXPERIENCE', 'EXCLUSIVE_ACCESS'],
      'budget': ['GROUP_TOUR', 'SELF_GUIDED'],
      'adventure': ['OUTDOOR_ACTIVITY', 'EQUIPMENT_PROVIDED', 'SAFETY_EQUIPMENT_PROVIDED'],
      'romance': ['PRIVATE_TOUR', 'SUNSET_EXPERIENCE', 'INTIMATE_EXPERIENCE'],
      'family': ['FAMILY_FRIENDLY', 'CHILD_APPROPRIATE', 'SAFETY_BRIEFING_INCLUDED']
    };

    // Apply semantic flags based on query context
    for (const [context, flagList] of Object.entries(semanticFlags)) {
      if (normalizedQuery.includes(context)) {
        flagList.slice(0, 2).forEach(flag => flags.add(flag)); // Add top 2 semantic flags
      }
    }

    const result = Array.from(flags);
    console.log(`🏴 Mapped "${query}" to ${result.length} feature flags: ${result.join(', ')}`);

    return result;
  }

  /**
   * 🎯 VALIDATION METHOD
   */
  validateIntent(intent: ParsedIntent): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!intent.destination.name && !intent.destination.id) {
      errors.push('No destination identified in query');
    }

    if (intent.activities.primary.length === 0 && intent.activities.categories.length === 0) {
      errors.push('No activities or interests identified');
    }

    if (intent.metadata.confidence < 0.3) {
      errors.push('Query confidence too low for reliable parsing');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

export const intentParser = new IntentParser();

// Export standalone functions for backward compatibility
export const mapInterestsToTagIds = (query: string): Promise<number[]> => {
  return intentParser.mapInterestsToTagIds(query);
};

export const mapFeatureFlags = (query: string): string[] => {
  return intentParser.mapFeatureFlags(query);
};

export const parsePriceConstraints = (query: string): any => {
  return intentParser.parseBudget(query);
};