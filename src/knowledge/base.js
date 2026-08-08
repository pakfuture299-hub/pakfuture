/**
 * Knowledge base for the JOB PORTAL GLOBAL recruitment chatbot.
 *
 * This module is the single source of truth for everything the bot may
 * answer. It is generated from the live content of
 * https://job-portal-global-2.myshopify.com/ (scraped 2026-07-31) plus the
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
  url: 'https://job-portal-global-2.myshopify.com/',
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
    url: 'https://job-portal-global-2.myshopify.com/products/video-watch-and-earn',
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
    url: 'https://job-portal-global-2.myshopify.com/products/assignment-writting',
    price: 'Rs.0.00',
    summary:
      'Work from home writing assignments. Choose this skill based on your interest.',
  },
  {
    id: 'content-writting',
    name: 'Content Writing',
    url: 'https://job-portal-global-2.myshopify.com/products/content-writting',
    price: 'Rs.0.00',
    summary:
      'Work from home writing content. Choose this skill based on your interest.',
  },
  {
    id: 'graphic-designer',
    name: 'Graphic Designer',
    url: 'https://job-portal-global-2.myshopify.com/products/graphic-designer',
    price: 'Rs.0.00',
    summary:
      'Work from home as a graphic designer. Choose this skill based on your interest.',
  },
  {
    id: 'travel-and-booking-support',
    name: 'Travel and Booking Support',
    url: 'https://job-portal-global-2.myshopify.com/products/travel-and-booking-support',
    price: 'Rs.0.00',
    summary:
      'Work from home providing travel and booking support. Choose this skill based on your interest.',
  },
  {
    id: 'video-editing-job',
    name: 'Video Editing Job',
    url: 'https://job-portal-global-2.myshopify.com/products/video-editing-job',
    price: 'Rs.0.00',
    summary:
      'Work from home as a video editor. Choose this skill based on your interest.',
  },
  {
    id: 'digial-marketing',
    name: 'Digital Marketing',
    url: 'https://job-portal-global-2.myshopify.com/products/digial-marketing',
    price: 'Rs.0.00',
    summary:
      'Work from home in digital marketing. Choose this skill based on your interest.',
  },
  {
    id: 'data-entry',
    name: 'Data Entry',
    url: 'https://job-portal-global-2.myshopify.com/products/data-entry',
    price: 'Rs.0.00',
    summary:
      'Work from home doing data entry. Choose this skill based on your interest.',
  },
  {
    id: 'amazon-virtual-assisstant',
    name: 'Amazon Virtual Assistant',
    url: 'https://job-portal-global-2.myshopify.com/products/amazon-virtual-assisstant',
    price: 'Rs.0.00',
    summary:
      'Work from home as an Amazon Virtual Assistant. Choose this skill based on your interest.',
  },
  {
    id: 'amazon-fba',
    name: 'Amazon FBA',
    url: 'https://job-portal-global-2.myshopify.com/products/amazon-fba',
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
 */
const TELEGRAM_HELP = {
  intro:
    'No problem — here is how to reach us on Telegram, step by step:',
  steps: [
    '1️⃣ If Telegram is blocked in your country, first install Proton VPN (free) 👉 https://protonvpn.com/download',
    '2️⃣ Install Telegram on your phone or PC 👉 https://telegram.org/dl',
    '3️⃣ New to Telegram? Watch this quick setup tutorial 👉 https://www.youtube.com/watch?v=ZYkBtYMLlM4',
    '4️⃣ Now join us directly on Telegram 👉 https://t.me/+923244362726',
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

/**
 * Sentiment / small-talk replies. Handled deterministically (no AI call) so
 * "how are you", "thanks", "bye" etc. always get a warm answer — even when
 * the OpenAI API is down or slow. Keys mirror across en/hi.
 */
const SENTIMENTS = {
  en: {
    howAreYou:
      "I'm doing great, thanks for asking! 😊 How can I help you with our online jobs today?",
    thanks:
      "You're most welcome! 😊 Anything else I can help you with — job details or applying?",
    bye:
      "Goodbye! 👋 Come back anytime if you have questions about our jobs. Have a great day!",
    goodMorning:
      'Good morning! ☀️ Welcome to JOB PORTAL GLOBAL 2. How can I help you find an online job today?',
    goodAfternoon:
      'Good afternoon! 😊 How can I help you with our online jobs today?',
    goodEvening:
      'Good evening! 🌙 How can I help you with our online jobs today?',
    ok: 'Great! 👍 Let me know if you have any questions about our jobs or want to apply.',
    intro:
      "I'm the recruitment assistant for JOB PORTAL GLOBAL 2 💼. I can tell you about our online work-from-home jobs and help you apply. Ask me anything!",
  },
  hi: {
    howAreYou:
      'Main theek hoon, shukriya poochne ke liye! 😊 Aap ko hamari online jobs ke baare mein kya jaanna hai?',
    thanks:
      'Koi baat nahi! 😊 Kya main kisi aur cheez mein madad kar sakta hoon — job details ya apply karne mein?',
    bye:
      'Allah Hafiz! 👋 Jobs ke baare mein koi sawal ho toh kabhi bhi wapas aayein. Din acha guzrein!',
    goodMorning:
      'Subah bakhair! ☀️ JOB PORTAL GLOBAL 2 mein khush aamdeed. Aaj main aap ki online job dhoondhne mein kaise madad karoon?',
    goodAfternoon:
      'Do pehar bakhair! 😊 Online jobs ke baare mein kya jaanna hai?',
    goodEvening:
      'Shaam bakhair! 🌙 Online jobs ke baare mein kya jaanna hai?',
    ok: 'Zabardast! 👍 Jobs ke baare mein koi sawal ho ya apply karna ho toh bataayein.',
    intro:
      'Main JOB PORTAL GLOBAL 2 ka recruitment assistant hoon 💼. Main aap ko hamari online ghar-baithay jobs ke baare mein bata sakta hoon aur apply karne mein madad kar sakta hoon. Kuch bhi poochein!',
  },
};

/** Conversation rule texts shared across the flow. */
const RULES = {
  shortGreeting: [
    `👋 Hi! Welcome to ${STORE.name}.`,
    `We hire daily for online work-from-home jobs 💼. Ask me about any job on the site, or let me know what you're looking for!`,
  ].join('\n\n'),
  greeting: [
    `👋 Welcome to ${STORE.name}!`,
    `We hire daily and we're glad you're here. 🎉`,
    `📢 All communication with our team happens through Telegram, so you'll need a Telegram account to complete your application and receive your task details.`,
    `Please share your details below and we'll get you started!`,
  ].join('\n\n'),
  interestPrompt:
    'If you\'re interested in this job (or any other), let me know and I\'ll walk you through applying! 😊',
  pitchIntro:
    'Before you apply, let me explain how our team works — it\'s important you know where everything happens:',
  applyAsk: 'Are you interested in applying? (Yes / No)',
  notInterested:
    'No problem at all! 😊 If you change your mind, just open the chat again and we\'ll get you started. Have a great day!',
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
  inviteLinkLine: `Join our team on Telegram to get started: ${require('../config').inviteLink}`,
  duplicate:
    'We already received your application recently. Our team will contact you on Telegram shortly — no need to apply again. 🙏',
  throttled:
    'You\'re sending messages very quickly. Please slow down a little so I can help you. 🙏',
  error:
    'Something went wrong on our side. Please try again in a moment — or contact our team on Telegram directly. 🙏',
  outOfScopeRedirect: REDIRECT_GUARDRAIL.message,
  telegramHelpIntro: TELEGRAM_HELP.intro,
};

/**
 * The "why Telegram, not WhatsApp" pitch delivered early in the apply flow.
 * The Hinglish version is the owner's original copy; the English one is the
 * equivalent for candidates who write in English.
 */
const PITCH = {
  hi: [
    `Hamara poora system aur department Telegram par shifted hai. Agar aap ko high-level earnings aur jobs chahiye, toh aap ko Telegram account banana parega.`,
    `Agar aap ko Telegram ka idea nahi hai, toh main wazeh kar doon ke Telegram ek bohot hi professional business platform hai. Yahan bari-bari companies aur professional departments shifted hain, jin ke bade Channels aur Groups par hazaron nahi balkey lakhon job holders add hain. Hamara system bhi bilkul aisa hi hai.`,
    `Agar aap ke zehan mein aata hai ke WhatsApp par yeh kaam kyun nahi ho sakta, toh main batata chaloon ke WhatsApp heavy business operations ke liye design hi nahi hua. WhatsApp bade departments aur un ke heavy workload ko handle nahi kar sakta aur us ka server/account ban ho jata hai.`,
  ].join('\n\n'),
  en: [
    `Our entire system and department has moved to Telegram. If you want high-level earnings and jobs, you'll need a Telegram account.`,
    `If you're not familiar with Telegram, it's a very professional business platform. Big companies and professional departments run there, with thousands — not hundreds — of job holders in their channels and groups. Our system works the same way.`,
    `You might wonder why this can't be done on WhatsApp. WhatsApp simply isn't designed for heavy business operations — it can't handle large departments and heavy workloads, and accounts/servers get banned.`,
  ].join('\n\n'),
};

/**
 * Hinglish (Roman Urdu) variants of the flow rules, used when the candidate
 * writes in Roman Urdu/Hinglish. Keys mirror RULES.
 */
const RULES_HI = {
  shortGreeting: [
    `👋 Assalam-o-Alaikum! ${STORE.name} mein khush aamdeed!`,
    `Hum rozana online ghar-baithay jobs ke liye bharti karte hain 💼. Kisi bhi job ke baare mein poochein, ya bataayein ke aap kya dhoondh rahe hain!`,
  ].join('\n\n'),
  greeting: [
    `👋 ${STORE.name} mein khush aamdeed!`,
    `Hum rozana online ghar-baithay jobs ke liye bharti karte hain. 🎉`,
    `📢 Hamari saari communication Telegram par hoti hai, is liye aap ko Telegram account ki zaroorat hogi application complete karne aur task details lene ke liye.`,
    `Neeche apni details share karein aur hum shuru karte hain!`,
  ].join('\n\n'),
  interestPrompt:
    'Agar aap is job (ya kisi aur) mein interested hain, toh mujhe bataayein — main apply karne ka poora tareeqa samjha doonga! 😊',
  pitchIntro:
    'Apply karne se pehle, main samjha doon ke hamari team kaise kaam karti hai — ye jaanna zaroori hai:',
  applyAsk: 'Kya aap apply karne mein interested hain? (Haan / Nahi)',
  noTelegramGuide: [
    `Agar Telegram nahi hai toh koi masla nahi — setup karne ke liye ye steps follow karein:`,
    `1️⃣ Agar Telegram aap ke mulk mein block hai, toh pehle Proton VPN (free) install karein 👉 https://protonvpn.com/download`,
    `2️⃣ Telegram app install karein 👉 https://telegram.org/dl`,
    `3️⃣ Setup tutorial dekhein 👉 https://www.youtube.com/watch?v=ZYkBtYMLlM4`,
  ].join('\n'),
  notInterested:
    'Koi masla nahi! 😊 Agar kabhi dil kare, toh dobara chat khol lein aur hum shuru kar denge. Allah Hafiz!',
  askName: 'Apna poora naam share karein taake application shuru ho. 📝',
  askPhone:
    'Bohat acha! Ab apna active contact number bhejein (sirf digits, masalan 03001234567). 📱',
  askTelegram:
    'Almost ho gaya! Apna Telegram username (masalan @username) YA Telegram par registered mobile number bhejein (masalan 03001234567). ✈️',
  nameInvalid:
    'Mazrat, ye naam sahi nahi laga. Letters mein poora naam bhejein (2–80 characters). 📝',
  phoneInvalid:
    'Ye number sahi nahi laga. Sirf digits mein valid number bhejein (masalan 03001234567, +923001234567). 📱',
  telegramInvalid:
    'Ye Telegram username/number sahi nahi laga. @ se shuru hone wala username (masalan @john) ya registered number bhejein. ✈️',
  confirmHeader: 'Apni details confirm karein: ✅',
  confirmPrompt:
    'Submit karne ke liye ✅ Haan likhein, ya change karne ke liye field ka naam batayein (Naam / Phone / Telegram).',
  submitted: [
    `🎉 Shukriya! Aap ki application mil gayi hai.`,
    `Hamari team jald hi aap ko Telegram par next steps aur task details bhejegi.`,
    `Yakeeni banayein ke aap ka Telegram ready hai taake hamara message miss na ho!`,
  ].join('\n\n'),
  inviteLinkLine: `Hamaari team se judne ke liye Telegram par aayein: ${require('../config').inviteLink}`,
  duplicate:
    'Aap ki application humein pehle hi mil chuki hai. Hamari team jald hi Telegram par rabta karegi — dobara apply karne ki zaroorat nahi. 🙏',
  throttled:
    'Aap bohat tezi se messages bhej rahe hain. Zara aaram se — main madad kar raha hoon. 🙏',
  error:
    'Hamari taraf se kuch masla ho gaya. Ek minute baad dobara try karein — ya team ko Telegram par directly contact karein. 🙏',
  outOfScopeRedirect:
    'Main sirf hamari jobs aur applications mein madad kar sakta hoon. Kisi aur cheez ke liye website par tafseelat dekhein 👉 ' +
    STORE.url,
  telegramHelpIntro: TELEGRAM_HELP.intro,
  done:
    'Aap ki application already submit ho chuki hai — hamari team jald hi Telegram par rabta karegi. 🎉',
};

module.exports = {
  STORE,
  JOBS,
  FAQ,
  TELEGRAM_HELP,
  REDIRECT_GUARDRAIL,
  RULES,
  RULES_HI,
  PITCH,
  SENTIMENTS,
};
