import { pgTable, text, serial, integer, boolean, jsonb, timestamp, varchar, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull().unique(),
  title: text("title"), // For chat summaries/titles
  messages: jsonb("messages").notNull().default([]),
  travelPreferences: jsonb("travel_preferences"),
  lastRecommendations: jsonb("last_recommendations"),
  multiDayTrip: jsonb("multi_day_trip"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertConversationSchema = createInsertSchema(conversations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Conversation = typeof conversations.$inferSelect;

// Message types
export const messageSchema = z.object({
  id: z.string(),
  text: z.string(),
  sender: z.enum(["user", "ai"]),
  timestamp: z.string(),
});

export const travelPreferencesSchema = z.object({
  destination: z.string().optional(),
  dates: z.object({
    start: z.string().optional(),
    end: z.string().optional(),
  }).optional(),
  budget: z.object({
    min: z.number().optional(),
    max: z.number().optional(),
    currency: z.string().optional(),
  }).optional(),
  interests: z.array(z.string()).optional(),
  groupSize: z.number().optional(),
  travelStyle: z.array(z.string()).optional(),
});

export const activityRecommendationSchema = z.object({
  productCode: z.string(),
  title: z.string(),
  description: z.string(),
  price: z.object({
    amount: z.number(),
    currency: z.string(),
  }).nullable(),
  rating: z.number(),
  reviewCount: z.number(),
  imageUrl: z.string(),
  images: z.array(z.object({
    url: z.string(),
    caption: z.string().optional(),
  })).optional(),
  additionalImages: z.array(z.string()).optional(),
  duration: z.string(),
  durationDetails: z.object({
    hours: z.number(),
    minutes: z.number(),
    totalMinutes: z.number(),
    displayText: z.string(),
    type: z.enum(['exact', 'range', 'estimated', 'multi-day']),
    confidence: z.enum(['high', 'medium', 'low'])
  }).optional(),
  location: z.string(),
  destination: z.string().optional(),
  bookingUrl: z.string(),
  tags: z.array(z.string()),
  finalScore: z.number().optional(),
  // Enhanced features
  productUrl: z.string().optional(),
  timeZone: z.string().optional(),
  reviews: z.array(z.object({
    reviewId: z.string(),
    rating: z.number(),
    title: z.string(),
    text: z.string(),
    reviewDate: z.string(),
    reviewerName: z.string(),
    provider: z.enum(['VIATOR', 'TRIPADVISOR']),
    verified: z.boolean(),
  })).optional(),
  availability: z.array(z.object({
    date: z.string(),
    startTime: z.string(),
    endTime: z.string().optional(),
    price: z.object({
      amount: z.number(),
      currency: z.string(),
    }),
    availabilityStatus: z.enum(['AVAILABLE', 'SOLD_OUT', 'LIMITED']),
  })).optional(),
  inclusions: z.array(z.string()).optional(),
  exclusions: z.array(z.string()).optional(),
  cancellationPolicy: z.string().optional(),
  recommendations: z.array(z.string()).optional(), // Similar product codes
});

export const tripDaySchema = z.object({
  day: z.number(),
  date: z.string().optional(),
  selectedActivities: z.array(activityRecommendationSchema),
  timeSlots: z.object({
    morning: z.array(activityRecommendationSchema).optional(),
    afternoon: z.array(activityRecommendationSchema).optional(),
    evening: z.array(activityRecommendationSchema).optional(),
  }).optional(),
});

export const multiDayTripSchema = z.object({
  destination: z.string(),
  duration: z.number(),
  startDate: z.string().optional(),
  currentDay: z.number(),
  days: z.array(tripDaySchema),
  totalEstimatedCost: z.object({
    amount: z.number(),
    currency: z.string(),
  }).optional(),
});

export const conversationResponseSchema = z.object({
  message: messageSchema,
  shouldShowRecommendations: z.boolean(),
  recommendations: z.array(activityRecommendationSchema),
  sessionId: z.string(),
  isMultiDayTrip: z.boolean().optional(),
  multiDayTrip: multiDayTripSchema.optional(),
  currentDayRecommendations: z.object({
    day: z.number(),
    timeSlot: z.enum(['morning', 'afternoon', 'evening']).optional(),
    recommendations: z.array(activityRecommendationSchema),
  }).optional(),
  suggestedCategories: z.array(z.object({
    label: z.string(),
    query: z.string(),
  })).optional(),
  extractedDates: z.object({
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    specificDates: z.array(z.string()).optional(),
    duration: z.number().optional(),
  }).optional(),
});

export type Message = z.infer<typeof messageSchema>;
export type TravelPreferences = z.infer<typeof travelPreferencesSchema>;
export type ActivityRecommendation = z.infer<typeof activityRecommendationSchema>;
export type TripDay = z.infer<typeof tripDaySchema>;
export type MultiDayTrip = z.infer<typeof multiDayTripSchema>;
export type ConversationResponse = z.infer<typeof conversationResponseSchema>;

// Enhanced Trip Itinerary schemas for Smart Itinerary Builder
export const timeSlotSchema = z.object({
  id: z.string(),
  startTime: z.string(), // HH:mm format
  endTime: z.string(), // HH:mm format
  activity: activityRecommendationSchema.optional(),
  status: z.enum(['scheduled', 'confirmed', 'completed', 'cancelled']).default('scheduled'),
  notes: z.string().optional(),
  travelTimeToNext: z.number().optional(), // minutes
});

export const itineraryDaySchema = z.object({
  id: z.string(),
  date: z.string(), // YYYY-MM-DD format
  dayNumber: z.number(), // Day 1, Day 2, etc.
  timeSlots: z.array(timeSlotSchema),
  totalEstimatedCost: z.object({
    amount: z.number(),
    currency: z.string(),
  }).optional(),
  weatherInfo: z.object({
    temperature: z.number().optional(),
    condition: z.string().optional(),
    precipitation: z.number().optional(),
  }).optional(),
});

export const savedActivitySchema = z.object({
  id: z.string(),
  activityData: activityRecommendationSchema,
  savedAt: z.string(),
  notes: z.string().optional(),
  scheduledDate: z.string().optional(),
  scheduledTime: z.string().optional(),
  timeSlotId: z.string().optional(), // Reference to timeline slot
  priority: z.enum(['must-do', 'want-to-do', 'nice-to-have']).default('want-to-do'),
});

export const tripItinerarySchema = z.object({
  id: z.string(),
  title: z.string(),
  destination: z.string(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  days: z.array(itineraryDaySchema),
  activities: z.array(savedActivitySchema), // Unscheduled activities
  coverImageUrl: z.string().optional(), // Cover photo for the itinerary
  totalEstimatedCost: z.object({
    amount: z.number(),
    currency: z.string(),
  }).optional(),
  budgetLimit: z.object({
    amount: z.number(),
    currency: z.string(),
  }).optional(),
  travelStyle: z.enum(['budget', 'mid-range', 'luxury']).optional(),
  groupSize: z.number().optional(),
  userId: z.string().optional(),
  conversationId: z.string().optional(), // Link back to original chat
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const insertTimeSlotSchema = z.object({
  startTime: z.string(),
  endTime: z.string(),
  activity: activityRecommendationSchema.optional(),
  notes: z.string().optional(),
});

export const insertItineraryDaySchema = z.object({
  date: z.string(),
  dayNumber: z.number(),
  timeSlots: z.array(insertTimeSlotSchema).optional(),
});

export const insertSavedActivitySchema = z.object({
  activityData: activityRecommendationSchema,
  notes: z.string().optional(),
  scheduledDate: z.string().optional(),
  scheduledTime: z.string().optional(),
  timeSlotId: z.string().optional(),
  priority: z.enum(['must-do', 'want-to-do', 'nice-to-have']).default('want-to-do'),
});

export const insertTripItinerarySchema = z.object({
  title: z.string(),
  destination: z.string(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  coverImageUrl: z.string().optional(),
  budgetLimit: z.object({
    amount: z.number(),
    currency: z.string(),
  }).optional(),
  travelStyle: z.enum(['budget', 'mid-range', 'luxury']).optional(),
  groupSize: z.number().optional(),
  userId: z.string().optional(),
  conversationId: z.string().optional(),
});

// Export all types
export type TimeSlot = z.infer<typeof timeSlotSchema>;
export type ItineraryDay = z.infer<typeof itineraryDaySchema>;
export type InsertTimeSlot = z.infer<typeof insertTimeSlotSchema>;
export type InsertItineraryDay = z.infer<typeof insertItineraryDaySchema>;

export type SavedActivity = z.infer<typeof savedActivitySchema>;
export type TripItinerary = z.infer<typeof tripItinerarySchema>;
export type InsertSavedActivity = z.infer<typeof insertSavedActivitySchema>;
export type InsertTripItinerary = z.infer<typeof insertTripItinerarySchema>;

// Session storage table for authentication
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().notNull(),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

// Collaborative planning tables
export const itineraryCollaborators = pgTable("itinerary_collaborators", {
  id: varchar("id").primaryKey().notNull(),
  itineraryId: varchar("itinerary_id").notNull(),
  userId: varchar("user_id"),
  email: varchar("email"), // For non-registered users
  role: varchar("role").notNull().default("viewer"), // viewer, editor, owner
  invitedBy: varchar("invited_by").notNull(),
  status: varchar("status").notNull().default("pending"), // pending, accepted, declined
  permissions: jsonb("permissions").default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const itineraryShares = pgTable("itinerary_shares", {
  id: varchar("id").primaryKey().notNull(),
  itineraryId: varchar("itinerary_id").notNull(),
  shareToken: varchar("share_token").notNull().unique(),
  shareType: varchar("share_type").notNull(), // public, private, link
  expiresAt: timestamp("expires_at"),
  accessCount: integer("access_count").default(0),
  isActive: boolean("is_active").default(true),
  createdBy: varchar("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const collaboratorActivities = pgTable("collaborator_activities", {
  id: varchar("id").primaryKey().notNull(),
  itineraryId: varchar("itinerary_id").notNull(),
  userId: varchar("user_id"),
  email: varchar("email"),
  activityType: varchar("activity_type").notNull(), // suggested, commented, added, removed
  activityData: jsonb("activity_data").notNull(),
  targetId: varchar("target_id"), // activity or day ID
  message: text("message"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type ItineraryCollaborator = typeof itineraryCollaborators.$inferSelect;
export type InsertItineraryCollaborator = typeof itineraryCollaborators.$inferInsert;
export type ItineraryShare = typeof itineraryShares.$inferSelect;
export type InsertItineraryShare = typeof itineraryShares.$inferInsert;
export type CollaboratorActivity = typeof collaboratorActivities.$inferSelect;
export type InsertCollaboratorActivity = typeof collaboratorActivities.$inferInsert;

// Destinations table for storing Viator destinations
export const destinations = pgTable("destinations", {
  id: integer("id").primaryKey(), // Use Viator's destination ID
  name: text("name").notNull(),
  country: text("country"),
  region: text("region"),
  coordinates: jsonb("coordinates"), // {lat, lng}
  lastUpdated: timestamp("last_updated").defaultNow().notNull(),
  isActive: boolean("is_active").default(true).notNull(),
}, (table) => {
  return {
    nameIdx: index("destinations_name_idx").on(table.name),
    countryIdx: index("destinations_country_idx").on(table.country),
  };
});

export const insertDestinationSchema = createInsertSchema(destinations).omit({
  lastUpdated: true,
});

export type InsertDestination = z.infer<typeof insertDestinationSchema>;
export type Destination = typeof destinations.$inferSelect;
