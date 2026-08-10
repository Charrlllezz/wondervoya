import type { TripItinerary, ActivityRecommendation } from '@shared/schema';

interface ImageCandidate {
  url: string;
  score: number;
  source: 'cover' | 'gallery' | 'additional';
  activityTitle: string;
  activityRating: number;
}

/**
 * Intelligently selects the best cover image for an itinerary
 * by analyzing all scheduled activities and ranking images by quality,
 * activity rating, and image characteristics
 */
export function selectBestCoverImage(itinerary: TripItinerary): string | null {
  const candidates: ImageCandidate[] = [];

  // Collect images from all scheduled activities in all days
  itinerary.days.forEach(day => {
    day.timeSlots.forEach(slot => {
      if (slot.activity) {
        const activity = slot.activity;
        const rating = activity.rating || 0;
        const title = activity.title || '';

        // Primary cover image (highest priority)
        if (activity.imageUrl) {
          const coverUrl = activity.imageUrl;
          candidates.push({
            url: coverUrl,
            score: calculateImageScore(coverUrl, rating, 'cover', title),
            source: 'cover',
            activityTitle: title,
            activityRating: rating
          });
        }

        // Additional images (lower priority) - check if exists in schema
        if (activity.additionalImages && Array.isArray(activity.additionalImages)) {
          activity.additionalImages.forEach((imageUrl: string) => {
            candidates.push({
              url: imageUrl,
              score: calculateImageScore(imageUrl, rating, 'additional', title),
              source: 'additional',
              activityTitle: title,
              activityRating: rating
            });
          });
        }

        // Images from nested image objects - check if exists in schema
        if (activity.images && Array.isArray(activity.images)) {
          activity.images.forEach((img: any) => {
            if (typeof img === 'object' && img.url) {
              candidates.push({
                url: img.url,
                score: calculateImageScore(img.url, rating, 'gallery', title),
                source: 'gallery',
                activityTitle: title,
                activityRating: rating
              });
            }
          });
        }
      }
    });
  });

  // Also check unscheduled activities as fallback
  itinerary.activities?.forEach(savedActivity => {
    const activity = savedActivity.activityData;
    const rating = activity.rating || 0;
    const title = activity.title || '';

    if (activity.imageUrl) {
      candidates.push({
        url: activity.imageUrl,
        score: calculateImageScore(activity.imageUrl, rating, 'cover', title) * 0.8, // Lower score for unscheduled
        source: 'cover',
        activityTitle: title,
        activityRating: rating
      });
    }
  });

  // Remove duplicates and invalid URLs
  const uniqueCandidates = candidates
    .filter(candidate => candidate.url && candidate.url.trim().length > 0)
    .filter((candidate, index, arr) => 
      arr.findIndex(c => c.url === candidate.url) === index
    );

  if (uniqueCandidates.length === 0) {
    return null;
  }

  // Sort by score (highest first) and return the best image
  uniqueCandidates.sort((a, b) => b.score - a.score);
  
  console.log('🖼️ COVER IMAGE: Selected best image from', uniqueCandidates.length, 'candidates');
  console.log('🏆 COVER IMAGE: Winner -', {
    url: uniqueCandidates[0].url.substring(0, 80) + '...',
    score: uniqueCandidates[0].score.toFixed(2),
    source: uniqueCandidates[0].source,
    activity: uniqueCandidates[0].activityTitle.substring(0, 40) + '...',
    rating: uniqueCandidates[0].activityRating
  });

  return uniqueCandidates[0].url;
}

/**
 * Calculates a quality score for an image based on multiple factors
 */
function calculateImageScore(
  imageUrl: string, 
  activityRating: number, 
  source: 'cover' | 'gallery' | 'additional',
  activityTitle: string
): number {
  let score = 0;

  // Base score from activity rating (0-5 stars -> 0-50 points)
  score += (activityRating || 0) * 10;

  // Source priority bonus
  switch (source) {
    case 'cover':
      score += 30; // Highest priority for cover images
      break;
    case 'gallery':
      score += 20; // Medium priority for gallery images
      break;
    case 'additional':
      score += 10; // Lower priority for additional images
      break;
  }

  // URL quality indicators
  if (imageUrl.includes('viator.com') || imageUrl.includes('media.viator.com')) {
    score += 15; // Prefer official Viator images
  }

  // Image size/quality hints in URL
  if (imageUrl.includes('_1280x720') || imageUrl.includes('_large') || 
      imageUrl.includes('_xl') || imageUrl.includes('_hero')) {
    score += 10; // High resolution images
  } else if (imageUrl.includes('_640x480') || imageUrl.includes('_medium')) {
    score += 5; // Medium resolution images
  }

  // Penalize thumbnail or small images
  if (imageUrl.includes('_thumb') || imageUrl.includes('_small') || 
      imageUrl.includes('_150x') || imageUrl.includes('_100x')) {
    score -= 10;
  }

  // Activity type bonuses (iconic activities get priority)
  const titleLower = activityTitle.toLowerCase();
  if (titleLower.includes('eiffel tower') || titleLower.includes('louvre') || 
      titleLower.includes('versailles') || titleLower.includes('sagrada familia') ||
      titleLower.includes('colosseum') || titleLower.includes('big ben') ||
      titleLower.includes('statue of liberty') || titleLower.includes('golden gate')) {
    score += 15; // Bonus for iconic landmarks
  }

  return score;
}

/**
 * Updates an existing itinerary's cover image by re-analyzing all activities
 */
export function updateItineraryCoverImage(itinerary: TripItinerary): TripItinerary {
  const bestCoverImage = selectBestCoverImage(itinerary);
  
  return {
    ...itinerary,
    coverImageUrl: bestCoverImage || itinerary.coverImageUrl, // Keep existing if no better found
    updatedAt: new Date().toISOString()
  };
}