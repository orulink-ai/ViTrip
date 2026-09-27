import { BedDouble, Camera, Utensils, TrainFront } from 'lucide-react';
import type { ItineraryStop } from '../shared/itinerary-map';
export function StopIcon({ kind }: { kind: ItineraryStop['kind'] }) {
  const Icon =
    kind === 'stay'
      ? BedDouble
      : kind === 'meal'
        ? Utensils
        : kind === 'transport'
          ? TrainFront
          : Camera;
  return <Icon size={14} aria-hidden="true" />;
}
