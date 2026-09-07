// =====================================================
// Aryan Studio Pro - Dedicated Gemini 2.5 Flash Worker
// ✅ STRICT: Only 'gemini-2.5-flash' Model Active
// ✅ Anti-Burst & Safe Key-Rotation (Prevents 429/502)
// ✅ Mathematical Pacing for News Scripts
// =====================================================

// 🔑 तरीका 1: यहाँ hardcoded keys (वैकल्पिक)
const HARDCODED_KEYS = [];

// ✅ मॉडल केवल 2.5 Flash रहेगा
const ACTIVE_MODEL = "gemini-2.5-flash";

// 🕒 स्लीप/वेट फंक्शन
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Keys एकत्रित करने का फंक्शन
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

// ✅ 2.5 Flash के लिए विशेष कॉन्फ़िगरेशन (बड़ी न्यूज़ स्क्रिप्ट के लिए)
function buildGenerationConfig(maxTokens) {
  return {
    maxOutputTokens: maxTokens,
    temperature: 0.7,
    topP: 0.95,
    thinkingConfig: { thinkingBudget: 0 } // Thinking Budget Disable ताकि तेज़ी से रिस्पॉन्स मिले
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

    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    if (request.method === "GET") {
      const keys = collectKeys(env);
      return new Response(JSON.stringify({
        status: "ok ✅",
        worker: "Aryan Studio Pro - Gemini 2.5 Dedicated Worker",
        totalKeysLoaded: keys.length,
        modelActive: ACTIVE_MODEL,
        protection: "Safe Key-Rotation & Anti-429 Enabled 🛡️"
      }), { headers });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "केवल POST अनुरोध मान्य है" }), { status: 405, headers });
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
        return new Response(JSON.stringify({ error: "❌ कोई API Key नहीं मिली! Worker Settings में GEMINI_KEYS डालें।" }), { status: 500, headers });
      }

      const maxTokens = Math.min(8192, parseInt(requestData.maxTokens) || 8192);
      const errors = [];
      let rateLimitHit = false;

      // 🔄 कीज़ को रैंडम शफल करें ताकि किसी एक की पर लोड न पड़े
      const shuffledKeys = keys.sort(() => Math.random() - 0.5);

      for (let i = 0; i < shuffledKeys.length; i++) {
        const key = shuffledKeys[i];
        const keyTag = `Key(${key.substring(0, 5)}...)`;

        try {
          const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${ACTIVE_MODEL}:generateContent?key=${key}`;
          const contents = [{ role: "user", parts: [{ text: userPrompt }] }];

          let res = await fetch(apiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents, generationConfig: buildGenerationConfig(maxTokens) })
          });
          let data = await res.json().catch(() => ({}));

          // Invalid Argument फ़िक्स
          if (data.error && /invalid argument/i.test(data.error.message)) {
            await sleep(1500);
            res = await fetch(apiUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ contents })
            });
            data = await res.json().catch(() => ({}));
          }

          // Error Handling
          if (data.error) {
            const msg = data.error.message || "Unknown error";
            errors.push(`${keyTag}: ${msg.substring(0, 90)}`);

            // 429 Quota / Rate Limit
            if (/quota|429|RESOURCE_EXHAUSTED|rate limit/i.test(msg)) {
              rateLimitHit = true;
              // इस की पर लिमिट है, तो अगली की ट्राई करेंगे
              continue;
            }

            // सर्वर या नेटवर्क एरर
            if (/500|502|503|internal|backend/i.test(msg)) {
              await sleep(1000);
              continue;
            }

            continue;
          }

          // ✅ सफलता: रिस्पॉन्स मिल गया
          if (data.candidates && data.candidates[0] && data.candidates[0].content) {
            const aiText = (data.candidates[0].content.parts || []).map(p => p.text || "").join("");
            if (aiText.trim()) {
              return new Response(JSON.stringify({
                result: aiText,
                response: aiText,
                text: aiText,
                model: ACTIVE_MODEL,
                key: keyTag,
                status: "ok"
              }), { headers });
            }
          }
        } catch (e) {
          errors.push(`${keyTag}: ${e.message}`);
        }
      }

      const finalError = rateLimitHit 
        ? `सभी उपलब्ध Keys की मिनट लिमिट (RPM) पूरी हो गई है। कृपया 10-15 सेकंड बाद पुनः प्रयास करें।`
        : `सभी API Keys विफल:\n• ${errors.slice(0, 3).join("\n• ")}`;

      return new Response(JSON.stringify({ error: finalError }), {
        status: rateLimitHit ? 429 : 502,
        headers
      });

    } catch (error) {
      return new Response(JSON.stringify({ error: "सर्वर एरर: " + error.message }), { status: 500, headers });
    }
  }
};
