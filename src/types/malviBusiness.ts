export interface BusinessMember { id: string; name: string }
export interface BusinessMessage { id: string; authorId: string; author: string; text: string; at: number; kind: 'idea' | 'transcript' | 'assistant' }
export interface BusinessAction { id: string; task: string; ownerId: string; completed: boolean }
export interface BusinessKnowledge { id: string; title: string; text: string; authorId: string }
export interface BusinessRoom {
  id: string; ownerId: string; topic: string; objective: string; version: number;
  members: BusinessMember[]; messages: BusinessMessage[]; actions: BusinessAction[];
  knowledge: BusinessKnowledge[]; summary: string; summaryThrough: string | null;
  meetingOpen: boolean; updatedAt: string;
}
export type BusinessCommand =
  | { type: 'message'; id: string; text: string; kind: 'idea' | 'transcript' }
  | { type: 'action'; id: string; task: string; ownerId: string }
  | { type: 'complete'; id: string; completed: boolean }
  | { type: 'knowledge'; id: string; title: string; text: string }
  | { type: 'removeKnowledge'; id: string }
  | { type: 'meeting'; open: boolean };
