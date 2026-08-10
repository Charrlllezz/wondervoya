import { useState, useCallback, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { EnhancedActivityCard } from './enhanced-activity-card';
import { Search, Filter, Calendar, Zap, RefreshCw } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import type { ActivityRecommendation } from '@shared/schema';

interface EnhancedSearchProps {
  onActivitySelect?: (activity: ActivityRecommendation) => void;
  selectedDate?: string;
  onDateChange?: (date: string) => void;
}

export function EnhancedSearch({ onActivitySelect, selectedDate, onDateChange }: EnhancedSearchProps) {
  const [query, setQuery] = useState('');
  const [showAvailability, setShowAvailability] = useState(false);
  const [includeReviews, setIncludeReviews] = useState(true);
  const [currency, setCurrency] = useState('USD');
  const [lastSearchQuery, setLastSearchQuery] = useState('');

  // Enhanced search with real-time features
  const { data: searchResults, isLoading, error, refetch } = useQuery({
    queryKey: ['enhanced-search', lastSearchQuery, currency, includeReviews],
    queryFn: async () => {
      if (!lastSearchQuery.trim()) return null;
      
      const response = await fetch('/api/search/enhanced', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: lastSearchQuery,
          currency,
          includeRecommendations: true,
          includeReviews,
          limit: 12
        })
      });
      
      if (!response.ok) {
        throw new Error('Search failed');
      }
      
      return response.json();
    },
    enabled: !!lastSearchQuery.trim()
  });

  // Bulk availability check for all results
  const { data: bulkAvailability, isLoading: availabilityLoading } = useQuery({
    queryKey: ['bulk-availability', searchResults?.activities?.map((a: any) => a.productCode), selectedDate],
    queryFn: async () => {
      if (!searchResults?.activities?.length || !selectedDate || !showAvailability) return null;
      
      const productCodes = searchResults.activities.map((a: any) => a.productCode);
      
      const response = await fetch('/api/activities/availability/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productCodes })
      });
      
      if (!response.ok) return null;
      return response.json();
    },
    enabled: !!(searchResults?.activities?.length && selectedDate && showAvailability)
  });

  const handleSearch = useCallback(() => {
    if (query.trim()) {
      setLastSearchQuery(query.trim());
    }
  }, [query]);

  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  }, [handleSearch]);

  const getActivityAvailability = (productCode: string) => {
    if (!bulkAvailability?.schedules) return null;
    return bulkAvailability.schedules.find((s: any) => s.productCode === productCode);
  };

  return (
    <div className="space-y-6">
      {/* Enhanced Search Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-blue-600" />
            Enhanced Activity Search
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search Input */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Search for activities, tours, experiences..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyPress={handleKeyPress}
                className="pl-10"
              />
            </div>
            <Button onClick={handleSearch} disabled={isLoading}>
              {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Search'}
            </Button>
          </div>

          {/* Search Options */}
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex items-center space-x-2">
              <Switch
                id="show-availability"
                checked={showAvailability}
                onCheckedChange={setShowAvailability}
              />
              <Label htmlFor="show-availability" className="text-sm">
                Real-time availability
              </Label>
            </div>
            
            <div className="flex items-center space-x-2">
              <Switch
                id="include-reviews"
                checked={includeReviews}
                onCheckedChange={setIncludeReviews}
              />
              <Label htmlFor="include-reviews" className="text-sm">
                Include reviews
              </Label>
            </div>

            {showAvailability && (
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-gray-500" />
                <Input
                  type="date"
                  value={selectedDate || ''}
                  onChange={(e) => onDateChange?.(e.target.value)}
                  className="w-40"
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
            )}

            {availabilityLoading && showAvailability && (
              <Badge variant="outline" className="animate-pulse">
                Checking availability...
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Search Results */}
      {isLoading && (
        <Card>
          <CardContent className="text-center py-8">
            <div className="relative mb-6">
              <div className="relative w-12 h-12 mx-auto">
                <svg
                  className="w-12 h-12 text-gray-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  style={{
                    filter: 'drop-shadow(0 0 8px rgba(100,100,100,0.4))',
                    animation: 'spin 3s linear infinite'
                  }}
                >
                  <circle cx="12" cy="12" r="11" stroke="currentColor" strokeWidth="0.5" opacity="0.4"/>
                  <path stroke="currentColor" strokeWidth="1" strokeLinecap="round" d="M12 1L12 3" opacity="0.6"/>
                  <path stroke="currentColor" strokeWidth="1" strokeLinecap="round" d="M12 21L12 23" opacity="0.6"/>
                  <path stroke="currentColor" strokeWidth="1" strokeLinecap="round" d="M1 12L3 12" opacity="0.6"/>
                  <path stroke="currentColor" strokeWidth="1" strokeLinecap="round" d="M21 12L23 12" opacity="0.6"/>
                  <circle cx="12" cy="12" r="1" fill="currentColor"/>
                  <path fill="currentColor" d="M12 4L13 11L12 12L11 11Z" opacity="0.9"/>
                  <path fill="currentColor" d="M12 20L11 13L12 12L13 13Z" opacity="0.5"/>
                </svg>
              </div>
            </div>
            <p className="text-gray-600">Searching for activities...</p>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card>
          <CardContent className="text-center py-8">
            <p className="text-red-600">Search failed. Please try again.</p>
          </CardContent>
        </Card>
      )}

      {searchResults && (
        <div className="space-y-6">
          {/* Results Header */}
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">
              Found {searchResults.activities?.length || 0} activities for "{lastSearchQuery}"
            </h3>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>

          {/* Enhanced Results Grid */}
          {searchResults.activities?.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {searchResults.activities.map((activity: ActivityRecommendation) => (
                <EnhancedActivityCard
                  key={activity.productCode}
                  activity={activity}
                  onAddToItinerary={onActivitySelect}
                  onViewDetails={(activity) => {
                    window.open(activity.bookingUrl || activity.productUrl, '_blank');
                  }}
                  showAvailability={showAvailability}
                  selectedDate={selectedDate}
                />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="text-center py-8">
                <p className="text-gray-600">No activities found. Try a different search term.</p>
              </CardContent>
            </Card>
          )}

          {/* Bulk Availability Summary */}
          {showAvailability && bulkAvailability?.schedules && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Availability Summary for {selectedDate}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {bulkAvailability.schedules.filter((s: any) => s.bookableItems?.length > 0).length}
                    </div>
                    <div className="text-sm text-gray-600">Available</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-600">
                      {bulkAvailability.schedules.filter((s: any) => !s.bookableItems?.length).length}
                    </div>
                    <div className="text-sm text-gray-600">Unavailable</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {bulkAvailability.schedules.length}
                    </div>
                    <div className="text-sm text-gray-600">Total Checked</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Search Tips */}
      {!lastSearchQuery && (
        <Card>
          <CardContent className="py-6">
            <h4 className="font-medium mb-3">Search Tips</h4>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• Try searching for destinations: "Berlin food tours", "Tokyo temples"</li>
              <li>• Search by activity type: "cooking classes", "bike tours", "museums"</li>
              <li>• Enable real-time availability to see live pricing and schedules</li>
              <li>• Include reviews to see authentic customer feedback</li>
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}