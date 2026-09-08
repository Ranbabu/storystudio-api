export default {
  async fetch(request, env) {
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json"
    };

    // 1. Preflight OPTIONS
    if (request.method === "OPTIONS") return new Response(null, { headers });

    // 2. Only POST allowed
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "केवल POST रिक्वेस्ट मान्य है।" }), { status: 405, headers });
    }

    try {
      const requestData = await request.json().catch(() => ({}));
      const userPrompt = requestData.prompt || requestData.text || "";

      if (!userPrompt || !userPrompt.trim()) {
        return new Response(JSON.stringify({ error: "प्रॉम्प्ट खाली है!" }), { status: 400, headers });
      }

      // 🔑 Get API Key from Environment
      const rawKey = env.GEMINI_API_KEY || "";
      const keys = rawKey.split(/[,;\n]+/).map(k => k.trim()).filter(k => k.length > 10);

      if (!keys.length) {
        return new Response(JSON.stringify({ error: "API Key (env.GEMINI_API_KEY) सेटिंग्स में नहीं मिली!" }), { status: 500, headers });
      }

      // ⚡ 100% वर्किंग गूगल ऑफिशियल मॉडल्स (gemini-2.5 हटा दिया गया है)
      const MODELS = [
        "gemini-1.5-flash", // PRIMARY: 100% Guaranteed Working on ALL keys
        "gemini-1.5-pro",   // SECONDARY: High Quality Hindi Script
        "gemini-2.0-flash"  // FALLBACK
      ];

      let lastError = "";

      // 🔄 ऑटोमैटिक मॉडल स्विचिंग
      for (const key of keys) {
        for (const model of MODELS) {
          const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

          try {
            const res = await fetch(apiUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ parts: [{ text: userPrompt }] }]
              })
            });

            const data = await res.json().catch(() => ({}));

            if (data.error) {
              lastError = data.error.message || "Model error";
              continue; // अगर इस मॉडल में इशू आया तो तुरंत अगले मॉडल पर जाएँ
            }

            if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
              let aiText = data.candidates[0].content.parts.map(p => p.text || "").join("");
              if (aiText.trim()) {
                return new Response(JSON.stringify({ result: aiText, modelUsed: model }), { headers });
              }
            }
          } catch (e) {
            lastError = e.message;
          }
        }
      }

      return new Response(JSON.stringify({ error: "Google API Error: " + lastError }), { status: 500, headers });

    } catch (error) {
      return new Response(JSON.stringify({ error: "वर्कर एरर: " + error.message }), { status: 500, headers });
    }
  }
};
