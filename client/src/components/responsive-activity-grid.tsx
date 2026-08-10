import { memo } from 'react';
import { ActivityCard } from './activity-card';
import { useMobileDetection } from '../hooks/use-mobile-detection';
import type { ActivityRecommendation } from '../types/viator';

interface ResponsiveActivityGridProps {
  activities: ActivityRecommendation[];
  extractedDates?: any;
  conversationMessages?: any[];
  sessionId: string;
  isComparisonMode?: boolean;
  selectedForComparison?: Set<string>;
  onToggleComparison?: (productCode: string) => void;
}

export const ResponsiveActivityGrid = memo<ResponsiveActivityGridProps>(({
  activities,
  extractedDates,
  conversationMessages,
  sessionId,
  isComparisonMode = false,
  selectedForComparison = new Set(),
  onToggleComparison
}) => {
  const { isMobile, isTablet } = useMobileDetection();

  const getGridClasses = () => {
    if (isMobile) {
      return 'grid grid-cols-1 gap-6';
    } else if (isTablet) {
      return 'grid grid-cols-2 gap-8';
    } else {
      return 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8';
    }
  };

  return (
    <div className={`${getGridClasses()} max-w-7xl mx-auto px-4`}>
      {activities.map((activity) => (
        <div key={activity.productCode} className="relative">
          {isComparisonMode && (
            <div className="absolute top-2 left-2 z-10">
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedForComparison.has(activity.productCode)}
                  onChange={() => onToggleComparison?.(activity.productCode)}
                  disabled={!selectedForComparison.has(activity.productCode) && selectedForComparison.size >= 3}
                  className="w-5 h-5 text-blue-600 bg-white border-2 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                />
                <span className={`ml-2 ${isMobile ? 'text-xs' : 'text-sm'} font-medium text-white bg-black bg-opacity-70 px-2 py-1 rounded`}>
                  {selectedForComparison.has(activity.productCode) ? 'Selected' : 'Select'}
                </span>
              </label>
            </div>
          )}
          <ActivityCard 
            activity={activity} 
            extractedDates={extractedDates} 
            conversationMessages={conversationMessages || []} 
            sessionId={sessionId}
          />
        </div>
      ))}
    </div>
  );
});

ResponsiveActivityGrid.displayName = 'ResponsiveActivityGrid';