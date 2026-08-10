import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Plus, Clock, MapPin, ExternalLink } from 'lucide-react';
import { ActivityDetailModal } from './activity-detail-modal';
import type { SavedActivity, ItineraryDay, TimeSlot } from '@shared/schema';
import { format, addDays } from 'date-fns';

interface GoogleCalendarViewProps {
  startDate: string;
  endDate: string;
  days: ItineraryDay[];
  activities: SavedActivity[];
  compactMode?: boolean;
  onAddActivity?: (dayId: string, timeSlot: string) => void;
  onEditActivity?: (activity: SavedActivity) => void;
}

export function GoogleCalendarView({ 
  startDate, 
  endDate, 
  days, 
  activities,
  compactMode = false,
  onAddActivity,
  onEditActivity 
}: GoogleCalendarViewProps) {
  const [currentView, setCurrentView] = useState<'week' | 'day'>('week');
  const [selectedActivity, setSelectedActivity] = useState<SavedActivity | null>(null);
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [currentDate, setCurrentDate] = useState(new Date()); // Track current calendar date

  // Generate dynamic time slots based on scheduled activities
  const timeSlots = useMemo(() => {
    // Find all scheduled times across all days
    const scheduledTimes: string[] = [];

    days.forEach(day => {
      day.timeSlots?.forEach(slot => {
        if (slot.startTime && slot.activity) {
          scheduledTimes.push(slot.startTime);
          if (slot.endTime) {
            scheduledTimes.push(slot.endTime);
          }
        }
      });
    });

    let startHour = 7; // Default business start
    let endHour = 21;  // Default business end

    if (scheduledTimes.length > 0) {
      // Find earliest and latest times
      const timeHours = scheduledTimes.map(time => {
        const hour = parseInt(time.split(':')[0]);
        return hour;
      });

      const earliestHour = Math.min(...timeHours);
      const latestHour = Math.max(...timeHours);

      // Set range to 1 hour before earliest and 1 hour after latest
      startHour = Math.max(5, earliestHour - 1);
      endHour = Math.min(23, latestHour + 1);
    }

    // Generate slots with gap removal logic
    const slots: string[] = [];
    const activeHours = new Set<number>();

    // Mark hours that have activities or are within 1 hour of activities
    scheduledTimes.forEach(time => {
      const hour = parseInt(time.split(':')[0]);
      for (let h = hour - 1; h <= hour + 1; h++) {
        if (h >= startHour && h <= endHour) {
          activeHours.add(h);
        }
      }
    });

    // If no activities, show business hours
    if (activeHours.size === 0) {
      for (let h = startHour; h <= endHour; h++) {
        activeHours.add(h);
      }
    }

    // Convert to sorted array and fill gaps smaller than 2 hours
    const sortedHours = Array.from(activeHours).sort((a, b) => a - b);
    const finalHours = new Set(sortedHours);

    // Fill gaps of 1 hour
    for (let i = 0; i < sortedHours.length - 1; i++) {
      const current = sortedHours[i];
      const next = sortedHours[i + 1];

      if (next - current === 2) {
        finalHours.add(current + 1);
      }
    }

    // Generate time slots for final hours
    Array.from(finalHours).sort((a, b) => a - b).forEach(hour => {
      slots.push(`${hour.toString().padStart(2, '0')}:00`);
      slots.push(`${hour.toString().padStart(2, '0')}:30`);
    });

    return slots;
  }, [days]);

  // Generate all days for the trip - fix timezone issues
  const tripDays = useMemo(() => {
    if (!startDate || !endDate) return [];

    const tripDaysArray = [];
    // Parse dates as simple strings to avoid any timezone conversion
    const startYear = parseInt(startDate.split('-')[0]);
    const startMonth = parseInt(startDate.split('-')[1]) - 1; // Month is 0-indexed
    const startDay = parseInt(startDate.split('-')[2]);

    const endYear = parseInt(endDate.split('-')[0]);
    const endMonth = parseInt(endDate.split('-')[1]) - 1;
    const endDay = parseInt(endDate.split('-')[2]);

    const startDateObj = new Date(startYear, startMonth, startDay);
    const endDateObj = new Date(endYear, endMonth, endDay);

    let currentDate = new Date(startDateObj);
    let dayNumber = 1;

    while (currentDate <= endDateObj) {
      const year = currentDate.getFullYear();
      const month = String(currentDate.getMonth() + 1).padStart(2, '0');
      const day = String(currentDate.getDate()).padStart(2, '0');
      const dayId = `${year}-${month}-${day}`;

      const existingDay = days?.find(d => d.date === dayId);

      tripDaysArray.push({
        dayNumber,
        date: dayId,
        dateObj: new Date(currentDate),
        timeSlots: existingDay?.timeSlots || []
      });

      currentDate.setDate(currentDate.getDate() + 1);
      dayNumber++;
    }

    return tripDaysArray;
  }, [startDate, endDate, days]);

  // Generate trip dates without timezone issues
  const generateTripDates = () => {
    const dates = [];

    // Parse dates manually to avoid timezone shifts
    const startYear = parseInt(startDate.split('-')[0]);
    const startMonth = parseInt(startDate.split('-')[1]) - 1;
    const startDay = parseInt(startDate.split('-')[2]);

    const endYear = parseInt(endDate.split('-')[0]);
    const endMonth = parseInt(endDate.split('-')[1]) - 1;
    const endDay = parseInt(endDate.split('-')[2]);

    const start = new Date(startYear, startMonth, startDay);
    const end = new Date(endYear, endMonth, endDay);

    const current = new Date(start);
    while (current <= end) {
      dates.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }

    return dates;
  };

  const tripDates = generateTripDates();

  // Hide calendar completely when activity modal is open OR when in compact mode
  if (compactMode || isActivityModalOpen) {
    return (
      <>
        {/* Activity Detail Modal - still render when hidden */}
        {selectedActivity && (
          <ActivityDetailModal
            activity={selectedActivity}
            isOpen={isActivityModalOpen}
            onClose={() => {
              setIsActivityModalOpen(false);
              setSelectedActivity(null);
            }}
            fromItinerary={true}
            startDate={startDate}
            endDate={endDate}
            onSchedule={(date: string, time: string) => {
              // Handle rescheduling from calendar view
              if (onEditActivity && selectedActivity) {
                onEditActivity(selectedActivity);
              }
              setIsActivityModalOpen(false);
              setSelectedActivity(null);
            }}
          />
        )}
      </>
    );
  }

  const formatTime = (timeSlot: string) => {
    const [hours, minutes] = timeSlot.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    const displayMinutes = minutes === '00' ? '' : `:${minutes}`;
    return `${displayHour}${displayMinutes}${ampm}`;
  };

  const getActivitiesForSlot = (date: Date, timeSlot: string) => {
    // Format date consistently without timezone conversion
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    const dayData = days.find(day => {
      // Use the day's date property directly
      return day.date === dateStr;
    });

    if (!dayData) {
      return [];
    }

    if (!dayData?.timeSlots) {
      return [];
    }

    // Find slots that match this time (exact match or overlapping)
    const matchingSlots = dayData.timeSlots.filter((slot: any) => {

      if (!slot.startTime) {
        return false;
      }

      if (!slot.activity || !slot.activity.title) {
        return false;
      }

      // Convert times to minutes for comparison
      const timeToMinutes = (time: string) => {
        const [hours, minutes] = time.split(':').map(Number);
        return hours * 60 + (minutes || 0);
      };

      const slotTime = timeToMinutes(timeSlot);
      const startTime = timeToMinutes(slot.startTime);

      // If no endTime, assume 1 hour duration
      let endTime = startTime + 60;
      if (slot.endTime) {
        endTime = timeToMinutes(slot.endTime);
      }

      // Activity spans this time slot
      const isWithinRange = slotTime >= startTime && slotTime < endTime;
      return isWithinRange;
    });

    return matchingSlots.map((slot: any) => {
      // Create a properly structured activity object
      const activity = slot.activity;
      return {
        id: activity.id || activity.productCode,
        activityData: activity,
        savedAt: new Date().toISOString(),
        notes: '',
        priority: 'want-to-do' as const,
        timeSlotId: slot.id,
        scheduledDate: dayData.date,
        scheduledTime: slot.startTime,
        timeSlot: slot
      };
    });
  };

  const colors = [
    'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-red-500', 
    'bg-yellow-500', 'bg-indigo-500', 'bg-pink-500', 'bg-teal-500'
  ];

  // Calendar navigation
  const goToPreviousMonth = () => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(newDate.getMonth() - 1);
      return newDate;
    });
  };

  const goToNextMonth = () => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(newDate.getMonth() + 1);
      return newDate;
    });
  };

  // Auto-advance calendar logic
  useEffect(() => {
    if (!startDate) return;

    const tripStartDate = new Date(startDate);
    const today = new Date();
    const currentMonth = currentDate.getMonth();
    const currentYear = currentDate.getFullYear();

    // Check if we're showing current month and trip starts in a future month
    const isCurrentMonth = currentMonth === today.getMonth() && currentYear === today.getFullYear();
    const tripStartsLater = tripStartDate.getMonth() > today.getMonth() || 
                           tripStartDate.getFullYear() > today.getFullYear();

    // Auto-advance if showing current month but trip starts later
    if (isCurrentMonth && tripStartsLater) {
      console.log('🗓️ Auto-advancing calendar to trip start month');
      setCurrentDate(new Date(tripStartDate.getFullYear(), tripStartDate.getMonth(), 1));
    }
  }, [startDate, currentDate]);

  return (
    <Card className={`w-full bg-white/10 backdrop-blur-md border border-white/20 shadow-xl rounded-2xl overflow-hidden transition-all duration-300 ${
      compactMode ? 'scale-75 origin-top-left' : ''
    }`}>
      <CardContent className="p-0">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Button
              variant={currentView === 'week' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setCurrentView('week')}
              className={currentView === 'week' 
                ? 'bg-[#14B8A6] hover:bg-[#14B8A6]/90 text-white border-[#14B8A6]' 
                : 'bg-white/10 hover:bg-white/20 text-white border-white/20 hover:border-[#14B8A6]'
              }
            >
              Week
            </Button>
            <Button
              variant={currentView === 'day' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setCurrentView('day')}
              className={currentView === 'day' 
                ? 'bg-[#14B8A6] hover:bg-[#14B8A6]/90 text-white border-[#14B8A6]' 
                : 'bg-white/10 hover:bg-white/20 text-white border-white/20 hover:border-[#14B8A6]'
              }
            >
              Day
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="text-white hover:bg-white/10">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h3 className="font-semibold text-lg text-white">
              {new Date(startDate).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </h3>
            <Button variant="ghost" size="sm" className="text-white hover:bg-white/10">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Week View */}
        {currentView === 'week' && (
          <div className="overflow-x-auto">
            <div className="min-w-[800px]" style={{ display: 'grid', gridTemplateColumns: `140px repeat(${tripDates.length}, 1fr)` }}>
              {/* Date Headers */}
              <div className="contents">
                <div className="p-3 text-xs font-medium text-white/70 border-r border-white/10 border-b border-white/10 bg-white/5">
                  TIME
                </div>
                {tripDates.map((date, index) => (
                  <div key={index} className="p-3 text-center border-r border-white/10 last:border-r-0 border-b border-white/10 bg-white/5">
                    <div className="text-sm font-medium text-white">
                      {date.toLocaleDateString('en-US', { weekday: 'short' })}
                    </div>
                    <div className="text-lg font-bold text-white">
                      {date.getDate()}
                    </div>
                  </div>
                ))}
              </div>

              {/* Dynamic Time Grid */}
              <div className="contents">
                {timeSlots.map((timeSlot) => (
                  <div key={timeSlot} className="contents">
                    {/* Time Label - Compact */}
                    <div className="p-2 text-xs text-white/70 border-r border-white/10 border-b border-white/10 bg-white/5 flex items-center justify-center font-medium sticky left-0 z-20 backdrop-blur-sm">
                      <span className="text-center leading-tight">{formatTime(timeSlot)}</span>
                    </div>

                    {/* Date Columns */}
                    {tripDates.map((date, dayIndex) => {
                      const activitiesInSlot = getActivitiesForSlot(date, timeSlot);
                      const hour = parseInt(timeSlot.split(':')[0]);
                      const isBusinessTime = hour >= 7 && hour <= 21;
                      const currentSlotIndex = timeSlots.indexOf(timeSlot);

                      return (
                        <div 
                          key={`${dayIndex}-${timeSlot}`}
                          className={`relative p-1 border-r border-white/10 last:border-r-0 border-b border-white/10 min-h-[45px] ${
                            isBusinessTime ? 'bg-white/5' : 'bg-white/2'
                          } hover:bg-[#14B8A6]/10 transition-colors group`}
                        >
                          {/* Activity Cards - Consolidated blocks to prevent duplication */}
                          {(() => {
                            // Find activities that should be rendered at this time slot
                            const timeSlotActivities = activitiesInSlot.filter((activity: any) => {
                              // Only render at the exact START time to prevent duplicates
                              const startTime = activity?.timeSlot?.startTime;
                              const isExactStart = startTime === timeSlot;

                              if (isExactStart) {
                              }

                              return isExactStart;
                            });

                            if (timeSlotActivities.length > 0) {
                              console.log(`🎨 CALENDAR RENDER: Found ${timeSlotActivities.length} activities to render at ${timeSlot}`);
                            }

                            return timeSlotActivities.map((activity: any, activityIndex: number) => {
                              console.log(`🎨 CALENDAR RENDER: Rendering activity "${activity.activityData?.title}" at ${timeSlot}`);
                              const colorClass = colors[activityIndex % colors.length];
                              const hoverClass = colorClass.replace('500', '600');

                              // Calculate activity duration for proper block height
                              const startTime = activity?.timeSlot?.startTime;
                              const endTime = activity?.timeSlot?.endTime;
                              let blockHeight = 43; // Default single slot height

                              if (startTime && endTime && timeSlots.includes(startTime) && timeSlots.includes(endTime)) {
                                const startIndex = timeSlots.indexOf(startTime);
                                const endIndex = timeSlots.indexOf(endTime);
                                if (endIndex > startIndex) {
                                  blockHeight = (endIndex - startIndex) * 45 - 2;
                                }
                              }

                              const bookingUrl = (activity?.activityData?.bookingUrl || 
                                               activity?.activityData?.productUrl || 
                                               `https://www.viator.com/tours/${activity?.activityData?.productCode}`) +
                                               `?utm_source=wondervoya&utm_medium=referral&date=${activity?.timeSlot?.date || ''}&time=${startTime || ''}`;

                              return (
                                <div 
                                  key={`${activity.id || activityIndex}-${startTime}`}
                                  className={`mb-1 relative group ${colorClass} text-white rounded-md px-2 py-1 transition-all duration-200 shadow-sm text-xs overflow-hidden border border-opacity-30 cursor-pointer hover:scale-105 hover:shadow-lg hover:z-20`}
                                  style={{ 
                                    minHeight: `${blockHeight}px`,
                                    position: blockHeight > 43 ? 'absolute' : 'static',
                                    width: blockHeight > 43 ? 'calc(100% - 8px)' : 'auto',
                                    zIndex: blockHeight > 43 ? 10 : 'auto',
                                    backgroundImage: (() => {
                                      // Try multiple image sources from Viator API
                                      const coverImage = activity?.activityData?.coverImageUrl || 
                                                       activity?.activityData?.imageUrl ||
                                                       activity?.activityData?.gallery?.[0]?.url ||
                                                       activity?.activityData?.images?.[0]?.url;

                                      return coverImage ? 
                                        `linear-gradient(rgba(0,0,0,0.3), rgba(0,0,0,0.5)), url(${coverImage})` : 
                                        'none'
                                    })(),
                                    backgroundSize: 'cover',
                                    backgroundPosition: 'center'
                                  }}
                                  onClick={() => {
                                    setSelectedActivity(activity);
                                    setIsActivityModalOpen(true);
                                  }}
                                >
                                  {/* Main activity content */}
                                  <div>
                                    <div className="font-medium truncate text-xs leading-tight">
                                      {activity?.activityData?.title || activity?.title || 'Activity'}
                                    </div>
                                    <div className="text-xs opacity-90 flex items-center gap-1">
                                      <Clock className="h-2 w-2 flex-shrink-0" />
                                      <span className="truncate">
                                        {startTime}
                                        {endTime && endTime !== startTime && ` - ${endTime}`}
                                      </span>
                                    </div>
                                    {activity?.activityData?.price && (
                                      <div className="text-xs opacity-80 font-medium">
                                        {activity.activityData.price.currency} {activity.activityData.price.amount}
                                      </div>
                                    )}
                                  </div>

                                  {/* Booking button - appears on hover for taller blocks, always visible for short blocks */}
                                  <div className={`absolute top-1 right-1 transition-opacity duration-200 ${
                                    blockHeight > 60 
                                      ? 'opacity-0 group-hover:opacity-100' 
                                      : 'opacity-80 hover:opacity-100'
                                  }`}>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        window.open(bookingUrl, '_blank', 'noopener,noreferrer');
                                      }}
                                      className="bg-orange-500/90 backdrop-blur-sm text-white hover:bg-orange-600 hover:scale-105 p-1 rounded text-xs font-medium shadow-sm transition-all duration-200 flex items-center gap-1"
                                      title="Book on Viator"
                                    >
                                      <ExternalLink className="h-2.5 w-2.5" />
                                      {blockHeight > 60 && <span>Book</span>}
                                    </button>
                                  </div>
                                </div>
                              );
                            });
                          })()}

                          {/* Add Activity Button for Empty Slots */}
                          {activitiesInSlot.length === 0 && onAddActivity && (
                            <button
                              onClick={() => {
                                const dateStr = date.toISOString().split('T')[0];
                                const dayData = days.find(day => {
                                  const dayDate = new Date(startDate);
                                  dayDate.setDate(dayDate.getDate() + day.dayNumber - 1);
                                  return dayDate.toISOString().split('T')[0] === dateStr;
                                });
                                if (dayData?.id) {
                                  onAddActivity(dayData.id, timeSlot);
                                }
                              }}
                              className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-gray-400 hover:text-blue-500 hover:bg-blue-50/50 rounded-md"
                            >
                              <div className="flex items-center gap-1 text-xs font-medium">
                                <span>+</span>
                                <span className="hidden sm:inline">Add</span>
                              </div>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Day View */}
        {currentView === 'day' && (
          <div className="overflow-x-auto">
            <div className="min-w-[600px]">
              {/* Day Navigation */}
              <div className="flex items-center justify-between p-4 border-b border-white/10">
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setSelectedDayIndex(Math.max(0, selectedDayIndex - 1))}
                  disabled={selectedDayIndex === 0}
                  className="text-white hover:bg-white/10 hover:text-white disabled:text-white/40"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous Day
                </Button>

                <div className="text-center">
                  <div className="text-lg font-semibold text-white">
                    {tripDates[selectedDayIndex]?.toLocaleDateString('en-US', { 
                      weekday: 'long', 
                      month: 'long', 
                      day: 'numeric' 
                    })}
                  </div>
                  <div className="text-sm text-white/70">
                    Day {selectedDayIndex + 1} of {tripDates.length}
                  </div>
                </div>

                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setSelectedDayIndex(Math.min(tripDates.length - 1, selectedDayIndex + 1))}
                  disabled={selectedDayIndex === tripDates.length - 1}
                  className="text-white hover:bg-white/10 hover:text-white disabled:text-white/40"
                >
                  Next Day
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              {/* Single Day Grid */}
              <div className="grid grid-cols-2 gap-0">
                {/* Time Column */}
                <div className="border-r border-white/10">
                  <div className="p-3 text-xs font-medium text-white/70 border-b border-white/10 bg-white/5">
                    TIME
                  </div>
                  {timeSlots.map((time) => (
                    <div key={time} className="p-2 text-xs text-white/70 border-b border-white/10 bg-white/5 flex items-center justify-center font-medium min-h-[60px]">
                      <span className="text-center leading-tight">{formatTime(time)}</span>
                    </div>
                  ))}
                </div>

                {/* Activity Column */}
                <div>
                  <div className="p-3 text-center border-b border-white/10 bg-white/5">
                    <div className="text-sm font-medium text-white">
                      {tripDates[selectedDayIndex]?.toLocaleDateString('en-US', { weekday: 'short' })}
                    </div>
                    <div className="text-lg font-bold text-white">
                      {tripDates[selectedDayIndex]?.getDate()}
                    </div>
                  </div>
                  {timeSlots.map((timeSlot) => {
                    const selectedDate = tripDates[selectedDayIndex];
                    const activitiesInSlot = selectedDate ? getActivitiesForSlot(selectedDate, timeSlot) : [];
                    const hour = parseInt(timeSlot.split(':')[0]);
                    const isBusinessTime = hour >= 7 && hour <= 21;

                    return (
                      <div 
                        key={timeSlot}
                        className={`relative p-2 border-b border-white/10 min-h-[60px] ${
                          isBusinessTime ? 'bg-white/5' : 'bg-white/2'
                        } hover:bg-[#14B8A6]/10 transition-colors group`}
                      >
                        {activitiesInSlot.map((activity, activityIndex) => {
                          const startTime = activity?.timeSlot?.startTime;
                          if (startTime !== timeSlot) return null; // Only render at start time

                          const colorClass = colors[activityIndex % colors.length];
                          const endTime = activity?.timeSlot?.endTime;
                          let blockHeight = 58; // Default single slot height

                          if (startTime && endTime && timeSlots.includes(startTime) && timeSlots.includes(endTime)) {
                            const startIndex = timeSlots.indexOf(startTime);
                            const endIndex = timeSlots.indexOf(endTime);
                            if (endIndex > startIndex) {
                              blockHeight = (endIndex - startIndex) * 60 - 2;
                            }
                          }

                          const bookingUrl = (activity?.activityData?.bookingUrl || 
                                           activity?.activityData?.productUrl || 
                                           `https://www.viator.com/tours/${activity?.activityData?.productCode}`) +
                                           `?utm_source=wondervoya&utm_medium=referral&date=${activity?.timeSlot?.date || ''}&time=${startTime || ''}`;

                          return (
                            <div
                              key={`${activity.id}-${startTime}`}
                              className={`${colorClass} text-white rounded-lg p-3 mb-1 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer group/activity relative overflow-hidden`}
                              style={{ height: `${blockHeight}px` }}
                              onClick={() => {
                                setSelectedActivity(activity);
                                setIsActivityModalOpen(true);
                              }}
                            >
                              {/* Background Image */}
                              {activity?.activityData?.coverImageUrl && (
                                <div 
                                  className="absolute inset-0 bg-cover bg-center opacity-30"
                                  style={{ backgroundImage: `url(${activity.activityData.coverImageUrl})` }}
                                />
                              )}

                              {/* Content */}
                              <div className="relative z-10">
                                <div className="text-sm font-semibold truncate mb-1">
                                  {activity?.activityData?.title}
                                </div>
                                <div className="text-xs opacity-90">
                                  {startTime} - {endTime}
                                </div>
                                {activity?.activityData?.price && (
                                  <div className="text-xs font-medium mt-1">
                                    {activity.activityData.price.currency} {activity.activityData.price.amount}
                                  </div>
                                )}
                              </div>

                              {/* Hover Booking Button */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  window.open(bookingUrl, '_blank');
                                }}
                                className="absolute top-2 right-2 opacity-0 group-hover/activity:opacity-100 transition-opacity duration-200 bg-white/20 hover:bg-white/30 text-white text-xs px-2 py-1 rounded backdrop-blur-sm"
                              >
                                Book
                              </button>
                            </div>
                          );
                        })}

                        {/* Add Activity Button */}
                        {activitiesInSlot.length === 0 && onAddActivity && (
                          <button
                            onClick={() => {
                              const selectedDate = tripDates[selectedDayIndex];
                              if (selectedDate) {
                                const dateStr = selectedDate.toISOString().split('T')[0];
                                const dayData = days.find(day => {
                                  const dayDate = new Date(startDate);
                                  dayDate.setDate(dayDate.getDate() + day.dayNumber - 1);
                                  return dayDate.toISOString().split('T')[0] === dateStr;
                                });
                                if (dayData?.id) {
                                  onAddActivity(dayData.id, timeSlot);
                                }
                              }
                            }}
                            className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-gray-400 hover:text-blue-500 hover:bg-blue-50/50 rounded-md"
                          >
                            <div className="flex items-center gap-1 text-sm font-medium">
                              <span>+</span>
                              <span>Add Activity</span>
                            </div>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>

      {/* Activity Detail Modal */}
      {selectedActivity && (
        <ActivityDetailModal
          activity={selectedActivity}
          isOpen={isActivityModalOpen}
          onClose={() => {
            setIsActivityModalOpen(false);
            setSelectedActivity(null);
          }}
          fromItinerary={true}
          startDate={startDate}
          endDate={endDate}
          onSchedule={(date: string, time: string) => {
            // Handle rescheduling from calendar view
            if (onEditActivity && selectedActivity) {
              onEditActivity(selectedActivity);
            }
            setIsActivityModalOpen(false);
            setSelectedActivity(null);
          }}
        />
      )}
    </Card>
  );
}