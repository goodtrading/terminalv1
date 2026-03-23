export interface DrawingProjection {
  timeToX: (time: number) => number | null;
  priceToY: (price: number) => number | null;
}

function finiteOrNull(value: number | null): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function createDrawingProjection(
  timeToCoordinate: (time: number) => number | null,
  priceToCoordinate: (price: number) => number | null
): DrawingProjection {
  return {
    timeToX: (time: number) => finiteOrNull(timeToCoordinate(time)),
    priceToY: (price: number) => finiteOrNull(priceToCoordinate(price)),
  };
}
