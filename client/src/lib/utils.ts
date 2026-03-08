import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Utility functions for parsing text values
export function parseLevelStr(levelStr: string): number {
  if (!levelStr || levelStr === "--") return NaN;
  
  // Handle "k" notation (e.g., "67k" -> 67000)
  const kMatch = levelStr.match(/^(\d+(?:\.\d+)?)k$/i);
  if (kMatch) {
    return parseFloat(kMatch[1]) * 1000;
  }
  
  // Handle regular numbers
  const numMatch = levelStr.match(/^\d+(?:\.\d+)?$/);
  if (numMatch) {
    return parseFloat(numMatch[0]);
  }
  
  return NaN;
}

export function extractPriceFromText(text: string): number | null {
  if (!text || text === "--") return null;
  
  // Look for price patterns in text
  const pricePatterns = [
    /(\d{4,6}(?:\.\d+)?)/g,  // 4-6 digit numbers
    /(\d+(?:\.\d*)?)k/gi,       // k notation
  ];
  
  for (const pattern of pricePatterns) {
    const match = text.match(pattern);
    if (match && match.length > 1) {
      const price = match[1];
      if (price.includes('k')) {
        return parseFloat(price) * 1000;
      }
      return parseFloat(price);
    }
  }
  
  return null;
}

export function extractRangeFromText(text: string): { start: number; end: number } | null {
  if (!text || text === "--") return null;
  
  // Look for range patterns
  const kMatches = Array.from(text.matchAll(/(\d+\.?\d*)k/gi));
  if (kMatches.length >= 2) {
    return { 
      start: parseFloat(kMatches[0][1]) * 1000, 
      end: parseFloat(kMatches[1][1]) * 1000 
    };
  }
  
  const numMatches = Array.from(text.matchAll(/(\d{4,6}(?:\.\d+)?)/g));
  if (numMatches.length >= 2) {
    return { 
      start: parseFloat(numMatches[0][1]), 
      end: parseFloat(numMatches[1][1]) 
    };
  }
  
  return null;
}
