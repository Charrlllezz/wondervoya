import { useState } from 'react';
import type { ActivityRecommendation } from '@/types/viator';
import { ItineraryManager } from './itinerary-manager';

interface ActivityComparisonProps {
  activities: ActivityRecommendation[];
  isOpen: boolean;
  onClose: () => void;
  onSelect?: (activity: ActivityRecommendation) => void;
}

export function ActivityComparison({ activities, isOpen, onClose, onSelect }: ActivityComparisonProps) {
  const [selectedForComparison, setSelectedForComparison] = useState<ActivityRecommendation | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<ActivityRecommendation | null>(null);
  const [showItineraryManager, setShowItineraryManager] = useState(false);

  if (!isOpen) return null;

  const formatPrice = (price: { amount: number; currency: string } | null) => {
    if (!price) return 'Contact for pricing';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: price.currency,
    }).format(price.amount);
  };

  const renderStars = (rating: number) => {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);

    return (
      <div className="flex items-center">
        {[...Array(fullStars)].map((_, i) => (
          <i key={i} className="fas fa-star text-yellow-500 text-sm"></i>
        ))}
        {hasHalfStar && <i className="fas fa-star-half-alt text-yellow-500 text-sm"></i>}
        {[...Array(emptyStars)].map((_, i) => (
          <i key={i} className="far fa-star text-gray-300 text-sm"></i>
        ))}
      </div>
    );
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Compare Activities</h2>
            <p className="text-gray-600 mt-1">Compare features, prices, and reviews to make the best choice</p>
          </div>
          <button
            onClick={onClose}
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 hover:text-gray-900 rounded-full p-2 transition-colors flex items-center justify-center w-10 h-10"
            aria-label="Close comparison"
          >
            <i className="fas fa-times text-lg"></i>
          </button>
        </div>

        {/* Comparison Content */}
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {activities.map((activity, index) => (
              <div 
                key={activity.productCode} 
                className={`border rounded-xl p-6 transition-all ${
                  selectedForComparison?.productCode === activity.productCode 
                    ? 'border-blue-500 bg-blue-50' 
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                {/* Activity Image */}
                <div className="relative mb-4">
                  <img
                    src={activity.imageUrl}
                    alt={activity.title}
                    className="w-full h-48 object-cover rounded-lg"
                  />
                  {index === 0 && (
                    <div className="absolute top-2 left-2 bg-green-500 text-white px-2 py-1 rounded-md text-xs font-medium">
                      Most Popular
                    </div>
                  )}
                </div>

                {/* Activity Details */}
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 line-clamp-2">{activity.title}</h3>
                    <p className="text-gray-600 text-sm mt-2">{activity.description}</p>
                  </div>

                  {/* Price */}
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {formatPrice(activity.price)}
                    </div>
                    <div className="text-xs text-gray-500">per person</div>
                  </div>

                  {/* Key Features */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Duration:</span>
                      <span className="font-medium">{activity.duration}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Location:</span>
                      <span className="font-medium text-right text-xs">{activity.location}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Rating:</span>
                      <div className="flex items-center space-x-1">
                        {renderStars(activity.rating)}
                        <span className="text-xs text-gray-500 ml-1">({activity.reviewCount})</span>
                      </div>
                    </div>
                  </div>

                  {/* Tags */}
                  {activity.tags && activity.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {activity.tags.slice(0, 3).map((tag, tagIndex) => (
                        <span 
                          key={tagIndex}
                          className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs"
                        >
                          {tag}
                        </span>
                      ))}
                      {activity.tags.length > 3 && (
                        <span className="text-gray-500 text-xs">+{activity.tags.length - 3} more</span>
                      )}
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="space-y-2 pt-2">
                    <button
                      onClick={() => {
                        setSelectedActivity(activity);
                        setShowItineraryManager(true);
                      }}
                      className="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 transition-colors text-sm font-medium"
                    >
                      Save to Trip
                    </button>
                    
                    <a
                      href={activity.bookingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-full bg-gray-100 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-200 transition-colors text-sm font-medium text-center"
                    >
                      View on Viator
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Comparison Summary */}
          {selectedForComparison && (
            <div className="mt-8 bg-blue-50 border border-blue-200 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-blue-900 mb-3">Why Choose "{selectedForComparison.title}"?</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div className="flex items-center">
                  <i className="fas fa-star text-blue-600 mr-2"></i>
                  <span>
                    <strong>{selectedForComparison.rating}/5</strong> rating with {selectedForComparison.reviewCount} reviews
                  </span>
                </div>
                <div className="flex items-center">
                  <i className="fas fa-clock text-blue-600 mr-2"></i>
                  <span><strong>{selectedForComparison.duration}</strong> duration</span>
                </div>
                <div className="flex items-center">
                  <i className="fas fa-dollar-sign text-blue-600 mr-2"></i>
                  <span><strong>{formatPrice(selectedForComparison.price)}</strong> per person</span>
                </div>
              </div>
              
              {onSelect && (
                <button
                  onClick={() => {
                    onSelect(selectedForComparison);
                    onClose();
                  }}
                  className="mt-4 bg-blue-600 text-white py-2 px-6 rounded-md hover:bg-blue-700 transition-colors font-medium"
                >
                  Add "{selectedForComparison.title}" to Itinerary
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Itinerary Manager Modal */}
      <ItineraryManager
        activity={selectedActivity || undefined}
        isOpen={showItineraryManager}
        onClose={() => {
          setShowItineraryManager(false);
          setSelectedActivity(null);
        }}
        onSave={() => {
          setShowItineraryManager(false);
          setSelectedActivity(null);
        }}
      />
    </div>
  );
}