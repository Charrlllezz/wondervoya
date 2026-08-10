import { useState, useEffect } from 'react';
import { X, MapPin, Clock, Star, Calendar, User, ChevronRight } from 'lucide-react';
import { Button } from './ui/button';
import { ActivityCard } from './activity-card';
import type { ActivityRecommendation } from '../types/viator';
import { navigateWithRouterAndVideoState } from '../lib/navigation';

interface ActivityPanelProps {
  isOpen: boolean;
  onClose: () => void;
  activities: ActivityRecommendation[];
  onActivityInteraction: (activity: ActivityRecommendation, action: string) => void;
  isLoading: boolean;
  destination?: string;
  extractedDates?: {
    startDate?: string;
    endDate?: string;
    specificDates?: string[];
    duration?: number;
  };
  setLocation?: (path: string) => void;
}

export const ActivityPanel = ({
  isOpen,
  onClose,
  activities,
  onActivityInteraction,
  isLoading,
  destination,
  extractedDates,
  setLocation
}: ActivityPanelProps) => {
  const [selectedActivity, setSelectedActivity] = useState<ActivityRecommendation | null>(null);

  const handleActivityClick = (activity: ActivityRecommendation) => {
    setSelectedActivity(activity);
    onActivityInteraction(activity, 'expand');
  };

  const handleSaveActivity = (activity: ActivityRecommendation) => {
    onActivityInteraction(activity, 'save');
  };

  const handleBookActivity = (activity: ActivityRecommendation) => {
    onActivityInteraction(activity, 'book');
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  // Debug logging (development only)
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('🎯 ActivityPanel received activities:', activities.length);
    }
  }, [activities]);

  return (
    <div className={`fixed right-0 w-[45vw] z-30 transform transition-transform duration-300 ${
      isOpen ? 'translate-x-0' : 'translate-x-full'
    }`} style={{ top: '6rem', height: 'calc(100vh - 6rem)' }}>
      <div className="h-full bg-transparent backdrop-blur-none border-l border-transparent shadow-none">
        <div className="flex flex-col h-full min-h-0">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-white/10">
            <div className="flex items-center space-x-3">
              <div className="w-6 h-6 bg-teal-500 rounded-full flex items-center justify-center">
                <MapPin className="w-3 h-3 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">
                  Activities
                </h2>
                {destination && destination !== 'My Trip' && (
                  <p className="text-xs text-gray-400">
                    {destination}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                size="sm"
                onClick={() => {
                  console.log('🎬🎬🎬 ACTIVITY PANEL BUTTON CLICKED: View Your Trip button clicked! 🎬🎬🎬');
                  if (setLocation) {
                    console.log('🎬 ActivityPanel: Using proper navigation function');
                    navigateWithRouterAndVideoState('chat', setLocation, '/itineraries');
                  } else {
                    console.log('🎬 ActivityPanel: Fallback to window.location.href');
                    window.location.href = '/itineraries';
                  }
                }}
                className="bg-teal-500 hover:bg-teal-600 text-white text-xs px-3 py-1 h-7"
              >
                View Your Trip
              </Button>
              <button
                onClick={onClose}
                className="p-1 hover:bg-white/10 rounded transition-colors"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
          </div>

          {/* Activities Grid */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden p-4" style={{ maxHeight: 'calc(100vh - 12rem)' }}>
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="relative mb-6">
                  {/* Loading compass animation */}
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
                <div className="text-center">
                  <h3 className="text-lg font-semibold text-white mb-2">
                    Finding Amazing Activities
                  </h3>
                  <p className="text-gray-400 text-sm">
                    Discovering the best experiences for your journey...
                  </p>
                </div>
              </div>
            ) : activities.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="relative mb-6">
                  {/* Exact same compass from homepage */}
                  <div className="relative w-16 h-16 mx-auto">
                    <svg
                      className="w-16 h-16 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                      style={{
                        filter: 'drop-shadow(0 0 8px rgba(255,255,255,0.4))'
                      }}
                    >
                      {/* Outer circle */}
                      <circle cx="12" cy="12" r="11" stroke="currentColor" strokeWidth="0.5" opacity="0.4"/>

                      {/* Cardinal direction marks */}
                      <path stroke="currentColor" strokeWidth="1" strokeLinecap="round" d="M12 1L12 3" opacity="0.6"/>
                      <path stroke="currentColor" strokeWidth="1" strokeLinecap="round" d="M12 21L12 23" opacity="0.6"/>
                      <path stroke="currentColor" strokeWidth="1" strokeLinecap="round" d="M1 12L3 12" opacity="0.6"/>
                      <path stroke="currentColor" strokeWidth="1" strokeLinecap="round" d="M21 12L23 12" opacity="0.6"/>

                      {/* Center dot */}
                      <circle cx="12" cy="12" r="1" fill="currentColor"/>

                      {/* Spinning needle */}
                      <g style={{
                        animation: 'spin 1.5s linear infinite',
                        transformOrigin: '12px 12px'
                      }}>
                        <path 
                          fill="currentColor" 
                          d="M12 4L13 11L12 12L11 11Z"
                          opacity="0.9"
                        />
                        <path 
                          fill="currentColor" 
                          d="M12 20L11 13L12 12L13 13Z" 
                          opacity="0.5"
                        />
                      </g>
                    </svg>
                  </div>
                </div>
                <div className="text-center">
                  <h3 className="text-lg font-semibold text-white mb-2">
                    {isLoading ? 'Finding Amazing Activities' : 'Ready to explore'}
                  </h3>
                  <p className="text-gray-400 text-sm">
                    {isLoading ? 'Discovering the best experiences for your journey...' : 'Start planning your next adventure...'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 overflow-visible" style={{ minHeight: 'fit-content' }}>
                {activities
                  .slice(0, 12) // Show up to 12 activities to achieve 8-10+ target
                  .map((activity, index) => {
                    console.log(`🎯 Rendering activity ${index + 1}/${activities.length}:`, activity.title);
                    return (
                      <ActivityCard
                        key={`activity-${activity.productCode}-${index}`}
                        activity={activity}
                        onSaveToItinerary={handleSaveActivity}
                        onExpandActivity={handleActivityClick}
                        onBookActivity={handleBookActivity}
                        showBookingButton={true}
                        compact={true}
                      />
                    );
                  })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ActivityPanel;