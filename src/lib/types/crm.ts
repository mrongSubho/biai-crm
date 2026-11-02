import { z } from 'zod';

export const LanguageEnum = z.enum(['BN_SCRIPT', 'BANGLISH', 'EN', 'MIXED', 'UNKNOWN']);
export type Language = z.infer<typeof LanguageEnum>;

export const ProgramIntentEnum = z.enum([
  'Bootcamp',
  'Fellowship',
  'Corporate Training',
  'Free Masterclass',
  'General Course',
  'Non-Sales'
]);
export type ProgramIntent = z.infer<typeof ProgramIntentEnum>;

export const TriageCategoryEnum = z.enum([
  'SALES_LEAD',
  'CRITICAL_ESCALATION',
  'SUPPORT_BILLING',
  'CAREERS_HR',
  'SPAM_SECURITY'
]);
export type TriageCategory = z.infer<typeof TriageCategoryEnum>;

export const PipelineStageEnum = z.enum([
  'New',
  'Contacted',
  'Interested',
  'Paid',
  'Lost'
]);
export type PipelineStage = z.infer<typeof PipelineStageEnum>;

export const ChannelEnum = z.enum([
  'WhatsApp',
  'Facebook Messenger',
  'Website form',
  'Phone call note',
  'Facebook comment'
]);
export type Channel = z.infer<typeof ChannelEnum>;

export const UrgencyEnum = z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);
export type Urgency = z.infer<typeof UrgencyEnum>;

export const SentimentEnum = z.enum(['POSITIVE', 'NEUTRAL', 'FRUSTRATED', 'SPAM']);
export type Sentiment = z.infer<typeof SentimentEnum>;

export const SlaStatusEnum = z.enum(['IN_SLA', 'AT_RISK', 'BREACHED', 'MET']);
export type SlaStatus = z.infer<typeof SlaStatusEnum>;

// Contact Model
export interface Contact {
  id: string;
  workspace_id: string;
  name: string;
  organization?: string | null;
  role?: string | null;
  primary_phone?: string | null;
  normalized_phone?: string | null;
  primary_email?: string | null;
  primary_channel: Channel;
  preferred_language: Language;
  is_merged: boolean;
  merged_into_id?: string | null;
  total_messages: number;
  first_seen_at: string;
  last_seen_at: string;
}

// Inbound/Outbound Message Model
export interface Message {
  id: string;
  conversation_id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  channel: Channel;
  external_message_id?: string | null;
  sender_raw: string;
  phone_raw?: string | null;
  content: string;
  detected_language: Language;
  language_confidence: number;
  received_at: string;
  delivery_status: 'RECEIVED' | 'QUEUED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
}

// Sales Opportunity Model
export interface Opportunity {
  id: string;
  workspace_id: string;
  contact_id: string;
  source_message_id: string;
  program_intent: ProgramIntent;
  pipeline_stage: PipelineStage;
  estimated_seats: number;
  estimated_value_bdt: number;
  sla_status: SlaStatus;
  sla_due_at: string;
  first_response_at?: string | null;
  assigned_user_id?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  // Join properties
  contact?: Contact;
  message?: Message;
}

// Operational Ticket Model (Non-sales queues)
export interface OperationalTicket {
  id: string;
  workspace_id: string;
  contact_id: string;
  source_message_id: string;
  queue_category: TriageCategory;
  ticket_status: 'OPEN' | 'INVESTIGATING' | 'ESCALATED' | 'RESOLVED' | 'QUARANTINED';
  urgency_level: Urgency;
  sentiment: Sentiment;
  sla_status: SlaStatus;
  sla_due_at: string;
  resolution_notes?: string | null;
  created_at: string;
  updated_at: string;
  // Join properties
  contact?: Contact;
  message?: Message;
}

// Extraction Result from AI Parser
export const ExtractionResultSchema = z.object({
  extracted_name: z.string().nullable().optional(),
  organization: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
  raw_phone: z.string().nullable().optional(),
  normalized_phone: z.string().nullable().optional(),
  detected_language: LanguageEnum,
  language_confidence: z.number().min(0).max(1),
  channel: ChannelEnum,
  program_intent: ProgramIntentEnum,
  triage_category: TriageCategoryEnum,
  urgency: UrgencyEnum,
  sentiment: SentimentEnum,
  estimated_seats: z.number().int().min(0).default(1),
  estimated_value_bdt: z.number().int().min(0).default(0),
  confidence_score: z.number().min(0).max(1),
  field_provenance: z.record(
    z.string(),
    z.object({
      value: z.any(),
      confidence: z.number(),
      source: z.enum(['regex', 'span', 'inference', 'rule'])
    })
  ),
  suggested_replies: z.object({
    primary: z.string(),
    primary_language: LanguageEnum,
    alternate: z.string(),
    alternate_language: LanguageEnum
  }),
  requires_human_review: z.boolean().default(false),
  review_reasons: z.array(z.string()).default([])
});

export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;
