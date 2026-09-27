import { createContext } from 'react';
import type { ItineraryStop } from '../shared/itinerary-map';
/** Business action supplied by the itinerary owner; portals retain this context. */
export const MapDiscussion = createContext<((stop: ItineraryStop) => void) | undefined>(undefined);
