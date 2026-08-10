import { conversations, type Conversation, type InsertConversation, type TripItinerary, type InsertTripItinerary, type SavedActivity, type InsertSavedActivity, type User, type UpsertUser, type ItineraryDay, type InsertItineraryDay, type TimeSlot, type InsertTimeSlot, type ItineraryCollaborator, type InsertItineraryCollaborator, type ItineraryShare, type InsertItineraryShare, type CollaboratorActivity, type InsertCollaboratorActivity } from "@shared/schema";
import { updateItineraryCoverImage } from "./utils/cover-image-selector";
import { nanoid } from "nanoid";

export interface IStorage {
  getConversation(sessionId: string): Promise<Conversation | undefined>;
  createConversation(conversation: InsertConversation): Promise<Conversation>;
  updateConversation(sessionId: string, updates: Partial<InsertConversation>): Promise<Conversation | undefined>;

  // User operations
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;

  // Trip Itinerary methods
  createItinerary(itinerary: InsertTripItinerary): Promise<TripItinerary>;
  getItinerary(id: string): Promise<TripItinerary | undefined>;
  getUserItineraries(userId?: string): Promise<TripItinerary[]>;
  updateItinerary(id: string, updates: Partial<InsertTripItinerary>): Promise<TripItinerary | undefined>;
  deleteItinerary(id: string): Promise<boolean>;

  // Saved activities within itineraries
  addActivityToItinerary(itineraryId: string, activity: InsertSavedActivity): Promise<SavedActivity>;
  removeActivityFromItinerary(itineraryId: string, activityId: string): Promise<boolean>;
  updateActivityInItinerary(itineraryId: string, activityId: string, updates: Partial<InsertSavedActivity>): Promise<SavedActivity | undefined>;

  // Timeline management methods
  addDayToItinerary(itineraryId: string, day: InsertItineraryDay): Promise<ItineraryDay>;
  updateItineraryDay(itineraryId: string, dayId: string, updates: Partial<InsertItineraryDay>): Promise<ItineraryDay | undefined>;
  removeDayFromItinerary(itineraryId: string, dayId: string): Promise<boolean>;

  // Time slot management
  addTimeSlotToDay(itineraryId: string, dayId: string, timeSlot: InsertTimeSlot): Promise<TimeSlot>;
  updateTimeSlot(itineraryId: string, dayId: string, timeSlotId: string, updates: Partial<InsertTimeSlot>): Promise<TimeSlot | undefined>;
  removeTimeSlot(itineraryId: string, dayId: string, timeSlotId: string): Promise<boolean>;
  scheduleActivityToTimeSlot(itineraryId: string, dayId: string, timeSlotId: string, activityId: string): Promise<boolean>;

  // Collaborative planning methods
  createItineraryShare(share: InsertItineraryShare): Promise<ItineraryShare>;
  getItineraryByShareToken(shareToken: string): Promise<TripItinerary | undefined>;
  addCollaborator(collaborator: InsertItineraryCollaborator): Promise<ItineraryCollaborator>;
  getItineraryCollaborators(itineraryId: string): Promise<ItineraryCollaborator[]>;
  updateCollaboratorStatus(collaboratorId: string, status: string): Promise<ItineraryCollaborator | undefined>;
  addCollaboratorActivity(activity: InsertCollaboratorActivity): Promise<CollaboratorActivity>;
  getCollaboratorActivities(itineraryId: string): Promise<CollaboratorActivity[]>;
}

export class MemStorage implements IStorage {
  private conversations: Map<string, Conversation>;
  private itineraries: Map<string, TripItinerary>;
  private users: Map<string, User>;
  private shares: Map<string, ItineraryShare>;
  private collaborators: Map<string, ItineraryCollaborator>;
  private collaboratorActivities: Map<string, CollaboratorActivity>;
  private currentId: number;
  private dataFile: string = './data.json';

  constructor() {
    this.conversations = new Map();
    this.itineraries = new Map();
    this.users = new Map();
    this.shares = new Map();
    this.collaborators = new Map();
    this.collaboratorActivities = new Map();
    this.currentId = 1;
    // Load data asynchronously without blocking constructor
    this.loadData().catch(console.error);
  }

  private async loadData() {
    try {
      const { readFileSync, existsSync } = await import('fs');
      if (existsSync(this.dataFile)) {
        const data = JSON.parse(readFileSync(this.dataFile, 'utf8'));

        // Restore itineraries
        if (data.itineraries) {
          for (const [key, value] of Object.entries(data.itineraries)) {
            this.itineraries.set(key, value as TripItinerary);
          }
        }

        // Restore conversations
        if (data.conversations) {
          for (const [key, value] of Object.entries(data.conversations)) {
            this.conversations.set(key, value as Conversation);
          }
        }

        // Restore users
        if (data.users) {
          for (const [key, value] of Object.entries(data.users)) {
            this.users.set(key, value as User);
          }
        }

        console.log(`Loaded ${this.itineraries.size} itineraries, ${this.conversations.size} conversations from storage`);

        // Repair malformed itineraries (those with dates but no day structure)
        await this.repairMalformedItineraries();
      }
    } catch (error) {
      console.log('No existing data file found, starting fresh');
    }
  }

  private async repairMalformedItineraries() {
    console.log('🔧 REPAIR: Checking for malformed itineraries...');
    let repairedCount = 0;

    for (const [id, itinerary] of this.itineraries) {
      // Check if itinerary has dates but no day structure
      if (itinerary.startDate && itinerary.endDate && (!itinerary.days || itinerary.days.length === 0)) {
        console.log(`🔧 REPAIR: Found malformed itinerary ${id} - has dates (${itinerary.startDate} to ${itinerary.endDate}) but no days`);

        // Generate days structure
        const startDate = new Date(itinerary.startDate);
        const endDate = new Date(itinerary.endDate);
        const days: ItineraryDay[] = [];
        let dayNumber = 1;

        for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
          const dayId = `day-${id}-${dayNumber}`;
          days.push({
            id: dayId,
            dayNumber,
            date: date.toISOString().split('T')[0], // YYYY-MM-DD format
            timeSlots: [],
          });
          dayNumber++;
        }

        // Update the itinerary
        itinerary.days = days;
        this.itineraries.set(id, itinerary);
        repairedCount++;

        console.log(`✅ REPAIR: Fixed itinerary ${id} - created ${days.length} days`);
      }
    }

    if (repairedCount > 0) {
      console.log(`🔧 REPAIR COMPLETE: Fixed ${repairedCount} malformed itineraries, saving data...`);
      await this.saveData();
    } else {
      console.log('✅ REPAIR: No malformed itineraries found');
    }
  }

  private async saveData() {
    try {
      const { writeFileSync } = await import('fs');
      const data = {
        itineraries: Object.fromEntries(this.itineraries),
        conversations: Object.fromEntries(this.conversations),
        users: Object.fromEntries(this.users)
      };
      writeFileSync(this.dataFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Failed to save data:', error);
    }
  }

  // Clear all data for clean deployment
  clearAllData() {
    this.conversations.clear();
    this.itineraries.clear();
    this.users.clear();
    this.shares.clear();
    this.collaborators.clear();
    this.collaboratorActivities.clear();
    this.currentId = 1;
    this.saveData(); // Save the clean state immediately
  }

  async getConversation(sessionId: string): Promise<Conversation | undefined> {
    return Array.from(this.conversations.values()).find(
      (conv) => conv.sessionId === sessionId,
    );
  }

  async createConversation(insertConversation: InsertConversation): Promise<Conversation> {
    const id = this.currentId++;
    const now = new Date();
    const conversation: Conversation = {
      title: null,
      travelPreferences: null,
      lastRecommendations: null,
      multiDayTrip: null,
      ...insertConversation,
      messages: insertConversation.messages ?? [],
      id,
      createdAt: now,
      updatedAt: now,
    };
    this.conversations.set(conversation.sessionId, conversation);
    return conversation;
  }

  async updateConversation(sessionId: string, updates: Partial<InsertConversation>): Promise<Conversation | undefined> {
    const existing = await this.getConversation(sessionId);
    if (!existing) return undefined;

    const updated: Conversation = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
    };
    this.conversations.set(sessionId, updated);
    return updated;
  }

  async getRecentConversations(limit: number = 10): Promise<Conversation[]> {
    const conversations = Array.from(this.conversations.values());
    return conversations
      .filter(conv => conv.messages && Array.isArray(conv.messages) && conv.messages.length > 0)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, limit);
  }

  // Trip Itinerary methods
  async createItinerary(insertItinerary: InsertTripItinerary): Promise<TripItinerary> {
    try {
      console.log('📝 Creating itinerary in storage:', insertItinerary.title);

      const id = `itinerary-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const now = new Date().toISOString();

      // Validate required fields
      if (!insertItinerary.title || insertItinerary.title.trim().length === 0) {
        throw new Error('Itinerary title is required');
      }

      // Generate days structure if start and end dates are provided
      const days: ItineraryDay[] = [];
      if (insertItinerary.startDate && insertItinerary.endDate) {
        try {
          const startDate = new Date(insertItinerary.startDate);
          const endDate = new Date(insertItinerary.endDate);

          // Validate dates
          if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            console.warn('⚠️ Invalid dates provided, skipping day generation');
          } else if (endDate < startDate) {
            console.warn('⚠️ End date is before start date, skipping day generation');
          } else {
            let dayNumber = 1;
            const maxDays = 30; // Prevent infinite loops

            for (let date = new Date(startDate); date <= endDate && dayNumber <= maxDays; date.setDate(date.getDate() + 1)) {
              const dayId = `day-${id}-${dayNumber}`;
              days.push({
                id: dayId,
                dayNumber,
                date: date.toISOString().split('T')[0], // YYYY-MM-DD format
                timeSlots: [],
              });
              dayNumber++;
            }
            console.log(`📅 Generated ${days.length} days for itinerary`);
          }
        } catch (dateError) {
          console.error('❌ Error generating days:', dateError);
          // Continue without days rather than failing completely
        }
      }

      const itinerary: TripItinerary = {
        id,
        title: insertItinerary.title.trim(),
        destination: insertItinerary.destination || '',
        startDate: insertItinerary.startDate,
        endDate: insertItinerary.endDate,
        userId: insertItinerary.userId,
        conversationId: insertItinerary.conversationId, // Preserve conversationId for navigation
        days,
        activities: [],
        budgetLimit: insertItinerary.budgetLimit,
        travelStyle: insertItinerary.travelStyle || 'mid-range',
        groupSize: insertItinerary.groupSize || 1,
        createdAt: now,
        updatedAt: now,
      };

      this.itineraries.set(id, itinerary);

      try {
        this.saveData();
        console.log('💾 Itinerary saved to storage successfully');
      } catch (saveError) {
        console.error('❌ Error saving data:', saveError);
        // Remove from memory if save failed
        this.itineraries.delete(id);
        throw new Error('Failed to save itinerary to storage');
      }

      console.log('✅ Itinerary created successfully:', id);
      return itinerary;
    } catch (error) {
      console.error('❌ Error in createItinerary:', error);
      throw error;
    }
  }

  async getItinerary(id: string): Promise<TripItinerary | undefined> {
    return this.itineraries.get(id);
  }

  async getUserItineraries(userId?: string): Promise<TripItinerary[]> {
    const allItineraries = Array.from(this.itineraries.values());
    console.log('Storage: Total itineraries in memory:', allItineraries.length);
    console.log('Storage: Filtering for userId:', userId);

    // Never return data when no identifier is supplied: itinerary.userId === undefined
    // would otherwise match every itinerary ever created without an owner (e.g. by other
    // guests whose request also lacked an identifier), leaking data across users.
    if (!userId) {
      return [];
    }

    if (allItineraries.length > 0) {
      console.log('Storage: Sample itinerary userIds:', allItineraries.slice(0, 3).map(it => ({ id: it.id, userId: it.userId })));
    }

    // Filter itineraries by user ID or session ID for proper isolation
    const filtered = allItineraries.filter(itinerary => {
      const matches = itinerary.userId === userId;
      if (!matches && allItineraries.length < 5) {
        console.log(`Storage: Itinerary ${itinerary.id} userId "${itinerary.userId}" does not match requested "${userId}"`);
      }
      return matches;
    });

    console.log('Storage: Filtered result count:', filtered.length);

    return filtered.sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  async updateItinerary(id: string, updates: Partial<InsertTripItinerary>): Promise<TripItinerary | undefined> {
    const existing = this.itineraries.get(id);
    if (!existing) return undefined;

    const updated: TripItinerary = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    this.itineraries.set(id, updated);
    return updated;
  }

  async deleteItinerary(id: string): Promise<boolean> {
    return this.itineraries.delete(id);
  }

  async addActivityToItinerary(itineraryId: string, activity: InsertSavedActivity): Promise<SavedActivity> {
    const itinerary = this.itineraries.get(itineraryId);
    if (!itinerary) throw new Error('Itinerary not found');

    const savedActivity: SavedActivity = {
      id: `activity-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      activityData: activity.activityData,
      savedAt: new Date().toISOString(),
      notes: activity.notes,
      scheduledDate: activity.scheduledDate,
      scheduledTime: activity.scheduledTime,
      timeSlotId: activity.timeSlotId,
      priority: activity.priority || 'want-to-do',
    };

    itinerary.activities.push(savedActivity);
    itinerary.updatedAt = new Date().toISOString();

    // Recalculate total cost
    const totalCost = itinerary.activities.reduce((sum, act) => {
      if (act.activityData.price) {
        return sum + act.activityData.price.amount;
      }
      return sum;
    }, 0);

    if (totalCost > 0 && itinerary.activities[0]?.activityData.price?.currency) {
      itinerary.totalEstimatedCost = {
        amount: totalCost,
        currency: itinerary.activities[0].activityData.price.currency,
      };
    }

    this.itineraries.set(itineraryId, itinerary);
    this.saveData();
    return savedActivity;
  }

  async removeActivityFromItinerary(itineraryId: string, activityId: string): Promise<boolean> {
    const itinerary = this.itineraries.get(itineraryId);
    if (!itinerary) return false;

    const initialLength = itinerary.activities.length;
    itinerary.activities = itinerary.activities.filter(act => act.id !== activityId);

    if (itinerary.activities.length !== initialLength) {
      // Recalculate total cost after removing activity
      this.recalculateItineraryCost(itinerary);
      itinerary.updatedAt = new Date().toISOString();
      this.itineraries.set(itineraryId, itinerary);
      this.saveData();
      return true;
    }

    return false;
  }

  private recalculateItineraryCost(itinerary: TripItinerary): void {
    let totalAmount = 0;
    let currency = 'USD';

    for (const activity of itinerary.activities) {
      if (activity.activityData.price) {
        totalAmount += activity.activityData.price.amount;
        currency = activity.activityData.price.currency; // Use the last currency found
      }
    }

    itinerary.totalEstimatedCost = totalAmount > 0 ? { amount: totalAmount, currency } : undefined;
  }

  async updateActivityInItinerary(itineraryId: string, activityId: string, updates: Partial<InsertSavedActivity>): Promise<SavedActivity | undefined> {
    const itinerary = this.itineraries.get(itineraryId);
    if (!itinerary) return undefined;

    const activityIndex = itinerary.activities.findIndex(act => act.id === activityId);
    if (activityIndex === -1) return undefined;

    const updatedActivity = {
      ...itinerary.activities[activityIndex],
      ...updates,
    };

    itinerary.activities[activityIndex] = updatedActivity;
    itinerary.updatedAt = new Date().toISOString();
    this.itineraries.set(itineraryId, itinerary);

    return updatedActivity;
  }

  // Timeline management methods
  async addDayToItinerary(itineraryId: string, day: InsertItineraryDay): Promise<ItineraryDay> {
    const itinerary = this.itineraries.get(itineraryId);
    if (!itinerary) throw new Error('Itinerary not found');

    const newDay: ItineraryDay = {
      id: `day-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      date: day.date,
      dayNumber: day.dayNumber,
      timeSlots: day.timeSlots?.map(slot => ({
        id: `slot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        startTime: slot.startTime,
        endTime: slot.endTime,
        activity: slot.activity,
        status: 'scheduled' as const,
        notes: slot.notes,
      })) || [],
    };

    itinerary.days.push(newDay);
    itinerary.updatedAt = new Date().toISOString();
    this.itineraries.set(itineraryId, itinerary);
    await this.saveData(); // Critical: Save to persistent storage

    console.log('✅ Day saved to storage:', newDay.id, 'day number:', day.dayNumber);
    return newDay;
  }

  async updateItineraryDay(itineraryId: string, dayId: string, updates: Partial<InsertItineraryDay>): Promise<ItineraryDay | undefined> {
    const itinerary = this.itineraries.get(itineraryId);
    if (!itinerary) return undefined;

    const dayIndex = itinerary.days.findIndex(d => d.id === dayId);
    if (dayIndex === -1) return undefined;

    const updatedDay = { ...itinerary.days[dayIndex], ...updates } as ItineraryDay;
    itinerary.days[dayIndex] = updatedDay;
    itinerary.updatedAt = new Date().toISOString();
    this.itineraries.set(itineraryId, itinerary);
    return updatedDay;
  }

  async removeDayFromItinerary(itineraryId: string, dayId: string): Promise<boolean> {
    const itinerary = this.itineraries.get(itineraryId);
    if (!itinerary) return false;

    const initialLength = itinerary.days.length;
    itinerary.days = itinerary.days.filter(d => d.id !== dayId);

    if (itinerary.days.length !== initialLength) {
      itinerary.updatedAt = new Date().toISOString();
      this.itineraries.set(itineraryId, itinerary);
      return true;
    }
    return false;
  }

  async addTimeSlotToDay(itineraryId: string, dayId: string, timeSlot: InsertTimeSlot): Promise<TimeSlot> {
    const itinerary = this.itineraries.get(itineraryId);
    if (!itinerary) throw new Error('Itinerary not found');

    const day = itinerary.days.find(d => d.id === dayId);
    if (!day) throw new Error('Day not found');

    console.log('🔍 STORAGE DEBUG: Incoming timeSlot data:', {
      hasActivity: !!timeSlot.activity,
      activityTitle: timeSlot.activity?.title,
      activityKeys: timeSlot.activity ? Object.keys(timeSlot.activity) : [],
      startTime: timeSlot.startTime,
      endTime: timeSlot.endTime
    });

    const newTimeSlot: TimeSlot = {
      id: `slot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      startTime: timeSlot.startTime,
      endTime: timeSlot.endTime,
      activity: timeSlot.activity,
      status: 'scheduled',
      notes: timeSlot.notes,
    };

    console.log('🔍 STORAGE DEBUG: Created TimeSlot object:', {
      id: newTimeSlot.id,
      hasActivity: !!newTimeSlot.activity,
      activityTitle: newTimeSlot.activity?.title,
      activityProductCode: newTimeSlot.activity?.productCode
    });

    day.timeSlots.push(newTimeSlot);
    itinerary.updatedAt = new Date().toISOString();
    this.itineraries.set(itineraryId, itinerary);
    await this.saveData(); // Critical: Save to persistent storage

    // Verify storage
    const savedItinerary = this.itineraries.get(itineraryId);
    const savedDay = savedItinerary?.days?.find(d => d.id === dayId);
    const savedSlot = savedDay?.timeSlots?.find(s => s.id === newTimeSlot.id);

    console.log('🔍 STORAGE DEBUG: Post-save verification:', {
      slotExists: !!savedSlot,
      hasActivity: !!savedSlot?.activity,
      activityTitle: savedSlot?.activity?.title,
      savedToMemory: this.itineraries.has(itineraryId)
    });

    console.log('✅ Time slot saved to storage:', newTimeSlot.id, 'for activity:', timeSlot.activity?.title);
    return newTimeSlot;
  }

  async updateTimeSlot(itineraryId: string, dayId: string, timeSlotId: string, updates: Partial<InsertTimeSlot>): Promise<TimeSlot | undefined> {
    const itinerary = this.itineraries.get(itineraryId);
    if (!itinerary) return undefined;

    const day = itinerary.days.find(d => d.id === dayId);
    if (!day) return undefined;

    const slotIndex = day.timeSlots.findIndex(s => s.id === timeSlotId);
    if (slotIndex === -1) return undefined;

    // Handle activity clearing for reschedule operations
    const updatedSlot = { ...day.timeSlots[slotIndex] };

    // Apply updates - handle activity property specially
    if ('activity' in updates && updates.activity === undefined) {
      delete updatedSlot.activity;
    } else {
      Object.assign(updatedSlot, updates);
    }

    day.timeSlots[slotIndex] = updatedSlot;
    itinerary.updatedAt = new Date().toISOString();
    this.itineraries.set(itineraryId, itinerary);
    return updatedSlot;
  }

  async removeTimeSlot(itineraryId: string, dayId: string, timeSlotId: string): Promise<boolean> {
    const itinerary = this.itineraries.get(itineraryId);
    if (!itinerary) return false;

    const day = itinerary.days.find(d => d.id === dayId);
    if (!day) return false;

    const initialLength = day.timeSlots.length;
    day.timeSlots = day.timeSlots.filter(s => s.id !== timeSlotId);

    if (day.timeSlots.length !== initialLength) {
      itinerary.updatedAt = new Date().toISOString();
      this.itineraries.set(itineraryId, itinerary);
      return true;
    }
    return false;
  }

  async scheduleActivityToTimeSlot(itineraryId: string, dayId: string, timeSlotId: string, activityId: string): Promise<boolean> {
    const itinerary = this.itineraries.get(itineraryId);
    if (!itinerary) return false;

    const day = itinerary.days.find(d => d.id === dayId);
    if (!day) return false;

    const timeSlot = day.timeSlots.find(s => s.id === timeSlotId);
    if (!timeSlot) return false;

    const activity = itinerary.activities.find(a => a.id === activityId);
    if (!activity) return false;

    // Add complete activity information to time slot for proper display
    timeSlot.activity = { ...activity.activityData };
    timeSlot.notes = activity.notes;
    timeSlot.status = 'scheduled';

    // Update activity with scheduling info
    activity.timeSlotId = timeSlotId;
    activity.scheduledDate = day.date;
    activity.scheduledTime = timeSlot.startTime;

    console.log(`✅ Activity scheduled: ${activity.activityData.title} to ${timeSlot.startTime}-${timeSlot.endTime}`);

    itinerary.updatedAt = new Date().toISOString();
    this.itineraries.set(itineraryId, itinerary);
    return true;
  }

  // User operations
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const now = new Date();
    const user: User = {
      id: userData.id,
      email: userData.email || null,
      firstName: userData.firstName || null,
      lastName: userData.lastName || null,
      profileImageUrl: userData.profileImageUrl || null,
      createdAt: userData.createdAt || now,
      updatedAt: now,
    };
    this.users.set(user.id, user);
    return user;
  }

  // Collaborative planning methods
  async createItineraryShare(insertShare: InsertItineraryShare): Promise<ItineraryShare> {
    const share: ItineraryShare = {
      expiresAt: null,
      accessCount: 0,
      isActive: true,
      ...insertShare,
      createdAt: new Date(),
    };
    this.shares.set(share.id, share);
    await this.saveData();
    return share;
  }

  async getItineraryByShareToken(shareToken: string): Promise<TripItinerary | undefined> {
    const share = Array.from(this.shares.values()).find(s => 
      s.shareToken === shareToken && s.isActive
    );

    if (!share) return undefined;

    // Update access count
    share.accessCount = (share.accessCount || 0) + 1;
    this.shares.set(share.id, share);
    await this.saveData();

    return this.itineraries.get(share.itineraryId);
  }

  async addCollaborator(insertCollaborator: InsertItineraryCollaborator): Promise<ItineraryCollaborator> {
    const collaborator: ItineraryCollaborator = {
      userId: null,
      email: null,
      role: 'viewer',
      status: 'pending',
      permissions: {},
      ...insertCollaborator,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.collaborators.set(collaborator.id, collaborator);
    await this.saveData();
    return collaborator;
  }

  async getItineraryCollaborators(itineraryId: string): Promise<ItineraryCollaborator[]> {
    return Array.from(this.collaborators.values()).filter(
      c => c.itineraryId === itineraryId
    );
  }

  async updateCollaboratorStatus(collaboratorId: string, status: string): Promise<ItineraryCollaborator | undefined> {
    const collaborator = this.collaborators.get(collaboratorId);
    if (!collaborator) return undefined;

    collaborator.status = status;
    collaborator.updatedAt = new Date();
    this.collaborators.set(collaboratorId, collaborator);
    await this.saveData();
    return collaborator;
  }

  async addCollaboratorActivity(insertActivity: InsertCollaboratorActivity): Promise<CollaboratorActivity> {
    const activity: CollaboratorActivity = {
      userId: null,
      email: null,
      targetId: null,
      message: null,
      ...insertActivity,
      createdAt: new Date(),
    };
    this.collaboratorActivities.set(activity.id, activity);
    await this.saveData();
    return activity;
  }

  async getCollaboratorActivities(itineraryId: string): Promise<CollaboratorActivity[]> {
    return Array.from(this.collaboratorActivities.values()).filter(
      a => a.itineraryId === itineraryId
    );
  }
}

export const storage = new MemStorage();