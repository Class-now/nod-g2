// Builds eval/triage-set.json: 50 fictional inbox messages with a hand-set label
// "needs a personal reply today" (true/false). Deterministic, so anyone can rebuild it.
import fs from 'node:fs';

const needs = [
  ['Dana Whitfield', 'Contract redlines - need your OK by 3pm', 'Legal sent back the redlines. Two changes. I need your OK before I send it back at 3pm.'],
  ['Kenji Mori', 'Can we move Thursday sync?', 'Something came up Thursday morning. Could we move our 10:00 to the afternoon?'],
  ['Priya Natarajan', 'Feedback on candidate today?', 'Could you send your feedback on Sam by end of day? Yes/no plus one line is enough.'],
  ['Laura Chen', 'Dinner Saturday?', 'Dinner at our place Saturday around 7. Can you make it?'],
  ['Omar Haddad', 'Budget number for Q1', 'Finance needs your team\'s Q1 headcount number by tomorrow noon. What should I put?'],
  ['Mia Rossi', 'Quick question on the deck', 'Should slide 4 use the old pricing or the new one? Presenting in an hour.'],
  ['Alex Kim', 'Are you joining the offsite?', 'Need final numbers for the offsite by Friday. Are you in?'],
  ['Sofia Alvarez', 'Intro: Sofia <> Jordan', 'Jordan runs ops at Lumen and wants to compare notes on hiring. Would you be open to a call?'],
  ['Ben Carter', 'Approve PTO Dec 22-29?', 'Requesting PTO Dec 22-29. Could you approve in the tool or reply here?'],
  ['Hana Sato', 'Which venue?', 'Two options for the launch: the rooftop (cheaper) or the gallery (bigger). Which do you prefer?'],
  ['Leo Martin', 'Invoice 2231 - wrong amount?', 'We were billed $4,800 but the quote said $4,200. Can you confirm which is right?'],
  ['Grace Liu', 'Reference for Tom', 'Tom listed you as a reference. Could you share two sentences on working with him?'],
  ['Ivan Petrov', 'Server migration window', 'Can we take the API down Sunday 2-4am for the migration? Need a yes before Thursday.'],
  ['Nora Fischer', 'Your talk title?', 'We print the program tomorrow. What title should we use for your talk?'],
  ['Sam Lee', 'Following up on the offer', 'Just checking whether you had a chance to look at the offer letter. Any questions?'],
  ['Yuki Tanaka', 'Lunch tomorrow?', 'In your area tomorrow, lunch at 12:30?'],
  ['Chris Moore', 'Sign-off on the release notes', 'Release notes attached. Can you sign off so we ship at 5?'],
  ['Amara Okafor', 'Panel moderator?', 'Would you moderate the AI panel on Dec 4? 45 minutes, remote is fine.'],
  ['Pat Quinn', 'Rent renewal', 'Your lease renews Jan 1. Please confirm whether you\'ll renew by Dec 1.'],
  ['Mum', 'Flights for Christmas', 'Did you book your flights yet? Let me know your arrival time so Dad can pick you up.'],
  ['Elena Ruiz', 'Can you cover my 1:1s?', 'I\'m out sick. Could you cover my two 1:1s this afternoon?'],
  ['Tom Becker', 'Pick a date for the review', 'Options for the design review: Tue 11, Wed 3, Thu 10. Which works?'],
];
const no = [
  ['GitHub', '[nod] CI passed on main', 'All checks have passed.'],
  ['Airline', 'Your boarding pass for DXB -> NRT', 'Your boarding pass is attached.'],
  ['Weekly Digest', 'This week in wearables', 'Top stories from the week.'],
  ['Calendar', 'Updated: Design sync @ 14:00', 'Location changed to Room 4B.'],
  ['Stripe', 'Your receipt from Acme Cloud', 'Receipt #1932. Amount paid $29.00.'],
  ['Slack', 'You have 3 new mentions', 'See what you missed in #general.'],
  ['Jira', '[PROJ-221] status changed to Done', 'Ben moved PROJ-221 to Done.'],
  ['Google Docs', 'Mia commented on "Q1 plan"', '"Looks good to me" - Mia.'],
  ['LinkedIn', 'You appeared in 12 searches', 'See who is looking at your profile.'],
  ['Amazon', 'Your package was delivered', 'Delivered to front door.'],
  ['Bank', 'Your statement is ready', 'Your November statement is available.'],
  ['Newsletter', 'The Batch: new models this week', 'This week in AI.'],
  ['HR', 'Reminder: benefits enrollment closes Dec 15', 'No action needed if you already enrolled.'],
  ['Dana Whitfield', 'FYI - signed copy attached', 'Signed copy for your records, no action needed.'],
  ['Kenji Mori', 'Notes from today', 'Notes from today\'s sync are in the doc. Nothing needed from you.'],
  ['Zoom', 'Cloud recording is now available', 'Your recording of "Design sync" is ready.'],
  ['Figma', 'Hana invited you to "Launch"', 'You can now view the file.'],
  ['Uber', 'Your Tuesday evening trip', 'Thanks for riding. Total $18.40.'],
  ['Notion', 'Weekly summary', '5 pages were edited in your workspace.'],
  ['Medium', 'Stories for you', 'Five reads picked for you.'],
  ['IT', 'Scheduled maintenance Saturday', 'Email may be slow between 1 and 3am.'],
  ['Alex Kim', 'Thanks!', 'Thanks for the help yesterday, all sorted now.'],
  ['Conference', 'Your ticket for DevSummit', 'Show this QR code at the door.'],
  ['Spotify', 'Your 2026 Wrapped is here', 'See your year in music.'],
  ['Security', 'New sign-in on Mac', 'If this was you, you can ignore this email.'],
  ['Team', 'Office closed Dec 25', 'Happy holidays!'],
  ['Recruiter Bot', 'Jobs you may like', '12 new jobs match your profile.'],
  ['Laura Chen', 'Photos from Saturday', 'Here are the photos!'],
];
const out = [];
let i = 0;
const mk = (arr, label) => arr.forEach(([from, subject, body]) => out.push({ id: 'e' + (++i), from, fromEmail: from.toLowerCase().replace(/\W+/g, '.') + '@mail.example', subject, body, received: `2026-11-25T${String(7 + (i % 10)).padStart(2, '0')}:${String((i * 7) % 60).padStart(2, '0')}:00+04:00`, label }));
mk(needs, true); mk(no, false);
// interleave by time so "newest first" is a fair baseline
out.sort((a, b) => (a.received < b.received ? 1 : -1));
fs.writeFileSync(new URL('./triage-set.json', import.meta.url), JSON.stringify(out, null, 1));
console.log(out.length, 'messages,', out.filter(x => x.label).length, 'need a reply');
