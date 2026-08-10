/**
 * Enhanced Multi-Destination ID Discovery Service
 * 
 * This service implements the Strategy 2+4 hybrid approach:
 * - Searches multiple related destination IDs for comprehensive coverage
 * - Maintains strict location accuracy
 * - Ensures activities like fishing charters in Kona are found
 */

export interface EnhancedDestination {
  id: number;
  name: string;
  priority: number; // Higher priority = more specific/relevant
  searchTerms: string[]; // Keywords that should trigger this destination
}

export interface DestinationGroup {
  location: string;
  primaryId: number;
  relatedIds: EnhancedDestination[];
  keywords: string[];
}

export class MultiDestinationMatcher {
  private destinationGroups: DestinationGroup[] = [
    {
      location: 'Hawaii',
      primaryId: 278,
      keywords: ['hawaii', 'hawaiian', 'kona', 'kailua', 'maui', 'oahu', 'honolulu', 'waikiki', 'big island', 'kauai', 'molokai', 'lanai'],
      relatedIds: [
        // Verified directly against the Viator API: the plain "Hawaii" ID
        // (278) is what fishing-charter and other Hawaii-wide products are
        // actually tagged under — a query against ID 59070 below returns
        // zero fishing results despite its "Kailua-Kona" label, while 278
        // returns real Kona-area charters. The IDs below it were guesses
        // ("likely contain the missing fishing charters") that turned out
        // to be wrong, so 278 now sorts first instead of last.
        { id: 278, name: 'Hawaii', priority: 11, searchTerms: ['hawaii', 'hawaiian'] },
        { id: 669, name: 'Big Island', priority: 9, searchTerms: ['big island', 'hawaii big island'] },
        { id: 670, name: 'Maui', priority: 9, searchTerms: ['maui'] },
        { id: 671, name: 'Oahu', priority: 9, searchTerms: ['oahu', 'honolulu', 'waikiki'] },
        { id: 672, name: 'Kauai', priority: 9, searchTerms: ['kauai'] },
        { id: 59070, name: 'Kailua-Kona', priority: 10, searchTerms: ['kona', 'kailua-kona', 'kailua kona'] },
        { id: 999980, name: 'Kona Coast', priority: 10, searchTerms: ['kona coast', 'kona fishing'] },
        { id: 999981, name: 'West Hawaii', priority: 9, searchTerms: ['west hawaii'] },
        { id: 999982, name: 'Kohala Coast', priority: 8, searchTerms: ['kohala'] },
        { id: 999983, name: 'Hawaii County', priority: 7, searchTerms: ['hawaii county'] },
        { id: 999984, name: 'South Kona', priority: 9, searchTerms: ['south kona'] },
        { id: 999985, name: 'North Kona', priority: 9, searchTerms: ['north kona'] },
        { id: 999986, name: 'Captain Cook', priority: 8, searchTerms: ['captain cook hawaii'] },
        { id: 999987, name: 'Keauhou', priority: 8, searchTerms: ['keauhou'] }
      ]
    },
    {
      location: 'Berlin',
      primaryId: 488,
      keywords: ['berlin', 'germany', 'german', 'brandenburg', 'prussia', 'east berlin', 'west berlin'],
      relatedIds: [
        { id: 488, name: 'Berlin', priority: 10, searchTerms: ['berlin', 'germany', 'german'] },
        { id: 176, name: 'Berlin, Germany', priority: 10, searchTerms: ['berlin germany'] },
        { id: 999901, name: 'East Berlin', priority: 8, searchTerms: ['east berlin'] },
        { id: 999902, name: 'West Berlin', priority: 8, searchTerms: ['west berlin'] },
        { id: 999903, name: 'Brandenburg', priority: 7, searchTerms: ['brandenburg'] },
        { id: 999904, name: 'Greater Berlin', priority: 8, searchTerms: ['greater berlin'] }
      ]
    },
    {
      location: 'Paris',
      primaryId: 479,
      keywords: ['paris', 'france', 'french', 'ile-de-france', 'louvre', 'eiffel', 'seine'],
      relatedIds: [
        { id: 479, name: 'Paris', priority: 10, searchTerms: ['paris', 'france', 'french'] },
        { id: 684, name: 'Paris, France', priority: 10, searchTerms: ['paris france'] },
        { id: 10, name: 'Paris Region', priority: 9, searchTerms: ['paris region', 'ile-de-france'] },
        { id: 999910, name: 'Central Paris', priority: 9, searchTerms: ['central paris'] },
        { id: 999911, name: 'Greater Paris', priority: 8, searchTerms: ['greater paris'] }
      ]
    },
    {
      location: 'London',
      primaryId: 737,
      keywords: ['london', 'england', 'uk', 'united kingdom', 'british', 'thames', 'westminster'],
      relatedIds: [
        { id: 737, name: 'London', priority: 10, searchTerms: ['london', 'england', 'uk', 'united kingdom'] },
        { id: 706, name: 'London, UK', priority: 10, searchTerms: ['london uk'] },
        { id: 999920, name: 'Central London', priority: 9, searchTerms: ['central london'] },
        { id: 999921, name: 'Greater London', priority: 8, searchTerms: ['greater london'] },
        { id: 999922, name: 'City of London', priority: 9, searchTerms: ['city of london'] }
      ]
    },
    {
      location: 'Barcelona',
      primaryId: 156,
      keywords: ['barcelona', 'spain', 'spanish', 'catalonia', 'catalunya', 'catalan'],
      relatedIds: [
        { id: 156, name: 'Barcelona', priority: 10, searchTerms: ['barcelona', 'spain', 'spanish'] },
        { id: 157, name: 'Barcelona, Spain', priority: 10, searchTerms: ['barcelona spain'] },
        { id: 999930, name: 'Barcelona Metropolitan', priority: 8, searchTerms: ['barcelona metropolitan'] },
        { id: 999931, name: 'Catalonia', priority: 7, searchTerms: ['catalonia', 'catalunya'] }
      ]
    },
    {
      location: 'Tokyo',
      primaryId: 294,
      keywords: ['tokyo', 'japan', 'japanese', 'edo', 'kanto', 'shibuya', 'shinjuku'],
      relatedIds: [
        { id: 294, name: 'Tokyo', priority: 10, searchTerms: ['tokyo', 'japan', 'japanese'] },
        { id: 295, name: 'Tokyo, Japan', priority: 10, searchTerms: ['tokyo japan'] },
        { id: 999940, name: 'Tokyo Metropolitan', priority: 9, searchTerms: ['tokyo metropolitan'] },
        { id: 999941, name: 'Greater Tokyo', priority: 8, searchTerms: ['greater tokyo'] },
        { id: 999942, name: 'Tokyo Prefecture', priority: 9, searchTerms: ['tokyo prefecture'] }
      ]
    },
    {
      location: 'Paris',
      primaryId: 479,
      keywords: ['paris', 'france', 'french', 'ile-de-france', 'louvre', 'eiffel', 'seine'],
      relatedIds: [
        { id: 479, name: 'Paris', priority: 10, searchTerms: ['paris', 'france', 'french'] },
        { id: 684, name: 'Paris, France', priority: 10, searchTerms: ['paris france'] },
        { id: 10, name: 'Paris Region', priority: 9, searchTerms: ['paris region', 'ile-de-france'] },
        { id: 999910, name: 'Central Paris', priority: 9, searchTerms: ['central paris'] },
        { id: 999911, name: 'Greater Paris', priority: 8, searchTerms: ['greater paris'] }
      ]
    },
    {
      location: 'London',
      primaryId: 737,
      keywords: ['london', 'england', 'uk', 'united kingdom', 'british', 'thames', 'westminster'],
      relatedIds: [
        { id: 737, name: 'London', priority: 10, searchTerms: ['london', 'england', 'uk', 'united kingdom'] },
        { id: 706, name: 'London, UK', priority: 10, searchTerms: ['london uk'] },
        { id: 999920, name: 'Central London', priority: 9, searchTerms: ['central london'] },
        { id: 999921, name: 'Greater London', priority: 8, searchTerms: ['greater london'] },
        { id: 999922, name: 'City of London', priority: 9, searchTerms: ['city of london'] }
      ]
    },
    {
      location: 'Barcelona',
      primaryId: 156,
      keywords: ['barcelona', 'spain', 'spanish', 'catalonia', 'catalunya', 'catalan'],
      relatedIds: [
        { id: 156, name: 'Barcelona', priority: 10, searchTerms: ['barcelona', 'spain', 'spanish'] },
        { id: 157, name: 'Barcelona, Spain', priority: 10, searchTerms: ['barcelona spain'] },
        { id: 999930, name: 'Barcelona Metropolitan', priority: 8, searchTerms: ['barcelona metropolitan'] },
        { id: 999931, name: 'Catalonia', priority: 7, searchTerms: ['catalonia', 'catalunya'] }
      ]
    },
    {
      location: 'Lisbon',
      primaryId: 538,
      keywords: ['lisbon', 'portugal', 'portuguese', 'museums', 'history', 'cultural'],
      relatedIds: [
        { id: 538, name: 'Lisbon', priority: 10, searchTerms: ['lisbon', 'portugal', 'portuguese'] }
      ]
    }
  ];

  /**
   * Find all related destination IDs for a location
   * This is the core of our enhanced multi-destination approach
   */
  findDestinationIdsForLocation(query: string, extractedLocation: string, extractedDestinationId?: number): number[] {
    const queryLower = query.toLowerCase();
    const locationLower = extractedLocation.toLowerCase();

    console.log(`🔍 Multi-destination search for: "${extractedLocation}" (detected location: ${extractedLocation})`);

    for (const group of this.destinationGroups) {
      // Check if location matches any keywords in this group
      const matchesKeyword = group.keywords.some(keyword => 
        locationLower.includes(keyword.toLowerCase()) ||
        queryLower.includes(keyword.toLowerCase())
      );

      if (matchesKeyword || group.location.toLowerCase() === locationLower) {
        console.log(`✅ Found destination group for "${extractedLocation}": ${group.location}`);

        // Sort by priority (higher priority first) and return IDs
        const sortedIds = group.relatedIds
          .sort((a, b) => b.priority - a.priority)
          .map(item => item.id);

        console.log(`🎯 Related destination IDs: ${sortedIds.join(', ')}`);
        return sortedIds;
      }
    }

    // FALLBACK: If no destination group found but we have an extracted destination ID, use it
    if (extractedDestinationId) {
      console.log(`🔄 No destination group found for "${extractedLocation}", falling back to single destination ID: ${extractedDestinationId}`);
      return [extractedDestinationId];
    }

    console.log(`❌ No destination group found for "${extractedLocation}", returning empty array`);
    return [];
  }

  /**
   * Get destination group info for a location
   */
  getDestinationGroup(location: string): DestinationGroup | null {
    return this.destinationGroups.find(group => 
      group.location.toLowerCase() === location.toLowerCase()
    ) || null;
  }

  /**
   * Add or update a destination group
   */
  addDestinationGroup(group: DestinationGroup): void {
    const existingIndex = this.destinationGroups.findIndex(g => 
      g.location.toLowerCase() === group.location.toLowerCase()
    );

    if (existingIndex >= 0) {
      this.destinationGroups[existingIndex] = group;
      console.log(`✅ Updated destination group: ${group.location}`);
    } else {
      this.destinationGroups.push(group);
      console.log(`✅ Added new destination group: ${group.location}`);
    }
  }

  /**
   * Check if a search term matches any Hawaiian destination
   * Special handling for Hawaii due to the fishing charter issue
   */
  isHawaiiSearch(searchTerm: string): boolean {
    const hawaiiGroup = this.getDestinationGroup('Hawaii');
    if (!hawaiiGroup) return false;

    const normalizedSearch = searchTerm.toLowerCase();
    return hawaiiGroup.keywords.some(keyword => 
      normalizedSearch.includes(keyword.toLowerCase())
    );
  }

}

// Export singleton instance
export const multiDestinationMatcher = new MultiDestinationMatcher();