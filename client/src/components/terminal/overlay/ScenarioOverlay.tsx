import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { IChartApi, ISeriesApi, LineStyle } from "lightweight-charts";

// Structural scenario types
interface StructuralScenario {
  probability: number;
  title: string;
  summary: string;
  regime: string;
  trigger: string;
  target: string;
  bias: "BULLISH" | "BEARISH" | "NEUTRAL";
  triggerLevel: number | null;
  targetLevel: number | null;
}

interface MarketScenarios {
  marketRegime: string;
  baseCase: StructuralScenario;
  altCase: StructuralScenario;
  volCase: StructuralScenario;
}

// Visualization modes for different scenario types
type VisualizationMode = "MEAN_REVERSION" | "DIRECTIONAL" | "EXPANSION";

interface ScenarioOverlayProps {
  chart: IChartApi | null;
  candleSeries: ISeriesApi<"Candlestick"> | null;
  activeScenario: "BASE" | "ALT" | "VOL";
}

export function ScenarioOverlay({ chart, candleSeries, activeScenario }: ScenarioOverlayProps) {
  const priceLinesRef = useRef<any[]>([]);

  // Fetch scenario data
  const { data: scenarios } = useQuery<MarketScenarios>({
    queryKey: ["/api/scenarios"],
    refetchInterval: 5000,
  });

  // Determine visualization mode based on scenario content
  const determineVisualizationMode = (scenario: StructuralScenario, scenarioType: "BASE" | "ALT" | "VOL"): VisualizationMode => {
    const { title, summary, bias } = scenario;
    const text = (title + " " + summary).toLowerCase();
    
    if (scenarioType === "BASE") {
      // Base case defaults to mean reversion unless clearly directional
      if (text.includes("range") || text.includes("mean reversion") || text.includes("reversion") || 
          text.includes("magnet") || text.includes("compression") || text.includes("containment")) {
        return "MEAN_REVERSION";
      }
      // Default base case to mean reversion
      return "MEAN_REVERSION";
    }
    
    if (scenarioType === "ALT") {
      // Alt case is typically directional
      if (text.includes("extension") || text.includes("continuation") || text.includes("breakout") ||
          text.includes("directional") || text.includes("controlled")) {
        return "DIRECTIONAL";
      }
      // Default alt case to directional
      return "DIRECTIONAL";
    }
    
    if (scenarioType === "VOL") {
      // Vol case is typically expansion
      if (text.includes("expansion") || text.includes("acceleration") || text.includes("squeeze") ||
          text.includes("breakout") || text.includes("volatility") || text.includes("tail risk")) {
        return "EXPANSION";
      }
      // Default vol case to expansion
      return "EXPANSION";
    }
    
    return "DIRECTIONAL"; // Fallback
  };

  // Clear existing price lines
  const clearPriceLines = () => {
    priceLinesRef.current.forEach(line => {
      if (candleSeries && line) {
        candleSeries.removePriceLine(line);
      }
    });
    priceLinesRef.current = [];
  };

  // Create price line with styling
  const createPriceLine = (
    price: number,
    label: string,
    color: string,
    lineWidth: number = 1,
    lineStyle: LineStyle = LineStyle.Dashed
  ): any | null => {
    if (!candleSeries) return null;

    try {
      return candleSeries.createPriceLine({
        price,
        color,
        lineWidth: lineWidth as any,
        lineStyle,
        axisLabelVisible: true,
        title: label,
      });
    } catch (error) {
      console.error("Failed to create price line:", error);
      return null;
    }
  };

  // Create range zone (for mean reversion scenarios)
  const createRangeZone = (centerPrice: number, range: number = 1000): any[] => {
    if (!candleSeries) return [];
    
    const lines: any[] = [];
    const upperPrice = centerPrice + range;
    const lowerPrice = centerPrice - range;
    
    // Upper bound
    const upperLine = createPriceLine(upperPrice, "RANGE UPPER", "#6B7280", 1, LineStyle.Dotted);
    // Lower bound  
    const lowerLine = createPriceLine(lowerPrice, "RANGE LOWER", "#6B7280", 1, LineStyle.Dotted);
    
    if (upperLine) lines.push(upperLine);
    if (lowerLine) lines.push(lowerLine);
    
    return lines;
  };

  // Update overlays when active scenario or data changes
  useEffect(() => {
    if (!candleSeries || !scenarios) return;

    // Clear existing lines first
    clearPriceLines();

    // Get the active scenario data
    const activeScenarioData = scenarios[activeScenario.toLowerCase() as keyof MarketScenarios] as StructuralScenario;
    if (!activeScenarioData) {
      console.log(`Scenario Overlay: No data found for ${activeScenario} scenario`);
      return;
    }

    const newLines: any[] = [];
    const visualizationMode = determineVisualizationMode(activeScenarioData, activeScenario);
    
    console.log(`Scenario Overlay: ${activeScenario} - Visualization mode: ${visualizationMode}`);

    if (visualizationMode === "MEAN_REVERSION") {
      // BASE CASE - Mean Reversion Visualization
      if (activeScenarioData.targetLevel) {
        // Main magnet line
        const magnetLine = createPriceLine(
          activeScenarioData.targetLevel, 
          "MEAN REVERSION MAGNET", 
          "#6B7280", // Blue-gray, neutral
          2,
          LineStyle.Dashed
        );
        if (magnetLine) newLines.push(magnetLine);
        
        // Add range zone if appropriate
        const text = (activeScenarioData.title + " " + activeScenarioData.summary).toLowerCase();
        if (text.includes("range") || text.includes("containment")) {
          const rangeLines = createRangeZone(activeScenarioData.targetLevel, 500); // 500 range around magnet
          newLines.push(...rangeLines);
        }
      } else {
        console.log(`Scenario Overlay: No target level available for ${activeScenario} scenario`);
      }
      
    } else if (visualizationMode === "DIRECTIONAL") {
      // ALT CASE - Directional Visualization
      // Determine color based on bias
      const directionColor = activeScenarioData.bias === "BULLISH" ? "#10B981" : 
                           activeScenarioData.bias === "BEARISH" ? "#EF4444" : "#6B7280";
      
      if (activeScenarioData.targetLevel) {
        const targetLine = createPriceLine(
          activeScenarioData.targetLevel, 
          `${activeScenario} TARGET`, 
          directionColor, 
          2
        );
        if (targetLine) newLines.push(targetLine);
      }
      
      if (activeScenarioData.triggerLevel) {
        const triggerLine = createPriceLine(
          activeScenarioData.triggerLevel, 
          `${activeScenario} TRIGGER`, 
          directionColor, 
          1,
          LineStyle.Dotted
        );
        if (triggerLine) newLines.push(triggerLine);
      }
      
    } else if (visualizationMode === "EXPANSION") {
      // VOL CASE - Expansion Visualization
      if (activeScenarioData.targetLevel) {
        const targetLine = createPriceLine(
          activeScenarioData.targetLevel, 
          `${activeScenario} EXPANSION`, 
          "#F97316", // Orange
          2
        );
        if (targetLine) newLines.push(targetLine);
      }
      
      if (activeScenarioData.triggerLevel) {
        const triggerLine = createPriceLine(
          activeScenarioData.triggerLevel, 
          `${activeScenario} TRIGGER`, 
          "#F97316", 
          1,
          LineStyle.Dotted
        );
        if (triggerLine) newLines.push(triggerLine);
      }
    }

    priceLinesRef.current = newLines;

    console.log(`Scenario Overlay: Updated ${activeScenario} (${visualizationMode}) with`, newLines.length, "lines");

    // Cleanup on unmount
    return () => {
      clearPriceLines();
    };
  }, [candleSeries, scenarios, activeScenario]);

  // Cleanup on chart/series change
  useEffect(() => {
    return () => {
      clearPriceLines();
    };
  }, [candleSeries]);

  // This component doesn't render anything visible
  return null;
}
