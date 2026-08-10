import { useState } from 'react';
import { ActivityCard } from './activity-card';
import type { ActivityRecommendation, MultiDayTrip } from '../types/viator';

interface MultiDayTripProps {
  trip: MultiDayTrip;
  currentDayRecommendations: ActivityRecommendation[];
  onActivitySelect: (activity: ActivityRecommendation) => void;
  onNextDay: () => void;
  onSkipDay: () => void;
  onFinishTrip: () => void;
  sessionId?: string;
}

export function MultiDayTripComponent({ 
  trip, 
  currentDayRecommendations, 
  onActivitySelect, 
  onNextDay, 
  onSkipDay, 
  onFinishTrip,
  sessionId 
}: MultiDayTripProps) {
  const currentDay = trip.days.find(d => d.day === trip.currentDay);
  const isLastDay = trip.currentDay === trip.duration;
  const hasSelectedActivities = currentDay && currentDay.selectedActivities.length > 0;

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
      {/* Trip Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          {trip.destination} Trip Planning
        </h2>
        <div className="flex items-center justify-between">
          <div className="text-gray-600">
            Day {trip.currentDay} of {trip.duration}
            {trip.startDate && (
              <span className="ml-2">
                • {new Date(new Date(trip.startDate).getTime() + (trip.currentDay - 1) * 24 * 60 * 60 * 1000).toLocaleDateString()}
              </span>
            )}
          </div>
          <div className="flex space-x-2">
            {[...Array(trip.duration)].map((_, i) => (
              <div
                key={i}
                className={`w-3 h-3 rounded-full ${
                  i + 1 < trip.currentDay ? 'bg-green-500' :
                  i + 1 === trip.currentDay ? 'bg-blue-500' : 'bg-gray-200'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Selected Activities for Current Day */}
      {hasSelectedActivities && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">
            Selected for Day {trip.currentDay}
          </h3>
          <div className="space-y-4">
            {currentDay!.selectedActivities.map((activity, index) => (
              <div key={activity.productCode} className="border-l-4 border-green-500 pl-4">
                <ActivityCard activity={activity} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Current Day Recommendations */}
      {currentDayRecommendations.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">
            Recommended Activities for Day {trip.currentDay}
          </h3>
          <div className="grid gap-6 md:grid-cols-2">
            {currentDayRecommendations.map((activity) => (
              <div key={activity.productCode} className="relative">
                <ActivityCard activity={activity} sessionId={sessionId} />
                <button
                  onClick={() => onActivitySelect(activity)}
                  className="absolute top-4 right-4 bg-blue-600 text-white px-3 py-1 rounded-lg text-sm hover:bg-blue-700 transition-colors"
                >
                  Add to Day {trip.currentDay}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Day Navigation */}
      <div className="flex justify-between items-center pt-6 border-t border-gray-200">
        <button
          onClick={onSkipDay}
          className="text-gray-600 hover:text-gray-800 px-4 py-2 rounded-lg transition-colors"
        >
          Skip Day {trip.currentDay}
        </button>
        
        <div className="flex space-x-3">
          {!isLastDay ? (
            <button
              onClick={onNextDay}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Continue to Day {trip.currentDay + 1}
            </button>
          ) : (
            <button
              onClick={onFinishTrip}
              className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition-colors"
            >
              Complete Trip Planning
            </button>
          )}
        </div>
      </div>
    </div>
  );
}