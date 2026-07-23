// Airframe availability moved to the economy domain (the airframe half of the
// fielding economy, beside unitAvailability/stampFieldCooldown) so installation
// teardown can stamp sortie turnaround without importing the air domain.
// Re-exported here for discoverability from the air side.
export { airAvailability, endSortie, type AirAvailability } from '../economy/economy'
