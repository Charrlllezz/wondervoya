import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getItineraries, createItinerary, deleteItinerary } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Link, useLocation } from 'wouter';
import { Calendar, MapPin, Plus, Users, Clock, ArrowLeft, Trash2, MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ChatPageVideoCarousel } from '@/components/chat-page-video-carousel';
import type { TripItinerary } from '@shared/schema';
import { globalVideoState } from '../lib/global-video-state';
import { navigateWithVideoState } from '../lib/navigation';

// Utility function to select the best cover image from an itinerary
function selectBestCoverImage(itinerary: TripItinerary): string | null {
  const candidates: Array<{ url: string; score: number }> = [];

  // Check scheduled activities first (highest priority)
  itinerary.days.forEach(day => {
    day.timeSlots.forEach(slot => {
      if (slot.activity && slot.activity.imageUrl) {
        const activity = slot.activity;
        let score = (activity.rating || 0) * 10; // Base score from rating

        // Bonus for iconic landmarks
        const title = activity.title.toLowerCase();
        if (title.includes('eiffel tower') || title.includes('louvre') || 
            title.includes('versailles') || title.includes('notre dame') ||
            title.includes('colosseum') || title.includes('big ben')) {
          score += 20;
        }

        // Bonus for high-quality Viator images
        if (activity.imageUrl.includes('viator.com')) {
          score += 10;
        }

        candidates.push({ url: activity.imageUrl, score });
      }
    });
  });

  // Check unscheduled activities as fallback
  itinerary.activities?.forEach(savedActivity => {
    if (savedActivity.activityData.imageUrl) {
      const activity = savedActivity.activityData;
      let score = (activity.rating || 0) * 8; // Slightly lower score for unscheduled

      if (activity.imageUrl.includes('viator.com')) {
        score += 8;
      }

      candidates.push({ url: activity.imageUrl, score });
    }
  });

  // Return the highest-scoring image
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].url;
}

export default function Itineraries() {
  const [, setLocation] = useLocation();
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newItineraryTitle, setNewItineraryTitle] = useState('');
  const [newItineraryDestination, setNewItineraryDestination] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: itineraries = [], isLoading } = useQuery({
    queryKey: ['/api/itineraries'],
    queryFn: getItineraries,
  });

  const createItineraryMutation = useMutation({
    mutationFn: createItinerary,
    onSuccess: (newItinerary) => {
      queryClient.invalidateQueries({ queryKey: ['/api/itineraries'] });
      setIsCreatingNew(false);
      setNewItineraryTitle('');
      setNewItineraryDestination('');
      toast({
        title: "Itinerary Created",
        description: `"${newItinerary.title}" has been created successfully.`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create itinerary. Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteItineraryMutation = useMutation({
    mutationFn: deleteItinerary,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/itineraries'] });
      toast({
        title: "Itinerary Deleted",
        description: "The itinerary has been permanently deleted.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete itinerary. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleCreateItinerary = () => {
    if (!newItineraryTitle.trim() || !newItineraryDestination.trim()) {
      toast({
        title: "Missing Information",
        description: "Please enter both a title and destination for your itinerary.",
        variant: "destructive",
      });
      return;
    }

    createItineraryMutation.mutate({
      title: newItineraryTitle.trim(),
      destination: newItineraryDestination.trim(),
    });
  };

  const handleDeleteItinerary = (itineraryId: string, itineraryTitle: string, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    if (window.confirm(`Are you sure you want to permanently delete "${itineraryTitle}"? This action cannot be undone.`)) {
      deleteItineraryMutation.mutate(itineraryId);
    }
  };

  const formatDateRange = (startDate: string, endDate: string) => {
    if (!startDate || !endDate) return "Dates not set";

    try {
      console.log('🔍 Formatting date range:', { startDate, endDate });

      // Parse dates properly - handle both YYYY-MM-DD and ISO formats
      let start: Date, end: Date;

      if (startDate.includes('T')) {
        // ISO format
        start = new Date(startDate);
        end = new Date(endDate);
      } else {
        // YYYY-MM-DD format - parse as UTC to avoid timezone issues
        start = new Date(startDate + 'T00:00:00.000Z');
        end = new Date(endDate + 'T00:00:00.000Z');
      }

      // Validate parsed dates
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        console.error('Invalid dates during formatting:', { startDate, endDate });
        return "Invalid dates";
      }

      console.log('✅ Parsed dates successfully:', { 
        start: start.toISOString(), 
        end: end.toISOString(),
        startUTC: start.getUTCDate(),
        endUTC: end.getUTCDate()
      });

      const options: Intl.DateTimeFormatOptions = { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric',
        timeZone: 'UTC'
      };

      // Format based on year/month differences
      if (start.getUTCFullYear() === end.getUTCFullYear()) {
        if (start.getUTCMonth() === end.getUTCMonth()) {
          // Same month and year - show "Jul 20 - 24, 2025"
          const formattedResult = `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })} - ${end.getUTCDate()}, ${start.getUTCFullYear()}`;
          console.log('✅ Same month formatting result:', formattedResult);
          return formattedResult;
        }
        // Same year, different months - show "Jul 20 - Aug 24, 2025"
        const formattedResult = `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}, ${start.getUTCFullYear()}`;
        console.log('✅ Same year formatting result:', formattedResult);
        return formattedResult;
      }

      // Different years - show "Jul 20, 2025 - Jan 24, 2026"
      const formattedResult = `${start.toLocaleDateString('en-US', options)} - ${end.toLocaleDateString('en-US', options)}`;
      console.log('✅ Different years formatting result:', formattedResult);
      return formattedResult;
    } catch (error) {
      console.error('Date formatting error:', error, { startDate, endDate });
      return "Dates not set";
    }
  };

  const [showItineraryManager, setShowItineraryManager] = useState(false);
  const [selectedItinerary, setSelectedItinerary] = useState<any>(null);

  // Handle video state based on navigation source
  useEffect(() => {
    // Add a small delay to ensure session storage from navigation is available
    const handleVideoState = () => {
      const previousPage = sessionStorage.getItem('currentPage');
      const navigationSource = sessionStorage.getItem('navigationSource');
      console.log(`🎬 Itineraries page: Previous page was '${previousPage}'`);
      console.log(`🎬 Itineraries page: Navigation source was '${navigationSource}'`);
      console.log(`🎬 Current video index before decision: ${globalVideoState.getCurrentIndex()}`);
      console.log(`🎬 All session storage keys:`, Object.keys(sessionStorage));
      console.log(`🎬 Session storage contents:`, {
        currentPage: sessionStorage.getItem('currentPage'),
        navigationSource: sessionStorage.getItem('navigationSource'),
        length: sessionStorage.length
      });

      // Use navigation source for more reliable detection
      if (navigationSource === 'chat') {
        console.log('🎬 Maintaining video state on navigation from chat to itinerary');
        console.log('🎬 Video index before maintaining:', globalVideoState.getCurrentIndex());
        globalVideoState.maintainStateOnNavigation();
        console.log('🎬 Video index after maintaining:', globalVideoState.getCurrentIndex());
        // Clear the navigation source after using it
        sessionStorage.removeItem('navigationSource');
      } else {
        console.log('🎬 Itinerary page: Not coming from chat, maintaining current video state');
        // Don't advance video - maintain current state to continue from current position
      }

      // Set current page after video logic to ensure proper tracking for next navigation
      sessionStorage.setItem('currentPage', 'itinerary');
      console.log(`🎬 Video index after decision: ${globalVideoState.getCurrentIndex()}`);
    };

    // Use a small delay to ensure session storage from navigation is available
    setTimeout(handleVideoState, 120);
  }, []);

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Video Background - Same as chat page */}
      <ChatPageVideoCarousel isActive={true} className="absolute inset-0 z-0" />



      {/* Header - Same structure as chat page */}
      <header className="fixed top-0 left-0 right-0 z-50 w-full py-4">
        <div className="w-full" style={{ 
          paddingLeft: 'max(1.5rem, calc((100vw - 1280px) / 2 + 1.5rem))',
          paddingRight: 'max(1.5rem, calc((100vw - 1280px) / 2 + 1.5rem))',
          maxWidth: '100vw'
        }}>
          <div className="flex items-center justify-between h-20">
            {/* Left side - Logo */}
            <div className="flex items-center" style={{ marginLeft: '0px' }}>
              <button
                onClick={() => navigateWithVideoState('itinerary', '/')}
                className="text-2xl font-bold italic transition-all duration-200 hover:opacity-80"
                style={{
                  color: 'white',
                  fontFamily: 'Playfair Display, serif',
                  textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
                  textDecoration: 'none',
                  marginLeft: '0px',
                  paddingLeft: '0px'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#14B8A6';
                  e.currentTarget.style.textShadow = '2px 2px 4px rgba(0,0,0,0.8), 0 0 10px rgba(20, 184, 166, 0.3)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'white';
                  e.currentTarget.style.textShadow = '2px 2px 4px rgba(0,0,0,0.8)';
                }}
              >
                WonderVoya
              </button>
            </div>

            {/* Right side - Navigation and Sign in buttons */}
            <div className="flex items-center space-x-6">
              <button
                onClick={() => navigateWithVideoState('itinerary', '/')}
                className="inline-flex items-center justify-center px-4 py-2 border-2 rounded-lg font-medium text-sm transition-all duration-300 backdrop-blur-md"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.15)',
                  borderColor: 'rgba(255,255,255,0.3)',
                  color: 'white',
                  fontFamily: 'Inter, sans-serif',
                  fontSize: '14px',
                  fontWeight: '500',
                  textShadow: '1px 1px 2px rgba(0,0,0,0.8)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.25)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.5)';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.15)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Plan New Trip
              </button>
              <button
                className="inline-flex items-center justify-center px-6 py-3 border-2 rounded-lg font-medium text-sm transition-all duration-300 backdrop-blur-md"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.15)',
                  borderColor: 'rgba(255,255,255,0.3)',
                  color: 'white',
                  fontFamily: 'Roboto, arial, sans-serif',
                  fontSize: '14px',
                  fontWeight: '500',
                  minWidth: '200px',
                  height: '40px',
                  textShadow: '1px 1px 2px rgba(0,0,0,0.8)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.25)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.5)';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.15)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                <span>Sign in with Google</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Page Content with expert spacing design */}
      <div className="relative z-20" style={{paddingTop: '8rem'}}>
        <div 
          className="w-full py-4"
          style={{
            paddingLeft: 'max(1.5rem, calc((100vw - 1280px) / 2 + 1.5rem))',
            paddingRight: 'max(1.5rem, calc((100vw - 1280px) / 2 + 1.5rem))',
            maxWidth: '100vw'
          }}
        >
          <div className="mb-6">
            <h1 className="font-playfair text-3xl font-bold text-white">
              <em>Itineraries</em>
            </h1>
          </div>

          {/* Hidden dialog for potential future use */}
          <Dialog open={isCreatingNew} onOpenChange={setIsCreatingNew}>
            <DialogTrigger asChild>
              <div style={{ display: 'none' }}>
                <Button>Hidden</Button>
              </div>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md bg-cosmic-white border-2 border-aurora-teal/30 shadow-xl">
              <DialogHeader>
                <DialogTitle className="font-playfair text-deep-space-blue text-2xl">
                  Plan Your Next Journey
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="title" className="text-deep-space-blue font-medium">Journey Title</Label>
                  <Input
                    id="title"
                    placeholder="e.g., Romance in Paris"
                    value={newItineraryTitle}
                    onChange={(e) => setNewItineraryTitle(e.target.value)}
                    className="border-stellar-silver/30 focus:border-deep-space-blue bg-cosmic-white/50"
                  />
                </div>

                <div>
                  <Label htmlFor="destination" className="text-deep-space-blue font-medium">Destination</Label>
                  <Input
                    id="destination"
                    placeholder="e.g., Paris, France"
                    value={newItineraryDestination}
                    onChange={(e) => setNewItineraryDestination(e.target.value)}
                    className="border-stellar-silver/30 focus:border-deep-space-blue bg-cosmic-white/50"
                  />
                </div>

                <Button 
                  onClick={handleCreateItinerary} 
                  disabled={!newItineraryTitle || !newItineraryDestination || createItineraryMutation.isPending}
                  className="w-full bg-deep-space-blue hover:bg-deep-space-blue/90 text-white"
                >
                  {createItineraryMutation.isPending ? "Creating Journey..." : "Begin Planning"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Content */}
        </div>
      </div>

      {/* Itinerary Cards with optimized spacing */}
      <div 
        className="relative w-full pb-12 z-20"
        style={{
          paddingLeft: 'max(1.5rem, calc((100vw - 1280px) / 2 + 1.5rem))',
          paddingRight: 'max(1.5rem, calc((100vw - 1280px) / 2 + 1.5rem))',
          maxWidth: '100vw'
        }}
      >
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-aurora-teal"></div>
          </div>
        ) : itineraries && itineraries.length > 0 ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {itineraries.map((itinerary: TripItinerary) => {
              // Intelligently select the best cover image from all activities
              const coverImage = selectBestCoverImage(itinerary);
              const activityCount = (itinerary.activities?.length || 0) + 
                                  itinerary.days.reduce((total, day) => 
                                    total + day.timeSlots.filter(slot => slot.activity).length, 0);

              return (
                <div key={itinerary.id} className="relative group">
                  <Link href={`/itinerary/${itinerary.id}`}>
                    <Card className="bg-white/10 backdrop-blur-md border border-white/20 hover:border-aurora-teal hover:shadow-xl transition-all duration-300 transform hover:scale-[1.02] cursor-pointer overflow-hidden">
                      {/* Cover Image */}
                      {coverImage && (
                        <div className="relative h-48 overflow-hidden">
                          <img 
                            src={coverImage} 
                            alt={itinerary.title}
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                          />
                          <div className="absolute inset-0 bg-deep-space-blue bg-opacity-20 group-hover:bg-opacity-30 transition-all duration-300" />
                          {itinerary.days && itinerary.days.length > 0 && (
                            <Badge className="absolute top-3 left-3 bg-aurora-teal/90 text-white hover:bg-aurora-teal font-medium">
                              {itinerary.days.length} day{itinerary.days.length !== 1 ? 's' : ''}
                            </Badge>
                          )}
                        </div>
                      )}

                      <CardHeader className="pb-3">
                        <CardTitle className="flex items-center justify-between">
                          <span className="truncate group-hover:text-aurora-teal transition-colors font-playfair text-xl font-semibold text-white">
                            <em>{itinerary.title}</em>
                          </span>
                          {!coverImage && itinerary.days && itinerary.days.length > 0 && (
                            <Badge className="bg-aurora-teal/80 text-white">
                              {itinerary.days.length} day{itinerary.days.length !== 1 ? 's' : ''}
                            </Badge>
                          )}
                        </CardTitle>
                      </CardHeader>

                      <CardContent className="pt-0">
                        <div className="space-y-3">
                          <div className="flex items-center text-sm text-white/70">
                            <MapPin className="h-4 w-4 mr-2 flex-shrink-0 text-aurora-teal" />
                            <span className="truncate font-medium">
                              {itinerary.destination || 'Destination not set'}
                            </span>
                          </div>

                          {itinerary.startDate && itinerary.endDate && (
                            <div className="flex items-center text-sm text-white/70">
                              <Calendar className="h-4 w-4 mr-2 flex-shrink-0 text-aurora-teal" />
                              <span className="truncate font-medium">
                                {formatDateRange(itinerary.startDate, itinerary.endDate)}
                              </span>
                            </div>
                          )}

                          {itinerary.groupSize && (
                            <div className="flex items-center text-sm text-white/70">
                              <Users className="h-4 w-4 mr-2 flex-shrink-0 text-aurora-teal" />
                              {itinerary.groupSize} travelers
                            </div>
                          )}

                          {/* Activity Preview */}
                          {activityCount > 0 && (
                            <div className="bg-aurora-teal/10 border border-aurora-teal/20 rounded-lg p-3 mt-3">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium text-white">
                                  {activityCount} experience{activityCount !== 1 ? 's' : ''}
                                </span>
                                <Clock className="h-4 w-4 text-aurora-teal" />
                              </div>

                              {/* Show first few activity titles */}
                              <div className="space-y-1">
                                {itinerary.activities?.slice(0, 2).map((activity, index) => (
                                  <div key={activity.id} className="text-xs text-white/60 truncate">
                                    • {activity.activityData.title}
                                  </div>
                                ))}
                                {activityCount > 2 && (
                                  <div className="text-xs text-white/50 italic">
                                    +{activityCount - 2} additional experiences
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </Link>

                  {/* Delete button positioned absolutely */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute top-2 right-2 h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity bg-white/20 hover:bg-white/30 border border-white/30 shadow-sm z-10"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                      >
                        <MoreVertical className="h-4 w-4 text-white" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-cosmic-white border border-aurora-teal/30">
                      <DropdownMenuItem
                        onClick={(e) => handleDeleteItinerary(itinerary.id, itinerary.title, e)}
                        className="text-deep-space-blue hover:bg-aurora-teal/20 focus:text-deep-space-blue"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Remove Journey
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
          </div>
        ) : (
          <Card className="bg-white/10 backdrop-blur-md border border-white/20">
            <CardContent className="py-16 text-center">
              <MapPin className="h-20 w-20 mx-auto text-aurora-teal mb-6" />
              <h3 className="font-playfair text-2xl font-semibold text-white mb-3">
                <em>Your Journey Collection Awaits</em>
              </h3>
              <p className="text-white/70 text-lg mb-8 max-w-md mx-auto">
                Begin crafting your first bespoke travel experience with our curated recommendations
              </p>
              <Button 
                onClick={() => setIsCreatingNew(true)}
                className="bg-deep-space-blue hover:bg-deep-space-blue/90 text-white px-8 py-3 text-lg"
              >
                <Plus className="h-5 w-5 mr-2" />
                Begin Your First Journey
              </Button>
            </CardContent>
          </Card>
        )}
      </div>


    </div>
  );
}