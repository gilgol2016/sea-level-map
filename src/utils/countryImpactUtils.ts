import { CountryImpact, CountryCalculatedImpact } from '../types';

/**
 * Linearly interpolates a cumulative percentage curve for a given elevation level.
 */
export function interpolateCurve(curve: { level: number; pct: number }[], level: number): number {
  if (level <= 0 || !curve || curve.length === 0) return 0;

  // If level is before or at the first point
  if (level <= curve[0].level) {
    if (curve[0].level === 0) return curve[0].pct;
    return (level / curve[0].level) * curve[0].pct;
  }

  // If level is past the highest level in the curve
  if (level >= curve[curve.length - 1].level) {
    return curve[curve.length - 1].pct;
  }

  // Find the bounding segment
  for (let i = 0; i < curve.length - 1; i++) {
    const p1 = curve[i];
    const p2 = curve[i + 1];

    if (level >= p1.level && level <= p2.level) {
      if (p2.level === p1.level) return p1.pct;
      const t = (level - p1.level) / (p2.level - p1.level);
      const interpolated = p1.pct + t * (p2.pct - p1.pct);
      return Math.min(100, Math.max(0, interpolated));
    }
  }

  return curve[curve.length - 1].pct;
}

/**
 * Calculates national inundation impact for a specific sea level.
 * Handles existential 100% submersion when seaLevel >= country.maxElevation.
 */
export function getCountryImpactStats(country: CountryImpact, seaLevel: number): CountryCalculatedImpact {
  if (seaLevel <= 0) {
    return {
      country,
      isFullySubmerged: false,
      landSubmergedPct: 0,
      popDisplacedPct: 0,
      displacedPopulation: 0,
      submergedAreaKm2: 0
    };
  }

  const isFullySubmerged = seaLevel >= country.maxElevation;
  const rawLandPct = isFullySubmerged ? 100 : interpolateCurve(country.landSubmergedCurve, seaLevel);
  const rawPopPct = isFullySubmerged ? 100 : interpolateCurve(country.popDisplacedCurve, seaLevel);

  const landSubmergedPct = parseFloat(Math.min(100, Math.max(0, rawLandPct)).toFixed(1));
  const popDisplacedPct = parseFloat(Math.min(100, Math.max(0, rawPopPct)).toFixed(1));

  const displacedPopulation = Math.min(
    country.totalPopulation,
    Math.round((popDisplacedPct / 100) * country.totalPopulation)
  );
  const submergedAreaKm2 = Math.min(
    country.totalAreaKm2,
    Math.round((landSubmergedPct / 100) * country.totalAreaKm2)
  );

  return {
    country,
    isFullySubmerged,
    landSubmergedPct,
    popDisplacedPct,
    displacedPopulation,
    submergedAreaKm2
  };
}
