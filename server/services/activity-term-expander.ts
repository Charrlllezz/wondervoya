/**
 * Activity Term Expander - Improves search comprehensiveness
 * Expands user search terms to catch all relevant activities
 */

export interface ActivityMapping {
  userTerm: string;
  expandedTerms: string[];
  categories: string[];
  keywords: string[];
}

export class ActivityTermExpander {
  private static activityMappings: ActivityMapping[] = [
    // Japanese Cultural Activities
    {
      userTerm: 'sumo wrestling',
      expandedTerms: ['sumo', 'sumo wrestling', 'sumo tournament', 'sumo match', 'sumo experience', 'sumo demonstration', 'sumo stable', 'sumo training', 'japanese wrestling'],
      categories: ['cultural tours', 'sports experiences', 'traditional experiences'],
      keywords: ['sumo', 'wrestling', 'tournament', 'stable', 'rikishi', 'chanko', 'yokozuna', 'basho']
    },
    {
      userTerm: 'sushi making',
      expandedTerms: ['sushi', 'sushi making', 'sushi class', 'sushi experience', 'sushi workshop', 'sushi cooking', 'nigiri', 'maki', 'japanese cooking', 'culinary experience'],
      categories: ['cooking classes', 'food experiences', 'cultural tours'],
      keywords: ['sushi', 'making', 'cooking', 'class', 'workshop', 'chef', 'nigiri', 'maki', 'sashimi', 'roll']
    },
    {
      userTerm: 'tea ceremony',
      expandedTerms: ['tea ceremony', 'japanese tea', 'tea experience', 'chanoyu', 'sado', 'matcha', 'tea ritual', 'traditional tea', 'tea master'],
      categories: ['cultural tours', 'traditional experiences', 'workshops'],
      keywords: ['tea', 'ceremony', 'matcha', 'chanoyu', 'sado', 'ritual', 'traditional', 'master', 'geisha']
    },
    {
      userTerm: 'samurai',
      expandedTerms: ['samurai', 'samurai experience', 'samurai training', 'sword fighting', 'katana', 'bushido', 'ninja', 'martial arts', 'warrior', 'sword making', 'blade', 'japanese sword', 'traditional japan'],
      categories: ['cultural tours', 'historical tours', 'experiences', 'traditional experiences'],
      keywords: ['samurai', 'sword', 'katana', 'ninja', 'martial', 'warrior', 'bushido', 'training', 'dojo', 'blade', 'traditional', 'japanese', 'historical']
    },
    {
      userTerm: 'ninja',
      expandedTerms: ['ninja', 'ninja experience', 'ninja training', 'martial arts', 'samurai', 'warrior', 'traditional japan', 'japanese culture', 'stealth', 'shuriken'],
      categories: ['cultural tours', 'historical tours', 'experiences', 'traditional experiences'],
      keywords: ['ninja', 'samurai', 'martial', 'warrior', 'training', 'traditional', 'japanese', 'culture', 'stealth', 'shuriken', 'dojo']
    },
    
    // European Cultural Activities
    {
      userTerm: 'flamenco',
      expandedTerms: ['flamenco', 'flamenco show', 'flamenco dancing', 'spanish dance', 'andalusian', 'tablao', 'flamenco experience'],
      categories: ['cultural shows', 'dance performances', 'traditional experiences'],
      keywords: ['flamenco', 'dance', 'spanish', 'andalusian', 'tablao', 'guitar', 'palmas', 'zapateado']
    },
    {
      userTerm: 'architecture tours',
      expandedTerms: ['architecture', 'architectural tour', 'building tour', 'gaudi', 'gothic', 'baroque', 'modernist', 'design tour', 'heritage tour'],
      categories: ['architectural tours', 'walking tours', 'cultural tours'],
      keywords: ['architecture', 'building', 'design', 'gaudi', 'gothic', 'baroque', 'cathedral', 'palace', 'monument']
    },
    
    // General Activity Types
    {
      userTerm: 'food tours',
      expandedTerms: ['food tour', 'culinary tour', 'tasting tour', 'street food', 'food walking', 'gastronomy', 'local cuisine', 'food experience', 'cooking', 'restaurant'],
      categories: ['food tours', 'culinary experiences', 'walking tours'],
      keywords: ['food', 'culinary', 'tasting', 'cuisine', 'restaurant', 'local', 'street', 'market', 'cooking', 'chef']
    },
    {
      userTerm: 'museums',
      expandedTerms: ['museum', 'gallery', 'art museum', 'history museum', 'exhibition', 'collection', 'artifacts', 'cultural center'],
      categories: ['museums & galleries', 'cultural tours', 'educational tours'],
      keywords: ['museum', 'gallery', 'exhibition', 'art', 'history', 'culture', 'artifacts', 'collection', 'display']
    },
    {
      userTerm: 'historical tours',
      expandedTerms: ['historical tour', 'history tour', 'heritage tour', 'walking tour', 'guided tour', 'historical sites', 'monuments', 'landmarks'],
      categories: ['historical tours', 'walking tours', 'cultural tours'],
      keywords: ['history', 'historical', 'heritage', 'monument', 'landmark', 'ancient', 'old', 'traditional', 'past']
    },
    
    // Adventure Activities
    {
      userTerm: 'scuba diving',
      expandedTerms: ['scuba diving', 'diving', 'underwater', 'snorkeling', 'diving experience', 'dive tour', 'marine life', 'coral reef'],
      categories: ['water sports', 'adventure tours', 'marine experiences'],
      keywords: ['diving', 'scuba', 'underwater', 'snorkeling', 'marine', 'coral', 'reef', 'fish', 'ocean', 'sea']
    }
  ];

  static expandSearchTerms(userQuery: string): {
    originalTerm: string;
    expandedTerms: string[];
    searchStrategies: string[];
    keywords: string[];
  } {
    const lowerQuery = userQuery.toLowerCase();
    
    // Find matching activity mappings
    const matchedMappings = this.activityMappings.filter(mapping => 
      lowerQuery.includes(mapping.userTerm.toLowerCase()) ||
      mapping.keywords.some(keyword => lowerQuery.includes(keyword.toLowerCase()))
    );

    if (matchedMappings.length === 0) {
      // No specific mapping found - use general expansion
      const words = lowerQuery.split(/\s+/).filter(word => word.length > 2);
      return {
        originalTerm: userQuery,
        expandedTerms: [userQuery, ...words],
        searchStrategies: [userQuery],
        keywords: words
      };
    }

    // Combine all matched mappings
    const allExpandedTerms = new Set<string>();
    const allKeywords = new Set<string>();
    const allCategories = new Set<string>();

    matchedMappings.forEach(mapping => {
      mapping.expandedTerms.forEach(term => allExpandedTerms.add(term));
      mapping.keywords.forEach(keyword => allKeywords.add(keyword));
      mapping.categories.forEach(category => allCategories.add(category));
    });

    // Create comprehensive search strategies
    const searchStrategies = [
      userQuery, // Original query
      ...Array.from(allExpandedTerms),
      ...Array.from(allCategories)
    ];

    return {
      originalTerm: userQuery,
      expandedTerms: Array.from(allExpandedTerms),
      searchStrategies: [...new Set(searchStrategies)], // Remove duplicates
      keywords: Array.from(allKeywords)
    };
  }

  static getLocationSpecificTerms(location: string, activity: string): string[] {
    const locationLower = location.toLowerCase();
    const activityLower = activity.toLowerCase();
    
    const locationSpecific: string[] = [];

    // Japan-specific enhancements
    if (locationLower.includes('japan') || locationLower.includes('tokyo') || locationLower.includes('osaka') || locationLower.includes('kyoto')) {
      if (activityLower.includes('sumo')) {
        locationSpecific.push('tokyo sumo', 'ryogoku', 'kokugikan', 'sumo stable visit', 'chanko nabe', 'basho tournament');
      }
      if (activityLower.includes('sushi')) {
        locationSpecific.push('tsukiji', 'toyosu', 'sushi counter', 'omakase', 'edo style', 'tokyo sushi');
      }
      if (activityLower.includes('tea')) {
        locationSpecific.push('tea ceremony tokyo', 'kyoto tea', 'matcha experience', 'traditional tea house');
      }
    }

    // Spain-specific enhancements
    if (locationLower.includes('spain') || locationLower.includes('barcelona') || locationLower.includes('madrid') || locationLower.includes('seville')) {
      if (activityLower.includes('flamenco')) {
        locationSpecific.push('tablao', 'andalusian flamenco', 'spanish guitar', 'flamenco barcelona', 'flamenco madrid');
      }
      if (activityLower.includes('architecture') && locationLower.includes('barcelona')) {
        locationSpecific.push('gaudi', 'sagrada familia', 'park guell', 'casa batllo', 'modernist barcelona');
      }
    }

    // France-specific enhancements
    if (locationLower.includes('france') || locationLower.includes('paris')) {
      if (activityLower.includes('museum')) {
        locationSpecific.push('louvre', 'musee dorsay', 'paris museums', 'french art', 'impressionist');
      }
      if (activityLower.includes('food')) {
        locationSpecific.push('french cuisine', 'paris food', 'bistro', 'patisserie', 'wine tasting');
      }
    }

    return locationSpecific;
  }

  static createComprehensiveSearchQuery(location: string, activity: string): {
    primarySearches: string[];
    fallbackSearches: string[];
    locationSpecific: string[];
  } {
    const expansion = this.expandSearchTerms(activity);
    const locationSpecific = this.getLocationSpecificTerms(location, activity);

    // Primary searches - most specific and relevant
    const primarySearches = [
      `${location} ${activity}`,
      ...expansion.expandedTerms.slice(0, 5).map(term => `${location} ${term}`),
      ...locationSpecific.slice(0, 3)
    ];

    // Fallback searches - broader terms
    const fallbackSearches = [
      ...expansion.searchStrategies.slice(0, 8),
      activity,
      ...expansion.keywords.slice(0, 5)
    ];

    return {
      primarySearches: [...new Set(primarySearches)].slice(0, 10),
      fallbackSearches: [...new Set(fallbackSearches)].slice(0, 10),
      locationSpecific: locationSpecific
    };
  }
}