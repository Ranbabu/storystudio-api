export default {
  // ध्यान दें: यहाँ 'env' पैरामीटर बहुत ज़रूरी है
  async fetch(request, env) {
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    if (request.method === "OPTIONS") return new Response(null, { headers });

    if (request.method !== "POST") {
      return new Response("केवल POST रिक्वेस्ट ही मान्य है।", { status: 405, headers });
    }

    try {
      const requestData = await request.json();
      const userPrompt = requestData.prompt;

      if (!userPrompt) {
        return new Response(JSON.stringify({ error: "प्रॉम्प्ट खाली है!" }), { status: 400, headers });
      }

      // बदलाव यहाँ हुआ है 👇
      // अब कोड API Key सीधे Cloudflare की सेटिंग्स से उठाएगा
      const GEMINI_API_KEY = env.GEMINI_API_KEY; 

      if (!GEMINI_API_KEY) {
        return new Response(JSON.stringify({ error: "API Key सेट नहीं की गई है!" }), { status: 500, headers });
      }

      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

      const geminiResponse = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: userPrompt }] }] })
      });

      const data = await geminiResponse.json();
      let aiText = data.candidates[0].content.parts[0].text;

      return new Response(JSON.stringify({ result: aiText }), { headers, headers: { ...headers, "Content-Type": "application/json" } });

    } catch (error) {
      return new Response(JSON.stringify({ error: "API काम नहीं कर रही है।" }), { status: 500, headers });
    }
  }
};
