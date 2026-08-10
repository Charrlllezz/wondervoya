import { memo } from 'react';

interface LoadingSkeletonProps {
  variant?: 'card' | 'text' | 'circular';
  width?: string;
  height?: string;
  className?: string;
}

export const LoadingSkeleton = memo(function LoadingSkeleton({ 
  variant = 'text', 
  width = '100%', 
  height = '1rem',
  className = ''
}: LoadingSkeletonProps) {
  const baseClasses = 'animate-pulse bg-gray-200 dark:bg-gray-700';
  
  const variantClasses = {
    card: 'rounded-lg',
    text: 'rounded',
    circular: 'rounded-full'
  };

  return (
    <div 
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
      style={{ width, height }}
    />
  );
});

export const ActivityCardSkeleton = memo(function ActivityCardSkeleton() {
  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden p-4 space-y-4">
      <LoadingSkeleton variant="card" height="200px" />
      <LoadingSkeleton height="1.5rem" width="80%" />
      <LoadingSkeleton height="1rem" width="100%" />
      <LoadingSkeleton height="1rem" width="60%" />
      <div className="flex justify-between items-center">
        <LoadingSkeleton height="1rem" width="40%" />
        <LoadingSkeleton height="2rem" width="80px" />
      </div>
    </div>
  );
});

export const ChatMessageSkeleton = memo(function ChatMessageSkeleton() {
  return (
    <div className="flex space-x-3 p-4">
      <LoadingSkeleton variant="circular" width="40px" height="40px" />
      <div className="flex-1 space-y-2">
        <LoadingSkeleton height="1rem" width="30%" />
        <LoadingSkeleton height="1rem" width="90%" />
        <LoadingSkeleton height="1rem" width="70%" />
      </div>
    </div>
  );
});