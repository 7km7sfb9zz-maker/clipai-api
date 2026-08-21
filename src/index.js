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
          { error: "No video/audio file received." },
          400,
          cors
        );

      }


      /*
       * Convert uploaded video/audio
       * into bytes for Whisper.
       */

      const audioBuffer =
        await audio.arrayBuffer();

      const audioBytes =
        [...new Uint8Array(audioBuffer)];


      /*
       * STEP 1
       * Transcribe with Whisper.
       */

      const transcription =
        await env.AI.run(
          "@cf/openai/whisper",
          {
            audio: audioBytes
          }
        );


      const transcript =
        transcription.text || "";


      /*
       * STEP 2
       * Ask an AI model to create
       * a short viral hook.
       */

      let hook =
        "";


      if (transcript.trim()) {

        const aiResponse =
          await env.AI.run(
            "@cf/meta/llama-3.1-8b-instruct",
            {

              messages: [

                {
                  role: "system",

                  content:
                    `You write short hooks for
                     TikTok, YouTube Shorts and
                     Instagram Reels.

                     Create ONE short spoken
                     introduction for the video.

                     Requirements:

                     - 2 to 6 seconds when spoken
                     - Create curiosity
                     - Make people want to keep watching
                     - Do not lie
                     - Do not invent facts
                     - Do not reveal the ending
                     - Sound natural when spoken
                     - Do not use hashtags
                     - Return ONLY the hook text.`
                },

                {
                  role: "user",

                  content:
                    `Create a hook for this
                     video transcript:

                     ${transcript}`
                }

              ]

            }
          );


        hook =
          aiResponse.response || "";

      }


      /*
       * Return everything to the website.
       */

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
          "Transcription and AI hook complete."

      }, 200, cors);


    }

    catch (error) {

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