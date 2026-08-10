import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { EnhancedSearch } from './enhanced-search';
import { EnhancedActivityCard } from './enhanced-activity-card';
import { 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Zap, 
  Database, 
  Calendar,
  Star,
  MapPin,
  Clock
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

export function ComprehensiveDemo() {
  const [testProductCode, setTestProductCode] = useState('5010SYDNEY');
  const [testDate, setTestDate] = useState('2025-07-01');
  const [searchQuery, setSearchQuery] = useState('Berlin food tours');
  const [destinationQuery, setDestinationQuery] = useState('To');

  // Test API access capabilities
  const { data: apiTest, isLoading: apiTestLoading } = useQuery({
    queryKey: ['api-test'],
    queryFn: async () => {
      const response = await fetch('/api/viator/test-access');
      return response.json();
    }
  });

  // Test enhanced search
  const { data: searchTest, isLoading: searchLoading, refetch: searchRefetch } = useQuery({
    queryKey: ['search-test', searchQuery],
    queryFn: async () => {
      const response = await fetch('/api/search/enhanced', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: searchQuery,
          currency: 'USD',
          includeReviews: true,
          limit: 6
        })
      });
      return response.json();
    },
    enabled: false
  });

  // Test smart destination matching
  const { data: destinationTest, isLoading: destinationLoading, refetch: destinationRefetch } = useQuery({
    queryKey: ['destination-test', destinationQuery],
    queryFn: async () => {
      const response = await fetch(`/api/destinations/search?query=${encodeURIComponent(destinationQuery)}&limit=10`);
      return response.json();
    },
    enabled: false
  });

  const renderApiStatus = () => (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            API Access Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          {apiTestLoading ? (
            <div className="text-center py-4">Testing API access...</div>
          ) : apiTest ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                {apiTest.success ? (
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-600" />
                )}
                <span className="font-medium">
                  API Status: {apiTest.success ? 'Connected' : 'Limited Access'}
                </span>
              </div>
              
              <div className="grid gap-2">
                <h4 className="font-medium">Available Endpoints:</h4>
                {apiTest.accessibleEndpoints?.map((endpoint: string) => (
                  <Badge key={endpoint} variant="default" className="w-fit">
                    {endpoint}
                  </Badge>
                ))}
              </div>
              
              {apiTest.error && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{apiTest.error}</AlertDescription>
                </Alert>
              )}
            </div>
          ) : (
            <div className="text-center text-gray-500">Failed to load API status</div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  const renderSearchDemo = () => (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="w-5 h-5" />
            Enhanced Search Demo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search for activities..."
            />
            <Button 
              onClick={() => searchRefetch()} 
              disabled={searchLoading}
              className="w-full"
            >
              {searchLoading ? 'Searching...' : 'Test Enhanced Search'}
            </Button>
          </div>
          
          {searchTest && (
            <div className="space-y-3">
              <h4 className="font-medium">Search Results:</h4>
              {searchTest.activities?.length > 0 ? (
                <div className="grid gap-4">
                  {searchTest.activities.slice(0, 3).map((activity: any) => (
                    <div key={activity.productCode} className="border rounded-lg p-4">
                      <h5 className="font-medium">{activity.title}</h5>
                      <p className="text-sm text-gray-700 mt-2 line-clamp-2">
                        {activity.description}
                      </p>
                      {activity.price && (
                        <div className="text-sm font-medium mt-2">
                          {activity.price.currency} {activity.price.amount}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500">No results found</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  const renderDestinationDemo = () => (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5" />
            Smart Destination Auto-Correct Demo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm text-gray-600">
              Test smart fuzzy matching for destination auto-correct. Try typing partial city names like "To", "Par", "Lond"
            </p>
            <Input
              value={destinationQuery}
              onChange={(e) => setDestinationQuery(e.target.value)}
              placeholder="Type destination (e.g., 'To', 'Par', 'New Y')"
            />
            <Button 
              onClick={() => destinationRefetch()} 
              disabled={destinationLoading}
              className="w-full"
            >
              {destinationLoading ? 'Searching...' : 'Test Smart Matching'}
            </Button>
          </div>
          
          {destinationTest && (
            <div className="space-y-3">
              <h4 className="font-medium">Smart Matches for "{destinationTest.query}":</h4>
              {destinationTest.matches?.length > 0 ? (
                <div className="space-y-2">
                  {destinationTest.matches.map((match: any, index: number) => (
                    <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <div className="font-medium">{match.name}</div>
                        <div className="text-sm text-gray-500">
                          Match Type: {match.matchType} | Score: {match.score}
                        </div>
                      </div>
                      <Badge variant={match.matchType === 'starts_with' ? 'default' : 'secondary'}>
                        {match.matchType}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500">No matches found</p>
              )}
              
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Smart matching uses fuzzy logic, starts-with prioritization, and acronym detection.
                  Try "To" to see Tokyo suggestions instead of Brighton.
                </AlertDescription>
              </Alert>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  const renderCalendarDemo = () => (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Real-Time Calendar with Precise Timing
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm text-gray-600">
              Advanced calendar system using actual activity durations and start/end times instead of basic time blocks.
            </p>
            
            <Alert>
              <Zap className="h-4 w-4" />
              <AlertDescription>
                Features: Conflict detection, travel time calculation, schedule optimization, 
                drag & drop rescheduling, and custom activity creation with precise timing.
              </AlertDescription>
            </Alert>
            
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="font-medium mb-3">Sample Activities with Real Times:</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center">
                  <span>🎌 Tokyo Food Tour</span>
                  <span className="text-gray-600">3.5 hours (10:00 AM - 1:30 PM)</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>🏛️ Imperial Palace Visit</span>
                  <span className="text-gray-600">2 hours (2:00 PM - 4:00 PM)</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>🌸 Senso-ji Temple</span>
                  <span className="text-gray-600">1.5 hours (4:30 PM - 6:00 PM)</span>
                </div>
              </div>
              
              <div className="mt-3 p-2 bg-blue-50 rounded text-xs">
                Auto-detected: 30min travel time between Imperial Palace and Senso-ji
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-green-50 p-3 rounded-lg">
                <div className="font-medium text-green-800 text-sm">Enhanced Features</div>
                <ul className="text-xs text-green-700 mt-1 space-y-1">
                  <li>• Real activity durations parsed from descriptions</li>
                  <li>• Conflict detection and warnings</li>
                  <li>• Automatic travel time calculation</li>
                  <li>• Smart schedule optimization</li>
                </ul>
              </div>
              
              <div className="bg-blue-50 p-3 rounded-lg">
                <div className="font-medium text-blue-800 text-sm">User Experience</div>
                <ul className="text-xs text-blue-700 mt-1 space-y-1">
                  <li>• Drag & drop rescheduling</li>
                  <li>• Custom activity creation</li>
                  <li>• Visual conflict indicators</li>
                  <li>• One-click optimization</li>
                </ul>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderImplementedFeatures = () => (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5" />
            Implementation Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            <div>
              <h4 className="font-medium text-green-600 mb-2">✓ Available & Working</h4>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <span>Smart Destination Auto-Correct with Fuzzy Matching</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <span>Real-Time Calendar with Precise Activity Timing</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <span>Enhanced Search with Destination Detection</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <span>Smart Activity Cards with Detailed Information</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <span>Comprehensive API Testing & Monitoring</span>
                </div>
              </div>
            </div>

            <div>
              <h4 className="font-medium text-blue-600 mb-2">Ready for Full Access</h4>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-blue-600" />
                  <span>Real-time Availability Checking (API limits)</span>
                </div>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-blue-600" />
                  <span>Bulk Product Details & Enhanced Data (API limits)</span>
                </div>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-blue-600" />
                  <span>AI Product Recommendations (API limits)</span>
                </div>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-blue-600" />
                  <span>Authentic Customer Reviews (API limits)</span>
                </div>
              </div>
            </div>

            <Alert>
              <Database className="h-4 w-4" />
              <AlertDescription>
                All Full Access endpoints are implemented and ready. The system gracefully handles 
                sandbox limitations while providing maximum value with available endpoints.
              </AlertDescription>
            </Alert>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-2">Enhanced Travel Planning Features</h1>
        <p className="text-gray-600">
          Smart destination auto-correct and real-time calendar with precise activity timing
        </p>
      </div>

      <Tabs defaultValue="destinations" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="destinations">Smart Destinations</TabsTrigger>
          <TabsTrigger value="calendar">Real-Time Calendar</TabsTrigger>
          <TabsTrigger value="search">Enhanced Search</TabsTrigger>
          <TabsTrigger value="status">API Status</TabsTrigger>
          <TabsTrigger value="features">All Features</TabsTrigger>
        </TabsList>
        
        <TabsContent value="destinations">{renderDestinationDemo()}</TabsContent>
        <TabsContent value="calendar">{renderCalendarDemo()}</TabsContent>
        <TabsContent value="search">{renderSearchDemo()}</TabsContent>
        <TabsContent value="status">{renderApiStatus()}</TabsContent>
        <TabsContent value="features">{renderImplementedFeatures()}</TabsContent>
      </Tabs>
    </div>
  );
}