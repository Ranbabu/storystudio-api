// gemini-worker-v2.js — Cloudflare Worker (No 400 Error, Multi-Model Fallback)
export default {
  async fetch(request, env) {
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    if (request.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "केवल POST रिक्वेस्ट ही मान्य है।" }),
        { status: 405, headers: { ...headers, "Content-Type": "application/json" } }
      );
    }

    try {
      const requestData = await request.json().catch(() => ({}));

      // ✅ FIX: सभी payload formats accept करें (prompt / text / contents / message)
      let userPrompt = "";
      if (typeof requestData.prompt === "string") userPrompt = requestData.prompt;
      else if (typeof requestData.text === "string") userPrompt = requestData.text;
      else if (typeof requestData.message === "string") userPrompt = requestData.message;
      else if (requestData.contents && requestData.contents[0] && requestData.contents[0].parts && requestData.contents[0].parts[0]) {
        userPrompt = requestData.contents[0].parts[0].text || "";
      }

      if (!userPrompt || userPrompt.trim().length === 0) {
        return new Response(
          JSON.stringify({ error: "प्रॉम्प्ट खाली है! (prompt/text/contents में से कोई field भेजें)" }),
          { status: 400, headers: { ...headers, "Content-Type": "application/json" } }
        );
      }

      const GEMINI_API_KEY = env.GEMINI_API_KEY;

      if (!GEMINI_API_KEY) {
        return new Response(
          JSON.stringify({ error: "❌ Worker Settings में GEMINI_API_KEY सेट नहीं की गई है! Cloudflare Dashboard → Worker → Settings → Variables में जाएँ।" }),
          { status: 500, headers: { ...headers, "Content-Type": "application/json" } }
        );
      }

      // ✅ FIX: HTML से आए maxTokens का उपयोग करें (default 8192)
      const maxTokens = Math.min(8192, parseInt(requestData.maxTokens) || 8192);

      // ✅ FIX: Model Fallback Chain - जो model पहले काम करे उसका जवाब
      const MODELS = [
        "gemini-2.5-flash",
        "gemini-2.0-flash",
        "gemini-2.0-flash-lite",
        "gemini-1.5-flash"
      ];

      const errors = [];

      for (const model of MODELS) {
        try {
          // ✅ FIX: generationConfig भेजें (लंबे output के लिए ज़रूरी)
          const generationConfig = {
            temperature: 0.85,
            topP: 0.95,
            maxOutputTokens: maxTokens
          };

          // gemini-2.5 के लिए thinkingConfig ज़रूरी है (नहीं तो 400 आता है)
          if (model.startsWith("gemini-2.5")) {
            generationConfig.thinkingConfig = { thinkingBudget: 0 };
          }

          const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

          const geminiResponse = await fetch(apiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: userPrompt }] }],
              generationConfig: generationConfig
            })
          });

          const data = await geminiResponse.json().catch(() => ({}));

          if (data.error) {
            errors.push(`${model}: ${data.error.message}`);
            // API key invalid है तो दूसरे model try करना बेकार है
            if (data.error.message && /API key not valid|API_KEY_INVALID|does not have permission/i.test(data.error.message)) {
              return new Response(
                JSON.stringify({ error: `❌ ${data.error.message} — कृपया Cloudflare Worker Settings में सही GEMINI_API_KEY डालें।` }),
                { status: 401, headers: { ...headers, "Content-Type": "application/json" } }
              );
            }
            continue;
          }

          if (data.candidates && data.candidates.length > 0 && data.candidates[0].content) {
            const aiText = (data.candidates[0].content.parts || []).map(p => p.text || "").join("");
            if (aiText.trim()) {
              return new Response(
                JSON.stringify({
                  result: aiText,
                  response: aiText,  // HTML दोनों keys पढ़ सके
                  text: aiText,
                  model: model,
                  status: "ok"
                }),
                { headers: { ...headers, "Content-Type": "application/json" } }
              );
            }
          }

          errors.push(`${model}: empty response`);
        } catch (e) {
          errors.push(`${model}: ${e.message}`);
        }
      }

      // सभी model fail हो गए
      return new Response(
        JSON.stringify({
          error: "सभी Gemini models fail हो गए:\n• " + errors.join("\n• ")
        }),
        { status: 502, headers: { ...headers, "Content-Type": "application/json" } }
      );

    } catch (error) {
      return new Response(
        JSON.stringify({ error: "कोड एरर: " + error.message }),
        { status: 500, headers: { ...headers, "Content-Type": "application/json" } }
      );
    }
  }
};
