/**
 * Smart Scheduling Conflict Detection Service
 * Prevents double-booking and provides intelligent scheduling recommendations
 */

export interface TimeSlotConflict {
  hasConflict: boolean;
  conflictType: 'exact_overlap' | 'partial_overlap' | 'adjacent_tight' | 'none';
  conflictingActivity?: {
    id: string;
    title: string;
    startTime: string;
    endTime: string;
  };
  suggestion?: {
    alternativeStartTimes: string[];
    reason: string;
  };
}

export interface SchedulingContext {
  existingTimeSlots: Array<{
    id: string;
    startTime: string;
    endTime: string;
    activityTitle: string;
    activityId: string;
  }>;
  newActivity: {
    title: string;
    durationMinutes: number;
  };
  requestedStartTime: string;
  date: string;
}

export class ConflictDetector {
  /**
   * Main conflict detection method
   */
  static detectConflicts(context: SchedulingContext): TimeSlotConflict {
    const { existingTimeSlots, newActivity, requestedStartTime } = context;
    
    // Calculate end time for new activity
    const newEndTime = this.calculateEndTime(requestedStartTime, newActivity.durationMinutes);
    
    // Check for conflicts with existing activities
    for (const existingSlot of existingTimeSlots) {
      const conflict = this.checkTimeOverlap(
        requestedStartTime,
        newEndTime,
        existingSlot.startTime,
        existingSlot.endTime
      );
      
      if (conflict.hasConflict) {
        return {
          hasConflict: true,
          conflictType: conflict.type,
          conflictingActivity: {
            id: existingSlot.id,
            title: existingSlot.activityTitle,
            startTime: existingSlot.startTime,
            endTime: existingSlot.endTime
          },
          suggestion: this.generateAlternatives(context)
        };
      }
    }
    
    return {
      hasConflict: false,
      conflictType: 'none'
    };
  }

  /**
   * Check if two time ranges overlap
   */
  private static checkTimeOverlap(
    start1: string,
    end1: string,
    start2: string,
    end2: string
  ): { hasConflict: boolean; type: 'exact_overlap' | 'partial_overlap' | 'adjacent_tight' | 'none' } {
    const start1Minutes = this.timeToMinutes(start1);
    const end1Minutes = this.timeToMinutes(end1);
    const start2Minutes = this.timeToMinutes(start2);
    const end2Minutes = this.timeToMinutes(end2);
    
    console.log(`🔍 OVERLAP DEBUG: Checking ${start1}-${end1} (${start1Minutes}-${end1Minutes}min) vs ${start2}-${end2} (${start2Minutes}-${end2Minutes}min)`);
    
    // Exact overlap
    if (start1Minutes === start2Minutes && end1Minutes === end2Minutes) {
      console.log(`❌ EXACT OVERLAP detected!`);
      return { hasConflict: true, type: 'exact_overlap' };
    }
    
    // Check for any overlap
    const hasOverlap = !(end1Minutes <= start2Minutes || start1Minutes >= end2Minutes);
    
    console.log(`🔍 OVERLAP CALCULATION: hasOverlap = !(${end1Minutes} <= ${start2Minutes} || ${start1Minutes} >= ${end2Minutes}) = ${hasOverlap}`);
    
    if (hasOverlap) {
      console.log(`❌ PARTIAL OVERLAP detected!`);
      return { hasConflict: true, type: 'partial_overlap' };
    }
    
    // Check for tight adjacency (less than 15 minutes buffer)
    const buffer = 15; // 15 minutes minimum buffer
    const isTightlyAdjacent = 
      (Math.abs(end1Minutes - start2Minutes) < buffer) ||
      (Math.abs(end2Minutes - start1Minutes) < buffer);
    
    if (isTightlyAdjacent) {
      return { hasConflict: true, type: 'adjacent_tight' };
    }
    
    return { hasConflict: false, type: 'none' };
  }

  /**
   * Generate alternative time slots when conflicts are detected
   */
  private static generateAlternatives(context: SchedulingContext): {
    alternativeStartTimes: string[];
    reason: string;
  } {
    const { existingTimeSlots, newActivity, requestedStartTime } = context;
    const alternatives: string[] = [];
    
    // Try slots before and after existing activities
    const sortedSlots = [...existingTimeSlots].sort((a, b) => 
      this.timeToMinutes(a.startTime) - this.timeToMinutes(b.startTime)
    );
    
    // Try realistic morning slots (9:00 AM - 11:00 AM)
    const morningSlots = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30'];
    for (const timeSlot of morningSlots) {
      if (this.isTimeSlotAvailable(timeSlot, newActivity.durationMinutes, existingTimeSlots)) {
        alternatives.push(timeSlot);
      }
    }
    
    // Try slots between existing activities
    for (let i = 0; i < sortedSlots.length - 1; i++) {
      const currentEnd = sortedSlots[i].endTime;
      const nextStart = sortedSlots[i + 1].startTime;
      
      const gapMinutes = this.timeToMinutes(nextStart) - this.timeToMinutes(currentEnd);
      const requiredMinutes = newActivity.durationMinutes + 30; // 30 min buffer
      
      if (gapMinutes >= requiredMinutes) {
        const suggestedStart = this.addMinutes(currentEnd, 15); // 15 min buffer
        alternatives.push(suggestedStart);
      }
    }
    
    // Try afternoon slots after last activity
    if (sortedSlots.length > 0) {
      const lastEnd = sortedSlots[sortedSlots.length - 1].endTime;
      const suggestedStart = this.addMinutes(lastEnd, 15);
      
      if (this.timeToMinutes(suggestedStart) < this.timeToMinutes('18:00')) {
        alternatives.push(suggestedStart);
      }
    }
    
    return {
      alternativeStartTimes: alternatives.slice(0, 3), // Limit to 3 suggestions
      reason: `Conflict detected with existing activity. Here are alternative time slots with proper buffers.`
    };
  }

  /**
   * Check if a specific time slot is available
   */
  private static isTimeSlotAvailable(
    startTime: string,
    durationMinutes: number,
    existingSlots: Array<{ startTime: string; endTime: string; }>
  ): boolean {
    const endTime = this.calculateEndTime(startTime, durationMinutes);
    
    for (const slot of existingSlots) {
      const conflict = this.checkTimeOverlap(startTime, endTime, slot.startTime, slot.endTime);
      if (conflict.hasConflict) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Convert time string (HH:MM) to minutes since midnight
   */
  private static timeToMinutes(timeStr: string): number {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Convert minutes since midnight to time string (HH:MM)
   */
  private static minutesToTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }

  /**
   * Calculate end time given start time and duration
   */
  private static calculateEndTime(startTime: string, durationMinutes: number): string {
    const startMinutes = this.timeToMinutes(startTime);
    const endMinutes = startMinutes + durationMinutes;
    return this.minutesToTime(endMinutes);
  }

  /**
   * Add minutes to a time string
   */
  private static addMinutes(timeStr: string, minutesToAdd: number): string {
    const currentMinutes = this.timeToMinutes(timeStr);
    const newMinutes = currentMinutes + minutesToAdd;
    return this.minutesToTime(newMinutes);
  }

  /**
   * Get available time slots for a given day
   */
  static getAvailableTimeSlots(
    date: string,
    existingTimeSlots: Array<{ startTime: string; endTime: string; }>,
    activityDuration: number = 60, // Default 1 hour
    businessHours: { start: string; end: string } = { start: '09:00', end: '20:00' }
  ): string[] {
    const availableSlots: string[] = [];
    
    // Use realistic activity start times that match Viator patterns
    const realisticTimes = [
      '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
      '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', 
      '15:00', '15:30', '16:00', '16:30', '17:00', '17:30',
      '18:00', '18:30', '19:00', '19:30', '20:00'
    ];
    
    // Filter realistic times to only include available slots
    for (const timeSlot of realisticTimes) {
      if (this.isTimeSlotAvailable(timeSlot, activityDuration, existingTimeSlots)) {
        availableSlots.push(timeSlot);
      }
    }
    
    return availableSlots;
  }
}