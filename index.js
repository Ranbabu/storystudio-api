export default {
  async fetch(request, env) {
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json"
    };

    // 1. Preflight OPTIONS रिक्वेस्ट के लिए
    if (request.method === "OPTIONS") return new Response(null, { headers });

    // 2. केवल POST अलाउड है
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "केवल POST रिक्वेस्ट मान्य है।" }), { status: 405, headers });
    }

    try {
      const requestData = await request.json().catch(() => ({}));
      const userPrompt = requestData.prompt || requestData.text || "";

      if (!userPrompt || !userPrompt.trim()) {
        return new Response(JSON.stringify({ error: "प्रॉम्प्ट खाली है!" }), { status: 400, headers });
      }

      // 🔑 Cloudflare की सेटिंग्स से GEMINI_API_KEY उठाएगा
      const GEMINI_API_KEY = env.GEMINI_API_KEY; 

      if (!GEMINI_API_KEY) {
        return new Response(JSON.stringify({ error: "API Key (env.GEMINI_API_KEY) सेटिंग्स में नहीं मिली!" }), { status: 500, headers });
      }

      // ⚡ केवल 100% वर्किंग मॉडल: gemini-2.5-flash
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY.trim()}`;

      const geminiResponse = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: userPrompt }] }]
        })
      });

      const data = await geminiResponse.json();

      // ❌ गूगल API एरर चेकिंग
      if (data.error) {
        return new Response(JSON.stringify({ 
          error: `Google API Error: ${data.error.message || "Unknown Error"}` 
        }), { status: 400, headers });
      }

      // ✅ सेफ डेटा निष्कर्षण (क्रैश-प्रूफ)
      if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
        let aiText = data.candidates[0].content.parts.map(p => p.text || "").join("");
        return new Response(JSON.stringify({ result: aiText }), { headers });
      } else {
        return new Response(JSON.stringify({ error: "Gemini से रिस्पॉन्स खाली आया।" }), { status: 500, headers });
      }

    } catch (error) {
      return new Response(JSON.stringify({ error: "वर्कर एरर: " + error.message }), { status: 500, headers });
    }
  }
};
