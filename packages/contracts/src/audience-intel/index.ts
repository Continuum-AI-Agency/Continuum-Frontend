// Audience Intelligence — buyer-intent personas.
//
// The join of measured funnel depth per audience segment (Meta insights with
// `actions` split by an audience dimension) and the creative labels the
// paid-creative-intel pipeline already wrote for the ads that served that
// segment. Produced by Jaina's audience sub-agent in buyer-intent mode,
// rendered as checkpoint blocks, and consumed downstream to ground campaign
// construction and creative generation.

export * from './persona';
