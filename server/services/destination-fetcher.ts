import axios from "axios";
import https from "https";
import { db } from "../db";
import { destinations, type InsertDestination } from "@shared/schema";
import { eq } from "drizzle-orm";

export class DestinationFetcher {
  private axiosInstance;

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: "https://api.viator.com/partner",
      timeout: 60000,
    });

    // Use interceptor to remove Accept-Language headers AFTER all processing
    this.axiosInstance.interceptors.request.use(
      (config) => {
        // Remove any Accept-Language headers that might be automatically added
        if (config.headers) {
          delete config.headers["Accept-Language"];
          delete config.headers["accept-language"];
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      },
    );
  }

  /**
   * Fetch all destinations from Viator API and store in database
   * This should be run once to populate the database with ~3,300 destinations
   */
  async fetchAndStoreAllDestinations(): Promise<{
    success: boolean;
    count: number;
    message: string;
  }> {
    console.log("🌍 Starting one-time fetch of ALL Viator destinations...");

    try {
      const apiKey = process.env.VIATOR_API_KEY;
      if (!apiKey) {
        throw new Error("VIATOR_API_KEY not found in environment variables");
      }

      console.log("📡 Making direct HTTPS call to fetch all destinations...");

      // Use native Node.js HTTPS module to avoid axios header issues
      const responseData = await this.makeDirectHttpsRequest(apiKey);

      const rawDestinations = responseData?.destinations || [];
      console.log(
        `📥 Received ${rawDestinations.length} raw destinations from Viator`,
      );

      if (rawDestinations.length === 0) {
        return {
          success: false,
          count: 0,
          message: "No destinations received from API",
        };
      }

      // Process and filter destinations
      const processedDestinations: InsertDestination[] = rawDestinations
        .filter((dest: any) => {
          return (
            dest.destinationId &&
            (dest.destinationName || dest.name) &&
            dest.selectable !== false
          );
        })
        .map((dest: any) => ({
          id: dest.destinationId,
          name: dest.destinationName || dest.name,
          country: this.extractCountry(dest.destinationName || dest.name),
          region: this.extractRegion(dest.destinationName || dest.name),
          coordinates: dest.coordinates || null,
          isActive: true,
        }))
        .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name));

      console.log(
        `🔧 Processed ${processedDestinations.length} valid destinations`,
      );

      // Check if destinations already exist in database
      const existingCount = await db.$count(destinations);

      if (existingCount > 0) {
        console.log(
          `📋 Found ${existingCount} existing destinations in database`,
        );

        // Update existing destinations instead of inserting duplicates
        let updateCount = 0;
        for (const dest of processedDestinations) {
          try {
            await db
              .insert(destinations)
              .values(dest)
              .onConflictDoUpdate({
                target: destinations.id,
                set: {
                  name: dest.name,
                  country: dest.country,
                  region: dest.region,
                  coordinates: dest.coordinates,
                  isActive: dest.isActive,
                  lastUpdated: new Date(),
                },
              });
            updateCount++;
          } catch (error) {
            console.warn(
              `⚠️ Failed to upsert destination ${dest.id}: ${dest.name}`,
            );
          }
        }

        console.log(`✅ Updated/inserted ${updateCount} destinations`);
        return {
          success: true,
          count: updateCount,
          message: `Successfully updated ${updateCount} destinations in database`,
        };
      } else {
        // Insert all destinations in batches
        const batchSize = 100;
        let insertedCount = 0;

        for (let i = 0; i < processedDestinations.length; i += batchSize) {
          const batch = processedDestinations.slice(i, i + batchSize);
          try {
            await db.insert(destinations).values(batch);
            insertedCount += batch.length;
            console.log(
              `📝 Inserted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(processedDestinations.length / batchSize)}: ${insertedCount}/${processedDestinations.length} destinations`,
            );
          } catch (error) {
            console.error(
              `❌ Failed to insert batch starting at index ${i}:`,
              error,
            );
          }
        }

        console.log(
          `🎉 Successfully inserted ${insertedCount} destinations into database!`,
        );

        // Verify Hawaii destinations are included
        const hawaiiDestinations = await db
          .select()
          .from(destinations)
          .where(eq(destinations.name, "Hawaii"))
          .limit(10);

        console.log(
          `🏝️ Hawaii destinations found: ${hawaiiDestinations.length}`,
        );

        return {
          success: true,
          count: insertedCount,
          message: `Successfully inserted ${insertedCount} destinations into database`,
        };
      }
    } catch (error) {
      console.error("❌ Failed to fetch and store destinations:", error);
      return {
        success: false,
        count: 0,
        message: `Failed to fetch destinations: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  /**
   * Get all destinations from database
   */
  async getAllDestinations() {
    return await db
      .select()
      .from(destinations)
      .where(eq(destinations.isActive, true));
  }

  /**
   * Get destination count from database
   */
  async getDestinationCount() {
    return await db.$count(destinations, eq(destinations.isActive, true));
  }

  /**
   * Extract country from destination name
   */
  private extractCountry(name: string): string | null {
    if (!name) return null;

    // Common patterns: "City, Country" or "City, State, Country"
    const parts = name.split(",").map((p) => p.trim());
    if (parts.length >= 2) {
      return parts[parts.length - 1]; // Last part is usually country
    }

    return null;
  }

  /**
   * Extract region from destination name/country
   */
  private extractRegion(name: string): string | null {
    if (!name) return null;

    const country = this.extractCountry(name)?.toLowerCase();
    if (!country) return null;

    // Simple region mapping
    const regionMap: { [key: string]: string } = {
      usa: "North America",
      "united states": "North America",
      canada: "North America",
      mexico: "North America",
      japan: "Asia",
      china: "Asia",
      india: "Asia",
      thailand: "Asia",
      singapore: "Asia",
      france: "Europe",
      italy: "Europe",
      spain: "Europe",
      germany: "Europe",
      "united kingdom": "Europe",
      uk: "Europe",
      england: "Europe",
      australia: "Oceania",
      "new zealand": "Oceania",
      brazil: "South America",
      argentina: "South America",
      chile: "South America",
      egypt: "Africa",
      "south africa": "Africa",
      kenya: "Africa",
      morocco: "Africa",
    };

    return regionMap[country] || "Other";
  }

  /**
   * Make direct HTTPS request to avoid axios header issues
   * Using curl-like approach with minimal headers
   */
  private async makeDirectHttpsRequest(apiKey: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: "api.viator.com",
        port: 443,
        path: "/partner/destinations",
        method: "GET",
        headers: {
          Accept: "application/json;version=2.0",
          "Accept-Language": "en-US",
          "exp-api-key": apiKey,
          "User-Agent": "curl/7.68.0",
          Host: "api.viator.com",
        },
      };

      const req = https.request(options, (res) => {
        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          try {
            if (res.statusCode === 200) {
              const jsonData = JSON.parse(data);
              console.log(`✅ Direct HTTPS call successful: ${res.statusCode}`);
              resolve(jsonData);
            } else {
              console.error(`❌ Direct HTTPS call failed: ${res.statusCode}`);
              console.error(`Response: ${data}`);
              reject(new Error(`HTTP ${res.statusCode}: ${data}`));
            }
          } catch (error) {
            console.error("❌ Failed to parse response JSON:", error);
            reject(error);
          }
        });
      });

      req.on("error", (error) => {
        console.error("❌ HTTPS request error:", error);
        reject(error);
      });

      req.setTimeout(60000, () => {
        req.destroy();
        reject(new Error("Request timeout"));
      });

      req.end();
    });
  }
}

export const destinationFetcher = new DestinationFetcher();
