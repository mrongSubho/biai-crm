import { z } from 'zod';
import { PipelineStageEnum, ChannelEnum } from '../lib/types/crm.ts';

export const TicketStatusEnum = z.enum([
  'OPEN',
  'INVESTIGATING',
  'ESCALATED',
  'RESOLVED',
  'QUARANTINED'
]);
export type TicketStatus = z.infer<typeof TicketStatusEnum>;

export const StageTransitionSchema = z.object({
  newStage: PipelineStageEnum
});

export const TicketStatusTransitionSchema = z.object({
  newStatus: TicketStatusEnum,
  notes: z.string().optional()
});

export const OutboundReplySchema = z.object({
  replyText: z.string().min(1, 'Reply text is required and cannot be empty'),
  channel: ChannelEnum.default('WhatsApp')
});

export const ParseMessageSchema = z.object({
  content: z.string().min(1, 'Field "content" is required and cannot be empty'),
  senderRaw: z.string().optional(),
  phoneRaw: z.string().optional(),
  channel: ChannelEnum.default('WhatsApp')
});

export const EnquiryQuerySchema = z.object({
  queue: z.enum(['all', 'sales', 'support', 'escalation', 'careers', 'spam']).default('all'),
  stage: PipelineStageEnum.optional(),
  sim_time: z.string().optional()
});
