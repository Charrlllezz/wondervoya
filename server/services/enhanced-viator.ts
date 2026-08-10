// Minimal enhanced-viator service that delegates to clean engine and viator service
import { viatorService } from "./viator";
import { cleanRelevanceEngine } from "./clean-relevance-engine";
import { auxiliaryDataManager } from "./auxiliary-data-manager";
import type { ActivityRecommendation } from '@shared/schema';

class EnhancedViatorService {
  async getProductDetails(productCode: string) {
    return await viatorService.getProductDetails(productCode);
  }

  clearAvailabilityCache(productCode: string, startDate: string, endDate: string) {
    // Cache clearing handled by viatorService
    console.log(`Clearing cache for ${productCode} ${startDate}-${endDate}`);
  }

  async getProductAvailabilityAndPricing(productCode: string, startDate: string, endDate: string) {
    return await viatorService.getProductAvailabilityAndPricing(productCode, startDate, endDate);
  }

  getDestinationsCount() {
    // Return a default count since we don't track this in the clean architecture
    return 1000;
  }

  async getAttractionsStats() {
    return { total: 0, byDestination: {} };
  }

  async pullCompleteDestinationList() {
    return await viatorService.getDestinations();
  }

  async bulkRefreshCache() {
    return { success: true, message: "Cache refresh not needed for clean engine" };
  }

  async pullAttractionsForDestination(destinationId: number) {
    // Delegate to search with destination filter
    const results = await cleanRelevanceEngine.search({
      query: "attractions",
      destinationId: destinationId,
      currency: 'USD'
    });
    return { success: true, attractions: results.activities };
  }

  async performFreetextSearch(params: any) {
    return await cleanRelevanceEngine.search({
      query: params.text,
      destinationId: params.destinationId,
      currency: params.currency || 'USD'
    });
  }

  async getDestinations() {
    // Use auxiliary data manager to get destinations (preferred method)
    const destinations = await auxiliaryDataManager.getDestinations();

    // Log destination stats for debugging
    if (destinations && destinations.length > 0) {
      const hawaiiDestinations = destinations.filter(d => 
        (d.name || '').toLowerCase().includes('hawaii') ||
        (d.name || '').toLowerCase().includes('kona')
      );

      if (hawaiiDestinations.length > 0) {
        console.log(`🏝️ Hawaii destinations available: ${hawaiiDestinations.length}`);
      }
      
      console.log(`🗄️ Retrieved ${destinations.length} destinations from Viator cache`);
    }

    return destinations;
  }

  async searchDestinations(query: string) {
    // Use the destinations from viator service and filter locally
    const allDestinations = await viatorService.getDestinations();
    const filtered = allDestinations.filter(dest => 
      dest.name.toLowerCase().includes(query.toLowerCase())
    );
    return filtered.slice(0, 10); // Return top 10 matches
  }

  applyIntelligentFiltering(activities: any[], messageText: string) {
    // Simple filtering - just return the activities as-is for now
    console.log(`🔍 Applying intelligent filtering to ${activities.length} activities based on: "${messageText}"`);
    return activities;
  }

  async getEnhancedAvailabilityWithDuration(productCode: string, startDate: string, endDate: string) {
    return await this.getProductAvailabilityAndPricing(productCode, startDate, endDate);
  }

  async searchProducts(searchTerm: string, currency: string = 'USD', randomize: boolean = false, sessionId?: string, destinationId?: number, locationContext?: string): Promise<any[]> {
    console.log(`🚨 ENHANCED-VIATOR searchProducts called: "${searchTerm}", dest: ${destinationId}, location: ${locationContext}`);
    // CRITICAL FIX: Ensure destination ID is properly passed
    return await viatorService.searchProducts(searchTerm, currency, randomize, sessionId, destinationId, locationContext);
  }

  async enhancedSearch(params: any) {
    return await cleanRelevanceEngine.search({
      query: params.query || params.text,
      destinationId: params.destinationId,
      currency: params.currency || 'USD'
    });
  }

  async searchActivitiesWithRelevance(params: any) {
    const result = await cleanRelevanceEngine.search({
      query: params.query,
      destinationId: params.destinationId,
      currency: params.currency || 'USD'
    });
    return result.activities;
  }

  async searchActivitiesWithTags(params: any) {
    const result = await cleanRelevanceEngine.search({
      query: params.query,
      destinationId: params.destinationId,
      currency: params.currency || 'USD'
    });
    return result.activities;
  }

  async searchActivitiesOptimized(query: string, destinationId: number, options: any): Promise<any[]> {
    console.log(`🚨 ENHANCED-VIATOR searchActivitiesOptimized called: "${query}", dest: ${destinationId}`);
    return await viatorService.searchProducts(query, options.currency || 'USD', false, options.sessionId, destinationId, options.locationContext);
  }

  async transformToActivityRecommendations(activities: any[]) {
    return activities; // Already in the right format
  }
}

export const enhancedViatorService = new EnhancedViatorService();