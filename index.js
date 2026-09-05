// =====================================================
// Aryan Studio Pro - Gemini Worker v12 (Script Optimizer)
// =====================================================

// 🔑 तरीका 1: यहाँ hardcoded keys (optional)
const HARDCODED_KEYS = [];

// ✅ सही MODELS (बड़ी स्क्रिप्ट जनरेशन के लिए)
const MODELS = [
  "gemini-2.5-flash",       // ✅ PRIMARY (Super fast & best for long scripts)
  "gemini-2.5-pro",         // ✅ BACKUP (High quality)
  "gemini-1.5-flash"        // ✅ FALLBACK (Stable)
];

// Keys collect — hardcoded + env दोनों से
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

// ✅ Model के हिसाब से सही config (बड़ी स्क्रिप्ट के लिए Max Tokens)
function buildGenerationConfig(model, maxTokens) {
  // न्यूज़ स्क्रिप्ट के लिए 8192 टोकन लिमिट सेट की गई है
  return {
    maxOutputTokens: maxTokens,
    temperature: 0.7, // 0.7 न्यूज़ के लिए परफेक्ट है (फैक्ट्स और क्रिएटिविटी का बैलेंस)
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

    // 🩺 Health Check
    if (request.method === "GET") {
      const keys = collectKeys(env);
      return new Response(JSON.stringify({
        status: "ok ✅",
        worker: "Aryan Studio Pro - Gemini Worker v12",
        totalKeysLoaded: keys.length,
        modelsActive: MODELS,
        quota: `${keys.length * 1500} requests/day (Combined)`,
        reset: "हर 24 घंटे"
      }), { headers });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "केवल POST मान्य है" }), { status: 405, headers });
    }

    try {
      const requestData = await request.json().catch(() => ({}));

      // सभी payload formats
      let userPrompt = "";
      if (typeof requestData.prompt === "string") userPrompt = requestData.prompt;
      else if (typeof requestData.text === "string") userPrompt = requestData.text;
      else if (typeof requestData.message === "string") userPrompt = requestData.message;
      else if (requestData.contents && Array.isArray(requestData.contents)) {
        userPrompt = requestData.contents
          .map(c => (c.parts || []).map(p => p.text || "").join("\n"))
          .join("\n");
      }

      if (!userPrompt || userPrompt.trim().length === 0) {
        return new Response(JSON.stringify({ error: "प्रॉम्प्ट खाली है!" }), { status: 400, headers });
      }

      const keys = collectKeys(env);
      if (keys.length === 0) {
        return new Response(JSON.stringify({
          error: "❌ कोई key नहीं! Worker Settings → Variables में GEMINI_KEYS डालें।"
        }), { status: 500, headers });
      }

      const maxTokens = Math.min(8192, parseInt(requestData.maxTokens) || 8192);
      const errors = [];
      let lastQuotaMsg = "";

      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const keyTag = `Key${i + 1}(${key.substring(0, 7)}...)`;
        let keyDead = false;

        for (const model of MODELS) {
          try {
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
            const contents = [{ role: "user", parts: [{ text: userPrompt }] }];

            // Attempt 1: full config
            let res = await fetch(apiUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ contents, generationConfig: buildGenerationConfig(model, maxTokens) })
            });
            let data = await res.json().catch(() => ({}));

            // ✅ FIX: invalid argument → minimal config से retry
            if (data.error && /invalid argument/i.test(data.error.message)) {
              res = await fetch(apiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contents })
              });
              data = await res.json().catch(() => ({}));
            }

            // ❌ Error handling
            if (data.error) {
              const msg = data.error.message || "unknown";
              errors.push(`${keyTag} → ${model}: ${msg.substring(0, 100)}`);

              if (/quota|429|RESOURCE_EXHAUSTED|retry in/i.test(msg)) {
                lastQuotaMsg = msg; keyDead = true; break;
              }
              if (/API key not valid|API_KEY_INVALID|PERMISSION_DENIED/i.test(msg)) {
                return new Response(JSON.stringify({ error: `❌ ${msg}` }), { status: 401, headers });
              }
              continue; // model unavailable → अगला model
            }

            // ✅ SUCCESS
            if (data.candidates && data.candidates[0] && data.candidates[0].content) {
              const aiText = (data.candidates[0].content.parts || []).map(p => p.text || "").join("");
              if (aiText.trim()) {
                return new Response(JSON.stringify({
                  result: aiText, response: aiText, text: aiText,
                  model: model, key: keyTag, status: "ok"
                }), { headers });
              }
            }
            errors.push(`${keyTag} → ${model}: empty`);
          } catch (e) {
            errors.push(`${keyTag} → ${model}: ${e.message}`);
          }
        }
        if (keyDead) continue;
      }

      const quotaError = lastQuotaMsg
        ? `QUOTA FULL! ${lastQuotaMsg}`
        : `सभी fail:\n• ${errors.slice(0, 6).join("\n• ")}`;

      return new Response(JSON.stringify({ error: quotaError }), {
        status: lastQuotaMsg ? 429 : 502, headers
      });

    } catch (error) {
      return new Response(JSON.stringify({ error: "कोड एरर: " + error.message }), { status: 500, headers });
    }
  }
};
