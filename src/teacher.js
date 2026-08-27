// @ts-nocheck
import { callAI, callServerGemini, callGeminiFast, callGroqFast, callGroq70b, speakWithElevenLabs, stopElevenAudio } from './ai.js';

/* ============================================================
   AI SUPER-TUTOR (AI Teacher & Chatbot)
   - Clean, uncluttered ChatGPT/Gemini conversational design
   - Unified for both specific PDF context & General Universal AI chat
   - Customization Sheet for Personas (Academic, ELI5, Memory Hacks, Exam Evaluator)
   - Action bar for each AI answer: Copy, Save to Notes, + Flashcard, Listen
   - IndexedDB Chat History Persistence with per-document and global tracking
   ============================================================ */

export const TEACHER_MODES = [
  { id: 'professional', label: 'Academic & Rigorous', icon: 'teacher', desc: 'Standard textbook breakdown, deep conceptual clarity & exam rigor' },
  { id: 'eli5', label: "Explain Like I'm 10 (ELI5)", icon: 'brain', desc: 'Everyday analogies, story-like examples, zero jargon' },
  { id: 'mnemonics', label: 'Memory Tricks & Mnemonics', icon: 'zap', desc: 'Acronyms, visual memory hooks, chunking & formulas recall' },
  { id: 'evaluator', label: 'Exam Answer Evaluator', icon: 'award', desc: 'Grade answers against 2, 3 or 5 mark rubrics with missing points' },
  { id: 'summary', label: 'Rapid Revision & Key Facts', icon: 'sparkle', desc: 'High-yield key definitions, formulas cheat sheet & rapid recap' },
];

export let activeTeacherMode = 'professional';
export let examTargetMarks = 3; // 2, 3, or 5
export let crossPdfActive = false;
export let isVoiceListening = false;
export let speechRecognitionInstance = null;
export let activeFileId = null;

// Clean repetitive loop phrases and fix common speech-to-text spelling issues
export function deduplicateSpokenPhrase(text) {
  if (!text) return '';

  // Academic and phonetic spelling correction dictionary
  const SPELLING_FIXES = {
    'chaiptar': 'chapter',
    'chaipter': 'chapter',
    'chaptar': 'chapter',
    'chepter': 'chapter',
    'chptr': 'chapter',
    'helo': 'hello',
    'helow': 'hello',
    'hlo': 'hello',
    'hlw': 'hello',
    'lesan': 'lesson',
    'lessen': 'lesson',
    'leson': 'lesson',
    'modul': 'module',
    'modyul': 'module',
    'queshn': 'question',
    'koschan': 'question',
    'koshchan': 'question',
    'queshan': 'question',
    'ansar': 'answer',
    'aansar': 'answer',
    'thimakka': 'Thimmakka',
    'thimaka': 'Thimmakka',
    'thimmaka': 'Thimmakka',
    'thimmakka\'s': 'Thimmakka\'s',
    'ekjam': 'exam',
    'exm': 'exam',
    'samjho': 'samjhao',
    'samjaho': 'samjhao',
    'btao': 'batao',
    'baare': 'bare',
    'mein': 'me',
    'kare': 'karo',
    'padho': 'padhao',
    'kitaab': 'book',
    'buk': 'book'
  };

  const rawWords = text.trim().split(/\s+/).map(w => {
    const cleanWord = w.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (SPELLING_FIXES[cleanWord]) {
      return SPELLING_FIXES[cleanWord];
    }
    return w;
  });

  if (rawWords.length <= 1) return rawWords.join(' ');

  // 1. Remove immediate duplicate single words (e.g. "kya kya" -> "kya", "is is" -> "is")
  const deduplicatedWords = [];
  for (let i = 0; i < rawWords.length; i++) {
    if (i === 0 || rawWords[i].toLowerCase() !== rawWords[i - 1].toLowerCase()) {
      deduplicatedWords.push(rawWords[i]);
    }
  }

  // 2. Remove repeated consecutive sub-phrases of length 2 to 10
  let cleanStr = deduplicatedWords.join(' ');
  for (let phraseLen = 2; phraseLen <= 10; phraseLen++) {
    const tokens = cleanStr.split(/\s+/);
    if (tokens.length < phraseLen * 2) continue;
    const newTokens = [];
    let i = 0;
    while (i < tokens.length) {
      if (i + phraseLen * 2 <= tokens.length) {
        const p1 = tokens.slice(i, i + phraseLen).join(' ').toLowerCase();
        const p2 = tokens.slice(i + phraseLen, i + phraseLen * 2).join(' ').toLowerCase();
        if (p1 === p2) {
          newTokens.push(...tokens.slice(i, i + phraseLen));
          i += phraseLen * 2;
          continue;
        }
      }
      newTokens.push(tokens[i]);
      i++;
    }
    cleanStr = newTokens.join(' ');
  }

  // 3. Remove trailing duplicate greeting if user said "hello ... hello"
  const finalTokens = cleanStr.split(/\s+/);
  if (finalTokens.length > 2) {
    if (finalTokens[0].toLowerCase() === 'hello' && finalTokens[finalTokens.length - 1].toLowerCase() === 'hello') {
      finalTokens.pop();
      cleanStr = finalTokens.join(' ');
    }
  }

  return cleanStr;
}

// High-accuracy Devanagari Hindi to Hinglish / Roman script Transliteration
export function transliterateDevanagariToHinglish(text) {
  if (!text) return '';
  if (!/[\u0900-\u097F]/.test(text)) return deduplicateSpokenPhrase(text); // already English / Latin

  // Common Hindi spoken word dictionary for natural, accurate Hinglish spelling
  const WORD_MAP = {
    'यह': 'yeh', 'ये': 'ye', 'वह': 'woh', 'वो': 'wo', 'क्या': 'kya',
    'है': 'hai', 'हैं': 'hain', 'हो': 'ho', 'हूँ': 'hoon', 'हूं': 'hoon',
    'था': 'tha', 'थी': 'thi', 'थे': 'the', 'किस': 'kis', 'बारे': 'bare',
    'में': 'me', 'पे': 'pe', 'पर': 'par', 'से': 'se', 'को': 'ko',
    'का': 'ka', 'की': 'ki', 'के': 'ke', 'करो': 'karo', 'करें': 'karein',
    'करना': 'karna', 'कर': 'kar', 'रहा': 'raha', 'रही': 'rahi', 'रहे': 'rahe',
    'समझाओ': 'samjhao', 'समझाएं': 'samjhayein', 'समझा': 'samjha', 'बताओ': 'batao',
    'बताएं': 'batayein', 'पढ़ाओ': 'padhao', 'पढ़ाएं': 'padhayein', 'सिखाओ': 'sikhao',
    'कैसे': 'kaise', 'क्यों': 'kyon', 'कब': 'kab', 'कहाँ': 'kahan', 'कहा': 'kaha',
    'कितना': 'kitna', 'कितने': 'kitne', 'कितनी': 'kitni', 'उत्तर': 'answer',
    'प्रश्न': 'question', 'सवाल': 'question', 'जवाब': 'answer', 'पेज': 'page',
    'किताब': 'book', 'पाठ': 'lesson', 'मुझको': 'mujhko', 'मुझे': 'mujhe',
    'मेरा': 'mera', 'मेरी': 'meri', 'मेरे': 'mere', 'हम': 'hum',
    'हमारा': 'hamara', 'हमारी': 'hamari', 'हमारे': 'hamare', 'आप': 'aap',
    'आपका': 'aapka', 'आपकी': 'aapki', 'आपके': 'aapke', 'तुम': 'tum',
    'तुम्हारा': 'tumhara', 'तुम्हारी': 'tumhari', 'तुम्हारे': 'tumhare',
    'नहीं': 'nahi', 'ना': 'na', 'हाँ': 'haan', 'और': 'aur', 'या': 'ya',
    'लेकिन': 'lekin', 'मगर': 'magar', 'परन्तु': 'parantu', 'क्योंकि': 'kyonki',
    'इसलिए': 'isliye', 'अगर': 'agar', 'यदि': 'yadi', 'तो': 'toh',
    'होगा': 'hoga', 'होगी': 'hogi', 'होंगे': 'honge', 'सकता': 'sakta',
    'सकती': 'sakti', 'सकते': 'sakte', 'चाहिए': 'chahiye', 'दीजिए': 'dijiye',
    'दीजिये': 'dijiye', 'लीजिए': 'lijiye', 'बोलिए': 'boliye', 'लिखिए': 'likhiye',
    'लिखो': 'likho', 'हल': 'solution', 'सूत्र': 'formula', 'नियम': 'rule',
    'विषय': 'subject', 'अध्याय': 'chapter', 'चैप्टर': 'chapter', 'लाइन': 'line', 'पैराग्राफ': 'paragraph',
    'मुख्य': 'main', 'बिंदु': 'point', 'टॉपिक': 'topic', 'सारांश': 'summary',
    'परीक्षा': 'exam', 'तैयारी': 'preparation', 'नोट्स': 'notes', 'याद': 'yaad',
    'हेलो': 'hello', 'हेल्लो': 'hello', 'नमस्ते': 'namaste', 'पर्यावरण': 'environment',
    'कचरा': 'waste', 'प्रबंधन': 'management', 'तनाव': 'stress'
  };

  // Replace whole words from dictionary first
  let processed = text.split(/(\s+|[.,!?;:])/).map(token => {
    const cleanToken = token.trim();
    if (WORD_MAP[cleanToken]) {
      return WORD_MAP[cleanToken];
    }
    return token;
  }).join('');

  if (!/[\u0900-\u097F]/.test(processed)) return deduplicateSpokenPhrase(processed);

  // Character level phonetic transliteration map
  const vowels = {
    'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'ee', 'उ': 'u', 'ऊ': 'oo',
    'ऋ': 'ri', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au', 'अं': 'an', 'अः': 'ah'
  };

  const matras = {
    'ा': 'a', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo',
    'ृ': 'ri', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au',
    'ं': 'n', 'ँ': 'n', 'ः': 'h', '़': ''
  };

  const consonants = {
    'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'ng',
    'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'ny',
    'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n',
    'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
    'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm',
    'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v', 'श': 'sh', 'ष': 'sh', 'स': 's', 'ह': 'h',
    'क़': 'q', 'ख़': 'kh', 'ग़': 'gh', 'ज़': 'z', 'फ़': 'f', 'ड़': 'r', 'ढ़': 'rh'
  };

  let out = '';
  const len = processed.length;
  for (let i = 0; i < len; i++) {
    const char = processed[i];
    const nextChar = i + 1 < len ? processed[i + 1] : '';

    if (vowels[char]) {
      out += vowels[char];
    } else if (consonants[char]) {
      const c = consonants[char];
      if (nextChar === '्') {
        // Halant suppresses inherent vowel
        out += c;
        i++; // skip halant
      } else if (matras[nextChar] !== undefined) {
        out += c + matras[nextChar];
        i++; // skip matra
      } else if (nextChar === ' ' || !nextChar || /[.,!?;:\n]/.test(nextChar)) {
        out += c;
      } else if (consonants[nextChar] || vowels[nextChar]) {
        out += c + 'a';
      } else {
        out += c;
      }
    } else if (matras[char] !== undefined) {
      out += matras[char];
    } else if (char === '्') {
      // halant consumed
    } else {
      out += char;
    }
  }

  const cleaned = out.replace(/\s+/g, ' ').trim();
  return deduplicateSpokenPhrase(cleaned);
}

export function getInitialWelcomeMessage(fileId) {
  const isGlobal = fileId === 'global_chat';
  const currentFile = window.State?.files?.find(f => f.id === fileId);
  const docName = isGlobal ? 'Universal Library Workspace' : (currentFile ? currentFile.name : 'Study Material');
  const curP = window.State?.currentPage || 1;
  const totalP = window.State?.numPages || currentFile?.pageCount || 1;

  return {
    role: 'assistant',
    text: isGlobal 
      ? `### 👨‍🏫 Universal Academic Assistant\nConnected to your entire digital library. Query concepts across multiple textbooks, solve step-by-step problems, and evaluate exam answers.`
      : `### 📚 Grounded in "${docName}"\n**Page ${curP} of ${totalP}** • Ready to break down derivations, explain complex theorems, or evaluate exam questions.`,
    mode: 'professional',
    timestamp: Date.now()
  };
}

// Fast multi-tier page text cache (Memory + Persistent IndexedDB)
const pdfPageTextCache = new Map();

export async function getPdfPageText(doc, pageNum, fileId = null) {
  if (!doc || pageNum < 1 || pageNum > doc.numPages) return '';
  const docKey = fileId || doc.fingerprint || 'doc';
  const cacheKey = `${docKey}_${pageNum}`;
  
  if (pdfPageTextCache.has(cacheKey)) {
    return pdfPageTextCache.get(cacheKey);
  }

  // 1. Try IndexedDB persistent page cache
  try {
    if (window.DB && typeof window.DB.getCachedPage === 'function') {
      const dbCached = await window.DB.getCachedPage(docKey, pageNum);
      if (dbCached && dbCached.text) {
        pdfPageTextCache.set(cacheKey, dbCached.text);
        return dbCached.text;
      }
    }
  } catch(e) {}

  // 2. Extract from PDF.js document handle
  try {
    const page = await doc.getPage(pageNum);
    const textContent = await page.getTextContent();
    const text = textContent.items.map(item => item.str || '').join(' ').replace(/\s+/g, ' ').trim();
    pdfPageTextCache.set(cacheKey, text);

    // Save to IndexedDB asynchronously in background
    if (window.DB && typeof window.DB.putCachedPage === 'function' && text) {
      window.DB.putCachedPage(docKey, pageNum, text).catch(() => {});
    }

    return text;
  } catch(e) {
    return '';
  }
}

export function detectLastDiscussedPage(chatMessages, fallbackPage = 1) {
  if (!chatMessages || !chatMessages.length) return fallbackPage;
  for (let i = chatMessages.length - 1; i >= 0; i--) {
    const msg = chatMessages[i];
    if (!msg || !msg.text || msg.text === '…') continue;
    // Match explicit page markers only: [Page 121], [📖 Page 121], Page 121, Pg 121, "121 page"
    const match = msg.text.match(/(?:\[(?:📖\s*)?Page\s*(\d+)\]|\b(?:page|pg|page\s*no\.?)\s*(\d+)\b|(\d+)\s*(?:th|st|nd|rd)?\s*(?:page|pg)\b)/i);
    if (match) {
      const p = parseInt(match[1] || match[2] || match[3], 10);
      if (p >= 1) return p;
    }
  }
  return fallbackPage;
}

// Full-Book Dynamic Semantic Index & Cross-PDF Universal RAG Engine
export async function getTeacherContext(options = {}, userQuery = '', chatHistory = []) {
  let fileRecord = window.State?.files?.find(f => f.id === activeFileId) || window.State?.currentFile;
  const isGlobal = activeFileId === 'global_chat' || (!fileRecord && !activeFileId);
  const allFiles = window.State?.files || [];
  const selectedScope = options.scope || 'page'; // 'page' | 'chapter' | 'book'

  if (isGlobal) {
    let libraryOverview = '';
    let crossDocContext = '';
    if (allFiles.length > 0) {
      libraryOverview = allFiles.slice(0, 25).map(f => `- "${f.name}" (${f.pageCount || 0} pages, folder: ${f.folder || 'Main'}, subject: ${f.subject || 'General'})`).join('\n');
      
      // If user asks a question in global chat, perform deep cross-pdf search across all library PDFs
      if (userQuery && userQuery.trim().length > 2) {
        crossDocContext = await searchCrossPdfLibrary(allFiles, userQuery);
      }
    }
    return {
      docTitle: 'General AI Study Assistant (Cross-Library RAG)',
      docId: 'global_chat',
      folder: 'All',
      subject: 'Universal Academic Knowledge',
      currentPage: 1,
      totalPages: 1,
      pageText: '',
      prevPageText: '',
      nextPageText: '',
      chapterText: crossDocContext || '',
      bookOverviewText: libraryOverview ? `AVAILABLE LIBRARY DOCUMENTS:\n${libraryOverview}` : '',
      crossPdfContext: crossDocContext || (libraryOverview ? `AVAILABLE LIBRARY DOCUMENTS:\n${libraryOverview}` : '')
    };
  }

  // Load complete file record from IndexedDB if data not yet loaded in memory
  if (!fileRecord?.data) {
    try {
      const full = await window.DB.get('files', activeFileId);
      if (full) fileRecord = full;
    } catch(e) {}
  }

  // Load PDF.js document handle to extract real text
  let doc = (window.State?.currentFile?.id === activeFileId) ? window.State?.currentDoc : null;
  if (!doc && fileRecord?.data && typeof pdfjsLib !== 'undefined') {
    try {
      doc = await pdfjsLib.getDocument({ data: fileRecord.data.slice(0), ...window.PDFJS_LOAD_OPTS }).promise;
    } catch(err) {
      console.warn('Could not load PDF document for AI grounding:', err);
    }
  }

  const totalPages = doc?.numPages || fileRecord?.pageCount || window.State?.numPages || 1;
  const currentReaderPage = (window.State?.currentFile?.id === activeFileId && window.State?.currentPage) ? window.State.currentPage : 1;

  // Clean query for intent analysis
  const cleanQ = (userQuery || '').toLowerCase().replace(/[^a-z0-9.\s]/g, ' ').trim();
  
  // 1. Direct Page number requested in current user query (ONLY when explicitly mentioning page / pg)
  const queryPageMatch = cleanQ.match(/\b(?:page|pg|page\s*no\.?|p\.)\s*(\d{1,4})\b/i) 
    || cleanQ.match(/\b(\d{1,4})\s*(?:th|st|nd|rd)?\s*(?:page|pg)\b/i);

  // 2. Direct Chapter or Lesson query (e.g. "chapter 5", "ch 5", "lesson 4", "unit 5", "chapter 8", "adhyay 5")
  const chapterNumMatch = cleanQ.match(/(?:chapter|ch|lesson|unit|module|paath|adhyaye?)\s*(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|i{1,3}|iv|v|vi{0,3}|ix|x|xi{0,3}|xiv|xv|xvi{0,3}|xix|xx)/i) 
    || cleanQ.match(/(\d+)\s*(?:th|st|nd|rd)?\s*(?:chapter|ch|lesson|unit|module|paath)/i);

  const numWordMap = {
    'one': '1', 'two': '2', 'three': '3', 'four': '4', 'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9', 'ten': '10',
    'eleven': '11', 'twelve': '12', 'thirteen': '13', 'fourteen': '14', 'fifteen': '15', 'sixteen': '16', 'seventeen': '17', 'eighteen': '18', 'nineteen': '19', 'twenty': '20',
    'i': '1', 'ii': '2', 'iii': '3', 'iv': '4', 'v': '5', 'vi': '6', 'vii': '7', 'viii': '8', 'ix': '9', 'x': '10',
    'xi': '11', 'xii': '12', 'xiii': '13', 'xiv': '14', 'xv': '15', 'xvi': '16', 'xvii': '17', 'xviii': '18', 'xix': '19', 'xx': '20'
  };

  let requestedChapterNum = '';
  if (chapterNumMatch && (chapterNumMatch[1] || chapterNumMatch[2])) {
    const rawNum = (chapterNumMatch[1] || chapterNumMatch[2]).toLowerCase();
    requestedChapterNum = numWordMap[rawNum] || rawNum.replace(/[^0-9]/g, '');
  }

  // In-text / Exercise question detection (e.g. "intext questions 7.1", "intext 7.1", "7.1 ka 3", "exercise 7.1", "7.1")
  const intextMatch = cleanQ.match(/(?:intext|exercise|ex\.?|q\.?|question)\s*(?:questions?|ex)?\s*(\d+\.?\d*)/i)
    || cleanQ.match(/\b(\d+\.\d+)\b/);
  const targetIntextNum = intextMatch && intextMatch[1] ? intextMatch[1] : '';

  // Detect if current query is a Follow-Up query to the previous conversation
  const isPureFollowUp = /^(?:isse|isko|iska|isme|is\s+topic|is\s+page|yeh|ye|this|that|it|aur|more|continue|further)\b/i.test(cleanQ)
    || /(?:isse\s+related|aur\s+batao|aur\s+samjhao|aur\s+detail|aur\s+info|explain\s+more|continue\s+this|what\s+else|give\s+examples?|formula\s+batao|practice\s+questions?)/i.test(cleanQ);

  let anchorPage = currentReaderPage;

  if (queryPageMatch && (queryPageMatch[1] || queryPageMatch[2])) {
    const pReq = parseInt(queryPageMatch[1] || queryPageMatch[2], 10);
    if (pReq >= 1 && pReq <= totalPages) {
      anchorPage = pReq;
    }
  } else if (isPureFollowUp) {
    const lastDiscussed = detectLastDiscussedPage(chatHistory, null);
    if (lastDiscussed && lastDiscussed >= 1 && lastDiscussed <= totalPages) {
      anchorPage = lastDiscussed;
    }
  }

  // Page Text map: pageNum -> { text, label }
  const matchedPagesMap = new Map();

  // Fast Full-Document Parallel Batch Scanning
  if (doc) {
    const maxScanPages = Math.min(doc.numPages, 500);
    const batchSize = 25;
    const pageScoring = []; // { page, score, label, text }

    // Keyword tokens for general search
    const queryTokens = cleanQ.split(/\s+/).filter(w => {
      return w.length > 2 && !['what','this','book','about','tell','explain','chapter','lesson','please','kya','yeh','hai','aur','batao','is','the','and','for','from','with','can','you','how','where','which','page','information','info','related','mein','ka','ke','ki','ko'].includes(w);
    });

    for (let i = 1; i <= maxScanPages; i += batchSize) {
      const pagePromises = [];
      for (let p = i; p < i + batchSize && p <= maxScanPages; p++) {
        pagePromises.push(getPdfPageText(doc, p, activeFileId).then(txt => ({ page: p, text: txt })));
      }
      const batchResults = await Promise.all(pagePromises);

      for (const res of batchResults) {
        if (!res.text || !res.text.trim()) continue;
        const lowerTxt = res.text.toLowerCase();
        let score = 0;
        let pageLabel = '';

        // 1. IN-TEXT / EXERCISE QUESTION MATCHING (CRITICAL)
        if (targetIntextNum) {
          const hasIntextNum = lowerTxt.includes(targetIntextNum);
          if (hasIntextNum) {
            const isAnswerKey = /answers?\s+to\s+intext|answer\s+key|hints?\s*&\s*solutions?|solutions?\s+to/i.test(lowerTxt);
            const isQuestionHeader = /intext\s+questions?|questions?\s+\d+\.\d+|exercise\s+\d+\.\d+|check\s+your\s+progress/i.test(lowerTxt);

            if (isQuestionHeader && !isAnswerKey) {
              // PRIMARY QUESTION PAGE (e.g. Page 103 with questions 1, 2, 3)
              score += 2500;
              pageLabel = `🎯 PRIMARY INTEXT QUESTIONS ${targetIntextNum} (EXACT QUESTIONS)`;
            } else if (isAnswerKey) {
              // OFFICIAL ANSWER KEY (e.g. Page 118 with answers)
              score += 1500;
              pageLabel = `🔑 TEXTBOOK ANSWER KEY FOR ${targetIntextNum}`;
            } else {
              // Lesson theory surrounding this section
              score += 800;
              pageLabel = `📖 LESSON THEORY (SECTION ${targetIntextNum})`;
            }
          }
        }

        // 2. CHAPTER / LESSON MATCHING
        if (requestedChapterNum) {
          // Check for Lesson X or Chapter X header
          const chRegex = new RegExp(`(?:chapter|unit|module|lesson|adhyaye?|paath)\\s*0*${requestedChapterNum}\\b|^\\s*0*${requestedChapterNum}\\s*\\.\\s*[A-Z]|\\b${requestedChapterNum}\\s*\\n\\s*[A-Z]`, 'im');
          const isTOC = /table\s+of\s+contents|contents|index/i.test(lowerTxt);

          if (chRegex.test(lowerTxt) && !isTOC) {
            score += 2000;
            pageLabel = `📖 CHAPTER/LESSON ${requestedChapterNum} START`;
          } else if (isTOC && new RegExp(`0*${requestedChapterNum}[\\s.:\\-]+[A-Za-z\\s]{2,40}`, 'i').test(lowerTxt)) {
            score += 600;
            pageLabel = `📑 TABLE OF CONTENTS (LESSON ${requestedChapterNum} LISTING)`;
          } else if (lowerTxt.includes(`section ${requestedChapterNum}.`) || lowerTxt.includes(`lesson ${requestedChapterNum}`) || lowerTxt.includes(`chapter ${requestedChapterNum}`)) {
            score += 900;
            pageLabel = `📖 LESSON ${requestedChapterNum} CONTENT`;
          }
        }

        // 3. EXACT MULTI-WORD PHRASE MATCH
        if (cleanQ.length > 5 && !isPureFollowUp && lowerTxt.includes(cleanQ)) {
          score += 500;
        }

        // 4. KEYWORD TOKEN MATCHING
        if (queryTokens.length > 0 && !isPureFollowUp) {
          let tokenMatches = 0;
          for (const token of queryTokens) {
            if (lowerTxt.includes(token)) {
              tokenMatches++;
            }
          }
          if (tokenMatches >= Math.min(2, queryTokens.length)) {
            score += (tokenMatches * 30);
          }
        }

        if (score > 0) {
          pageScoring.push({ page: res.page, score, label: pageLabel, text: res.text });
        }
      }
    }

    // Sort by highest relevance score
    pageScoring.sort((a, b) => b.score - a.score);

    // If a top scoring chapter or question page is found, re-anchor to it!
    if (pageScoring.length > 0 && pageScoring[0].score >= 800) {
      anchorPage = pageScoring[0].page;

      // Add top scored pages (up to 8 most relevant pages)
      for (const item of pageScoring.slice(0, 8)) {
        matchedPagesMap.set(item.page, { text: item.text, label: item.label });
      }

      // If a chapter start was found, include subsequent 4 consecutive pages for full chapter context
      if (requestedChapterNum && pageScoring[0].score >= 1500) {
        const startP = pageScoring[0].page;
        for (let p = startP; p <= Math.min(totalPages, startP + 5); p++) {
          if (!matchedPagesMap.has(p)) {
            const pTxt = await getPdfPageText(doc, p, activeFileId);
            if (pTxt && pTxt.trim()) {
              matchedPagesMap.set(p, { text: pTxt, label: `📖 LESSON ${requestedChapterNum} CONTINUATION` });
            }
          }
        }
      }
    }
  }

  // Always ensure anchor page & its immediate neighbor pages are seeded
  if (doc && matchedPagesMap.size < 3) {
    const startP = Math.max(1, anchorPage - 1);
    const endP = Math.min(totalPages, anchorPage + 1);
    for (let p = startP; p <= endP; p++) {
      if (!matchedPagesMap.has(p)) {
        const pTxt = await getPdfPageText(doc, p, activeFileId);
        if (pTxt && pTxt.trim()) {
          matchedPagesMap.set(p, { text: pTxt, label: p === anchorPage ? '⭐ ACTIVE FOCUS' : '' });
        }
      }
    }
  }

  let pageText = '';
  let prevPageText = '';
  let nextPageText = '';
  if (doc) {
    pageText = await getPdfPageText(doc, anchorPage, activeFileId);
    if (anchorPage > 1) {
      prevPageText = await getPdfPageText(doc, anchorPage - 1, activeFileId);
    }
    if (anchorPage < totalPages) {
      nextPageText = await getPdfPageText(doc, anchorPage + 1, activeFileId);
    }
  }

  // Convert matched pages map into structured grounded context
  const sortedPageNumbers = Array.from(matchedPagesMap.keys()).sort((a, b) => a - b);
  const chapterPages = sortedPageNumbers.map(p => {
    const item = matchedPagesMap.get(p);
    const labelStr = item.label ? ` - ${item.label}` : (p === anchorPage ? ' - ⭐ ACTIVE FOCUS' : '');
    return `--- [PAGE ${p} OF ${totalPages}${labelStr}] ---\n${item.text || item}`;
  });
  const chapterText = chapterPages.join('\n\n');

  // Extract Table of Contents / Intro (Pages 1 to 5) only if user is on page 1 or explicitly requested overview
  let bookOverviewText = '';
  if (doc && (selectedScope === 'book' || anchorPage <= 3)) {
    const samplePages = [];
    const maxIntro = Math.min(doc.numPages, 5);
    for (let p = 1; p <= maxIntro; p++) {
      const pTxt = await getPdfPageText(doc, p, activeFileId);
      if (pTxt && pTxt.trim()) {
        samplePages.push(`[Page ${p} Table of Contents/Overview]:\n${pTxt.slice(0, 1200)}`);
      }
    }
    bookOverviewText = samplePages.join('\n\n');
  }

  // User notes
  let userNotesText = '';
  try {
    const notes = await window.DB.byIndex('notes', 'fileId', activeFileId);
    if (notes && notes.length > 0) {
      userNotesText = notes.slice(0, 5).map(n => `- Note (Page ${n.page}): ${n.content}`).join('\n');
    }
  } catch(e) {}

  // 3. Real Cross-PDF Library Search (Extract real passages from other library documents)
  let crossPdfContext = '';
  if (crossPdfActive || options.includeCrossPdf || selectedScope === 'cross_pdf') {
    const otherFiles = (window.State?.files || []).filter(f => f.id !== activeFileId);
    if (otherFiles.length > 0 && userQuery && userQuery.trim().length > 2) {
      crossPdfContext = await searchCrossPdfLibrary(otherFiles, userQuery);
    } else if (otherFiles.length > 0) {
      crossPdfContext = otherFiles.slice(0, 10).map(f => {
        return `[Library Document: "${f.name}" | Pages: ${f.pageCount || 0} | Subject: "${f.subject || 'General'}"]`;
      }).join('\n');
    }
  }

  return {
    docTitle: fileRecord?.name || 'Academic Document',
    docId: activeFileId,
    folder: fileRecord?.folder || 'General',
    subject: fileRecord?.subject || '',
    currentPage: anchorPage,
    totalPages,
    pageText,
    prevPageText,
    nextPageText,
    chapterText,
    bookOverviewText,
    userNotesText,
    crossPdfContext
  };
}

// Deep Multi-Document RAG Search Across All PDF Files in Library
export async function searchCrossPdfLibrary(filesList, query) {
  if (!filesList || !filesList.length || !query) return '';
  const cleanQ = query.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const tokens = cleanQ.split(/\s+/).filter(w => w.length > 2 && !['what','this','book','about','tell','explain','chapter','please','kya','yeh','hai','aur','batao','is'].includes(w));
  if (!tokens.length) return '';

  const matchedSnippets = [];
  const targetFiles = filesList.slice(0, 8); // Search up to 8 other documents in parallel

  for (const f of targetFiles) {
    let doc = null;
    try {
      let fileData = f.data;
      if (!fileData) {
        const fullRec = await window.DB.get('files', f.id);
        fileData = fullRec?.data;
      }
      if (fileData && typeof pdfjsLib !== 'undefined') {
        doc = await pdfjsLib.getDocument({ data: fileData.slice(0), ...window.PDFJS_LOAD_OPTS }).promise;
      }
    } catch(err) {
      continue;
    }

    if (!doc) continue;

    const maxScan = Math.min(doc.numPages, 30);
    for (let p = 1; p <= maxScan; p++) {
      const pTxt = await getPdfPageText(doc, p, f.id);
      if (!pTxt) continue;
      const lower = pTxt.toLowerCase();
      const matchCount = tokens.filter(t => lower.includes(t)).length;
      if (matchCount >= 1 || (cleanQ.length > 4 && lower.includes(cleanQ))) {
        matchedSnippets.push(`[FROM LIBRARY BOOK: "${f.name}" - Page ${p}]:\n${pTxt.slice(0, 1200)}`);
        if (matchedSnippets.length >= 6) break;
      }
    }
    if (matchedSnippets.length >= 6) break;
  }

  if (matchedSnippets.length > 0) {
    return `--- RELEVANT CROSS-PDF PASSAGES RETRIEVED FROM YOUR LIBRARY ---\n${matchedSnippets.join('\n\n')}\n--- END CROSS-PDF RETRIEVAL ---`;
  }
  return '';
}

export async function loadTeacherChatHistory(fileId) {
  try {
    const record = await window.DB.get('chathistory', fileId);
    return record && Array.isArray(record.messages) ? record.messages : [];
  } catch(e) {
    return [];
  }
}

export async function saveTeacherChatHistory(fileId, messages) {
  try {
    await window.DB.put('chathistory', {
      id: fileId,
      fileId,
      messages: messages.slice(-50),
      updatedAt: Date.now()
    });
  } catch(e) {
    console.warn('Could not save teacher chat history', e);
  }
}

export async function clearTeacherChatHistory(fileId) {
  try {
    await window.DB.del('chathistory', fileId);
  } catch(e) {}
}

let activeContextScope = 'page'; // 'page' | 'chapter' | 'book'

export function openTeacherView(prefillQuery = '', defaultMode = 'professional', customFileId = null) {
  activeTeacherMode = defaultMode || 'professional';
  
  if (customFileId) {
    activeFileId = customFileId;
  } else if (window.State?.currentFile?.id) {
    activeFileId = window.State.currentFile.id;
  } else {
    activeFileId = 'global_chat';
  }

  const currentFile = window.State?.files?.find(f => f.id === activeFileId) || window.State?.currentFile;
  const isGlobal = activeFileId === 'global_chat' || !currentFile;
  const docTitle = isGlobal ? 'Library Universal Chat' : currentFile.name;
  const currentPage = (!isGlobal && window.State?.currentPage) ? window.State.currentPage : 1;
  const totalPages = (!isGlobal && window.State?.numPages) ? window.State.numPages : 1;

  // Render Full Screen AI Teacher Workspace View
  window.State.view = 'teacher';
  if (typeof window.stopReadingSession === 'function') window.stopReadingSession();
  if (typeof window.hideSelToolbar === 'function') window.hideSelToolbar();

  const getModeLabel = () => {
    const m = TEACHER_MODES.find(x => x.id === activeTeacherMode);
    return m ? m.label.split('(')[0].trim() : 'Academic';
  };

  const getScopeDisplay = () => {
    if (crossPdfActive) return '🌐 All Books';
    if (activeContextScope === 'chapter') return '📑 Chapter';
    if (activeContextScope === 'book') return '📚 Whole Book';
    return `📄 Page ${currentPage}`;
  };

  document.getElementById('app').innerHTML = `
  <div class="chat-workspace">
    
    <!-- Clean Minimalist Header: Back, Doc info, and Settings -->
    <header class="chat-top-bar" id="teacher-header">
      <div style="display:flex; align-items:center; gap:10px; min-width:0; flex:1;">
        <button class="btn btn-icon" id="teacher-back-btn" title="Back to Reader" style="width:34px; height:34px; border-radius:50%; background:var(--surface-2); border:1px solid var(--border); flex-shrink:0; color:var(--text);">
          ${window.icon('chevLeft','icon icon-sm')}
        </button>

        <div style="min-width:0;">
          <div style="font-size:14px; font-weight:700; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${window.escapeHtml(docTitle)}">
            ${window.escapeHtml(docTitle)}
          </div>
          <div style="font-size:11px; color:var(--text-dim); margin-top:1px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
            ${isGlobal ? 'Universal Library' : `Page ${currentPage} of ${totalPages}`} • <span style="color:#10b981; font-weight:600;">Grounded</span>
          </div>
        </div>
      </div>

      <!-- Single clean Settings button -->
      <button class="btn btn-icon" id="teacher-custom-toggle" title="Settings & Personas" style="width:34px; height:34px; border-radius:50%; background:var(--surface-2); border:1px solid var(--border); color:var(--text); flex-shrink:0;">
        ${window.icon('settings','icon icon-sm')}
      </button>
    </header>

    <!-- Main Clean Chat Log Scroll Container -->
    <div id="teacher-chat-log" class="chat-scroll-container no-scrollbar">
      <!-- Messages or Empty Hero injected here -->
    </div>

    <!-- Bottom Docked Area: Quick Suggestion Chips + Input Capsule -->
    <div style="flex-shrink:0; padding:6px 14px 12px; background:var(--bg); border-top:1px solid var(--border); max-width:760px; margin:0 auto; width:100%;">
      
      <!-- Quick Prompt Suggestion Chips -->
      <div id="chat-quick-chips-bar" style="display:flex; align-items:center; gap:6px; overflow-x:auto; padding-bottom:6px; scrollbar-width:none; -webkit-overflow-scrolling:touch;">
        <button class="chat-quick-chip" data-query="Summarize the core concepts of this page step-by-step with key takeaways">
          <span>⚡ Summarize Page</span>
        </button>
        <button class="chat-quick-chip" data-query="What are the top 2, 3 and 5 mark exam questions from this page with scoring points?">
          <span>🎯 Exam Questions</span>
        </button>
        <button class="chat-quick-chip" data-query="Explain this topic with a super simple real-world analogy and zero jargon">
          <span>💡 Simple Analogy</span>
        </button>
        <button class="chat-quick-chip" data-query="Give me a catchy mnemonic memory trick and formulas cheat sheet for this topic">
          <span>🧠 Memory Hacks</span>
        </button>
      </div>

      <!-- Minimalist Docked Input Capsule with Voice Mic -->
      <div class="chat-input-capsule" id="teacher-input-wrapper">
        <button class="btn btn-icon" id="teacher-input-mic-btn" title="Voice Input (Hindi / English)" style="width:32px; height:32px; border-radius:50%; background:transparent; border:none; color:var(--text-dim); flex-shrink:0; display:flex; align-items:center; justify-content:center;">
          ${window.icon('mic','icon icon-sm')}
        </button>

        <textarea id="teacher-input" class="no-scrollbar" rows="1" placeholder="Ask anything about this document..." style="flex:1; padding:6px 4px; font-size:13.5px; line-height:1.4; resize:none; max-height:120px; background:transparent; border:none; color:var(--text); outline:none; box-shadow:none; font-family:inherit;"></textarea>
        
        <button class="btn btn-primary" id="teacher-send-btn" title="Send Message" style="width:32px; height:32px; border-radius:50%; padding:0; flex-shrink:0; display:flex; align-items:center; justify-content:center; background:var(--accent); color:#fff; border:none;">
          ${window.icon('send','icon icon-xs')}
        </button>
      </div>
    </div>

  </div>`;

  initTeacherViewLogic(activeFileId, prefillQuery);
}

export async function initTeacherViewLogic(fileId, prefillQuery) {
  const chatLogEl = document.getElementById('teacher-chat-log');
  const inputEl = document.getElementById('teacher-input');
  const sendBtn = document.getElementById('teacher-send-btn');
  const backBtn = document.getElementById('teacher-back-btn');
  const customToggle = document.getElementById('teacher-custom-toggle');
  const inputMicBtn = document.getElementById('teacher-input-mic-btn');
  const inputWrapper = document.getElementById('teacher-input-wrapper');

  if (inputEl && inputWrapper) {
    inputEl.onfocus = () => { inputWrapper.style.borderColor = 'var(--accent)'; };
    inputEl.onblur = () => { inputWrapper.style.borderColor = 'var(--border)'; };
  }

  let chatMessages = await loadTeacherChatHistory(fileId);
  if (!chatMessages) chatMessages = [];

  // Filter out any stale auto-generated bulky welcome messages so we start completely clean
  chatMessages = chatMessages.filter(m => {
    if (!m || !m.text) return false;
    if (m.role === 'assistant' && (m.text.includes('Grounded in "') || m.text.includes('Universal Academic Tutor') || m.text.includes('Status: Ready for Chat'))) {
      return false;
    }
    return true;
  });

  const currentFile = window.State?.files?.find(f => f.id === fileId) || window.State?.currentFile;
  const isGlobal = fileId === 'global_chat' || !currentFile;
  const docTitle = isGlobal ? 'Library Universal Chat' : (currentFile ? currentFile.name : 'Document');
  const currentPage = (!isGlobal && window.State?.currentPage) ? window.State.currentPage : 1;

  function renderMessages() {
    if (!chatLogEl) return;

    if (chatMessages.length === 0) {
      chatLogEl.innerHTML = `
        <div class="chat-empty-hero">
          <div class="chat-empty-icon">${window.icon('book', 'icon icon-lg')}</div>
          <div class="chat-empty-title">${window.escapeHtml(docTitle)}</div>
          <div class="chat-empty-sub">Ask questions, request summaries, or explore concepts from ${isGlobal ? 'your library' : `Page ${currentPage}`}.</div>

          <!-- Humorous Pro-Tip & Instructions Card -->
          <div class="chat-humor-note-card">
            <div class="chat-humor-badge">
              <span>⚠️</span>
              <span>ZARURI SOOCHNA / PRO-TIP</span>
              <span>😂</span>
            </div>
            <div class="chat-humor-body">
              <div class="chat-humor-main">
                Direct <em>"Explain Chapter 3"</em> likhoge toh AI confuse ho ke existential crisis me chala jayega! 🤖🌀
              </div>
              <div class="chat-humor-sub">
                PDFs me chapters ke exact boundaries track karna mushkil hota hai. Best aur accurate results ke liye <strong>Topic ka Naam</strong> (e.g. <em>"Explain Photosynthesis"</em>) ya <strong>Page Number</strong> pucho — warna <em>Risk Aapka, Time Aapka!</em> 😉🎯
              </div>
            </div>

            <div class="chat-humor-chips">
              <button type="button" class="chat-humor-chip good" data-fill="Explain the core topic of Page ${currentPage} in simple terms with key takeaways">
                <span>🎯</span>
                <span>"Explain topic on Page ${currentPage}"</span>
              </button>
              <button type="button" class="chat-humor-chip good" data-fill="What are the high-yield exam questions from Page ${currentPage}?">
                <span>💡</span>
                <span>"Exam questions on Page ${currentPage}"</span>
              </button>
              <div class="chat-humor-chip bad" title="Yeh mat puchna warna AI ghoom jayega!">
                <span>❌</span>
                <span>"Explain Chapter X"</span>
              </div>
            </div>
          </div>
        </div>
      `;

      // Attach click events on empty state chips to prefill input
      chatLogEl.querySelectorAll('.chat-humor-chip.good').forEach(chip => {
        chip.onclick = () => {
          const fill = chip.getAttribute('data-fill');
          if (fill && inputEl) {
            inputEl.value = fill;
            inputEl.focus();
            inputEl.style.height = 'auto';
            inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
          }
        };
      });

      return;
    }

    let html = chatMessages.map((m, idx) => {
      const isUser = m.role === 'user';
      
      return `
        <div style="display:flex; flex-direction:column; align-self:${isUser ? 'flex-end' : 'flex-start'}; max-width:${isUser ? '85%' : '100%'}; width:auto;" id="msg-card-${idx}">
          <div style="display:flex; align-items:center; justify-content:${isUser ? 'flex-end' : 'flex-start'}; gap:6px; margin-bottom:3px; padding:0 4px;">
            <span style="font-size:11px; font-weight:700; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.04em;">
              ${isUser ? 'You' : 'AI Tutor'}
            </span>
            <span style="font-size:10px; color:var(--text-faint);">
              ${m.timestamp ? new Date(m.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : ''}
            </span>
            ${isUser ? `
              <button class="btn btn-icon btn-teacher-action" data-action="delete-msg" data-idx="${idx}" title="Delete message" style="width:20px; height:20px; border-radius:50%; background:transparent; border:none; color:var(--text-faint); margin-left:4px; display:inline-flex; align-items:center; justify-content:center; cursor:pointer;">
                ${window.icon('trash','icon icon-xs')}
              </button>
            ` : ''}
          </div>

          <div class="${isUser ? 'chat-msg-user-bubble' : 'chat-msg-ai-bubble selectable-text'}">
            ${isUser ? window.escapeHtml(m.text || '') : window.renderMarkdown(m.text || '')}
          </div>

          <!-- Bottom Message Utility Bar for actual AI replies -->
          ${!isUser && m.text !== '…' ? `
            <div style="display:flex; align-items:center; gap:6px; margin-top:6px; padding:2px 0;">
              <button class="btn btn-teacher-action" data-action="copy" data-idx="${idx}" title="Copy" style="height:24px; padding:0 8px; font-size:11px; font-weight:600; border-radius:12px; background:var(--surface-2); border:1px solid var(--border); color:var(--text-dim); gap:4px;">
                ${window.icon('copy','icon icon-xs')} <span>Copy</span>
              </button>
              <button class="btn btn-teacher-action" data-action="save-notes" data-idx="${idx}" title="Save as Note" style="height:24px; padding:0 8px; font-size:11px; font-weight:600; border-radius:12px; background:var(--surface-2); border:1px solid var(--border); color:var(--text-dim); gap:4px;">
                ${window.icon('note','icon icon-xs')} <span>Save Note</span>
              </button>
              <button class="btn btn-teacher-action" data-action="make-flashcard" data-idx="${idx}" title="Create Flashcard" style="height:24px; padding:0 8px; font-size:11px; font-weight:600; border-radius:12px; background:var(--surface-2); border:1px solid var(--border); color:var(--text-dim); gap:4px;">
                ${window.icon('cards','icon icon-xs')} <span>+ Flashcard</span>
              </button>
              <button class="btn btn-teacher-action" data-action="speak" data-idx="${idx}" title="Listen" style="height:24px; padding:0 8px; font-size:11px; font-weight:600; border-radius:12px; background:var(--surface-2); border:1px solid var(--border); color:var(--text-dim); gap:4px;">
                ${window.icon('volume','icon icon-xs')} <span>Listen</span>
              </button>
              <button class="btn btn-teacher-action" data-action="delete-msg" data-idx="${idx}" title="Delete" style="height:24px; width:24px; padding:0; border-radius:50%; background:var(--surface-2); border:1px solid var(--border); color:var(--text-faint); display:flex; align-items:center; justify-content:center;">
                ${window.icon('trash','icon icon-xs')}
              </button>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');

    chatLogEl.innerHTML = html;
    chatLogEl.scrollTop = chatLogEl.scrollHeight;
    bindMessageActionButtons();
  }

  function bindMessageActionButtons() {
    document.querySelectorAll('.btn-teacher-action').forEach(btn => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const idx = Number(btn.dataset.idx);
        const msg = chatMessages[idx];
        if (!msg) return;

        if (action === 'delete-msg') {
          chatMessages.splice(idx, 1);
          await saveTeacherChatHistory(fileId, chatMessages);
          renderMessages();
          window.toast('Message deleted 🗑️');
        } else if (action === 'speak') {
          btn.innerHTML = `${window.icon('volume','icon icon-xs')} <span>Speaking…</span>`;
          await speakWithElevenLabs(msg.text, {
            onEnd: () => {
              btn.innerHTML = `${window.icon('volume','icon icon-xs')} <span>Listen</span>`;
            }
          });
        } else if (action === 'copy') {
          const ok = await window.copyToClipboard(msg.text);
          window.toast(ok ? 'Copied explanation to clipboard' : 'Could not copy');
        } else if (action === 'save-notes') {
          const curPage = window.State?.currentPage || 1;
          await window.DB.put('notes', {
            id: window.uid(),
            fileId,
            page: curPage,
            kind: 'AI Tutor Note (' + (activeTeacherMode.toUpperCase()) + ')',
            content: msg.text,
            createdAt: Date.now()
          });
          window.toast('Saved to Notes! 📝');
        } else if (action === 'make-flashcard') {
          const frontPrompt = `Create ONE clean study flashcard from this educational explanation:\n"${(msg?.text || '').slice(0, 500)}"\n\nReturn strictly valid JSON: {"front": "question", "back": "answer"}`;
          try {
            const fetchAi = (typeof callServerGemini === 'function' ? callServerGemini : window.callServerGemini) || callAI || window.callAI;
            const res = await fetchAi(frontPrompt, 'Generate concise educational flashcard JSON only.');
            const match = res.match(/\{[\s\S]*\}/);
            if (match) {
              const parsed = JSON.parse(match[0]);
              await window.DB.put('flashcards', {
                id: window.uid(),
                fileId,
                front: parsed.front || 'Key Concept',
                back: parsed.back || (msg?.text || '').slice(0, 200),
                createdAt: Date.now(),
                due: Date.now(),
                reps: 0
              });
              window.toast('Flashcard created! View in Review tab 🎴');
            } else {
              throw new Error('Flashcard format fallback');
            }
          } catch(e) {
            await window.DB.put('flashcards', {
              id: window.uid(),
              fileId,
              front: `Key Concept on Page ${window.State?.currentPage || 1}`,
              back: (msg?.text || '').slice(0, 250),
              createdAt: Date.now(),
              due: Date.now(),
              reps: 0
            });
            window.toast('Flashcard created! View in Review tab 🎴');
          }
        }
      };
    });

    // Interactive Page Citation Chips click handler
    document.querySelectorAll('.inline-page-jump-chip').forEach(chip => {
      chip.onclick = async (e) => {
        e.stopPropagation();
        const pNum = Number(chip.dataset.page);
        if (pNum && activeFileId && activeFileId !== 'global_chat') {
          window.toast(`Navigating to Page ${pNum}… 📖`);
          if (typeof window.openReader === 'function') {
            await window.openReader(activeFileId, pNum);
          }
        }
      };
    });
  }

  renderMessages();

  // Open Customization Sheet (Includes In-Sheet Clear Chat Option)
  const openCustomizationSheet = () => {
    window.Sheet.open(`
      <div style="padding:4px 0;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
          <div>
            <div class="font-display" style="font-size:18px; font-weight:700; color:var(--text);">AI Tutor Settings</div>
            <div style="font-size:12px; color:var(--text-dim);">Configure teaching persona &amp; study parameters</div>
          </div>
          <button id="close-custom-sheet" class="btn btn-icon" style="width:32px; height:32px; border-radius:50%; flex-shrink:0;">
            ${window.icon('x','icon icon-sm')}
          </button>
        </div>

        <!-- Teaching Personas -->
        <div style="margin-bottom:16px;">
          <label style="font-size:12px; font-weight:700; color:var(--text-dim); display:block; margin-bottom:8px; text-transform:uppercase; letter-spacing:0.04em;">Teaching Persona</label>
          <div style="display:grid; grid-template-columns:1fr; gap:8px;">
            ${TEACHER_MODES.map(m => `
              <button class="btn custom-mode-opt ${activeTeacherMode === m.id ? 'active' : ''}" data-mode="${m.id}" style="display:flex; align-items:flex-start; text-align:left; gap:12px; padding:12px; border-radius:12px; background:${activeTeacherMode === m.id ? 'var(--accent-soft)' : 'var(--surface-2)'}; border:1.5px solid ${activeTeacherMode === m.id ? 'var(--accent)' : 'var(--border)'}; color:var(--text);">
                <div style="color:${activeTeacherMode === m.id ? 'var(--accent)' : 'var(--text-dim)'}; margin-top:2px;">
                  ${window.icon(m.icon, 'icon icon-md')}
                </div>
                <div style="flex:1;">
                  <div style="font-size:14px; font-weight:700; color:${activeTeacherMode === m.id ? 'var(--accent)' : 'var(--text)'};">${m.label}</div>
                  <div style="font-size:12px; color:var(--text-dim); margin-top:2px;">${m.desc}</div>
                </div>
              </button>
            `).join('')}
          </div>
        </div>

        <!-- Evaluator Marks Target -->
        <div id="custom-evaluator-sec" style="display:${activeTeacherMode === 'evaluator' ? 'block' : 'none'}; margin-bottom:16px; background:var(--surface-2); padding:12px; border-radius:12px; border:1px solid var(--border);">
          <label style="font-size:12px; font-weight:700; color:var(--text-dim); display:block; margin-bottom:8px;">Target Marks Rubric</label>
          <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:8px;">
            ${[2, 3, 5].map(pts => `
              <button class="btn custom-mark-opt ${examTargetMarks === pts ? 'active' : ''}" data-marks="${pts}" style="padding:8px; font-size:13px; font-weight:700; border-radius:8px; background:${examTargetMarks === pts ? 'var(--accent)' : 'var(--bg)'}; color:${examTargetMarks === pts ? '#fff' : 'var(--text)'}; border:1px solid ${examTargetMarks === pts ? 'var(--accent)' : 'var(--border)'};">
                ${pts} Marks
              </button>
            `).join('')}
          </div>
        </div>

        <!-- Chat Session Management (Clear Chat with In-Sheet Confirmation) -->
        <div style="border-top:1px solid var(--border); padding-top:14px;" id="clear-chat-container">
          <button class="btn" id="menu-clear-chat-btn" style="width:100%; padding:10px 14px; border-radius:10px; background:var(--danger-soft, rgba(239, 68, 68, 0.1)); border:1px solid var(--danger, #ef4444); color:var(--danger, #ef4444); font-size:13px; font-weight:700; gap:8px; justify-content:center;">
            ${window.icon('trash','icon icon-sm')}
            <span>Clear Chat History</span>
          </button>
          <div id="clear-chat-confirm-box" style="display:none; margin-top:10px; padding:12px; border-radius:10px; background:var(--surface-2); border:1px solid var(--border); text-align:center;">
            <div style="font-size:13px; font-weight:700; color:var(--text); margin-bottom:8px;">Are you sure you want to clear chat history?</div>
            <div style="display:flex; gap:8px; justify-content:center;">
              <button class="btn btn-primary" id="confirm-clear-yes" style="background:var(--danger, #ef4444); border-color:var(--danger, #ef4444); color:#fff; font-size:12px; padding:6px 14px; border-radius:8px;">Yes, Clear All</button>
              <button class="btn" id="confirm-clear-cancel" style="font-size:12px; padding:6px 14px; border-radius:8px;">Cancel</button>
            </div>
          </div>
        </div>
      </div>
    `);

    document.getElementById('close-custom-sheet').onclick = () => window.Sheet.close();

    const menuClearBtn = document.getElementById('menu-clear-chat-btn');
    const clearConfirmBox = document.getElementById('clear-chat-confirm-box');
    const confirmYesBtn = document.getElementById('confirm-clear-yes');
    const confirmCancelBtn = document.getElementById('confirm-clear-cancel');

    if (menuClearBtn && clearConfirmBox) {
      menuClearBtn.onclick = () => {
        menuClearBtn.style.display = 'none';
        clearConfirmBox.style.display = 'block';
      };
    }

    if (confirmCancelBtn && menuClearBtn && clearConfirmBox) {
      confirmCancelBtn.onclick = () => {
        clearConfirmBox.style.display = 'none';
        menuClearBtn.style.display = 'flex';
      };
    }

    if (confirmYesBtn) {
      confirmYesBtn.onclick = async () => {
        await clearTeacherChatHistory(fileId);
        chatMessages = [];
        await saveTeacherChatHistory(fileId, chatMessages);
        renderMessages();
        window.Sheet.close();
        window.toast('Chat history cleared 🗑️');
      };
    }

    document.querySelectorAll('.custom-mode-opt').forEach(btn => {
      btn.onclick = () => {
        activeTeacherMode = btn.dataset.mode;
        const evalSec = document.getElementById('custom-evaluator-sec');
        if (evalSec) evalSec.style.display = activeTeacherMode === 'evaluator' ? 'block' : 'none';
        
        document.querySelectorAll('.custom-mode-opt').forEach(b => {
          const isAct = b.dataset.mode === activeTeacherMode;
          b.style.background = isAct ? 'var(--accent-soft)' : 'var(--surface-2)';
          b.style.borderColor = isAct ? 'var(--accent)' : 'var(--border)';
        });

        window.toast(`Persona: ${btn.querySelector('div > div').textContent}`);
      };
    });

    document.querySelectorAll('.custom-mark-opt').forEach(btn => {
      btn.onclick = () => {
        examTargetMarks = Number(btn.dataset.marks);
        document.querySelectorAll('.custom-mark-opt').forEach(b => {
          const isAct = Number(b.dataset.marks) === examTargetMarks;
          b.style.background = isAct ? 'var(--accent)' : 'var(--bg)';
          b.style.color = isAct ? '#fff' : 'var(--text)';
          b.style.borderColor = isAct ? 'var(--accent)' : 'var(--border)';
        });
        window.toast(`Rubric set to ${examTargetMarks} Marks`);
      };
    });
  };

  if (customToggle) customToggle.onclick = openCustomizationSheet;

  // Quick Suggestion Chips Click
  document.querySelectorAll('.chat-quick-chip').forEach(chip => {
    chip.onclick = () => {
      const q = chip.dataset.query;
      if (q && inputEl) {
        inputEl.value = q;
        sendUserMessage();
      }
    };
  });

  // Real-time Voice Dictation in Input Box (Hindi-to-Hinglish + English Support with Deduplication and 3.5s Silence Auto-Stop)
  let isDictating = false;
  let dictationRecognition = null;
  let silenceTimer = null;
  let baseInputText = '';
  let accumulatedFinalText = '';

  function stopDictation(notifySilence = false) {
    if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
    if (dictationRecognition) {
      try { dictationRecognition.stop(); } catch(e) {}
      dictationRecognition = null;
    }
    isDictating = false;
    if (inputMicBtn) {
      inputMicBtn.style.color = 'var(--text-dim)';
      inputMicBtn.style.background = 'transparent';
      inputMicBtn.style.boxShadow = 'none';
    }
    if (notifySilence) {
      window.toast('Mic auto-stopped after silence 🎙️');
    }
  }

  function resetSilenceTimer() {
    if (silenceTimer) clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => {
      if (isDictating) {
        stopDictation(true);
      }
    }, 3500); // 3.5 seconds of silence auto-stops the mic
  }

  function toggleDictation() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      window.toast('Speech recognition is not supported in this browser tab.');
      return;
    }

    if (isDictating) {
      stopDictation(false);
      window.toast('Voice dictation stopped');
      return;
    }

    try {
      dictationRecognition = new SpeechRecognition();
      dictationRecognition.continuous = true;
      dictationRecognition.interimResults = true;
      // hi-IN recognizes Indian English & Hindi speech seamlessly
      dictationRecognition.lang = 'hi-IN';

      baseInputText = (inputEl ? inputEl.value : '').trim();
      accumulatedFinalText = '';

      dictationRecognition.onstart = () => {
        isDictating = true;
        if (inputMicBtn) {
          inputMicBtn.style.color = '#fff';
          inputMicBtn.style.background = 'var(--danger, #ef4444)';
          inputMicBtn.style.borderRadius = '50%';
          inputMicBtn.style.boxShadow = '0 0 10px rgba(239, 68, 68, 0.4)';
        }
        window.toast('Listening in Hindi/English... Speak now 🎙️');
        resetSilenceTimer();
      };

      dictationRecognition.onspeechstart = () => {
        resetSilenceTimer();
      };

      dictationRecognition.onspeechend = () => {
        resetSilenceTimer();
      };

      dictationRecognition.onresult = (event) => {
        resetSilenceTimer();

        let sessionFinal = '';
        let sessionInterim = '';

        for (let i = 0; i < event.results.length; ++i) {
          const res = event.results[i];
          const txt = res[0]?.transcript || '';
          if (res.isFinal) {
            sessionFinal += (sessionFinal ? ' ' : '') + txt;
          } else {
            sessionInterim += (sessionInterim ? ' ' : '') + txt;
          }
        }

        const totalSpoken = (sessionFinal + (sessionInterim ? ' ' + sessionInterim : '')).trim();
        // Transliterate Hindi words to clean Hinglish / Roman script
        const transliterated = transliterateDevanagariToHinglish(totalSpoken);
        const cleanSpoken = deduplicateSpokenPhrase(transliterated);

        if (inputEl) {
          const combined = baseInputText ? `${baseInputText} ${cleanSpoken}` : cleanSpoken;
          inputEl.value = combined.trim();
          inputEl.style.height = 'auto';
          inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
        }
      };

      dictationRecognition.onerror = (err) => {
        console.warn('Dictation notice:', err);
        stopDictation(false);
        if (err.error === 'not-allowed') {
          window.toast('Microphone permission was denied. Please grant permission.');
        }
      };

      dictationRecognition.onend = () => {
        if (isDictating) {
          stopDictation(false);
        }
      };

      dictationRecognition.start();
    } catch(err) {
      console.error('Dictation start error:', err);
      window.toast('Could not start microphone: ' + err.message);
    }
  }

  if (inputMicBtn) {
    inputMicBtn.onclick = () => toggleDictation();
  }

  async function sendUserMessage(overrideText = null) {
    const userText = (overrideText || inputEl?.value || '').trim();
    if (!userText || sendBtn.disabled) return;

    if (isDictating) {
      stopDictation(false);
    }

    chatMessages.push({
      role: 'user',
      text: userText,
      timestamp: Date.now()
    });
    if (inputEl) {
      inputEl.value = '';
      inputEl.style.height = 'auto';
    }
    
    chatMessages.push({
      role: 'assistant',
      text: '…',
      mode: activeTeacherMode,
      timestamp: Date.now()
    });

    renderMessages();
    sendBtn.disabled = true;

    try {
      const ctx = await getTeacherContext({ includeCrossPdf: crossPdfActive, scope: activeContextScope }, userText, chatMessages);
      
      // Update UI with detected or anchor page
      const scopePageNumEl = document.getElementById('scope-page-num');
      const headerPageBadge = document.getElementById('teacher-header-page-badge');
      if (scopePageNumEl && ctx.currentPage) scopePageNumEl.textContent = ctx.currentPage;
      if (headerPageBadge && ctx.currentPage && fileId !== 'global_chat') headerPageBadge.textContent = `PAGE ${ctx.currentPage}`;
      
      let systemPersonaInstruction = '';
      if (activeTeacherMode === 'eli5') {
        systemPersonaInstruction = 'Explain using simple, intuitive everyday analogies with zero unnecessary jargon.';
      } else if (activeTeacherMode === 'mnemonics') {
        systemPersonaInstruction = 'Focus on memory hooks, creative acronyms, and quick recall tricks for easy retention.';
      } else if (activeTeacherMode === 'evaluator') {
        systemPersonaInstruction = `Evaluate according to standard exam marking rubrics (${examTargetMarks} Marks Target), highlighting scoring keywords.`;
      } else {
        systemPersonaInstruction = 'Act as an intelligent, articulate, and friendly AI study tutor.';
      }

      const recentConvo = chatMessages.slice(-6, -1).map(m => `${m.role === 'user' ? 'Student' : 'AI Tutor'}: ${m.text}`).join('\n\n');

      let replyText = '';
      try {
        const customKey = window.State?.customGeminiKey || (typeof localStorage !== 'undefined' ? localStorage.getItem('sayad_custom_gemini_key') : '');
        const resp = await fetch('/api/ai/hybrid-tutor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userQuestion: userText,
            docTitle: ctx.docTitle,
            currentPage: ctx.currentPage,
            totalPages: ctx.totalPages,
            chapterText: ctx.chapterText || ctx.pageText,
            fullContext: ctx.chapterText || ctx.pageText || ctx.bookOverviewText,
            persona: systemPersonaInstruction,
            language: 'English/Hinglish (matching the student natural inquiry)',
            chatHistory: chatMessages.slice(-10, -2).filter(m => m.text && m.text !== '…').map(m => ({ role: m.role, text: m.text })),
            customKey: customKey || undefined
          })
        });

        if (resp.ok) {
          const data = await resp.json();
          if (data && data.text) {
            replyText = data.text;
          }
        }
      } catch (hybridErr) {
        console.warn('Hybrid tutor endpoint fallback:', hybridErr);
      }

      if (!replyText) {
        try {
          const fullPrompt = `You are S.A.Y.A.D. AI — an unrestricted, world-class Academic AI Tutor and Universal Super-Intelligence.

${systemPersonaInstruction}

DIRECTIVES & QUESTION-SOLVING PROTOCOL:
1. **IN-TEXT & EXERCISE QUESTIONS**:
   - Always extract the REAL, EXACT question statement from the reference document passages labeled \`🎯 PRIMARY INTEXT QUESTIONS\` or \`EXACT QUESTIONS\`.
   - ❌ NEVER invent or hallucinate fake questions.
   - If the PDF has no answer key: Solve the question completely and step-by-step from the lesson theory and your academic knowledge.
   - If the PDF has an answer key: State the question, explain the full derivation/solution, and incorporate the textbook key points.
2. **CHAPTER & LESSON QUERIES (e.g. "Chapter 8 kya hai", "Lesson 4")**:
   - Provide a complete, structured breakdown (Theme, Concepts, Timeline, Exam Questions).
   - ❌ NEVER say "not in this book" or "currently on page 1".
3. **UNIVERSAL ACADEMIC COVERAGE**:
   - Answer any query across all subjects with authoritative clarity.

STUDENT QUESTION: "${userText}"
${recentConvo ? `\nPREVIOUS CHAT:\n${recentConvo}\n` : ''}
${ctx.chapterText || ctx.pageText ? `\nREFERENCE DOCUMENT PASSAGES:\n${ctx.chapterText || ctx.pageText}\n` : ''}

Provide the complete academic answer now:`;

          const fetchAi = (typeof callServerGemini === 'function' ? callServerGemini : window.callServerGemini) || callAI || window.callAI;
          if (typeof fetchAi === 'function') {
            replyText = await fetchAi(fullPrompt, systemPersonaInstruction, 'gemini-3.7-flash');
          }
        } catch (fetchErr) {
          console.warn('Direct AI fallback warning:', fetchErr);
        }
      }

      if (!replyText) {
        replyText = `Mujhe aapki request process karne me thodi problem aayi. Kripya apna sawaal dobara poochhein ya question yahan paste karein, main turant madad karunga!`;
      }

      chatMessages[chatMessages.length - 1] = {
        role: 'assistant',
        text: replyText,
        mode: activeTeacherMode,
        timestamp: Date.now()
      };

      await saveTeacherChatHistory(fileId, chatMessages);
    } catch(err) {
      console.error('Teacher AI Error:', err);
      chatMessages[chatMessages.length - 1] = {
        role: 'assistant',
        text: `Kripya apna question dobara type karein ya poochhein, main madad ke liye taiyar hoon!`,
        mode: activeTeacherMode,
        timestamp: Date.now()
      };
    }

    sendBtn.disabled = false;
    renderMessages();
  }

  // Bind Send & Input events
  if (sendBtn) sendBtn.onclick = () => sendUserMessage();
  if (inputEl) {
    inputEl.onkeydown = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendUserMessage();
      }
    };
    inputEl.oninput = () => {
      inputEl.style.height = 'auto';
      inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
    };
  }

  // Back button returns to reader or dashboard
  if (backBtn) {
    backBtn.onclick = () => {
      stopElevenAudio();
      if (isVoiceListening) stopVoiceRecognition();
      if (isDictating && dictationRecognition) {
        try { dictationRecognition.stop(); } catch(e) {}
      }
      if (window.State?.currentDoc && window.State?.currentFile?.id === fileId) {
        window.State.view = 'reader';
        window.renderReaderShell();
        window.mountReaderContent();
      } else {
        window.State.view = 'dashboard';
        window.renderDashboard();
      }
    };
  }

  // If there was a prefilled query, trigger it
  if (prefillQuery && prefillQuery.trim()) {
    if (inputEl) inputEl.value = prefillQuery.trim();
    sendUserMessage(prefillQuery.trim());
  }
}

export function startVoiceRecognition(onFinalTranscript) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    window.toast('Speech recognition is not supported in this browser tab.');
    return;
  }

  try {
    speechRecognitionInstance = new SpeechRecognition();
    speechRecognitionInstance.continuous = false;
    speechRecognitionInstance.interimResults = true;
    speechRecognitionInstance.lang = navigator.language || 'en-US';

    const waveformEl = document.getElementById('teacher-voice-waveform');
    const voiceStatusEl = document.getElementById('teacher-voice-status');
    const voiceBtn = document.getElementById('teacher-voice-toggle');

    if (waveformEl) waveformEl.style.display = 'flex';
    if (voiceBtn) {
      voiceBtn.style.background = 'var(--danger, #ef4444)';
      voiceBtn.style.color = '#fff';
    }
    isVoiceListening = true;

    speechRecognitionInstance.onresult = (event) => {
      const transcript = Array.from(event.results).map(r => r[0].transcript).join('');
      if (voiceStatusEl) voiceStatusEl.textContent = `🎙️ "${transcript}"`;
      if (event.results[0].isFinal) {
        stopVoiceRecognition();
        if (onFinalTranscript && transcript.trim()) {
          onFinalTranscript(transcript.trim());
        }
      }
    };

    speechRecognitionInstance.onerror = (err) => {
      console.warn('Speech error', err);
      stopVoiceRecognition();
      if (err.error === 'not-allowed') {
        window.toast('Microphone permission required for voice study.');
      } else {
        window.toast('Voice recognition ended');
      }
    };

    speechRecognitionInstance.onend = () => {
      stopVoiceRecognition();
    };

    speechRecognitionInstance.start();
    window.toast('Listening... Speak your question 🎙️');
  } catch(e) {
    console.error('Speech init error', e);
    stopVoiceRecognition();
    window.toast('Could not start voice recognition: ' + e.message);
  }
}

export function stopVoiceRecognition() {
  isVoiceListening = false;
  if (speechRecognitionInstance) {
    try { speechRecognitionInstance.stop(); } catch(e) {}
    speechRecognitionInstance = null;
  }
  const waveformEl = document.getElementById('teacher-voice-waveform');
  const voiceBtn = document.getElementById('teacher-voice-toggle');
  if (waveformEl) waveformEl.style.display = 'none';
  if (voiceBtn) {
    voiceBtn.style.background = 'var(--surface-2)';
    voiceBtn.style.color = 'var(--text)';
  }
}

// Global binds
window.openTeacherView = openTeacherView;
window.getTeacherContext = getTeacherContext;
window.loadTeacherChatHistory = loadTeacherChatHistory;
window.saveTeacherChatHistory = saveTeacherChatHistory;
window.clearTeacherChatHistory = clearTeacherChatHistory;
