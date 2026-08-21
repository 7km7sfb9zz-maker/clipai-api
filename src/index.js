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

      // ==========================================
      // RECEIVE AUDIO CHUNK
      // ==========================================

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

      /*
       * Protect the Worker from accidentally
       * receiving an enormous audio chunk.
       *
       * The frontend should normally send
       * approximately 60-second chunks.
       */

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
              "Please use smaller chunks."
          },
          413,
          cors
        );

      }


      const audioBytes =
        [...new Uint8Array(audioBuffer)];


      // ==========================================
      // WHISPER TRANSCRIPTION
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
      // DEFAULT RESULTS
      // ==========================================

      let hook = "";

      let hookError = "";

      let viralClips = [];

      let viralError = "";


      // ==========================================
      // NOTHING SPOKEN
      // ==========================================

      if (!transcript.trim()) {

        return json(
          {
            success: true,

            ai: true,

            transcript: "",

            segments: [],

            words: [],

            hook: "",

            hookError: "",

            viralClips: [],

            viralError:
              "No speech detected."
          },
          200,
          cors
        );

      }


      // ==========================================
      // BUILD TIMESTAMPED TRANSCRIPT
      // ==========================================

      const timestampedTranscript =
        segments
          .map(segment => {

            const start =
              Number(segment.start) || 0;

            const end =
              Number(segment.end) || start;

            const text =
              segment.text || "";

            return (
              `[${formatTime(start)} - ` +
              `${formatTime(end)}] ` +
              `${text}`
            );

          })
          .join("\n");


      // ==========================================
      // VIRAL MOMENT ANALYSIS
      // ==========================================

      try {

        const viralAI =
          await env.AI.run(
            "@cf/meta/llama-3.1-8b-instruct-fast",
            {

              messages: [

                {
                  role: "system",

                  content:
                    `You are ClipAI, an expert viral short-form video editor.

Find the BEST moments in the supplied video transcript for TikTok, YouTube Shorts or Instagram Reels.

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

Choose up to 3 strong moments.

Each clip should normally be between 10 and 60 seconds.

Do not make every clip the same length.

Prefer moments with a clear beginning, interesting development and payoff.

The timestamps MUST come from the supplied transcript.

Give each clip a score from 0 to 100.

90-100 = extremely strong
75-89 = strong
60-74 = decent
40-59 = weak
0-39 = poor

Do not give high scores simply because a moment exists.

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

If there are no genuinely interesting moments:

[]

No markdown.
No code fences.
No explanation outside the JSON.`
                },

                {
                  role: "user",

                  content:
                    "TIMESTAMPED TRANSCRIPT:\n\n" +
                    timestampedTranscript
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
            .replace(
              /^```json/i,
              ""
            )
            .replace(
              /^```/i,
              ""
            )
            .replace(
              /```$/i,
              ""
            )
            .trim();


        try {

          viralClips =
            JSON.parse(raw);


          if (
            !Array.isArray(
              viralClips
            )
          ) {

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
      // SAFELY VALIDATE VIRAL CLIPS
      // ==========================================

      const safeClips =
        viralClips

          .filter(clip => {

            if (!clip) {
              return false;
            }


            const start =
              Number(clip.start);


            const end =
              Number(clip.end);


            if (
              !Number.isFinite(start) ||
              !Number.isFinite(end)
            ) {

              return false;

            }


            if (
              end <= start
            ) {

              return false;

            }


            return true;

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


            /*
             * Never allow a clip longer
             * than 60 seconds.
             */

            if (
              end - start >
              60
            ) {

              end =
                start + 60;

            }


            let score =
              Number(clip.score);


            if (
              !Number.isFinite(score)
            ) {

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

              score:

                score,

              start:

                start,

              end:

                end,

              duration:

                Math.round(
                  (
                    end -
                    start
                  ) * 10
                ) / 10,

              reason:

                String(
                  clip.reason ||
                  "Potentially interesting moment."
                ),

              hook:

                String(
                  clip.hook ||
                  ""
                )

            };

          })


          .sort(
            (a, b) =>
              b.score -
              a.score
          )


          .slice(
            0,
            3
          );


      // ==========================================
      // GENERATE HOOK FOR BEST MOMENT
      // ==========================================

      if (
        safeClips.length > 0
      ) {

        const bestClip =
          safeClips[0];


        const bestText =
          segments

            .filter(segment => {

              const start =
                Number(
                  segment.start
                ) || 0;


              const end =
                Number(
                  segment.end
                ) || start;


              return (
                end >=
                  bestClip.start &&
                start <=
                  bestClip.end
              );

            })


            .map(
              segment =>
                segment.text || ""
            )


            .join(" ");


        if (
          bestText.trim()
        ) {

          try {

            const hookAI =
              await env.AI.run(
                "@cf/meta/llama-3.1-8b-instruct-fast",
                {

                  messages: [

                    {
                      role: "system",

                      content:
                        `You create short-form video hooks.

Create ONE short spoken hook for the selected video moment.

The hook MUST be truthful.

Use ONLY information explicitly contained in the supplied text.

Do not invent:

- secrets
- people
- relationships
- drama
- backstory
- outcomes
- motivations

Create curiosity without lying.

Keep it short enough to speak in approximately 2-6 seconds.

Return ONLY the hook.

No quotation marks.
No explanation.`
                    },

                    {
                      role: "user",

                      content:
                        "SELECTED MOMENT:\n\n" +
                        bestText
                    }

                  ],

                  max_tokens: 60,

                  temperature: 0.15

                }
              );


            hook =
              (
                hookAI.response ||
                bestClip.hook ||
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
              bestClip.hook ||
              "";

          }

        }

      }


      // ==========================================
      // FALLBACK HOOK
      // ==========================================

      if (
        !hook.trim() &&
        transcript.trim()
      ) {

        const wordCount =
          transcript
            .trim()
            .split(/\s+/)
            .length;


        if (
          wordCount <= 12
        ) {

          hook =
            transcript.trim();

        }

      }


      // ==========================================
      // RETURN EVERYTHING
      // ==========================================

      return json(
        {

          success:
            true,

          ai:
            true,

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
            viralError,

          clipCount:
            safeClips.length,

          bestScore:
            safeClips.length > 0
              ? safeClips[0].score
              : 0,

          bestClip:
            safeClips.length > 0
              ? safeClips[0]
              : null

        },

        200,

        cors

      );


    } catch (error) {

      return json(
        {

          success:
            false,

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
// FORMAT TIME
// ==========================================

function formatTime(seconds) {

  seconds =
    Number(seconds) || 0;


  const minutes =
    Math.floor(
      seconds / 60
    );


  const remaining =
    Math.floor(
      seconds % 60
    );


  return (
    String(minutes)
      .padStart(2, "0") +
    ":" +
    String(remaining)
      .padStart(2, "0")
  );

}


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

      status:
        status,

      headers: {

        "Content-Type":
          "application/json",

        ...cors

      }

    }
  );

}