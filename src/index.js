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
      // WHISPER TRANSCRIPTION
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

      const segments =
        transcription.segments || [];

      const words =
        transcription.words || [];


      // ==============================
      // AI HOOK
      // ==============================

      let hook = "";
      let hookError = "";

      if (transcript.trim()) {

        const wordCount =
          transcript
            .trim()
            .split(/\s+/)
            .length;

        if (wordCount < 8) {

          hook =
            transcript.trim();

        } else {

          try {

            const hookAI =
              await env.AI.run(
                "@cf/meta/llama-3.1-8b-instruct-fast",
                {
                  messages: [

                    {
                      role: "system",

                      content:
                        `You are a strict viral short-form video editor.

Create ONE short spoken hook for the video.

The transcript is the ONLY source of truth.

NEVER invent or assume:
- people
- family
- relationships
- secrets
- locations
- events
- motivations
- emotions
- backstory
- outcomes
- context

Never claim something happened unless
the transcript explicitly says it happened.

Never invent a story around the transcript.

The hook should create curiosity using
ONLY information actually contained in
the transcript.

Keep it 2 to 6 seconds when spoken.

Return ONLY the hook text.

If there isn't enough information,
return a short sentence directly from
the transcript.`
                    },

                    {
                      role: "user",

                      content:
                        "TRANSCRIPT:\n\n" +
                        transcript
                    }

                  ],

                  max_tokens: 60,

                  temperature: 0.1
                }
              );

            hook =
              (hookAI.response || "")
                .trim()
                .replace(/^["']|["']$/g, "");

          } catch (error) {

            hookError =
              error.message ||
              "Hook generation failed.";

          }

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
            segments
              .map(segment => {

                return (
                  `[${formatTime(segment.start)} - ` +
                  `${formatTime(segment.end)}] ` +
                  `${segment.text || ""}`
                );

              })
              .join("\n");


          const viralAI =
            await env.AI.run(
              "@cf/meta/llama-3.1-8b-instruct-fast",
              {

                messages: [

                  {
                    role: "system",

                    content:
                      `You are an expert short-form video editor.

Analyze the timestamped transcript and
identify up to 3 strong potential viral moments.

Look for:
- surprising statements
- funny moments
- emotional moments
- arguments
- interesting stories
- useful information
- strong reactions
- curiosity
- satisfying payoffs
- memorable moments

Choose the clip length naturally.

Do NOT make every clip the same length.

Each clip must be between 10 and 60 seconds.

CRITICAL:
Only use information explicitly contained
in the transcript.

NEVER invent events, people, context,
backstory or outcomes.

Every start and end time MUST come
from the supplied transcript timestamps.

Return ONLY valid JSON.

Format:

[
  {
    "score": 95,
    "start": 12.5,
    "end": 41.2,
    "reason": "Why this moment could perform well",
    "hook": "A truthful hook based on the transcript"
  }
]

If there are no meaningful moments,
return [].

Do not use markdown.
Do not use code fences.`
                  },

                  {
                    role: "user",

                    content:
                      "TIMESTAMPED TRANSCRIPT:\n\n" +
                      timestampedTranscript
                  }

                ],

                max_tokens: 600,

                temperature: 0.2

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

            if (!Array.isArray(viralClips)) {

              viralClips = [];

              viralError =
                "AI returned invalid clip data.";

            }

          } catch {

            viralClips = [];

            viralError =
              "AI returned invalid JSON.";

          }

        } catch (error) {

          viralError =
            error.message ||
            "Viral analysis failed.";

        }

      }


      // ==============================
      // SAFETY CHECK CLIP TIMESTAMPS
      // ==============================

      const safeClips =
        viralClips
          .filter(clip => {

            return (
              clip &&
              Number.isFinite(
                Number(clip.start)
              ) &&
              Number.isFinite(
                Number(clip.end)
              )
            );

          })
          .map(clip => {

            const start =
              Math.max(
                0,
                Number(clip.start)
              );

            const end =
              Math.max(
                start,
                Number(clip.end)
              );

            return {

              score:
                Math.min(
                  100,
                  Math.max(
                    0,
                    Number(clip.score) || 0
                  )
                ),

              start:
                start,

              end:
                end,

              reason:
                clip.reason || "",

              hook:
                clip.hook || ""

            };

          });


      // ==============================
      // RETURN RESULTS
      // ==============================

      return json(
        {

          success: true,

          ai: true,

          transcript:
            transcript,

          segments:
            segments,

          words:
            words,

          hook:
            hook,

          hookError:
            hookError,

          viralClips:
            safeClips,

          viralError:
            viralError

        },
        200,
        cors
      );


    } catch (error) {

      return json(
        {
          success: false,

          error:
            error.message ||
            "AI processing failed."
        },
        500,
        cors
      );

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