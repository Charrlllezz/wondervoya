/**
 * AI-Informed Activity Search Engine
 * 
 * This service extracts specific venues and attractions from AI responses
 * and performs targeted searches to find activities that directly match
 * the AI's recommendations, bridging the gap between AI intelligence
 * and activity relevance.
 */

import { viatorService } from './viator';
import { smartDestinationMatcher } from './smart-destination-matcher';
import { googlePlacesService } from './google-places-service';

interface ActivityWithSource {
  source: 'viator' | 'google-places';
  originalData?: any;
  title: string;
  description?: string;
  price?: string;
  rating: number;
  reviewCount: number;
  imageUrl?: string;
  duration?: string;
  location?: string;
  bookingUrl?: string;
  productCode?: string;
  tags?: string[];
}

export interface AIExtractedVenue {
  name: string;
  type: 'museum' | 'attraction' | 'district' | 'landmark' | 'cultural_site' | 'unknown';
  searchTerms: string[];
  confidence: number;
}

export interface AIInformedSearchResult {
  venues: AIExtractedVenue[];
  activities: any[];
  strategy: string;
  confidence: number;
  matchAccuracy: number;
}

export class AIInformedSearchEngine {
  /**
   * Extract specific venues and attractions from AI response text
   */
  static extractVenuesFromAIResponse(aiResponse: string): AIExtractedVenue[] {
    console.log(`🧠 AI VENUE EXTRACTION: Analyzing AI response for specific recommendations`);
    
    const venues: AIExtractedVenue[] = [];
    const lines = aiResponse.split('\n');
    
    // Define venue extraction patterns with high confidence indicators
    const venuePatterns = [
      // Museums - explicit mentions
      {
        regex: /(?:museo?|museum)\s+([^(]+?)(?:\s*\([^)]+\))?/gi,
        type: 'museum' as const,
        confidence: 0.9
      },
      // Specific landmark/building patterns
      {
        regex: /([A-Z][a-z]+\s+(?:Cathedral|Basilica|Church|Palace|Castle|Tower|Gallery|Center|Centre))/gi,
        type: 'landmark' as const,
        confidence: 0.85
      },
      // Districts and quarters
      {
        regex: /([A-Z][a-z]+\s+(?:Quarter|District|Neighborhood|Area|Barrio))/gi,
        type: 'district' as const,
        confidence: 0.8
      },
      // Cultural sites with specific patterns
      {
        regex: /(?:visit|see|explore)\s+([A-Z][a-z\s]+(?:Museum|Gallery|Center|Centre|Palace|Cathedral))/gi,
        type: 'cultural_site' as const,
        confidence: 0.75
      }
    ];

    // Extract venues using patterns
    for (const pattern of venuePatterns) {
      let match;
      while ((match = pattern.regex.exec(aiResponse)) !== null) {
        const venueName = match[1].trim();
        
        if (venueName.length > 3 && venueName.length < 50) {
          const venue: AIExtractedVenue = {
            name: venueName,
            type: pattern.type,
            searchTerms: this.generateSearchTerms(venueName, pattern.type),
            confidence: pattern.confidence
          };
          venues.push(venue);
        }
      }
    }

    // Extract from bullet points and specific recommendations
    for (const line of lines) {
      if (line.trim().startsWith('- ') || line.trim().startsWith('• ')) {
        const recommendation = line.replace(/^[-•]\s*/, '').trim();
        
        // Look for specific venue mentions in recommendations
        const venueMatch = recommendation.match(/^([^(]+?)(?:\s*\([^)]+\))?/);
        if (venueMatch) {
          const venueName = venueMatch[1].trim();
          
          if (venueName.length > 3 && venueName.length < 50) {
            const venue: AIExtractedVenue = {
              name: venueName,
              type: this.classifyVenueType(venueName),
              searchTerms: this.generateSearchTerms(venueName, this.classifyVenueType(venueName)),
              confidence: 0.8
            };
            venues.push(venue);
          }
        }
      }
    }

    // Remove duplicates and sort by confidence
    const uniqueVenues = venues.filter((venue, index, self) => 
      index === self.findIndex(v => v.name.toLowerCase() === venue.name.toLowerCase())
    ).sort((a, b) => b.confidence - a.confidence);

    console.log(`🎯 EXTRACTED VENUES: Found ${uniqueVenues.length} specific venues from AI response`);
    uniqueVenues.forEach(venue => {
      console.log(`  📍 ${venue.name} (${venue.type}, confidence: ${venue.confidence})`);
    });

    return uniqueVenues.slice(0, 6); // Limit to top 6 most confident venues
  }

  /**
   * Classify venue type based on name patterns
   */
  private static classifyVenueType(venueName: string): AIExtractedVenue['type'] {
    const name = venueName.toLowerCase();
    
    if (name.includes('museum') || name.includes('museo')) return 'museum';
    if (name.includes('gallery') || name.includes('galeria')) return 'museum';
    if (name.includes('cathedral') || name.includes('basilica') || name.includes('church')) return 'landmark';
    if (name.includes('palace') || name.includes('castle') || name.includes('tower')) return 'landmark';
    if (name.includes('quarter') || name.includes('district') || name.includes('barrio')) return 'district';
    if (name.includes('center') || name.includes('centre')) return 'cultural_site';
    
    return 'attraction';
  }

  /**
   * Generate targeted search terms for each venue
   */
  private static generateSearchTerms(venueName: string, type: AIExtractedVenue['type']): string[] {
    const baseTerms = [
      venueName, // Exact name
      `${venueName} tour`,
      `${venueName} visit`,
      `${venueName} ticket`
    ];

    // Add type-specific search terms
    switch (type) {
      case 'museum':
        baseTerms.push(
          `${venueName} museum`,
          `${venueName} exhibition`,
          `${venueName} guided tour`
        );
        break;
      case 'landmark':
        baseTerms.push(
          `${venueName} tour`,
          `${venueName} visit`,
          `${venueName} architecture`
        );
        break;
      case 'district':
        baseTerms.push(
          `${venueName} walking tour`,
          `${venueName} neighborhood`,
          `${venueName} area tour`
        );
        break;
      case 'cultural_site':
        baseTerms.push(
          `${venueName} cultural`,
          `${venueName} heritage`,
          `${venueName} historical`
        );
        break;
    }

    return Array.from(new Set(baseTerms)); // Remove duplicates
  }

  /**
   * Perform hybrid AI-informed search using both Viator tours and Google Places venues
   */
  static async searchByAIRecommendations(
    aiResponse: string,
    destinationId: number,
    destinationName: string,
    currency: string = 'USD',
    maxResults: number = 10
  ): Promise<AIInformedSearchResult> {
    console.log(`🎯 AI-INFORMED SEARCH: Starting venue-specific search in ${destinationName}`);

    try {
      // Extract venues from AI response
      const extractedVenues = this.extractVenuesFromAIResponse(aiResponse);
      
      if (extractedVenues.length === 0) {
        console.log(`⚠️ No venues extracted from AI response, falling back to generic search`);
        return {
          venues: [],
          activities: [],
          strategy: 'ai_informed_fallback',
          confidence: 0,
          matchAccuracy: 0
        };
      }

      // HYBRID SEARCH: Get both Viator tours AND Google Places venues
      const allActivities: any[] = [];
      const searchPromises: Promise<any[]>[] = [];

      // 1. Viator tour searches (existing logic)
      for (const venue of extractedVenues.slice(0, 4)) { // Limit to top 4 venues
        for (const searchTerm of venue.searchTerms.slice(0, 3)) { // Top 3 search terms per venue
          const searchPromise = this.performVenueSpecificSearch(
            searchTerm, 
            destinationId, 
            destinationName,
            currency,
            venue
          );
          searchPromises.push(searchPromise);
        }
      }

      // 2. Google Places venue searches (new hybrid functionality)
      if (googlePlacesService.isAvailable()) {
        console.log(`🏛️ GOOGLE PLACES: Service is available, extracting venues from AI response`);
        const googleVenueNames = googlePlacesService.extractVenueNames(aiResponse);
        console.log(`🎯 GOOGLE PLACES: Extracted ${googleVenueNames.length} venue names: ${googleVenueNames.join(', ')}`);
        
        for (const venueName of googleVenueNames) {
          console.log(`🏛️ GOOGLE PLACES: Searching for venue "${venueName}" in ${destinationName}`);
          const googleSearchPromise = googlePlacesService.searchVenues(venueName, destinationName);
          searchPromises.push(googleSearchPromise);
        }
      } else {
        console.log(`🚫 GOOGLE PLACES: Service not available or rate limited`);
        const usageStats = googlePlacesService.getUsageStats();
        console.log(`📊 GOOGLE PLACES USAGE: ${usageStats.requests}/${usageStats.limit} requests used`);
      }

      // Execute all searches in parallel
      const searchResults = await Promise.allSettled(searchPromises);
      
      searchResults.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value.length > 0) {
          console.log(`✅ Hybrid search ${index + 1}: ${result.value.length} activities/venues found`);
          allActivities.push(...result.value);
        } else if (result.status === 'rejected') {
          console.log(`❌ Hybrid search ${index + 1} failed:`, result.reason);
        }
      });

      // Remove duplicates and rank by AI-venue matching
      const uniqueActivities = this.deduplicateAndRankActivities(allActivities, extractedVenues);
      
      console.log(`🎯 HYBRID AI-INFORMED SEARCH COMPLETE: ${uniqueActivities.length} venue-matched activities found`);

      return {
        venues: extractedVenues,
        activities: uniqueActivities.slice(0, maxResults),
        strategy: 'ai_informed_venue_search',
        confidence: this.calculateOverallConfidence(extractedVenues, uniqueActivities),
        matchAccuracy: this.calculateMatchAccuracy(uniqueActivities, extractedVenues)
      };

    } catch (error) {
      console.error('AI-informed search failed:', error);
      return {
        venues: [],
        activities: [],
        strategy: 'ai_informed_error',
        confidence: 0,
        matchAccuracy: 0
      };
    }
  }

  /**
   * Perform venue-specific search using Viator API
   */
  private static async performVenueSpecificSearch(
    searchTerm: string,
    destinationId: number,
    destinationName: string,
    currency: string,
    venue: AIExtractedVenue
  ): Promise<any[]> {
    try {
      console.log(`🔍 VENUE SEARCH: "${searchTerm}" for ${venue.name} in ${destinationName}`);

      // Try products/search first (more precise destination filtering)
      const response = await viatorService.axiosInstance.post('/products/search', {
        searchTerms: [{
          searchTerm: searchTerm,
          match: "FUZZY"
        }],
        filtering: {
          destination: destinationId
        },
        sort: "TRAVELER_RATING",
        order: "DESCENDING",
        pagination: {
          start: 1,
          count: 10
        },
        currency: currency
      });

      const activities = response.data?.products?.results || response.data?.products || [];
      console.log(`📊 VENUE SEARCH RESULT: "${searchTerm}" returned ${activities.length} activities`);

      // Add venue matching metadata
      activities.forEach((activity: any) => {
        activity._aiVenue = venue.name;
        activity._aiVenueType = venue.type;
        activity._aiConfidence = venue.confidence;
        activity._searchTerm = searchTerm;
      });

      return activities;

    } catch (error) {
      console.log(`❌ Venue search failed for "${searchTerm}":`, error instanceof Error ? error.message : 'Unknown error');
      return [];
    }
  }

  /**
   * Smart deduplication prioritizing Viator as primary source, Google Places as backup
   */
  private static deduplicateAndRankActivities(activities: any[], venues: AIExtractedVenue[]): any[] {
    console.log(`🔄 VIATOR-FIRST DEDUPLICATION: Processing ${activities.length} activities from Viator + Google Places`);
    
    // Separate Viator and Google Places activities
    const viatorActivities = activities.filter(a => !a.tags?.includes('google-places'));
    const googleActivities = activities.filter(a => a.tags?.includes('google-places'));
    
    console.log(`📊 PRIORITIZATION: ${viatorActivities.length} Viator activities (PRIMARY), ${googleActivities.length} Google Places venues (BACKUP)`);
    
    // Remove simple duplicates within each source
    const uniqueViatorActivities = viatorActivities.filter((activity, index, self) => 
      index === self.findIndex(a => a.productCode === activity.productCode)
    );
    
    const uniqueGoogleActivities = googleActivities.filter((activity, index, self) => 
      index === self.findIndex(a => a.title === activity.title)
    );
    
    // PRIORITIZATION LOGIC: Viator first, Google Places as backup only
    const finalActivities: any[] = [];
    const usedGoogleIndices = new Set<number>();
    
    // Step 1: Add all Viator activities first (they take priority)
    uniqueViatorActivities.forEach(viatorActivity => {
      // Score the Viator activity
      viatorActivity._aiMatchingScore = this.calculateVenueMatchingScore(viatorActivity, venues);
      viatorActivity._source = 'viator';
      finalActivities.push(viatorActivity);
      
      // Mark any similar Google Places activities as used (prevent duplicates)
      uniqueGoogleActivities.forEach((googleActivity, index) => {
        if (usedGoogleIndices.has(index)) return;
        
        const similarity = this.calculateVenueSimilarity(viatorActivity, googleActivity);
        if (similarity > 0.7) { // Higher threshold for similarity (70%) to avoid false positives
          usedGoogleIndices.add(index);
          console.log(`🚫 SKIPPING Google Places "${googleActivity.title}" - similar to Viator "${viatorActivity.title}" (${(similarity * 100).toFixed(1)}% similarity)`);
        }
      });
    });
    
    // Step 2: Add Google Places venues only as backup when insufficient Viator results
    const MINIMUM_ACTIVITY_THRESHOLD = 3; // Minimum activities desired
    const remainingSlots = Math.max(0, MINIMUM_ACTIVITY_THRESHOLD - finalActivities.length);
    
    if (remainingSlots > 0) {
      console.log(`🔄 BACKUP STRATEGY: Adding ${remainingSlots} Google Places venues to supplement ${finalActivities.length} Viator activities`);
      
      // Add unmatched Google Places venues as backup
      const backupGoogleActivities = uniqueGoogleActivities
        .filter((_, index) => !usedGoogleIndices.has(index))
        .slice(0, remainingSlots);
      
      backupGoogleActivities.forEach(googleActivity => {
        googleActivity._aiMatchingScore = this.calculateVenueMatchingScore(googleActivity, venues);
        googleActivity._source = 'google-places-backup';
        finalActivities.push(googleActivity);
      });
      
      console.log(`📋 BACKUP ADDED: ${backupGoogleActivities.length} Google Places venues added as backup`);
    } else {
      console.log(`✅ SUFFICIENT VIATOR RESULTS: ${finalActivities.length} Viator activities found, no backup needed`);
    }

    // Sort by source priority first (Viator > Google Places), then by AI matching score
    const sortedActivities = finalActivities.sort((a, b) => {
      // Viator activities always come first
      if (a._source === 'viator' && b._source !== 'viator') return -1;
      if (b._source === 'viator' && a._source !== 'viator') return 1;
      
      // Within same source, sort by AI matching score
      return (b._aiMatchingScore || 0) - (a._aiMatchingScore || 0);
    });
    
    console.log(`✅ VIATOR-FIRST RANKING COMPLETE: ${sortedActivities.length} activities (${uniqueViatorActivities.length} Viator + ${sortedActivities.length - uniqueViatorActivities.length} Google backup)`);
    return sortedActivities;
  }
  
  /**
   * Merge related activities from Viator and Google Places that refer to the same venue
   */
  private static mergeRelatedActivities(
    viatorActivities: any[], 
    googleActivities: any[], 
    venues: AIExtractedVenue[]
  ): any[] {
    const mergedActivities: any[] = [];
    const usedGoogleIndices = new Set<number>();
    
    console.log(`🔗 VENUE MATCHING: Looking for related Viator tours and Google Places venues`);
    
    // Process each Viator activity and look for related Google Places venues
    for (const viatorActivity of viatorActivities) {
      const relatedGoogleActivities: any[] = [];
      
      // Find Google Places venues that likely refer to the same location
      googleActivities.forEach((googleActivity, index) => {
        if (usedGoogleIndices.has(index)) return;
        
        const similarity = this.calculateVenueSimilarity(viatorActivity, googleActivity);
        if (similarity > 0.6) { // 60% similarity threshold
          relatedGoogleActivities.push({ activity: googleActivity, similarity, index });
        }
      });
      
      if (relatedGoogleActivities.length > 0) {
        // Sort by similarity and take the best match
        const bestMatch = relatedGoogleActivities.sort((a, b) => b.similarity - a.similarity)[0];
        const mergedActivity = this.createMergedActivity(viatorActivity, bestMatch.activity);
        mergedActivities.push(mergedActivity);
        usedGoogleIndices.add(bestMatch.index);
        
        console.log(`🎯 VENUE MERGE: "${viatorActivity.title}" + "${bestMatch.activity.title}" (similarity: ${(bestMatch.similarity * 100).toFixed(1)}%)`);
      } else {
        // No related Google venue found, keep Viator activity as-is
        mergedActivities.push(viatorActivity);
      }
    }
    
    // Add remaining unmatched Google Places venues
    googleActivities.forEach((googleActivity, index) => {
      if (!usedGoogleIndices.has(index)) {
        mergedActivities.push(googleActivity);
      }
    });
    
    return mergedActivities;
  }
  
  /**
   * Calculate similarity between a Viator activity and Google Places venue
   */
  private static calculateVenueSimilarity(viatorActivity: any, googleActivity: any): number {
    const viatorTitle = (viatorActivity.title || '').toLowerCase();
    const googleTitle = (googleActivity.title || '').toLowerCase();
    
    const viatorDesc = (viatorActivity.shortDescription || viatorActivity.description || '').toLowerCase();
    const googleDesc = (googleActivity.description || '').toLowerCase();
    
    let similarity = 0;
    
    // 1. Title similarity (40% weight)
    const titleSimilarity = this.calculateStringSimilarity(viatorTitle, googleTitle);
    similarity += titleSimilarity * 0.4;
    
    // 2. Shared venue name keywords (35% weight)
    const venueKeywords = this.extractVenueKeywords(viatorTitle + ' ' + viatorDesc);
    const googleKeywords = this.extractVenueKeywords(googleTitle + ' ' + googleDesc);
    
    const sharedKeywords = venueKeywords.filter(keyword => googleKeywords.includes(keyword));
    const keywordSimilarity = sharedKeywords.length > 0 ? 
      (sharedKeywords.length * 2) / (venueKeywords.length + googleKeywords.length) : 0;
    similarity += keywordSimilarity * 0.35;
    
    // 3. Location/venue type similarity (25% weight)
    const locationSimilarity = this.calculateLocationSimilarity(viatorActivity, googleActivity);
    similarity += locationSimilarity * 0.25;
    
    return Math.min(1.0, similarity);
  }
  
  /**
   * Extract venue-specific keywords from text
   */
  private static extractVenueKeywords(text: string): string[] {
    const keywords: string[] = [];
    const venuePatterns = [
      /(casa|palau|palace|house|villa)\s+([a-z\u00e0-\u017f]+)/gi,
      /(museum|museo|gallery|galeria|foundation|center|centre)\s*([a-z\u00e0-\u017f]*)/gi,
      /(park|plaza|square|market|cathedral|basilica|church|tower|monument)\s+([a-z\u00e0-\u017f]*)/gi,
      /([a-z\u00e0-\u017f]+)\s+(museum|gallery|palace|cathedral|church|tower|monument)/gi,
      /(sagrada\s+familia|park\s+g[uü]ell|casa\s+batll[oó]|casa\s+mil[aà]|la\s+pedrera)/gi
    ];
    
    for (const pattern of venuePatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const keyword = match[0].trim().toLowerCase();
        if (keyword.length > 3 && !keywords.includes(keyword)) {
          keywords.push(keyword);
        }
      }
    }
    
    return keywords;
  }
  
  /**
   * Calculate string similarity using word overlap
   */
  private static calculateStringSimilarity(str1: string, str2: string): number {
    const words1 = str1.split(/\s+/).filter(w => w.length > 2);
    const words2 = str2.split(/\s+/).filter(w => w.length > 2);
    
    if (words1.length === 0 || words2.length === 0) return 0;
    
    const sharedWords = words1.filter(word => words2.includes(word));
    return (sharedWords.length * 2) / (words1.length + words2.length);
  }
  
  /**
   * Calculate location similarity between activities
   */
  private static calculateLocationSimilarity(viatorActivity: any, googleActivity: any): number {
    // For now, assume they're in the same general area if they matched venue patterns
    // This could be enhanced with actual location coordinate comparison if available
    return 0.5; // Base similarity for being in the same destination
  }
  
  /**
   * Create a merged activity that combines the best information from both sources
   */
  private static createMergedActivity(viatorActivity: any, googleActivity: any): any {
    const merged = { ...viatorActivity }; // Start with Viator as base
    
    // Enhance with Google Places information where it's better
    if (googleActivity.rating > merged.rating && googleActivity.reviewCount > 20) {
      merged.rating = googleActivity.rating;
      merged.reviewCount = googleActivity.reviewCount;
      merged._enhancedByGoogle = true;
    }
    
    // Add Google Places venue info as additional context
    if (googleActivity.location && !merged.location) {
      merged.location = googleActivity.location;
    }
    
    // Combine tags to show both sources
    merged.tags = [...(merged.tags || []), 'hybrid-result', 'enhanced-venue-info'];
    
    // Store Google Places info for reference
    merged._googlePlacesVenue = {
      title: googleActivity.title,
      rating: googleActivity.rating,
      reviewCount: googleActivity.reviewCount,
      location: googleActivity.location,
      bookingUrl: googleActivity.bookingUrl
    };
    
    console.log(`🔄 MERGE CREATED: Enhanced "${merged.title}" with Google Places venue data`);
    
    return merged;
  }

  /**
   * Calculate how well an activity matches the AI's venue recommendations
   * Enhanced for hybrid Viator + Google Places results
   */
  private static calculateVenueMatchingScore(activity: any, venues: AIExtractedVenue[]): number {
    const title = (activity.title || '').toLowerCase();
    const description = (activity.shortDescription || activity.description || '').toLowerCase();
    const content = `${title} ${description}`;
    
    let maxScore = 0;

    for (const venue of venues) {
      let venueScore = 0;
      const venueName = venue.name.toLowerCase();
      
      // Exact venue name match (highest score)
      if (content.includes(venueName)) {
        venueScore += 100 * venue.confidence;
      }

      // Partial venue name matches
      const venueWords = venueName.split(' ').filter(word => word.length > 3);
      let partialMatches = 0;
      for (const word of venueWords) {
        if (content.includes(word)) {
          partialMatches++;
        }
      }
      
      if (venueWords.length > 0) {
        venueScore += (partialMatches / venueWords.length) * 50 * venue.confidence;
      }

      // Type-specific bonuses
      switch (venue.type) {
        case 'museum':
          if (content.includes('museum') || content.includes('exhibition') || content.includes('gallery')) {
            venueScore += 25 * venue.confidence;
          }
          break;
        case 'landmark':
          if (content.includes('tour') || content.includes('visit') || content.includes('ticket')) {
            venueScore += 20 * venue.confidence;
          }
          break;
        case 'district':
          if (content.includes('walking') || content.includes('neighborhood') || content.includes('area')) {
            venueScore += 15 * venue.confidence;
          }
          break;
      }
      
      // Bonus for hybrid results (Viator + Google Places merged)
      if (activity.tags?.includes('hybrid-result')) {
        venueScore += 10; // Small bonus for comprehensive venue information
      }
      
      // Bonus for Google Places direct venues
      if (activity.tags?.includes('google-places')) {
        venueScore += 5; // Small bonus for direct venue access
      }
      
      maxScore = Math.max(maxScore, venueScore);
    }
    
    return maxScore;
  }
  
  /**
   * Calculate overall confidence of the AI-informed search
   * Enhanced to account for hybrid results
   */
  private static calculateOverallConfidence(venues: AIExtractedVenue[], activities: any[]): number {
    if (venues.length === 0 || activities.length === 0) return 0;

    const avgVenueConfidence = venues.reduce((sum, venue) => sum + venue.confidence, 0) / venues.length;
    const activitiesWithMatches = activities.filter(a => (a._aiMatchingScore || 0) > 10).length;
    const matchRatio = activitiesWithMatches / activities.length;
    
    // Bonus for hybrid results
    const hybridResults = activities.filter(a => a.tags?.includes('hybrid-result')).length;
    const hybridBonus = hybridResults > 0 ? Math.min(10, hybridResults * 2) : 0;

    return Math.min(95, avgVenueConfidence * 70 + matchRatio * 30 + hybridBonus);
  }
  
  /**
   * Calculate how accurately activities match AI recommendations
   * Enhanced for hybrid search results
   */
  private static calculateMatchAccuracy(activities: any[], venues: AIExtractedVenue[]): number {
    if (activities.length === 0 || venues.length === 0) return 0;

    const highQualityMatches = activities.filter(a => (a._aiMatchingScore || 0) > 50).length;
    const hybridMatches = activities.filter(a => a.tags?.includes('hybrid-result')).length;
    
    // Enhanced accuracy calculation considering hybrid results
    const baseAccuracy = (highQualityMatches / Math.min(activities.length, venues.length)) * 100;
    const hybridBonus = hybridMatches > 0 ? Math.min(15, hybridMatches * 3) : 0;
    
    return Math.min(100, baseAccuracy + hybridBonus);
  }
}

export const aiInformedSearchEngine = AIInformedSearchEngine;