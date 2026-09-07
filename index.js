// =====================================================
// Aryan Studio Pro - Universal AI Worker v3.0
// Supports: Gemini 3.6 Flash & Groq Llama 3 70B
// =====================================================

const GEMINI_MODEL = "gemini-3.6-flash";      // ✅ Updated
const GROQ_MODEL = "llama3-70b-8192";        // ✅ Updated (Free Tier)

// ----- HELPER: Gemini API Call -----
async function callGeminiAPI(apiKey, prompt, maxTokens = 4096) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
    const payload = {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
            temperature: 0.7,
            topP: 0.95,
            maxOutputTokens: maxTokens,
            thinkingConfig: { thinkingBudget: 0 }
        }
    };
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) {
        const errMsg = data.error?.message || "Unknown Error";
        if (res.status === 429 || errMsg.includes("quota") || errMsg.includes("rate limit")) {
            throw new Error(`429: ${errMsg.substring(0, 50)}`);
        }
        throw new Error(`Gemini Error ${res.status}: ${errMsg}`);
    }
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    if (!text) throw new Error("Empty response from Gemini");
    return text;
}

// ----- HELPER: Groq API Call (OpenAI Compatible) -----
async function callGroqAPI(apiKey, prompt, maxTokens = 4096) {
    const url = "https://api.groq.com/openai/v1/chat/completions";
    const payload = {
        model: GROQ_MODEL,
        messages: [
            { role: "system", content: "You are a helpful AI assistant. Always respond in valid JSON format only." },
            { role: "user", content: prompt }
        ],
        temperature: 0.7,
        max_tokens: maxTokens,
        response_format: { type: "json_object" }
    };
    const res = await fetch(url, {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
        const errMsg = data.error?.message || "Unknown Error";
        if (res.status === 429 || errMsg.includes("rate limit")) {
            throw new Error(`429: ${errMsg.substring(0, 50)}`);
        }
        throw new Error(`Groq Error ${res.status}: ${errMsg}`);
    }
    const text = data.choices?.[0]?.message?.content || "";
    if (!text) throw new Error("Empty response from Groq");
    return text;
}

// ----- MAIN WORKER HANDLER -----
export default {
    async fetch(request, env) {
        const headers = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
            "Content-Type": "application/json"
        };
        if (request.method === "OPTIONS") return new Response(null, { headers });
        if (request.method !== "POST") {
            return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
        }
        try {
            const body = await request.json();
            const { engine, keys, action, data } = body;
            if (!engine || !keys || keys.length === 0) {
                return new Response(JSON.stringify({ error: "Engine or API Keys missing" }), { status: 400, headers });
            }
            if (!action || !data) {
                return new Response(JSON.stringify({ error: "Action or Data missing" }), { status: 400, headers });
            }

            let prompt = "";
            let maxTokens = 4096;

            if (action === "extract_facts") {
                const { title, script } = data;
                if (!script || script.length < 20) {
                    return new Response(JSON.stringify({ error: "Script is too short or missing" }), { status: 400, headers });
                }
                prompt = `You are a professional news analyst. Extract key facts, a clean SEO-friendly title (max 70 chars), and 20-30 high-volume viral tags from the following YouTube video transcript and title.

**Rules:**
1. **Facts**: List only bullet points of solid facts (What, Who, Where, When, Numbers). Do NOT add any fluff.
2. **Title**: Rewrite the title to be clean, clickable, and optimized for SEO.
3. **Tags**: Generate 20-30 comma-separated tags (keywords).

**Input Title:** ${title || "N/A"}
**Input Script:** ${script.substring(0, 7000)} 

**Output Format (Strict JSON only):**
{
  "facts": "1. ...\\n2. ...\\n3. ...",
  "title": "Clean SEO Title Here",
  "tags": "tag1, tag2, tag3, ..."
}`;
            } 
            else if (action === "generate_final") {
                const { title, tags, facts } = data;
                if (!facts || facts.length < 10) {
                    return new Response(JSON.stringify({ error: "Facts are missing. Please run Extract Facts first." }), { status: 400, headers });
                }
                prompt = `You are a top-tier Hindi YouTube News Anchor and SEO Expert. Using the provided Facts, Title, and Tags, generate a complete viral content package.

**Rules:**
1. **New Script**: Write a 400-500 word (3-4 min) Hindi script. Start with "नमस्कार! आप देख रहे हैं आर्यन न्यूज़ टेक...". Use a human, conversational tone. Add suspense and questions.
2. **New Title**: Create a highly clickbait but truthful Hindi title (max 60 chars).
3. **New Description**: Write a short 3-line description with relevant hashtags.
4. **New Tags**: Generate 20-30 viral Hindi/English tags.

**Input Title:** ${title || "N/A"}
**Input Tags:** ${tags || "N/A"}
**Input Facts:** ${facts}

**Output Format (Strict JSON only):**
{
  "new_title": "Your new clickbait title",
  "new_script": "Your full 400-500 word Hindi script here...",
  "new_desc": "Your short description with #hashtags",
  "new_tags": "tag1, tag2, tag3, ..."
}`;
                maxTokens = 8192;
            } else {
                return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400, headers });
            }

            // --- Engine Dispatcher with Auto Key Rotation ---
            let lastError = null;
            let keysToTry = [...keys];
            for (let i = 0; i < keysToTry.length; i++) {
                const key = keysToTry[i];
                try {
                    let resultText = "";
                    if (engine === "gemini") {
                        resultText = await callGeminiAPI(key, prompt, maxTokens);
                    } else if (engine === "groq") {
                        resultText = await callGroqAPI(key, prompt, maxTokens);
                    } else {
                        return new Response(JSON.stringify({ error: "Unsupported engine" }), { status: 400, headers });
                    }

                    let parsed;
                    try {
                        const cleanJson = resultText.replace(/```json/g, '').replace(/```/g, '').trim();
                        parsed = JSON.parse(cleanJson);
                    } catch (e) {
                        return new Response(JSON.stringify({ 
                            error: "AI returned invalid JSON",
                            raw: resultText.substring(0, 200) 
                        }), { status: 500, headers });
                    }

                    return new Response(JSON.stringify({ 
                        success: true, 
                        data: parsed,
                        engine: engine,
                        keyUsed: key.substring(0, 5) + '...' 
                    }), { headers });

                } catch (error) {
                    const errString = String(error);
                    if (errString.includes("429") || errString.includes("rate limit") || errString.includes("quota")) {
                        lastError = "Rate Limit on key " + (i+1);
                        continue;
                    } else {
                        // Any other error (404, etc.) return immediately
                        return new Response(JSON.stringify({ error: errString }), { status: 500, headers });
                    }
                }
            }
            return new Response(JSON.stringify({ 
                error: "ALL_KEYS_RATE_LIMITED", 
                message: "सभी API Keys की Rate Limit पार हो गई है। कृपया 1 मिनट बाद पुनः प्रयास करें।",
                retryAfter: 60 
            }), { status: 429, headers });

        } catch (error) {
            return new Response(JSON.stringify({ error: "Server Error: " + String(error) }), { status: 500, headers });
        }
    }
};
