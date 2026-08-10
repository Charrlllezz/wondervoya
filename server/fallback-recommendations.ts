/**
 * 🎣 Fallback Recommendations System
 * Provides high-quality alternatives when specific activities aren't available
 */

interface FallbackRecommendation {
  id: string;
  title: string;
  description: string;
  category: string;
  alternativeFor: string;
  location?: string;
  imageUrl?: string;
  estimatedPrice?: string;
  duration?: string;
  tags?: string[];
}

export class FallbackRecommendationsSystem {
  
  // High-quality fishing alternatives organized by location
  private fishingAlternatives: { [location: string]: FallbackRecommendation[] } = {
    'hawaii': [
      {
        id: 'hawaii-boat-tours',
        title: 'Ocean Boat Tours & Marine Wildlife',
        description: 'Explore Hawaiian waters on guided boat tours with opportunities to see marine life including dolphins, whales, and sea turtles. Many tours include fishing demonstrations.',
        category: 'Water Activities',
        alternativeFor: 'Fishing Charters',
        location: 'Hawaii',
        estimatedPrice: '$80-150',
        duration: '3-4 hours',
        tags: ['boats', 'ocean', 'marine-life', 'tours']
      },
      {
        id: 'hawaii-snorkel-adventures',
        title: 'Snorkeling & Underwater Adventures',
        description: 'Discover underwater marine life with guided snorkeling tours. Experience the ocean from a different perspective while learning about fish species and coral reefs.',
        category: 'Water Activities',
        alternativeFor: 'Fishing Charters',
        location: 'Hawaii',
        estimatedPrice: '$60-120',
        duration: '2-6 hours',
        tags: ['snorkeling', 'marine-life', 'underwater', 'adventure']
      }
    ],
    'florida': [
      {
        id: 'florida-boat-charters',
        title: 'Private Boat Charters & Water Sports',
        description: 'Charter a boat for water sports, wildlife viewing, and ocean exploration. Experience Florida waters with professional captains and modern equipment.',
        category: 'Water Activities',
        alternativeFor: 'Fishing Charters',
        location: 'Florida',
        estimatedPrice: '$200-400',
        duration: '4-8 hours',
        tags: ['boats', 'charters', 'water-sports', 'ocean']
      }
    ],
    'default': [
      {
        id: 'general-boat-tours',
        title: 'Boat Tours & Marine Experiences',
        description: 'Enjoy boat tours, marine wildlife viewing, and water-based adventures. Many tours offer fishing demonstrations and marine education.',
        category: 'Water Activities',
        alternativeFor: 'Fishing Charters',
        estimatedPrice: '$70-200',
        duration: '2-6 hours',
        tags: ['boats', 'marine', 'tours', 'water']
      }
    ]
  };

  /**
   * Generate fishing alternatives when no real fishing activities are found
   */
  generateFishingAlternatives(location: string): FallbackRecommendation[] {
    const normalizedLocation = location.toLowerCase();
    
    // Try exact location match first
    if (this.fishingAlternatives[normalizedLocation]) {
      return this.fishingAlternatives[normalizedLocation];
    }
    
    // Try partial matches
    const locationKeys = Object.keys(this.fishingAlternatives);
    const matchedKey = locationKeys.find(key => 
      normalizedLocation.includes(key) || key.includes(normalizedLocation)
    );
    
    if (matchedKey) {
      return this.fishingAlternatives[matchedKey];
    }
    
    // Return default alternatives
    return this.fishingAlternatives['default'];
  }

  /**
   * Convert fallback recommendations to standard activity format
   */
  convertToActivityFormat(fallbacks: FallbackRecommendation[]): any[] {
    return fallbacks.map(fallback => ({
      id: fallback.id,
      title: fallback.title,
      description: fallback.description,
      category: fallback.category,
      location: fallback.location,
      duration: fallback.duration,
      price: fallback.estimatedPrice ? {
        amount: parseInt(fallback.estimatedPrice.match(/\d+/)?.[0] || '100'),
        currency: 'USD'
      } : null,
      tags: fallback.tags || [],
      productCode: fallback.id,
      bookingUrl: '#',
      imageUrl: '/api/placeholder-image',
      isFallback: true,
      fallbackNote: `This is a recommended alternative for ${fallback.alternativeFor}`,
      relevanceScore: 0.95 // High score to ensure these appear prominently
    }));
  }

  /**
   * Main method to get fishing alternatives
   */
  getFishingAlternatives(location: string): any[] {
    console.log(`🔄 FALLBACK: Generating fishing alternatives for ${location}`);
    
    const fallbacks = this.generateFishingAlternatives(location);
    const activities = this.convertToActivityFormat(fallbacks);
    
    console.log(`✅ Generated ${activities.length} high-quality fishing alternatives`);
    activities.forEach((activity, index) => {
      console.log(`   ${index + 1}. ${activity.title}`);
    });
    
    return activities;
  }

  /**
   * Check if recommendations need fishing fallback enhancement
   */
  needsFishingFallback(recommendations: any[], isFishingRequest: boolean): boolean {
    if (!isFishingRequest) return false;
    
    const fishingActivityCount = recommendations.filter(r => 
      r.title.toLowerCase().includes('fish') ||
      r.title.toLowerCase().includes('charter') ||
      r.description?.toLowerCase().includes('fishing')
    ).length;
    
    return fishingActivityCount === 0;
  }

  /**
   * Enhance recommendations with fishing alternatives
   */
  enhanceWithFishingAlternatives(recommendations: any[], location: string): any[] {
    const alternatives = this.getFishingAlternatives(location);
    
    // Merge alternatives with existing recommendations
    // Put alternatives first, then existing water activities
    const waterActivities = recommendations.filter(r => 
      r.title.toLowerCase().includes('boat') ||
      r.title.toLowerCase().includes('cruise') ||
      r.title.toLowerCase().includes('snorkel') ||
      r.title.toLowerCase().includes('ocean') ||
      r.title.toLowerCase().includes('sea') ||
      r.title.toLowerCase().includes('marine')
    );
    
    const otherActivities = recommendations.filter(r => 
      !r.title.toLowerCase().includes('boat') &&
      !r.title.toLowerCase().includes('cruise') &&
      !r.title.toLowerCase().includes('snorkel') &&
      !r.title.toLowerCase().includes('ocean') &&
      !r.title.toLowerCase().includes('sea') &&
      !r.title.toLowerCase().includes('marine')
    );
    
    // Combine: alternatives + water activities + other activities
    const enhanced = [
      ...alternatives,
      ...waterActivities.slice(0, 3),
      ...otherActivities.slice(0, 1)
    ].slice(0, 6);
    
    console.log(`🎯 Enhanced recommendations: ${alternatives.length} alternatives + ${waterActivities.length} water activities`);
    
    return enhanced;
  }
}

export const fallbackSystem = new FallbackRecommendationsSystem();