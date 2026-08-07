/**
 * Knowledge base for the JOB PORTAL GLOBAL recruitment chatbot.
 *
 * This module is the single source of truth for everything the bot may
 * answer. It is generated from the live content of
 * https://job-portal-global.myshopify.com/ (scraped 2026-07-31) plus the
 * conversational rules defined by the product owner.
 *
 * Everything the bot can say is either:
 *   - a rule below (greeting, Telegram help, guardrails, submission), or
 *   - a fact from this knowledge base (jobs, pricing, how to apply, reviews).
 *
 * The model is instructed (in openai.js) to answer ONLY from this
 * knowledge base and to refuse anything outside it. The `redirect_url` is
 * returned for out-of-scope questions so the candidate can be redirected to
 * the website instead.
 */

const STORE = {
  name: 'JOB PORTAL GLOBAL 2',
  url: 'https://job-portal-global.myshopify.com/',
  tagline:
    '🚀 Online Jobs Available — Join Us Now — Hurry Up! Limited Seats Available 🚀',
  currency: 'PKR',
  mission:
    'Our mission is simple – to empower every individual by providing reliable online jobs and financial independence.',
  whyChooseUs: [
    '500+ Active Earners — trusted by hundreds worldwide',
    'Flexible Work Options — choose your hours',
    '24/7 Support — always here to help',
    'Secure Payment — safe and timely payout',
  ],
};

/**
 * The 10 job categories listed on the store homepage.
 * Only factual details captured from the site are included.
 */
const JOBS = [
  {
    id: 'video-watch-and-earn',
    name: 'Video Watch and Earn',
    url: 'https://job-portal-global.myshopify.com/products/video-watch-and-earn',
    price: 'Rs.0.00',
    summary:
      'Watch sponsored ads and short videos on your phone to earn money. International brand ads need promotion and they hire workers for it.',
    tasks: [
      'Watch sponsored ads and short videos daily',
      'Mark each ad as "Complete" in the system after watching',
      'Check your daily rewards on the dashboard',
    ],
    requirements: [
      'No specific education required — just know how to use a smartphone',
      'A good internet connection and 1–2 hours per day',
      'Open to all ages — men and women (students/housewives) can apply',
    ],
    whyJoin: [
      'Zero Investment — no registration fees',
      'Work from Anywhere',
      'Instant Rewards — credited right after each ad',
      'Trusted Platform — works with real international brands',
    ],
    howToApply:
      'Click "Apply Now" on the website, submit your details (name, city, phone number) and the team sends task links and instructions.',
  },
  {
    id: 'assignment-writting',
    name: 'Assignment Writing',
    url: 'https://job-portal-global.myshopify.com/products/assignment-writting',
    price: 'Rs.0.00',
    summary:
      'Work from home writing assignments. Choose this skill based on your interest.',
  },
  {
    id: 'content-writting',
    name: 'Content Writing',
    url: 'https://job-portal-global.myshopify.com/products/content-writting',
    price: 'Rs.0.00',
    summary:
      'Work from home writing content. Choose this skill based on your interest.',
  },
  {
    id: 'graphic-designer',
    name: 'Graphic Designer',
    url: 'https://job-portal-global.myshopify.com/products/graphic-designer',
    price: 'Rs.0.00',
    summary:
      'Work from home as a graphic designer. Choose this skill based on your interest.',
  },
  {
    id: 'travel-and-booking-support',
    name: 'Travel and Booking Support',
    url: 'https://job-portal-global.myshopify.com/products/travel-and-booking-support',
    price: 'Rs.0.00',
    summary:
      'Work from home providing travel and booking support. Choose this skill based on your interest.',
  },
  {
    id: 'video-editing-job',
    name: 'Video Editing Job',
    url: 'https://job-portal-global.myshopify.com/products/video-editing-job',
    price: 'Rs.0.00',
    summary:
      'Work from home as a video editor. Choose this skill based on your interest.',
  },
  {
    id: 'digial-marketing',
    name: 'Digital Marketing',
    url: 'https://job-portal-global.myshopify.com/products/digial-marketing',
    price: 'Rs.0.00',
    summary:
      'Work from home in digital marketing. Choose this skill based on your interest.',
  },
  {
    id: 'data-entry',
    name: 'Data Entry',
    url: 'https://job-portal-global.myshopify.com/products/data-entry',
    price: 'Rs.0.00',
    summary:
      'Work from home doing data entry. Choose this skill based on your interest.',
  },
  {
    id: 'amazon-virtual-assisstant',
    name: 'Amazon Virtual Assistant',
    url: 'https://job-portal-global.myshopify.com/products/amazon-virtual-assisstant',
    price: 'Rs.0.00',
    summary:
      'Work from home as an Amazon Virtual Assistant. Choose this skill based on your interest.',
  },
  {
    id: 'amazon-fba',
    name: 'Amazon FBA',
    url: 'https://job-portal-global.myshopify.com/products/amazon-fba',
    price: 'Rs.0.00',
    summary:
      'Work from home with Amazon FBA. Choose this skill based on your interest.',
  },
];

/** FAQ entries the model can answer from. */
const FAQ = [
  {
    q: 'How do I apply for a job?',
    a: 'Open the chatbot and share your details: Full Name, Contact Number, and Telegram Username OR Telegram Number. After you submit them, our team receives your application instantly and will contact you on Telegram with the task details.',
  },
  {
    q: 'Do I need to pay any fee or registration?',
    a: 'No. Our platform is 100% free to join — zero investment and no registration fees. The "Video Watch and Earn" job states this clearly, and the same applies across our categories.',
  },
  {
    q: 'Which jobs are available?',
    a: 'We currently have 10 online job categories: Video Watch and Earn, Assignment Writing, Content Writing, Graphic Designer, Travel and Booking Support, Video Editing Job, Digital Marketing, Data Entry, Amazon Virtual Assistant, and Amazon FBA.',
  },
  {
    q: 'Do I need experience or qualifications?',
    a: 'No specific education is required for most roles — for example, Video Watch and Earn only needs a smartphone, a good internet connection and 1–2 hours per day. Pick the category that matches your interest.',
  },
  {
    q: 'How much can I earn?',
    a: 'We do not publish fixed salary figures. We offer daily and weekly earning opportunities with secure, timely payouts in PKR. Contact our team on Telegram for the current details of the job you are interested in.',
  },
  {
    q: 'How and when will I get paid?',
    a: 'Our platform promises secure payment with safe and timely payout. Payments are made in PKR. Exact payout timing and method are shared with you on Telegram after you apply.',
  },
  {
    q: 'Is this platform trusted?',
    a: 'Yes. We are a trusted platform with 500+ active earners worldwide. Our members regularly leave 5-star reviews — for example: "100% Trusted platform" (Adnan), "Alhamdulilah earn handsome money" (Hassan), and "comfortable and easy to work on daily basis" (Zara).',
  },
  {
    q: 'Can students or housewives work?',
    a: 'Absolutely. Our jobs are open to all ages, men and women — students and housewives are explicitly welcome, and you can choose your own working hours (flexible work options).',
  },
  {
    q: 'What is the working time / hours?',
    a: 'Work is fully flexible — you choose your hours. Video Watch and Earn, for example, needs about 1–2 hours per day.',
  },
  {
    q: 'Is the work done from home / online?',
    a: 'Yes, all jobs are online and can be done from anywhere with a good internet connection.',
  },
  {
    q: 'What is Video Watch and Earn?',
    a: 'You watch sponsored ads and short videos from international brands and mark each as complete. Rewards are credited instantly. No education needed — just a smartphone and 1–2 hours a day.',
  },
  {
    q: 'What is Assignment Writing?',
    a: 'A work-from-home role where you write assignments for clients. Choose this skill based on your interest.',
  },
  {
    q: 'What is Content Writing?',
    a: 'A work-from-home role where you write content for clients. Choose this skill based on your interest.',
  },
  {
    q: 'What is Graphic Designer?',
    a: 'A work-from-home role where you design graphics for clients. Choose this skill based on your interest.',
  },
  {
    q: 'What is Travel and Booking Support?',
    a: 'A work-from-home role where you help clients with travel planning and booking support.',
  },
  {
    q: 'What is Video Editing Job?',
    a: 'A work-from-home role where you edit videos for clients.',
  },
  {
    q: 'What is Digital Marketing?',
    a: 'A work-from-home role where you market products and services digitally for clients.',
  },
  {
    q: 'What is Data Entry?',
    a: 'A work-from-home role where you enter and manage data for clients.',
  },
  {
    q: 'What is Amazon Virtual Assistant?',
    a: 'A work-from-home role where you support Amazon sellers with their daily operations.',
  },
  {
    q: 'What is Amazon FBA?',
    a: 'A work-from-home role where you work with Amazon FBA (Fulfillment by Amazon) operations.',
  },
  {
    q: 'Is the salary monthly?',
    a: 'We offer daily and weekly earning opportunities with secure, timely payouts in PKR. Contact us on Telegram after applying for job-specific details.',
  },
  {
    q: 'Do I need a laptop or computer?',
    a: 'No. A smartphone with a good internet connection is enough for most of our jobs (Video Watch and Earn works purely from a mobile phone).',
  },
  {
    q: 'Is this a scam?',
    a: 'No. We are a trusted platform with 500+ active earners and verified payouts. There is zero investment and no registration fee. You can also read our member reviews on the website.',
  },
  {
    q: 'I have more questions',
    a: 'The best way to get answers is to complete your application here so our team can guide you personally on Telegram.',
  },
];

/**
 * Telegram help: guide the candidate through VPN + Telegram installation,
 * then hand them off with a single direct link to our Telegram chat.
 * Nothing else — no tutorial links, no further steps.
 */
const TELEGRAM_HELP = {
  intro:
    'No problem — here is how to reach us on Telegram, step by step:',
  steps: [
    '1️⃣ If Telegram is blocked in your country, first install Proton VPN (free) 👉 https://protonvpn.com/download',
    '2️⃣ Install Telegram on your phone or PC 👉 https://telegram.org/dl',
    '3️⃣ Now join us directly on Telegram 👉 https://t.me/+923244362726',
  ],
  closing: '',
};

/**
 * The candidate-facing guardrail: everything outside the knowledge base
 * (except greetings / small talk / Telegram help / the application flow)
 * is redirected to the website.
 */
const REDIRECT_GUARDRAIL = {
  message:
    'I can only assist you with our jobs and applications. For anything else, please visit our website for complete details 👉 ' +
    STORE.url,
  url: STORE.url,
};

/** Conversation rule texts shared across the flow. */
const RULES = {
  greeting: [
    `👋 Welcome to ${STORE.name}!`,
    `We hire daily and we're glad you're here. 🎉`,
    `📢 All communication with our team happens through Telegram, so you'll need a Telegram account to complete your application and receive your task details.`,
    `Please share your details below and we'll get you started!`,
  ].join('\n\n'),
  askName: 'Please share your full name to start your application. 📝',
  askPhone:
    'Great! Now please share your active contact number (digits only, e.g. 03001234567). 📱',
  askTelegram:
    'Almost done! Please share your Telegram username (e.g. @username) OR the mobile number you registered on Telegram (e.g. 03001234567). ✈️',
  phoneInvalid:
    'That number doesn\'t look right. Please send a valid contact number with only digits (e.g. 03001234567, +923001234567, or 923001234567). 📱',
  telegramInvalid:
    'That doesn\'t look like a valid Telegram username or number. Please send your Telegram username starting with @ (e.g. @john) or the number you registered on Telegram (e.g. 03001234567). ✈️',
  confirmHeader: 'Please confirm your details: ✅',
  confirmPrompt:
    'Reply with ✅ Yes to submit, or type the field you want to change (Name / Phone / Telegram).',
  submitted: [
    '🎉 Thank you! Your application has been received.',
    'Our team will contact you on Telegram shortly with the next steps and your task details.',
    'Make sure your Telegram is ready so you don\'t miss our message!',
  ].join('\n\n'),
  duplicate:
    'We already received your application recently. Our team will contact you on Telegram shortly — no need to apply again. 🙏',
  throttled:
    'You\'re sending messages very quickly. Please slow down a little so I can help you. 🙏',
  error:
    'Something went wrong on our side. Please try again in a moment — or contact our team on Telegram directly. 🙏',
  outOfScopeRedirect: REDIRECT_GUARDRAIL.message,
  telegramHelpIntro: TELEGRAM_HELP.intro,
};

module.exports = {
  STORE,
  JOBS,
  FAQ,
  TELEGRAM_HELP,
  REDIRECT_GUARDRAIL,
  RULES,
};
