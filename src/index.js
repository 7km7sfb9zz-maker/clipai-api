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
      return json({ error: "Use POST" }, 405, cors);
    }

    try {

      const formData =
        await request.formData();

      const audio =
        formData.get("audio");

      if (!audio) {
        return json({
          error: "No audio/video file received."
        }, 400, cors);
      }


      // ==============================
      // WHISPER
      // ==============================

      const audioBuffer =
        await audio.arrayBuffer();

      const audioBytes =
        [...new Uint8Array(audioBuffer)];

      const transcription =
        await env.AI.run(
          "@cf/openai/whisper",
          {
            audio: audioBytes
          }
        );

      const transcript =
        transcription.text || "";

      const segments =
        transcription.segments || [];


      // ==============================
      // AI HOOK
      // ==============================

      let hook = "";
      let hookError = "";

      if (transcript.trim()) {

        try {

          const hookAI =
            await env.AI.run(
              "@cf/meta/llama-3.1-8b-instruct-fast",
              {

                messages: [

                  {
                    role: "system",

                    content:
                      "You are a viral short-form video editor. " +
                      "Create ONE short spoken hook for the beginning " +
                      "of the video. Make it curiosity-driven, truthful " +
                      "and based only on the transcript. " +
                      "It should take 2 to 6 seconds to say. " +
                      "Return ONLY the hook."
                  },

                  {
                    role: "user",

                    content:
                      "Transcript:\n\n" +
                      transcript
                  }

                ],

                max_tokens: 80,
                temperature: 0.7

              }
            );

            hook =
              (hookAI.response || "")
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
      // VIRAL CLIP ANALYSIS
      // ==============================

      let viralClips = [];
      let viralError = "";


      if (segments.length > 0) {

        try {

          const timestampedTranscript =
            segments.map(
              (segment, index) => {

                return (
                  `[${formatTime(segment.start)} - ` +
                  `${formatTime(segment.end)}] ` +
                  `${segment.text}`
                );

              }
            ).join("\n");


          const viralAI =
            await env.AI.run(
              "@cf/meta/llama-3.1-8b-instruct-fast",
              {

                messages: [

                  {
                    role: "system",

                    content:
                      `You are an expert viral video editor.

Analyze the timestamped transcript and find up to 3
of the strongest short-form video moments.

Look for:
- strong hooks
- surprising statements
- emotional moments
- funny moments
- arguments or tension
- useful information
- strong stories
- curiosity
- satisfying payoffs

The clip length should be chosen naturally.
Do NOT force every clip to the same length.

Each clip must be between 10 and 60 seconds.

Return ONLY valid JSON in this exact format:

[
  {
    "score": 95,
    "start": 12.5,
    "end": 41.2,
    "reason": "Strong curiosity and payoff",
    "hook": "Short hook for this clip"
  }
]

Do not include markdown.
Do not include code fences.`

                  },

                  {
                    role: "user",

                    content:
                      "Timestamped transcript:\n\n" +
                      timestampedTranscript
                  }

                ],

                max_tokens: 500,

                temperature: 0.5

              }
            );


          let raw =
            viralAI.response || "";


          raw =
            raw
              .trim()
              .replace(/^```json/i, "")
              .replace(/^```/i, "")
              .replace(/```$/i, "")
              .trim();


          try {

            viralClips =
              JSON.parse(raw);

          }

          catch {

            viralClips = [];

            viralError =
              "AI returned invalid clip data.";

          }


        }

        catch (error) {

          viralError =
            error.message ||
            "Viral analysis failed.";

        }

      }


      // ==============================
      // RETURN RESULTS
      // ==============================

      return json({

        success: true,

        ai: true,

        transcript:
          transcript,

        segments:
          segments,

        words:
          transcription.words || [],

        hook:
          hook,

        hookError:
          hookError,

        viralClips:
          viralClips,

        viralError:
          viralError

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


function formatTime(seconds) {

  seconds =
    Number(seconds) || 0;

  const minutes =
    Math.floor(seconds / 60);

  const remaining =
    Math.floor(seconds % 60);

  return (
    String(minutes).padStart(2, "0") +
    ":" +
    String(remaining).padStart(2, "0")
  );

}


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