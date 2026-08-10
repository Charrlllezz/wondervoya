import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, Calendar, CheckCircle } from 'lucide-react';

interface AvailableTime {
  date: string;
  startTime: string;
  endTime?: string;
  availableSpaces: number;
  price?: number | {
    amount: number;
    currency: string;
  };
}

interface TripDateSchedulerProps {
  activityCode: string;
  activityTitle: string;
  startDate: string; // Trip start date
  endDate: string;   // Trip end date
  onSchedule: (date: string, time: string) => void;
  disabled?: boolean;
  itineraryId?: string; // For conflict detection
  inModal?: boolean;
}

export function TripDateScheduler({ 
  activityCode, 
  activityTitle,
  startDate, 
  endDate, 
  onSchedule, 
  disabled,
  itineraryId,
  inModal 
}: TripDateSchedulerProps) {
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [conflictFilteredSlots, setConflictFilteredSlots] = useState<AvailableTime[]>([]);
  const [isLoadingTimeSlots, setIsLoadingTimeSlots] = useState(false); // Track time slot loading state

  // Use a default duration - the server will use authentic Viator duration data when available
  const activityDurationMinutes = 60; // Default 1 hour, server will override with actual Viator duration

  // Fetch availability data for the activity
  const { data: availability, isLoading, error } = useQuery({
    queryKey: ['activity-availability', activityCode, startDate, endDate],
    queryFn: async () => {
      const response = await fetch(
        `/api/activities/${activityCode}/availability?startDate=${startDate}&endDate=${endDate}`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch availability');
      }
      return response.json() as Promise<AvailableTime[]>;
    },
    enabled: !!activityCode && !!startDate && !!endDate,
  });

  // Filter slots based on conflicts when we have both availability data and selected date
  useEffect(() => {
    if (!availability || !selectedDate) {
      // Don't clear slots immediately - keep previous state while loading
      return;
    }

    const availableSlotsForDate = availability.filter(slot => slot.date === selectedDate);

    if (!itineraryId) {
      setConflictFilteredSlots(availableSlotsForDate);
      return;
    }

    // Check for conflicts
    const checkConflicts = async () => {
      setIsLoadingTimeSlots(true); // Start loading
      try {
        const response = await fetch(`/api/itineraries/${itineraryId}/available-slots`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            activityCode,
            date: selectedDate,
            durationMinutes: activityDurationMinutes
          })
        });

        if (response.ok) {
          const conflictFreeSlots = await response.json();
          setConflictFilteredSlots(conflictFreeSlots);
        } else {
          // Fallback to showing all available slots if conflict check fails
          setConflictFilteredSlots(availableSlotsForDate);
        }
      } catch (error) {
        console.error('Error checking conflicts:', error);
        setConflictFilteredSlots(availableSlotsForDate);
      } finally {
        setIsLoadingTimeSlots(false); // Stop loading regardless of result
      }
    };

    checkConflicts();
  }, [availability, selectedDate, itineraryId, activityCode, activityDurationMinutes]);

  // Generate array of trip dates - Fix timezone issues
  const tripDates = useMemo(() => {
    const dates = [];
    // Parse dates without timezone conversion
    const startParts = startDate.split('-');
    const endParts = endDate.split('-');

    const start = new Date(parseInt(startParts[0]), parseInt(startParts[1]) - 1, parseInt(startParts[2]));
    const end = new Date(parseInt(endParts[0]), parseInt(endParts[1]) - 1, parseInt(endParts[2]));

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      dates.push(new Date(d));
    }

    return dates;
  }, [startDate, endDate]);

  // Get conflict-free availability for a specific date
  const getDateAvailability = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    const slots = availability?.filter(slot => slot.date === dateStr) || [];

    // Deduplicate by time and sort chronologically
    const uniqueSlots = slots.reduce((acc, slot) => {
      const existing = acc.find(s => s.startTime === slot.startTime);
      if (!existing) {
        acc.push(slot);
      }
      return acc;
    }, [] as AvailableTime[]);

    // Sort by time
    return uniqueSlots.sort((a, b) => {
      const timeA = a.startTime.split(':').map(Number);
      const timeB = b.startTime.split(':').map(Number);
      return timeA[0] * 60 + timeA[1] - (timeB[0] * 60 + timeB[1]);
    });
  };

  // Check if a specific time slot is available (conflict-free)
  const isTimeSlotAvailable = async (date: Date, time: string): Promise<boolean> => {
    if (!itineraryId) return true; // If no itinerary, assume available

    try {
      // Calculate day number from trip start date (using destination timezone)
      const startDateObj = new Date(startDate);
      const targetDateObj = new Date(date.toISOString().split('T')[0]);
      const dayNumber = Math.floor((targetDateObj.getTime() - startDateObj.getTime()) / (1000 * 60 * 60 * 24)) + 1;



      // Query the conflict detection endpoint with activity duration
      const params = new URLSearchParams({
        durationMinutes: activityDurationMinutes.toString(),
        productCode: activityCode
      });

      const response = await fetch(`/api/itineraries/${itineraryId}/available-slots/${dayNumber}?${params}`);
      if (!response.ok) {
        if (response.status === 400) {
          // Date is outside trip range or itinerary not properly initialized
          const errorData = await response.json().catch(() => null);
          console.warn('Time slot not available:', errorData?.message || 'Date is outside trip range');
          return false;
        }
        return true; // If other API error, assume available
      }

      const data = await response.json();
      const availableSlots = data.availableSlots || [];

      // Check if the requested time is in the available slots
      return availableSlots.includes(time);
    } catch (error) {
      console.error('Error checking time slot availability:', error);
      return true; // If error, assume available
    }
  };

  // Format date for display in local timezone
  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric'
    });
  };

  // Format time for display
  const formatTime = (timeStr: string) => {
    const [hours, minutes] = timeStr.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  // Handle date selection using natural date formatting
  const handleDateSelect = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    setSelectedDate(dateStr);
    setSelectedTime(''); // Reset time selection
  };

  // Handle time selection
  const handleTimeSelect = (time: string) => {
    setSelectedTime(time);
  };

  // Handle scheduling
  const handleScheduleActivity = async (date: string, time: string) => {
    if (!onSchedule) return;

    try {
      console.log('📅 TripDateScheduler: Scheduling activity for', { date, time });
      await onSchedule(date, time);
      setSelectedDate('');
      setSelectedTime('');
      console.log('✅ TripDateScheduler: Activity scheduled successfully');
    } catch (error: any) {
      console.error('❌ TripDateScheduler: Failed to schedule activity:', error);

      if (error?.status === 404 || error?.message?.includes('404')) {
        console.error('❌ Itinerary not found - this itinerary may have been deleted');
        throw new Error('This itinerary no longer exists. Please refresh the page and try again.');
      }

      // The error will be handled by the parent component's mutation
      throw error;
    }
  };

  const handleSchedule = () => {
    if (selectedDate && selectedTime) {
      handleScheduleActivity(selectedDate, selectedTime);
    }
  };

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <div className="relative mb-6">
          <div className="relative w-8 h-8 mx-auto">
            <svg
              className="w-8 h-8 text-white"
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
        <p className="text-gray-600">Loading availability...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-600 mb-4">Unable to load availability</p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Try Again
        </Button>
      </div>
    );
  }

  const selectedDateAvailability = selectedDate ? conflictFilteredSlots : [];

  return (
    <div className={`${inModal ? 'space-y-4' : 'space-y-6'}`}>
      {/* Header */}
      <div className="text-center">
        <h3 className={`${inModal ? 'text-base' : 'text-lg'} font-semibold ${inModal ? 'mb-1' : 'mb-2'} ${inModal ? 'text-white' : 'text-gray-900'}`}>
          Schedule: {activityTitle}
        </h3>
        <p className={`${inModal ? 'text-xs' : 'text-sm'} ${inModal ? 'text-white/70' : 'text-gray-600'}`}>
          Select a date from your trip ({tripDates[0]?.toLocaleDateString('en-US') || startDate} - {tripDates[tripDates.length - 1]?.toLocaleDateString('en-US') || endDate})
        </p>
      </div>

      {/* Trip Dates - Compact Horizontal Layout */}
      <div className="flex gap-2 justify-center">
        {tripDates.map((date, index) => {
          const dateStr = date.toISOString().split('T')[0];
          const dateAvailability = getDateAvailability(date);
          const hasAvailability = dateAvailability.length > 0;
          const isSelected = selectedDate === dateStr;

          // Check if this date has conflict-free slots available
          const hasConflictFreeSlots = selectedDate === dateStr ? conflictFilteredSlots.length > 0 : hasAvailability;

          // Determine if this date is fully booked due to conflicts
          const isFullyBookedDueToConflicts = hasAvailability && selectedDate === dateStr && conflictFilteredSlots.length === 0;

          return (
            <div 
              key={index}
              className={`relative cursor-pointer transition-all rounded-lg border-2 p-3 text-center min-w-[80px] ${
                isSelected 
                  ? isFullyBookedDueToConflicts
                    ? 'border-red-300 bg-red-50'
                    : 'border-blue-500 bg-blue-50'
                  : hasAvailability 
                    ? 'border-green-200 bg-green-50 hover:border-green-300' 
                    : 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed'
              }`}
              onClick={() => hasAvailability && handleDateSelect(date)}
              title={isFullyBookedDueToConflicts ? 'All times are booked for this date' : ''}
            >
              <div className="text-lg font-bold text-gray-900">
                {date.getDate()}
              </div>
              <div className="text-xs text-gray-600 uppercase tracking-wide">
                {date.toLocaleDateString('en-US', { weekday: 'short' })}
              </div>

              {/* Availability indicator */}
              <div className={`absolute -top-1 -right-1 w-3 h-3 rounded-full ${
                isFullyBookedDueToConflicts 
                  ? 'bg-red-400' 
                  : hasAvailability 
                    ? 'bg-green-400' 
                    : 'bg-gray-300'
              }`}></div>

              {isSelected && (
                <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                </div>
              )}
            </div>
          );
        })}
      </div>



      {/* Fully Booked Message */}
      {selectedDate && getDateAvailability(new Date(selectedDate)).length > 0 && conflictFilteredSlots.length === 0 && (
        <div className="text-center py-6 bg-red-50 rounded-lg border-2 border-red-200">
          <div className="text-red-600 mb-2">
            <Clock className="w-8 h-8 mx-auto mb-2" />
            <h4 className="font-semibold text-lg">All Times Are Booked</h4>
          </div>
          <p className="text-red-700 text-sm max-w-md mx-auto">
            All available time slots for {formatDate(new Date(selectedDate))} conflict with your existing activities. 
            Please select a different date or reschedule other activities.
          </p>
        </div>
      )}

      {/* Time Selection */}
      {selectedDate && (
        <div className="space-y-4">
          <div className="text-center">
            <h4 className={`${inModal ? 'text-sm' : 'text-md'} font-medium ${inModal ? 'text-white' : 'text-gray-800'} mb-3`}>
              Available Times for {new Date(selectedDate).toLocaleDateString('en-US', { 
                weekday: 'long', 
                month: 'long', 
                day: 'numeric' 
              })}
            </h4>
          </div>

          {/* Show loading state while fetching time slots */}
          {isLoadingTimeSlots ? (
            <div className="text-center py-4">
              <div className="relative mb-2">
                <div className="relative w-6 h-6 mx-auto">
                  <svg
                    className="w-6 h-6 text-white"
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
              <p className={`${inModal ? 'text-xs text-white/70' : 'text-sm text-gray-600'}`}>
                Loading available times...
              </p>
            </div>
          ) : selectedDateAvailability.length === 0 ? (
            <div className="text-center py-4">
              <p className={`${inModal ? 'text-xs text-red-400' : 'text-sm text-red-600'}`}>
                No available time slots for this date
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-w-md mx-auto">
              {selectedDateAvailability.map((slot, index) => {
              const isTimeSelected = selectedTime === slot.startTime;

              return (
                <div
                  key={`${slot.date}-${slot.startTime}-${index}`}
                  className={`rounded-lg border transition-all ${
                    isTimeSelected 
                      ? 'bg-blue-50 border-blue-200 ring-2 ring-blue-500' 
                      : 'bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div
                    className="flex items-center justify-between p-4 cursor-pointer"
                    onClick={() => handleTimeSelect(slot.startTime)}
                  >
                    <div className="flex items-center gap-3">
                      <Clock className="w-5 h-5 text-gray-400" />
                      <div className="font-semibold text-gray-900 text-lg">
                        {formatTime(slot.startTime)}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-sm text-gray-600">
                        {slot.availableSpaces} spaces
                      </div>
                    </div>
                  </div>

                  {/* Inline Schedule Button */}
                  {isTimeSelected && (
                    <div className="px-4 pb-4 pt-2 border-t border-blue-200">
                      <Button
                        onClick={handleSchedule}
                        disabled={disabled}
                        className="w-full bg-[#14B8A6] text-white hover:bg-[#0F9D8C]"
                      >
                        Schedule for {formatTime(slot.startTime)}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
            </div>
          )}
        </div>
      )}

      {/* Availability Legend */}
      <div className={`flex flex-wrap items-center justify-center ${inModal ? 'gap-2' : 'gap-4'} ${inModal ? 'text-xs' : 'text-xs'} ${inModal ? 'text-white/70' : 'text-gray-600'}`}>
        <div className="flex items-center gap-1">
          <div className={`${inModal ? 'w-2 h-2' : 'w-3 h-3'} rounded-full bg-green-400`}></div>
          <span>Available</span>
        </div>
        <div className="flex items-center gap-1">
          <div className={`${inModal ? 'w-2 h-2' : 'w-3 h-3'} rounded-full bg-red-400`}></div>
          <span>Fully booked</span>
        </div>
        <div className="flex items-center gap-1">
          <div className={`${inModal ? 'w-2 h-2' : 'w-3 h-3'} rounded-full bg-gray-400`}></div>
          <span>No times</span>
        </div>
      </div>

    </div>
  );
}