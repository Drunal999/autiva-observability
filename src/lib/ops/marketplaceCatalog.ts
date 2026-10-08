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
  { key: 'content-drafts', name: 'Content Drafts', building: 'marketing', stage: 'ready',
    purpose: 'Picks a topic, researches it and drafts a post, learning from drafts you rejected before.',
    audience: 'Owners who want to post regularly', needs: 'Claude',
    guard: 'Every draft waits for your approval.' },
  { key: 'content-publish', name: 'Content Publishing', building: 'marketing', stage: 'ready',
    purpose: 'Publishes the drafts you approved through the official LinkedIn API and confirms they went live.',
    audience: 'Owners who already write their posts', needs: 'LinkedIn API',
    guard: 'Only approved drafts are posted.' },
  { key: 'ca-notice-reader', name: 'Notice Reader', building: 'legal', stage: 'planned', industries: ['CA firms'],
    purpose: 'Reads an Income Tax or GST notice the moment it lands, and gives the partner the section, demand, reply-by date and documents needed.',
    audience: 'CA firms handling notices for many clients', needs: 'Claude, Gmail (or a notice upload)',
    guard: 'Never replies to the department; the partner decides and signs.' },
  { key: 'ca-gst-recon', name: 'GSTR-2B Reconciliation', building: 'finance', stage: 'planned', industries: ['CA firms'],
    purpose: 'Matches the client’s purchase register against GSTR-2B and lists missing, extra and mismatched invoices before the return.',
    audience: 'CA firms filing monthly GST', needs: 'GSTR-2B JSON from the GST portal, the purchase register',
    guard: 'Lists mismatches only; never files a return or claims credit.' },
  { key: 'ca-bank-ledger', name: 'Bank Statement to Ledger', building: 'finance', stage: 'planned', industries: ['CA firms'],
    purpose: 'Turns a bank statement PDF into categorised entries, flags the unclear ones and prepares an import for your accounting software.',
    audience: 'CA firms doing bookkeeping for small clients', needs: 'Claude, your accounting software’s import format',
    guard: 'Nothing is posted to the books until someone reviews it.' },
  { key: 'ca-client-update', name: 'Monthly Client Update', building: 'support', stage: 'planned', industries: ['CA firms'],
    purpose: 'Sends each client one message a month: what was filed, what is pending from them, and fees due.',
    audience: 'CA firms that want fewer “what’s the status?” calls', needs: 'Google Sheets, email, WhatsApp Business API',
    guard: 'One message a month, only to existing clients; the partner sees the batch first.' },
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

/**
 * Packages bundle parts that work well together. Every part is also offered
 * on its own, so a business takes the whole package or only what it needs.
 * No prices until pricing is real.
 */
export type Package = { id: string; name: string; pitch: string; keys: string[] }

export const PACKAGES: Package[] = [
  { id: 'ca-suite', name: 'CA Firm Suite', pitch: 'Deadlines, documents, notices, GST, books and client updates: the whole practice.',
    keys: ['ca-compliance-reminders', 'ca-document-chaser', 'ca-client-desk', 'ca-notice-reader', 'ca-gst-recon', 'ca-bank-ledger', 'ca-client-update'] },
  { id: 'ca-starter', name: 'CA Starter', pitch: 'The three that cut the most “what’s pending?” calls.',
    keys: ['ca-compliance-reminders', 'ca-document-chaser', 'ca-client-update'] },
  { id: 'content', name: 'Content Package', pitch: 'Drafts written for you, then published once you approve.',
    keys: ['content-drafts', 'content-publish'] },
  { id: 'creative', name: 'Creative Package', pitch: 'Ads, reels and product shots from one brief.',
    keys: ['ugc-ads', 'ad-reengineer', 'photo-to-reel', 'product-shots'] },
  { id: 'voice', name: 'Voice Package', pitch: 'Your phone answered, call-backs made, and your assistant one call away.',
    keys: ['voice-receptionist', 'callback-agent', 'call-your-agent'] },
]
