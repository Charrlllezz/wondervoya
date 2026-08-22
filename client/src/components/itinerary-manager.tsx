import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, MapPin, Star, Plus, Clock, X } from 'lucide-react';
import { format, parseISO, addDays } from 'date-fns';
import type { TripItinerary, SavedActivity, ActivityRecommendation, InsertTripItinerary } from '@shared/schema';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import LocationAutocomplete from './location-autocomplete';

interface ItineraryManagerProps {
  isOpen: boolean;
  onClose: () => void;
  activity?: ActivityRecommendation | SavedActivity;
  onSave?: () => void;
  sessionId?: string;
}

export function ItineraryManager({ isOpen, onClose, activity, onSave, sessionId }: ItineraryManagerProps) {
  const [step, setStep] = useState<'select' | 'create' | 'save'>('select');
  const [selectedItineraryId, setSelectedItineraryId] = useState<string>('');
  const [newItinerary, setNewItinerary] = useState<{ title: string; destination?: string; destinationId?: number }>({
    title: ''
  });
  const [hasError, setHasError] = useState(false);

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (isOpen) {
      try {
        setStep('select');
        setSelectedItineraryId('');
        setNewItinerary({ title: '' });
        setHasError(false);
      } catch (error) {
        console.error('Error resetting form:', error);
        setHasError(true);
      }
    }
  }, [isOpen]);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Get activity data regardless of type
  const getActivityData = (act: ActivityRecommendation | SavedActivity | undefined): ActivityRecommendation | null => {
    if (!act) return null;
    return 'activityData' in act ? act.activityData : act;
  };

  const activityData = getActivityData(activity);

  // Enhanced location extraction helper
  const getActivityLocation = (activityData: ActivityRecommendation | null) => {
    if (!activityData) return 'Location not specified';

    // PRIORITY 1: Use the location field directly if it exists and is valid
    if (activityData.location && 
        activityData.location !== 'Location to be confirmed' && 
        activityData.location !== 'Tokyo, Japan' && 
        !activityData.location.includes('undefined')) {
      return activityData.location;
    }

    // PRIORITY 2: Use destination field if it exists and is valid
    if (activityData.destination && 
        activityData.destination !== 'Location to be confirmed' && 
        activityData.destination !== 'Tokyo, Japan' && 
        !activityData.destination.includes('undefined')) {
      return activityData.destination;
    }

    // PRIORITY 1: Use the actual location field from the activity data
    if (activityData.location && activityData.location !== 'Unknown' && activityData.location.trim().length > 0) {
      const location = activityData.location.trim();

      // Enhance single-word locations with country names
      if (location === 'Paris') return 'Paris, France';
      if (location === 'London') return 'London, England';
      if (location === 'Rome') return 'Rome, Italy';
      if (location === 'Tokyo') return 'Tokyo, Japan';
      if (location === 'New York') return 'New York, USA';
      if (location === 'Barcelona') return 'Barcelona, Spain';
      if (location === 'Amsterdam') return 'Amsterdam, Netherlands';
      if (location === 'Berlin') return 'Berlin, Germany';
      if (location === 'Vienna') return 'Vienna, Austria';
      if (location === 'Prague') return 'Prague, Czech Republic';

      // Return the location as-is if it already looks complete or is multi-word
      return location;
    }

    // PRIORITY 2: Smart defaults for famous landmarks in titles (fallback only)
    const title = activityData.title?.toLowerCase() || '';

    if (title.includes('eiffel') || title.includes('louvre') || 
        title.includes('versailles') || title.includes('champs') ||
        title.includes('notre dame') || title.includes('arc de triomphe')) {
      return 'Paris, France';
    }

    if (title.includes('big ben') || title.includes('tower bridge') ||
        title.includes('buckingham') || title.includes('westminster')) {
      return 'London, England';
    }

    if (title.includes('colosseum') || title.includes('vatican') ||
        title.includes('trevi') || title.includes('pantheon')) {
      return 'Rome, Italy';
    }

    if (title.includes('statue of liberty') || title.includes('central park') ||
        title.includes('brooklyn') || title.includes('manhattan')) {
      return 'New York, USA';
    }

    // PRIORITY 3: Extract from title patterns (only as last resort)
    const titleText = activityData.title || '';
    const fromMatch = titleText.match(/from\s+([A-Za-z\s,]+?)(?:\s|$)/i);
    const inMatch = titleText.match(/in\s+([A-Za-z\s,]+?)(?:\s|$)/i);
    const toMatch = titleText.match(/to\s+([A-Za-z\s,]+?)(?:\s|$)/i);

    if (fromMatch && fromMatch[1].trim().length > 3) return fromMatch[1].trim();
    if (inMatch && inMatch[1].trim().length > 3) return inMatch[1].trim();  
    if (toMatch && toMatch[1].trim().length > 3) return toMatch[1].trim();

    return 'Location not specified';
  };

  // Fetch user itineraries
  const { data: itineraries = [], isLoading: loadingItineraries } = useQuery({
    queryKey: ['/api/itineraries'],
    enabled: isOpen && step === 'select'
  });

  const typedItineraries = itineraries as TripItinerary[];

  // Create new itinerary mutation
  const createItineraryMutation = useMutation({
    mutationFn: async (data: {
      title: string;
      destination: string;
      startDate: string;
      endDate: string;
      groupSize: number;
      budgetLimit?: number;
      travelStyle: 'budget' | 'mid-range' | 'luxury';
      userId: string;
      conversationId?: string;
    }) => {
      console.log('🚀 Creating itinerary with data:', data);

      // Create abort controller with reasonable timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.log('⏰ Request timeout triggered');
        controller.abort();
      }, 20000); // 20 second timeout

      try {
        const requestBody = {
          ...data,
          clientUserId: sessionId,
          sessionId: sessionId,
          travelPreferences: data.destination ? { destination: data.destination } : undefined,
        };

        console.log('📤 Sending request body:', requestBody);

        const response = await fetch('/api/itineraries', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        console.log('📥 Response status:', response.status);

        if (!response.ok) {
          let errorData;
          try {
            errorData = await response.json();
            console.log('❌ Error response:', errorData);
          } catch (parseError) {
            console.log('❌ Could not parse error response');
            errorData = { error: `Server error (${response.status})` };
          }
          throw new Error(errorData.error || `Failed to create itinerary: ${response.status}`);
        }

        const result = await response.json();
        console.log('✅ Success response:', result);
        return result;
      } catch (error: any) {
        clearTimeout(timeoutId);
        console.error('❌ Request failed:', error);

        if (error?.name === 'AbortError') {
          throw new Error('Request took too long. Please try again.');
        }
        if (error?.message?.includes('Failed to fetch')) {
          throw new Error('Network error. Please check your connection and try again.');
        }
        throw error;
      }
    },
    onSuccess: (newItinerary: TripItinerary) => {
      console.log('🎉 Itinerary created successfully:', newItinerary);
      queryClient.invalidateQueries({ queryKey: ['/api/itineraries'] });
      setSelectedItineraryId(newItinerary.id);
      setStep('save');
      toast({
        title: "Itinerary Created",
        description: `${newItinerary.title} has been created successfully.`
      });
    },
    onError: (error: any) => {
      console.error('❌ Failed to create itinerary:', error);
      toast({
        title: "Error Creating Itinerary",
        description: error?.message || "Something went wrong. Please try again.",
        variant: "destructive"
      });
    }
  });

  // Save activity to itinerary mutation
  const saveActivityMutation = useMutation({
    mutationFn: async ({ itineraryId, activityData }: { itineraryId: string, activityData: ActivityRecommendation }) => {
      return apiRequest(`/api/itineraries/${itineraryId}/activities`, {
        method: 'POST',
        body: JSON.stringify({
          activityData,
          notes: '',
          priority: 'want-to-do'
        })
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/itineraries'] });
      queryClient.invalidateQueries({ queryKey: ['/api/itineraries', selectedItineraryId] });
      toast({
        title: "Activity Saved",
        description: `${activityData?.title} has been added to your itinerary.`
      });
      onSave?.();
      onClose();
    },
    onError: (error) => {
      console.error('Failed to save activity:', error);
      toast({
        title: "Error",
        description: "Failed to save activity. Please try again.",
        variant: "destructive"
      });
    }
  });

  // Generate smart title based on activity and location
  const generateSmartTitle = (activityData: ActivityRecommendation | null) => {
    if (!activityData) return '';

    const location = getActivityLocation(activityData);
    const title = activityData.title?.toLowerCase() || '';

    // getActivityLocation() itself falls back to this literal string when no
    // real location can be resolved — interpolating it into the templates
    // below would produce nonsense like "Majestic Location not specified
    // Journey", so skip straight to a location-free title instead.
    if (location === 'Location not specified') {
      return 'New Adventure';
    }

    // Extract city name for more natural titles
    const cityName = location.split(',')[0]; // Get just "Paris" from "Paris, France"

    // Smart title patterns based on activity type
    const titlePatterns = [
      // Palace/Castle activities
      {
        keywords: ['versailles', 'palace', 'castle', 'château'],
        templates: [`Royal ${cityName} Experience`, `${cityName} Palace Adventure`, `Majestic ${cityName} Journey`]
      },
      // Museum activities
      {
        keywords: ['louvre', 'museum', 'art', 'gallery'],
        templates: [`${cityName} Art & Culture`, `${cityName} Museum Discovery`, `Cultural ${cityName} Experience`]
      },
      // Eiffel Tower specific
      {
        keywords: ['eiffel', 'tower'],
        templates: [`${cityName} Icons & Views`, `${cityName} Skyline Adventure`, `Iconic ${cityName} Experience`]
      },
      // Food/Culinary
      {
        keywords: ['food', 'culinary', 'dining', 'dinner', 'lunch', 'cuisine', 'gourmet'],
        templates: [`${cityName} Culinary Journey`, `Taste of ${cityName}`, `${cityName} Food Adventure`]
      },
      // River/Cruise
      {
        keywords: ['cruise', 'river', 'seine', 'boat'],
        templates: [`${cityName} River Experience`, `${cityName} Waterways`, `${cityName} by Water`]
      },
      // Walking/Tours
      {
        keywords: ['walking', 'guided', 'tour'],
        templates: [`${cityName} Discovery Tour`, `${cityName} Explorer`, `${cityName} Walking Adventure`]
      }
    ];

    // Find matching pattern
    for (const pattern of titlePatterns) {
      if (pattern.keywords.some(keyword => title.includes(keyword))) {
        // Return a random template from the matching pattern
        const randomTemplate = pattern.templates[Math.floor(Math.random() * pattern.templates.length)];
        return randomTemplate;
      }
    }

    // Fallback patterns for general activities
    const fallbackTemplates = [
      `${cityName} Adventure`,
      `${cityName} Experience`,
      `${cityName} Discovery`,
      `${cityName} Journey`,
      `Exploring ${cityName}`
    ];

    return fallbackTemplates[Math.floor(Math.random() * fallbackTemplates.length)];
  };

  // Auto-populate title from activity
  useEffect(() => {
    if (activityData && step === 'create') {
      const smartTitle = generateSmartTitle(activityData);
      setNewItinerary(prev => ({
        ...prev,
        title: smartTitle
      }));
    }
  }, [activityData, step]);

  const handleCreateItinerary = () => {
    try {
      if (!newItinerary.title.trim()) {
        toast({
          title: "Missing Information",
          description: "Please enter a name for your itinerary.",
          variant: "destructive"
        });
        return;
      }

    // Try to get dates from sessionStorage (template form data)
    let startDate: string;
    let endDate: string;

    try {
      const sessionData = sessionStorage.getItem('templateFormData');
      if (sessionData) {
        const formData = JSON.parse(sessionData);
        console.log('🔍 Template form data from sessionStorage:', formData);

        if (formData.extractedDates?.startDate && formData.extractedDates?.endDate) {
          startDate = formData.extractedDates.startDate;
          endDate = formData.extractedDates.endDate;
          console.log('✅ Using dates from template form:', { startDate, endDate });
        } else {
          // Use August 10-15, 2025 as default
          startDate = '2025-08-10';
          endDate = '2025-08-15';
          console.log('⚠️ No dates in template form, using August 10-15 default:', { startDate, endDate });
        }
      } else {
        // Use August 10-15, 2025 as default
        startDate = '2025-08-10';
        endDate = '2025-08-15';
        console.log('⚠️ No sessionStorage data, using August 10-15 default:', { startDate, endDate });
      }
    } catch (error) {
      console.error('Error reading template form data:', error);
      // Use August 10-15, 2025 as default
      startDate = '2025-08-10';
      endDate = '2025-08-15';
      console.log('❌ Error reading dates, using August 10-15 default:', { startDate, endDate });
    }

    createItineraryMutation.mutate({
        title: newItinerary.title.trim(),
        // Prefer what the user actually typed/selected in the "Where are you
        // going?" field — it was previously ignored in favor of the saved
        // activity's own (often unresolved) location, silently discarding a
        // correct destination the user had just explicitly chosen.
        destination: newItinerary.destination || getActivityLocation(activityData) || 'Travel Destination',
        startDate,
        endDate,
        groupSize: 2,
        budgetLimit: undefined,
        travelStyle: 'mid-range' as const,
        userId: sessionId || 'guest',
        conversationId: sessionId
      });
    } catch (error) {
      console.error('Error in handleCreateItinerary:', error);
      setHasError(true);
      toast({
        title: "Error",
        description: "Something went wrong. Please try refreshing the page.",
        variant: "destructive"
      });
    }
  };

  const handleSaveActivity = () => {
    try {
      if (!selectedItineraryId || !activityData) {
        toast({
          title: "Error",
          description: "Please select an itinerary and ensure activity data is available.",
          variant: "destructive"
        });
        return;
      }

      saveActivityMutation.mutate({
        itineraryId: selectedItineraryId,
        activityData
      });
    } catch (error) {
      console.error('Error in handleSaveActivity:', error);
      setHasError(true);
      toast({
        title: "Error",
        description: "Something went wrong. Please try refreshing the page.",
        variant: "destructive"
      });
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return format(parseISO(dateString), 'MMM dd, yyyy');
    } catch {
      return dateString;
    }
  };

  // Error boundary fallback
  if (hasError) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-md bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 shadow-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-white">Something went wrong</DialogTitle>
            <DialogDescription className="text-slate-400">
              An error occurred while loading the itinerary manager.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-slate-300">We encountered an error while loading the itinerary manager. Please try refreshing the page.</p>
            <Button 
              onClick={() => {
                setHasError(false);
                onClose();
              }}
              className="w-full bg-[var(--aurora-teal)] hover:bg-[var(--aurora-teal-dark)] text-slate-900"
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 shadow-2xl p-4">
        <DialogHeader className="mb-3">
          <DialogTitle className="flex items-center gap-2 text-xl font-semibold text-white">
            <Calendar className="w-6 h-6 text-[var(--aurora-teal)]" />
            Save to Itinerary
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Add this activity to your travel plans by selecting an existing itinerary or creating a new one.
          </DialogDescription>
        </DialogHeader>

        {activityData && (
          <Card className="mb-4 bg-slate-800/80 backdrop-blur-md border border-slate-600/50">
            <CardContent className="p-4">
              <div className="flex gap-4">
                <div className="w-24 h-24 bg-slate-700/50 rounded-lg flex items-center justify-center overflow-hidden">
                  {(() => {
                    // Check all possible image sources from Viator API
                    const imageUrl = 
                      activityData.imageUrl ||
                      activityData.images?.[0] ||
                      (activityData as any)?.coverPhoto ||
                      (activityData as any)?.image ||
                      (activityData as any)?.photos?.[0]?.imageUrl ||
                      (activityData as any)?.photos?.[0]?.variants?.[0]?.url ||
                      (activityData as any)?.media?.images?.[0]?.url ||
                      (activityData as any)?.galleryImages?.[0]?.medium ||
                      (activityData as any)?.galleryImages?.[0]?.large ||
                      (activityData as any)?.galleryImages?.[0]?.original;

                    return imageUrl ? (
                      <img 
                        src={imageUrl} 
                        alt={activityData.title}
                        className="w-full h-full object-cover rounded-lg"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          const parent = target.parentElement;
                          if (parent) {
                            parent.innerHTML = '<svg class="w-8 h-8 text-[var(--aurora-teal)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>';
                          }
                        }}
                      />
                    ) : (
                      <MapPin className="w-8 h-8 text-[var(--aurora-teal)]" />
                    );
                  })()}
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-lg text-white mb-2">{activityData.title}</h3>
                  <div className="flex items-center gap-2 text-sm text-slate-300 mb-1">
                    <MapPin className="w-4 h-4 text-[var(--aurora-teal)]" />
                    {getActivityLocation(activityData)}
                  </div>
                  {activityData.rating && (
                    <div className="flex items-center gap-1 mb-1">
                      <Star className="w-4 h-4 fill-[var(--aurora-teal)] text-[var(--aurora-teal)]" />
                      <span className="text-sm font-medium text-slate-200">{activityData.rating}</span>
                    </div>
                  )}
                  {activityData.price && (
                    <div className="text-lg font-semibold text-[var(--aurora-teal)]">
                      ${activityData.price.amount}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 'select' && (
          <div className="space-y-4">
            <div className="text-center">
              <h3 className="text-xl font-semibold text-white">
                {typedItineraries.length > 0 
                  ? "Add to existing adventures or start fresh"
                  : "Begin Your Travel Story"
                }
              </h3>
            </div>

            {typedItineraries.length > 0 ? (
              <div className="space-y-3">
                {typedItineraries.map((itinerary: TripItinerary) => (
                  <Card 
                    key={itinerary.id}
                    className={`cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-[1.02] bg-slate-800/60 backdrop-blur-md border ${
                      selectedItineraryId === itinerary.id 
                        ? 'ring-2 ring-[var(--aurora-teal)] border-[var(--aurora-teal)]/50 shadow-lg' 
                        : 'border-slate-600/50 hover:border-[var(--aurora-teal)]/30'
                    }`}
                    onClick={() => setSelectedItineraryId(itinerary.id)}
                  >
                    <CardContent className="p-5">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-semibold text-white text-lg">{itinerary.title || 'Untitled Itinerary'}</h4>
                          <div className="flex items-center gap-2 text-sm text-slate-300 mt-2">
                            <MapPin className="w-4 h-4 text-[var(--aurora-teal)]" />
                            {itinerary.destination || 'Destination not set'}
                          </div>
                          {itinerary.startDate && itinerary.endDate && (
                            <div className="flex items-center gap-2 text-sm text-slate-300 mt-1">
                              <Calendar className="w-4 h-4 text-slate-400" />
                              {formatDate(itinerary.startDate)} - {formatDate(itinerary.endDate)}
                            </div>
                          )}
                        </div>
                        <Badge variant="secondary" className="bg-[var(--aurora-teal)]/20 text-[var(--aurora-teal)] border-[var(--aurora-teal)]/40">
                          {itinerary.activities?.length || 0} activities
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : null}

            <div className="flex gap-3 pt-2">
              <Button 
                onClick={() => setStep('create')}
                variant="outline"
                className="flex-1 border-[var(--aurora-teal)]/50 text-[var(--aurora-teal)] hover:bg-[var(--aurora-teal)]/10 hover:text-[var(--aurora-teal)] hover:border-[var(--aurora-teal)] font-medium transition-all duration-200"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create New Itinerary
              </Button>
              {selectedItineraryId && (
                <Button 
                  onClick={handleSaveActivity}
                  disabled={saveActivityMutation.isPending}
                  className="flex-1 bg-[var(--aurora-teal)] hover:bg-[var(--aurora-teal-dark)] text-slate-900 font-medium disabled:opacity-50"
                >
                  {saveActivityMutation.isPending ? 'Saving...' : 'Save Activity'}
                </Button>
              )}
            </div>
          </div>
        )}

        {step === 'create' && (
          <div className="space-y-4">
            <div className="text-center">
              <h3 className="text-xl font-semibold text-[var(--aurora-teal)] mb-2">
                Design Your Adventure
              </h3>
            </div>

            <div className="space-y-4">
              <div>
                <Label htmlFor="title" className="text-slate-300 font-medium">
                  Itinerary Name
                </Label>
                <Input
                  id="title"
                  value={newItinerary.title}
                  onChange={(e) => setNewItinerary(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="e.g., Paris Museums Adventure"
                  className="mt-2 border-slate-600 focus:border-[var(--aurora-teal)] focus:ring-[var(--aurora-teal)]/20 bg-slate-800/60 backdrop-blur-md text-white placeholder:text-slate-400"
                  autoFocus
                />
              </div>
              <div>
                      <Label htmlFor="destination" className="text-slate-300 font-medium">Where are you going?</Label>
                      <LocationAutocomplete
                        placeholder="Search destinations (e.g., Paris, Tokyo, New York...)"
                        onLocationSelect={(destinationId, destinationName) => {
                          setNewItinerary(prev => ({ 
                            ...prev, 
                            destination: destinationName,
                            destinationId: destinationId
                          }));
                        }}
                        className="bg-slate-800/60 backdrop-blur-md border-slate-600 text-white placeholder:text-slate-400"
                        initialValue={newItinerary.destination}
                      />
                      {newItinerary.destination && (
                        <p className="text-sm text-green-400 mt-1 flex items-center">
                          <MapPin className="h-3 w-3 mr-1" />
                          Selected: {newItinerary.destination}
                        </p>
                      )}
                    </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button 
                onClick={() => setStep('select')}
                variant="outline"
                className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white"
              >
                Back
              </Button>
              <Button 
                onClick={handleCreateItinerary}
                disabled={createItineraryMutation.isPending || !newItinerary.title.trim()}
                className="flex-1 bg-[var(--aurora-teal)] hover:bg-[var(--aurora-teal-dark)] text-slate-900 font-medium disabled:opacity-50"
              >
                {createItineraryMutation.isPending ? 'Creating...' : 'Save Itinerary'}
              </Button>
            </div>
          </div>
        )}

        {step === 'save' && (
          <div className="space-y-4">
            <div className="text-center">
              <h3 className="text-xl font-semibold text-white">
                Lock It In
              </h3>
              <p className="text-slate-400 mt-2">
                Adding "{activityData?.title}" to your collection.
              </p>
            </div>

            <div className="flex gap-3 pt-4">
              <Button 
                onClick={() => setStep('select')}
                variant="outline"
                className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white"
              >
                Back
              </Button>
              <Button 
                onClick={handleSaveActivity}
                disabled={saveActivityMutation.isPending}
                className="flex-1 bg-[var(--aurora-teal)] hover:bg-[var(--aurora-teal-dark)] text-slate-900 font-medium disabled:opacity-50"
              >
                {saveActivityMutation.isPending ? 'Saving...' : 'Save Activity'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}