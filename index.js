export default {
  async fetch(request, env) {
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    if (request.method === "OPTIONS") return new Response(null, { headers });

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "केवल POST रिक्वेस्ट ही मान्य है।" }), { status: 405, headers: { ...headers, "Content-Type": "application/json" } });
    }

    try {
      const requestData = await request.json();
      const userPrompt = requestData.prompt;

      if (!userPrompt) {
        return new Response(JSON.stringify({ error: "प्रॉम्प्ट खाली है!" }), { status: 400, headers: { ...headers, "Content-Type": "application/json" } });
      }

      const GEMINI_API_KEY = env.GEMINI_API_KEY; 

      if (!GEMINI_API_KEY) {
        return new Response(JSON.stringify({ error: "API Key सेट नहीं की गई है!" }), { status: 500, headers: { ...headers, "Content-Type": "application/json" } });
      }

      // यहाँ मॉडल को 2.5 से बदलकर 3.6 कर दिया गया है 👇
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${GEMINI_API_KEY}`;

      const geminiResponse = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: userPrompt }] }] })
      });

      const data = await geminiResponse.json();

      if (data.error) {
        return new Response(JSON.stringify({ error: "Gemini Error: " + data.error.message }), { status: 500, headers: { ...headers, "Content-Type": "application/json" } });
      }

      if (data.candidates && data.candidates.length > 0) {
        let aiText = data.candidates[0].content.parts[0].text;
        return new Response(JSON.stringify({ result: aiText }), { headers: { ...headers, "Content-Type": "application/json" } });
      } else {
        return new Response(JSON.stringify({ error: "Gemini से कोई जवाब नहीं मिला।" }), { status: 500, headers: { ...headers, "Content-Type": "application/json" } });
      }

    } catch (error) {
      return new Response(JSON.stringify({ error: "कोड एरर: " + error.message }), { status: 500, headers: { ...headers, "Content-Type": "application/json" } });
    }
  }
};
