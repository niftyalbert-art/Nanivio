import { googleMapsDirections } from '../../shared/malviInputTypes.ts';
export const MAPS_TOOL = {
  name: 'plan_driving_route',
  description: 'Prepare a Google Maps driving navigation link for a destination explicitly requested by the user. This does not calculate a route or travel time and does not open Maps automatically. Origin must be an explicitly supplied starting place, or an empty string so Maps asks for current location. Never use guessed, archived, IP-based or third-party private locations. User must tap the resulting link and confirm the correct place in Google Maps.',
  parametersJsonSchema: { type: 'object', additionalProperties: false,
    properties: { destination: { type: 'string', minLength: 1, maxLength: 200 }, origin: { type: 'string', maxLength: 200 } },
    required: ['destination', 'origin'] },
};
export function prepareDrivingRoute(args: unknown) {
  const a = args as { destination?: unknown; origin?: unknown };
  if (typeof a?.destination !== 'string' || typeof a.origin !== 'string') throw new Error('Provide a destination and an explicit starting place, or leave the origin empty.');
  const map = { url: googleMapsDirections(a.destination, a.origin), destination: a.destination.trim(), origin: a.origin.trim() };
  return { map, limitation: 'This is a navigation handoff, not a calculated route. Confirm destination and starting point in Google Maps; Maps determines routes, traffic and travel times. Stop safely before interacting.' };
}
