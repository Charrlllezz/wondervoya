import React, { memo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Star, MapPin, Clock, Users, DollarSign } from 'lucide-react';
import type { ActivityRecommendation } from '@shared/schema';

interface OptimizedActivityCardProps {
  activity: ActivityRecommendation;
  onSave?: (activity: ActivityRecommendation) => void;
  onViewDetails?: (activity: ActivityRecommendation) => void;
  isLoading?: boolean;
}

// Memoized activity card to prevent unnecessary re-renders
export const OptimizedActivityCard = memo<OptimizedActivityCardProps>(({
  activity,
  onSave,
  onViewDetails,
  isLoading = false
}) => {
  const formatPrice = (price: { amount: number; currency: string } | null) => {
    if (!price) return 'Price varies';
    return `${price.currency} ${price.amount.toFixed(2)}`;
  };

  const formatRating = (rating: number) => {
    return rating.toFixed(1);
  };

  return (
    <Card className="w-full max-w-md hover:shadow-lg transition-shadow duration-200">
      <div className="relative">
        {activity.imageUrl && (
          <img
            src={activity.imageUrl}
            alt={activity.title}
            className="w-full h-48 object-cover rounded-t-lg"
            loading="lazy"
          />
        )}
        {activity.rating > 0 && (
          <div className="absolute top-2 right-2 bg-white rounded-full px-2 py-1 flex items-center shadow-md">
            <Star className="h-4 w-4 text-yellow-400 fill-current" />
            <span className="ml-1 text-sm font-medium">{formatRating(activity.rating)}</span>
          </div>
        )}
      </div>
      
      <CardContent className="p-4">
        <div className="space-y-3">
          <div>
            <h3 className="font-semibold text-lg line-clamp-2">{activity.title}</h3>
            <p className="text-gray-600 text-sm line-clamp-3 mt-1">{activity.description}</p>
          </div>

          <div className="flex items-center gap-4 text-sm text-gray-500">
            {activity.location && (
              <div className="flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                <span className="truncate max-w-32">{activity.location}</span>
              </div>
            )}
            
            {activity.duration && (
              <div className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                <span>{activity.duration}</span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <DollarSign className="h-4 w-4 text-green-600" />
              <span className="font-medium text-green-600">
                {formatPrice(activity.price)}
              </span>
            </div>
            
            {activity.reviewCount > 0 && (
              <span className="text-sm text-gray-500">
                ({activity.reviewCount} reviews)
              </span>
            )}
          </div>

          {activity.inclusions && activity.inclusions.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {activity.inclusions.slice(0, 3).map((inclusion: string, index: number) => (
                <Badge key={index} variant="secondary" className="text-xs">
                  {inclusion}
                </Badge>
              ))}
              {activity.inclusions.length > 3 && (
                <Badge variant="outline" className="text-xs">
                  +{activity.inclusions.length - 3} more
                </Badge>
              )}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            {onViewDetails && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onViewDetails(activity)}
                className="flex-1"
                disabled={isLoading}
              >
                View Details
              </Button>
            )}
            
            {onSave && (
              <Button
                size="sm"
                onClick={() => onSave(activity)}
                className="flex-1"
                disabled={isLoading}
              >
                {isLoading ? 'Saving...' : 'Save Activity'}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for better performance
  return (
    prevProps.activity.productCode === nextProps.activity.productCode &&
    prevProps.isLoading === nextProps.isLoading
  );
});

OptimizedActivityCard.displayName = 'OptimizedActivityCard';