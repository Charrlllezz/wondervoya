import { useState, useEffect } from 'react';
import { ItineraryManager } from './itinerary-manager';
import { TripDateScheduler } from './trip-date-scheduler';
import { useToast } from '@/hooks/use-toast';
import type { SavedActivity, ActivityRecommendation } from '@shared/schema';

interface ActivityDetailModalProps {
  activity: SavedActivity | ActivityRecommendation;
  isOpen: boolean;
  onClose: () => void;
  fromItinerary?: boolean;
  itineraryId?: string;
  maxDays?: number;
  startDate?: string;
  endDate?: string;
  onSchedule?: (date: string, time: string) => void;
  sessionId?: string;
}

interface DetailedActivity extends SavedActivity {
  fullDescription?: string;
  inclusions?: string[];
  exclusions?: string[];
  meetingPoint?: string;
  cancellationPolicy?: string;
  additionalImages?: string[];
  itinerary?: Array<{
    title: string;
    description: string;
  }>;
}

export function ActivityDetailModal({ activity, isOpen, onClose, fromItinerary, itineraryId, maxDays, startDate, endDate, onSchedule, sessionId }: ActivityDetailModalProps) {
  const [detailedActivity, setDetailedActivity] = useState<DetailedActivity | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isItineraryModalOpen, setIsItineraryModalOpen] = useState(false);
  const { toast } = useToast();

  // Helper functions to handle both activity types
  const isSavedActivity = (act: SavedActivity | ActivityRecommendation | null | undefined): act is SavedActivity => {
    return act != null && typeof act === 'object' && 'activityData' in act;
  };

  const getActivityData = (act: SavedActivity | ActivityRecommendation | null | undefined): ActivityRecommendation | null => {
    if (!act) return null;
    return isSavedActivity(act) ? act.activityData : act;
  };

  useEffect(() => {
    if (isOpen && activity) {
      fetchDetailedActivity();
    }
  }, [isOpen, activity]);

  const fetchDetailedActivity = async () => {
    setLoading(true);

    const activityData = getActivityData(activity);
    if (!activityData) {
      setLoading(false);
      return;
    }

    try {
      // Fetch detailed product information from Viator
      const response = await fetch(`/api/activities/${activityData.productCode}/details`);

      if (response.ok) {
        const detailedData = await response.json();

        // Enhanced image extraction - get all available images from multiple sources
        const extractedImages = [];

        // Primary image
        if (activityData.imageUrl) {
          extractedImages.push(activityData.imageUrl);
        }

        // Images from detailed data - try multiple possible structures
        if (detailedData.images && Array.isArray(detailedData.images)) {
          detailedData.images.forEach((img: any) => {
            if (typeof img === 'string') {
              extractedImages.push(img);
            } else if (img.url) {
              extractedImages.push(img.url);
            } else if (img.imageUrl) {
              extractedImages.push(img.imageUrl);
            }
          });
        }

        // Additional images from activity data
        if (detailedData.additionalImages && Array.isArray(detailedData.additionalImages)) {
          extractedImages.push(...detailedData.additionalImages);
        }

        // Images from Viator product structure
        if (detailedData.productPhotos && Array.isArray(detailedData.productPhotos)) {
          detailedData.productPhotos.forEach((photo: any) => {
            if (photo.url) {
              extractedImages.push(photo.url);
            } else if (photo.photoURL) {
              extractedImages.push(photo.photoURL);
            }
          });
        }

        // Images from activity data itself
        if (activityData.images && Array.isArray(activityData.images)) {
          activityData.images.forEach((img: any) => {
            if (typeof img === 'string') {
              extractedImages.push(img);
            } else if (img.url) {
              extractedImages.push(img.url);
            }
          });
        }

        // Remove duplicates and filter out invalid URLs
        const uniqueImages = [...new Set(extractedImages)]
          .filter(url => url && typeof url === 'string' && url.trim().length > 0 && !url.includes('placeholder'));

        console.log(`🖼️ Extracted ${uniqueImages.length} images for ${activityData.productCode}:`, uniqueImages.slice(0, 3));

        // Enhanced inclusion/exclusion parsing
        const parseInclusions = (data: any) => {
          if (Array.isArray(data.inclusions)) return data.inclusions;
          if (Array.isArray(data.included)) return data.included;
          if (data.productInclusions && Array.isArray(data.productInclusions)) {
            return data.productInclusions.map((inc: any) => inc.description || inc.otherDescription || inc);
          }
          if (data.whatsIncluded && Array.isArray(data.whatsIncluded)) {
            return data.whatsIncluded.map((inc: any) => inc.description || inc.otherDescription || inc);
          }
          return [];
        };

        const parseExclusions = (data: any) => {
          if (Array.isArray(data.exclusions)) return data.exclusions;
          if (Array.isArray(data.excluded)) return data.excluded;
          if (data.productExclusions && Array.isArray(data.productExclusions)) {
            return data.productExclusions.map((exc: any) => exc.description || exc.otherDescription || exc);
          }
          if (data.whatsNotIncluded && Array.isArray(data.whatsNotIncluded)) {
            return data.whatsNotIncluded.map((exc: any) => exc.description || exc.otherDescription || exc);
          }
          return [];
        };

        setDetailedActivity({
          ...activity,
          fullDescription: detailedData.description || detailedData.productDescription || activityData.description,
          additionalImages: uniqueImages, // Use all images for carousel
          inclusions: parseInclusions(detailedData),
          exclusions: parseExclusions(detailedData),
          meetingPoint: detailedData.meetingPoint || detailedData.pickupLocation || 'Meeting point details will be provided after booking',
          cancellationPolicy: detailedData.cancellationPolicy || detailedData.cancelPolicy || 'Free cancellation up to 24 hours before the experience starts',
          itinerary: detailedData.itinerary || detailedData.productItinerary || []
        } as DetailedActivity);
      } else {
        console.error(`❌ Failed to fetch activity details: ${response.status} ${response.statusText}`);
        // Fallback to existing data if API call fails
        const fallbackImages = [];
        if (activityData.imageUrl) fallbackImages.push(activityData.imageUrl);
        if (activityData.additionalImages) fallbackImages.push(...activityData.additionalImages);
        if (activityData.images) {
          activityData.images.forEach((img: any) => {
            if (typeof img === 'string') fallbackImages.push(img);
            else if (img.url) fallbackImages.push(img.url);
          });
        }

        const uniqueFallbackImages = [...new Set(fallbackImages)]
          .filter(url => url && typeof url === 'string' && url.trim().length > 0);

        setDetailedActivity({
          ...activity,
          fullDescription: activityData.description,
          additionalImages: uniqueFallbackImages.slice(1),
          inclusions: activityData.tags || [],
          exclusions: [],
          meetingPoint: 'Meeting point details will be provided after booking',
          cancellationPolicy: 'Free cancellation up to 24 hours before the experience starts',
          itinerary: []
        } as DetailedActivity);
      }
    } catch (error) {
      console.error('Error fetching detailed activity:', error);
      // Use existing data as fallback with enhanced image extraction
      const fallbackImages = [];
      if (activityData.imageUrl) fallbackImages.push(activityData.imageUrl);
      if (activityData.additionalImages) fallbackImages.push(...activityData.additionalImages);
      if (activityData.images) {
        activityData.images.forEach((img: any) => {
          if (typeof img === 'string') fallbackImages.push(img);
          else if (img.url) fallbackImages.push(img.url);
        });
      }

      const uniqueFallbackImages = [...new Set(fallbackImages)]
        .filter(url => url && typeof url === 'string' && url.trim().length > 0);

      setDetailedActivity({
        ...activity,
        fullDescription: activityData.description,
        additionalImages: uniqueFallbackImages.slice(1),
        inclusions: activityData.tags || [],
        exclusions: [],
        meetingPoint: 'Meeting point details will be provided after booking',
        cancellationPolicy: 'Free cancellation up to 24 hours before the experience starts',
        itinerary: []
      } as DetailedActivity);
    }

    setLoading(false);
  };

  const handleBookNow = () => {
    const activityData = getActivityData(activity);
    if (activityData) {
      // Use fallback URL generation logic consistent with other components
      const bookingUrl = activityData.bookingUrl || 
                        activityData.productUrl || 
                        `https://www.viator.com/tours/${activityData.productCode}`;

      // Add UTM parameters for tracking
      const finalUrl = `${bookingUrl}?utm_source=wondervoya&utm_medium=referral`;
      window.open(finalUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const handleSaveToItinerary = () => {
    setIsItineraryModalOpen(true);
  };

  const handleActivitySaved = () => {
    setIsItineraryModalOpen(false);
    onClose(); // Close the detail modal after saving
    const activityData = getActivityData(activity);
    if (activityData) {
      toast({
        title: "Activity saved!",
        description: `${activityData.title} has been added to your itinerary.`,
      });
    }
  };

  const activityData = getActivityData(activity);
  if (!activityData) return null;

  // Enhanced image collection from all available sources
  const allImages = detailedActivity?.additionalImages && detailedActivity.additionalImages.length > 0 ? 
    detailedActivity.additionalImages :
    (() => {
      const imageSet = [];
      if (activityData.imageUrl) imageSet.push(activityData.imageUrl);
      if (activityData.additionalImages) imageSet.push(...activityData.additionalImages);
      if (activityData.images) {
        activityData.images.forEach((img: any) => {
          if (typeof img === 'string') imageSet.push(img);
          else if (img.url) imageSet.push(img.url);
        });
      }
      return [...new Set(imageSet)].filter(Boolean);
    })();

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl max-w-5xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto shadow-2xl mx-auto my-auto">
        {/* Header */}
        <div className="sticky top-0 bg-slate-800 border-b border-slate-600 p-6 flex justify-between items-start z-10">
          <div className="flex-1 pr-4">
            <h2 className="text-xl sm:text-2xl font-bold text-white mb-2 font-playfair leading-tight">{activityData.title}</h2>
            <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-4 space-y-1 sm:space-y-0 text-xs sm:text-sm text-white/80">
              <span className="flex items-center">
                <i className="fas fa-map-marker-alt mr-1 text-[#14B8A6]"></i>
                <span className="truncate">{activityData.location}</span>
              </span>
              <span className="flex items-center">
                <i className="fas fa-clock mr-1 text-[#14B8A6]"></i>
                {activityData.duration}
              </span>
              <span className="flex items-center">
                <i className="fas fa-star mr-1 text-[#14B8A6]"></i>
                {activityData.rating} ({activityData.reviewCount} reviews)
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="bg-white/20 hover:bg-white/30 text-white rounded-full p-2 transition-colors flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 shadow-lg backdrop-blur-sm border border-white/30 flex-shrink-0"
            aria-label="Close modal"
          >
            <i className="fas fa-times text-sm sm:text-lg"></i>
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center p-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#14B8A6]"></div>
            <span className="ml-3 text-white/80">Loading activity details...</span>
          </div>
        ) : (
          <div className="p-4 sm:p-6">
            {/* Image Gallery */}
            <div className="mb-6">
              <div className="relative h-72 lg:h-96 rounded-xl overflow-hidden bg-slate-800 border border-slate-600">
                {allImages.length > 0 ? (
                  <img
                    src={allImages[currentImageIndex]}
                    alt={activityData.title}
                    className="w-full h-full object-contain bg-black/20"
                    onError={(e) => {
                      console.log('Image failed to load:', allImages[currentImageIndex]);
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gray-200">
                    <div className="text-center text-gray-500">
                      <i className="fas fa-image text-4xl mb-2"></i>
                      <p>No image available</p>
                    </div>
                  </div>
                )}
                {allImages.length > 1 && (
                  <>
                    <button
                      onClick={() => setCurrentImageIndex(prev => prev > 0 ? prev - 1 : allImages.length - 1)}
                      className="absolute left-4 top-1/2 transform -translate-y-1/2 bg-white bg-opacity-80 hover:bg-opacity-100 rounded-full w-10 h-10 flex items-center justify-center transition-all"
                    >
                      <i className="fas fa-chevron-left text-gray-700"></i>
                    </button>
                    <button
                      onClick={() => setCurrentImageIndex(prev => prev < allImages.length - 1 ? prev + 1 : 0)}
                      className="absolute right-4 top-1/2 transform -translate-y-1/2 bg-white bg-opacity-80 hover:bg-opacity-100 rounded-full w-10 h-10 flex items-center justify-center transition-all"
                    >
                      <i className="fas fa-chevron-right text-gray-700"></i>
                    </button>
                    <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex space-x-2">
                      {allImages.map((_, index) => (
                        <button
                          key={index}
                          onClick={() => setCurrentImageIndex(index)}
                          className={`w-2 h-2 rounded-full transition-all ${
                            index === currentImageIndex ? 'bg-white' : 'bg-white bg-opacity-50'
                          }`}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
              {/* Main Content */}
              <div className="lg:col-span-2 space-y-4 sm:space-y-6">
                {/* Description */}
                <div>
                  <h3 className="text-lg font-semibold text-white mb-3">About This Activity</h3>
                  <p className="text-white/80 leading-relaxed">
                    {activityData.description}
                  </p>
                </div>

                {/* Itinerary */}
                {detailedActivity?.itinerary && detailedActivity.itinerary.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-3">Itinerary</h3>
                    <div className="space-y-3">
                      {detailedActivity.itinerary.map((item, index) => (
                        <div key={index} className="border-l-4 border-[#14B8A6] pl-4">
                          <h4 className="font-medium text-white">{item.title}</h4>
                          <p className="text-white/70 text-sm">{item.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Inclusions & Exclusions */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {detailedActivity?.inclusions && detailedActivity.inclusions.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold text-white mb-3">What's Included</h3>
                      <ul className="space-y-2">
                        {detailedActivity.inclusions.map((item, index) => (
                          <li key={index} className="flex items-start">
                            <i className="fas fa-check text-[#14B8A6] mr-2 mt-1 text-sm"></i>
                            <span className="text-white/80 text-sm">
                              {typeof item === 'string' 
                                ? item 
                                : typeof item === 'object' && item !== null
                                ? (item as any).description || (item as any).otherDescription || JSON.stringify(item)
                                : 'Included'
                              }
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {detailedActivity?.exclusions && detailedActivity.exclusions.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold text-white mb-3">What's Not Included</h3>
                      <ul className="space-y-2">
                        {detailedActivity.exclusions.map((item, index) => (
                          <li key={index} className="flex items-start">
                            <i className="fas fa-times text-red-400 mr-2 mt-1 text-sm"></i>
                            <span className="text-white/80 text-sm">
                              {typeof item === 'string' 
                                ? item 
                                : typeof item === 'object' && item !== null
                                ? (item as any).description || (item as any).otherDescription || JSON.stringify(item)
                                : 'Not included'
                              }
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {/* Meeting Point */}
                {detailedActivity?.meetingPoint && (
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-3">Meeting Point</h3>
                    <p className="text-white/80">{detailedActivity.meetingPoint}</p>
                  </div>
                )}

                {/* Cancellation Policy */}
                {detailedActivity?.cancellationPolicy && (
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-3">Cancellation Policy</h3>
                    <div className="text-white/80">
                      {typeof detailedActivity.cancellationPolicy === 'string' 
                        ? detailedActivity.cancellationPolicy
                        : typeof detailedActivity.cancellationPolicy === 'object' && detailedActivity.cancellationPolicy !== null
                        ? (
                          <div className="space-y-2">
                            {(detailedActivity.cancellationPolicy as any).description && (
                              <p>{(detailedActivity.cancellationPolicy as any).description}</p>
                            )}
                            {(detailedActivity.cancellationPolicy as any).type && (
                              <p><strong>Type:</strong> {(detailedActivity.cancellationPolicy as any).type}</p>
                            )}
                            {(detailedActivity.cancellationPolicy as any).refundEligibility && (
                              <p><strong>Refund:</strong> {
                                typeof (detailedActivity.cancellationPolicy as any).refundEligibility === 'string'
                                  ? (detailedActivity.cancellationPolicy as any).refundEligibility
                                  : typeof (detailedActivity.cancellationPolicy as any).refundEligibility === 'object'
                                  ? `${(detailedActivity.cancellationPolicy as any).refundEligibility.percentageRefundable || 0}% refundable within ${(detailedActivity.cancellationPolicy as any).refundEligibility.dayRangeMin || 0} days`
                                  : 'Available'
                              }</p>
                            )}
                          </div>
                        )
                        : 'Cancellation policy available - contact provider for details'
                      }
                    </div>
                  </div>
                )}
              </div>

              {/* Booking Sidebar */}
              <div className="lg:col-span-1">
                <div className="bg-slate-800 border border-slate-600 rounded-xl p-6 lg:sticky lg:top-6 shadow-lg">
                  <div className="text-center mb-6">
                    <div className="text-3xl font-bold text-white">
                      {activityData.price ? `${activityData.price.currency} ${activityData.price.amount}` : 'Price varies'}
                    </div>
                    <div className="text-sm text-white/70">per person</div>
                  </div>

                  <div className="space-y-4 mb-6">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-white/70">Duration:</span>
                      <span className="font-medium text-white">{activityData.duration}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-white/70">Rating:</span>
                      <span className="font-medium flex items-center text-white">
                        <i className="fas fa-star text-[#14B8A6] mr-1"></i>
                        {activityData.rating} ({activityData.reviewCount})
                      </span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {fromItinerary ? (
                      <>
                        {/* Rescheduling Interface for Itinerary Activities */}
                        {onSchedule && startDate && endDate ? (
                          <div className="space-y-4">
                            <div className="text-center">
                              <h4 className="text-lg font-semibold text-white mb-2">Reschedule Activity</h4>
                              <p className="text-sm text-white/70">Choose a new time for this activity</p>
                            </div>
                            <TripDateScheduler
                              activityCode={activityData.productCode}
                              activityTitle={activityData.title}
                              startDate={startDate}
                              endDate={endDate}
                              onSchedule={onSchedule}
                              disabled={loading}
                              itineraryId={itineraryId}
                              inModal={true}
                            />
                          </div>
                        ) : (
                          <div className="text-center py-4">
                            <p className="text-white/70 text-sm">Rescheduling not available</p>
                          </div>
                        )}

                        <button
                          onClick={handleBookNow}
                          className="w-full bg-white/20 hover:bg-white/30 text-white py-3 px-6 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 border border-white/30 backdrop-blur-sm"
                        >
                          <i className="fas fa-external-link-alt"></i>
                          Book on Viator
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={handleSaveToItinerary}
                          className="w-full bg-[#14B8A6] hover:bg-[#14B8A6]/90 text-white py-3 px-6 rounded-xl font-semibold transition-colors shadow-lg"
                        >
                          Save to Itinerary
                        </button>

                        <button
                          onClick={handleBookNow}
                          className="w-full bg-white/20 hover:bg-white/30 text-white py-3 px-6 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 border border-white/30 backdrop-blur-sm"
                        >
                          <i className="fas fa-external-link-alt"></i>
                          Book on Viator
                        </button>
                      </>
                    )}
                  </div>

                  <div className="text-xs text-white/60 text-center mt-3">
                    Secure booking through Viator
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Itinerary Manager Modal */}
        <ItineraryManager
          activity={{
            ...activityData,
            price: activityData.price || { amount: 0, currency: 'USD' }
          }}
          isOpen={isItineraryModalOpen}
          onClose={() => setIsItineraryModalOpen(false)}
          onSave={handleActivitySaved}
          sessionId={sessionId}
        />
      </div>
    </div>
  );
}