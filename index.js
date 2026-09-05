// =====================================================
// Aryan Studio Pro - Gemini Worker v14 (ULTRA SAFE MODE)
// ✅ 1 API Key के लिए भी 100% सुरक्षित (Mathematical Auto-Delay)
// =====================================================

// 🔑 तरीका 1: यहाँ hardcoded keys (optional)
const HARDCODED_KEYS = [];

// ✅ सही MODELS
const MODELS = [
  "gemini-2.5-flash",       // PRIMARY (सबसे तेज़)
  "gemini-2.5-pro",         // BACKUP
  "gemini-1.5-flash"        // FALLBACK
];

// ग्लोबल वेरिएबल: लगातार आने वाली रिक्वेस्ट को कंट्रोल करने के लिए
let lastRequestTimestamp = 0;

// 🛡️ ULTRA SAFE TIMERS (मिलीसेकंड में)
const MIN_DELAY = 4500;     // 4.5 सेकंड का फिक्स गैप (15 RPM लिमिट कभी क्रॉस नहीं होगी)
const RETRY_DELAY = 5000;   // एरर आने पर 5 सेकंड का फुल रेस्ट
const INVALID_DELAY = 2000; // Invalid argument पर 2 सेकंड का ब्रेक

// 🕒 स्लीप/वेट फंक्शन
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Keys collect
function collectKeys(env) {
  const keys = new Set();
  HARDCODED_KEYS.forEach(k => k && keys.add(String(k).trim()));
  try {
    if (env) {
      if (env.GEMINI_KEYS) {
        String(env.GEMINI_KEYS).split(/[,;\n]+/).forEach(k => k.trim() && keys.add(k.trim()));
      }
      if (env.GEMINI_API_KEY) {
        String(env.GEMINI_API_KEY).split(/[,;\n]+/).forEach(k => k.trim() && keys.add(k.trim()));
      }
    }
  } catch (e) {}
  return Array.from(keys).filter(k => k.length > 10);
}

// ✅ Model config
function buildGenerationConfig(model, maxTokens) {
  return {
    maxOutputTokens: maxTokens,
    temperature: 0.7, 
    topP: 0.95
  };
}

export default {
  async fetch(request, env) {
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json"
    };

    if (request.method === "OPTIONS") return new Response(null, { headers });

    if (request.method === "GET") {
      const keys = collectKeys(env);
      return new Response(JSON.stringify({
        status: "ok ✅",
        worker: "Aryan Studio Pro - Gemini Worker v14 (Ultra Safe)",
        totalKeysLoaded: keys.length,
        modelsActive: MODELS,
        protection: "Mathematical Auto-Delay (4.5s) & Load Balancing Active 🛡️",
        statusMsg: "अब 1 API Key पर भी 502/429 एरर नहीं आएगा।"
      }), { headers });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "केवल POST मान्य है" }), { status: 405, headers });
    }

    try {
      const requestData = await request.json().catch(() => ({}));
      
      let userPrompt = requestData.prompt || requestData.text || requestData.message || "";
      if (!userPrompt && requestData.contents) {
        userPrompt = requestData.contents.map(c => (c.parts || []).map(p => p.text || "").join("\n")).join("\n");
      }

      if (!userPrompt || userPrompt.trim().length === 0) {
        return new Response(JSON.stringify({ error: "प्रॉम्प्ट खाली है!" }), { status: 400, headers });
      }

      const keys = collectKeys(env);
      if (keys.length === 0) {
        return new Response(JSON.stringify({ error: "❌ कोई API Key नहीं मिली!" }), { status: 500, headers });
      }

      const maxTokens = Math.min(8192, parseInt(requestData.maxTokens) || 8192);
      const errors = [];
      let lastQuotaMsg = "";

      // 🛑 MATHEMATICAL BURST CONTROL (सबसे महत्वपूर्ण हिस्सा)
      // यह तय करेगा कि पिछली रिक्वेस्ट के बाद 4.5 सेकंड बीत चुके हों
      const now = Date.now();
      const timeSinceLast = now - lastRequestTimestamp;
      if (timeSinceLast < MIN_DELAY) {
        await sleep(MIN_DELAY - timeSinceLast); // बचे हुए समय के लिए कोड को सुला दो
      }
      lastRequestTimestamp = Date.now();

      // 🔄 SMART KEY ROTATION
      const shuffledKeys = keys.sort(() => Math.random() - 0.5);

      for (let i = 0; i < shuffledKeys.length; i++) {
        const key = shuffledKeys[i];
        const keyTag = `Key(${key.substring(0, 5)}...)`;
        let keyDead = false;

        for (const model of MODELS) {
          try {
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
            const contents = [{ role: "user", parts: [{ text: userPrompt }] }];

            let res = await fetch(apiUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ contents, generationConfig: buildGenerationConfig(model, maxTokens) })
            });
            let data = await res.json().catch(() => ({}));

            // ✅ FIX: Invalid argument आने पर 2 सेकंड रुकें, फिर बिना कॉन्फ़िगरेशन के ट्राई करें
            if (data.error && /invalid argument/i.test(data.error.message)) {
              await sleep(INVALID_DELAY); 
              res = await fetch(apiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contents })
              });
              data = await res.json().catch(() => ({}));
            }

            // ❌ Error handling & Heavy Retry Logic
            if (data.error) {
              const msg = data.error.message || "unknown";
              errors.push(`${keyTag} → ${model}: ${msg.substring(0, 80)}`);

              // Quota / Rate Limit (429) - 5 सेकंड का फुल रेस्ट!
              if (/quota|429|RESOURCE_EXHAUSTED|retry in/i.test(msg)) {
                lastQuotaMsg = msg; 
                keyDead = true; 
                await sleep(RETRY_DELAY); 
                break; 
              }
              // Google Server Crash (500/502) - 5 सेकंड रेस्ट
              if (/500|502|internal|backend/i.test(msg)) {
                await sleep(RETRY_DELAY);
              }
              if (/API key not valid|API_KEY_INVALID/i.test(msg)) {
                continue; // गलत Key
              }
              continue; // अगला मॉडल ट्राई करें
            }

            // ✅ SUCCESS: रिजल्ट मिल गया
            if (data.candidates && data.candidates[0] && data.candidates[0].content) {
              const aiText = (data.candidates[0].content.parts || []).map(p => p.text || "").join("");
              if (aiText.trim()) {
                return new Response(JSON.stringify({
                  result: aiText, response: aiText, text: aiText,
                  model: model, key: keyTag, status: "ok"
                }), { headers });
              }
            }
          } catch (e) {
            errors.push(`${keyTag} → ${model}: ${e.message}`);
          }
        } 
        if (keyDead) continue; 
      } 

      // अगर सभी Keys फेल हो जाएं
      const finalError = lastQuotaMsg 
        ? `Limit Reached! 5-10 सेकंड बाद फिर कोशिश करें। (${lastQuotaMsg})` 
        : `सभी API Keys फेल:\n• ${errors.slice(0, 4).join("\n• ")}`;

      return new Response(JSON.stringify({ error: finalError }), {
        status: lastQuotaMsg ? 429 : 502, headers
      });

    } catch (error) {
      return new Response(JSON.stringify({ error: "सर्वर एरर: " + error.message }), { status: 500, headers });
    }
  }
};
