// API response caching for Phase 2 performance improvements
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class APICache {
  private cache = new Map<string, CacheEntry<any>>();
  private maxSize = 100; // Maximum number of cached entries
  private defaultTTL = 5 * 60 * 1000; // 5 minutes default TTL

  set<T>(key: string, data: T, ttl: number = this.defaultTTL): void {
    // Clean up expired entries
    this.cleanup();
    
    // If cache is full, remove oldest entry
    if (this.cache.size >= this.maxSize) {
      const oldestKey = Array.from(this.cache.keys())[0];
      if (oldestKey) this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    // Check if entry has expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  clear(): void {
    this.cache.clear();
  }

  private cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];
    
    this.cache.forEach((entry, key) => {
      if (now - entry.timestamp > entry.ttl) {
        keysToDelete.push(key);
      }
    });
    
    keysToDelete.forEach(key => this.cache.delete(key));
  }

  // Get cache statistics for performance monitoring
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: this.getHitRate(),
      expiredEntries: this.getExpiredCount()
    };
  }

  private hitCount = 0;
  private missCount = 0;

  trackHit(): void {
    this.hitCount++;
  }

  trackMiss(): void {
    this.missCount++;
  }

  private getHitRate(): number {
    const total = this.hitCount + this.missCount;
    return total > 0 ? (this.hitCount / total) * 100 : 0;
  }

  private getExpiredCount(): number {
    const now = Date.now();
    let expired = 0;
    this.cache.forEach(entry => {
      if (now - entry.timestamp > entry.ttl) {
        expired++;
      }
    });
    return expired;
  }
}

// Global cache instance
export const apiCache = new APICache();

// Cache key generators for consistent caching
export const cacheKeys = {
  activities: (query: string, destination?: string) => 
    `activities:${query}:${destination || 'any'}`,
  
  destinations: (query: string) => 
    `destinations:${query}`,
  
  availability: (productCode: string, date: string) => 
    `availability:${productCode}:${date}`,
  
  productDetails: (productCode: string) => 
    `product:${productCode}`,
  
  conversations: (sessionId: string) => 
    `conversation:${sessionId}`,
  
  itinerary: (id: string) => 
    `itinerary:${id}`
};

// Enhanced fetch with caching
export async function cachedFetch<T>(
  url: string, 
  options: RequestInit = {}, 
  cacheKey?: string,
  ttl?: number
): Promise<T> {
  const key = cacheKey || url;
  
  // Try to get from cache first
  const cached = apiCache.get<T>(key);
  if (cached) {
    apiCache.trackHit();
    return cached;
  }
  
  apiCache.trackMiss();
  
  // Fetch from API
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }
  
  const data = await response.json();
  
  // Store in cache
  apiCache.set(key, data, ttl);
  
  return data;
}