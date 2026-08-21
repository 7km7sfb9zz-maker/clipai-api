export default {
  async fetch(request, env) {

    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    if (request.method !== "POST") {
      return json({ error: "Use POST" }, 405, cors);
    }

    try {

      const formData = await request.formData();
      const audio = formData.get("audio");

      if (!audio) {
        return json({
          error: "No audio/video file received."
        }, 400, cors);
      }

      const audioBuffer = await audio.arrayBuffer();

      const audioBytes =
        [...new Uint8Array(audioBuffer)];


      // ==============================
      // WHISPER
      // ==============================

      const transcription =
        await env.AI.run(
          "@cf/openai/whisper",
          {
            audio: audioBytes
          }
        );

      const transcript =
        transcription.text || "";


      // ==============================
      // AI HOOK
      // ==============================

      let hook = "";

      let hookError = "";


      if (transcript.trim()) {

        try {

          const aiResponse =
            await env.AI.run(
              "@cf/meta/llama-3.1-8b-instruct-fast",
              {
                messages: [

                  {
                    role: "system",

                    content:
                      "You are a viral short-form video editor. " +
                      "Write ONE short spoken hook for the beginning " +
                      "of a TikTok, YouTube Short or Instagram Reel. " +
                      "The hook should create curiosity and make people " +
                      "want to keep watching. It must be truthful and " +
                      "based only on the transcript. Keep it between " +
                      "2 and 6 seconds when spoken. Return ONLY the hook."
                  },

                  {
                    role: "user",

                    content:
                      "Video transcript:\n\n" +
                      transcript +
                      "\n\nWrite the hook now."
                  }

                ],

                max_tokens: 80,

                temperature: 0.7
              }
            );


          hook =
            aiResponse.response || "";


        } catch (error) {

          hookError =
            error.message ||
            "Hook generation failed.";

        }

      }


      return json({

        success: true,

        transcript:
          transcript,

        segments:
          transcription.segments || [],

        words:
          transcription.words || [],

        hook:
          hook.trim(),

        hookError:
          hookError

      }, 200, cors);


    } catch (error) {

      return json({

        error:
          error.message ||
          "AI processing failed."

      }, 500, cors);

    }

  }
};


function json(data, status, cors) {

  return new Response(
    JSON.stringify(data),
    {
      status: status,

      headers: {
        "Content-Type": "application/json",
        ...cors
      }
    }
  );

}