/**
 * Knowledge base for the JOB PORTAL GLOBAL recruitment chatbot.
 *
 * SINGLE SOURCE OF TRUTH: `Untitled.pdf` (the client's "Bot System
 * Architecture & Intent Map"). It defines 12 intents, each with trigger
 * keywords and an EXACT bot response script. This module encodes that PDF
 * verbatim: the bot must deliver these responses EXACTLY (the PDF's
 * "Execution Rule" — the AI/bot engine may only inject visual emojis
 * naturally into the dynamic generation, maintaining precise phrasing).
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
      'Job Portal Global ek fully verified aur professional platform hai. 🛡️ Hum transparency par yaqeen rakhte hain aur kisi kisam ke fraudulent claims nahi karte. System aur payment process ki mukammal tafseelat hamari official team Discord par transparent tarike se brief karti hai. 📑',
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
      'Hamari tamam payments verified local payment gateways (Easypaisa 💳, JazzCash 📱, aur Direct Bank Transfer 🏦) ke zariye ki jaati hain. Daily aur weekly payout options available hain. Exact salary packages aap ki selected job role par depend karte hain jo team Discord par finalize karti hai. 💵',
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
      'Job Portal Global par hiring process bohot aasan hai. 🎯 Aap ko bas apni pasand ki job select karni hai aur Discord ke zariye hamari recruitment team se connect hona hai jahan aap ko onboarding guidelines di jayengi. 📲',
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
    name: 'Job Selection & Discord Transition',
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
      'Hamara poora system aur department Discord par shifted hai. Agar aap ko high-level earnings aur jobs chahiye, toh aap ko Discord account banana parega. 📲\n' +
      'Agar aap ko Discord ka idea nahi hai, toh main wazeh kar doon ke Discord ek bohot hi professional business platform hai. Yahan bari-bari companies aur professional departments shifted hain, jin ke bade Channels aur Groups par hazaron nahi balkey lakhon job holders add hain. Hamara system bhi bilkul aisa hi hai.\n' +
      'Agar aap ke zehan mein aata hai ke WhatsApp par yeh kaam kyun nahi ho sakta, toh main batata chaloon ke WhatsApp heavy business operations ke liye design hi nahi hua. WhatsApp bade departments aur un ke heavy workload ko handle nahi kar sakta aur us ka server/account ban ho jata hai.\n' +
      'Kya aap ka Discord account pehle se bana hua hai? Agar nahi bana hua toh koi masla nahi, main aap ko step-by-step guide kar deta hoon.',
  },
  {
    id: 'INTENT_11_DISCORD_GUIDANCE',
    name: 'Discord Setup Guidance',
    triggers: [
      'guide karo', 'kaise banana hai', 'mujhe nahi aata', 'process batao', 'tarika batao',
      'help karo', 'guide me', 'setup kaise karein', 'nahi bana hua discord guide karein',
      'discord nahi pata', 'discord nahi aata', 'discord kaise banayein', 'discord kaise banana hai',
      'how to make discord', 'how to install discord', 'discord account kaise banayein',
      'discord account nahi hai', 'mujhe discord nahi aata', 'discord setup karna hai',
      'telegram nahi pata', 'telegram nahi aata', 'telegram nahi hai', 'how to install telegram',
    ],
    reply:
      'No problem at all! Main abhi aap ko setup mein complete guidance de deta hoon, is mein sirf 2 minutes lagenge. ⏱️\n' +
      'Aap ko bas yeh simple steps follow karne hain:\n' +
      '1️⃣ Download Discord App: Google Play Store se Discord application install kar lein. 📲\n' +
      '🔗 Download Discord App: https://play.google.com/store/apps/details?id=com.discord\n' +
      '2️⃣ Watch Complete Video Guide: Maine aap ke sath tutorial video ka link share kar diya hai. Usay dekh kar 5 minutes mein apna Discord account setup aur use karne ka tariqa samajh lein: 🎥\n' +
      '🎬 Discord Setup & Usage Video: https://youtu.be/JRFpxT5Njxw?si=5UBLEASoCAz96lme\n' +
      '📑 Next Step:\n' +
      'Jaise hi aapka Discord account setup ho jaye, mujhe bas ek message kar dein ke \'Discord account done\' ya \'Account setup kar liya hai\'. 📲\n' +
      'Uske baad main aapke sath humari team ka direct username share kar doonga. Aap simply "Add Friends" par ja kar username search karke friend request bhej dijiyega. 🤝 Humari team ya supervisor jitna jaldi ho saka aapki request accept karke aapse contact kar lenge. ⚡️\n' +
      '⚠️ IMPORTANT: Lekin yeh sab karne se pehle, complete video tutorial lazmi dekhein jiska link maine upar aapko share kiya hai, taake aapko sab cheezein achi tarah samajh aa jayein! 📌',
  },
  {
    id: 'INTENT_12_DISCORD_CONFIRMATION',
    name: 'Discord Setup Confirmation',
    triggers: [
      'discord account done', 'account setup kar liya hai', 'bana liya hai', 'done',
      'account ban gaya', 'discord ban gaya', 'setup done', 'done discord', 'ho gaya',
      'account ready hai', 'discord done',
    ],
    reply:
      'Zabardast! Welldone. 👏✨\n' +
      'Niche diye gaye Username ko Discord par Add Friends bar mein search kar ke direct hamari recruitment team ko request bhaij dein. Yaad rahe spelling vagara mein koi mistake na ho kyunki spelling ya words wrong honge toh aapki request kisi aur ko bhi send ho sakti hai aur aapki job miss ho sakti hai: 📌\n' +
      '👤 Team Username: bukhtiyaarhussainbranch2050\n' +
      'Agle 1 se 2 ghante mein hamari team ya boss aap ko reply karke work details, timings, aur salary payout system brief kar denge aur aapka work start ho jayega. Welcome aboard! 🚀',
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

/** The exact Discord team username from the PDF (INTENT_12). */
const TEAM_DISCORD_USERNAME = 'bukhtiyaarhussainbranch2050';

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
  askDiscord:
    'Almost done! Please share your Discord username (the name you use on Discord, e.g. ali_raza). 🎮',
  phoneInvalid:
    'That number doesn\'t look right. Please send a valid contact number with only digits (e.g. 03001234567, +923001234567, or 923001234567). 📱',
  discordInvalid:
    'That doesn\'t look like a valid Discord username. Please send the username you use on Discord — letters, numbers, dots or underscores (e.g. ali_raza, ali.raza_2). 🎮',
  confirmHeader: 'Please confirm your details: ✅',
  confirmPrompt:
    'Reply with ✅ Yes to submit, or type the field you want to change (Name / Phone / Discord).',
  submitted: [
    '🎉 Thank you! Your application has been received.',
    'Our team will contact you on Discord shortly with the next steps and your task details.',
    'Make sure your Discord is ready so you don\'t miss our message!',
  ].join('\n\n'),
  teamContactLine: `Add our team on Discord to get started. Team username: ${TEAM_DISCORD_USERNAME}`,
  duplicate:
    'We already received your application recently. Our team will contact you on Discord shortly — no need to apply again. 🙏',
  throttled:
    'You\'re sending messages very quickly. Please slow down a little so I can help you. 🙏',
  error:
    'Something went wrong on our side. Please try again in a moment — or contact our team on Discord directly. 🙏',
  outOfScopeRedirect: REDIRECT_GUARDRAIL.message,
  discordHelpIntro: INTENTS[10].reply,
  securityReassurance:
    'Your details are completely safe with us! 🔒 We only use your name, contact number and Discord username to process your application — nothing is shared or sold. Job Portal Global is a fully verified and professional platform. 🛡️',
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
  noDiscordGuide: INTENTS[10].reply,
  notInterested:
    'Koi masla nahi! 😊 Agar kabhi dil kare, toh dobara chat khol lein aur hum shuru kar denge. Allah Hafiz!',
  askName: 'Apna poora naam share karein taake application shuru ho. 📝',
  askPhone:
    'Bohat acha! Ab apna active contact number bhejein (sirf digits, masalan 03001234567). 📱',
  askDiscord:
    'Almost ho gaya! Apna Discord username bhejein (jo naam aap Discord par use karte hain, masalan ali_raza). 🎮',
  nameInvalid:
    'Mazrat, ye naam sahi nahi laga. Letters mein poora naam bhejein (2–80 characters). 📝',
  phoneInvalid:
    'Ye number sahi nahi laga. Sirf digits mein valid number bhejein (masalan 03001234567, +923001234567). 📱',
  discordInvalid:
    'Ye Discord username sahi nahi laga. Discord wala username bhejein — letters, numbers, dots ya underscores (masalan ali_raza). 🎮',
  confirmHeader: 'Apni details confirm karein: ✅',
  confirmPrompt:
    'Submit karne ke liye ✅ Haan likhein, ya change karne ke liye field ka naam batayein (Naam / Phone / Discord).',
  submitted: [
    `🎉 Shukriya! Aap ki application mil gayi hai.`,
    `Hamari team jald hi aap ko Discord par next steps aur task details bhejegi.`,
    `Yakeeni banayein ke aap ka Discord ready hai taake hamara message miss na ho!`,
  ].join('\n\n'),
  teamContactLine: `Hamaari team se judne ke liye Discord par aayein. Team username: ${TEAM_DISCORD_USERNAME}`,
  duplicate:
    'Aap ki application humein pehle hi mil chuki hai. Hamari team jald hi Discord par rabta karegi — dobara apply karne ki zaroorat nahi. 🙏',
  throttled:
    'Aap bohat tezi se messages bhej rahe hain. Zara aaram se — main madad kar raha hoon. 🙏',
  error:
    'Hamari taraf se kuch masla ho gaya. Ek minute baad dobara try karein — ya team ko Discord par directly contact karein. 🙏',
  outOfScopeRedirect:
    'Main sirf hamari jobs aur applications mein madad kar sakta hoon. Kisi aur cheez ke liye website par tafseelat dekhein 👉 ' +
    STORE.url,
  discordHelpIntro: INTENTS[10].reply,
  securityReassurance:
    'Aap ki details bilkul mehfooz hain! 🔒 Hum sirf aap ka naam, contact number aur Discord username application process ke liye use karte hain — kisi se share ya bech nahi jaati. Job Portal Global ek fully verified aur professional platform hai. 🛡️',
  done:
    'Aap ki application already submit ho chuki hai — hamari team jald hi Discord par rabta karegi. 🎉',
};

module.exports = {
  STORE,
  JOBS,
  INTENTS,
  TEAM_DISCORD_USERNAME,
  RULES,
  RULES_HI,
  SENTIMENTS,
  jobsListReply,
  REDIRECT_GUARDRAIL,
};
