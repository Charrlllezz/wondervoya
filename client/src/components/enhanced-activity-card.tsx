import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Star, Clock, MapPin, Users, Calendar, DollarSign } from 'lucide-react';
import type { ActivityRecommendation } from '@shared/schema';

interface EnhancedActivityCardProps {
  activity: ActivityRecommendation;
  onAddToItinerary?: (activity: ActivityRecommendation) => void;
  onViewDetails?: (activity: ActivityRecommendation) => void;
  showAvailability?: boolean;
  selectedDate?: string;
}

export function EnhancedActivityCard({ 
  activity, 
  onAddToItinerary, 
  onViewDetails, 
  showAvailability = false,
  selectedDate 
}: EnhancedActivityCardProps) {
  const [availability, setAvailability] = useState<any>(null);
  const [loadingAvailability, setLoadingAvailability] = useState(false);

  // Check real-time availability when requested
  useEffect(() => {
    if (showAvailability && selectedDate && activity.productCode) {
      checkAvailability();
    }
  }, [showAvailability, selectedDate, activity.productCode]);

  const checkAvailability = async () => {
    // Skip availability checks for Google Places venues (direct visit venues)
    if (!selectedDate || !activity.productCode || activity.tags?.includes('google-places')) {
      console.log('🚫 Skipping availability check for direct visit venue or missing data');
      return;
    }
    
    setLoadingAvailability(true);
    try {
      const response = await fetch('/api/activities/availability/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productCode: activity.productCode,
          travelDate: selectedDate,
          currency: 'USD',
          paxMix: [{ ageBand: 'ADULT', count: 2 }]
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        setAvailability(data.availability);
      }
    } catch (error) {
      console.error('Failed to check availability:', error);
    } finally {
      setLoadingAvailability(false);
    }
  };

  const formatPrice = (price: { amount: number; currency: string } | null) => {
    if (!price) return 'Price on request';
    return `${price.currency} ${price.amount.toFixed(2)}`;
  };

  const getActivityTypeLabel = () => {
    // Check if this is a Google Places venue (direct visit)
    if (activity.tags?.includes('google-places')) {
      return 'Direct Visit';
    }
    // Check if this is a Viator tour
    if (activity.productCode) {
      return 'Guided Tour';
    }
    return 'Activity';
  };

  const getActivityTypeBadgeVariant = () => {
    if (activity.tags?.includes('google-places')) {
      return 'secondary';
    }
    return 'default';
  };

  const renderAvailabilityStatus = () => {
    if (loadingAvailability) {
      return <Badge variant="outline">Checking availability...</Badge>;
    }
    
    if (!availability) return null;
    
    const hasAvailability = availability.bookableItems?.length > 0;
    if (hasAvailability) {
      const item = availability.bookableItems[0];
      return (
        <div className="flex items-center gap-2 mt-2">
          <Badge variant="default" className="bg-green-100 text-green-800">
            Available at {item.startTime}
          </Badge>
          <span className="text-sm text-gray-600">
            {formatPrice(item.price)}
          </span>
        </div>
      );
    } else {
      return (
        <Badge variant="destructive" className="mt-2">
          No availability on selected date
        </Badge>
      );
    }
  };

  const renderReviews = () => {
    if (!activity.reviews || activity.reviews.length === 0) return null;
    
    return (
      <div className="mt-3">
        <h4 className="font-medium text-sm mb-2">Recent Reviews</h4>
        <div className="space-y-2">
          {activity.reviews.slice(0, 2).map((review, index) => (
            <div key={review.reviewId || index} className="text-xs bg-gray-50 p-2 rounded">
              <div className="flex items-center gap-1 mb-1">
                <div className="flex">
                  {[...Array(5)].map((_, i) => (
                    <Star 
                      key={i} 
                      className={`w-3 h-3 ${i < review.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`} 
                    />
                  ))}
                </div>
                <span className="font-medium">{review.reviewerName}</span>
                {review.verified && (
                  <Badge variant="outline" className="text-xs px-1 py-0">
                    Verified
                  </Badge>
                )}
              </div>
              <p className="text-gray-700 line-clamp-2">{review.text}</p>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderInclusions = () => {
    if (!activity.inclusions || activity.inclusions.length === 0) return null;
    
    return (
      <div className="mt-3">
        <h4 className="font-medium text-sm mb-2">Included</h4>
        <ul className="text-xs space-y-1">
          {activity.inclusions.slice(0, 3).map((inclusion, index) => (
            <li key={index} className="flex items-center gap-1">
              <div className="w-1 h-1 bg-green-500 rounded-full"></div>
              {inclusion}
            </li>
          ))}
          {activity.inclusions.length > 3 && (
            <li className="text-gray-500">+ {activity.inclusions.length - 3} more</li>
          )}
        </ul>
      </div>
    );
  };

  return (
    <Card className="group hover:shadow-lg transition-all duration-200 cursor-pointer">
      <CardHeader className="pb-3">
        <div className="relative">
          {activity.imageUrl && (
            <img 
              src={activity.imageUrl} 
              alt={activity.title}
              className="w-full h-48 object-cover rounded-lg mb-3"
              loading="lazy"
            />
          )}
          <div className="absolute top-2 right-2">
            <Badge variant="secondary" className="bg-white/90 backdrop-blur-sm">
              {formatPrice(activity.price)}
            </Badge>
          </div>
        </div>
        
        <CardTitle className="text-lg line-clamp-2 group-hover:text-blue-600 transition-colors">
          {activity.title}
        </CardTitle>
        
        <div className="flex items-center gap-4 text-sm text-gray-600">
          {activity.rating > 0 && (
            <div className="flex items-center gap-1">
              <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
              <span className="font-medium">{activity.rating.toFixed(1)}</span>
              <span>({activity.reviewCount})</span>
            </div>
          )}
          {activity.duration && (
            <div className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              <span>{activity.duration}</span>
            </div>
          )}
          {activity.location && (
            <div className="flex items-center gap-1">
              <MapPin className="w-4 h-4" />
              <span>{activity.location}</span>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <p className="text-sm text-gray-700 line-clamp-3 mb-4">
          {activity.description}
        </p>

        {showAvailability && renderAvailabilityStatus()}
        {renderReviews()}
        {renderInclusions()}

        {activity.tags && activity.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {activity.tags.slice(0, 3).map((tag, index) => (
              <Badge key={index} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2 mt-4">
          {/* Activity type indicator */}
          <div className="flex items-center justify-between">
            <Badge 
              variant={getActivityTypeBadgeVariant() as "default" | "secondary"} 
              className="text-xs"
            >
              {getActivityTypeLabel()}
            </Badge>
            {activity.tags?.includes('google-places') && (
              <span className="text-xs text-gray-500">Check venue website for hours</span>
            )}
          </div>
          
          <div className="flex gap-2">
            {onViewDetails && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => onViewDetails(activity)}
                className="flex-1"
              >
                View Details
              </Button>
            )}
            {onAddToItinerary && (
              <Button 
                size="sm" 
                onClick={() => onAddToItinerary(activity)}
                className="flex-1"
              >
                Add to Trip
            </Button>
          )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}