import { useState, useMemo, useCallback, useEffect, memo } from 'react';
import { useParams, Link, useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { ActivityDetailModal } from '@/components/activity-detail-modal';
import { EnhancedShareModal } from '@/components/enhanced-share-modal';
import { RealTimeCalendar } from '@/components/real-time-calendar';
import { TripDateScheduler } from '@/components/trip-date-scheduler';
import { GoogleCalendarView } from '@/components/google-calendar-view';
import { ErrorBoundary } from '@/components/error-boundary';
import { ActivityCardSkeleton } from '@/components/loading-skeleton';
import { devLog } from '@/components/performance-monitor';
import { ChatPageVideoCarousel } from '@/components/chat-page-video-carousel';
import { globalVideoState } from '@/lib/global-video-state';
import { navigateWithRouterAndVideoState } from '@/lib/navigation';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  useDraggable,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { TripItinerary, SavedActivity } from '@shared/schema';
import {
  ArrowLeft, MapPin, Clock, Calendar, DollarSign, 
  Users, Share2, Trash2, GripVertical, Activity, ChevronDown, ChevronUp, ChevronRight,
  Plus, Edit3, Eye, Settings
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { UnifiedShare } from '@/components/unified-share';
import { parseISO, format } from 'date-fns';

// Droppable Calendar Slot Component
function DroppableCalendarSlot({ dayNumber, timeSlot: timeSlotName, children, className }: {
  dayNumber: number;
  timeSlot: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { setNodeRef, isOver } = useSortable({
    id: `${dayNumber}-${timeSlotName}`,
    data: { 
      type: 'calendar-slot',
      dayNumber, 
      timeSlot: timeSlotName,
      accepts: ['activity', 'calendar-activity']
    }
  });

  return (
    <div
      ref={setNodeRef}
      className={`${className} ${isOver ? 'bg-[#14B8A6]/10 border-[#14B8A6]/50' : ''} transition-colors duration-200 relative`}
    >
      {children}
      {!children && (
        <div className="absolute inset-2 border-2 border-dashed border-white/20 rounded-md flex items-center justify-center opacity-0 hover:opacity-50 transition-opacity">
          <span className="text-xs text-white/60 font-medium">Drop here</span>
        </div>
      )}
    </div>
  );
}

// Draggable Calendar Activity Card
function DraggableCalendarActivity({ activity, timeSlot, onRemove }: {
  activity: any;
  timeSlot: any;
  onRemove?: (timeSlotId: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({ 
    id: timeSlot.id,
    data: { 
      type: 'calendar-activity',
      activity, 
      timeSlot 
    }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg p-2 h-full flex cursor-grab active:cursor-grabbing hover:bg-white/15 transition-all duration-200 ${
        isDragging ? 'opacity-30' : ''
      }`}
      {...attributes}
      {...listeners}
    >
      <div className="w-12 h-12 flex-shrink-0 mr-2">
        <img 
          src={activity.imageUrl} 
          alt={activity.title}
          className="w-full h-full object-cover rounded"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjI0IiBoZWlnaHQ9IjI0IiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik0xMiA4VjE2TTggMTJIMTYiIHN0cm9rZT0iIzlDQTNBRiIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz4KPHN2Zz4K';
          }}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-white text-sm truncate mb-1">
          {activity.title}
        </div>
        <div className="text-xs text-white/70">
          {timeSlot.startTime}
        </div>
        {activity.rating && (
          <div className="flex items-center mt-1">
            <span className="text-[#14B8A6] text-xs">★</span>
            <span className="text-xs text-white/70 ml-1">{activity.rating}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// Enhanced Draggable Activity Card with Photo
function ClickableActivity({ activity, onRemove, onEdit, onViewDetails, scheduleActivityMutation, toast, isTimeSlotBooked, onSchedule }: {
  activity: SavedActivity;
  onRemove: (id: string) => void;
  onEdit: (activity: SavedActivity) => void;
  onViewDetails: (activity: SavedActivity) => void;
  scheduleActivityMutation: any;
  toast: any;
  isTimeSlotBooked: (dayNumber: number, timeSlot: string) => boolean;
  onSchedule: (activity: SavedActivity) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({ 
    id: `activity-${activity.id}`,
    data: { 
      type: 'activity',
      activity 
    }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
  };

  // Safely get activity data
  const activityData = activity.activityData || activity;
  const title = activityData.title || 'Unknown Activity';
  const location = activityData.location || '';
  const imageUrl = activityData.imageUrl || activityData.images?.[0]?.url || '';
  const price = activityData.price || null;
  const rating = activityData.rating || null;
  // activityData.duration is typed as a plain string, but Viator's raw API can
  // return a structured object here ({ fixedDurationInMinutes: ... } or
  // { variableDurationFromMinutes, variableDurationToMinutes }) that bypasses
  // the schema's string typing before it reaches the client — the runtime
  // check below is deliberate defensive handling for that case.
  const duration = (activityData.duration || null) as
    | string
    | { fixedDurationInMinutes?: number; variableDurationFromMinutes?: number; variableDurationToMinutes?: number }
    | null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group bg-slate-800 border border-slate-600 rounded-xl overflow-hidden hover:shadow-xl hover:border-[#14B8A6] hover:bg-slate-750 transition-all duration-300 ${
        isDragging ? 'opacity-50 shadow-xl scale-105' : ''
      } shadow-lg hover:scale-[1.02] mb-4`}
    >
      <div className="flex min-h-[80px]">
        {/* Activity Image */}
        <div className="w-20 h-20 flex-shrink-0 relative overflow-hidden">
          <img 
            src={imageUrl} 
            alt={title}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik0yMCAxMlYyOE0xMiAyMEgyOCIgc3Ryb2tlPSIjOUNBM0FGIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgo8L3N2Zz4K';
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        </div>

        {/* Activity Content */}
        <div className="flex-1 p-3 min-w-0">
          <div className="flex justify-between items-start h-full">
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-start gap-2">
                <div
                  {...attributes}
                  {...listeners}
                  className="cursor-grab active:cursor-grabbing mt-0.5 opacity-40 hover:opacity-100 transition-opacity flex-shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <GripVertical className="h-4 w-4 text-white/60" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 
                    className="font-semibold text-white text-sm leading-tight group-hover:text-[#14B8A6] transition-colors cursor-pointer pr-2"
                    onClick={() => onViewDetails(activity)}
                    title={title}
                  >
                    {title.length > 50 ? `${title.substring(0, 50)}...` : title}
                  </h3>
                  {location && (
                    <div className="flex items-center gap-1 mt-1">
                      <MapPin className="h-3 w-3 text-[#14B8A6] flex-shrink-0" />
                      <span className="text-xs text-white/70 truncate" title={location}>
                        {location}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs text-white/60">
                {duration && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Clock className="h-3 w-3" />
                    <span>
                      {typeof duration === 'object' 
                        ? duration?.fixedDurationInMinutes 
                          ? `${Math.floor(duration.fixedDurationInMinutes / 60)}h ${duration.fixedDurationInMinutes % 60}m`
                          : duration?.variableDurationFromMinutes && duration?.variableDurationToMinutes
                          ? `${Math.floor(duration.variableDurationFromMinutes / 60)}h-${Math.floor(duration.variableDurationToMinutes / 60)}h`
                          : 'Varies'
                        : duration || 'Varies'
                      }
                    </span>
                  </div>
                )}

                {price && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <DollarSign className="h-3 w-3" />
                    <span className="font-medium text-[#14B8A6]">
                      {price.currency || 'USD'} {price.amount}
                    </span>
                  </div>
                )}

                {rating && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span className="text-[#14B8A6]">★</span>
                    <span>{typeof rating === 'number' ? rating.toFixed(1) : rating}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-1 ml-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex-shrink-0">
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  onSchedule(activity);
                }}
                className="h-7 px-2 text-xs bg-[#14B8A6]/20 hover:bg-[#14B8A6]/30 text-[#14B8A6] border-[#14B8A6]/50 hover:border-[#14B8A6] transition-all duration-200"
                title="Schedule this activity"
              >
                <Calendar className="h-3 w-3 mr-1" />
                Schedule
              </Button>

              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(activity);
                  }}
                  className="h-6 w-6 p-0 hover:bg-white/20 text-white/60 hover:text-white"
                  title="Edit activity"
                >
                  <Edit3 className="h-3 w-3" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(activity.id);
                  }}
                  className="h-6 w-6 p-0 hover:bg-red-500/20 hover:text-red-400 text-white/60"
                  title="Remove activity"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ItineraryDetail() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Handle video state and track page navigation
  useEffect(() => {
    const previousPage = sessionStorage.getItem('currentPage');
    const navigationSource = sessionStorage.getItem('navigationSource');

    console.log(`🎬 Itinerary Detail page: Previous page was '${previousPage}'`);
    console.log(`🎬 Itinerary Detail page: Navigation source was '${navigationSource}'`);
    console.log(`🎬 Current video index before decision: ${globalVideoState.getCurrentIndex()}`);

    // Debug session storage
    const allKeys = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      allKeys.push(sessionStorage.key(i));
    }
    console.log('🎬 All session storage keys:', allKeys);
    console.log('🎬 Session storage contents:', {
      currentPage: sessionStorage.getItem('currentPage'),
      navigationSource: sessionStorage.getItem('navigationSource'),
      length: sessionStorage.length
    });

    // Use navigation source for more reliable detection
    if (navigationSource === 'chat' || navigationSource === 'itinerary') {
      console.log(`🎬 Maintaining video state on navigation from ${navigationSource} to itinerary detail`);
      console.log('🎬 Video index before maintaining:', globalVideoState.getCurrentIndex());
      globalVideoState.maintainStateOnNavigation();
      console.log('🎬 Video index after maintaining:', globalVideoState.getCurrentIndex());
      // Clear the navigation source after using it
      sessionStorage.removeItem('navigationSource');
    } else {
      console.log('🎬 Itinerary Detail page: Not coming from chat/itinerary, maintaining current video state');
      // Don't advance video - maintain current state to continue from current position
    }

    // Set current page after video logic
    sessionStorage.setItem('currentPage', 'itinerary-detail');
    console.log(`🎬 Video index after decision: ${globalVideoState.getCurrentIndex()}`);
  }, []);

  // Check sessionStorage for auto-opening sharing modal after authentication
  const [shouldAutoShare, setShouldAutoShare] = useState(false);

  useEffect(() => {
    const autoOpen = sessionStorage.getItem('autoOpenShare');
    if (autoOpen === 'true') {
      setShouldAutoShare(true);
      sessionStorage.removeItem('autoOpenShare');
    }
  }, []);

  // All hooks must be called at the top level, before any conditional returns
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<SavedActivity | null>(null);
  const [isActivityDetailModalOpen, setIsActivityDetailModalOpen] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<SavedActivity | null>(null);
  const [isActivitiesOpen, setIsActivitiesOpen] = useState(true);
  const [draggedActivity, setDraggedActivity] = useState<any>(null);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [selectedActivityForScheduling, setSelectedActivityForScheduling] = useState<SavedActivity | null>(null);
  const [editForm, setEditForm] = useState({
    notes: '',
    scheduledTime: '',
    day: ''
  });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const { data: itinerary, isLoading, error } = useQuery<TripItinerary>({
    queryKey: ['/api/itineraries', id],
    enabled: !!id,
  });

  const removeActivityMutation = useMutation({
    mutationFn: async (activityId: string) => {
      console.log('Removing activity:', activityId);
      const response = await apiRequest(`/api/itineraries/${id}/activities/${activityId}`, {
        method: 'DELETE'
      });
      console.log('Remove activity response:', response);
      return response;
    },
    onSuccess: (data, activityId) => {
      console.log('Activity removed successfully:', activityId);
      queryClient.invalidateQueries({ queryKey: ['/api/itineraries', id] });
      queryClient.invalidateQueries({ queryKey: ['/api/activities'] });
      toast({
        title: "Activity removed",
        description: "Activity has been removed from your itinerary",
      });
    },
    onError: (error: any, activityId) => {
      console.error('Failed to remove activity:', error, 'Activity ID:', activityId);
      toast({
        title: "Failed to remove activity",
        description: error?.message || "Failed to remove activity from itinerary.",
        variant: "destructive",
      });
    },
  });

  // Schedule activity mutation
  const scheduleActivityMutation = useMutation({
    mutationFn: async ({ activityId, dayNumber, timeSlot }: { activityId: string, dayNumber: number, timeSlot: string }) => {
      console.log('🔄 Scheduling activity:', { activityId, dayNumber, timeSlot });

      const response = await fetch(`/api/itineraries/${id}/schedule-activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activityId, dayNumber, timeSlot })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('❌ Scheduling failed:', { status: response.status, error: errorData });
        throw new Error(errorData.message || `Server error: ${response.status}`);
      }

      const result = await response.json();
      console.log('✅ Activity scheduled successfully:', result);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/itineraries', id] });
      toast({
        title: "Activity Scheduled",
        description: "The activity has been added to your calendar."
      });
    },
    onError: (error: Error) => {
      console.error('❌ Scheduling mutation error:', error);
      toast({
        title: "Scheduling failed",
        description: error.message || "Failed to schedule the activity. Please try again.",
        variant: "destructive"
      });
    }
  });

  const moveActivityMutation = useMutation({
    mutationFn: async ({ slotId, dayNumber, timeSlot }: { slotId: string; dayNumber: number; timeSlot: string }) => {
      return apiRequest(`/api/itineraries/${id}/reschedule-activity`, {
        method: 'PUT',
        body: JSON.stringify({
          timeSlotId: slotId,
          newDayNumber: dayNumber,
          newTimeSlot: timeSlot
        })
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/itineraries', id] });
      toast({
        title: "Activity moved",
        description: "The activity has been moved to a new time slot",
      });
    },
    onError: () => {
      toast({
        title: "Move failed", 
        description: "Failed to move the activity. Please try again.",
        variant: "destructive",
      });
    },
  });

  // New mutations for real-time calendar scheduling
  const realTimeScheduleMutation = useMutation({
    mutationFn: async ({ activityId, dayNumber, timeSlot, endTime }: { 
      activityId: string; 
      dayNumber: number; 
      timeSlot: string; 
      endTime?: string;
    }) => {
      return apiRequest(`/api/itineraries/${id}/schedule-activity`, {
        method: 'POST',
        body: JSON.stringify({ activityId, dayNumber, timeSlot, endTime })
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/itineraries', id] });
      toast({
        title: "Activity scheduled",
        description: "Activity scheduled with real availability data",
      });
    },
    onError: (error: any) => {
      let errorMessage = "Failed to schedule activity. Please try again.";

      if (error?.status === 404 || error?.message?.includes('404')) {
        errorMessage = "This itinerary no longer exists. Please refresh the page.";
      } else if (error?.message?.includes('conflict')) {
        errorMessage = error.message;
      }

      toast({
        title: "Scheduling failed",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const realTimeRescheduleMutation = useMutation({
    mutationFn: async ({ timeSlotId, newDayNumber, newTimeSlot, newEndTime }: {
      timeSlotId: string;
      newDayNumber: number; 
      newTimeSlot: string;
      newEndTime?: string;
    }) => {
      return apiRequest(`/api/itineraries/${id}/reschedule-activity`, {
        method: 'PUT',
        body: JSON.stringify({ timeSlotId, newDayNumber, newTimeSlot, newEndTime })
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/itineraries', id] });
      toast({
        title: "Activity rescheduled",
        description: "Activity moved to new time slot successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Rescheduling failed",
        description: error?.message || "Failed to reschedule activity. Please try again.",
        variant: "destructive",
      });
    },
  });

  const removeFromScheduleMutation = useMutation({
    mutationFn: async (timeSlotId: string) => {
      return apiRequest(`/api/itineraries/${id}/time-slots/${timeSlotId}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/itineraries', id] });
      toast({
        title: "Activity unscheduled",
        description: "Activity moved back to unscheduled list",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to unschedule",
        description: error?.message || "Failed to remove activity from schedule.",
        variant: "destructive",
      });
    },
  });

  // Fix data parsing - React Query might be wrapping response in array
  const actualItinerary = useMemo(() => {
    const result = Array.isArray(itinerary) ? itinerary[0] : itinerary;
    console.log('Itinerary data:', result);
    console.log('Destination:', result?.destination);
    return result;
  }, [itinerary]);

  // Helper function to check if an activity is scheduled
  const isActivityScheduled = useMemo(() => {
    return (activity: SavedActivity): boolean => {
      if (!actualItinerary?.days) return false;
      return actualItinerary.days.some((day: any) => 
        day.timeSlots?.some((slot: any) => slot.activity?.productCode === activity.activityData.productCode)
      );
    };
  }, [actualItinerary]);

  // Auto-collapse activities section when all activities are scheduled
  const unscheduledActivities = useMemo(() => {
    if (!actualItinerary?.activities) return [];
    return actualItinerary.activities.filter((activity: SavedActivity) => !isActivityScheduled(activity));
  }, [actualItinerary, isActivityScheduled]);

  // Get scheduled activities from time slots
  const scheduledActivities = useMemo(() => {
    if (!actualItinerary?.days) return [];
    const scheduled: SavedActivity[] = [];

    actualItinerary.days.forEach((day: any) => {
      day.timeSlots?.forEach((slot: any) => {
        if (slot.activity) {
          scheduled.push(slot.activity);
        }
      });
    });

    return scheduled;
  }, [actualItinerary]);

  // Auto-close activities when all are scheduled, but keep open when first loading
  useEffect(() => {
    if (unscheduledActivities.length === 0 && scheduledActivities.length > 0) {
      console.log('🎯 Auto-collapsing activities section - all activities scheduled');
      console.log(`🎯 Debug: unscheduled=${unscheduledActivities.length}, scheduled=${scheduledActivities.length}`);
      setIsActivitiesOpen(false);
    }
  }, [unscheduledActivities.length, scheduledActivities.length]);

  // Also trigger collapse after successful scheduling
  useEffect(() => {
    if (scheduleActivityMutation.isSuccess) {
      console.log('🎯 Post-schedule collapse check triggered');
      console.log(`🎯 Current state: unscheduled=${unscheduledActivities.length}, scheduled=${scheduledActivities.length}`);

      // Small delay to ensure data has been refreshed
      setTimeout(() => {
        if (unscheduledActivities.length === 0 && scheduledActivities.length > 0) {
          console.log('🎯 Post-schedule collapse - all activities now scheduled');
          setIsActivitiesOpen(false);
        }
      }, 300);
    }
  }, [scheduleActivityMutation.isSuccess, unscheduledActivities.length, scheduledActivities.length]);

  // Helper function to check if a specific timeslot is booked
  const isTimeSlotBooked = useCallback((dayNumber: number, timeSlot: string): boolean => {
    if (!actualItinerary?.days) return false;
    const day = actualItinerary.days.find((d: any) => d.dayNumber === dayNumber);
    if (!day) return false;

    const timeMapping: { [key: string]: string[] } = {
      'morning': ['9:00', '09:00', '10:00', '11:00'],
      'noon': ['12:00'],
      'afternoon': ['13:00', '14:00', '15:00', '16:00', '17:00'],
      'evening': ['18:00', '19:00', '20:00']
    };

    const timesToCheck = timeMapping[timeSlot] || [];
    return day.timeSlots?.some((slot: any) => 
      timesToCheck.includes(slot.startTime) && slot.activity
    ) || false;
  }, [actualItinerary]);

  // Initialize days if empty - ensure all days show
  const itineraryWithDays = useMemo(() => {
    if (!actualItinerary) return actualItinerary;

    // Parse dates manually to avoid any timezone conversion
    const startYear = parseInt(actualItinerary.startDate.split('-')[0]);
    const startMonth = parseInt(actualItinerary.startDate.split('-')[1]) - 1;
    const startDay = parseInt(actualItinerary.startDate.split('-')[2]);

    const endYear = parseInt(actualItinerary.endDate.split('-')[0]);
    const endMonth = parseInt(actualItinerary.endDate.split('-')[1]) - 1;
    const endDay = parseInt(actualItinerary.endDate.split('-')[2]);

    const startDate = new Date(startYear, startMonth, startDay);
    const endDate = new Date(endYear, endMonth, endDay);

    const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    // Create all days array
    const allDays = [];
    const currentDate = new Date(startDate);

    for (let i = 0; i < totalDays; i++) {
      const dayNumber = i + 1;
      const year = currentDate.getFullYear();
      const month = String(currentDate.getMonth() + 1).padStart(2, '0');
      const day = String(currentDate.getDate()).padStart(2, '0');
      const dateString = `${year}-${month}-${day}`;

      // Find existing day data or create empty day
      const existingDay = actualItinerary.days?.find((d: any) => d.dayNumber === dayNumber);

      allDays.push(existingDay || {
        id: `day-${dateString}`,
        date: dateString,
        dayNumber,
        timeSlots: []
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return {
      ...actualItinerary,
      days: allDays
    };
  }, [actualItinerary]);

  const handleEditActivity = useCallback((activity: SavedActivity) => {
    setSelectedActivity(activity);
    setIsActivityDetailModalOpen(true);
  }, []);

  const handleViewActivityDetails = useCallback((activity: SavedActivity) => {
    setSelectedActivity(activity);
    setIsActivityDetailModalOpen(true);
  }, []);

  const handleRemoveFromCalendar = useCallback(async (timeSlotId: string) => {
    try {
      // Find the day and timeslot to get proper IDs for the API call
      const day = actualItinerary?.days?.find((d: any) => 
        d.timeSlots?.some((slot: any) => slot.id === timeSlotId)
      );

      if (day) {
        await apiRequest(`/api/itineraries/${id}/days/${day.id}/time-slots/${timeSlotId}`, { method: 'DELETE' });
        queryClient.invalidateQueries({ queryKey: ['/api/itineraries', id] });
        toast({
          title: "Activity removed from calendar",
          description: "The activity has been moved back to your activities list",
        });
      } else {
        throw new Error('Day not found for timeslot');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to remove activity from calendar",
        variant: "destructive",
      });
    }
  }, [id, queryClient, toast, actualItinerary]);

  const handleDragStart = useCallback((event: any) => {
    const { active } = event;
    const activeData = active.data?.current;

    if (activeData?.activity) {
      setDraggedActivity(activeData);
    }
  }, []);

  const handleMainDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setDraggedActivity(null);

    if (!over || active.id === over.id) return;

    console.log('Drag end:', { 
      activeId: active.id, 
      overId: over.id,
      activeData: active.data?.current,
      overData: over.data?.current 
    });

    // Get drop target data - handle both data structure and ID parsing
    let dayNumber: number;
    let timeSlot: string;

    const overData = over.data?.current;
    if (overData?.dayNumber && overData?.timeSlot) {
      // Use data from droppable
      dayNumber = overData.dayNumber;
      timeSlot = overData.timeSlot;
    } else {
      // Parse from ID format "1-evening"
      const overId = over.id.toString();
      const parts = overId.split('-');
      if (parts.length !== 2) return;

      dayNumber = parseInt(parts[0]);
      timeSlot = parts[1];

      if (isNaN(dayNumber) || !timeSlot) return;
    }

    console.log('Parsed drop target:', { dayNumber, timeSlot });

    // Check if we're dragging an activity from the activities list
    const activeData = active.data?.current;

    // If dragging from activities list (has activity data but no timeSlot)
    if (activeData?.activity && activeData?.type !== 'calendar-activity') {
      console.log('Dragging from activities list:', activeData.activity.activityData?.title || activeData.activity.title);
      scheduleActivityMutation.mutate({ 
        activityId: active.id as string, 
        dayNumber, 
        timeSlot 
      });
    }
    // If dragging from calendar (rescheduling - has timeSlot data)
    else if (activeData?.type === 'calendar-activity' && activeData?.timeSlot) {
      console.log('Rescheduling from calendar - moving from slot:', activeData.timeSlot.id);

      // Use the dedicated move endpoint for atomic operation
      moveActivityMutation.mutate({
        slotId: activeData.timeSlot.id,
        dayNumber,
        timeSlot
      });
    }
  }, [scheduleActivityMutation, moveActivityMutation, actualItinerary]);

  const handleRemoveActivity = (activityId: string) => {
    console.log('handleRemoveActivity called with ID:', activityId);
    if (!activityId) {
      console.error('No activity ID provided for removal');
      toast({
        title: "Error",
        description: "Invalid activity ID",
        variant: "destructive",
      });
      return;
    }
    removeActivityMutation.mutate(activityId);
  };

  // Now we can conditionally render based on loading/error states
  if (isLoading) {
    return (
      <div className="min-h-screen relative">
        {/* Video Background */}
        <ChatPageVideoCarousel isActive={true} />

        {/* Dark Overlay for Content Readability */}
        <div className="absolute inset-0 bg-black/30 z-10"></div>

        {/* Content */}
        <div className="relative z-20 min-h-screen flex items-center justify-center p-6">
          <div className="max-w-lg mx-auto text-center py-16 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl shadow-2xl">
            <div className="relative mb-6">
              <div className="relative w-16 h-16 mx-auto">
                <svg
                  className="w-16 h-16 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  style={{
                    filter: 'drop-shadow(0 0 8px rgba(255,255,255,0.4))',
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
            <h1 className="text-3xl font-bold text-white mb-4 font-playfair">Loading Your Journey</h1>
            <p className="text-white/80 text-lg">Preparing your travel itinerary...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !actualItinerary) {
    return (
      <div className="min-h-screen relative">
        {/* Video Background */}
        <ChatPageVideoCarousel isActive={true} />

        {/* Dark Overlay for Content Readability */}
        <div className="absolute inset-0 bg-black/30 z-10"></div>

        {/* Content */}
        <div className="relative z-20 min-h-screen flex items-center justify-center p-6">
          <div className="max-w-lg mx-auto text-center py-16 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl shadow-2xl">
            <div className="text-6xl mb-6">🗺️</div>
            <h1 className="text-3xl font-bold text-white mb-4 font-playfair">Journey Not Found</h1>
            <p className="text-white/80 text-lg mb-8">The itinerary you're looking for doesn't exist or has been removed.</p>
            <button 
              onClick={() => navigateWithRouterAndVideoState('itinerary-detail', setLocation, '/')}
              className="text-[#14B8A6] hover:text-[#14B8A6]/80 transition-all duration-200 cursor-pointer text-xl font-playfair font-bold"
            >
              <em>Return to WonderVoya</em>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative">
      {/* Video Background */}
      <div className="fixed inset-0 z-0">
        <ChatPageVideoCarousel isActive={true} />
      </div>

      {/* Subtle Overlay for Content Readability */}
      <div className="absolute inset-0 bg-black/15 z-10"></div>

      {/* Content */}
      <div className="relative z-20 min-h-screen">
        {/* Header - Compact & Improved Layout */}
        <div className="bg-white/5 backdrop-blur-md border-b border-white/10 sticky top-0 z-30">
          <div className="max-w-6xl mx-auto px-6 py-4">
            {/* Single Row Layout */}
            <div className="flex items-center justify-between">
              {/* Left Side - Back Button & Title */}
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => navigateWithRouterAndVideoState('itinerary-detail', setLocation, '/itineraries')}
                  className="text-white hover:bg-white/10 hover:text-[#14B8A6] border border-white/20 hover:border-[#14B8A6] transition-all duration-300 px-3 py-2 rounded-lg flex items-center gap-2 bg-white/5 backdrop-blur-sm"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span className="text-sm">Back</span>
                </button>

                <div className="flex items-center gap-4">
                  <h1 className="font-playfair text-2xl font-bold text-white italic">
                    {actualItinerary?.title || 'My Journey'}
                  </h1>

                  {/* Compact Info Badges */}
                  {actualItinerary && (
                    <div className="flex items-center gap-2 text-white/80 text-sm">
                      <div className="flex items-center gap-1 bg-white/10 px-2 py-1 rounded backdrop-blur-sm">
                        <MapPin className="h-3 w-3 text-[#14B8A6]" />
                        <span>{actualItinerary.destination || 'Destination'}</span>
                      </div>
                      <div className="flex items-center gap-1 bg-white/10 px-2 py-1 rounded backdrop-blur-sm">
                        <Calendar className="h-3 w-3 text-[#14B8A6]" />
                        <span>
                          {actualItinerary.startDate && actualItinerary.endDate ? (
                            `${format(parseISO(actualItinerary.startDate), 'MMM d')} - ${format(parseISO(actualItinerary.endDate), 'MMM d')}`
                          ) : (
                            'Dates not set'
                          )}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 bg-white/10 px-2 py-1 rounded backdrop-blur-sm">
                        <Activity className="h-3 w-3 text-[#14B8A6]" />
                        <span>
                          {actualItinerary.activities?.length > 0
                            ? `${scheduledActivities.length}/${actualItinerary.activities.length} scheduled`
                            : '0 experiences'
                          }
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Side - Share Button */}
              <Button
                onClick={() => setIsShareModalOpen(true)}
                className="bg-[#14B8A6] hover:bg-[#14B8A6]/90 text-white shadow-lg hover:shadow-xl transition-all duration-300 border-0 px-4 py-2 text-sm"
              >
                <Share2 className="h-4 w-4 mr-2" />
                Share
              </Button>
            </div>
          </div>
        </div>

        {/* Main Content Area - Fixed Spacing */}
        <div className="max-w-6xl mx-auto px-6 py-8 space-y-12">
          <ErrorBoundary>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleMainDragEnd}
            >
              {/* Activities Section - Smart Behavior with Progress */}
              <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl shadow-xl overflow-hidden">
                <Collapsible open={isActivitiesOpen} onOpenChange={setIsActivitiesOpen}>
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center justify-between p-5 cursor-pointer hover:bg-white/5 transition-all duration-300">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-[#14B8A6]/20 rounded-lg flex items-center justify-center">
                          <Activity className="h-5 w-5 text-[#14B8A6]" />
                        </div>
                        <div>
                          <div className="flex items-center gap-3">
                            <h2 className="text-xl font-semibold text-white font-playfair">
                              Your Experiences 
                              {actualItinerary?.activities && actualItinerary.activities.length > 0 && (
                                <span className="text-sm font-normal text-white/80 ml-2">
                                  ({scheduledActivities.length}/{actualItinerary.activities.length} scheduled)
                                </span>
                              )}
                            </h2>
                          </div>
                          <p className="text-sm text-white/70 mt-1">
                            {unscheduledActivities.length > 0 
                              ? `${unscheduledActivities.length} ready to schedule`
                              : actualItinerary?.activities?.length > 0 
                                ? 'All experiences are scheduled' 
                                : 'No experiences yet'
                            }
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {unscheduledActivities.length > 0 && (
                          <span className="text-xs text-[#14B8A6] font-medium bg-[#14B8A6]/20 px-2 py-1 rounded-full">
                            {unscheduledActivities.length} unscheduled
                          </span>
                        )}
                        {/* Floating Add Button */}
                        {actualItinerary?.conversationId && (
                          <Link to={`/chat/${actualItinerary.conversationId}`}>
                            <Button
                              size="sm"
                              className="bg-[#14B8A6] hover:bg-[#14B8A6]/90 text-white shadow-lg hover:shadow-xl transition-all duration-300 border-0 px-3 py-1 text-xs"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              Add
                            </Button>
                          </Link>
                        )}
                        {isActivitiesOpen ? <ChevronUp className="h-4 w-4 text-white/60" /> : <ChevronDown className="h-4 w-4 text-white/60" />}
                      </div>
                    </div>
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <div className="px-6 pb-6">
                      {!actualItinerary?.activities || actualItinerary.activities.length === 0 ? (
                        <div className="text-center py-16">
                          <div className="text-6xl mb-4">🗺️</div>
                          <h3 className="text-xl font-semibold text-white mb-2">No Experiences Yet</h3>
                          <p className="text-white/70 mb-6">Start planning by searching for activities and experiences</p>
                          {actualItinerary?.conversationId ? (
                            <Link to={`/chat/${actualItinerary.conversationId}`}>
                              <Button className="bg-[#14B8A6] hover:bg-[#14B8A6]/90 text-white">
                                <Plus className="h-4 w-4 mr-2" />
                                Find Experiences
                              </Button>
                            </Link>
                          ) : (
                            <Link to="/">
                              <Button className="bg-[#14B8A6] hover:bg-[#14B8A6]/90 text-white">
                                <Plus className="h-4 w-4 mr-2" />
                                Find Experiences
                              </Button>
                            </Link>
                          )}
                        </div>
                      ) : unscheduledActivities.length === 0 ? (
                        <div className="text-center py-12">
                          <div className="text-4xl mb-3">✅</div>
                          <h3 className="text-lg font-semibold text-white mb-2">All Set!</h3>
                          <p className="text-white/70 mb-4">All your experiences have been scheduled</p>
                          {actualItinerary?.conversationId ? (
                            <Link to={`/chat/${actualItinerary.conversationId}`}>
                              <Button variant="outline" className="border-[#14B8A6] text-[#14B8A6] hover:bg-[#14B8A6]/10 bg-transparent">
                                <Plus className="h-4 w-4 mr-2" />
                                Add More Experiences
                              </Button>
                            </Link>
                          ) : (
                            <Link to="/">
                              <Button variant="outline" className="border-[#14B8A6] text-[#14B8A6] hover:bg-[#14B8A6]/10 bg-transparent">
                                <Plus className="h-4 w-4 mr-2" />
                                Add More Experiences
                              </Button>
                            </Link>
                          )}
                        </div>
                      ) : (
                        <SortableContext 
                          items={unscheduledActivities.map((activity: SavedActivity) => `activity-${activity.id}`)}
                          strategy={verticalListSortingStrategy}
                        >
                          <div className="grid gap-4">
                            {unscheduledActivities.map((activity: SavedActivity, index: number) => (
                              <ClickableActivity
                                key={`activity-${activity.id}-${index}`}
                                activity={activity}
                                onRemove={handleRemoveActivity}
                                onEdit={handleEditActivity}
                                onViewDetails={handleViewActivityDetails}
                                toast={toast}
                                scheduleActivityMutation={scheduleActivityMutation}
                                isTimeSlotBooked={isTimeSlotBooked}
                                onSchedule={(activity) => {
                                  setSelectedActivityForScheduling(activity);
                                  setIsScheduleModalOpen(true);
                                }}
                              />
                            ))}
                          </div>
                        </SortableContext>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>

              {/* Calendar Section - Enhanced Glass Effect */}
              {itineraryWithDays && (
                <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl shadow-xl overflow-hidden mt-8">
                  <div className="p-5 border-b border-white/10">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-[#14B8A6]/20 rounded-lg flex items-center justify-center">
                        <Calendar className="h-5 w-5 text-[#14B8A6]" />
                      </div>
                      <div>
                        <h2 className="text-xl font-semibold text-white font-playfair">Your Schedule</h2>
                        <p className="text-sm text-white/70 mt-1">Drag experiences from above to schedule them</p>
                      </div>
                    </div>
                  </div>

                  <div className="p-5">
                    <ErrorBoundary>
                      <GoogleCalendarView
                        startDate={actualItinerary?.startDate || ''}
                        endDate={actualItinerary?.endDate || ''}
                        days={actualItinerary?.days || []}
                        activities={scheduledActivities}
                        compactMode={isActivityDetailModalOpen}
                        onAddActivity={(dayId: string, timeSlot: string) => {
                          devLog.log('Add activity to day:', dayId, 'time:', timeSlot);
                        }}
                        onEditActivity={(activity: SavedActivity) => {
                          handleEditActivity(activity);
                        }}
                      />
                    </ErrorBoundary>
                  </div>
                </div>
              )}

              {/* Drag Overlay */}
              <DragOverlay>
                {draggedActivity && (
                  <div className="bg-white/15 backdrop-blur-sm rounded-xl border border-[#14B8A6]/50 shadow-2xl p-4 opacity-90 max-w-xs">
                    <div className="font-medium text-sm text-white truncate">
                      {draggedActivity.activity?.activityData?.title || draggedActivity.activity?.title}
                    </div>
                    <div className="text-xs text-white/70 mt-1">
                      {draggedActivity.activity?.activityData?.location || draggedActivity.activity?.location}
                    </div>
                  </div>
                )}
              </DragOverlay>
            </DndContext>
          </ErrorBoundary>
        </div>
      </div>

      {/* Enhanced Share Modal */}
      {actualItinerary && (
        <EnhancedShareModal
          isOpen={isShareModalOpen}
          onClose={() => setIsShareModalOpen(false)}
          itinerary={actualItinerary}
        />
      )}

      {/* Edit Activity Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="bg-white/10 backdrop-blur-md border border-white/20">
          <DialogHeader>
            <DialogTitle className="font-playfair text-white">Edit Experience</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-white">Notes</label>
              <Textarea
                value={editForm.notes}
                onChange={(e) => setEditForm({...editForm, notes: e.target.value})}
                placeholder="Add notes about this experience..."
                className="mt-1 bg-white/10 border-white/20 text-white placeholder:text-white/50"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsEditModalOpen(false)} className="bg-transparent border-white/30 text-white hover:bg-white/10">
                Cancel
              </Button>
              <Button onClick={() => setIsEditModalOpen(false)} className="bg-[#14B8A6] hover:bg-[#14B8A6]/90">
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Activity Detail Modal */}
      {selectedActivity && actualItinerary && (
        <ActivityDetailModal
          activity={selectedActivity.activityData}
          isOpen={isActivityDetailModalOpen}
          onClose={() => {
            setIsActivityDetailModalOpen(false);
            setSelectedActivity(null);
          }}
          fromItinerary={true}
          itineraryId={actualItinerary.id}
          maxDays={itineraryWithDays?.days?.length || 7}
          startDate={actualItinerary.startDate}
          endDate={actualItinerary.endDate}
          onSchedule={(date: string, time: string) => {
            // Convert date and time to day number and time slot for existing mutation
            const startDateObj = new Date(actualItinerary.startDate);
            const selectedDateObj = new Date(date);
            const dayNumber = Math.floor((selectedDateObj.getTime() - startDateObj.getTime()) / (1000 * 60 * 60 * 24)) + 1;

            scheduleActivityMutation.mutate({
              activityId: selectedActivity.id,
              dayNumber,
              timeSlot: time
            });
            setIsActivityDetailModalOpen(false);
            setSelectedActivity(null);
          }}
        />
      )}

      {/* Schedule Modal with Full Calendar */}
      <Dialog open={isScheduleModalOpen} onOpenChange={setIsScheduleModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-white/10 backdrop-blur-md border border-white/20">
          <DialogHeader>
            <DialogTitle className="font-playfair text-xl text-white">
              Schedule: {selectedActivityForScheduling?.activityData?.title}
            </DialogTitle>
          </DialogHeader>
          <div className="p-4">
            {selectedActivityForScheduling && actualItinerary?.startDate && actualItinerary?.endDate ? (
              <TripDateScheduler
                activityCode={selectedActivityForScheduling.activityData.productCode}
                activityTitle={selectedActivityForScheduling.activityData.title}
                startDate={actualItinerary.startDate}
                endDate={actualItinerary.endDate}
                itineraryId={actualItinerary.id}
                onSchedule={(date: string, time: string) => {
                  // Convert date and time to day number and time slot for existing mutation (using destination timezone)
                  const startDateObj = new Date(actualItinerary.startDate + 'T00:00:00.000Z');
                  const selectedDateObj = new Date(date + 'T00:00:00.000Z');
                  const dayNumber = Math.floor((selectedDateObj.getTime() - startDateObj.getTime()) / (1000 * 60 * 60 * 24)) + 1;

                  scheduleActivityMutation.mutate({
                    activityId: selectedActivityForScheduling.id,
                    dayNumber,
                    timeSlot: time
                  });
                  setIsScheduleModalOpen(false);
                  setSelectedActivityForScheduling(null);
                }}
                disabled={false}
              />
            ) : (
              <div className="text-center py-8">
                <p className="text-white/70 mb-4">Unable to load scheduling data.</p>
                <Button
                  onClick={() => {
                    setIsScheduleModalOpen(false);
                    setSelectedActivityForScheduling(null);
                  }}
                  className="bg-[#14B8A6] hover:bg-[#14B8A6]/90 text-white"
                >
                  Close
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}