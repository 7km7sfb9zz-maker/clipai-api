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

      const formData =
        await request.formData();

      const audio =
        formData.get("audio");


      if (!audio) {

        return json(
          {
            error:
              "No audio/video file received."
          },
          400,
          cors
        );

      }


      const audioBuffer =
        await audio.arrayBuffer();

      const audioBytes =
        [...new Uint8Array(audioBuffer)];


      // ==============================
      // 1. WHISPER
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
      // 2. AI HOOK
      // ==============================

      let hook =
        "";

      let hookError =
        "";


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
                      "You are an expert viral video editor. " +
                      "Create ONE extremely engaging opening hook " +
                      "for a short-form video. " +
                      "The hook must be based ONLY on the transcript. " +
                      "Do not invent facts. " +
                      "Do not reveal the ending. " +
                      "Make the viewer curious. " +
                      "It should take about 2 to 6 seconds to say. " +
                      "Return ONLY the spoken hook."
                  },

                  {
                    role: "user",

                    content:
                      "Transcript:\n\n" +
                      transcript +
                      "\n\n" +
                      "Write the viral hook now."
                  }

                ],

                max_tokens: 80,

                temperature: 0.7

              }
            );


            hook =
              aiResponse.response ||
              "";


            /*
             * Remove accidental quotation marks
             */

            hook =
              hook
                .trim()
                .replace(/^["']|["']$/g, "");


          }

          catch (error) {

            hookError =
              error.message ||
              "Hook generation failed.";

          }

      }


      // ==============================
      // 3. RETURN EVERYTHING
      // ==============================

      return json({

        success: true,

        ai: true,

        transcript:
          transcript,

        hook:
          hook,

        hookError:
          hookError,

        segments:
          transcription.segments || [],

        words:
          transcription.words || [],

        message:
          hook
            ? "Transcript and AI hook generated."
            : "Transcript generated but no hook was returned."

      }, 200, cors);


    }

    catch (error) {

      return json({

        success: false,

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