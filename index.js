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

      // 🔑 Key Check
      const rawKey = env.GEMINI_API_KEY || "";
      const keys = rawKey.split(/[,;\n]+/).map(k => k.trim()).filter(k => k.length > 10);

      if (!keys.length) {
        return new Response(JSON.stringify({ error: "API Key (env.GEMINI_API_KEY) सेटिंग्स में नहीं मिली!" }), { status: 500, headers });
      }

      // ⚡ स्टेबल (v1) और बीटा (v1beta) दोनों एंडपॉइंट्स की गारंटेड लिस्ट
      const TARGETS = [
        { ver: "v1", model: "gemini-1.5-flash" },     // 100% Stable Production (Every Key Works)
        { ver: "v1", model: "gemini-1.5-pro" },       // High Quality Hindi Production
        { ver: "v1beta", model: "gemini-1.5-flash" }, // Beta Fallback 1
        { ver: "v1beta", model: "gemini-2.5-flash" }  // Beta Fallback 2 (For older keys)
      ];

      let lastError = "";

      // 🔄 ऑटोमैटिक एंडपॉइंट व मॉडल स्विचिंग
      for (const key of keys) {
        for (const target of TARGETS) {
          const apiUrl = `https://generativelanguage.googleapis.com/${target.ver}/models/${target.model}:generateContent?key=${key}`;

          try {
            const res = await fetch(apiUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ parts: [{ text: userPrompt }] }]
              })
            });

            const data = await res.json().catch(() => ({}));

            // अगर यह एंडपॉइंट या मॉडल ब्लॉक है, तो तुरंत अगले पर जाएँ
            if (data.error) {
              lastError = data.error.message || "Model error";
              continue;
            }

            if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
              let aiText = data.candidates[0].content.parts.map(p => p.text || "").join("");
              if (aiText.trim()) {
                return new Response(JSON.stringify({ result: aiText, endpointUsed: `${target.ver}/${target.model}` }), { headers });
              }
            }
          } catch (e) {
            lastError = e.message;
          }
        }
      }

      return new Response(JSON.stringify({ error: "गूगल API एरर: " + lastError }), { status: 500, headers });

    } catch (error) {
      return new Response(JSON.stringify({ error: "वर्कर एरर: " + error.message }), { status: 500, headers });
    }
  }
};
