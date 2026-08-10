export interface ActivityRecommendation {
  id: string;
  productCode: string;
  title: string;
  description: string;
  price: {
    amount: number;
    currency: string;
  } | null;
  rating: number;
  reviewCount: number;
  imageUrl: string;
  images?: Array<{ url: string; caption?: string; }>;
  duration: string;
  location: string;
  destination?: string;
  bookingUrl: string;
  productUrl?: string;
  tags: string[];
  // Optional legacy fields for compatibility
  activityData?: {
    description?: string;
    inclusions?: string[];
    meetingPoint?: string;
  };
  inclusions?: string[];
  meetingPoint?: string;
}

export interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: string;
  recommendations?: ActivityRecommendation[];
  isLoading?: boolean;
}

export interface TripDay {
  day: number;
  date?: string;
  selectedActivities: ActivityRecommendation[];
  timeSlots?: {
    morning?: ActivityRecommendation[];
    afternoon?: ActivityRecommendation[];
    evening?: ActivityRecommendation[];
  };
}

export interface MultiDayTrip {
  destination: string;
  duration: number;
  startDate?: string;
  currentDay: number;
  days: TripDay[];
  totalEstimatedCost?: {
    amount: number;
    currency: string;
  };
}

export interface ConversationResponse {
  message: Message;
  shouldShowRecommendations: boolean;
  recommendations: ActivityRecommendation[];
  sessionId: string;
  isMultiDayTrip?: boolean;
  multiDayTrip?: MultiDayTrip;
  currentDayRecommendations?: {
    day: number;
    timeSlot?: 'morning' | 'afternoon' | 'evening';
    recommendations: ActivityRecommendation[];
  };
  suggestedCategories?: Array<{
    label: string;
    query: string;
  }>;
  extractedDates?: {
    startDate?: string;
    endDate?: string;
    specificDates?: string[];
    duration?: number;
  };
}
