import { useParams } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Link } from 'wouter';
import {
  ArrowLeft, MapPin, Clock, Calendar, DollarSign, 
  Users, Activity, Eye
} from 'lucide-react';
import type { TripItinerary } from '@shared/schema';

export default function SharedItinerary() {
  const { shareToken } = useParams<{ shareToken: string }>();
  
  const { data: itinerary, isLoading, error } = useQuery<TripItinerary>({
    queryKey: ['/api/shared', shareToken],
    enabled: !!shareToken,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading shared itinerary...</p>
        </div>
      </div>
    );
  }

  if (error || !itinerary) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md mx-auto text-center p-6">
          <div className="bg-white rounded-lg shadow-sm p-8">
            <Eye className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Itinerary Not Found</h1>
            <p className="text-gray-600 mb-8">
              This shared itinerary may have expired or been removed.
            </p>
            <Link to="/">
              <Button>Explore Travel Planning</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'TBD';
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
  };

  const getTotalCost = () => {
    return itinerary.activities?.reduce((total, activity) => {
      return total + (activity.activityData?.price?.amount || 0);
    }, 0) || 0;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto p-6">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
            <Eye className="h-4 w-4" />
            <span>Shared Itinerary</span>
          </div>
          
          <h1 className="text-3xl font-bold text-gray-900 mb-4">{itinerary.title}</h1>
          
          <div className="flex flex-wrap items-center gap-6 text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <span>{formatDate(itinerary.startDate)} - {formatDate(itinerary.endDate)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              <span>{itinerary.activities?.length || 0} activities</span>
            </div>
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              <span>${getTotalCost().toFixed(2)} total</span>
            </div>
            {itinerary.groupSize && (
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                <span>{itinerary.groupSize} travelers</span>
              </div>
            )}
          </div>
          
          <div className="mt-6 flex gap-3">
            <Link to="/">
              <Button variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Plan Your Own Trip
              </Button>
            </Link>
            <Button onClick={() => window.print()}>
              Save as PDF
            </Button>
          </div>
        </div>

        {/* Itinerary Timeline */}
        <div className="space-y-6">
          {itinerary.days?.map((day, dayIndex) => (
            <div key={day.id} className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">
                Day {day.dayNumber} - {formatDate(day.date)}
              </h3>
              
              <div className="space-y-4">
                {day.timeSlots?.map((timeSlot, slotIndex) => (
                  timeSlot.activity && (
                    <div key={timeSlot.id} className="flex gap-4 p-4 bg-gray-50 rounded-lg">
                      <div className="flex-shrink-0 w-16 text-center">
                        <div className="text-sm font-medium text-gray-900">
                          {timeSlot.startTime?.substring(0, 5)}
                        </div>
                        <div className="text-xs text-gray-500">
                          {timeSlot.endTime?.substring(0, 5)}
                        </div>
                      </div>
                      
                      <div className="flex-1">
                        <div className="flex items-start justify-between">
                          <div>
                            <h4 className="font-medium text-gray-900 mb-1">
                              {timeSlot.activity.title}
                            </h4>
                            <p className="text-sm text-gray-600 mb-2 line-clamp-2">
                              {timeSlot.activity.description}
                            </p>
                            
                            <div className="flex items-center gap-4 text-sm text-gray-500">
                              {timeSlot.activity.location && (
                                <div className="flex items-center gap-1">
                                  <MapPin className="h-3 w-3" />
                                  <span>{timeSlot.activity.location}</span>
                                </div>
                              )}
                              {timeSlot.activity.duration && (
                                <div className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  <span>{timeSlot.activity.duration}</span>
                                </div>
                              )}
                              {timeSlot.activity.price && (
                                <div className="flex items-center gap-1">
                                  <DollarSign className="h-3 w-3" />
                                  <span>${timeSlot.activity.price.amount}</span>
                                </div>
                              )}
                            </div>
                          </div>
                          
                          {timeSlot.activity.imageUrl && (
                            <img 
                              src={timeSlot.activity.imageUrl} 
                              alt={timeSlot.activity.title}
                              className="w-16 h-16 object-cover rounded-lg ml-4"
                            />
                          )}
                        </div>
                        
                        {timeSlot.notes && (
                          <div className="mt-2 text-sm text-gray-600 bg-blue-50 p-2 rounded">
                            <strong>Note:</strong> {timeSlot.notes}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                ))}
                
                {(!day.timeSlots || day.timeSlots.length === 0) && (
                  <div className="text-center py-8 text-gray-500">
                    No activities scheduled for this day
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Unscheduled Activities */}
        {itinerary.activities && itinerary.activities.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm p-6 mt-6">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">
              Additional Activities to Consider
            </h3>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {itinerary.activities.map((activity) => (
                <div key={activity.id} className="p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-medium text-gray-900 mb-2">
                    {activity.activityData.title}
                  </h4>
                  <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                    {activity.activityData.description}
                  </p>
                  
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-4 text-gray-500">
                      {activity.activityData.duration && (
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          <span>{activity.activityData.duration}</span>
                        </div>
                      )}
                      {activity.activityData.price && (
                        <div className="flex items-center gap-1">
                          <DollarSign className="h-3 w-3" />
                          <span>${activity.activityData.price.amount}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-12 py-8 border-t border-gray-200">
          <p className="text-gray-500 mb-4">
            Want to create your own travel itinerary?
          </p>
          <Link to="/">
            <Button size="lg">
              Start Planning Your Trip
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}