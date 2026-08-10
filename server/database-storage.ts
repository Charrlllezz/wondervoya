import { 
  users, 
  conversations,
  itineraryCollaborators,
  itineraryShares,
  collaboratorActivities,
  type User, 
  type UpsertUser,
  type Conversation,
  type InsertConversation,
  type TripItinerary, 
  type InsertTripItinerary, 
  type SavedActivity, 
  type InsertSavedActivity, 
  type ItineraryDay, 
  type InsertItineraryDay, 
  type TimeSlot, 
  type InsertTimeSlot,
  type ItineraryCollaborator,
  type InsertItineraryCollaborator,
  type ItineraryShare,
  type InsertItineraryShare,
  type CollaboratorActivity,
  type InsertCollaboratorActivity
} from "@shared/schema";
import { db } from "./db";
import { eq, and } from "drizzle-orm";
import { IStorage } from "./storage";

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async getConversation(sessionId: string): Promise<Conversation | undefined> {
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.sessionId, sessionId));
    return conversation;
  }

  async createConversation(insertConversation: InsertConversation): Promise<Conversation> {
    const [conversation] = await db
      .insert(conversations)
      .values(insertConversation)
      .returning();
    return conversation;
  }

  async updateConversation(sessionId: string, updates: Partial<InsertConversation>): Promise<Conversation | undefined> {
    const [conversation] = await db
      .update(conversations)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(conversations.sessionId, sessionId))
      .returning();
    return conversation;
  }

  // Collaborative planning methods
  async createItineraryShare(insertShare: InsertItineraryShare): Promise<ItineraryShare> {
    const [share] = await db
      .insert(itineraryShares)
      .values(insertShare)
      .returning();
    return share;
  }

  async getItineraryByShareToken(shareToken: string): Promise<TripItinerary | undefined> {
    const [share] = await db
      .select()
      .from(itineraryShares)
      .where(and(
        eq(itineraryShares.shareToken, shareToken),
        eq(itineraryShares.isActive, true)
      ));

    if (!share) return undefined;

    // Update access count
    await db
      .update(itineraryShares)
      .set({ accessCount: (share.accessCount ?? 0) + 1 })
      .where(eq(itineraryShares.id, share.id));

    // Return the itinerary - for now return undefined as we need to implement itinerary storage in DB
    return undefined;
  }

  async addCollaborator(insertCollaborator: InsertItineraryCollaborator): Promise<ItineraryCollaborator> {
    const [collaborator] = await db
      .insert(itineraryCollaborators)
      .values(insertCollaborator)
      .returning();
    return collaborator;
  }

  async getItineraryCollaborators(itineraryId: string): Promise<ItineraryCollaborator[]> {
    return await db
      .select()
      .from(itineraryCollaborators)
      .where(eq(itineraryCollaborators.itineraryId, itineraryId));
  }

  async updateCollaboratorStatus(collaboratorId: string, status: string): Promise<ItineraryCollaborator | undefined> {
    const [collaborator] = await db
      .update(itineraryCollaborators)
      .set({ status, updatedAt: new Date() })
      .where(eq(itineraryCollaborators.id, collaboratorId))
      .returning();
    return collaborator;
  }

  async addCollaboratorActivity(insertActivity: InsertCollaboratorActivity): Promise<CollaboratorActivity> {
    const [activity] = await db
      .insert(collaboratorActivities)
      .values(insertActivity)
      .returning();
    return activity;
  }

  async getCollaboratorActivities(itineraryId: string): Promise<CollaboratorActivity[]> {
    return await db
      .select()
      .from(collaboratorActivities)
      .where(eq(collaboratorActivities.itineraryId, itineraryId));
  }

  // Placeholder implementations for remaining methods - using memory storage pattern for now
  async createItinerary(itinerary: InsertTripItinerary): Promise<TripItinerary> {
    throw new Error("Not implemented in database storage yet");
  }

  async getItinerary(id: string): Promise<TripItinerary | undefined> {
    throw new Error("Not implemented in database storage yet");
  }

  async getUserItineraries(userId?: string): Promise<TripItinerary[]> {
    throw new Error("Not implemented in database storage yet");
  }

  async updateItinerary(id: string, updates: Partial<InsertTripItinerary>): Promise<TripItinerary | undefined> {
    throw new Error("Not implemented in database storage yet");
  }

  async deleteItinerary(id: string): Promise<boolean> {
    throw new Error("Not implemented in database storage yet");
  }

  async addActivityToItinerary(itineraryId: string, activity: InsertSavedActivity): Promise<SavedActivity> {
    throw new Error("Not implemented in database storage yet");
  }

  async removeActivityFromItinerary(itineraryId: string, activityId: string): Promise<boolean> {
    throw new Error("Not implemented in database storage yet");
  }

  async updateActivityInItinerary(itineraryId: string, activityId: string, updates: Partial<InsertSavedActivity>): Promise<SavedActivity | undefined> {
    throw new Error("Not implemented in database storage yet");
  }

  async addDayToItinerary(itineraryId: string, day: InsertItineraryDay): Promise<ItineraryDay> {
    throw new Error("Not implemented in database storage yet");
  }

  async updateItineraryDay(itineraryId: string, dayId: string, updates: Partial<InsertItineraryDay>): Promise<ItineraryDay | undefined> {
    throw new Error("Not implemented in database storage yet");
  }

  async removeDayFromItinerary(itineraryId: string, dayId: string): Promise<boolean> {
    throw new Error("Not implemented in database storage yet");
  }

  async addTimeSlotToDay(itineraryId: string, dayId: string, timeSlot: InsertTimeSlot): Promise<TimeSlot> {
    throw new Error("Not implemented in database storage yet");
  }

  async updateTimeSlot(itineraryId: string, dayId: string, timeSlotId: string, updates: Partial<InsertTimeSlot>): Promise<TimeSlot | undefined> {
    throw new Error("Not implemented in database storage yet");
  }

  async removeTimeSlot(itineraryId: string, dayId: string, timeSlotId: string): Promise<boolean> {
    throw new Error("Not implemented in database storage yet");
  }

  async scheduleActivityToTimeSlot(itineraryId: string, dayId: string, timeSlotId: string, activityId: string): Promise<boolean> {
    throw new Error("Not implemented in database storage yet");
  }
}