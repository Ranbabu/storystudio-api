// =====================================================
// Aryan Studio Pro - Gemini AI Worker v16 (2026 Stable)
// ✅ Locked on Gemini 2.5 Flash (Best for Hindi Scripts)
// ✅ Automatic Key Rotation & Burst Delay Shield
// =====================================================

// 🔑 तरीका 1: यहाँ हार्डकोडेड API Keys डाल सकते हैं (Optional)
const HARDCODED_KEYS = [
  // "AIzaSyYourKeyHere1",
  // "AIzaSyYourKeyHere2"
];

// ✅ केवल ACTIVE और गूगल द्वारा मान्यता प्राप्त मॉडल्स
const MODELS = [
  "gemini-2.5-flash",   // PRIMARY (हिंदी न्यूज़ स्क्रिप्ट्स के लिए सबसे तेज़ और सटीक)
  "gemini-2.0-flash",   // BACKUP 1
  "gemini-1.5-flash"    // BACKUP 2
];

// ग्लोबल वेरिएबल: बैक-टू-बैक स्पैम रोकने के लिए
let lastRequestTimestamp = 0;

// 🛡️ सेफ्टी डिले टाइमर्स (मिलीसेकंड में)
const MIN_DELAY = 1500;     // 1.5 सेकंड का फिक्स मिनिमम गैप
const RETRY_DELAY = 3000;   // रेट लिमिट एरर आने पर 3 सेकंड का रेस्ट

// 🕒 स्लीप/वेट हेल्प फ़ंक्शन
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// सब API Keys को कलेक्ट करने का फ़ंक्शन
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

// ✅ Model Generation Config (हिंदी न्यूज़ स्क्रिप्ट्स के लिए बेस्ट)
function buildGenerationConfig(model, maxTokens) {
  const config = {
    maxOutputTokens: maxTokens,
    temperature: 0.75, 
    topP: 0.95
  };
  
  // Gemini 2.5 मॉडल के लिए Thinking Budget 0 सेट करना आवश्यक है
  if (model.includes("2.5")) {
      config.thinkingConfig = { thinkingBudget: 0 };
  }
  return config;
}

export default {
  async fetch(request, env) {
    // 🌐 CORS Headers (ताकि आपकी वेबसाइट से बिना किसी एरर के कनेक्ट हो सके)
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    if (request.method === "GET") {
      const keys = collectKeys(env);
      return new Response(JSON.stringify({
        status: "ok ✅",
        worker: "Aryan Studio Pro - Gemini 2.5 Flash Engine v16",
        totalKeysLoaded: keys.length,
        primaryModel: "gemini-2.5-flash",
        activeModels: MODELS,
        protection: "Rate Limit Shield Active 🛡️"
      }), { headers });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "केवल POST अनुरोध मान्य है!" }), { status: 405, headers });
    }

    try {
      const requestData = await request.json().catch(() => ({}));
      
      let userPrompt = requestData.prompt || requestData.text || requestData.message || "";
      if (!userPrompt && requestData.contents) {
        userPrompt = requestData.contents.map(c => (c.parts || []).map(p => p.text || "").join("\n")).join("\n");
      }

      if (!userPrompt || userPrompt.trim().length === 0) {
        return new Response(JSON.stringify({ error: "प्रॉम्प्ट (Prompt) खाली है!" }), { status: 400, headers });
      }

      const keys = collectKeys(env);
      if (keys.length === 0) {
        return new Response(JSON.stringify({ 
          error: "❌ कोई API Key नहीं मिली! Cloudflare Worker Settings में GEMINI_KEYS वेरिएबल में अपनी API Key डालें।" 
        }), { status: 500, headers });
      }

      const maxTokens = Math.min(8192, parseInt(requestData.maxTokens) || 8192);
      const errors = [];
      let lastQuotaMsg = "";

      // 🛑 ANTI-BURST DELAY
      const now = Date.now();
      const timeSinceLast = now - lastRequestTimestamp;
      if (timeSinceLast < MIN_DELAY) {
        await sleep(MIN_DELAY - timeSinceLast);
      }
      lastRequestTimestamp = Date.now();

      // 🔄 SMART KEY ROTATION (रैंडम चाबी चुनना)
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

            // ❌ Error handling
            if (data.error) {
              const msg = data.error.message || "unknown";
              errors.push(`${keyTag} → ${model}: ${msg.substring(0, 80)}`);

              // Quota / Rate Limit (429) आने पर 3 सेकंड का ऑटो-रेस्ट
              if (/quota|429|RESOURCE_EXHAUSTED|retry in/i.test(msg)) {
                lastQuotaMsg = msg; 
                keyDead = true; 
                await sleep(RETRY_DELAY); 
                break; 
              }
              
              // सर्वर क्रैश या टेम्परेरी इशू
              if (/500|502|internal|backend/i.test(msg)) {
                await sleep(RETRY_DELAY);
                continue;
              }

              if (/API key not valid|API_KEY_INVALID/i.test(msg)) {
                break; // इस Key को छोड़ो, अगली Key पर जाओ
              }
              continue; 
            }

            // ✅ SUCCESS: उत्तर मिल गया
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
          } catch (e) {
            errors.push(`${keyTag} → ${model}: ${e.message}`);
          }
        } 
        if (keyDead) continue; 
      } 

      const finalError = lastQuotaMsg 
        ? `गूगल रेट लिमिट आ गई है! 10 सेकंड बाद पुन: प्रयास करें।` 
        : `सभी API Keys रिस्पॉन्ड नहीं कर रहीं:\n• ${errors.slice(0, 3).join("\n• ")}`;

      return new Response(JSON.stringify({ error: finalError }), {
        status: lastQuotaMsg ? 429 : 502,
        headers
      });

    } catch (error) {
      return new Response(JSON.stringify({ error: "सर्वर एरर: " + error.message }), { status: 500, headers });
    }
  }
};
