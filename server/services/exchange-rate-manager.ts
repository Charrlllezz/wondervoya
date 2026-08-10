
import axios from 'axios';

interface ExchangeRateCache {
  rates: Array<{
    sourceCurrency: string;
    targetCurrency: string;
    rate: number;
    expiryDate: string;
  }>;
  lastUpdated: string;
}

class ExchangeRateManager {
  private cache: ExchangeRateCache | null = null;
  private readonly CACHE_KEY = 'viator_exchange_rates';
  private readonly axiosInstance = axios.create({
    baseURL: 'https://api.viator.com/partner',
    headers: {
      'Accept': 'application/json;version=2.0',

      'exp-api-key': process.env.VIATOR_API_KEY || ''
    }
  });

  async getExchangeRates(sourceCurrencies: string[], targetCurrencies: string[]): Promise<any[]> {
    // Check if cache is valid and not expired
    if (this.cache && this.isCacheValid()) {
      console.log('Using cached exchange rates');
      return this.filterRatesFromCache(sourceCurrencies, targetCurrencies);
    }

    // Fetch fresh rates from Viator API directly
    console.log('Fetching fresh exchange rates from Viator API');
    try {
      const response = await this.axiosInstance.post('/exchange-rates', {
        sourceCurrencies,
        targetCurrencies,
      });
      const rates = response.data?.rates || [];
      
      if (rates && rates.length > 0) {
        this.updateCache(rates);
        return rates;
      }
    } catch (error) {
      console.error('Error fetching exchange rates:', error);
      
      // Fall back to cached rates if available, even if expired
      if (this.cache) {
        console.log('Using expired cache as fallback');
        return this.filterRatesFromCache(sourceCurrencies, targetCurrencies);
      }
    }

    // Return default rates as last resort
    return this.getDefaultRates(sourceCurrencies, targetCurrencies);
  }

  private isCacheValid(): boolean {
    if (!this.cache) return false;

    const now = new Date();
    const lastUpdated = new Date(this.cache.lastUpdated);
    const hoursSinceUpdate = (now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60);

    // Refresh daily (24 hours)
    return hoursSinceUpdate < 24;
  }

  private updateCache(rates: any[]) {
    this.cache = {
      rates: rates.map(rate => ({
        sourceCurrency: rate.sourceCurrency,
        targetCurrency: rate.targetCurrency,
        rate: rate.rate,
        expiryDate: rate.expiryDate || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      })),
      lastUpdated: new Date().toISOString()
    };

    // Persist to storage for server restarts
    this.saveCache();
  }

  private filterRatesFromCache(sourceCurrencies: string[], targetCurrencies: string[]) {
    if (!this.cache) return [];

    return this.cache.rates.filter(rate =>
      sourceCurrencies.includes(rate.sourceCurrency) &&
      targetCurrencies.includes(rate.targetCurrency)
    );
  }

  private getDefaultRates(sourceCurrencies: string[], targetCurrencies: string[]) {
    // Basic fallback rates
    const defaultRates: { [key: string]: number } = {
      'USD-CAD': 1.35,
      'USD-EUR': 0.92,
      'USD-GBP': 0.79,
      'CAD-USD': 0.74,
      'EUR-USD': 1.09,
      'GBP-USD': 1.27
    };

    const rates = [];
    for (const source of sourceCurrencies) {
      for (const target of targetCurrencies) {
        const key = `${source}-${target}`;
        if (defaultRates[key]) {
          rates.push({
            sourceCurrency: source,
            targetCurrency: target,
            rate: defaultRates[key],
            expiryDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
          });
        }
      }
    }

    return rates;
  }

  // Load cache from disk on startup
  async loadCache() {
    try {
      const fs = await import('fs');
      if (fs.existsSync('exchange-rates-cache.json')) {
        const data = fs.readFileSync('exchange-rates-cache.json', 'utf8');
        this.cache = JSON.parse(data);
        console.log('Loaded exchange rates cache from disk');
      }
    } catch (error) {
      console.error('Error loading exchange rate cache:', error);
    }
  }

  private async saveCache() {
    try {
      const fs = await import('fs');
      fs.writeFileSync('exchange-rates-cache.json', JSON.stringify(this.cache));
    } catch (error) {
      console.error('Error saving exchange rate cache:', error);
    }
  }
}

export const exchangeRateManager = new ExchangeRateManager();

// Load cache on module initialization
exchangeRateManager.loadCache().catch(console.error);
