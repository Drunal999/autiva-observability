import type { BuildingId } from './cityMarketplace'

/**
 * Automations a building offers beyond what this workspace has installed.
 * `ready`: a real n8n workflow exists in AUTIVA and can be set up.
 * `planned`: designed only; the card shows its blueprint, never a run.
 * No prices and no buy button until both are real. `needs` names the tools so
 * the running cost is visible before anyone asks for it.
 */
export type CatalogItem = {
  key: string; name: string; building: BuildingId; stage: 'ready' | 'planned'
  purpose: string; audience: string; needs: string; guard?: string
  /** Industry packs this item belongs to (the "Made for your industry" row). */
  industries?: string[]
}

export const CATALOG: CatalogItem[] = [
  { key: 'ca-compliance-reminders', name: 'Compliance Reminders', building: 'finance', stage: 'planned', industries: ['CA firms'],
    purpose: 'Tracks each client’s GST, ITR, TDS and ROC due dates and reminds them at 7, 3 and 1 days, on the day and after.',
    audience: 'CA firms with many filing clients', needs: 'Google Sheets or your client list, email, WhatsApp Business API',
    guard: 'Overdue past 3 days goes to a partner, not another automatic nudge.' },
  { key: 'ca-document-chaser', name: 'Document Chaser', building: 'finance', stage: 'planned', industries: ['CA firms'],
    purpose: 'Asks clients for the documents a filing needs, tracks what is pending and follows up every 3 days.',
    audience: 'CA firms collecting papers every quarter', needs: 'Google Sheets, email, WhatsApp Business API',
    guard: 'After the third follow-up, a partner takes over.' },
  { key: 'ca-client-desk', name: 'Client Desk', building: 'support', stage: 'planned', industries: ['CA firms'],
    purpose: 'Answers client questions on WhatsApp and email with their own filing status, and qualifies new enquiries.',
    audience: 'CA firms answering the same questions daily', needs: 'Claude, Gmail, WhatsApp Business API',
    guard: 'Only replies to people who wrote first; tax advice goes to a partner.' },
  { key: 'content-studio', name: 'Content Studio', building: 'marketing', stage: 'ready',
    purpose: 'Researches a topic, drafts a post, waits for your OK, then publishes through the official LinkedIn API.',
    audience: 'Owners who want to post regularly', needs: 'Claude, LinkedIn API',
    guard: 'Nothing is posted without your approval.' },
  { key: 'ugc-ads', name: 'UGC Ad Studio', building: 'marketing', stage: 'planned',
    purpose: 'Turns a product brief into short creator-style ad videos with an AI presenter.',
    audience: 'Brands running Instagram and YouTube ads', needs: 'Claude, Higgsfield (paid per video)',
    guard: 'Every video is labelled as AI-made.' },
  { key: 'ad-reengineer', name: 'Ad Re-engineering', building: 'marketing', stage: 'planned',
    purpose: 'Studies the public ads of competitors you name and writes fresh variations for you.',
    audience: 'Businesses spending on Meta ads', needs: 'Meta Ad Library, Claude',
    guard: 'Learns what works; never copies another brand’s creative.' },
  { key: 'photo-to-reel', name: 'Photo to Reel', building: 'marketing', stage: 'planned',
    purpose: 'Turns your best photos into short reels with captions.',
    audience: 'Cafes, salons, shops with good photos', needs: 'Higgsfield (paid per video)',
    guard: 'Posted only through official APIs, after your OK.' },
  { key: 'product-shots', name: 'Product Shots', building: 'marketing', stage: 'planned',
    purpose: 'Places a plain product photo into lifestyle scenes for listings and ads.',
    audience: 'Retail and online sellers', needs: 'Higgsfield (paid per image)' },
  { key: 'callback-agent', name: 'Call-back Agent', building: 'sales', stage: 'planned',
    purpose: 'Calls back people who asked for a call, then writes the summary into your CRM.',
    audience: 'Teams with more enquiries than time', needs: 'ElevenLabs voice agent (per minute), a phone number',
    guard: 'Only calls people who asked. No cold calls: DND rules apply in India.' },
  { key: 'voice-receptionist', name: 'Voice Receptionist', building: 'support', stage: 'planned',
    purpose: 'Answers your phone, handles common questions and bookings, and hands hard calls to a person.',
    audience: 'Clinics, cafes, salons that miss calls', needs: 'ElevenLabs voice agent (per minute), a phone number' },
  { key: 'menu-onboarding', name: 'Menu Onboarding', building: 'operations', stage: 'ready',
    purpose: 'Reads a cafe’s menu and saves every item, ready to list.',
    audience: 'Cafes and restaurants', needs: 'Included' },
  { key: 'feed-liveness', name: 'Feed Liveness', building: 'operations', stage: 'ready',
    purpose: 'Every morning, checks which live cafes have posted recently and flags the quiet ones.',
    audience: 'Teams managing many venues', needs: 'Included' },
  { key: 'call-your-agent', name: 'Call Your Assistant', building: 'operations', stage: 'planned',
    purpose: 'Phone your own assistant to hear today’s status and what needs your OK.',
    audience: 'Owners away from the desk', needs: 'ElevenLabs voice agent (per minute), a phone number',
    guard: 'Read-only on the phone: approvals still happen in the app.' },
]
