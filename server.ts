import dotenv from "dotenv";
dotenv.config();

import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { MICROSOFT_NEURAL_VOICES, synthesizeMicrosoftTTS } from "./server/microsoft_tts.ts";

// -------------------------------------------------------------
// DYNAMIC MULTI-KEY GEMINI POOL MANAGER
// -------------------------------------------------------------

interface KeySlot {
  key: string;
  tag: string;
  cooldownUntil: number;
}

class GeminiKeyPool {
  private clientCache = new Map<string, GoogleGenAI>();
  private studyKeys: KeySlot[] = [];
  private chatKeys: KeySlot[] = [];
  private backupKeys: KeySlot[] = [];
  private allKeys: KeySlot[] = [];
  private studyRoundRobinIdx = 0;
  private chatRoundRobinIdx = 0;
  private generalRoundRobinIdx = 0;

  constructor() {
    this.refreshKeys();
  }

  public refreshKeys() {
    // Study Keys (2 dedicated)
    const rawStudy1 = (process.env.GEMINI_STUDY_KEY_1 || "").trim();
    const rawStudy2 = (process.env.GEMINI_STUDY_KEY_2 || "").trim();

    // Book AI Chat Keys (5 dedicated)
    const rawChat1 = (process.env.GEMINI_CHAT_KEY_1 || "").trim();
    const rawChat2 = (process.env.GEMINI_CHAT_KEY_2 || "").trim();
    const rawChat3 = (process.env.GEMINI_CHAT_KEY_3 || "").trim();
    const rawChat4 = (process.env.GEMINI_CHAT_KEY_4 || "").trim();
    const rawChat5 = (process.env.GEMINI_CHAT_KEY_5 || "").trim();

    // Backups & General
    const rawBackup1 = (process.env.GEMINI_BACKUP_KEY_1 || "").trim();
    const rawBackupList = (process.env.GEMINI_BACKUP_KEYS || "").split(",").map(k => k.trim()).filter(Boolean);
    const rawDefault = (process.env.GEMINI_API_KEY || "").trim();

    // Numbered keys support (e.g. GEMINI_KEY_1 to GEMINI_KEY_10)
    const rawKey1 = (process.env.GEMINI_KEY_1 || "").trim();
    const rawKey2 = (process.env.GEMINI_KEY_2 || "").trim();
    const rawKey3 = (process.env.GEMINI_KEY_3 || "").trim();
    const rawKey4 = (process.env.GEMINI_KEY_4 || "").trim();
    const rawKey5 = (process.env.GEMINI_KEY_5 || "").trim();
    const rawKey6 = (process.env.GEMINI_KEY_6 || "").trim();
    const rawKey7 = (process.env.GEMINI_KEY_7 || "").trim();
    const rawKey8 = (process.env.GEMINI_KEY_8 || "").trim();
    const rawKey9 = (process.env.GEMINI_KEY_9 || "").trim();
    const rawKey10 = (process.env.GEMINI_KEY_10 || "").trim();

    const seen = new Set<string>();
    const studySlots: KeySlot[] = [];
    const chatSlots: KeySlot[] = [];
    const backupSlots: KeySlot[] = [];
    const allSlots: KeySlot[] = [];

    const addKey = (key: string, tag: string, pool: 'study' | 'chat' | 'backup' | 'all') => {
      if (!key || seen.has(key)) return;
      seen.add(key);
      const slot: KeySlot = { key, tag, cooldownUntil: 0 };
      if (pool === 'study' || pool === 'all') studySlots.push(slot);
      if (pool === 'chat' || pool === 'all') chatSlots.push(slot);
      if (pool === 'backup' || pool === 'all') backupSlots.push(slot);
      allSlots.push(slot);
    };

    // 1. Dedicated Study Tools Keys (2)
    if (rawStudy1) addKey(rawStudy1, "study-key-1", "study");
    if (rawStudy2) addKey(rawStudy2, "study-key-2", "study");

    // 2. Dedicated Book AI Chat Keys (5)
    if (rawChat1) addKey(rawChat1, "chat-key-1", "chat");
    if (rawChat2) addKey(rawChat2, "chat-key-2", "chat");
    if (rawChat3) addKey(rawChat3, "chat-key-3", "chat");
    if (rawChat4) addKey(rawChat4, "chat-key-4", "chat");
    if (rawChat5) addKey(rawChat5, "chat-key-5", "chat");

    // 3. Backup Key
    if (rawBackup1) addKey(rawBackup1, "backup-key-1", "backup");
    rawBackupList.forEach((k, idx) => addKey(k, `backup-key-${idx + 2}`, "backup"));

    // 4. Numbered keys mapping (if provided as GEMINI_KEY_1..10)
    if (rawKey1) addKey(rawKey1, "key-1 (study)", "study");
    if (rawKey2) addKey(rawKey2, "key-2 (study)", "study");
    if (rawKey3) addKey(rawKey3, "key-3 (chat)", "chat");
    if (rawKey4) addKey(rawKey4, "key-4 (chat)", "chat");
    if (rawKey5) addKey(rawKey5, "key-5 (chat)", "chat");
    if (rawKey6) addKey(rawKey6, "key-6 (chat)", "chat");
    if (rawKey7) addKey(rawKey7, "key-7 (chat)", "chat");
    if (rawKey8) addKey(rawKey8, "key-8 (backup)", "backup");
    if (rawKey9) addKey(rawKey9, "key-9 (backup)", "backup");
    if (rawKey10) addKey(rawKey10, "key-10 (backup)", "backup");

    // 5. Default Gemini Key (universal fallback for all pools)
    if (rawDefault) addKey(rawDefault, "primary-default-key", "all");

    this.studyKeys = studySlots;
    this.chatKeys = chatSlots;
    this.backupKeys = backupSlots;
    this.allKeys = allSlots;

    console.log(`[GeminiKeyPool] Initialized: ${this.studyKeys.length} Study Key(s), ${this.chatKeys.length} Book Chat Key(s), ${this.backupKeys.length} Backup Key(s), ${this.allKeys.length} Total Unique Key(s).`);
  }

  public getClient(key: string): GoogleGenAI {
    if (!this.clientCache.has(key)) {
      this.clientCache.set(key, new GoogleGenAI({
        apiKey: key,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      }));
    }
    return this.clientCache.get(key)!;
  }

  public markCooldown(key: string, ms = 45000) {
    const slot = this.allKeys.find(s => s.key === key);
    if (slot) {
      slot.cooldownUntil = Date.now() + ms;
      console.warn(`[GeminiKeyPool] Marked key [${slot.tag}] on cooldown for ${ms / 1000}s`);
    }
  }

  public getOrderedKeysForTool(category: 'study' | 'chat' | 'general'): KeySlot[] {
    const now = Date.now();
    let primaryPool: KeySlot[] = [];
    let fallbackPool: KeySlot[] = [];

    if (category === 'chat') {
      primaryPool = [...this.chatKeys];
      fallbackPool = [...this.backupKeys, ...this.studyKeys, ...this.allKeys];
    } else if (category === 'study') {
      primaryPool = [...this.studyKeys];
      fallbackPool = [...this.backupKeys, ...this.chatKeys, ...this.allKeys];
    } else {
      primaryPool = [...this.allKeys];
      fallbackPool = [...this.backupKeys];
    }

    // Deduplicate within pools
    const dedup = (list: KeySlot[]) => {
      const u: KeySlot[] = [];
      const keysSeen = new Set<string>();
      list.forEach(s => {
        if (!keysSeen.has(s.key)) {
          keysSeen.add(s.key);
          u.push(s);
        }
      });
      return u;
    };

    primaryPool = dedup(primaryPool);
    fallbackPool = dedup(fallbackPool.filter(s => !primaryPool.some(p => p.key === s.key)));

    // Rotate primary pool for load balancing
    if (primaryPool.length > 1) {
      if (category === 'chat') {
        const offset = this.chatRoundRobinIdx++ % primaryPool.length;
        primaryPool = [...primaryPool.slice(offset), ...primaryPool.slice(0, offset)];
      } else if (category === 'study') {
        const offset = this.studyRoundRobinIdx++ % primaryPool.length;
        primaryPool = [...primaryPool.slice(offset), ...primaryPool.slice(0, offset)];
      } else {
        const offset = this.generalRoundRobinIdx++ % primaryPool.length;
        primaryPool = [...primaryPool.slice(offset), ...primaryPool.slice(0, offset)];
      }
    }

    const fullSequence = [...primaryPool, ...fallbackPool];
    // Put healthy keys first, cooled-down keys last
    return fullSequence.sort((a, b) => {
      const aReady = a.cooldownUntil <= now ? 0 : 1;
      const bReady = b.cooldownUntil <= now ? 0 : 1;
      return aReady - bReady;
    });
  }

  public hasAnyKey(): boolean {
    return this.allKeys.length > 0;
  }

  public getStatus() {
    return {
      totalKeys: this.allKeys.length,
      studyKeysCount: this.studyKeys.length,
      chatKeysCount: this.chatKeys.length,
      backupKeysCount: this.backupKeys.length,
      slots: this.allKeys.map(s => ({
        tag: s.tag,
        isHealthy: s.cooldownUntil <= Date.now(),
        cooldownRemainingSec: Math.max(0, Math.ceil((s.cooldownUntil - Date.now()) / 1000))
      }))
    };
  }
}

const keyPool = new GeminiKeyPool();

// Execute Gemini prompt across the key pool with powerful models
async function executeWithGeminiPool(
  category: 'study' | 'chat' | 'general',
  prompt: string,
  options: {
    systemInstruction?: string;
    targetModel?: string;
    temperature?: number;
    responseMimeType?: string;
    customKey?: string;
  } = {}
): Promise<{ text: string; model: string; keyTag: string } | null> {
  // If user provided custom key (BYOK), prioritize it as top slot
  let slots = keyPool.getOrderedKeysForTool(category);
  if (options.customKey && typeof options.customKey === 'string' && options.customKey.trim().length > 10) {
    const customSlot: KeySlot = {
      key: options.customKey.trim(),
      tag: 'User Personal Custom Key',
      cooldownUntil: 0,
    };
    slots = [customSlot, ...slots];
  }
  if (!slots.length) return null;

  // Ultra-fast, high-availability model queue:
  // Primary: 'gemini-3.1-flash-lite' (high quota, ultra-low latency ~0.8s, immune to 503 demand spikes)
  // Secondary: 'gemini-3.7-flash'
  const modelQueue = Array.from(new Set([
    options.targetModel || "gemini-3.1-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-3.7-flash",
  ].filter(Boolean) as string[]));

  const config: any = {
    temperature: typeof options.temperature === "number" ? options.temperature : 0.22,
    maxOutputTokens: 8192,
  };
  if (options.systemInstruction) {
    config.systemInstruction = options.systemInstruction;
  }
  if (options.responseMimeType) {
    config.responseMimeType = options.responseMimeType;
  }

  // Iterate over healthy slots
  for (const slot of slots) {
    const ai = keyPool.getClient(slot.key);
    for (const modelName of modelQueue) {
      try {
        const timeoutMs = 30000;
        const timeoutPromise = new Promise<{ text?: string; isTimeout: boolean }>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout ${timeoutMs}ms for ${modelName}`)), timeoutMs)
        );

        const generatePromise = (async () => {
          const resp = await ai.models.generateContent({
            model: modelName,
            contents: prompt,
            config,
          });
          return { text: resp.text, isTimeout: false };
        })();

        const response: any = await Promise.race([generatePromise, timeoutPromise]);
        const text = response.text || "";
        if (text && text.trim()) {
          return {
            text: text.trim(),
            model: modelName,
            keyTag: slot.tag,
          };
        }
      } catch (err: any) {
        const msg = err?.message || String(err);
        console.log(`[Gemini Attempt Info] Key: [${slot.tag}] Model: [${modelName}] Note: ${msg.slice(0, 100)}`);
        
        // 1. Quota exhaustion (429 / RESOURCE_EXHAUSTED) -> specific to key, cooldown key and switch to next slot
        if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("quota")) {
          keyPool.markCooldown(slot.key, 60000);
          break; // Switch to next key in pool
        }
        
        // 2. High demand / temporary overload (503 / 500 / 504 / UNAVAILABLE) -> model-specific spike!
        // Do NOT break out of the key loop; immediately proceed to next fallback model in queue (e.g. gemini-3.1-flash-lite)
        if (msg.includes("503") || msg.includes("UNAVAILABLE") || msg.includes("high demand") || msg.includes("500") || msg.includes("504")) {
          continue; // Try next model in modelQueue on same key
        }

        // 3. Timeout or other error -> try next model in queue
        continue;
      }
    }
  }
  return null;
}

async function executeWithGroq(prompt: string, systemInstruction?: string, temperature = 0.3): Promise<string | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  const models = ["openai/gpt-oss-120b", "qwen/qwen3.6-27b", "openai/gpt-oss-20b"];
  for (const model of models) {
    try {
      const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            ...(systemInstruction ? [{ role: "system", content: systemInstruction }] : []),
            { role: "user", content: prompt }
          ],
          temperature,
          max_tokens: 3500
        }),
      });

      if (resp.ok) {
        const data: any = await resp.json();
        const text = data?.choices?.[0]?.message?.content;
        if (text && text.trim()) return text.trim();
      }
    } catch (err: any) {
      console.warn(`[Groq Failover] Model ${model} error:`, err?.message);
    }
  }
  return null;
}

async function executeWithOpenRouter(prompt: string, systemInstruction?: string, temperature = 0.3): Promise<string | null> {
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_AI;
  if (!apiKey) return null;

  const models = ["meta-llama/llama-3.3-70b-instruct", "mistralai/mistral-small-24b-instruct-2501:free"];
  for (const model of models) {
    try {
      const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          "HTTP-Referer": "https://aistudio.google.com",
          "X-Title": "SAYAD Super Tutor"
        },
        body: JSON.stringify({
          model,
          messages: [
            ...(systemInstruction ? [{ role: "system", content: systemInstruction }] : []),
            { role: "user", content: prompt }
          ],
          temperature,
        }),
      });

      if (resp.ok) {
        const data: any = await resp.json();
        const text = data?.choices?.[0]?.message?.content;
        if (text && text.trim()) return text.trim();
      }
    } catch (err: any) {
      console.warn(`[OpenRouter Failover] Model ${model} error:`, err?.message);
    }
  }
  return null;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "30mb" }));

  // Health check & Key Pool Diagnostics
  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      keyPool: keyPool.getStatus(),
      groqConfigured: !!process.env.GROQ_API_KEY,
      openRouterConfigured: !!process.env.OPENROUTER_API_KEY,
      elevenLabsConfigured: !!process.env.ELEVENLABS_API_KEY,
    });
  });

  // Comprehensive Key Diagnostics & Live Responsiveness Test
  app.get("/api/keys-diagnostics", async (req, res) => {
    try {
      const envKeys = [
        { varName: "GEMINI_API_KEY", tag: "Primary Default Fallback", pool: "Universal" },
        { varName: "GEMINI_STUDY_KEY_1", tag: "Dedicated Study Key #1", pool: "Study Tools" },
        { varName: "GEMINI_STUDY_KEY_2", tag: "Dedicated Study Key #2", pool: "Study Tools" },
        { varName: "GEMINI_CHAT_KEY_1", tag: "Dedicated Book Chat Key #1", pool: "Book AI Chat" },
        { varName: "GEMINI_CHAT_KEY_2", tag: "Dedicated Book Chat Key #2", pool: "Book AI Chat" },
        { varName: "GEMINI_CHAT_KEY_3", tag: "Dedicated Book Chat Key #3", pool: "Book AI Chat" },
        { varName: "GEMINI_CHAT_KEY_4", tag: "Dedicated Book Chat Key #4", pool: "Book AI Chat" },
        { varName: "GEMINI_CHAT_KEY_5", tag: "Dedicated Book Chat Key #5", pool: "Book AI Chat" },
        { varName: "GEMINI_BACKUP_KEY_1", tag: "Emergency Backup Key #1", pool: "Failover" },
        { varName: "GROQ_API_KEY", tag: "Groq High-Speed LLaMA/GPT", pool: "Backup LLM" },
        { varName: "OPENROUTER_API_KEY", tag: "OpenRouter Multi-Model", pool: "Backup LLM" },
        { varName: "ELEVENLABS_API_KEY", tag: "ElevenLabs Voice TTS", pool: "Audio Synthesis" },
      ];

      const valMap = new Map<string, string[]>();
      const results: any[] = [];

      for (const item of envKeys) {
        const val = (process.env[item.varName] || "").trim();
        if (!val) {
          results.push({
            variable: item.varName,
            tag: item.tag,
            pool: item.pool,
            configured: false,
            status: "not_configured",
            message: "Variable not set in environment"
          });
          continue;
        }

        if (!valMap.has(val)) {
          valMap.set(val, []);
        }
        valMap.get(val)!.push(item.varName);

        const preview = `${val.substring(0, 6)}...${val.substring(val.length - 4)}`;
        let isResponsive = false;
        let latencyMs = 0;
        let errorMessage = "";

        if (item.varName.startsWith("GEMINI_")) {
          const t0 = Date.now();
          try {
            const ai = keyPool.getClient(val);
            const resp = await ai.models.generateContent({
              model: "gemini-3.1-flash-lite",
              contents: "ping",
            });
            latencyMs = Date.now() - t0;
            isResponsive = !!(resp && resp.text);
          } catch (err: any) {
            latencyMs = Date.now() - t0;
            errorMessage = err.message || "Failed to respond";
          }
        } else if (item.varName === "GROQ_API_KEY") {
          const t0 = Date.now();
          try {
            const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${val}` },
              body: JSON.stringify({ model: "openai/gpt-oss-20b", messages: [{ role: "user", content: "ping" }] })
            });
            latencyMs = Date.now() - t0;
            isResponsive = resp.ok;
          } catch (err: any) {
            latencyMs = Date.now() - t0;
            errorMessage = err.message;
          }
        } else if (item.varName === "OPENROUTER_API_KEY") {
          const t0 = Date.now();
          try {
            const resp = await fetch("https://openrouter.ai/api/v1/auth/key", {
              headers: { "Authorization": `Bearer ${val}` }
            });
            latencyMs = Date.now() - t0;
            isResponsive = resp.ok;
          } catch (err: any) {
            latencyMs = Date.now() - t0;
            errorMessage = err.message;
          }
        } else if (item.varName === "ELEVENLABS_API_KEY") {
          const t0 = Date.now();
          try {
            const resp = await fetch("https://api.elevenlabs.io/v1/user", {
              headers: { "xi-api-key": val }
            });
            latencyMs = Date.now() - t0;
            isResponsive = resp.ok;
            if (!resp.ok) errorMessage = `Status ${resp.status}`;
          } catch (err: any) {
            latencyMs = Date.now() - t0;
            errorMessage = err.message;
          }
        }

        results.push({
          variable: item.varName,
          tag: item.tag,
          pool: item.pool,
          configured: true,
          preview,
          responsive: isResponsive,
          latencyMs,
          error: errorMessage || null
        });
      }

      // Check duplicates
      const duplicateDetails: any[] = [];
      valMap.forEach((vars, val) => {
        if (vars.length > 1) {
          duplicateDetails.push({
            keyPreview: `${val.substring(0, 6)}...${val.substring(val.length - 4)}`,
            usedInVariables: vars
          });
        }
      });

      res.json({
        totalVariablesChecked: envKeys.length,
        totalConfigured: results.filter(r => r.configured).length,
        totalUniqueKeys: valMap.size,
        hasDuplicates: duplicateDetails.length > 0,
        duplicateDetails,
        allKeysSummary: results
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Diagnostics failed" });
    }
  });

  // Dedicated AI Study Tools Endpoint (Summarize, Explain, Flashcards, MCQs, Revision, Meaning, Key Facts)
  app.post("/api/ai/study-tool", async (req, res) => {
    try {
      const { toolKey, prompt, sourceText, isFullPage, pageNum, model, temperature, customKey } = req.body;
      if (!prompt && !sourceText) {
        return res.status(400).json({ error: "Missing prompt or sourceText" });
      }

      const queryPrompt = prompt || sourceText;
      const targetModel = model || "gemini-3.1-flash-lite";

      const studySysInstruction = "You are an elite academic curriculum analyst, master tutor & exam specialist. Provide thorough, comprehensive, in-depth, long-form explanations and summaries with vivid analogies, visual ASCII diagrams, structured bullet points, numbered takeaways, markdown comparison tables, and high-yield exam insights. Use clean standard markdown (#, ##, -, bold). NEVER output raw unparsed LaTeX (like $$, \\frac), stray asterisks (*), or weird symbols. Ensure 100% factual accuracy strictly grounded in the provided document text.";

      // 1. Execute with dedicated Gemini Study Key Pool (or user BYOK custom key)
      if (keyPool.hasAnyKey() || customKey) {
        try {
          const result = await executeWithGeminiPool('study', queryPrompt, {
            targetModel,
            temperature: typeof temperature === "number" ? temperature : 0.22,
            systemInstruction: studySysInstruction,
            customKey,
          });

          if (result && result.text) {
            return res.json({
              text: result.text,
              status: "success",
              provider: "gemini",
              model: result.model,
              keySlot: result.keyTag,
              toolKey: toolKey || "study-tool",
            });
          }
        } catch (studyErr: any) {
          console.warn("[Study Tool] Gemini Pool notice:", studyErr.message);
        }
      }

      // 2. High-speed Groq Inference (Sub-second fallback)
      if (process.env.GROQ_API_KEY) {
        const groqText = await executeWithGroq(queryPrompt, studySysInstruction, 0.25);
        if (groqText) {
          return res.json({
            text: groqText,
            status: "success",
            provider: "groq",
            model: "gpt-oss-120b",
            toolKey: toolKey || "study-tool"
          });
        }
      }

      // 3. OpenRouter LLaMA 3.3 70B Fallback
      if (process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_AI) {
        const orText = await executeWithOpenRouter(queryPrompt, studySysInstruction, 0.25);
        if (orText) {
          return res.json({
            text: orText,
            status: "success",
            provider: "openrouter",
            model: "llama-3.3-70b",
            toolKey: toolKey || "study-tool"
          });
        }
      }

      return res.status(503).json({
        error: "All AI study inference services temporarily busy. Please check keys in Settings.",
        status: "error"
      });
    } catch (err: any) {
      console.error("Study Tool Server Error:", err);
      return res.status(500).json({ error: err.message || "Failed to process study tool" });
    }
  });

  // Dedicated Oxford-Grade Academic Dictionary & Lexicon Endpoint
  app.post("/api/dictionary", async (req, res) => {
    try {
      const { word, context, subjectDomain } = req.body;
      if (!word || typeof word !== "string") {
        return res.status(400).json({ error: "Missing or invalid 'word' field in request body." });
      }

      const cleanWord = word.trim().replace(/^[^a-zA-Z0-9'-]+|[^a-zA-Z0-9'-]+$/g, '');
      if (!cleanWord) {
        return res.status(400).json({ error: "Word cannot be empty" });
      }

      const lexiconSysInstruction = `You are a master lexicographer, etymologist, and academic vocabulary specialist (Oxford, Cambridge, and Merriam-Webster standard).
Your goal is to provide 100% factually accurate, structured vocabulary analysis for students and researchers.

STRICT LINGUISTIC RULES:
1. CONTEXTUAL GRAMMATICAL DISAMBIGUATION:
   - If a sentence context is provided, analyze the EXACT grammatical role and meaning of "${cleanWord}" in that specific sentence first.
   - Example 1: In "The Mauryan king Ashoka was the first person to issue inscriptions" or "The king issue the rules", "issue" is used as a VERB meaning "to officially release, publish, make available, or circulate" (Hindi: जारी करना / प्रकाशित करना). It is NOT a Noun (problem/matter).
   - Example 2: In "We must address the environmental issue", "issue" is used as a NOUN meaning "an important problem or topic under discussion" (Hindi: मुद्दा / समस्या).
   - When context is provided:
     * Set "primaryPos" to the EXACT part of speech used in that sentence (e.g. "Verb" or "Noun").
     * Set "contextMeaning" to its precise definition in that sentence.
     * Set "hindiMeaning" to the Hindi translation corresponding to that contextual grammatical role.
     * In the "partsOfSpeech" array, place the contextual part of speech as the FIRST item.

2. MULTI-PARTS OF SPEECH SEPARATION (REAL PARTS OF SPEECH ONLY):
   - Provide a distinct object in "partsOfSpeech" for EVERY VALID formal dictionary part of speech of this word (e.g., for "issue": Noun and Verb).
   - For EACH part of speech:
     * "pos": "Noun" | "Verb" | "Adjective" | "Adverb" | "Preposition" (only standard parts of speech).
     * "definition": Textbook Oxford/Cambridge academic definition for this specific POS.
     * "hindiMeaning": Accurate Hindi translation (हिंदी अर्थ in Devanagari script) for this POS.
     * "example": Scholarly example sentence demonstrating this POS.
     * "synonyms": 4-6 authentic, accurate synonyms strictly belonging to this POS.
     * "antonyms": 2-4 authentic antonyms strictly belonging to this POS.
     * "grammar": Exact inflections (singular/plural for Nouns, V1/V2/V3/ing/s for Verbs, Positive/Comparative/Superlative for Adjectives).

3. BAN SPURIOUS OR SLANG PARTS OF SPEECH:
   - NEVER invent or include non-standard, slang, or fake parts of speech (e.g. "issue" is NOT an Adjective; do NOT output an Adjective object for "issue").
   - Do NOT classify idioms or phrases as separate parts of speech.

4. Strict JSON Output:
   - Output ONLY a valid JSON object matching the schema. No markdown formatting.`;

      const lexiconPrompt = `Analyze the academic word "${cleanWord}"${context ? ` in the context of this sentence: "${context}"` : ""}${subjectDomain ? ` (Subject: ${subjectDomain})` : ""}.

Return ONLY a valid raw JSON object with this exact structure:
{
  "word": "${cleanWord}",
  "phonetic": "IPA phonetic notation (e.g. /ˈɪʃuː/)",
  "primaryPos": "Noun or Verb (match context if provided)",
  "hindiMeaning": "Hindi meaning matching primaryPos (Devanagari script)",
  "contextMeaning": "Exact meaning in the sentence (if context provided)",
  "academicDefinition": "Primary Oxford/Cambridge academic definition matching primaryPos",
  "simpleExplanation": "Simple 1-sentence plain-English breakdown using the Feynman technique",
  "academicExample": "Academic or textbook example sentence",
  "commonPitfall": "Confusable pair, false friend, or examiner trap",
  "etymology": "Root origin and language history",
  "partsOfSpeech": [
    {
      "pos": "Noun",
      "definition": "Precise definition when used as a Noun",
      "hindiMeaning": "हिंदी अर्थ as Noun",
      "example": "Sentence demonstrating usage as a Noun",
      "synonyms": ["noun_synonym_1", "noun_synonym_2", "noun_synonym_3", "noun_synonym_4"],
      "antonyms": ["noun_antonym_1", "noun_antonym_2"],
      "grammar": {
        "singular": "${cleanWord}",
        "plural": "${cleanWord}s"
      }
    },
    {
      "pos": "Verb",
      "definition": "Precise definition when used as a Verb",
      "hindiMeaning": "हिंदी अर्थ as Verb",
      "example": "Sentence demonstrating usage as a Verb",
      "synonyms": ["verb_synonym_1", "verb_synonym_2", "verb_synonym_3", "verb_synonym_4"],
      "antonyms": ["verb_antonym_1", "verb_antonym_2"],
      "grammar": {
        "v1": "${cleanWord}",
        "v2": "past form",
        "v3": "past participle form",
        "ing": "-ing form",
        "s": "-s/-es form"
      }
    }
  ],
  "synonyms": ["synonym_1", "synonym_2", "synonym_3", "synonym_4"],
  "antonyms": ["antonym_1", "antonym_2"]
}`;

      // 1. Try Gemini Key Pool with ultra-fast 'gemini-3.1-flash-lite'
      if (keyPool.hasAnyKey()) {
        try {
          const result = await executeWithGeminiPool('study', lexiconPrompt, {
            targetModel: "gemini-3.1-flash-lite",
            temperature: 0.05,
            systemInstruction: lexiconSysInstruction,
            responseMimeType: "application/json",
          });

          if (result && result.text) {
            try {
              const cleaned = result.text.replace(/```json/gi, '').replace(/```/g, '').trim();
              const parsed = JSON.parse(cleaned);
              return res.json({
                data: parsed,
                status: "success",
                provider: "gemini",
                model: result.model,
              });
            } catch (pErr) {
              console.warn("Gemini JSON parse fallback for dictionary:", pErr);
            }
          }
        } catch (gErr: any) {
          console.warn("[Dictionary] Gemini pool notice:", gErr.message);
        }
      }

      // 2. Fast Groq Fallback
      if (process.env.GROQ_API_KEY) {
        const groqText = await executeWithGroq(lexiconPrompt, lexiconSysInstruction, 0.1);
        if (groqText) {
          try {
            const cleaned = groqText.replace(/```json/gi, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(cleaned);
            return res.json({
              data: parsed,
              status: "success",
              provider: "groq",
              model: "gpt-oss-120b",
            });
          } catch (pErr) {}
        }
      }

      // 3. OpenRouter Fallback
      if (process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_AI) {
        const orText = await executeWithOpenRouter(lexiconPrompt, lexiconSysInstruction, 0.1);
        if (orText) {
          try {
            const cleaned = orText.replace(/```json/gi, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(cleaned);
            return res.json({
              data: parsed,
              status: "success",
              provider: "openrouter",
              model: "llama-3.3-70b",
            });
          } catch (pErr) {}
        }
      }

      return res.status(503).json({
        error: "Dictionary inference service temporarily unavailable.",
        status: "error",
      });
    } catch (err: any) {
      console.error("Dictionary Endpoint Error:", err);
      return res.status(500).json({ error: err.message || "Failed to fetch dictionary definition" });
    }
  });

  // Verify / Test Custom User Gemini API Key
  app.post("/api/gemini/validate", async (req, res) => {
    try {
      const { apiKey } = req.body;
      if (!apiKey || typeof apiKey !== "string" || apiKey.trim().length < 8) {
        return res.status(400).json({ valid: false, error: "Please enter a valid Gemini API key" });
      }

      const client = keyPool.getClient(apiKey.trim());
      const testResp = await client.models.generateContent({
        model: "gemini-3.1-flash-lite",
        contents: "Respond with 'OK' only.",
      });

      if (testResp && testResp.text) {
        return res.json({ valid: true, message: "Key verified successfully!" });
      }
      return res.status(400).json({ valid: false, error: "Invalid response from Gemini" });
    } catch (err: any) {
      console.warn("Key validation failed:", err.message);
      return res.status(400).json({ valid: false, error: err.message || "Failed to validate key with Google Gemini." });
    }
  });

  // Universal Multi-Provider AI Generation Endpoint
  app.post("/api/ai", async (req, res) => {
    try {
      const { prompt, systemInstruction, model, temperature, customKey } = req.body;
      if (!prompt || typeof prompt !== "string") {
        return res.status(400).json({ error: "Missing or invalid 'prompt' field in request body." });
      }

      // Tier 1: Google Gemini Models via Multi-Key Pool (or user BYOK custom key)
      if (keyPool.hasAnyKey() || customKey) {
        try {
          const result = await executeWithGeminiPool('general', prompt, {
            systemInstruction,
            targetModel: model || "gemini-3.1-flash-lite",
            temperature,
            customKey,
          });

          if (result && result.text) {
            return res.json({
              text: result.text,
              status: "success",
              provider: "gemini",
              model: result.model,
              keySlot: result.keyTag,
            });
          }
        } catch (gErr: any) {
          console.warn("Gemini service execution notice:", gErr.message);
        }
      }

      // Tier 2: Groq API (if configured)
      if (process.env.GROQ_API_KEY) {
        const groqText = await executeWithGroq(prompt, systemInstruction, typeof temperature === "number" ? temperature : 0.3);
        if (groqText) {
          return res.json({ text: groqText, status: "success", provider: "groq", model: "gpt-oss-120b" });
        }
      }

      // Tier 3: OpenRouter API (if configured in environment)
      if (process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_AI) {
        const orText = await executeWithOpenRouter(prompt, systemInstruction, typeof temperature === "number" ? temperature : 0.3);
        if (orText) {
          return res.json({ text: orText, status: "success", provider: "openrouter", model: "llama-3.3-70b" });
        }
      }

      return res.status(503).json({
        error: "No AI provider configured. Please provide GEMINI_API_KEY in Settings.",
        status: "error"
      });
    } catch (err: any) {
      console.error("AI Server Error:", err);
      return res.status(500).json({
        error: err.message || "Failed to generate AI response",
        status: "error",
      });
    }
  });

  // S.A.Y.A.D. AI - Intelligent, Conversational, and Document-Aware Super AI
  app.post("/api/ai/hybrid-tutor", async (req, res) => {
    try {
      const {
        userQuestion,
        docTitle,
        currentPage,
        totalPages,
        chapterText,
        fullContext,
        persona,
        language,
        chatHistory,
        customKey
      } = req.body;

      if (!userQuestion) {
        return res.status(400).json({ error: "Missing userQuestion" });
      }

      // Format conversation history for multi-turn conversational context
      let historyFormatted = '';
      if (Array.isArray(chatHistory) && chatHistory.length > 0) {
        const recentTurns = chatHistory.slice(-8).filter((m: any) => m && m.text && m.text !== '…');
        if (recentTurns.length > 0) {
          historyFormatted = `### RECENT CONVERSATION HISTORY (Active Discussion Memory):
${recentTurns.map((m: any) => `${m.role === 'user' ? 'Student' : 'AI Tutor'}: ${m.text}`).join('\n\n')}
`;
        }
      }

      const hybridPrompt = `You are S.A.Y.A.D. AI — an unrestricted, world-class Academic AI Tutor and Universal Super-Intelligence (powered by Google Gemini).

${persona ? `### ACTIVE PERSONA / STYLE:\n${persona}\n` : ''}
### YOUR PRIMARY DIRECTIVE:
You are an omniscient, helpful, and friendly AI tutor capable of answering ANY question across all subjects (Physics, Chemistry, Biology, Mathematics, History, Civics, Geography, Economics, Computer Science, Literature, General Doubts, and Competitive Exams).

### CORE RULES & QUESTION-SOLVING PROTOCOL:

1. **IN-TEXT QUESTIONS & EXERCISES (e.g. "intext questions 7.1", "intext 7.1 ka 3rd question", "exercise 4.2 question 5")**:
   - **Step 1: EXTRACT THE EXACT QUESTION TEXT**:
     - Check the reference document passages below (especially sections labeled \`🎯 PRIMARY INTEXT QUESTIONS\` or \`EXACT QUESTIONS\`).
     - **Find and print the REAL, EXACT question statement from the book** (e.g., *"Question 3: How did the marriage alliance with the Lichchhavi's help Chandragupta?"*).
     - ❌ **NEVER hallucinate, guess, or invent fake questions!**
   - **Step 2: COMPLETE, STEP-BY-STEP ACADEMIC ANSWER**:
     - **If the PDF only has questions (No answer key at the back)**: Solve the question completely and rigorously using the chapter theory passages and your full academic knowledge!
     - **If the PDF has both questions AND an answer key (e.g. 'Legitimacy, prestige, strength')**: Incorporate the textbook key points into a complete, well-reasoned, articulate explanation explaining WHY and HOW.
     - Format clearly:
       **Question [X]:** [Exact question text from the textbook]
       **Answer:** [Clear, complete, step-by-step verified explanation with context and significance]

2. **CHAPTER & LESSON EXPLANATIONS (e.g. "Chapter 8 kya hai", "Lesson 4 samjhao", "Unit 5 overview")**:
   - ❌ **STRICTLY FORBIDDEN**: NEVER say *"iss module mein yeh chapter nahi hai"*, *"abhi hum page 1 par hain"*, or *"content display nahi ho raha"*.
   - Provide an authoritative, structured breakdown immediately:
     - 📖 **Chapter/Lesson Title & Core Theme**
     - 🔑 **Key Historical / Scientific Concepts & Core Laws**
     - 🏛️ **Timeline, Major Figures, or Step-by-Step Mechanisms**
     - 🎯 **Essential Exam Points & Expected Questions**
   - Use the reference passages if available; otherwise, teach the topic completely using your full academic syllabus mastery (NCERT / NIOS / CBSE / ICSE / State Board).

3. **CONVERSATIONAL MEMORY & FOLLOW-UP QUERIES ("isse related aur information", "aur batao", "explain more")**:
   - Seamlessly expand on the EXACT topic discussed in the previous turns with deeper analysis, analogies, and solved exam examples.
   - Do NOT reset to the beginning of the book or get distracted by unrelated pages.

4. **GREETINGS & CASUAL CHAT ("Hi", "Hello", "Kaise ho")**:
   - Reply warmly and politely in 1-2 friendly sentences.

5. **LANGUAGE & FORMATTING**:
   - Match the student's language (clean, natural English OR fluent, friendly Hinglish).
   - Use clean Markdown with bold keywords, bullet points, headers, and clean LaTeX math ($E = mc^2$).

${historyFormatted ? `${historyFormatted}\n=======================================================\n` : ''}=======================================================
STUDENT SESSION INFO:
- Open PDF: "${docTitle || 'None'}" (Total Pages: ${totalPages || 1})
- Current Question: "${userQuestion}"
=======================================================

${(chapterText || fullContext) ? `REFERENCE PASSAGES FROM CURRENT DOCUMENT (Use if relevant, but answer freely beyond them if needed):
${chapterText || fullContext}` : '(No reference document needed)'}

Provide the complete, direct, and high-quality educational answer to the student now:`;

      // Tier 1: Try Gemini Key Pool with powerful models (Dedicated Chat Pool with 5 keys or user customKey)
      if (keyPool.hasAnyKey() || customKey) {
        try {
          const result = await executeWithGeminiPool('chat', hybridPrompt, {
            targetModel: "gemini-3.1-flash-lite",
            temperature: 0.3,
            customKey,
          });

          if (result && result.text) {
            return res.json({
              text: result.text,
              status: "success",
              engine: `gemini-${result.model}`,
              keySlot: result.keyTag,
            });
          }
        } catch (geminiInitErr: any) {
          console.warn("Gemini service init warning:", geminiInitErr.message);
        }
      }

      // Tier 2: Open-Source LLaMA / GPT on Groq (High speed, instant responses)
      if (process.env.GROQ_API_KEY) {
        const groqText = await executeWithGroq(hybridPrompt, "You are the S.A.Y.A.D. Super-Tutor Lead Academic Professor.", 0.3);
        if (groqText) {
          return res.json({ text: groqText, status: "success", engine: "groq-gpt-oss-120b" });
        }
      }

      // Tier 3: OpenRouter LLaMA 3.3 70B
      if (process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_AI) {
        const orText = await executeWithOpenRouter(hybridPrompt, "You are the S.A.Y.A.D. Super-Tutor Lead Academic Professor.", 0.3);
        if (orText) {
          return res.json({ text: orText, status: "success", engine: "openrouter-llama-3.3-70b" });
        }
      }

      return res.status(500).json({ error: "All AI inference engines temporarily unavailable." });
    } catch (err: any) {
      console.error("Hybrid Tutor Server Error:", err);
      return res.status(500).json({ error: err.message || "Failed to generate hybrid AI response" });
    }
  });

  // -------------------------------------------------------------
  // MICROSOFT NEURAL TTS API ENDPOINTS
  // -------------------------------------------------------------
  app.get("/api/tts/voices", (req, res) => {
    res.json({
      status: "success",
      voices: MICROSOFT_NEURAL_VOICES,
      defaultVoice: "hi-IN-SwaraNeural"
    });
  });

  app.post("/api/tts/synthesize", async (req, res) => {
    try {
      const { text, voice, rate, pitch } = req.body;
      if (!text || !text.trim()) {
        return res.status(400).json({ error: "Text is required for TTS synthesis" });
      }

      const result = await synthesizeMicrosoftTTS(text, {
        voice: voice || "hi-IN-SwaraNeural",
        rate: typeof rate === "number" ? rate : 1.0,
        pitch: typeof pitch === "number" ? pitch : 1.0,
      });

      return res.json({
        status: "success",
        audioBase64: result.audioBase64,
        mimeType: result.mimeType,
        wordBoundaries: result.wordBoundaries,
        voice: result.voice,
        durationEstimateMs: result.durationEstimateMs
      });
    } catch (ttsErr: any) {
      console.error("Microsoft TTS Synthesis Error:", ttsErr);
      return res.status(500).json({
        error: ttsErr.message || "Failed to synthesize speech using Microsoft Neural Voice"
      });
    }
  });

  // Vite development middleware vs production static files
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`S.A.Y.A.D. Server running on http://localhost:${PORT}`);
  });
}

startServer();


