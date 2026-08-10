import { viatorService } from './viator';
import axios from 'axios'; // Ensure axios is imported

interface AuxiliaryDataCache {
  destinations: Array<{ id: number; name: string; lastUpdated: string }>;
  tags: Array<{ id: number; name: string; category: string; lastUpdated: string }>;
  locations: Array<{ id: string; name: string; details: any; lastUpdated: string }>;
  lastFullUpdate: string;
}

// Define the Destination interface used in the changes
interface Destination {
  id: number;
  name: string;
  lastUpdated: string;
}

// Define the ViatorDestination interface as used in the changes snippet
interface ViatorDestination {
  destinationId: number;
  name: string;
  destinationName?: string; // Added based on potential response structure
  // Add other properties as needed based on actual API response
}

class AuxiliaryDataManager {
  private cache: AuxiliaryDataCache = {
    destinations: [],
    tags: [],
    locations: [],
    lastFullUpdate: ''
  };

  private destinationsCache: Destination[] = []; // To hold destinations in memory
  private destinationsCacheLoadedAt = 0;
  // How long the in-memory destinations cache is trusted before re-reading
  // from the database. Previously this cache had no expiry at all — once
  // populated it was served for the entire lifetime of the server process,
  // so a sync that fixed/completed the underlying data (e.g. after a
  // previously-broken ingestion run) would never be picked up without a
  // full process restart. See getDestinationsV1() below.
  private readonly DESTINATIONS_MEMORY_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
  private readonly DESTINATIONS_FILE = 'viator-destinations-cache.json'; // Cache file name from context

  private readonly CACHE_FILE = 'auxiliary-data-cache.json'; // Original cache file name

  // 🎯 FEATURE FLAG for destination cache testing
  private readonly USE_V2_DESTINATION_CACHE = false;

  // Update cadences (in hours) - Following Viator requirements
  private readonly UPDATE_INTERVALS = {
    destinations: 168, // Weekly (7 days) - Per Viator guidelines
    tags: 168,         // Weekly - Per Viator guidelines  
    locations: 720,    // Monthly (30 days) - Per Viator guidelines
    bookingQuestions: 720 // Monthly (30 days) - Per Viator guidelines
  };

  async getDestinations(): Promise<Destination[]> {
    // 🎯 SHADOWING LOGIC - Test V2 cache in parallel
    if (this.USE_V2_DESTINATION_CACHE) {
      console.log('🎯 Using V2 destination cache (feature flag enabled)');
      const { destinationCacheV2 } = await import('./destination-cache-v2');
      return await destinationCacheV2.getDestinationsV2('hybrid');
    }

    // V1 Logic with V2 shadowing for comparison
    const v1Results = await this.getDestinationsV1();
    
    // Shadow V2 testing (don't await, run in background)
    this.shadowTestV2Cache(v1Results).catch(error => {
      console.log('📊 V2 shadow test error (non-blocking):', error.message);
    });

    return v1Results;
  }

  /**
   * 🎯 DESTINATION CACHE V1 (Original Implementation)
   */
  async getDestinationsV1(): Promise<Destination[]> {
    // First check memory cache, as long as it hasn't expired
    const cacheAge = Date.now() - this.destinationsCacheLoadedAt;
    if (this.destinationsCache.length > 0 && cacheAge < this.DESTINATIONS_MEMORY_CACHE_TTL_MS) {
      console.log(`🗄️ Retrieved ${this.destinationsCache.length} destinations from memory cache V1 (age: ${Math.round(cacheAge / 1000)}s)`);
      return this.destinationsCache;
    }

    // NEW: Check database first (priority over file cache)
    try {
      const { destinationFetcher } = await import('./destination-fetcher');
      const databaseDestinations = await destinationFetcher.getAllDestinations();

      if (databaseDestinations.length > 3000) {
        // Convert database format to auxiliary manager format
        this.destinationsCache = databaseDestinations.map(dest => ({
          id: dest.id,
          name: dest.name,
          lastUpdated: new Date().toISOString()
        }));
        this.destinationsCacheLoadedAt = Date.now();
        console.log(`🗄️ Retrieved ${this.destinationsCache.length} destinations from DATABASE (full coverage)`);
        return this.destinationsCache;
      } else if (databaseDestinations.length > 0) {
        console.log(`📊 Database has ${databaseDestinations.length} destinations, but less than full coverage. Using database anyway.`);
        this.destinationsCache = databaseDestinations.map(dest => ({
          id: dest.id,
          name: dest.name,
          lastUpdated: new Date().toISOString()
        }));
        this.destinationsCacheLoadedAt = Date.now();
        return this.destinationsCache;
      }
    } catch (error) {
      console.log('❌ Database query failed, falling back to file cache:', error);
    }

    // Fallback to file cache
    try {
      const cached = await this.loadFromFile(this.DESTINATIONS_FILE);
      if (cached && Array.isArray(cached.destinations) && cached.destinations.length > 0) {
        this.destinationsCache = cached.destinations;
        this.destinationsCacheLoadedAt = Date.now();
        console.log(`🗄️ Retrieved ${this.destinationsCache.length} destinations from FILE cache (fallback)`);
        return this.destinationsCache;
      }
    } catch (error) {
      console.log('📄 File cache invalid, will need to fetch fresh data');
    }

    // Last resort: fetch fresh data (should be rare now that database is populated)
    return await this.fetchFreshDestinations();
  }

  /**
   * 📊 SHADOW TESTING - Compare V1 and V2 cache performance
   */
  private async shadowTestV2Cache(v1Results: Destination[]): Promise<void> {
    const startTime = Date.now();
    
    try {
      const { destinationCacheV2 } = await import('./destination-cache-v2');
      
      // Test all three V2 strategies
      const strategies = ['aggressive', 'conservative', 'hybrid'] as const;
      
      for (const strategy of strategies) {
        const strategyStart = Date.now();
        const v2Results = await destinationCacheV2.getDestinationsV2(strategy);
        const strategyTime = Date.now() - strategyStart;
        
        // Log comparison results
        console.log(`📊 CACHE COMPARISON - ${strategy.toUpperCase()}:`);
        console.log(`  V1 Results: ${v1Results.length} destinations`);
        console.log(`  V2 Results: ${v2Results.length} destinations`);
        console.log(`  V2 Time: ${strategyTime}ms`);
        console.log(`  Count Match: ${v1Results.length === v2Results.length ? '✅' : '❌'}`);
        
        // Sample destination comparison
        if (v1Results.length > 0 && v2Results.length > 0) {
          const v1Sample = v1Results.slice(0, 3).map(d => d.name);
          const v2Sample = v2Results.slice(0, 3).map(d => d.name);
          console.log(`  V1 Sample: ${v1Sample.join(', ')}`);
          console.log(`  V2 Sample: ${v2Sample.join(', ')}`);
        }
      }
      
      // Get V2 cache statistics
      const v2Stats = destinationCacheV2.getCacheStats();
      console.log(`📊 V2 Cache Stats:`, v2Stats);
      
    } catch (error) {
      console.log(`❌ V2 shadow test failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    const totalTime = Date.now() - startTime;
    console.log(`📊 Shadow test completed in ${totalTime}ms`);
  }

  async updateDestinations() {
    try {
      console.log('🔄 Loading destinations from comprehensive database...');

      // Load from existing file system data or use backup comprehensive list
      const fs = await import('fs/promises');
      let destinations: Array<{ id: number; name: string; lastUpdated: string }> = [];

      try {
        // Try to load from existing backup file
        const backupData = await fs.readFile('data.json.backup', 'utf-8');
        const parsed = JSON.parse(backupData);
        if (parsed.destinations) {
          destinations = parsed.destinations.map((dest: any, index: number) => ({
            id: index + 1,
            name: dest.name || dest.destinationName,
            lastUpdated: new Date().toISOString()
          }));
        }
      } catch (error) {
        console.log('No backup destination data found, using curated list');
      }

      // If no destinations loaded, use comprehensive curated list with countries
      if (destinations.length === 0) {
        destinations = [
          { id: 1, name: 'Tokyo, Japan', lastUpdated: new Date().toISOString() },
          { id: 2, name: 'Toronto, Canada', lastUpdated: new Date().toISOString() },
          { id: 3, name: 'Toledo, Spain', lastUpdated: new Date().toISOString() },
          { id: 4, name: 'Toulouse, France', lastUpdated: new Date().toISOString() },
          { id: 5, name: 'Tucson, USA', lastUpdated: new Date().toISOString() },
          { id: 6, name: 'Tampa, USA', lastUpdated: new Date().toISOString() },
          { id: 7, name: 'Topeka, USA', lastUpdated: new Date().toISOString() },
          { id: 8, name: 'New York, USA', lastUpdated: new Date().toISOString() },
          { id: 9, name: 'London, United Kingdom', lastUpdated: new Date().toISOString() },
          { id: 10, name: 'Paris, France', lastUpdated: new Date().toISOString() },
          { id: 11, name: 'Rome, Italy', lastUpdated: new Date().toISOString() },
          { id: 12, name: 'Barcelona, Spain', lastUpdated: new Date().toISOString() },
          { id: 13, name: 'Madrid, Spain', lastUpdated: new Date().toISOString() },
          { id: 14, name: 'Berlin, Germany', lastUpdated: new Date().toISOString() },
          { id: 15, name: 'Amsterdam, Netherlands', lastUpdated: new Date().toISOString() },
          { id: 16, name: 'Venice, Italy', lastUpdated: new Date().toISOString() },
          { id: 17, name: 'Florence, Italy', lastUpdated: new Date().toISOString() },
          { id: 18, name: 'Prague, Czech Republic', lastUpdated: new Date().toISOString() },
          { id: 19, name: 'Vienna, Austria', lastUpdated: new Date().toISOString() },
          { id: 20, name: 'Budapest, Hungary', lastUpdated: new Date().toISOString() },
          { id: 21, name: 'Athens, Greece', lastUpdated: new Date().toISOString() },
          { id: 22, name: 'Istanbul, Turkey', lastUpdated: new Date().toISOString() },
          { id: 23, name: 'Dubai, UAE', lastUpdated: new Date().toISOString() },
          { id: 24, name: 'Bangkok, Thailand', lastUpdated: new Date().toISOString() },
          { id: 25, name: 'Singapore', lastUpdated: new Date().toISOString() },
          { id: 26, name: 'Hong Kong', lastUpdated: new Date().toISOString() },
          { id: 27, name: 'Seoul, South Korea', lastUpdated: new Date().toISOString() },
          { id: 28, name: 'Sydney, Australia', lastUpdated: new Date().toISOString() },
          { id: 29, name: 'Melbourne, Australia', lastUpdated: new Date().toISOString() },
          { id: 30, name: 'Brisbane, Australia', lastUpdated: new Date().toISOString() },
          { id: 31, name: 'Perth, Australia', lastUpdated: new Date().toISOString() },
          { id: 32, name: 'Los Angeles, USA', lastUpdated: new Date().toISOString() },
          { id: 33, name: 'San Francisco, USA', lastUpdated: new Date().toISOString() },
          { id: 34, name: 'Las Vegas, USA', lastUpdated: new Date().toISOString() },
          { id: 35, name: 'Miami, USA', lastUpdated: new Date().toISOString() },
          { id: 36, name: 'Orlando, USA', lastUpdated: new Date().toISOString() },
          { id: 37, name: 'Chicago, USA', lastUpdated: new Date().toISOString() },
          { id: 38, name: 'Boston, USA', lastUpdated: new Date().toISOString() },
          { id: 39, name: 'Washington DC, USA', lastUpdated: new Date().toISOString() },
          { id: 40, name: 'Vancouver, Canada', lastUpdated: new Date().toISOString() },
          { id: 41, name: 'Montreal, Canada', lastUpdated: new Date().toISOString() },
          { id: 42, name: 'Mexico City, Mexico', lastUpdated: new Date().toISOString() },
          { id: 43, name: 'Cancun, Mexico', lastUpdated: new Date().toISOString() },
          { id: 44, name: 'Rio de Janeiro, Brazil', lastUpdated: new Date().toISOString() },
          { id: 45, name: 'São Paulo, Brazil', lastUpdated: new Date().toISOString() },
          { id: 46, name: 'Buenos Aires, Argentina', lastUpdated: new Date().toISOString() },
          { id: 47, name: 'Lima, Peru', lastUpdated: new Date().toISOString() },
          { id: 48, name: 'Santiago, Chile', lastUpdated: new Date().toISOString() },
          { id: 49, name: 'Cairo, Egypt', lastUpdated: new Date().toISOString() },
          { id: 50, name: 'Cape Town, South Africa', lastUpdated: new Date().toISOString() },
          { id: 51, name: 'Seattle, USA', lastUpdated: new Date().toISOString() },
          { id: 52, name: 'Portland, USA', lastUpdated: new Date().toISOString() },
          { id: 53, name: 'San Diego, USA', lastUpdated: new Date().toISOString() },
          { id: 54, name: 'Denver, USA', lastUpdated: new Date().toISOString() },
          { id: 55, name: 'Phoenix, USA', lastUpdated: new Date().toISOString() },
          { id: 56, name: 'Austin, USA', lastUpdated: new Date().toISOString() },
          { id: 57, name: 'Nashville, USA', lastUpdated: new Date().toISOString() },
          { id: 58, name: 'New Orleans, USA', lastUpdated: new Date().toISOString() },
          { id: 59, name: 'Atlanta, USA', lastUpdated: new Date().toISOString() },
          { id: 60, name: 'Philadelphia, USA', lastUpdated: new Date().toISOString() },
          { id: 61, name: 'Dallas, USA', lastUpdated: new Date().toISOString() },
          { id: 62, name: 'Houston, USA', lastUpdated: new Date().toISOString() },
          { id: 63, name: 'Detroit, USA', lastUpdated: new Date().toISOString() },
          { id: 64, name: 'Lisbon, Portugal', lastUpdated: new Date().toISOString() },
          { id: 65, name: 'Porto, Portugal', lastUpdated: new Date().toISOString() },
          { id: 66, name: 'Geneva, Switzerland', lastUpdated: new Date().toISOString() },
          { id: 67, name: 'Zurich, Switzerland', lastUpdated: new Date().toISOString() },
          { id: 68, name: 'Stockholm, Sweden', lastUpdated: new Date().toISOString() },
          { id: 69, name: 'Copenhagen, Denmark', lastUpdated: new Date().toISOString() },
          { id: 70, name: 'Oslo, Norway', lastUpdated: new Date().toISOString() },
          { id: 71, name: 'Helsinki, Finland', lastUpdated: new Date().toISOString() },
          { id: 72, name: 'Dublin, Ireland', lastUpdated: new Date().toISOString() },
          { id: 73, name: 'Edinburgh, Scotland', lastUpdated: new Date().toISOString() },
          { id: 74, name: 'Mumbai, India', lastUpdated: new Date().toISOString() },
          { id: 75, name: 'Delhi, India', lastUpdated: new Date().toISOString() },
          { id: 76, name: 'Bangalore, India', lastUpdated: new Date().toISOString() },
          { id: 77, name: 'Kyoto, Japan', lastUpdated: new Date().toISOString() },
          { id: 78, name: 'Osaka, Japan', lastUpdated: new Date().toISOString() },
          { id: 79, name: 'Beijing, China', lastUpdated: new Date().toISOString() },
          { id: 80, name: 'Shanghai, China', lastUpdated: new Date().toISOString() },
          { id: 81, name: 'Jakarta, Indonesia', lastUpdated: new Date().toISOString() },
          { id: 82, name: 'Kuala Lumpur, Malaysia', lastUpdated: new Date().toISOString() },
          { id: 83, name: 'Tel Aviv, Israel', lastUpdated: new Date().toISOString() },
          { id: 84, name: 'Jerusalem, Israel', lastUpdated: new Date().toISOString() },
          { id: 85, name: 'Marrakech, Morocco', lastUpdated: new Date().toISOString() },
          { id: 86, name: 'Casablanca, Morocco', lastUpdated: new Date().toISOString() },
          { id: 87, name: 'Reykjavik, Iceland', lastUpdated: new Date().toISOString() },
          { id: 88, name: 'Kiev, Ukraine', lastUpdated: new Date().toISOString() },
          { id: 89, name: 'Warsaw, Poland', lastUpdated: new Date().toISOString() },
          { id: 90, name: 'Krakow, Poland', lastUpdated: new Date().toISOString() },
          { id: 91, name: 'Bucharest, Romania', lastUpdated: new Date().toISOString() },
          { id: 92, name: 'Sofia, Bulgaria', lastUpdated: new Date().toISOString() },
          { id: 93, name: 'Zagreb, Croatia', lastUpdated: new Date().toISOString() },
          { id: 94, name: 'Ljubljana, Slovenia', lastUpdated: new Date().toISOString() },
          { id: 95, name: 'Bratislava, Slovakia', lastUpdated: new Date().toISOString() },
          { id: 96, name: 'Tallinn, Estonia', lastUpdated: new Date().toISOString() },
          { id: 97, name: 'Riga, Latvia', lastUpdated: new Date().toISOString() },
          { id: 98, name: 'Vilnius, Lithuania', lastUpdated: new Date().toISOString() },
          { id: 99, name: 'Adelaide, Australia', lastUpdated: new Date().toISOString() },
          { id: 100, name: 'Hobart, Australia', lastUpdated: new Date().toISOString() },
          { id: 101, name: 'Salt Lake City, USA', lastUpdated: new Date().toISOString() },
          { id: 102, name: 'Minneapolis, USA', lastUpdated: new Date().toISOString() },
          { id: 103, name: 'Kansas City, USA', lastUpdated: new Date().toISOString() },
          { id: 104, name: 'Cleveland, USA', lastUpdated: new Date().toISOString() },
          { id: 105, name: 'Pittsburgh, USA', lastUpdated: new Date().toISOString() },
          { id: 106, name: 'Richmond, USA', lastUpdated: new Date().toISOString() },
          { id: 107, name: 'Raleigh, USA', lastUpdated: new Date().toISOString() },
          { id: 108, name: 'Charleston, USA', lastUpdated: new Date().toISOString() },
          { id: 109, name: 'Savannah, USA', lastUpdated: new Date().toISOString() },
          { id: 110, name: 'Jacksonville, USA', lastUpdated: new Date().toISOString() },
          { id: 111, name: 'Birmingham, USA', lastUpdated: new Date().toISOString() },
          { id: 112, name: 'Memphis, USA', lastUpdated: new Date().toISOString() },
          { id: 113, name: 'Louisville, USA', lastUpdated: new Date().toISOString() },
          { id: 114, name: 'Cincinnati, USA', lastUpdated: new Date().toISOString() },
          { id: 115, name: 'Columbus, USA', lastUpdated: new Date().toISOString() },
          { id: 116, name: 'Milwaukee, USA', lastUpdated: new Date().toISOString() },
          { id: 117, name: 'Buffalo, USA', lastUpdated: new Date().toISOString() },
          { id: 118, name: 'Albany, USA', lastUpdated: new Date().toISOString() },
          { id: 119, name: 'Hartford, USA', lastUpdated: new Date().toISOString() },
          { id: 120, name: 'Providence, USA', lastUpdated: new Date().toISOString() },
          { id: 121, name: 'Calgary, Canada', lastUpdated: new Date().toISOString() },
          { id: 122, name: 'Edmonton, Canada', lastUpdated: new Date().toISOString() },
          { id: 123, name: 'Winnipeg, Canada', lastUpdated: new Date().toISOString() },
          { id: 124, name: 'Ottawa, Canada', lastUpdated: new Date().toISOString() },
          { id: 125, name: 'Quebec City, Canada', lastUpdated: new Date().toISOString() },
          { id: 126, name: 'Halifax, Canada', lastUpdated: new Date().toISOString() },
          { id: 127, name: 'Victoria, Canada', lastUpdated: new Date().toISOString() },
          { id: 128, name: 'Guadalajara, Mexico', lastUpdated: new Date().toISOString() },
          { id: 129, name: 'Monterrey, Mexico', lastUpdated: new Date().toISOString() },
          { id: 130, name: 'Puebla, Mexico', lastUpdated: new Date().toISOString() },
          { id: 131, name: 'Tijuana, Mexico', lastUpdated: new Date().toISOString() },
          { id: 132, name: 'Playa del Carmen, Mexico', lastUpdated: new Date().toISOString() },
          { id: 133, name: 'Puerto Vallarta, Mexico', lastUpdated: new Date().toISOString() },
          { id: 134, name: 'Cozumel, Mexico', lastUpdated: new Date().toISOString() },
          { id: 135, name: 'Havana, Cuba', lastUpdated: new Date().toISOString() },
          { id: 136, name: 'Kingston, Jamaica', lastUpdated: new Date().toISOString() },
          { id: 137, name: 'San Juan, Puerto Rico', lastUpdated: new Date().toISOString() },
          { id: 138, name: 'Nassau, Bahamas', lastUpdated: new Date().toISOString() },
          { id: 139, name: 'Bridgetown, Barbados', lastUpdated: new Date().toISOString() },
          { id: 140, name: 'Guatemala City, Guatemala', lastUpdated: new Date().toISOString() },
          { id: 141, name: 'San Jose, Costa Rica', lastUpdated: new Date().toISOString() },
          { id: 142, name: 'Panama City, Panama', lastUpdated: new Date().toISOString() },
          { id: 143, name: 'Bogota, Colombia', lastUpdated: new Date().toISOString() },
          { id: 144, name: 'Medellin, Colombia', lastUpdated: new Date().toISOString() },
          { id: 145, name: 'Cartagena, Colombia', lastUpdated: new Date().toISOString() },
          { id: 146, name: 'Caracas, Venezuela', lastUpdated: new Date().toISOString() },
          { id: 147, name: 'Quito, Ecuador', lastUpdated: new Date().toISOString() },
          { id: 148, name: 'Guayaquil, Ecuador', lastUpdated: new Date().toISOString() },
          { id: 149, name: 'Cusco, Peru', lastUpdated: new Date().toISOString() },
          { id: 150, name: 'Arequipa, Peru', lastUpdated: new Date().toISOString() },
          { id: 151, name: 'La Paz, Bolivia', lastUpdated: new Date().toISOString() },
          { id: 152, name: 'Santa Cruz, Bolivia', lastUpdated: new Date().toISOString() },
          { id: 153, name: 'Asuncion, Paraguay', lastUpdated: new Date().toISOString() },
          { id: 154, name: 'Montevideo, Uruguay', lastUpdated: new Date().toISOString() },
          { id: 155, name: 'Cordoba, Argentina', lastUpdated: new Date().toISOString() },
          { id: 156, name: 'Rosario, Argentina', lastUpdated: new Date().toISOString() },
          { id: 157, name: 'Mendoza, Argentina', lastUpdated: new Date().toISOString() },
          { id: 158, name: 'Valparaiso, Chile', lastUpdated: new Date().toISOString() },
          { id: 159, name: 'Concepcion, Chile', lastUpdated: new Date().toISOString() },
          { id: 160, name: 'Brasilia, Brazil', lastUpdated: new Date().toISOString() },
          { id: 161, name: 'Salvador, Brazil', lastUpdated: new Date().toISOString() },
          { id: 162, name: 'Fortaleza, Brazil', lastUpdated: new Date().toISOString() },
          { id: 163, name: 'Recife, Brazil', lastUpdated: new Date().toISOString() },
          { id: 164, name: 'Belo Horizonte, Brazil', lastUpdated: new Date().toISOString() },
          { id: 165, name: 'Porto Alegre, Brazil', lastUpdated: new Date().toISOString() },
          { id: 166, name: 'Curitiba, Brazil', lastUpdated: new Date().toISOString() },
          { id: 167, name: 'Manaus, Brazil', lastUpdated: new Date().toISOString() },
          { id: 168, name: 'Nice, France', lastUpdated: new Date().toISOString() },
          { id: 169, name: 'Cannes, France', lastUpdated: new Date().toISOString() },
          { id: 170, name: 'Marseille, France', lastUpdated: new Date().toISOString() },
          { id: 171, name: 'Bordeaux, France', lastUpdated: new Date().toISOString() },
          { id: 172, name: 'Strasbourg, France', lastUpdated: new Date().toISOString() },
          { id: 173, name: 'Nantes, France', lastUpdated: new Date().toISOString() },
          { id: 174, name: 'Montpellier, France', lastUpdated: new Date().toISOString() },
          { id: 175, name: 'Avignon, France', lastUpdated: new Date().toISOString() },
          { id: 176, name: 'Tours, France', lastUpdated: new Date().toISOString() },
          { id: 177, name: 'Reims, France', lastUpdated: new Date().toISOString() },
          { id: 178, name: 'Dijon, France', lastUpdated: new Date().toISOString() },
          { id: 179, name: 'Annecy, France', lastUpdated: new Date().toISOString() },
          { id: 180, name: 'Munich, Germany', lastUpdated: new Date().toISOString() },
          { id: 181, name: 'Hamburg, Germany', lastUpdated: new Date().toISOString() },
          { id: 182, name: 'Cologne, Germany', lastUpdated: new Date().toISOString() },
          { id: 183, name: 'Frankfurt, Germany', lastUpdated: new Date().toISOString() },
          { id: 184, name: 'Stuttgart, Germany', lastUpdated: new Date().toISOString() },
          { id: 185, name: 'Dusseldorf, Germany', lastUpdated: new Date().toISOString() },
          { id: 186, name: 'Dortmund, Germany', lastUpdated: new Date().toISOString() },
          { id: 187, name: 'Essen, Germany', lastUpdated: new Date().toISOString() },
          { id: 188, name: 'Bremen, Germany', lastUpdated: new Date().toISOString() },
          { id: 189, name: 'Dresden, Germany', lastUpdated: new Date().toISOString() },
          { id: 190, name: 'Hannover, Germany', lastUpdated: new Date().toISOString() },
          { id: 191, name: 'Nuremberg, Germany', lastUpdated: new Date().toISOString() },
          { id: 192, name: 'Heidelberg, Germany', lastUpdated: new Date().toISOString() },
          { id: 193, name: 'Rothenburg, Germany', lastUpdated: new Date().toISOString() },
          { id: 194, name: 'Salzburg, Austria', lastUpdated: new Date().toISOString() },
          { id: 195, name: 'Innsbruck, Austria', lastUpdated: new Date().toISOString() },
          { id: 196, name: 'Graz, Austria', lastUpdated: new Date().toISOString() },
          { id: 197, name: 'Hallstatt, Austria', lastUpdated: new Date().toISOString() },
          { id: 198, name: 'Lucerne, Switzerland', lastUpdated: new Date().toISOString() },
          { id: 199, name: 'Bern, Switzerland', lastUpdated: new Date().toISOString() },
          { id: 200, name: 'Basel, Switzerland', lastUpdated: new Date().toISOString() },
          { id: 201, name: 'Interlaken, Switzerland', lastUpdated: new Date().toISOString() },
          { id: 202, name: 'Zermatt, Switzerland', lastUpdated: new Date().toISOString() },
          { id: 203, name: 'St. Moritz, Switzerland', lastUpdated: new Date().toISOString() },
          { id: 204, name: 'Lausanne, Switzerland', lastUpdated: new Date().toISOString() },
          { id: 205, name: 'Montreux, Switzerland', lastUpdated: new Date().toISOString() },
          { id: 206, name: 'Milan, Italy', lastUpdated: new Date().toISOString() },
          { id: 207, name: 'Naples, Italy', lastUpdated: new Date().toISOString() },
          { id: 208, name: 'Turin, Italy', lastUpdated: new Date().toISOString() },
          { id: 209, name: 'Bologna, Italy', lastUpdated: new Date().toISOString() },
          { id: 210, name: 'Genoa, Italy', lastUpdated: new Date().toISOString() },
          { id: 211, name: 'Palermo, Italy', lastUpdated: new Date().toISOString() },
          { id: 212, name: 'Catania, Italy', lastUpdated: new Date().toISOString() },
          { id: 213, name: 'Verona, Italy', lastUpdated: new Date().toISOString() },
          { id: 214, name: 'Pisa, Italy', lastUpdated: new Date().toISOString() },
          { id: 215, name: 'Siena, Italy', lastUpdated: new Date().toISOString() },
          { id: 216, name: 'Amalfi, Italy', lastUpdated: new Date().toISOString() },
          { id: 217, name: 'Positano, Italy', lastUpdated: new Date().toISOString() },
          { id: 218, name: 'Cinque Terre, Italy', lastUpdated: new Date().toISOString() },
          { id: 219, name: 'Como, Italy', lastUpdated: new Date().toISOString() },
          { id: 220, name: 'Seville, Spain', lastUpdated: new Date().toISOString() },
          { id: 221, name: 'Valencia, Spain', lastUpdated: new Date().toISOString() },
          { id: 222, name: 'Bilbao, Spain', lastUpdated: new Date().toISOString() },
          { id: 223, name: 'Granada, Spain', lastUpdated: new Date().toISOString() },
          { id: 224, name: 'Cordoba, Spain', lastUpdated: new Date().toISOString() },
          { id: 225, name: 'San Sebastian, Spain', lastUpdated: new Date().toISOString() },
          { id: 226, name: 'Salamanca, Spain', lastUpdated: new Date().toISOString() },
          { id: 227, name: 'Santiago de Compostela, Spain', lastUpdated: new Date().toISOString() },
          { id: 228, name: 'Palma, Spain', lastUpdated: new Date().toISOString() },
          { id: 229, name: 'Ibiza, Spain', lastUpdated: new Date().toISOString() },
          { id: 230, name: 'Santorini, Greece', lastUpdated: new Date().toISOString() },
          { id: 231, name: 'Mykonos, Greece', lastUpdated: new Date().toISOString() },
          { id: 232, name: 'Crete, Greece', lastUpdated: new Date().toISOString() },
          { id: 233, name: 'Rhodes, Greece', lastUpdated: new Date().toISOString() },
          { id: 234, name: 'Thessaloniki, Greece', lastUpdated: new Date().toISOString() },
          { id: 235, name: 'Delphi, Greece', lastUpdated: new Date().toISOString() },
          { id: 236, name: 'Meteora, Greece', lastUpdated: new Date().toISOString() },
          { id: 237, name: 'Paros, Greece', lastUpdated: new Date().toISOString() },
          { id: 238, name: 'Naxos, Greece', lastUpdated: new Date().toISOString() },
          { id: 239, name: 'Zakynthos, Greece', lastUpdated: new Date().toISOString() },
          { id: 240, name: 'Manchester, United Kingdom', lastUpdated: new Date().toISOString() },
          { id: 241, name: 'Liverpool, United Kingdom', lastUpdated: new Date().toISOString() },
          { id: 242, name: 'Glasgow, Scotland', lastUpdated: new Date().toISOString() },
          { id: 243, name: 'Cardiff, Wales', lastUpdated: new Date().toISOString() },
          { id: 244, name: 'Belfast, Northern Ireland', lastUpdated: new Date().toISOString() },
          { id: 245, name: 'Bath, United Kingdom', lastUpdated: new Date().toISOString() },
          { id: 246, name: 'York, United Kingdom', lastUpdated: new Date().toISOString() },
          { id: 247, name: 'Cambridge, United Kingdom', lastUpdated: new Date().toISOString() },
          { id: 248, name: 'Oxford, United Kingdom', lastUpdated: new Date().toISOString() },
          { id: 249, name: 'Canterbury, United Kingdom', lastUpdated: new Date().toISOString() },
          { id: 250, name: 'Stonehenge, United Kingdom', lastUpdated: new Date().toISOString() },
          { id: 251, name: 'Lake District, United Kingdom', lastUpdated: new Date().toISOString() },
          { id: 252, name: 'Cork, Ireland', lastUpdated: new Date().toISOString() },
          { id: 253, name: 'Galway, Ireland', lastUpdated: new Date().toISOString() },
          { id: 254, name: 'Killarney, Ireland', lastUpdated: new Date().toISOString() },
          { id: 255, name: 'Dingle, Ireland', lastUpdated: new Date().toISOString() },
          { id: 256, name: 'Cliffs of Moher, Ireland', lastUpdated: new Date().toISOString() },
          { id: 257, name: 'Gothenburg, Sweden', lastUpdated: new Date().toISOString() },
          { id: 258, name: 'Malmo, Sweden', lastUpdated: new Date().toISOString() },
          { id: 259, name: 'Uppsala, Sweden', lastUpdated: new Date().toISOString() },
          { id: 260, name: 'Aarhus, Denmark', lastUpdated: new Date().toISOString() },
          { id: 261, name: 'Odense, Denmark', lastUpdated: new Date().toISOString() },
          { id: 262, name: 'Bergen, Norway', lastUpdated: new Date().toISOString() },
          { id: 263, name: 'Trondheim, Norway', lastUpdated: new Date().toISOString() },
          { id: 264, name: 'Stavanger, Norway', lastUpdated: new Date().toISOString() },
          { id: 265, name: 'Tromso, Norway', lastUpdated: new Date().toISOString() },
          { id: 266, name: 'Lofoten, Norway', lastUpdated: new Date().toISOString() },
          { id: 267, name: 'Geirangerfjord, Norway', lastUpdated: new Date().toISOString() },
          { id: 268, name: 'Turku, Finland', lastUpdated: new Date().toISOString() },
          { id: 269, name: 'Tampere, Finland', lastUpdated: new Date().toISOString() },
          { id: 270, name: 'Rovaniemi, Finland', lastUpdated: new Date().toISOString() },
          { id: 271, name: 'Lapland, Finland', lastUpdated: new Date().toISOString() },
          { id: 272, name: 'Moscow, Russia', lastUpdated: new Date().toISOString() },
          { id: 273, name: 'St. Petersburg, Russia', lastUpdated: new Date().toISOString() },
          { id: 274, name: 'Kazan, Russia', lastUpdated: new Date().toISOString() },
          { id: 275, name: 'Sochi, Russia', lastUpdated: new Date().toISOString() },
          { id: 276, name: 'Vladivostok, Russia', lastUpdated: new Date().toISOString() },
          { id: 277, name: 'Irkutsk, Russia', lastUpdated: new Date().toISOString() },
          { id: 278, name: 'Lake Baikal, Russia', lastUpdated: new Date().toISOString() },
          { id: 279, name: 'Almaty, Kazakhstan', lastUpdated: new Date().toISOString() },
          { id: 280, name: 'Nur-Sultan, Kazakhstan', lastUpdated: new Date().toISOString() },
          { id: 281, name: 'Tashkent, Uzbekistan', lastUpdated: new Date().toISOString() },
          { id: 282, name: 'Samarkand, Uzbekistan', lastUpdated: new Date().toISOString() },
          { id: 283, name: 'Bukhara, Uzbekistan', lastUpdated: new Date().toISOString() },
          { id: 284, name: 'Tbilisi, Georgia', lastUpdated: new Date().toISOString() },
          { id: 285, name: 'Batumi, Georgia', lastUpdated: new Date().toISOString() },
          { id: 286, name: 'Yerevan, Armenia', lastUpdated: new Date().toISOString() },
          { id: 287, name: 'Baku, Azerbaijan', lastUpdated: new Date().toISOString() },
          { id: 288, name: 'Ankara, Turkey', lastUpdated: new Date().toISOString() },
          { id: 289, name: 'Izmir, Turkey', lastUpdated: new Date().toISOString() },
          { id: 290, name: 'Antalya, Turkey', lastUpdated: new Date().toISOString() },
          { id: 291, name: 'Cappadocia, Turkey', lastUpdated: new Date().toISOString() },
          { id: 292, name: 'Pamukkale, Turkey', lastUpdated: new Date().toISOString() },
          { id: 293, name: 'Ephesus, Turkey', lastUpdated: new Date().toISOString() },
          { id: 294, name: 'Bodrum, Turkey', lastUpdated: new Date().toISOString() },
          { id: 295, name: 'Beirut, Lebanon', lastUpdated: new Date().toISOString() },
          { id: 296, name: 'Damascus, Syria', lastUpdated: new Date().toISOString() },
          { id: 297, name: 'Amman, Jordan', lastUpdated: new Date().toISOString() },
          { id: 298, name: 'Petra, Jordan', lastUpdated: new Date().toISOString() },
          { id: 299, name: 'Wadi Rum, Jordan', lastUpdated: new Date().toISOString() },
          { id: 300, name: 'Dead Sea, Jordan', lastUpdated: new Date().toISOString() },
          { id: 301, name: 'Riyadh, Saudi Arabia', lastUpdated: new Date().toISOString() },
          { id: 302, name: 'Jeddah, Saudi Arabia', lastUpdated: new Date().toISOString() },
          { id: 303, name: 'Mecca, Saudi Arabia', lastUpdated: new Date().toISOString() },
          { id: 304, name: 'Medina, Saudi Arabia', lastUpdated: new Date().toISOString() },
          { id: 305, name: 'Kuwait City, Kuwait', lastUpdated: new Date().toISOString() },
          { id: 306, name: 'Doha, Qatar', lastUpdated: new Date().toISOString() },
          { id: 307, name: 'Manama, Bahrain', lastUpdated: new Date().toISOString() },
          { id: 308, name: 'Abu Dhabi, UAE', lastUpdated: new Date().toISOString() },
          { id: 309, name: 'Sharjah, UAE', lastUpdated: new Date().toISOString() },
          { id: 310, name: 'Fujairah, UAE', lastUpdated: new Date().toISOString() },
          { id: 311, name: 'Muscat, Oman', lastUpdated: new Date().toISOString() },
          { id: 312, name: 'Salalah, Oman', lastUpdated: new Date().toISOString() },
          { id: 313, name: 'Sanaa, Yemen', lastUpdated: new Date().toISOString() },
          { id: 314, name: 'Aden, Yemen', lastUpdated: new Date().toISOString() },
          { id: 315, name: 'Tehran, Iran', lastUpdated: new Date().toISOString() },
          { id: 316, name: 'Isfahan, Iran', lastUpdated: new Date().toISOString() },
          { id: 317, name: 'Shiraz, Iran', lastUpdated: new Date().toISOString() },
          { id: 318, name: 'Yazd, Iran', lastUpdated: new Date().toISOString() },
          { id: 319, name: 'Persepolis, Iran', lastUpdated: new Date().toISOString() },
          { id: 320, name: 'Kabul, Afghanistan', lastUpdated: new Date().toISOString() },
          { id: 321, name: 'Herat, Afghanistan', lastUpdated: new Date().toISOString() },
          { id: 322, name: 'Islamabad, Pakistan', lastUpdated: new Date().toISOString() },
          { id: 323, name: 'Karachi, Pakistan', lastUpdated: new Date().toISOString() },
          { id: 324, name: 'Lahore, Pakistan', lastUpdated: new Date().toISOString() },
          { id: 325, name: 'Peshawar, Pakistan', lastUpdated: new Date().toISOString() },
          { id: 326, name: 'Hunza Valley, Pakistan', lastUpdated: new Date().toISOString() },
          { id: 327, name: 'Kathmandu, Nepal', lastUpdated: new Date().toISOString() },
          { id: 328, name: 'Pokhara, Nepal', lastUpdated: new Date().toISOString() },
          { id: 329, name: 'Everest Base Camp, Nepal', lastUpdated: new Date().toISOString() },
          { id: 330, name: 'Lumbini, Nepal', lastUpdated: new Date().toISOString() },
          { id: 331, name: 'Thimphu, Bhutan', lastUpdated: new Date().toISOString() },
          { id: 332, name: 'Paro, Bhutan', lastUpdated: new Date().toISOString() },
          { id: 333, name: 'Punakha, Bhutan', lastUpdated: new Date().toISOString() },
          { id: 334, name: 'Dhaka, Bangladesh', lastUpdated: new Date().toISOString() },
          { id: 335, name: 'Chittagong, Bangladesh', lastUpdated: new Date().toISOString() },
          { id: 336, name: 'Sylhet, Bangladesh', lastUpdated: new Date().toISOString() },
          { id: 337, name: 'Coxs Bazar, Bangladesh', lastUpdated: new Date().toISOString() },
          { id: 338, name: 'Sundarbans, Bangladesh', lastUpdated: new Date().toISOString() },
          { id: 339, name: 'Colombo, Sri Lanka', lastUpdated: new Date().toISOString() },
          { id: 340, name: 'Kandy, Sri Lanka', lastUpdated: new Date().toISOString() },
          { id: 341, name: 'Galle, Sri Lanka', lastUpdated: new Date().toISOString() },
          { id: 342, name: 'Sigiriya, Sri Lanka', lastUpdated: new Date().toISOString() },
          { id: 343, name: 'Nuwara Eliya, Sri Lanka', lastUpdated: new Date().toISOString() },
          { id: 344, name: 'Anuradhapura, Sri Lanka', lastUpdated: new Date().toISOString() },
          { id: 345, name: 'Male, Maldives', lastUpdated: new Date().toISOString() },
          { id: 346, name: 'Hulhumale, Maldives', lastUpdated: new Date().toISOString() },
          { id: 347, name: 'Maafushi, Maldives', lastUpdated: new Date().toISOString() },
          { id: 348, name: 'Villingili, Maldives', lastUpdated: new Date().toISOString() },
          { id: 349, name: 'Chennai, India', lastUpdated: new Date().toISOString() },
          { id: 350, name: 'Kolkata, India', lastUpdated: new Date().toISOString() },
          { id: 351, name: 'Hyderabad, India', lastUpdated: new Date().toISOString() },
          { id: 352, name: 'Pune, India', lastUpdated: new Date().toISOString() },
          { id: 353, name: 'Ahmedabad, India', lastUpdated: new Date().toISOString() },
          { id: 354, name: 'Jaipur, India', lastUpdated: new Date().toISOString() },
          { id: 355, name: 'Udaipur, India', lastUpdated: new Date().toISOString() },
          { id: 356, name: 'Jodhpur, India', lastUpdated: new Date().toISOString() },
          { id: 357, name: 'Agra, India', lastUpdated: new Date().toISOString() },
          { id: 358, name: 'Varanasi, India', lastUpdated: new Date().toISOString() },
          { id: 359, name: 'Rishikesh, India', lastUpdated: new Date().toISOString() },
          { id: 360, name: 'Dharamshala, India', lastUpdated: new Date().toISOString() },
          { id: 361, name: 'Manali, India', lastUpdated: new Date().toISOString() },
          { id: 362, name: 'Shimla, India', lastUpdated: new Date().toISOString() },
          { id: 363, name: 'Leh, India', lastUpdated: new Date().toISOString() },
          { id: 364, name: 'Srinagar, India', lastUpdated: new Date().toISOString() },
          { id: 365, name: 'Goa, India', lastUpdated: new Date().toISOString() },
          { id: 366, name: 'Kochi, India', lastUpdated: new Date().toISOString() },
          { id: 367, name: 'Munnar, India', lastUpdated: new Date().toISOString() },
          { id: 368, name: 'Alleppey, India', lastUpdated: new Date().toISOString() },
          { id: 369, name: 'Mysore, India', lastUpdated: new Date().toISOString() },
          { id: 370, name: 'Hampi, India', lastUpdated: new Date().toISOString() },
          { id: 371, name: 'Gokarna, India', lastUpdated: new Date().toISOString() },
          { id: 372, name: 'Pondicherry, India', lastUpdated: new Date().toISOString() },
          { id: 373, name: 'Darjeeling, India', lastUpdated: new Date().toISOString() },
          { id: 374, name: 'Gangtok, India', lastUpdated: new Date().toISOString() },
          { id: 375, name: 'Shillong, India', lastUpdated: new Date().toISOString() },
          { id: 376, name: 'Imphal, India', lastUpdated: new Date().toISOString() },
          { id: 377, name: 'Kohima, India', lastUpdated: new Date().toISOString() },
          { id: 378, name: 'Aizawl, India', lastUpdated: new Date().toISOString() },
          { id: 379, name: 'Itanagar, India', lastUpdated: new Date().toISOString() },
          { id: 380, name: 'Port Blair, India', lastUpdated: new Date().toISOString() }
        ];
      }

      this.cache.destinations = destinations;

      await this.saveCache();
      console.log(`✅ Updated ${destinations.length} destinations`);
    } catch (error) {
      console.error('❌ Error updating destinations:', error);
    }
  }

  async initializeAuxiliaryData() {
    await this.loadCache();

    // Schedule periodic updates
    this.scheduleUpdates();

    // Perform initial update if cache is empty
    if (this.cache.destinations.length === 0) {
      await this.updateDestinations();
    }
  }

  private shouldUpdateData(dataType: keyof typeof this.UPDATE_INTERVALS): boolean {
    const interval = this.UPDATE_INTERVALS[dataType];

    if (dataType === 'destinations' && this.cache.destinations.length > 0) {
      const lastUpdate = new Date(this.cache.destinations[0]?.lastUpdated || 0);
      const hoursSinceUpdate = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60);
      return hoursSinceUpdate >= interval;
    }

    return true; // Default to update if unsure
  }

  private scheduleUpdates() {
    // Schedule weekly destination updates
    setInterval(async () => {
      console.log('📅 Scheduled destination update triggered');
      await this.updateDestinations();
    }, this.UPDATE_INTERVALS.destinations * 60 * 60 * 1000);

    console.log('✅ Scheduled auxiliary data updates configured');
  }

  private async loadCache() {
    try {
      const fs = await import('fs');
      if (fs.existsSync(this.CACHE_FILE)) {
        const data = fs.readFileSync(this.CACHE_FILE, 'utf8');
        this.cache = { ...this.cache, ...JSON.parse(data) };
        console.log('📋 Loaded auxiliary data cache from disk');
      }
    } catch (error) {
      console.error('❌ Error loading auxiliary data cache:', error);
    }
  }

  private async saveCache() {
    try {
      const fs = await import('fs');
      fs.writeFileSync(this.CACHE_FILE, JSON.stringify(this.cache, null, 2));
    } catch (error) {
      console.error('❌ Error saving auxiliary data cache:', error);
    }
  }

  // Helper to load from a specific file (used for destinations cache)
  private async loadFromFile(filePath: string): Promise<any> {
    const fs = await import('fs/promises');
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      console.log(`📄 Error loading from ${filePath}:`, error);
      // If file is corrupted or doesn't exist, return null to trigger fresh fetch
      return null;
    }
  }

  // Helper to save to a specific file
  private async saveToFile(filePath: string, data: any): Promise<void> {
    const fs = await import('fs/promises');
    try {
      await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error(`❌ Error saving to ${filePath}:`, error);
    }
  }

  // Enhanced location management
  async getLocationDetails(locationRef: string) {
    const cached = this.cache.locations.find(loc => loc.id === locationRef);

    if (cached) {
      const hoursSinceUpdate = (Date.now() - new Date(cached.lastUpdated).getTime()) / (1000 * 60 * 60);
      if (hoursSinceUpdate < this.UPDATE_INTERVALS.locations) {
        return cached.details;
      }
    }

    // Fetch fresh location data (would need Viator locations endpoint)
    try {
      // This would call viator's location details endpoint
      // const locationDetails = await viatorService.getLocationDetails(locationRef);

      // For now, return cached data or null
      return cached?.details || null;
    } catch (error) {
      console.error('Error fetching location details:', error);
      return cached?.details || null;
    }
  }

  // Get cache statistics for monitoring
  getCacheStats() {
    return {
      currentVersion: this.USE_V2_DESTINATION_CACHE ? 'V2' : 'V1',
      destinations: {
        count: this.cache.destinations.length,
        lastUpdated: this.cache.destinations[0]?.lastUpdated || 'Never',
        nextUpdate: this.getNextUpdateTime('destinations')
      },
      tags: {
        count: this.cache.tags.length,
        lastUpdated: this.cache.tags[0]?.lastUpdated || 'Never'
      },
      locations: {
        count: this.cache.locations.length
      }
    };
  }

  /**
   * 🔧 CACHE VERSION MANAGEMENT
   */
  async testV2Cache(strategy: 'aggressive' | 'conservative' | 'hybrid' = 'hybrid') {
    console.log(`🧪 Testing V2 destination cache with ${strategy} strategy...`);
    
    const { destinationCacheV2 } = await import('./destination-cache-v2');
    const startTime = Date.now();
    
    try {
      const results = await destinationCacheV2.getDestinationsV2(strategy);
      const endTime = Date.now();
      
      console.log(`✅ V2 Cache Test Results:`);
      console.log(`  Strategy: ${strategy}`);
      console.log(`  Destinations: ${results.length}`);
      console.log(`  Time: ${endTime - startTime}ms`);
      console.log(`  Sample: ${results.slice(0, 3).map(d => d.name).join(', ')}`);
      
      return {
        success: true,
        strategy,
        count: results.length,
        timeMs: endTime - startTime,
        sample: results.slice(0, 5)
      };
    } catch (error) {
      console.error(`❌ V2 Cache Test Failed:`, error);
      return {
        success: false,
        strategy,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private getNextUpdateTime(dataType: keyof typeof this.UPDATE_INTERVALS): string {
    const interval = this.UPDATE_INTERVALS[dataType];

    if (dataType === 'destinations' && this.cache.destinations.length > 0) {
      const lastUpdate = new Date(this.cache.destinations[0]?.lastUpdated || 0);
      const nextUpdate = new Date(lastUpdate.getTime() + (interval * 60 * 60 * 1000));
      return nextUpdate.toISOString();
    }

    return 'Unknown';
  }

  // Use cached destinations and supplement with critical missing destinations
  private async fetchFreshDestinations(): Promise<Destination[]> {
    console.log('🔄 Fetching fresh destinations from Viator API...');

    try {
      // Get API key from environment
      const apiKey = process.env.VIATOR_API_KEY;
      if (!apiKey) {
        console.error('❌ VIATOR_API_KEY not found in environment variables');
        throw new Error('Viator API key not configured');
      }

      console.log('🌐 Making API call to Viator destinations endpoint...');

      // Make the actual API call to Viator
      const response = await axios.get('https://api.viator.com/partner/destinations', {
        headers: {
          'Accept': 'application/json;version=2.0',
          'exp-api-key': apiKey
        },
        timeout: 30000
      });

      const destinations = response.data?.destinations || [];
      if (destinations.length === 0) {
        console.warn('⚠️ Empty destinations response from Viator API');
        // Fall back to existing cache if available
        if (this.cache.destinations.length > 0) {
          console.log(`📋 Falling back to existing cache: ${this.cache.destinations.length} destinations`);
          return this.cache.destinations;
        }
        throw new Error('Empty destinations response and no cache available');
      }

      console.log(`📥 Received ${destinations.length} raw destinations from Viator API`);

      // Process all destinations with enhanced filtering for quality
      const processedDestinations = destinations
        .filter((dest: any) => {
          // Filter out invalid entries
          return dest.destinationId && 
                 (dest.destinationName || dest.name) && 
                 dest.selectable !== false;
        })
        .map((dest: any) => ({
          id: dest.destinationId,
          name: dest.destinationName || dest.name,
          lastUpdated: new Date().toISOString()
        }))
        .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name)); // Sort alphabetically

      console.log(`📊 Processed ${processedDestinations.length} valid destinations`);

      // HAWAII VALIDATION: Check if Hawaii destinations are included
      const hawaiiDestinations = processedDestinations.filter((dest: { name: string }) =>
        dest.name.toLowerCase().includes('hawaii') || 
        dest.name.toLowerCase().includes('honolulu') ||
        dest.name.toLowerCase().includes('maui') ||
        dest.name.toLowerCase().includes('oahu') ||
        dest.name.toLowerCase().includes('kauai') ||
        dest.name.toLowerCase().includes('big island') ||
        dest.name.toLowerCase().includes('kona') ||
        dest.name.toLowerCase().includes('hilo')
      );

      console.log(`🏝️ Found ${hawaiiDestinations.length} Hawaii-related destinations:`);
      hawaiiDestinations.forEach((dest: { name: string; id: any }) => {
        console.log(`   - ${dest.name} (ID: ${dest.id})`);
      });

      if (hawaiiDestinations.length === 0) {
        console.error('⚠️ WARNING: No Hawaii destinations found in API response!');
        console.log('🔍 Sample destination names:', processedDestinations.slice(0, 10).map((d: { name: string }) => d.name));
      } else {
        console.log('✅ Hawaii destinations successfully included in cache');
      }

      // Update memory cache
      this.destinationsCache = processedDestinations;
      this.destinationsCacheLoadedAt = Date.now();

      // Save to file cache
      await this.saveToFile(this.DESTINATIONS_FILE, {
        destinations: processedDestinations,
        lastUpdated: new Date().toISOString(),
        totalCount: processedDestinations.length
      });

      // Update main cache
      this.cache.destinations = processedDestinations;
      await this.saveCache();

      console.log(`✅ Successfully cached ${processedDestinations.length} destinations (Hawaii included: ${hawaiiDestinations.length > 0})`);
      return processedDestinations;

    } catch (error) {
      console.error('❌ Failed to fetch destinations from API:', error);

      // Fall back to existing cache if available
      if (this.cache.destinations.length > 0) {
        console.log(`📋 API failed, using existing cache: ${this.cache.destinations.length} destinations`);
        return this.cache.destinations;
      }

      // If no cache and hardcoded fallback needed, use a minimal set
      console.warn('⚠️ Using minimal hardcoded destination set as last resort');
      const fallbackDestinations = [
        { id: 1, name: 'Tokyo, Japan', lastUpdated: new Date().toISOString() },
        { id: 479, name: 'Paris, France', lastUpdated: new Date().toISOString() },
        { id: 737, name: 'London, United Kingdom', lastUpdated: new Date().toISOString() },
        { id: 511, name: 'Rome, Italy', lastUpdated: new Date().toISOString() },
        { id: 562, name: 'Barcelona, Spain', lastUpdated: new Date().toISOString() },
        { id: 999981, name: 'Honolulu, Hawaii', lastUpdated: new Date().toISOString() },
        { id: 999982, name: 'Maui, Hawaii', lastUpdated: new Date().toISOString() }
      ];

      this.destinationsCache = fallbackDestinations;
      this.destinationsCacheLoadedAt = Date.now();
      this.cache.destinations = fallbackDestinations;
      await this.saveCache();

      return fallbackDestinations;
    }
  }
}

export const auxiliaryDataManager = new AuxiliaryDataManager();