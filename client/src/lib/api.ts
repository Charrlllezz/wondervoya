import { apiRequest } from './queryClient';
import type { Message, ConversationResponse, ActivityRecommendation } from '../types/viator';

export async function initializeConversation(): Promise<{ sessionId: string }> {
  const response = await apiRequest('/api/conversation/init', {
    method: 'POST'
  });
  return await response.json();
}

export async function sendMessage(message: string, sessionId?: string, explicitDestination?: string): Promise<ConversationResponse> {
  const response = await apiRequest('/api/conversation/message', {
    method: 'POST',
    body: JSON.stringify({
      message,
      sessionId,
      explicitDestination,
    }),
  });
  return await response.json();
}

export async function getConversation(sessionId: string): Promise<{
  messages: Message[];
  preferences: any;
  recommendations: ActivityRecommendation[];
}> {
  const response = await apiRequest(`/api/conversation/${sessionId}`, {
    method: 'GET'
  });
  return await response.json();
}

export async function searchActivities(query: string, currency = 'USD'): Promise<{
  activities: ActivityRecommendation[];
}> {
  const response = await apiRequest('/api/activities/search', {
    method: 'POST',
    body: JSON.stringify({
      query,
      currency,
    }),
  });
  return await response.json();
}

export async function getActivityPricing(productCode: string, startDate?: string, endDate?: string): Promise<{
  productCode: string;
  pricing: any;
  success: boolean;
}> {
  const params = new URLSearchParams();
  if (startDate) params.append('startDate', startDate);
  if (endDate) params.append('endDate', endDate);

  const response = await apiRequest(`/api/activities/${productCode}/pricing?${params.toString()}`, {
    method: 'GET'
  });
  return await response.json();
}

// Itinerary API functions
export async function createItinerary(data: { title: string; destination: string; startDate?: string;
  endDate?: string;
  sessionId?: string }) {
  return apiRequest('/api/itineraries', {
    method: 'POST',
    body: JSON.stringify({
      ...data,
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      groupSize: 2,
      travelStyle: 'balanced' as const,
    }),
  });
}

export async function getItineraries() {
  const response = await apiRequest('/api/itineraries', {
    method: 'GET'
  });
  return await response.json();
}

export async function deleteItinerary(itineraryId: string) {
  const response = await apiRequest(`/api/itineraries/${itineraryId}`, {
    method: 'DELETE'
  });
  return await response.json();
}

export async function addActivityToItinerary(itineraryId: string, activity: any, notes?: string, scheduledDate?: string, scheduledTime?: string) {
  // Ensure price is properly formatted for compatibility
  const processedActivity = {
    ...activity,
    price: activity.price || { amount: 0, currency: 'USD' }
  };

  const response = await apiRequest(`/api/itineraries/${itineraryId}/activities`, {
    method: 'POST',
    body: JSON.stringify({
      activityData: processedActivity,
      notes,
      scheduledDate,
      scheduledTime,
    }),
  });
  return await response.json();
}