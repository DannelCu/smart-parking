export enum QueryIntent {
  CURRENT_STATE = 'CURRENT_STATE',
  HISTORY = 'HISTORY',
  UNSUPPORTED = 'UNSUPPORTED',
}

export enum QueryCapability {
  PRESENCE_LOOKUP = 'presence_lookup',
  OCCUPANCY_SUMMARY = 'occupancy_summary',
  ACTIVE_RESERVATIONS = 'active_reservations',
  AUDIT_QUERY = 'audit_query',
  BUSINESS_INSIGHTS = 'business_insights',
  ENTITY_HISTORY = 'entity_history',
}

export enum InsightType {
  TOP_CUSTOMERS = 'top_customers',
  NO_SHOWS = 'no_shows',
  BUSIEST_SPOTS = 'busiest_spots',
  CANCELLATION_RATE = 'cancellation_rate',
}

export interface QueryParams {
  ownerName?: string;
  vehiclePlate?: string;
  spotCode?: string;
  action?: 'CREATED' | 'CANCELLED' | 'ENTERED' | 'EXITED';
  startDate?: string;
  endDate?: string;
  insightType?: InsightType;
}

export interface ClassifiedQuery {
  intent: QueryIntent;
  capability: QueryCapability | null;
  params: QueryParams;
  reasoning: string;
}

export interface OrchestratorResult {
  resultType: string;
  data: unknown;
  needsDisambiguation?: boolean;
}

export interface AskResponse {
  answer: string;
  capability: QueryCapability | null;
  intent: QueryIntent;
  resultType: string;
  data: unknown;
}
