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

    // 2. Only POST Allowed
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
        return new Response(JSON.stringify({ error: "Cloudflare सेटिंग्स में GEMINI_API_KEY मौजूद नहीं है!" }), { status: 500, headers });
      }

      // ⚡ 100% वर्किंग गूगल ऑफिशियल मॉडल्स (v1beta एंडपॉइंट पर)
      const MODELS = [
        "gemini-1.5-flash", // 1st Priority (Fast, Free & Best Hindi Script)
        "gemini-1.5-pro"    // 2nd Priority
      ];

      let detailedErrors = [];

      for (const key of keys) {
        for (const model of MODELS) {
          // Gemini 1.5 REQUIRES v1beta Endpoint
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
              detailedErrors.push(`[${model}]: ${data.error.message || "API Error"}`);
              continue;
            }

            if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
              let aiText = data.candidates[0].content.parts.map(p => p.text || "").join("");
              if (aiText.trim()) {
                return new Response(JSON.stringify({ result: aiText, modelUsed: model }), { headers });
              }
            }
          } catch (e) {
            detailedErrors.push(`[${model}]: ${e.message}`);
          }
        }
      }

      return new Response(JSON.stringify({ 
        error: "गूगल API त्रुटि:\n• " + detailedErrors.join("\n• ") 
      }), { status: 500, headers });

    } catch (error) {
      return new Response(JSON.stringify({ error: "वर्कर एरर: " + error.message }), { status: 500, headers });
    }
  }
};
