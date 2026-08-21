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

      const contentType =
        request.headers.get("content-type") || "";

      // ==========================================
      // JSON ANALYSIS REQUEST
      // ==========================================

      if (
        contentType.includes("application/json")
      ) {

        const body =
          await request.json();

        if (body.action !== "analyze") {
          return json(
            { error: "Unknown action." },
            400,
            cors
          );
        }

        const transcript =
          String(body.transcript || "");

        const duration =
          Number(body.duration) || 0;

        if (!transcript.trim()) {
          return json(
            {
              success: true,
              ai: true,
              transcript: "",
              hook: "",
              viralClips: [],
              viralError: "No transcript supplied.",
              clipCount: 0,
              bestScore: 0,
              bestClip: null
            },
            200,
            cors
          );
        }

        let viralClips = [];
        let viralError = "";
        let hook = "";
        let hookError = "";

        // ==========================================
        // VIRAL CLIP ANALYSIS
        // ==========================================

        try {

          const viralAI =
            await env.AI.run(
              "@cf/meta/llama-3.1-8b-instruct-fast",
              {
                messages: [

                  {
                    role: "system",

                    content: `
You are ClipAI, an expert short-form video editor.

Analyze the supplied timestamped transcript and find up to 3 of the strongest moments for TikTok, YouTube Shorts or Instagram Reels.

Look for:

- surprising statements
- funny moments
- emotional moments
- arguments
- controversial statements
- unusual facts
- stories
- strong opinions
- unexpected twists
- impressive information
- satisfying explanations
- curiosity
- memorable statements
- natural beginnings and payoffs

ONLY use information explicitly contained in the transcript.

NEVER invent:
- people
- relationships
- family
- secrets
- locations
- events
- motivations
- emotions
- backstory
- outcomes

Do not create fake drama.

Each clip must be between 10 and 60 seconds.

Use the timestamps supplied in the transcript.

Score each clip from 0 to 100.

Return ONLY valid JSON.

Format:

[
  {
    "score": 92,
    "start": 12.5,
    "end": 42.8,
    "reason": "Why this moment could perform well.",
    "hook": "A truthful hook based only on the transcript."
  }
]

If there are no genuinely interesting moments, return [].

No markdown.
No code fences.
No explanation.
`
                  },

                  {
                    role: "user",

                    content:
                      "VIDEO DURATION: " +
                      duration +
                      " seconds\n\n" +
                      "TIMESTAMPED TRANSCRIPT:\n\n" +
                      transcript
                  }

                ],

                max_tokens: 800,
                temperature: 0.15
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


        // ==========================================
        // VALIDATE CLIPS
        // ==========================================

        const safeClips =
          viralClips
            .filter(clip => {

              if (!clip) return false;

              const start =
                Number(clip.start);

              const end =
                Number(clip.end);

              return (
                Number.isFinite(start) &&
                Number.isFinite(end) &&
                end > start
              );

            })
            .map(clip => {

              let start =
                Math.max(
                  0,
                  Number(clip.start)
                );

              let end =
                Math.max(
                  start,
                  Number(clip.end)
                );

              if (
                end - start > 60
              ) {
                end = start + 60;
              }

              let score =
                Number(clip.score);

              if (!Number.isFinite(score)) {
                score = 0;
              }

              score =
                Math.round(
                  Math.min(
                    100,
                    Math.max(
                      0,
                      score
                    )
                  )
                );

              return {
                score,
                start,
                end,
                duration:
                  Math.round(
                    (end - start) * 10
                  ) / 10,
                reason:
                  String(
                    clip.reason ||
                    "Potentially interesting moment."
                  ),
                hook:
                  String(
                    clip.hook || ""
                  )
              };

            })
            .sort(
              (a, b) =>
                b.score - a.score
            )
            .slice(0, 3);


        // ==========================================
        // BEST HOOK
        // ==========================================

        if (safeClips.length > 0) {

          const best =
            safeClips[0];

          try {

            const hookAI =
              await env.AI.run(
                "@cf/meta/llama-3.1-8b-instruct-fast",
                {
                  messages: [

                    {
                      role: "system",

                      content: `
Create ONE short spoken hook for the selected video moment.

The hook must be completely truthful.

Use ONLY information explicitly contained in the supplied text.

Do not invent drama, secrets, people, relationships, emotions, backstory or outcomes.

Create curiosity without lying.

Keep it approximately 2-6 seconds when spoken.

Return ONLY the hook.
No quotation marks.
No explanation.
`
                    },

                    {
                      role: "user",

                      content:
                        "SELECTED MOMENT:\n\n" +
                        transcript
                    }

                  ],

                  max_tokens: 60,
                  temperature: 0.15
                }
              );

            hook =
              String(
                hookAI.response ||
                best.hook ||
                ""
              )
                .trim()
                .replace(
                  /^["']|["']$/g,
                  ""
                );

          } catch (error) {

            hookError =
              error.message ||
              "Hook generation failed.";

            hook =
              best.hook || "";
          }
        }


        return json(
          {
            success: true,
            ai: true,
            transcript,
            hook,
            hookError,
            viralClips: safeClips,
            viralError,
            clipCount:
              safeClips.length,
            bestScore:
              safeClips.length
                ? safeClips[0].score
                : 0,
            bestClip:
              safeClips.length
                ? safeClips[0]
                : null
          },
          200,
          cors
        );
      }


      // ==========================================
      // AUDIO CHUNK REQUEST
      // ==========================================

      if (
        !contentType.includes(
          "multipart/form-data"
        )
      ) {

        return json(
          {
            error:
              "Expected multipart/form-data."
          },
          400,
          cors
        );

      }


      const formData =
        await request.formData();

      const audio =
        formData.get("audio");

      if (!audio) {

        return json(
          {
            error:
              "No audio file received."
          },
          400,
          cors
        );

      }


      const audioBuffer =
        await audio.arrayBuffer();


      // ==========================================
      // AUDIO SIZE PROTECTION
      // ==========================================

      const MAX_AUDIO_BYTES =
        25 * 1024 * 1024;

      if (
        audioBuffer.byteLength >
        MAX_AUDIO_BYTES
      ) {

        return json(
          {
            error:
              "Audio chunk is too large. " +
              "Reduce the chunk size."
          },
          413,
          cors
        );

      }


      const audioBytes =
        [...new Uint8Array(audioBuffer)];


      // ==========================================
      // WHISPER
      // ==========================================

      const transcription =
        await env.AI.run(
          "@cf/openai/whisper-large-v3-turbo",
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


      // ==========================================
      // RETURN TRANSCRIPTION ONLY
      // ==========================================

      return json(
        {
          success: true,
          ai: true,

          transcript,

          segments,

          words,

          hook: "",

          hookError: "",

          viralClips: [],

          viralError: "",

          chunkIndex:
            formData.get("chunkIndex") || "",

          chunkStart:
            Number(
              formData.get("chunkStart")
            ) || 0,

          chunkDuration:
            Number(
              formData.get("chunkDuration")
            ) || 0
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


// ==========================================
// JSON RESPONSE
// ==========================================

function json(
  data,
  status,
  cors
) {

  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "Content-Type":
          "application/json",
        ...cors
      }
    }
  );

}