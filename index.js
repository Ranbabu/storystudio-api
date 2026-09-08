// =====================================================
// Aryan Studio Pro - Gemini AI Worker v17 (FIXED MODELS & ROTATION)
// ✅ FIX 1: Google Gemini Official Active Models (gemini-1.5-flash, gemini-2.5-flash)
// ✅ FIX 2: 429/Rate Limit & Key Failover Fix
// =====================================================

const HARDCODED_KEYS = [];

// 🔑 Google API के 100% काम करने वाले ऑफिशियल वर्किंग मॉडल्स
const MODELS = [
  "gemini-1.5-flash",
  "gemini-2.5-flash",
  "gemini-1.5-pro"
];

const MAX_ATTEMPTS = 6;

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
        worker: "Aryan Studio Pro - Gemini Worker v17",
        totalKeysLoaded: keys.length,
        modelsActive: MODELS
      }), { headers });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "केवल POST मान्य है" }), { status: 405, headers });
    }

    try {
      const requestData = await request.json().catch(() => ({}));
      let userPrompt = requestData.prompt || requestData.text || requestData.message || "";

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

      const shuffled = keys.sort(() => Math.random() - 0.5);

      outer:
      for (const key of shuffled) {
        const keyTag = `Key(${key.substring(0, 5)}...)`;

        for (const model of MODELS) {
          if (attempts >= MAX_ATTEMPTS) break outer;
          attempts++;

          const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

          try {
            let res = await fetch(apiUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ 
                contents, 
                generationConfig: {
                  maxOutputTokens: maxTokens,
                  temperature: 0.7,
                  topP: 0.95
                } 
              })
            });
            let data = await res.json().catch(() => ({}));

            if (data.error) {
              const msg = data.error.message || "unknown";
              errors.push(`${keyTag} → ${model}: ${msg.substring(0, 80)}`);
              continue;
            }

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
      }

      return new Response(JSON.stringify({
        error: `सभी कोशिशें फेल:\n• ${errors.slice(0, 4).join("\n• ")}`,
        status: "failed"
      }), { status: 502, headers });

    } catch (error) {
      return new Response(JSON.stringify({
        error: "सर्वर एरर: " + error.message
      }), { status: 500, headers });
    }
  }
};
