# Bookmap Heatmap Integration Plan

## Phase 1: Basic Canvas Integration
1. **Replace current HEATMAP overlay** with `BookmapHeatmapCanvas` component
2. **Connect real order book data** from existing `rawOrderBook` query
3. **Remove old line/label rendering** from MainChart HEATMAP section

## Phase 2: Data Connection
1. **Wire raw Binance data** to `BookmapLiquidityManager.addSnapshot()`
2. **Configure price range** to auto-adjust to current price
3. **Set appropriate bucket size** (1.0 USD for BTC)

## Phase 3: Overlay System
1. **Add wall detection** on top of canvas heatmap
2. **Implement pull/refill markers** 
3. **Add interactive controls** for configuration

## Files to Modify

### Existing Files to Change:
- `MainChart.tsx` - Replace HEATMAP section with canvas component
- `bookmapOrderBookTypes.ts` - Extend with heatmap-specific types

### New Files Created:
- `BookmapHeatmapCanvas.tsx` - Main canvas component
- `bookmapHeatmapTypes.ts` - Heatmap data structures
- `bookmapHeatmapRenderer.ts` - Canvas rendering engine
- `bookmapLiquidityManager.ts` - Historical data management

## Integration Steps

### Step 1: Replace HEATMAP in MainChart
```typescript
// Remove current HEATMAP rendering logic
// Add BookmapHeatmapCanvas component
<BookmapHeatmapCanvas 
  width={chartWidth}
  height={chartHeight}
  enabled={activePanels.has("HEATMAP")}
  onConfigChange={(config) => setHeatmapConfig(config)}
/>
```

### Step 2: Connect Real Data
```typescript
// Replace mock data with real order book
useEffect(() => {
  if (rawOrderBook && managerRef.current) {
    managerRef.current.addSnapshot(
      rawOrderBook.bids,
      rawOrderBook.asks,
      rawOrderBook.timestamp
    );
  }
}, [rawOrderBook]);
```

### Step 3: Configuration
- Add heatmap controls to LayerGroupControls
- Expose bucket size, history window, intensity settings
- Persist configuration in localStorage

## Benefits Over Current Approach

1. **True Heatmap Matrix**: Canvas-based cell rendering vs line overlay
2. **Historical Visualization**: Time-based liquidity tracking vs static snapshot
3. **Professional Appearance**: Smooth gradients and fading vs discrete labels
4. **Performance**: Optimized canvas rendering vs DOM manipulation
5. **Extensibility**: Clean separation for future overlays

## Migration Strategy

1. **Parallel Development**: Keep current HEATMAP during development
2. **Feature Flag**: Toggle between old and new implementation
3. **Gradual Rollout**: Test with small user group first
4. **Clean Cutover**: Remove old implementation once stable

## Technical Considerations

### Performance
- Canvas rendering at 60fps
- Efficient data structures (Maps for O(1) lookup)
- Automatic cleanup of old data
- Memory usage monitoring

### Data Fidelity
- Exact Binance prices preserved
- Real BTC sizes maintained
- No synthetic data generation
- Configurable aggregation only

### User Experience
- Smooth animations and transitions
- Interactive configuration
- Responsive design
- Accessibility considerations
