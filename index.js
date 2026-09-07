// =====================================================
// Aryan Studio Pro - Gemini AI Worker v16 (429 KILLER Edition)
// ✅ FIX 1: फेक ग्लोबल डिले हटाया (क्लाउडफ्लेयर स्टेटलेस है)
// ✅ FIX 2: 429 पर रिट्राई-स्टॉर्म बंद → तुरंत क्लीन एरर + retryAfter
// ✅ FIX 3: प्रति रिक्वेस्ट अधिकतम 4 कोशिशें (बर्स्ट कैप)
// ✅ अब 8-सेकंड कूलडाउन फ्रंटएंड (वेबसाइट) संभालती है
// =====================================================

// 🔑 यहाँ अपनी कीज़ डाल सकते हैं (ऑप्शनल — वरना वर्कर सेटिंग्स में डालें)
const HARDCODED_KEYS = [];

// ✅ एक्टिव मॉडल्स (2026 अपडेट के अनुसार)
const MODELS = [
  "gemini-2.5-flash",       // PRIMARY
  "gemini-3.6-flash",       // BACKUP 1
  "gemini-3.5-flash-lite"   // BACKUP 2
];

// 🛡️ एक इनकमिंग रिक्वेस्ट में कुल अधिकतम कोशिशें (स्टॉर्म रोकने के लिए)
const MAX_ATTEMPTS = 4;
const INVALID_DELAY = 1500; // "invalid argument" पर एक बार हल्का रुकना

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// 🔑 सारी कीज़ कलेक्ट करें (हार्डकोडेड + एनवायरनमेंट)
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

// ⚙️ जनरेशन कॉन्फ़िग (2.5/3.x मॉडल्स के लिए thinking बंद)
function buildGenerationConfig(model, maxTokens) {
  const config = {
    maxOutputTokens: maxTokens,
    temperature: 0.7,
    topP: 0.95
  };
  if (model.includes("2.5") || model.includes("3.")) {
    config.thinkingConfig = { thinkingBudget: 0 };
  }
  return config;
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

    // ✅ GET → स्टेटस चेक
    if (request.method === "GET") {
      const keys = collectKeys(env);
      return new Response(JSON.stringify({
        status: "ok ✅",
        worker: "Aryan Studio Pro - Gemini Worker v16 (429 Killer)",
        totalKeysLoaded: keys.length,
        modelsActive: MODELS,
        note: "रेट-लिमिट अब फ्रंटएंड का 8-सेकंड कूलडाउन संभालता है 🛡️"
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

      if (!userPrompt || !userPrompt.trim()) {
        return new Response(JSON.stringify({ error: "प्रॉम्प्ट खाली है!" }), { status: 400, headers });
      }

      const keys = collectKeys(env);
      if (!keys.length) {
        return new Response(JSON.stringify({
          error: "❌ कोई API Key नहीं मिली! वर्कर सेटिंग्स में GEMINI_KEYS डालें।"
        }), { status: 500, headers });
      }

      const maxTokens = Math.min(8192, parseInt(requestData.maxTokens) || 8192);
      const contents = [{ role: "user", parts: [{ text: userPrompt }] }];
      const errors = [];
      let attempts = 0;

      // 🔑 की-रोटेशन — सिर्फ एक बार, बिना स्पैमिंग
      const shuffled = keys.sort(() => Math.random() - 0.5);

      outer:
      for (const key of shuffled) {
        const keyTag = `Key(${key.substring(0, 5)}...)`;

        for (const model of MODELS) {
          if (attempts >= MAX_ATTEMPTS) break outer; // 🛑 बर्स्ट कैप
          attempts++;

          const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

          try {
            let res = await fetch(apiUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ contents, generationConfig: buildGenerationConfig(model, maxTokens) })
            });
            let data = await res.json().catch(() => ({}));

            // ✅ "invalid argument" → एक बार बिना कॉन्फ़िग के कोशिश
            if (data.error && /invalid argument/i.test(data.error.message || "")) {
              if (attempts >= MAX_ATTEMPTS) break outer;
              attempts++;
              await sleep(INVALID_DELAY);
              res = await fetch(apiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contents })
              });
              data = await res.json().catch(() => ({}));
            }

            // ❌ एरर हैंडलिंग
            if (data.error) {
              const msg = data.error.message || "unknown";
              errors.push(`${keyTag} → ${model}: ${msg.substring(0, 80)}`);

              // 🛑 429/Quota → तुरंत क्लीन एरर वापस (स्टॉर्म नहीं!)
              // फ्रंटएंड अपने आप टाइमर बढ़ाकर दोबारा कोशिश करेगा
              if (/quota|429|RESOURCE_EXHAUSTED|retry in/i.test(msg)) {
                return new Response(JSON.stringify({
                  error: "⏳ Gemini लिमिट पार! कुछ सेकंड रुककर अपने आप दोबारा कोशिश होगी।",
                  retryAfter: 10,
                  status: "rate_limited"
                }), { status: 429, headers });
              }

              // 🔑 की गलत → अगली की
              if (/API key not valid|API_KEY_INVALID/i.test(msg)) continue;

              // 💥 500/502 → अगला मॉडल
              if (/500|502|internal|backend|no longer available/i.test(msg)) continue;

              continue;
            }

            // ✅ सक्सेस — रिजल्ट मिल गया
            if (data.candidates && data.candidates[0] && data.candidates[0].content) {
              const aiText = (data.candidates[0].content.parts || []).map(p => p.text || "").join("");
              if (aiText.trim()) {
                return new Response(JSON.stringify({
                  result: aiText,
                  response: aiText,
                  text: aiText,
                  model: model,
                  key: keyTag,
                  status: "ok"
                }), { headers });
              }
            }
            // खाली जवाब → अगला मॉडल ट्राई

          } catch (e) {
            errors.push(`${keyTag} → ${model}: ${e.message}`);
          }
        }
      }

      // सारी कोशिशें फेल
      return new Response(JSON.stringify({
        error: `सभी कोशिशें फेल:\n• ${errors.slice(0, 4).join("\n• ")}`,
        retryAfter: 8,
        status: "failed"
      }), { status: 502, headers });

    } catch (error) {
      return new Response(JSON.stringify({
        error: "सर्वर एरर: " + error.message,
        retryAfter: 8
      }), { status: 500, headers });
    }
  }
};
