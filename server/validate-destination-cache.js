
const { auxiliaryDataManager } = require('./services/auxiliary-data-manager');
const axios = require('axios');

async function validateDestinationCache() {
  console.log('🔍 Validating destination cache accuracy...\n');
  
  try {
    // Get cached destinations
    const cachedDestinations = await auxiliaryDataManager.getDestinations();
    console.log(`📋 Cached destinations: ${cachedDestinations.length}`);
    
    // Sample key destinations we expect
    const keyDestinations = [
      { name: 'Paris', expectedIds: [479, 684, 10] },
      { name: 'Tokyo', expectedIds: [1, 334] },
      { name: 'London', expectedIds: [737, 706, 50648] },
      { name: 'Rome', expectedIds: [511] },
      { name: 'Barcelona', expectedIds: [562] }
    ];
    
    console.log('\n🔍 Checking key destinations:');
    for (const keyDest of keyDestinations) {
      console.log(`\n📍 ${keyDest.name}:`);
      
      const matches = cachedDestinations.filter(dest => {
        const name = (dest.name || dest.destinationName || '').toLowerCase();
        return name.includes(keyDest.name.toLowerCase());
      });
      
      console.log(`  Found ${matches.length} matches:`);
      matches.forEach(match => {
        const id = match.id || match.destinationId;
        const name = match.name || match.destinationName;
        const isExpected = keyDest.expectedIds.includes(id);
        console.log(`    ${isExpected ? '✅' : '⚠️'} ID: ${id} - Name: ${name}`);
      });
      
      // Check if we have the expected IDs
      const foundIds = matches.map(m => m.id || m.destinationId);
      const missingIds = keyDest.expectedIds.filter(id => !foundIds.includes(id));
      if (missingIds.length > 0) {
        console.log(`    ❌ Missing expected IDs: ${missingIds.join(', ')}`);
      }
    }
    
    // Check for suspicious destinations that might indicate data issues
    console.log('\n🚨 Checking for suspicious destinations:');
    const suspiciousPatterns = ['namibia', 'walvis bay', 'swakopmund', 'sandwich harbour'];
    
    suspiciousPatterns.forEach(pattern => {
      const matches = cachedDestinations.filter(dest => {
        const name = (dest.name || dest.destinationName || '').toLowerCase();
        return name.includes(pattern);
      });
      
      if (matches.length > 0) {
        console.log(`  ⚠️ Found ${matches.length} destinations matching "${pattern}":`);
        matches.forEach(match => {
          const id = match.id || match.destinationId;
          const name = match.name || match.destinationName;
          console.log(`    ID: ${id} - Name: ${name}`);
        });
      }
    });
    
    // Get fresh data from API for comparison
    console.log('\n🌐 Comparing with live API data...');
    const response = await axios.get('https://api.viator.com/partner/destinations', {
      headers: {
        'Accept': 'application/json;version=2.0',
        'exp-api-key': process.env.VIATOR_API_KEY
      }
    });
    
    const liveDestinations = response.data?.destinations || [];
    console.log(`📊 Live destinations from API: ${liveDestinations.length}`);
    
    // Compare counts and key destinations
    const countDiff = Math.abs(cachedDestinations.length - liveDestinations.length);
    console.log(`📊 Count difference: ${countDiff} destinations`);
    
    if (countDiff > 50) {
      console.log('❌ Significant difference in destination counts - cache may be stale');
    }
    
    // Check if key destinations exist in live data
    console.log('\n✅ Verification summary:');
    let allGood = true;
    
    for (const keyDest of keyDestinations) {
      const cachedMatches = cachedDestinations.filter(dest => {
        const name = (dest.name || dest.destinationName || '').toLowerCase();
        return name.includes(keyDest.name.toLowerCase());
      });
      
      const liveMatches = liveDestinations.filter(dest => {
        const name = (dest.destinationName || '').toLowerCase();
        return name.includes(keyDest.name.toLowerCase());
      });
      
      if (cachedMatches.length === 0) {
        console.log(`❌ ${keyDest.name}: Not found in cache`);
        allGood = false;
      } else if (liveMatches.length === 0) {
        console.log(`❌ ${keyDest.name}: Not found in live data`);
        allGood = false;
      } else {
        console.log(`✅ ${keyDest.name}: Found in both cache (${cachedMatches.length}) and live data (${liveMatches.length})`);
      }
    }
    
    if (allGood) {
      console.log('\n🎉 Destination cache validation PASSED');
    } else {
      console.log('\n⚠️ Destination cache validation FAILED - manual review needed');
    }
    
    return {
      cached: cachedDestinations.length,
      live: liveDestinations.length,
      countDiff,
      keyDestinationsValid: allGood,
      suspiciousFound: suspiciousPatterns.some(pattern => 
        cachedDestinations.some(dest => 
          (dest.name || dest.destinationName || '').toLowerCase().includes(pattern)
        )
      )
    };
    
  } catch (error) {
    console.error('❌ Cache validation failed:', error);
    return null;
  }
}

// Run validation if called directly
if (require.main === module) {
  validateDestinationCache().then(result => {
    if (result) {
      console.log('\n📊 Final Summary:', result);
      
      if (!result.keyDestinationsValid || result.suspiciousFound) {
        console.log('\n🔧 Recommended actions:');
        console.log('1. Clear destination cache: rm viator-destinations-cache.json');
        console.log('2. Restart application to refresh cache');
        console.log('3. Test key destination searches');
      }
    }
    process.exit(0);
  });
}

module.exports = { validateDestinationCache };
