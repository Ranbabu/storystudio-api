// =====================================================
// Aryan Studio Pro - Gemini Worker v10
// Multi-Key + Multi-Model + 1,500 Requests/Day
// =====================================================

// 🔑 तरीका 1: यहाँ hardcoded keys डालो (comma से अलग)
// नई key: https://aistudio.google.com/apikey
const HARDCODED_KEYS = [
  // "AIzaSy..._पहली_key",
  // "AIzaSy..._दूसरी_key"
];

// 🚀 नए models पहले (1,500/day), फिर पुराने fallbacks
const MODELS = [
  "gemini-3.6-flash",       // ✅ 1,500/day (NEW - Google Recommended)
  "gemini-3-flash",         // ✅ 1,500/day (NEW)
  "gemini-2.5-flash",       // ⚠️ 20/day (old, but fallback)
  "gemini-2.0-flash",       // ⚠️ legacy fallback
  "gemini-2.0-flash-lite",  // ⚠️ legacy fallback
  "gemini-1.5-flash"        // ⚠️ legacy fallback
];

// Keys collect करना — hardcoded + env variables दोनों से
function collectKeys(env) {
  const keys = new Set();
  
  // 1. Hardcoded keys
  HARDCODED_KEYS.forEach(k => k && keys.add(k.trim()));
  
  // 2. Environment variables (comma-separated support)
  try {
    if (env) {
      // GEMINI_KEYS (plural, comma-separated)
      if (env.GEMINI_KEYS) {
        String(env.GEMINI_KEYS).split(/[,;\n]+/).forEach(k => {
          const trimmed = k.trim();
          if (trimmed) keys.add(trimmed);
        });
      }
      // GEMINI_API_KEY (singular, existing support)
      if (env.GEMINI_API_KEY) {
        String(env.GEMINI_API_KEY).split(/[,;\n]+/).forEach(k => {
          const trimmed = k.trim();
          if (trimmed) keys.add(trimmed);
        });
      }
    }
  } catch (e) {}
  
  return Array.from(keys).filter(k => k.length > 10);
}

export default {
  async fetch(request, env) {
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json"
    };

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    // 🩺 Health Check - browser में URL खोलकर test
    if (request.method === "GET") {
      const keys = collectKeys(env);
      return new Response(JSON.stringify({
        status: "ok ✅",
        worker: "Aryan Studio Pro - Gemini Worker v10",
        totalKeys: keys.length,
        keys: keys.map(k => k.substring(0, 8) + "..." + k.slice(-4)),
        models: MODELS,
        quota: "1,500 requests/day per key (gemini-3.6-flash)",
        reset: "हर 24 घंटे (midnight Pacific)"
      }), { headers });
    }

    if (request.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "केवल POST रिक्वेस्ट ही मान्य है।" }),
        { status: 405, headers }
      );
    }

    try {
      const requestData = await request.json().catch(() => ({}));

      // ✅ सभी payload formats accept करें
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
        return new Response(
          JSON.stringify({ error: "प्रॉम्प्ट खाली है! (prompt/text/contents में से कोई field भेजें)" }),
          { status: 400, headers }
        );
      }

      // 🔑 Keys collect करें
      const keys = collectKeys(env);
      if (keys.length === 0) {
        return new Response(
          JSON.stringify({
            error: "❌ कोई Gemini API key नहीं मिली!\n\nकैसे fix करें:\n1. Cloudflare Dashboard → Worker → Settings → Variables\n2. GEMINI_API_KEY या GEMINI_KEYS नाम से key add करें\n3. एक से ज़्यादा keys के लिए comma (,) से अलग करें\n\nनई free key: https://aistudio.google.com/apikey"
          }),
          { status: 500, headers }
        );
      }

      const maxTokens = Math.min(8192, parseInt(requestData.maxTokens) || 8192);
      const errors = [];
      let lastQuotaMsg = "";

      // 🔑 हर KEY → हर MODEL try करो
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const keyTag = `Key${i+1}(${key.substring(0, 8)}...)`;
        let keyDead = false;

        for (const model of MODELS) {
          try {
            const generationConfig = {
              temperature: 0.95,
              topP: 0.98,
              maxOutputTokens: maxTokens
            };

            // ✅ FIX: thinkingConfig सभी 2.5+ और 3.x models के लिए
            if (model.startsWith("gemini-2.5") || model.startsWith("gemini-3")) {
              generationConfig.thinkingConfig = { thinkingBudget: 0 };
            }

            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

            const geminiResponse = await fetch(apiUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: userPrompt }] }],
                generationConfig: generationConfig
              })
            });

            const data = await geminiResponse.json().catch(() => ({}));

            // ❌ Error handling
            if (data.error) {
              const msg = data.error.message || "unknown error";
              errors.push(`${keyTag} → ${model}: ${msg}`);
              lastQuotaMsg = /quota|429|RESOURCE_EXHAUSTED|retry in/i.test(msg) ? msg : lastQuotaMsg;

              // Quota full → यह key मरी, अगली KEY पर जाओ
              if (/quota|429|RESOURCE_EXHAUSTED|retry in/i.test(msg)) {
                keyDead = true;
                break;
              }
              // Invalid key → अगली KEY पर जाओ
              if (/API key not valid|API_KEY_INVALID|does not have permission|PERMISSION_DENIED/i.test(msg)) {
                return new Response(
                  JSON.stringify({ error: `❌ ${msg} — Worker Settings में सही key डालें।` }),
                  { status: 401, headers }
                );
              }
              // Model unavailable → अगला MODEL try करो
              continue;
            }

            // ✅ Success
            if (data.candidates && data.candidates.length > 0 && data.candidates[0].content) {
              const aiText = (data.candidates[0].content.parts || []).map(p => p.text || "").join("");
              if (aiText.trim()) {
                return new Response(
                  JSON.stringify({
                    result: aiText,
                    response: aiText,
                    text: aiText,
                    model: model,
                    key: keyTag,
                    status: "ok"
                  }),
                  { headers }
                );
              }
            }

            errors.push(`${keyTag} → ${model}: empty response`);
          } catch (e) {
            errors.push(`${keyTag} → ${model}: ${e.message}`);
          }
        }

        if (keyDead) continue;
      }

      // ❌ सब fail — clear error message
      const quotaError = lastQuotaMsg
        ? `QUOTA FULL! ${lastQuotaMsg}\n\n💡 24 घंटे बाद reset होगा। तब तक दूसरी key add करो।`
        : `सभी ${keys.length} keys × ${MODELS.length} models fail:\n• ${errors.slice(0, 6).join("\n• ")}`;

      return new Response(
        JSON.stringify({
          error: quotaError,
          totalKeys: keys.length,
          triedModels: MODELS.length
        }),
        { status: lastQuotaMsg ? 429 : 502, headers }
      );

    } catch (error) {
      return new Response(
        JSON.stringify({ error: "कोड एरर: " + error.message }),
        { status: 500, headers }
      );
    }
  }
};
