import { useState, useEffect, useCallback, useRef } from 'react';
import { globalVideoState } from '@/lib/global-video-state';
import { videoPreloader } from '@/lib/video-preloader';

// Import available video files for chat sequence - using different videos from home page
import video1 from '@/assets/1.mp4';
import video2 from '@/assets/2.mp4';
import video3 from '@/assets/3.mp4';
import video4 from '@/assets/4.mp4';
import video5 from '@/assets/5.mp4';
import video6 from '@/assets/6.mp4';
import video7 from '@/assets/7.mp4';
import video8 from '@/assets/8.mp4';
import video9 from '@/assets/9.mp4';
import video10 from '@/assets/10.mp4';
import video11 from '@/assets/11.mp4';
import video12 from '@/assets/12.mp4';
import video13 from '@/assets/13.mp4';
import video14 from '@/assets/14.mp4';
import video15 from '@/assets/15.mp4';
import video16 from '@/assets/16.mp4';
import video17 from '@/assets/17.mp4';

interface ChatPageVideoCarouselProps {
  isActive: boolean;
  className?: string;
}

export function ChatPageVideoCarousel({ isActive, className = '' }: ChatPageVideoCarouselProps) {
  const [currentVideoIndex, setCurrentVideoIndex] = useState(globalVideoState.getCurrentIndex());
  const [videosLoaded, setVideosLoaded] = useState(true); // Start with true for immediate display
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [loadedVideoSet, setLoadedVideoSet] = useState<Set<number>>(new Set());
  const [priorityQueue, setPriorityQueue] = useState<number[]>([]);
  const [nextVideoIndex, setNextVideoIndex] = useState(-1);
  const [showFallback, setShowFallback] = useState(false); // Start with false for immediate video
  const [videoFadeIn, setVideoFadeIn] = useState(false); // Smooth fade-in control
  const videoRefs = useRef<HTMLVideoElement[]>([]);
  const transitionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Subscribe to global video state changes
  useEffect(() => {
    const unsubscribe = globalVideoState.subscribe(() => {
      const globalIndex = globalVideoState.getCurrentIndex();
      console.log(`🎬 ChatPageVideoCarousel: Syncing to global video index ${globalIndex + 1}`);
      setCurrentVideoIndex(globalIndex);
      // Reset fade-in for new video
      setVideoFadeIn(false);
    });

    return unsubscribe;
  }, []);

  // Early return if not active to prevent any interference
  if (!isActive) {
    return null;
  }

  // Available video list for chat page - using completely different videos from home page
  const videoList = [
    video1, video2, video3, video4, video5, video6, video7, video8, video9, 
    video10, video11, video12, video13, video14, video15, video16, video17
  ];

  // Enhanced video transitions with dissolve effect
  const handleVideoEnd = useCallback(() => {
    if (!isActive || isTransitioning) return;

    const nextIndex = (currentVideoIndex + 1) % videoList.length;
    console.log(`🎬 ChatPageVideoCarousel: Video ${currentVideoIndex + 1} ended, starting dissolve to ${nextIndex + 1}`);
    console.log(`🎨 Dissolve transition starting: current=${currentVideoIndex + 1}, next=${nextIndex + 1}`);

    // Clear any existing transition timeout
    if (transitionTimeoutRef.current) {
      clearTimeout(transitionTimeoutRef.current);
    }

    // Preload and prepare next video first
    const nextVideo = videoRefs.current[nextIndex];
    if (nextVideo) {
      nextVideo.currentTime = 0;
      nextVideo.play().catch(console.error);
    }

    // Start dissolve transition with small delay to ensure next video is ready
    setTimeout(() => {
      console.log(`🎨 Setting transition state: transitioning=true, nextVideo=${nextIndex + 1}`);
      setIsTransitioning(true);
      setNextVideoIndex(nextIndex);
      
      // Complete transition after dissolve duration
      transitionTimeoutRef.current = setTimeout(() => {
        console.log(`🎨 Completing dissolve transition to video ${nextIndex + 1}`);
        setCurrentVideoIndex(nextIndex);
        setNextVideoIndex(-1);
        setIsTransitioning(false);
        
        // Update global state after visual transition completes
        globalVideoState.setCurrentIndex(nextIndex);
        globalVideoState.setCurrentTime(0);
      }, 1500); // 1.5 second dissolve
    }, 100); // Small delay to ensure next video is ready
  }, [currentVideoIndex, isActive, videoList.length, isTransitioning]);

  // Update global video time periodically
  useEffect(() => {
    if (!isActive) return;

    const interval = setInterval(() => {
      const activeVideo = videoRefs.current[currentVideoIndex];
      if (activeVideo && !activeVideo.paused) {
        globalVideoState.setCurrentTime(activeVideo.currentTime);
      }
    }, 500); // Update every 500ms

    return () => clearInterval(interval);
  }, [currentVideoIndex, isActive]);

  // Handle video loading with instant fallback hiding
  const handleVideoLoad = (videoIndex: number) => {
    console.log(`✅ ChatPageVideoCarousel: Video ${videoIndex + 1}/${videoList.length} loaded and ready`);

    setLoadedVideoSet(prev => {
      const newSet = new Set(prev);
      newSet.add(videoIndex);
      return newSet;
    });

    // Hide fallback immediately when current video loads
    if (videoIndex === currentVideoIndex && showFallback) {
      console.log(`🎬 Current video ${videoIndex + 1} loaded, hiding fallback immediately`);
      setShowFallback(false);
      setVideosLoaded(true);
    }

    // Also hide fallback when any video loads if we haven't already
    if (!videosLoaded) {
      setVideosLoaded(true);
      console.log(`🎬 Video ${videoIndex + 1} loaded, enabling video system`);
    }
  };

  // Progressive preloading system - now checking for pre-preloaded videos
  useEffect(() => {
    if (!isActive || !videosLoaded) return;

    const createPriorityQueue = (currentIndex: number) => {
      const queue: number[] = [];
      const totalVideos = videoList.length;

      // Check which videos are already preloaded from home page
      const preloadedFromHome: number[] = [];
      for (let i = 0; i < totalVideos; i++) {
        const preloadedVideo = videoPreloader.getPreloadedVideo(videoList[i]);
        if (preloadedVideo) {
          preloadedFromHome.push(i);
          setLoadedVideoSet(prev => {
            const newSet = new Set(prev);
            newSet.add(i);
            return newSet;
          });
        }
      }

      if (preloadedFromHome.length > 0) {
        console.log(`🎬 Found ${preloadedFromHome.length} videos pre-preloaded from home page:`, preloadedFromHome.map(i => i + 1));
      }

      // Priority 1: Current video (should already be loaded)
      if (!loadedVideoSet.has(currentIndex)) {
        queue.push(currentIndex);
      }

      // Priority 2: Next 3 videos
      for (let i = 1; i <= 3; i++) {
        const nextIndex = (currentIndex + i) % totalVideos;
        if (!loadedVideoSet.has(nextIndex)) {
          queue.push(nextIndex);
        }
      }

      // Priority 3: Previous 2 videos (in case user navigates back)
      for (let i = 1; i <= 2; i++) {
        const prevIndex = (currentIndex - i + totalVideos) % totalVideos;
        if (!loadedVideoSet.has(prevIndex)) {
          queue.push(prevIndex);
        }
      }

      // Priority 4: Remaining videos (spread over time)
      for (let i = 4; i < totalVideos; i++) {
        const index = (currentIndex + i) % totalVideos;
        if (!loadedVideoSet.has(index)) {
          queue.push(index);
        }
      }

      return queue;
    };

    const newQueue = createPriorityQueue(currentVideoIndex);
    setPriorityQueue(newQueue);

    // Use video preloader for better performance
    newQueue.forEach((videoIndex, queuePosition) => {
      const priority = queuePosition < 3 ? queuePosition + 1 : queuePosition + 5;
      const videoSrc = videoList[videoIndex];

      videoPreloader.preloadVideo(videoSrc, priority).then(() => {
        console.log(`✅ Preloaded video ${videoIndex + 1} via preloader`);
        setLoadedVideoSet(prev => {
          const newSet = new Set(prev);
          newSet.add(videoIndex);
          return newSet;
        });
      }).catch((error) => {
        console.error(`❌ Failed to preload video ${videoIndex + 1}:`, error);
      });
    });

    // Log preloader stats
    const stats = videoPreloader.getStats();
    console.log(`📊 Video preloader stats:`, stats);
  }, [currentVideoIndex, isActive, videosLoaded]);

  // IMMEDIATE VIDEO DISPLAY EFFECT - Forces video to show instantly
  useEffect(() => {
    console.log(`🎬 ChatPageVideoCarousel: Component mounted, forcing immediate video display`);
    setShowFallback(false);
    setVideosLoaded(true);
  }, []);

  // Initialize current video when component becomes active - instant start
  useEffect(() => {
    if (!isActive) return;

    // Always show video immediately, regardless of preload status
    console.log(`🎬 ChatPageVideoCarousel: Initializing video ${currentVideoIndex + 1} immediately`);
    setShowFallback(false);
    setVideosLoaded(true);

    // Initialize current video immediately - no delay
    const currentVideo = videoRefs.current[currentVideoIndex];
    if (currentVideo) {
      console.log(`🎬 ChatPageVideoCarousel: Fast-initializing video ${currentVideoIndex + 1}`);
      
      // Set video properties for immediate play
      currentVideo.muted = true;
      currentVideo.currentTime = globalVideoState.getCurrentTime();
      
      // Force load and play
      const playPromise = currentVideo.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          console.log(`✅ ChatPageVideoCarousel: Video ${currentVideoIndex + 1} playing immediately`);
        }).catch((error) => {
          console.log(`⚠️ Video ${currentVideoIndex + 1} play failed:`, error);
          // Still show video frame even if play fails
        });
      }
    }
  }, [isActive, currentVideoIndex]);

  // Ensure immediate video visibility on component mount
  useEffect(() => {
    if (!isActive) return;
    
    // Force immediate video display - no fallback delays
    setShowFallback(false);
    setVideosLoaded(true);
    
    // Initialize smooth fade-in for component mount
    setTimeout(() => setVideoFadeIn(true), 100);
    
    console.log(`🎬 ChatPageVideoCarousel: Component active, forcing immediate video display`);
  }, [isActive]);

  // Play current video and pause others - immediate playback
  useEffect(() => {
    if (!isActive || isTransitioning) return; // Removed videosLoaded check for immediate playback

    videoList.forEach((_, index) => {
      const video = document.querySelector(`video[data-chat-video-index="${index}"]`) as HTMLVideoElement;
      if (video) {
        if (index === currentVideoIndex) {
          // Only play if not already playing to prevent restarts
          if (video.paused || video.currentTime === 0) {
            video.currentTime = 0;
            video.muted = true;
            video.play().then(() => {
              console.log(`▶️ ChatPageVideoCarousel: Video ${index + 1} started playing`);
            }).catch((error) => {
              console.log(`⚠️ ChatPageVideoCarousel: Video ${index + 1} play failed:`, error);
            });
          }
        } else {
          // Pause other videos
          if (!video.paused) {
            video.pause();
          }
        }
      }
    });
  }, [currentVideoIndex, videosLoaded, isActive, videoList.length, isTransitioning]);

  // Cleanup transition timeout on unmount
  useEffect(() => {
    return () => {
      if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current);
      }
    };
  }, []);

  // Note: Removed the reset effect to prevent interference with global video state
  // The global video state should be the single source of truth for video progression

  return (
    <div className={`fixed inset-0 ${className}`} style={{ zIndex: 10, backgroundColor: 'black' }}>
      {/* REMOVED FALLBACK - No gray backgrounds, videos only */}
      {false && showFallback && (
        <div 
          className="absolute inset-0 w-full h-full"
          style={{
            background: `
              linear-gradient(135deg, 
                rgba(15, 35, 75, 0.95) 0%,
                rgba(45, 25, 55, 0.92) 20%,
                rgba(25, 45, 65, 0.89) 40%,
                rgba(55, 35, 25, 0.91) 60%,
                rgba(35, 55, 45, 0.93) 80%,
                rgba(25, 35, 55, 0.95) 100%
              ),
              radial-gradient(circle at 25% 25%, rgba(114, 47, 55, 0.6) 0%, transparent 50%),
              radial-gradient(circle at 75% 75%, rgba(201, 168, 118, 0.4) 0%, transparent 60%),
              radial-gradient(circle at 50% 20%, rgba(20, 184, 166, 0.3) 0%, transparent 40%),
              radial-gradient(circle at 20% 80%, rgba(30, 58, 138, 0.4) 0%, transparent 50%),
              linear-gradient(45deg, 
                rgba(0, 0, 0, 0.2) 0%, 
                rgba(30, 30, 40, 0.4) 30%,
                rgba(0, 0, 0, 0.1) 60%,
                rgba(20, 25, 35, 0.3) 100%
              )
            `,
            filter: 'brightness(0.85) contrast(1.2) saturate(1.3)',
            animation: showFallback ? 'subtle-shift 8s ease-in-out infinite' : 'none',
            zIndex: 5,
            transition: 'opacity 0.8s ease-out'
          }}
        />
      )}

      {/* Add CSS animation for subtle background movement */}
      {showFallback && (
        <style>{`
          @keyframes subtle-shift {
            0%, 100% { 
              filter: brightness(0.85) contrast(1.2) saturate(1.3) hue-rotate(0deg); 
            }
            25% { 
              filter: brightness(0.8) contrast(1.25) saturate(1.4) hue-rotate(5deg); 
            }
            50% { 
              filter: brightness(0.9) contrast(1.15) saturate(1.2) hue-rotate(-3deg); 
            }
            75% { 
              filter: brightness(0.82) contrast(1.22) saturate(1.35) hue-rotate(2deg); 
            }
          }
        `}</style>
      )}
      
      {/* Emergency instant video display - Always show current video immediately */}
      <video
        key={`emergency-${currentVideoIndex}`}
        src={videoList[currentVideoIndex]}
        autoPlay={true}
        muted={true}
        loop={false}
        playsInline={true}
        controls={false}
        disablePictureInPicture={true}
        disableRemotePlayback={true}
        preload="auto"
        className="absolute inset-0 w-full h-full object-cover"
        style={{
          filter: 'brightness(0.9) contrast(1.1) saturate(1.1)',
          pointerEvents: 'none',
          backgroundColor: 'black', // Black background to prevent gray
          opacity: videoFadeIn ? 1 : 0, // Smooth fade-in
          zIndex: 20, // Always on top
          display: 'block',
          transition: 'opacity 0.8s ease-out' // Smooth fade transition
        }}
        onLoadedData={() => {
          console.log(`🚀 Emergency video ${currentVideoIndex + 1} loaded and visible`);
          // Set video time to match global state
          const video = document.querySelector(`video[key="emergency-${currentVideoIndex}"]`) as HTMLVideoElement;
          if (video) {
            video.currentTime = globalVideoState.getCurrentTime();
          }
          // Trigger smooth fade-in after a brief delay
          setTimeout(() => setVideoFadeIn(true), 50);
        }}
        onEnded={() => handleVideoEnd()}
      />
      
      {/* Render all videos */}
      {videoList.map((videoSrc, index) => {
        const isCurrentVideo = index === currentVideoIndex;
        const isHighPriority = priorityQueue.indexOf(index) < 3;
        const isLoaded = loadedVideoSet.has(index);

        return (
          <video
            key={index}
            data-chat-video-index={index}
            src={videoSrc}
            autoPlay={isCurrentVideo}
            muted={true}
            loop={false}
            playsInline={true}
            controls={false}
            disablePictureInPicture={true}
            disableRemotePlayback={true}
            preload="auto"
            className="absolute inset-0 w-full h-full object-cover"
            poster=""
            style={{
              filter: 'brightness(0.9) contrast(1.1) saturate(1.1)',
              pointerEvents: 'none',
              backgroundColor: 'transparent', // Allow video to show through immediately
              opacity: (() => {
                // FORCE IMMEDIATE VISIBILITY - Always show current video regardless of loading state
                if (isCurrentVideo) return 1;
                if (index === nextVideoIndex && isTransitioning) return 1;
                return 0;
              })(),
              transition: isTransitioning ? 'opacity 1.5s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
              transform: 'scale(1.02) translateZ(0)', // Slight scale to hide edges
              willChange: 'opacity',
              backfaceVisibility: 'hidden',
              zIndex: (() => {
                if (isCurrentVideo && !isTransitioning) return 15;
                if (index === nextVideoIndex && isTransitioning) return 14;
                if (isCurrentVideo && isTransitioning) return 13;
                return 1;
              })(),
              display: 'block'
            }}
            onLoadedData={() => handleVideoLoad(index)}
            onLoadedMetadata={() => {
              // Show first frame immediately when metadata loads
              if (isCurrentVideo) {
                console.log(`🎬 Video ${index + 1} metadata loaded - showing first frame`);
              }
            }}
            onCanPlay={() => {
              console.log(`📺 ChatPageVideoCarousel: Video ${index + 1} can play`);
            }}
            onLoadStart={() => {
              console.log(`🔄 ChatPageVideoCarousel: Video ${index + 1} started loading`);
            }}
            onProgress={() => {
              const video = document.querySelector(`video[data-chat-video-index="${index}"]`) as HTMLVideoElement;
              if (video && video.buffered.length > 0) {
                const bufferedEnd = video.buffered.end(video.buffered.length - 1);
                const duration = video.duration;
                if (duration > 0) {
                  const percentBuffered = (bufferedEnd / duration) * 100;
                  if (percentBuffered > 25 && !isLoaded) {
                    console.log(`📊 Video ${index + 1} buffered ${percentBuffered.toFixed(1)}%`);
                  }
                }
              }
            }}
            onEnded={() => handleVideoEnd()}
            onError={(e) => {
              console.error(`❌ ChatPageVideoCarousel: Video ${index + 1} error:`, e);
              // Retry loading after a delay
              setTimeout(() => {
                const video = document.querySelector(`video[data-chat-video-index="${index}"]`) as HTMLVideoElement;
                if (video) {
                  console.log(`🔄 Retrying video ${index + 1} load`);
                  video.load();
                }
              }, 2000);
            }}
            ref={(el) => (videoRefs.current[index] = el as HTMLVideoElement)}
          />
        );
      })}

      {/* Enhanced dynamic overlay with sophisticated gradients */}
      <div 
        className="absolute inset-0 z-20"
        style={{
          background: `
            linear-gradient(
              135deg,
              rgba(0, 0, 0, 0.15) 0%,
              rgba(0, 0, 0, 0.25) 50%,
              rgba(0, 0, 0, 0.18) 100%
            ),
            radial-gradient(
              ellipse at center,
              rgba(114, 47, 55, 0.08) 0%,
              transparent 75%
            ),
            linear-gradient(
              180deg,
              rgba(114, 47, 55, 0.05) 0%,
              transparent 40%,
              transparent 60%,
              rgba(201, 168, 118, 0.03) 100%
            )
          `,
          transition: 'background 1.5s ease-in-out, opacity 1s ease-out',
          opacity: isTransitioning ? 0.6 : 0.8
        }}
      ></div>

      {/* Enhanced vignette with depth */}
      <div 
        className="absolute inset-0 z-21"
        style={{
          background: `
            radial-gradient(
              ellipse at center,
              transparent 30%,
              rgba(0, 0, 0, 0.08) 70%,
              rgba(0, 0, 0, 0.15) 100%
            )
          `,
          transition: 'opacity 1s ease-out',
          opacity: isTransitioning ? 0.4 : 0.6
        }}
      ></div>

      {/* Cinematic letterbox effect */}
      <div 
        className="absolute inset-0 z-22"
        style={{
          background: `
            linear-gradient(
              to bottom,
              rgba(0, 0, 0, 0.05) 0%,
              transparent 8%,
              transparent 92%,
              rgba(0, 0, 0, 0.05) 100%
            )
          `,
          transition: 'opacity 1s ease-in-out',
          opacity: isTransitioning ? 0.2 : 0.4
        }}
      ></div>


    </div>
  );
}