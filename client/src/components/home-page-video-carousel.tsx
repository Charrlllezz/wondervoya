import { useState, useEffect } from 'react';
import heroVideo from '@/assets/serene-tropical-video.mp4';
import clip2 from '@/assets/clip2.mp4';
import clip3 from '@/assets/clip3.mp4';
import clip4 from '@/assets/clip4.mp4';
import clip5 from '@/assets/clip5.mp4';

interface HomePageVideoCarouselProps {
  isActive: boolean;
  className?: string;
}

export function HomePageVideoCarousel({ isActive, className = '' }: HomePageVideoCarouselProps) {
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Early return if not active to prevent any interference
  if (!isActive) {
    return null;
  }

  // Original 5-video list for home page
  const videoList = [
    heroVideo,  // Serene tropical
    clip2,      // Clip 2
    clip3,      // Clip 3
    clip4,      // Clip 4
    clip5       // Clip 5
  ];

  // Handle video loading
  const handleVideoLoad = () => {
    setVideoLoaded(true);

    // Immediately try to play the first video
    const firstVideo = document.querySelector('video[data-home-video-index="0"]') as HTMLVideoElement;
    if (firstVideo) {
      firstVideo.muted = true; // Ensure muted for autoplay
      firstVideo.play().then(() => {
        console.log('✅ HomePageVideoCarousel: First video started playing automatically');
      }).catch((error) => {
        console.log('⚠️ HomePageVideoCarousel: Autoplay blocked, user interaction required:', error);
      });
    }
  };

  // Let videos play naturally and transition when they end
  // No automatic timeout - videos will transition via onEnded event

  // Play video when transitioning to it and pause others
  useEffect(() => {
    if (!videoLoaded || !isActive) return;

    // Pause all videos first
    videoList.forEach((_, index) => {
      const video = document.querySelector(`video[data-home-video-index="${index}"]`) as HTMLVideoElement;
      if (video && index !== currentVideoIndex) {
        video.pause();
      }
    });

    // Play the current video
    const currentVideo = document.querySelector(`video[data-home-video-index="${currentVideoIndex}"]`) as HTMLVideoElement;
    if (currentVideo) {
      currentVideo.muted = true;
      currentVideo.currentTime = 0;
      currentVideo.play().then(() => {
        console.log(`✅ HomePageVideoCarousel: Video ${currentVideoIndex + 1} started playing`);
      }).catch((error) => {
        console.log(`⚠️ HomePageVideoCarousel: Video ${currentVideoIndex + 1} play failed:`, error);
      });
    }
  }, [currentVideoIndex, videoLoaded, isActive, videoList.length]);

  if (!isActive) return null;

  return (
    <div className={`fixed inset-0 z-[-1] ${className}`}>
      {videoList.map((videoSrc, index) => (
        <video
          key={index}
          data-home-video-index={index}
          autoPlay={index === 0}
          muted={true}
          loop={false}
          playsInline={true}
          controls={false}
          disablePictureInPicture={true}
          disableRemotePlayback={true}
          preload="auto"
          className={`fixed inset-0 w-full h-full object-cover z-[-1] ${
            index === currentVideoIndex ? 'opacity-100' : 'opacity-0'
          }`}
          style={{
            filter: 'brightness(0.6) contrast(1.2) saturate(1.2)',
            pointerEvents: 'none',
            transition: `
              opacity 2.5s cubic-bezier(0.25, 0.46, 0.45, 0.94),
              transform 3s cubic-bezier(0.19, 1, 0.22, 1),
              filter 2s ease-out
            `,
            transform: index === currentVideoIndex 
              ? 'scale(1) translateZ(0)' 
              : 'scale(1.02) translateZ(0)',
            willChange: 'opacity, transform, filter',
            backfaceVisibility: 'hidden',
            perspective: '1000px'
          }}
          onLoadedData={() => {
            handleVideoLoad();
            // If this is the current video, try to play it
            if (index === currentVideoIndex) {
              const video = document.querySelector(`video[data-home-video-index="${index}"]`) as HTMLVideoElement;
              if (video) {
                video.muted = true;
                video.play().catch(() => {
                  console.log(`⚠️ Video ${index + 1} autoplay blocked`);
                });
              }
            }
          }}
          onEnded={() => {
            // Only handle end event for the currently visible video
            if (index === currentVideoIndex && !isTransitioning) {
              const nextIndex = (currentVideoIndex + 1) % videoList.length;
              console.log(`✅ HomePageVideoCarousel: Video ${index + 1} ended naturally, transitioning immediately to video ${nextIndex + 1}`);

              // Start smooth transition immediately
              setIsTransitioning(true);

              // Start next video immediately and transition
              const nextVideo = document.querySelector(`video[data-home-video-index="${nextIndex}"]`) as HTMLVideoElement;
              if (nextVideo) {
                nextVideo.currentTime = 0;
                nextVideo.play().then(() => {
                  console.log(`✅ HomePageVideoCarousel: Video ${nextIndex + 1} started playing`);

                  // Enhanced transition with staggered timing
                  setTimeout(() => {
                    setCurrentVideoIndex(nextIndex);
                  }, 300); // Slight delay for smoother blend

                  // Complete transition after enhanced duration
                  setTimeout(() => {
                    setIsTransitioning(false);
                  }, 2800); // Match new transition duration (2.5s + buffer)
                }).catch((error) => {
                  console.log(`⚠️ HomePageVideoCarousel: Video ${nextIndex + 1} play failed:`, error);
                  setIsTransitioning(false);
                });
              } else {
                // Fallback if video element not found
                setCurrentVideoIndex(nextIndex);
                setIsTransitioning(false);
              }
            }
          }}
          onTimeUpdate={(e) => {
            // Ensure video plays smoothly to the very end
            const video = e.currentTarget;
            if (video.duration && video.currentTime >= video.duration - 0.1) {
              // Video is very close to end, ensure no buffering issues
              if (video.readyState < 4) {
                video.load(); // Reload if buffering
              }
            }
          }}
          onError={(e) => console.error(`❌ HomePageVideo ${index + 1} error:`, e)}
        >
          <source src={videoSrc} type="video/mp4" />
        </video>
      ))}

      {/* Enhanced dynamic overlay with gradient transitions */}
      <div 
        className="absolute inset-0 z-20"
        style={{
          background: `
            linear-gradient(
              135deg,
              rgba(0, 0, 0, 0.3) 0%,
              rgba(0, 0, 0, 0.45) 50%,
              rgba(0, 0, 0, 0.35) 100%
            ),
            radial-gradient(
              ellipse at center,
              rgba(114, 47, 55, 0.1) 0%,
              transparent 70%
            )
          `,
          transition: 'background 2s ease-in-out',
          opacity: isTransitioning ? 0.8 : 1
        }}
      ></div>

      {/* Subtle vignette effect */}
      <div 
        className="absolute inset-0 z-21"
        style={{
          background: `radial-gradient(
            ellipse at center,
            transparent 30%,
            rgba(0, 0, 0, 0.2) 100%
          )`,
          transition: 'opacity 1.5s ease-out',
          opacity: isTransitioning ? 0.5 : 0.8
        }}
      ></div>


    </div>
  );
}