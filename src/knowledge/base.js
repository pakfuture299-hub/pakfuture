/**
 * Knowledge base for the JOB PORTAL GLOBAL recruitment chatbot.
 *
 * SINGLE SOURCE OF TRUTH: `Job_Portal_Bot_System_Architecture.pdf` (the
 * client's "Bot System Architecture & Intent Map"). It defines 12 intents,
 * each with trigger keywords and an EXACT bot response script. This module
 * encodes that PDF verbatim: the bot must deliver these responses EXACTLY
 * (the PDF's "Execution Rule" — the AI/bot engine may only inject visual
 * emojis naturally into the dynamic generation, maintaining precise
 * phrasing).
 *
 * Everything the bot can say is either:
 *   - a rule below (greeting, apply flow steps, redirect), or
 *   - one of the PDF's 12 intents (INTENT_01..INTENT_12).
 *
 * Anything outside this knowledge base is redirected — the bot is strictly
 * grounded in this PDF, nothing else is relevant.
 */

/**
 * The 12 intents from the PDF, verbatim. `triggers` are the PDF's trigger
 * keywords (lowercased) used by the deterministic intent classifier;
 * `reply` is the EXACT response script from the PDF.
 */
const INTENTS = [
  {
    id: 'INTENT_01_WELCOME',
    name: 'Welcome / Initial Greeting',
    triggers: ['hi', 'hello', 'salam', 'assalam o alaikum', 'hey', 'start', 'info', 'details'],
    reply:
      'Welcome to Job Portal Global! 🌐\n' +
      'Hum ek centralized remote platform hain jahan aap ko daily basis par verified online jobs faraham ki jaati hain. Aap ghar baithe mobile ya laptop se fully remote work kar sakte hain. 💻📱',
  },
  {
    id: 'INTENT_02_AVAILABLE_JOBS',
    name: 'Available Jobs Inquiry',
    triggers: [
      'konsi konsi jobs hain', 'konsi job hai', 'kaun sa kaam hai', 'jobs list', 'available jobs',
      'vacancies', 'kis tarah ka kaam hai', 'kitni jobs hain', 'job categories', 'list dikhao',
      'kaam batao',
    ],
    reply:
      'Hamare paas is waqt kul 10 remote jobs available hain: 🚀\n' +
      '• 🎬 Video Watch and Earn\n' +
      '• ✍️ Assignment Writing\n' +
      '• 📝 Content Writing\n' +
      '• 🎨 Graphic Designer\n' +
      '• ✈️ Travel and Booking Support\n' +
      '• ✂️ Video Editing Job\n' +
      '• 📢 Digital Marketing\n' +
      '• 📊 Data Entry\n' +
      '• 📦 Amazon Virtual Assistant\n' +
      '• 🏬 Amazon FBA\n' +
      'Kisi bhi job ke baare mein tafseel poochein, ya bataayein ke kis mein interested hain! ✨',
  },
  {
    id: 'INTENT_03_TRUST_LEGITIMACY',
    name: 'Trust & Legitimacy Queries',
    triggers: [
      'real hai ya fake', 'scam toh nahi', 'trust kaise karein', 'proof hai', 'legit hai',
      'scam', 'fake job', 'is this real', 'is this legit', 'is it safe', 'is this safe',
      'is my data safe', 'is this a scam', 'this is fake', 'trust you', 'safe hai',
      'secure hai', 'trusted hai', 'reliable hai', 'is this job legit', 'is this job real',
      'is this job a scam', 'is this platform real', 'is this platform legit',
      'is this platform safe', 'is this trusted', 'is this genuine', 'is this real job',
      'is this a fake job', 'is this genuine', '100 percent trusted', 'fully trusted',
    ],
    reply:
      'Job Portal Global ek fully verified aur professional platform hai. 🛡️ Hum transparency par yaqeen rakhte hain aur kisi kisam ke fraudulent claims nahi karte. System aur payment process ki mukammal tafseelat hamari official team Telegram par transparent tarike se brief karti hai. 📑',
  },
  {
    id: 'INTENT_04_PAYMENT_GUARANTEE',
    name: 'Payment & Salary Guarantee',
    triggers: [
      'salary kitni milegi', 'payout kaise hoga', 'easypaisa', 'jazzcash', 'bank transfer',
      'daily payment', 'weekly payment', 'income', 'how much can i earn', 'how much do i earn',
      'how much will i earn', 'salary', 'payout', 'payment method', 'how do i get paid',
      'when do i get paid', 'earn money', 'kitni salary', 'kitna income',
    ],
    reply:
      'Hamari tamam payments verified local payment gateways (Easypaisa 💳, JazzCash 📱, aur Direct Bank Transfer 🏦) ke zariye ki jaati hain. Daily aur weekly payout options available hain. Exact salary packages aap ki selected job role par depend karte hain jo team Telegram par finalize karti hai. 💵',
  },
  {
    id: 'INTENT_05_DIRECT_APPLY',
    name: 'Direct Job Application',
    triggers: [
      'job chahiye', 'apply kaise karein', 'apply kaise karna hai', 'apply kaise karni hai',
      'mujhe kaam karna hai', 'mujhe kaam karna', 'start kaise karein', 'start kaise karna hai',
      'hiring process', 'want job', 'kaam karna hai', 'job apply karna', 'apply karne ka tareeqa',
      'apply karne ka tarika', 'how to apply',
    ],
    reply:
      'Job Portal Global par hiring process bohot aasan hai. 🎯 Aap ko bas apni pasand ki job select karni hai aur Telegram ke zariye hamari recruitment team se connect hona hai jahan aap ko onboarding guidelines di jayengi. 📲',
  },
  {
    id: 'INTENT_06_JOB_TIMINGS',
    name: 'Job Timings & Working Hours',
    triggers: [
      'job timing kia hain', 'timings kia hai', 'timing kia hai', 'job timing kia hai',
      'kitne ghante kaam hai', 'time kia hai', 'working hours', 'part time hai ya full time',
      'kaam ka time', 'how many hours', 'what are the timings', 'what are the hours',
      'how many hours a day', 'hours per day', 'part time or full time', 'job timings',
      'kaam ke ghante', 'timing kya hai', 'timings kya hai', 'kab kaam karna hai',
      'kaam kitne ghante', 'daily kitne ghante',
    ],
    reply:
      'Hamare portal par flexible timings hain! ⏰ Aap apni marzi aur suhoolat ke mutabiq part-time ya full-time kaam kar sakte hain. Daily kisi bhi waqt 2 se 4 ghante de kar aap behtareen earning kar sakte hain. ⏱️',
  },
  {
    id: 'INTENT_07_OFFICE_LOCATION',
    name: 'Office Location & Physical Address',
    triggers: [
      'apka office kaha hai', 'office location', 'pata kia hai', 'kahan office hai',
      'city kon sa hai', 'address kia hai', 'physical office', 'where is your office',
      'where is the office', 'office address', 'your location', 'office kahan hai',
    ],
    reply:
      'Job Portal Global ek centralized remote digital platform hai. 🌐 Aap ko kisi physical office visiting ki zaroorat nahi hai — aap ghar baithe mobile ya laptop se fully remote work kar sakte hain. 🏡',
  },
  {
    id: 'INTENT_08_REQUIREMENTS',
    name: 'Requirements & Qualifications',
    triggers: [
      'qualification kia chahiye', 'qualification chahiye', 'qualification chahie',
      'parhai kitni chahiye', 'age limit', 'experience chahiye', 'experience chahie',
      'kaun kar sakta hai', 'study requirement', 'do i need experience', 'qualification needed',
      'qualification required', 'what qualifications', 'education required', 'any qualification',
      'need experience', 'experience required', 'who can apply', 'who can do this',
      'kya qualification chahiye', 'kitni parhai', 'kitni padhai chahiye', 'age kya hai',
      'kya age chahiye', 'experience kitna',
    ],
    reply:
      'Is kaam ke liye kisi high qualification ya pehle se tajurbe (experience) ki zaroorat nahi hai. 🎓 Agar aap ke paas smartphone aur basic internet connection hai, toh aap yeh kaam asani se kar sakte hain. 📲',
  },
  {
    id: 'INTENT_09_REGISTRATION_FEE',
    name: 'Registration Fee & Investment',
    triggers: [
      'fees hai', 'investment hai', 'paisa dena parega', 'registration charge', 'free hai',
      'free job', 'is there a fee', 'any fee', 'registration fee', 'do i have to pay',
      'do i need to pay', 'is it free', 'kya fees hai', 'kya paisa dena', 'any investment',
      'no fees',
    ],
    reply:
      'Job Portal Global par application process aur registration policy ki mukammal tafseelat hamari recruitment team faraham karti hai. Hum ek transparent system par kaam karte hain. 📋',
  },
  {
    id: 'INTENT_10_JOB_SELECTION',
    name: 'Job Selection & Telegram Transition',
    triggers: [
      'data entry', 'content writing', 'video watch', 'graphic designer', 'amazon va',
      'assignment writing', 'yeh job chahiye', 'is mein interested hoon', 'mai yeh kaam karunga',
      // Loose job-name variants — the same selection intent when the candidate
      // names a job in natural language.
      'graphic design', 'video editing', 'video editor', 'digital marketing', 'marketing',
      'travel and booking', 'travel booking', 'virtual assistant', 'amazon virtual',
      'assignment', 'content writ', 'typing', 'data typing', 'amazon fba', 'watch and earn',
      'video watch and earn', 'kaam karunga', 'job karna hai', 'yeh kaam karna hai',
      'apply for data entry', 'apply for graphic', 'apply for video', 'apply for assignment',
      'apply for content', 'apply for travel', 'apply for marketing', 'apply for amazon',
      'apply for virtual assistant', 'apply for typing',
    ],
    reply:
      'Zabardast! Aap ka selection bohot behtareen hai. 🎉\n' +
      'Hamara poora system aur department Telegram par shifted hai. Agar aap ko high-level earnings aur jobs chahiye, toh aap ko Telegram account banana parega. 📲\n' +
      'Agar aap ko Telegram ka idea nahi hai, toh main wazeh kar doon ke Telegram ek bohot hi professional business platform hai. Yahan bari-bari companies aur professional departments shifted hain, jin ke bade Channels aur Groups par hazaron nahi balkey lakhon job holders add hain. Hamara system bhi bilkul aisa hi hai.\n' +
      'Agar aap ke zehan mein aata hai ke WhatsApp par yeh kaam kyun nahi ho sakta, toh main batata chaloon ke WhatsApp heavy business operations ke liye design hi nahi hua. WhatsApp bade departments aur un ke heavy workload ko handle nahi kar sakta aur us ka server/account ban ho jata hai.\n' +
      'Kya aap ka Telegram account pehle se bana hua hai? Agar nahi bana hua toh koi masla nahi, main aap ko step-by-step guide kar deta hoon.',
  },
  {
    id: 'INTENT_11_TELEGRAM_GUIDANCE',
    name: 'Telegram Setup Guidance',
    triggers: [
      'guide karo', 'kaise banana hai', 'mujhe nahi aata', 'process batao', 'tarika batao',
      'help karo', 'guide me', 'setup kaise karein', 'nahi bana hua telegram guide karein',
    ],
    reply:
      'No problem at all! Main abhi aap ko setup mein complete guidance de deta hoon, is mein sirf 2 minutes lagenge. ⏱️\n' +
      'Aap ko bas yeh 3 Simple Steps follow karne hain:\n' +
      '1️⃣ Install Proton VPN: Pakistan mein Telegram smooth chalane ke liye VPN zaroori hai. 🔒\n' +
      '🔗 Download Proton VPN: https://play.google.com/store/apps/details?id=ch.protonvpn.android\n' +
      '🎬 Proton VPN Kaise Connect Karein (1 Min Video): https://youtube.com/shorts/7mNoiAz0Y2M?si=sv_iPII8bGpzs2Ac\n' +
      '2️⃣ Download Telegram App: Google Play Store se Telegram application install kar lein. 📲\n' +
      '🔗 Download Telegram App: https://play.google.com/store/apps/details?id=org.telegram.messenger\n' +
      '3️⃣ Watch Video Guide: Maine aap ke sath tutorial video ka link share kar diya hai. Usay dekh kar 5 minutes mein apna Telegram account setup kar lein: 🎥\n' +
      '🎬 Telegram Setup Video: https://youtu.be/K_ZK5HFWgA4?si=-pUY0A9-xCCQj\n' +
      '(💡 Note: Video mein VPN connection ka step-by-step process explained hai. Video mein jo Super VPN connect karte hain Telegram account banane ke liye woh ab itni smooth performance nahi deta. Is liye aap Proton VPN hi download karein jo world\'s best aur fast VPN mana jata hai).\n' +
      'Jaise hi aap ka Telegram account setup ho jaye, mujhe bas ek message kar dein ke \'Telegram account done\' ya \'Account setup kar liya hai\'.\n' +
      'Main aap ke sath team ka direct chat link share kar doongi. Jaise hi aap us link par click karenge, Telegram mein team ki direct chat open ho jayegi. Aap wahan bas ek message kar dein \'Give me job please\' ya jo bhi aap ka sawal ho.\n' +
      'Agle 1 se 2 ghante mein hamari team ya boss aap se wahin direct Telegram par contact karenge, jahan aap ko work details, timings, salary payout system samjha diya jayega aur official task groups/channels mein access de di jayegi.\n' +
      '⚠️ IMPORTANT REMINDER:\n' +
      'Jab bhi aap ne Telegram open karna ho (account banate waqt ya daily work ke liye), pehle VPN open karke connect MUST karna hai kyunki without VPN Pakistan mein Telegram nahi chalta. Agar aap VPN connect kiye bina Telegram kholein ge, toh server stuck ho jayega aur aap ko koi SMS/Update receive nahi hoga!',
  },
  {
    id: 'INTENT_12_TELEGRAM_CONFIRMATION',
    name: 'Telegram Setup Confirmation',
    triggers: [
      'telegram account done', 'account setup kar liya hai', 'bana liya hai', 'done',
      'account ban gaya', 'telegram ban gaya', 'setup done', 'done telegram', 'ho gaya',
      'account ready hai',
    ],
    reply:
      'Zabardast! Welldone. 👏✨\n' +
      'Niche diye gaye direct link par click karein, aap direct hamari recruitment team ki official Telegram chat par land ho jayeinge:\n' +
      '👉 https://t.me/+923244362726\n' +
      'Chat open hote hi team ko message karein: \'Give me job please\' ya jo bhi aap ka sawal ho.\n' +
      'Agle 1 se 2 ghante mein hamari team/boss aap ko reply karke work details, timings, aur salary payout system brief kar denge. Welcome aboard! 🚀\n' +
      '⚠️ IMPORTANT REMINDER ONCE AGAIN:\n' +
      'Jab bhi aap ne Telegram open karna ho (account banate waqt ya daily work ke liye), pehle VPN open karke connect MUST karna hai kyunki without VPN Pakistan mein Telegram nahi chalta. Agar aap VPN connect kiye bina Telegram kholein ge, toh server stuck ho jayega aur aap ko koi SMS/Update receive nahi hoga!',
  },
];

/** The 10 jobs exactly as the PDF lists them (names + emojis only — the PDF gives no per-job detail beyond the list and INTENT_10). */
const JOBS = [
  { name: 'Video Watch and Earn', emoji: '🎬' },
  { name: 'Assignment Writing', emoji: '✍️' },
  { name: 'Content Writing', emoji: '📝' },
  { name: 'Graphic Designer', emoji: '🎨' },
  { name: 'Travel and Booking Support', emoji: '✈️' },
  { name: 'Video Editing Job', emoji: '✂️' },
  { name: 'Digital Marketing', emoji: '📢' },
  { name: 'Data Entry', emoji: '📊' },
  { name: 'Amazon Virtual Assistant', emoji: '📦' },
  { name: 'Amazon FBA', emoji: '🏬' },
];

/** Brand constant from the PDF. */
const STORE = {
  name: 'Job Portal Global',
  url: 'https://job-portal-global-2.myshopify.com/',
  tagline: 'Hum ek centralized remote platform hain jahan aap ko daily basis par verified online jobs faraham ki jaati hain.',
  currency: 'PKR',
  mission: 'Empower every individual by providing reliable online jobs and financial independence.',
};

/** The exact Telegram direct-chat link from the PDF (INTENT_12). */
const INVITE_LINK = 'https://t.me/+923244362726';

/** The exact jobs-list reply from the PDF (INTENT_02). */
function jobsListReply(lang = 'en') {
  return INTENTS[1].reply;
}

/**
 * Sentiment / small-talk replies. Handled deterministically (no AI call).
 * These are the ONLY replies outside the knowledge base the bot may give
 * (the client's standing rule: small talk is the only off-KB category the
 * bot answers; everything else redirects). Bilingual (en / hi) as before.
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
      'Good morning! ☀️ Welcome to Job Portal Global. How can I help you find an online job today?',
    goodAfternoon:
      'Good afternoon! 😊 How can I help you with our online jobs today?',
    goodEvening:
      'Good evening! 🌙 How can I help you with our online jobs today?',
    ok: 'Great! 👍 Let me know if you have any questions about our jobs or want to apply.',
    intro:
      "I'm the recruitment assistant for Job Portal Global 🌐. I can tell you about our online work-from-home jobs and help you apply. Ask me anything!",
  },
  hi: {
    howAreYou:
      'Main theek hoon, shukriya poochne ke liye! 😊 Aap ko hamari online jobs ke baare mein kya jaanna hai?',
    thanks:
      'Koi baat nahi! 😊 Kya main kisi aur cheez mein madad kar sakta hoon — job details ya apply karne mein?',
    bye:
      'Allah Hafiz! 👋 Jobs ke baare mein koi sawal ho toh kabhi bhi wapas aayein. Din acha guzrein!',
    goodMorning:
      'Subah bakhair! ☀️ Job Portal Global mein khush aamdeed. Aaj main aap ki online job dhoondhne mein kaise madad karoon?',
    goodAfternoon:
      'Do pehar bakhair! 😊 Online jobs ke baare mein kya jaanna hai?',
    goodEvening:
      'Shaam bakhair! 🌙 Online jobs ke baare mein kya jaanna hai?',
    ok: 'Zabardast! 👍 Jobs ke baare mein koi sawal ho ya apply karna ho toh bataayein.',
    intro:
      'Main Job Portal Global ka recruitment assistant hoon 🌐. Main aap ko hamari online ghar-baithay jobs ke baare mein bata sakta hoon aur apply karne mein madad kar sakta hoon. Kuch bhi poochein!',
  },
};

/** The candidate-facing guardrail: everything outside the knowledge base (except greetings / small talk / the apply flow) is redirected. */
const REDIRECT_GUARDRAIL = {
  message:
    'I can only assist you with our jobs and applications. For anything else, please visit our website for complete details 👉 ' +
    STORE.url,
  url: STORE.url,
};

/** Conversation rule texts shared across the apply flow. */
const RULES = {
  shortGreeting: [
    `👋 Welcome to ${STORE.name}!`,
    `Hum ek centralized remote platform hain jahan aap ko daily basis par verified online jobs faraham ki jaati hain. Aap ghar baithe mobile ya laptop se fully remote work kar sakte hain. 💻📱`,
    `Ask me about any job, or tell me what you're looking for!`,
  ].join('\n\n'),
  greeting: [
    `👋 Welcome to ${STORE.name}!`,
    `Hum ek centralized remote platform hain jahan aap ko daily basis par verified online jobs faraham ki jaati hain. Aap ghar baithe mobile ya laptop se fully remote work kar sakte hain. 💻📱`,
    `Ask me about any job, or tell me what you're looking for!`,
  ].join('\n\n'),
  interestPrompt:
    'If you\'re interested in this job (or any other), let me know and I\'ll walk you through applying! 😊',
  pitchIntro:
    'Before you apply, let me explain how our team works — it\'s important you know where everything happens:',
  applyAsk: 'Are you interested in applying? (Yes / No)',
  notInterested:
    'No problem at all! 😊 If you change your mind, just open the chat again and we\'ll get you started. Have a great day!',
  askName: 'Please share your full name to start your application. 📝',
  nameInvalid:
    "That doesn't look like a full name. Please send your name using letters only (2–80 characters). 📝",
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
  inviteLinkLine: `Join our team on Telegram to get started: ${INVITE_LINK}`,
  duplicate:
    'We already received your application recently. Our team will contact you on Telegram shortly — no need to apply again. 🙏',
  throttled:
    'You\'re sending messages very quickly. Please slow down a little so I can help you. 🙏',
  error:
    'Something went wrong on our side. Please try again in a moment — or contact our team on Telegram directly. 🙏',
  outOfScopeRedirect: REDIRECT_GUARDRAIL.message,
  telegramHelpIntro: INTENTS[10].reply,
  securityReassurance:
    'Your details are completely safe with us! 🔒 We only use your name, contact number and Telegram ID to process your application — nothing is shared or sold. Job Portal Global is a fully verified and professional platform. 🛡️',
};

/** Hinglish (Roman Urdu) variants of the flow rules, used when the candidate writes in Roman Urdu/Hinglish. */
const RULES_HI = {
  shortGreeting: [
    `👋 ${STORE.name} mein khush aamdeed!`,
    `Hum ek centralized remote platform hain jahan aap ko daily basis par verified online jobs faraham ki jaati hain. Aap ghar baithe mobile ya laptop se fully remote work kar sakte hain. 💻📱`,
    `Kisi bhi job ke baare mein poochein, ya bataayein ke aap kya dhoondh rahe hain!`,
  ].join('\n\n'),
  greeting: null,
  interestPrompt:
    'Agar aap is job (ya kisi aur) mein interested hain, toh mujhe bataayein — main apply karne ka poora tareeqa samjha doonga! 😊',
  pitchIntro:
    'Apply karne se pehle, main samjha doon ke hamari team kaise kaam karti hai — ye jaanna zaroori hai:',
  applyAsk: 'Kya aap apply karne mein interested hain? (Haan / Nahi)',
  noTelegramGuide: INTENTS[10].reply,
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
  inviteLinkLine: `Hamaari team se judne ke liye Telegram par aayein: ${INVITE_LINK}`,
  duplicate:
    'Aap ki application humein pehle hi mil chuki hai. Hamari team jald hi Telegram par rabta karegi — dobara apply karne ki zaroorat nahi. 🙏',
  throttled:
    'Aap bohat tezi se messages bhej rahe hain. Zara aaram se — main madad kar raha hoon. 🙏',
  error:
    'Hamari taraf se kuch masla ho gaya. Ek minute baad dobara try karein — ya team ko Telegram par directly contact karein. 🙏',
  outOfScopeRedirect:
    'Main sirf hamari jobs aur applications mein madad kar sakta hoon. Kisi aur cheez ke liye website par tafseelat dekhein 👉 ' +
    STORE.url,
  telegramHelpIntro: INTENTS[10].reply,
  securityReassurance:
    'Aap ki details bilkul mehfooz hain! 🔒 Hum sirf aap ka naam, contact number aur Telegram ID application process ke liye use karte hain — kisi se share ya bech nahi jaati. Job Portal Global ek fully verified aur professional platform hai. 🛡️',
  done:
    'Aap ki application already submit ho chuki hai — hamari team jald hi Telegram par rabta karegi. 🎉',
};

module.exports = {
  STORE,
  JOBS,
  INTENTS,
  INVITE_LINK,
  RULES,
  RULES_HI,
  SENTIMENTS,
  jobsListReply,
  REDIRECT_GUARDRAIL,
};
