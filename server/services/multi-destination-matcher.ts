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
  // Every ID below was checked directly against Viator's live /destinations
  // API. The previous version of this list included ~20 entirely fabricated
  // "sub-region" IDs (e.g. 999901-999987) that don't exist in Viator's
  // system at all, plus several IDs that exist but point to a completely
  // different real place than their label claimed — most seriously, Tokyo's
  // secondary ID (295) actually resolved to Tennessee, and Paris's
  // secondary IDs (684, 10) resolved to Las Vegas and Namibia. Those are
  // all removed here rather than corrected, since a single verified ID per
  // city is enough — the previous "related IDs" were an attempt to cover
  // sub-regions that, per Hawaii's fishing-charter case, weren't even
  // necessary (Viator's plain city-level ID already covers its sub-areas).
  private destinationGroups: DestinationGroup[] = [
    {
      location: 'Hawaii',
      primaryId: 278,
      keywords: ['hawaii', 'hawaiian', 'kona', 'kailua', 'maui', 'oahu', 'honolulu', 'waikiki', 'big island', 'kauai', 'molokai', 'lanai'],
      relatedIds: [
        // Verified directly against the Viator API: the plain "Hawaii" ID
        // (278) is what fishing-charter and other Hawaii-wide products are
        // actually tagged under, so it's searched first. The individual
        // islands are real, verified IDs (the previous version had Maui/
        // Oahu/Kauai's names rotated onto the wrong IDs). There's no
        // standalone "Kona" destination in Viator's data — Kona is part of
        // the Big Island, so kona-related search terms route there.
        { id: 278, name: 'Hawaii', priority: 11, searchTerms: ['hawaii', 'hawaiian'] },
        { id: 669, name: 'Big Island of Hawaii', priority: 9, searchTerms: ['big island', 'kona', 'kailua', 'kailua-kona', 'kailua kona'] },
        { id: 671, name: 'Maui', priority: 9, searchTerms: ['maui'] },
        { id: 672, name: 'Oahu', priority: 9, searchTerms: ['oahu', 'waikiki'] },
        { id: 670, name: 'Kauai', priority: 9, searchTerms: ['kauai'] },
        { id: 59070, name: 'Honolulu', priority: 9, searchTerms: ['honolulu'] },
      ]
    },
    {
      location: 'Berlin',
      primaryId: 488,
      keywords: ['berlin', 'germany', 'german', 'brandenburg', 'prussia'],
      relatedIds: [
        { id: 488, name: 'Berlin', priority: 10, searchTerms: ['berlin', 'germany', 'german'] },
      ]
    },
    {
      location: 'Paris',
      primaryId: 479,
      keywords: ['paris', 'france', 'french', 'ile-de-france', 'louvre', 'eiffel', 'seine'],
      relatedIds: [
        { id: 479, name: 'Paris', priority: 10, searchTerms: ['paris', 'france', 'french'] },
      ]
    },
    {
      location: 'London',
      primaryId: 737,
      keywords: ['london', 'england', 'uk', 'united kingdom', 'british', 'thames', 'westminster'],
      relatedIds: [
        { id: 737, name: 'London', priority: 10, searchTerms: ['london', 'england', 'uk', 'united kingdom'] },
      ]
    },
    {
      location: 'Barcelona',
      primaryId: 562,
      keywords: ['barcelona', 'spain', 'spanish', 'catalonia', 'catalunya', 'catalan'],
      relatedIds: [
        { id: 562, name: 'Barcelona', priority: 10, searchTerms: ['barcelona', 'spain', 'spanish'] },
      ]
    },
    {
      location: 'Tokyo',
      primaryId: 334,
      keywords: ['tokyo', 'japan', 'japanese', 'edo', 'kanto', 'shibuya', 'shinjuku'],
      relatedIds: [
        { id: 334, name: 'Tokyo', priority: 10, searchTerms: ['tokyo', 'japan', 'japanese'] },
      ]
    },
    {
      location: 'Rome',
      primaryId: 511,
      keywords: ['rome', 'italy', 'italian', 'roma', 'vatican', 'colosseum'],
      relatedIds: [
        { id: 511, name: 'Rome', priority: 10, searchTerms: ['rome', 'italy', 'italian'] },
      ]
    },
    {
      location: 'New York',
      primaryId: 687,
      keywords: ['new york', 'nyc', 'manhattan', 'brooklyn'],
      relatedIds: [
        { id: 687, name: 'New York City', priority: 10, searchTerms: ['new york', 'nyc', 'new york city'] },
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