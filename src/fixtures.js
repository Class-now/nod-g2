// Demo data for `?demo=1` (and for judges running only the simulator).
// The people, companies and threads are fictional. The briefs and replies below are
// what the backend's Claude prompt returned for these threads; in demo mode they are
// used as-is so the app works with no backend and no keys.

export const NOW = '2026-11-25T13:42:00+04:00';

export const inbox = [
  {
    id: 't1',
    from: 'Dana Whitfield',
    fromEmail: 'dana@northwind.example',
    subject: 'Contract redlines - need your OK by 3pm',
    received: '2026-11-25T13:05:00+04:00',
    needsReply: true,
    priority: 3,
    body: `Hi,\n\nLegal sent back the redlines on the Northwind renewal. Two changes: payment terms go from net-30 to net-45, and the liability cap moves to 12 months of fees. I'm fine with both but need your OK before I send it back at 3pm today.\n\nThanks,\nDana`,
    brief: {
      summary: [
        'Northwind renewal redlines are back from legal.',
        'Changes: net-30 -> net-45, liability cap = 12 months.',
        'Dana is fine with both, sends at 3pm.',
      ],
      ask: 'Your OK on both changes before 3pm',
      replies: [
        'Both changes are OK - go ahead and send.',
        'OK on the cap, push back on net-45.',
        'Hold until we talk at 2:30.',
      ],
    },
  },
  {
    id: 't2',
    from: 'Kenji Mori',
    fromEmail: 'kenji@fieldlab.example',
    subject: 'Can we move Thursday sync?',
    received: '2026-11-25T12:51:00+04:00',
    needsReply: true,
    priority: 2,
    body: `Hey - something came up Thursday morning. Could we move our 10:00 sync to the afternoon? Anything after 2 works for me.\n\nKenji`,
    brief: {
      summary: [
        'Kenji has a conflict Thursday morning.',
        'Wants to move the 10:00 sync to the afternoon.',
        'Anything after 2pm works for him.',
      ],
      ask: 'A new time on Thursday after 2pm',
      replies: [
        'Sure - Thursday 3pm works.',
        'Thursday is full; Friday 10am?',
        'Let\'s skip this week and catch up Monday.',
      ],
    },
  },
  {
    id: 't3',
    from: 'Priya Natarajan',
    fromEmail: 'priya@hirewell.example',
    subject: 'Feedback on candidate (Sam L.) today?',
    received: '2026-11-25T11:20:00+04:00',
    needsReply: true,
    priority: 2,
    body: `Hi! Could you send your feedback on Sam's interview by end of day? The panel meets tomorrow morning. A yes/no plus one line is enough.\n\nPriya`,
    brief: {
      summary: [
        'Recruiter needs your feedback on Sam L.',
        'Panel meets tomorrow morning.',
        'A yes/no plus one line is enough.',
      ],
      ask: 'Yes/no on Sam + one line, by end of day',
      replies: [
        'Yes - strong on systems design, hire.',
        'No - not enough depth for senior.',
        'Will send detailed notes by 6pm.',
      ],
    },
  },
  {
    id: 't4',
    from: 'Laura Chen',
    fromEmail: 'laura@studio9.example',
    subject: 'Dinner Saturday?',
    received: '2026-11-25T09:58:00+04:00',
    needsReply: true,
    priority: 1,
    body: `We're doing dinner at our place Saturday around 7. Can you make it? Bring nothing!\n\nL`,
    brief: {
      summary: [
        'Laura is hosting dinner Saturday around 7.',
        'Asks if you can come; nothing to bring.',
        '',
      ],
      ask: 'Can you come Saturday 7pm?',
      replies: [
        'Yes, I\'ll be there - thank you!',
        'Can\'t this Saturday, sorry - next time.',
        'Probably! Confirm by Friday.',
      ],
    },
  },
  {
    id: 't5',
    from: 'GitHub',
    fromEmail: 'noreply@github.example',
    subject: '[nod] CI passed on main',
    received: '2026-11-25T13:30:00+04:00',
    needsReply: false,
    priority: 0,
    body: 'All checks have passed.',
  },
  {
    id: 't6',
    from: 'Airline',
    fromEmail: 'news@fly.example',
    subject: 'Your boarding pass for DXB -> NRT',
    received: '2026-11-25T08:10:00+04:00',
    needsReply: false,
    priority: 0,
    body: 'Your boarding pass is attached.',
  },
  {
    id: 't7',
    from: 'Weekly Digest',
    fromEmail: 'digest@news.example',
    subject: 'This week in wearables',
    received: '2026-11-25T07:00:00+04:00',
    needsReply: false,
    priority: 0,
    body: 'Top stories...',
  },
  {
    id: 't8',
    from: 'Calendar',
    fromEmail: 'calendar-notification@google.example',
    subject: 'Updated: Design sync @ 14:00',
    received: '2026-11-25T12:00:00+04:00',
    needsReply: false,
    priority: 0,
    body: 'Location changed to Room 4B.',
  },
];

export const nextMeeting = {
  title: 'Design sync',
  start: '2026-11-25T14:00:00+04:00',
  where: 'Room 4B',
  people: ['Kenji Mori', 'Ava Brooks', '+3'],
  related: { threadId: 't2', note: 'also wants to move Thursday\'s sync.' },
};

// What the voice path returns in demo mode (the glasses mic is not available in the
// simulator, so the demo plays a fixed transcript through the same code path).
export const demoVoice = {
  t1: {
    heard: 'tell her both are fine but cc legal on the final',
    reply: 'Both changes are fine - please send it, and cc Legal on the final version.',
  },
  t2: {
    heard: 'thursday works but after three',
    reply: 'Thursday works - anytime after 3pm. Send me an invite?',
  },
  t3: {
    heard: 'yes hire him great on design weaker on testing',
    reply: 'Yes, hire. Great on systems design; a bit weaker on testing.',
  },
  t4: {
    heard: 'yes and I will bring dessert anyway',
    reply: 'Yes, I\'ll be there - and I\'m bringing dessert anyway!',
  },
};
