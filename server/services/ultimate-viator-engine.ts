// Minimal ultimate-viator-engine that delegates to clean engine
import { cleanRelevanceEngine } from "./clean-relevance-engine";

export interface UltimateSearchRequest {
  query: string;
  destinationId: number;
  currency?: string;
}

class UltimateViatorEngine {
  async executeUltimateSearch(request: UltimateSearchRequest) {
    console.log("🔄 Delegating to clean relevance engine");
    return await cleanRelevanceEngine.search(request);
  }
}

export const ultimateViatorEngine = new UltimateViatorEngine();
