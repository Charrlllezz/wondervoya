import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Clock, MapPin, Star, Users, AlertCircle } from 'lucide-react';
import { format, addDays, isSameDay, parseISO } from 'date-fns';
import { ActivityRecommendation, SavedActivity, TripItinerary, TimeSlot } from '@shared/schema';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface RealTimeCalendarProps {
  itinerary: TripItinerary;
  unscheduledActivities: SavedActivity[];
  onScheduleActivity: (activityId: string, dayNumber: number, timeSlot: string) => Promise<void>;
  onRescheduleActivity: (timeSlotId: string, newDayNumber: number, newTimeSlot: string, newEndTime?: string) => Promise<void>;
  onRemoveFromSchedule: (timeSlotId: string) => Promise<void>;
}

interface TimeSlotOption {
  value: string;
  label: string;
  time: string;
  available: boolean;
  price?: { amount: number; currency: string };
}

export function RealTimeCalendar({
  itinerary,
  unscheduledActivities,
  onScheduleActivity,
  onRescheduleActivity,
  onRemoveFromSchedule
}: RealTimeCalendarProps) {
  const [selectedActivity, setSelectedActivity] = useState<SavedActivity | null>(null);
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);

  // Generate all days for the trip
  const tripDays = useMemo(() => {
    if (!itinerary.startDate || !itinerary.endDate) return [];
    
    const days = [];
    const startDate = parseISO(itinerary.startDate);
    const endDate = parseISO(itinerary.endDate);
    
    let currentDate = startDate;
    let dayNumber = 1;
    
    while (currentDate <= endDate) {
      const dayId = format(currentDate, 'yyyy-MM-dd');
      const existingDay = itinerary.days?.find(d => d.date === dayId);
      
      days.push({
        dayNumber,
        date: dayId,
        dateObj: currentDate,
        timeSlots: existingDay?.timeSlots || []
      });
      
      currentDate = addDays(currentDate, 1);
      dayNumber++;
    }
    
    return days;
  }, [itinerary.startDate, itinerary.endDate, itinerary.days]);

  // Generate time slot options for an activity
  const generateTimeSlotOptions = (activity: SavedActivity, dayDate: string): TimeSlotOption[] => {
    const options: TimeSlotOption[] = [];
    
    // First try to get extracted start times from enhanced activity data
    const extractedStartTimes = (activity.activityData as any)?.extractedStartTimes || [];
    
    if (extractedStartTimes.length > 0) {
      // Use real start times from API
      extractedStartTimes.forEach((timeData: any, index: number) => {
        const timeValue = timeData.startTime || timeData.time || timeData;
        const endTime = timeData.endTime;
        const price = timeData.price;
        
        options.push({
          value: timeValue,
          label: `${timeValue}${endTime ? ` - ${endTime}` : ''}${price ? ` - ${price.formatted || price.currency + ' ' + price.amount}` : ''}`,
          time: timeValue,
          available: true,
          price: price
        });
      });
    } else {
      // Check for raw availability data
      const availability = activity.activityData?.availability || [];
      const dayAvailability = Array.isArray(availability) ? availability.filter(avail => 
        avail.date === dayDate && avail.availabilityStatus === 'AVAILABLE'
      ) : [];
      
      if (dayAvailability.length > 0) {
        dayAvailability.forEach((avail, index) => {
          const timeValue = avail.startTime;
          const endTime = avail.endTime;
          
          options.push({
            value: timeValue,
            label: `${timeValue}${endTime ? ` - ${endTime}` : ''}`,
            time: timeValue,
            available: true,
            price: avail.price
          });
        });
      }
    }
    
    // Only return authentic data - no fallback times
    return options;
  };

  // Check for scheduling conflicts
  const checkConflicts = (dayNumber: number, newTimeSlot: string, activityDuration: string = '2h'): string | null => {
    const day = tripDays.find(d => d.dayNumber === dayNumber);
    if (!day) return null;
    
    const newStartTime = newTimeSlot;
    const newStartMinutes = timeToMinutes(newStartTime);
    const durationMinutes = parseDuration(activityDuration);
    const newEndMinutes = newStartMinutes + durationMinutes;
    
    for (const slot of day.timeSlots) {
      const existingStartMinutes = timeToMinutes(slot.startTime);
      const existingEndMinutes = timeToMinutes(slot.endTime);
      
      // Check for overlap
      if (
        (newStartMinutes >= existingStartMinutes && newStartMinutes < existingEndMinutes) ||
        (newEndMinutes > existingStartMinutes && newEndMinutes <= existingEndMinutes) ||
        (newStartMinutes <= existingStartMinutes && newEndMinutes >= existingEndMinutes)
      ) {
        return `This time conflicts with "${slot.activity?.title}" (${slot.startTime} - ${slot.endTime})`;
      }
    }
    
    return null;
  };

  // Helper functions
  const timeToMinutes = (time: string): number => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  };

  const minutesToTime = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  };

  const parseDuration = (duration: string): number => {
    const match = duration.match(/(\d+(?:\.\d+)?)\s*(h|hr|hour|hours|m|min|minutes)/i);
    if (!match) return 120; // Default 2 hours
    
    const value = parseFloat(match[1]);
    const unit = match[2].toLowerCase();
    
    if (unit.startsWith('h')) {
      return value * 60;
    } else {
      return value;
    }
  };

  const handleScheduleActivity = async (activityId: string, dayNumber: number, timeSlot: string) => {
    const activity = unscheduledActivities.find(a => a.id === activityId);
    if (!activity) return;
    
    // Check for conflicts
    const conflict = checkConflicts(dayNumber, timeSlot, activity.activityData.duration);
    if (conflict) {
      setConflictWarning(conflict);
      return;
    }
    
    setConflictWarning(null);
    await onScheduleActivity(activityId, dayNumber, timeSlot);
  };

  const handleRescheduleActivity = async (timeSlotId: string, newDayNumber: number, newTimeSlot: string) => {
    // Find the activity being rescheduled
    let activityToReschedule: ActivityRecommendation | undefined;
    
    for (const day of tripDays) {
      const slot = day.timeSlots.find(s => s.id === timeSlotId);
      if (slot?.activity) {
        activityToReschedule = slot.activity;
        break;
      }
    }
    
    if (!activityToReschedule) return;
    
    // Check for conflicts (excluding the current slot)
    const conflict = checkConflicts(newDayNumber, newTimeSlot, activityToReschedule.duration);
    if (conflict) {
      setConflictWarning(conflict);
      return;
    }
    
    setConflictWarning(null);
    
    // Calculate end time based on activity duration
    const duration = activityToReschedule.duration || '2 hours';
    const durationMinutes = parseDuration(duration);
    const startMinutes = timeToMinutes(newTimeSlot);
    const endMinutes = startMinutes + durationMinutes;
    const newEndTime = minutesToTime(endMinutes);
    
    await onRescheduleActivity(timeSlotId, newDayNumber, newTimeSlot, newEndTime);
  };

  return (
    <div className="space-y-6">
      {conflictWarning && (
        <Alert className="border-amber-200 bg-amber-50">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800">
            {conflictWarning}
          </AlertDescription>
        </Alert>
      )}

      {/* Week view calendar */}
      <div className="grid gap-4">
        {tripDays.map((day) => (
          <Card key={day.dayNumber} className="overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between">
                <div>
                  <span className="text-lg font-semibold">Day {day.dayNumber}</span>
                  <span className="ml-2 text-sm text-gray-500 font-normal">
                    {format(day.dateObj, 'EEEE, MMMM d')}
                  </span>
                </div>
                <Badge variant="outline">
                  {day.timeSlots.length} activities
                </Badge>
              </CardTitle>
            </CardHeader>
            
            <CardContent className="pt-0">
              {/* Time slots for the day */}
              <div className="space-y-3">
                {day.timeSlots
                  .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime))
                  .map((slot) => (
                    <Card key={slot.id} className="border-l-4 border-l-blue-500">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <Clock className="h-4 w-4 text-gray-500" />
                              <span className="font-semibold">
                                {slot.startTime} - {slot.endTime}
                              </span>
                              {slot.activity && (
                                <Badge variant="secondary">
                                  {slot.activity.duration}
                                </Badge>
                              )}
                            </div>
                            
                            {slot.activity && (
                              <div>
                                <h4 className="font-medium mb-1">{slot.activity.title}</h4>
                                <div className="flex items-center gap-4 text-sm text-gray-600 mb-2">
                                  <div className="flex items-center gap-1">
                                    <MapPin className="h-3 w-3" />
                                    {slot.activity.location}
                                  </div>
                                  {slot.activity.rating > 0 && (
                                    <div className="flex items-center gap-1">
                                      <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                                      {slot.activity.rating.toFixed(1)}
                                    </div>
                                  )}
                                  {slot.activity.price && (
                                    <div className="font-medium">
                                      {slot.activity.price.currency} {slot.activity.price.amount}
                                    </div>
                                  )}
                                </div>
                                
                                {/* Reschedule dropdown */}
                                <div className="flex items-center gap-2">
                                  <Select
                                    onValueChange={(value) => {
                                      const [dayNum, timeSlot] = value.split('-');
                                      handleRescheduleActivity(slot.id, parseInt(dayNum), timeSlot);
                                    }}
                                  >
                                    <SelectTrigger className="w-40 h-8">
                                      <SelectValue placeholder="Reschedule" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {tripDays.map(tripDay => {
                                        const timeOptions = generateTimeSlotOptions(
                                          { 
                                            id: 'temp', 
                                            activityData: slot.activity!, 
                                            savedAt: '' 
                                          } as SavedActivity, 
                                          tripDay.date
                                        );
                                        
                                        return timeOptions.map(option => (
                                          <SelectItem 
                                            key={`${tripDay.dayNumber}-${option.value}`}
                                            value={`${tripDay.dayNumber}-${option.value}`}
                                          >
                                            Day {tripDay.dayNumber} - {option.label}
                                          </SelectItem>
                                        ));
                                      })}
                                    </SelectContent>
                                  </Select>
                                  
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => onRemoveFromSchedule(slot.id)}
                                    className="text-red-600 hover:text-red-700"
                                  >
                                    Remove
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                
                {day.timeSlots.length === 0 && (
                  <div className="text-center py-8 text-gray-500 border-2 border-dashed rounded-lg">
                    <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No activities scheduled for this day</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Unscheduled activities section */}
      {unscheduledActivities.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Unscheduled Activities ({unscheduledActivities.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {unscheduledActivities.map((activity) => (
                <Card key={activity.id} className="border-l-4 border-l-orange-500">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-medium mb-1">{activity.activityData.title}</h4>
                        <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
                          <div className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {activity.activityData.location}
                          </div>
                          {activity.activityData.rating > 0 && (
                            <div className="flex items-center gap-1">
                              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                              {activity.activityData.rating.toFixed(1)}
                            </div>
                          )}
                          <Badge variant="outline">{activity.activityData.duration}</Badge>
                          {activity.activityData.price && (
                            <div className="font-medium">
                              {activity.activityData.price.currency} {activity.activityData.price.amount}
                            </div>
                          )}
                        </div>
                        
                        {/* Schedule dropdown */}
                        <Select
                          onValueChange={(value) => {
                            const [dayNum, timeSlot] = value.split('-');
                            handleScheduleActivity(activity.id, parseInt(dayNum), timeSlot);
                          }}
                        >
                          <SelectTrigger className="w-48">
                            <SelectValue placeholder="Schedule this activity" />
                          </SelectTrigger>
                          <SelectContent>
                            {tripDays.map(day => {
                              const timeOptions = generateTimeSlotOptions(activity, day.date);
                              
                              return timeOptions.map(option => (
                                <SelectItem 
                                  key={`${day.dayNumber}-${option.value}`}
                                  value={`${day.dayNumber}-${option.value}`}
                                  disabled={!option.available}
                                >
                                  <div className="flex items-center justify-between w-full">
                                    <span>Day {day.dayNumber} - {option.label}</span>
                                    {option.price && (
                                      <span className="ml-2 text-xs text-gray-500">
                                        {option.price.currency} {option.price.amount}
                                      </span>
                                    )}
                                  </div>
                                </SelectItem>
                              ));
                            })}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}