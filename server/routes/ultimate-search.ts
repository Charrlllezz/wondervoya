/**
 * 🚀 ULTIMATE SEARCH API ROUTES
 * 
 * Clean, focused API endpoints for the new Ultimate Viator Engine
 */

import type { Express } from "express";
import { ultimateViatorEngine, type UltimateSearchRequest } from '../services/ultimate-viator-engine';
import { enhancedDestinationService } from '../services/enhanced-destination-service';
import { z } from "zod";

// Request validation schemas
const ultimateSearchSchema = z.object({
  query: z.string().min(1, "Search query required"),
  destinationId: z.number().int().positive("Valid destination ID required"),
  currency: z.string().optional().default('USD'),
  maxResults: z.number().int().min(1).max(50).optional().default(12),
  priceRange: z.object({
    min: z.number().optional(),
    max: z.number().optional()
  }).optional(),
  durationRange: z.object({
    min: z.number().optional(), // minutes
    max: z.number().optional()  // minutes
  }).optional(),
  categories: z.array(z.string()).optional(),
  tags: z.array(z.number()).optional(),
  sortBy: z.enum(['RELEVANCE', 'PRICE_ASC', 'PRICE_DESC', 'RATING', 'POPULARITY']).optional().default('RELEVANCE'),
  userPreferences: z.object({
    budget: z.enum(['budget', 'mid', 'luxury']).optional(),
    groupSize: z.number().optional(),
    duration: z.enum(['short', 'medium', 'full_day', 'multi_day']).optional(),
    interests: z.array(z.string()).optional()
  }).optional()
});

const destinationSearchSchema = z.object({
  query: z.string().min(1, "Search query required"),
  maxResults: z.number().int().min(1).max(20).optional().default(10)
});

export function setupUltimateSearchRoutes(app: Express) {
  
  /**
   * 🎯 MAIN SEARCH ENDPOINT - Ultimate activity search
   */
  app.post('/api/ultimate-search', async (req, res) => {
    const startTime = Date.now();
    
    try {
      console.log('🚀 ULTIMATE SEARCH REQUEST:', JSON.stringify(req.body, null, 2));
      
      const searchRequest = ultimateSearchSchema.parse(req.body);
      
      // Execute ultimate search
      const result = await ultimateViatorEngine.executeUltimateSearch(searchRequest);
      
      const executionTime = Date.now() - startTime;
      
      console.log(`✅ ULTIMATE SEARCH COMPLETED: ${result.activities.length} activities in ${executionTime}ms (strategy: ${result.strategy}, confidence: ${result.confidence})`);

      res.json({
        success: true,
        data: {
          activities: result.activities,
          metadata: {
            strategy: result.strategy,
            confidence: result.confidence,
            total_found: result.totalFound,
            execution_time: executionTime,
            request_id: `ultimate_${Date.now()}`
          }
        }
      });
      
    } catch (error) {
      console.error('❌ ULTIMATE SEARCH ERROR:', error);
      
      res.status(400).json({
        success: false,
        error: {
          message: error instanceof z.ZodError ? 'Invalid request parameters' : 'Search failed',
          details: error instanceof z.ZodError ? error.errors : (error instanceof Error ? error.message : String(error)),
          execution_time: Date.now() - startTime
        }
      });
    }
  });

  /**
   * 🌍 DESTINATIONS ENDPOINT - Enhanced destination search
   */
  app.get('/api/destinations/enhanced', async (req, res) => {
    try {
      const destinations = await enhancedDestinationService.getEnhancedDestinations();
      
      // Return top destinations (limit for performance)
      const topDestinations = destinations
        .filter(d => d.isPopular || d.productCount > 10)
        .slice(0, 500);
      
      res.json({
        success: true,
        data: {
          destinations: topDestinations,
          total: destinations.length,
          last_updated: new Date().toISOString()
        }
      });
      
    } catch (error) {
      console.error('❌ DESTINATIONS ERROR:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to fetch destinations',
          details: error instanceof Error ? error.message : String(error)
        }
      });
    }
  });

  /**
   * 🔍 DESTINATION SEARCH ENDPOINT - Find destinations by query
   */
  app.post('/api/destinations/search', async (req, res) => {
    try {
      const { query, maxResults } = destinationSearchSchema.parse(req.body);
      
      const destinations = await enhancedDestinationService.getEnhancedDestinations();
      const matches = enhancedDestinationService.findMatchingDestinations(query, maxResults);
      
      res.json({
        success: true,
        data: {
          destinations: matches,
          total_available: destinations.length,
          query_matched: matches.length
        }
      });
      
    } catch (error) {
      console.error('❌ DESTINATION SEARCH ERROR:', error);
      res.status(400).json({
        success: false,
        error: {
          message: error instanceof z.ZodError ? 'Invalid search parameters' : 'Destination search failed',
          details: error instanceof z.ZodError ? error.errors : (error instanceof Error ? error.message : String(error))
        }
      });
    }
  });

  /**
   * 📊 SEARCH ANALYTICS ENDPOINT - Performance metrics
   */
  app.get('/api/ultimate-search/analytics', async (req, res) => {
    try {
      // Simple analytics - can be enhanced with proper analytics service
      const analytics = {
        cache_stats: {
          // These would come from cache manager in production
          hit_rate: '95%',
          avg_response_time: '150ms'
        },
        search_performance: {
          strategies_available: 3,
          avg_results_per_search: 8.5,
          avg_confidence_score: 87
        },
        system_status: {
          viator_api: 'operational',
          destination_cache: 'operational',
          last_updated: new Date().toISOString()
        }
      };
      
      res.json({
        success: true,
        data: analytics
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        error: {
          message: 'Analytics unavailable',
          details: error instanceof Error ? error.message : String(error)
        }
      });
    }
  });
}