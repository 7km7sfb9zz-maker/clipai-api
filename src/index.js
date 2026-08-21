export default {
  async fetch(request, env) {

    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: cors
      });
    }

    if (request.method !== "POST") {
      return json(
        { error: "Use POST" },
        405,
        cors
      );
    }

    try {

      const formData = await request.formData();

      const audio = formData.get("audio");

      if (!audio) {
        return json(
          { error: "No video/audio file received." },
          400,
          cors
        );
      }

      const audioBuffer =
        await audio.arrayBuffer();

      const audioBytes =
        [...new Uint8Array(audioBuffer)];


      // =====================================
      // 1. WHISPER TRANSCRIPTION
      // =====================================

      const transcription =
        await env.AI.run(
          "@cf/openai/whisper",
          {
            audio: audioBytes
          }
        );


      const transcript =
        transcription.text || "";


      // =====================================
      // 2. AI VIRAL HOOK
      // =====================================

      let hook = "";


      if (transcript.trim()) {

        const aiResponse =
          await env.AI.run(
            "@cf/meta/llama-3.1-8b-instruct-fast",
            {
              messages: [

                {
                  role: "system",

                  content:
                    `You create short hooks for
TikTok, YouTube Shorts and Instagram Reels.

Create ONE spoken hook for the beginning
of this video.

Rules:

- 2 to 6 seconds when spoken
- Create curiosity
- Make the viewer want to continue watching
- Do not lie
- Do not invent information
- Do not reveal the ending
- Sound natural
- Do not use hashtags
- Return ONLY the hook`
                },

                {
                  role: "user",

                  content:
                    `Create a hook for this transcript:

${transcript}`
                }

              ],

              max_tokens: 80,

              temperature: 0.7
            }
          );


        hook =
          aiResponse.response || "";

      }


      // =====================================
      // 3. RETURN RESULTS
      // =====================================

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

        message:
          "Whisper transcription and AI hook complete."

      }, 200, cors);


    } catch (error) {

      console.error(error);

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
        "Content-Type":
          "application/json",

        ...cors
      }
    }
  );

}