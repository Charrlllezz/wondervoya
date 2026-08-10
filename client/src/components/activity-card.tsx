import { useState, useRef, memo } from 'react';
import { ActivityDetailModal } from './activity-detail-modal';
import { ItineraryManager } from './itinerary-manager';
import { UnifiedShare } from './unified-share';
import { useToast } from '@/hooks/use-toast';

import type { ActivityRecommendation } from '../types/viator';

interface ActivityCardProps {
  activity: ActivityRecommendation;
  extractedDates?: {
    startDate?: string;
    endDate?: string;
    specificDates?: string[];
    duration?: number;
  } | null;
  conversationMessages?: Array<{ role: string; content: string; }>;
  sessionId?: string;
  compact?: boolean;
  onSaveToItinerary?: (activity: ActivityRecommendation) => void;
  onBookActivity?: (activity: ActivityRecommendation) => void;
  onExpandActivity?: (activity: ActivityRecommendation) => void;
  showBookingButton?: boolean;
}

const ActivityCard = memo(function ActivityCard({ 
  activity, 
  extractedDates, 
  conversationMessages, 
  sessionId, 
  compact = false,
  onSaveToItinerary,
  onBookActivity,
  onExpandActivity,
  showBookingButton = false
}: ActivityCardProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isItineraryModalOpen, setIsItineraryModalOpen] = useState(false);
  const [modalPosition, setModalPosition] = useState<{ top: number; left: number } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const { toast } = useToast();
  const cardRef = useRef<HTMLDivElement>(null);

  const formatPrice = (price: { amount: number; currency: string } | null) => {
    if (!price || !price.amount || !price.currency) return 'View details for pricing';
    
    // Validate currency code
    const validCurrency = price.currency && typeof price.currency === 'string' && price.currency.length === 3 
      ? price.currency.toUpperCase() 
      : 'USD'; // Default fallback
    
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: validCurrency,
      }).format(price.amount);
    } catch (error) {
      // Fallback if currency formatting fails
      return `${validCurrency} ${price.amount}`;
    }
  };

  const handleSaveToItinerary = () => {
    if (onSaveToItinerary) {
      onSaveToItinerary(activity);
      return;
    }

    // Open the itinerary modal directly (same as card click behavior)
    setIsItineraryModalOpen(true);
  };

  const handleBookActivity = () => {
    console.log('🔗 Activity card book clicked:', activity.title);
    console.log('🔗 onBookActivity callback exists:', !!onBookActivity);

    if (onBookActivity) {
      console.log('🔗 Using callback function');
      onBookActivity(activity);
      return;
    }

    console.log('🔗 Using fallback - direct booking');
    // Fallback: direct booking behavior
    const bookingUrl = activity.bookingUrl || 
      `https://www.viator.com/tours/${activity.id}`;
    window.open(bookingUrl, '_blank');
  };

  const handleExpandActivity = () => {
    if (onExpandActivity) {
      onExpandActivity(activity);
      return;
    }

    // Default expand behavior
    setIsModalOpen(true);
  };



  const handleActivitySaved = () => {
    // Removed automatic scroll-back for smoother UX
    // User can naturally continue browsing without jarring scroll interruptions
  };

  const renderStars = (rating: number) => {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    const stars = [];

    for (let i = 0; i < fullStars; i++) {
      stars.push(<i key={i} className="fas fa-star text-sm"></i>);
    }

    if (hasHalfStar) {
      stars.push(<i key="half" className="fas fa-star-half-alt text-sm"></i>);
    }

    const emptyStars = 5 - Math.ceil(rating);
    for (let i = 0; i < emptyStars; i++) {
      stars.push(<i key={`empty-${i}`} className="far fa-star text-sm"></i>);
    }

    return stars;
  };

  const handleCardClick = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsModalOpen(true);
  };

  // Debug logging for development
  if (process.env.NODE_ENV === 'development') {
    console.log('🎯 ActivityCard rendering:', activity.title, 'compact:', compact);
  }

  // Compact version for side panel
  if (compact) {
    return (
      <>
        <div 
          ref={cardRef}
          className="relative rounded-lg shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer group overflow-hidden"
          onClick={handleExpandActivity}
          style={{
            backgroundColor: 'transparent',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
          }}
        >
          {/* Compact Image Container */}
          <div className="relative h-36 overflow-hidden bg-black/10">
            <img 
              src={activity.imageUrl || (activity.images && activity.images.length > 0 ? activity.images[0].url : 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=600&q=80')} 
              alt={activity.title}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.src = 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=600&q=80';
              }}
            />

            {/* Rating Badge */}
            {activity.rating && (
              <div className="absolute top-2 right-2 bg-white/90 px-1.5 py-0.5 rounded-full shadow-sm">
                <div className="flex items-center space-x-1">
                  <i className="fas fa-star text-yellow-400 text-xs"></i>
                  <span className="text-xs font-medium text-gray-800">{activity.rating.toFixed(1)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Compact Content */}
          <div className="p-3">
            {/* Title */}
            <h3 className="text-sm font-semibold text-white line-clamp-2 mb-2" style={{fontFamily: 'Inter, sans-serif'}}>
              {activity.title}
            </h3>

            {/* Location */}
            <div className="flex items-center text-gray-300 mb-2">
              <i className="fas fa-map-marker-alt text-xs mr-1" style={{color: '#14B8A6'}}></i>
              <span className="text-xs truncate" style={{fontFamily: 'Inter, sans-serif'}}>
                {activity.location === 'Unknown Location' || activity.location === 'Destination' ? 
                  (activity.destination || 'Travel Destination') : 
                  (activity.location || activity.destination || 'Travel Destination')
                }
              </span>
            </div>

            {/* Price */}
            {activity.price && (
              <div className="mb-3">
                <div className="text-sm font-bold tabular-nums" style={{color: '#14B8A6', fontFamily: 'Inter, sans-serif', letterSpacing: '0.025em'}}>
                  {formatPrice(activity.price)}
                </div>
              </div>
            )}

            {/* Compact Action Buttons */}
            <div className="grid grid-cols-2 gap-2 w-full">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSaveToItinerary();
                }}
                className="inline-flex items-center justify-center px-2 py-1.5 text-xs font-medium rounded-md transition-all duration-200 hover:shadow-md z-10 relative"
                style={{backgroundColor: '#1E3A8A', color: '#F8FAFC', pointerEvents: 'auto'}}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#1E40AF';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#1E3A8A';
                }}
              >
                <i className="fas fa-bookmark mr-1 text-xs"></i>
                Save
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleBookActivity();
                }}
                className="inline-flex items-center justify-center px-2 py-1.5 text-xs font-medium rounded-md transition-all duration-200 hover:shadow-md"
                style={{backgroundColor: '#14B8A6', color: '#F8FAFC'}}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#0D9488';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#14B8A6';
                }}
              >
                <i className="fas fa-external-link-alt mr-1 text-xs"></i>
                Book
              </button>
            </div>
          </div>
        </div>

        <ActivityDetailModal
          activity={activity}
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
        />
      </>
    );
  }

  return (
    <>
      <div 
      className={`premium-card cursor-pointer transition-all duration-300 hover:shadow-xl transform hover:scale-102 border ${
        compact ? 'h-auto' : 'h-auto'
      } overflow-hidden`}
      style={{
        backgroundColor: 'transparent',
        borderColor: 'rgba(255, 255, 255, 0.1)',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1)',
        backdropFilter: 'none'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--aurora-teal)';
        e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.2)';
        e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.1)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
        e.currentTarget.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.1)';
        e.currentTarget.style.backgroundColor = 'transparent';
      }}
    >
        {/* Image Section */}
        <div className="relative overflow-hidden">
          <img 
            src={activity.imageUrl || (activity.images && activity.images.length > 0 ? activity.images[0].url : 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=600&q=80')} 
            alt={activity.title}
            className="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-500"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.src = 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=600&q=80';
            }}
          />

          {/* Floating rating badge */}
          <div className="absolute top-3 right-3 px-2 py-1 rounded-md text-xs font-medium text-white shadow-lg" style={{backgroundColor: '#1E3A8A'}}>
            ★ {activity.rating.toFixed(1)}
          </div>
        </div>

        {/* Content Section */}
        <div className="p-5">
          {/* Title */}
          <h3 className="text-lg font-semibold mb-3 line-clamp-2 leading-tight" style={{color: '#14B8A6', fontFamily: 'Inter, sans-serif'}}>
            {activity.title}
          </h3>

          {/* Description - Most Important - Full Details */}
          <p className="text-sm mb-4 line-clamp-4 leading-relaxed" style={{color: '#CCCCCC'}}>
            {activity.description || activity.activityData?.description || 'Discover this amazing activity and explore all it has to offer during your trip.'}
          </p>

          {/* Additional Details */}
          {(activity.inclusions || activity.activityData?.inclusions) && (
            <div className="mb-3">
              <h4 className="text-xs font-semibold mb-1" style={{color: '#14B8A6'}}>Includes:</h4>
              <p className="text-xs text-gray-300 line-clamp-2">
                {(activity.inclusions || activity.activityData?.inclusions)?.slice(0, 2).join(', ')}
              </p>
            </div>
          )}

          {/* Meeting Point */}
          {(activity.meetingPoint || activity.activityData?.meetingPoint) && (
            <div className="mb-3">
              <h4 className="text-xs font-semibold mb-1" style={{color: '#14B8A6'}}>Meeting Point:</h4>
              <p className="text-xs text-gray-300 line-clamp-1">
                {activity.meetingPoint || activity.activityData?.meetingPoint}
              </p>
            </div>
          )}

          {/* Meta Information Row */}
          <div className="space-y-2 mb-4 text-xs" style={{color: '#AAAAAA'}}>
            <div className="flex items-center justify-between">
              {/* Star Rating */}
              <div className="flex items-center space-x-1">
                <div className="flex items-center" style={{color: '#14B8A6'}}>
                  {renderStars(activity.rating)}
                </div>
                <span className="ml-1">({activity.reviewCount} reviews)</span>
              </div>
            </div>

            {/* Duration */}
            <div className="flex items-center space-x-1">
              <span className="font-medium" style={{color: '#14B8A6'}}>Duration:</span>
              <span>
                {typeof activity.duration === 'string' 
                  ? activity.duration
                  : 'Flexible'
                }
              </span>
            </div>
          </div>

          {/* Price and Actions Row */}
          <div className="pt-3 border-t" style={{borderColor: '#444444'}}>
            {/* Price */}
            {activity.price && (
              <div className="mb-3">
                <div className="text-xl font-bold tracking-wide" style={{color: '#14B8A6', fontFamily: 'Inter, sans-serif', letterSpacing: '0.025em'}}>
                  {formatPrice(activity.price)}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-2 w-full">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSaveToItinerary();
                }}
                className="inline-flex items-center justify-center px-2 py-2 text-xs font-medium rounded-md transition-all duration-200 hover:shadow-md z-10 relative"
                style={{backgroundColor: '#1E3A8A', color: '#F8FAFC', pointerEvents: 'auto'}}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#1E40AF';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#1E3A8A';
                }}
              >
                <i className="fas fa-bookmark mr-1 text-xs"></i>
                Save
              </button>

              <a
                href={activity.bookingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center px-2 py-2 text-xs font-medium rounded-md transition-all duration-200 hover:shadow-md"
                onClick={(e) => e.stopPropagation()}
                style={{backgroundColor: '#14B8A6', color: '#F8FAFC'}}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#0D9488';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#14B8A6';
                }}
              >
                <i className="fas fa-external-link-alt mr-1 text-xs"></i>
                Book
              </a>
            </div>
          </div>
        </div>

        {/* Centered hint text at 1/3 height */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-30">
          <span className="text-sm font-semibold bg-white/95 px-4 py-2 rounded-lg shadow-xl border backdrop-blur-sm" style={{
            color: '#1E3A8A',
            borderColor: '#E5E7EB',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)'
          }}>
            Click for Details
          </span>
        </div>
      </div>


      <ActivityDetailModal
        activity={activity}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />

      <ItineraryManager
        activity={activity}
        isOpen={isItineraryModalOpen}
        onClose={() => setIsItineraryModalOpen(false)}
        sessionId={sessionId}
        onSave={() => {
          setIsItineraryModalOpen(false);
          toast({
            title: "Activity Saved!",
            description: "The activity has been added to your itinerary.",
            action: (
              <button 
                onClick={() => window.open('/itineraries', '_blank')} 
                className="text-sm text-white px-3 py-1 rounded transition-colors"
                style={{backgroundColor: '#722F37'}}
              >
                View Itinerary
              </button>
            ),
          });
          handleActivitySaved();
        }}
      />
    </>
  );
});

export { ActivityCard };