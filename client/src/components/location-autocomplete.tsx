import React, { useState, useEffect } from 'react';
import { Input } from './ui/input';

interface Destination {
  destinationId: number;
  destinationName: string;
  isPopular?: boolean;
  category?: string;
}

interface LocationAutocompleteProps {
  placeholder?: string;
  onLocationSelect: (destinationId: number, destinationName: string) => void;
  className?: string;
  initialValue?: string;
}

const LocationAutocomplete: React.FC<LocationAutocompleteProps> = ({
  placeholder = "Search for a destination...",
  onLocationSelect,
  className,
  initialValue = ''
}) => {
  // State Management
  const [locationInput, setLocationInput] = useState<string>(initialValue);
  const [suggestions, setSuggestions] = useState<Destination[]>([]);
  const [selectedDestinationId, setSelectedDestinationId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [showDropdown, setShowDropdown] = useState<boolean>(false);

  // Debounce User Input and Handle Popular Suggestions
  useEffect(() => {
    // Show popular suggestions if input is empty
    if (!locationInput.trim()) {
      setIsLoading(true);
      
      // Fetch popular suggestions when input is empty
      const fetchPopularSuggestions = async () => {
        try {
          const response = await fetch('/api/destinations/find', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ searchTerm: '' }),
          });

          if (response.ok) {
            const data = await response.json();
            const results = data.results || [];
            console.log(`🌟 Loaded ${results.length} popular suggestions`);
            
            setSuggestions(results);
            setShowDropdown(results.length > 0);
          }
        } catch (error) {
          console.error('Error fetching popular suggestions:', error);
          setSuggestions([]);
          setShowDropdown(false);
        } finally {
          setIsLoading(false);
        }
      };

      fetchPopularSuggestions();
      return;
    }

    setIsLoading(true);

    // Debounce mechanism with 300ms delay
    const timeoutId = setTimeout(async () => {
      try {
        console.log(`🔍 Searching destinations for: "${locationInput.trim()}"`);

        // Fetch fresh suggestions with cache-busting
        const response = await fetch('/api/destinations/find', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache', // Ensure fresh results
          },
          body: JSON.stringify({
            searchTerm: locationInput.trim()
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const results = data.results || [];
          console.log(`✅ Frontend received ${results.length} destination suggestions:`, results);
          if (data.isPopularSuggestions) {
            console.log('🌟 Showing popular destination suggestions');
          }
          console.log(`📋 Setting suggestions and dropdown:`, { results, showDropdown: results.length > 0 });

          setSuggestions(results);
          setShowDropdown(results.length > 0);
        } else {
          console.error('❌ Failed to fetch destinations:', response.statusText);
          setSuggestions([]);
          setShowDropdown(false);
        }
      } catch (error) {
        console.error('Error fetching destinations:', error);
        setSuggestions([]);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    // Cleanup function to clear timeout
    return () => clearTimeout(timeoutId);
  }, [locationInput]);

  // Handle User Selection
  const handleLocationSelect = (destination: Destination) => {
    // Set the selected destination ID
    setSelectedDestinationId(destination.destinationId);

    // Update the input with the full destination name
    setLocationInput(destination.destinationName);

    // Clear suggestions to hide dropdown
    setSuggestions([]);
    setShowDropdown(false);

    // Call parent callback if provided
    if (onLocationSelect) {
      onLocationSelect(destination.destinationId, destination.destinationName);
    }
  };

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setLocationInput(value);

    // Reset selected destination if user starts typing again
    if (selectedDestinationId) {
      setSelectedDestinationId(null);
    }

    // Clear previous suggestions to show fresh results
    if (value !== locationInput) {
      setSuggestions([]);
    }
  };

  // Handle input focus
  const handleInputFocus = () => {
    if (suggestions.length > 0) {
      setShowDropdown(true);
    }
  };

  // Handle input blur (with delay to allow for clicks)
  const handleInputBlur = () => {
    setTimeout(() => {
      setShowDropdown(false);
    }, 150);
  };

  return (
    <div className={`relative w-full ${className}`}>
      {/* Input Field */}
      <Input
        type="text"
        value={locationInput}
        onChange={handleInputChange}
        onFocus={handleInputFocus}
        onBlur={handleInputBlur}
        placeholder={placeholder}
        className="w-full"
        autoComplete="off"
      />

      {/* Loading Indicator */}
      {isLoading && (
        <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-orange-500"></div>
        </div>
      )}

      {/* Enhanced Suggestions Dropdown */}
      {showDropdown && suggestions.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg max-h-60 overflow-auto">
          {suggestions.map((destination, index) => (
            <li
              key={destination.destinationId}
              onClick={() => handleLocationSelect(destination)}
              className="px-4 py-3 hover:bg-orange-50 dark:hover:bg-gray-700 cursor-pointer text-sm border-b border-gray-100 dark:border-gray-700 last:border-b-0 transition-colors duration-150 group"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="font-medium text-gray-900 dark:text-white group-hover:text-orange-600 dark:group-hover:text-orange-400">
                    {destination.destinationName}
                  </div>
                  {destination.isPopular && (
                    <div className="text-xs text-orange-500 dark:text-orange-400 mt-1">
                      ⭐ Popular destination
                    </div>
                  )}
                  {destination.category && destination.category !== 'other' && (
                    <div className="text-xs text-blue-500 dark:text-blue-400 mt-1">
                      📍 {destination.category.charAt(0).toUpperCase() + destination.category.slice(1)} destination
                    </div>
                  )}
                </div>
                <div className="text-xs text-gray-400 dark:text-gray-500 ml-2">
                  #{destination.destinationId}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Enhanced No Results Message */}
      {!isLoading && suggestions.length === 0 && locationInput.trim() && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg p-4">
          <div className="text-sm text-gray-500 dark:text-gray-400 text-center">
            <div className="mb-2">No destinations found for "{locationInput}"</div>
            <div className="text-xs text-gray-400 dark:text-gray-500">
              Try searching for major cities like "Tokyo", "Paris", or "New York"
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LocationAutocomplete;