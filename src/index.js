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

      const audioBytes =
        [...new Uint8Array(audioBuffer)];


      // ==========================================
      // WHISPER
      // ==========================================

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
            viralError: "No speech detected."
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

Your job is to find the BEST moments inside a video transcript that could become TikTok, YouTube Shorts or Instagram Reels clips.

Analyze the transcript carefully.

Look especially for:

- surprising statements
- funny moments
- emotional reactions
- arguments
- controversial statements
- unusual facts
- stories
- strong opinions
- unexpected twists
- impressive information
- satisfying explanations
- moments that create curiosity
- moments where someone says something memorable
- moments with a natural beginning and payoff

IMPORTANT:

Only use information explicitly contained in the transcript.

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

Do not turn an ordinary sentence into a fake dramatic story.

Choose up to 3 of the strongest moments.

A clip should normally be between 10 and 60 seconds.

Do NOT make every clip the same length.

Prefer clips that have a clear reason someone would keep watching.

The timestamps MUST come from the supplied transcript.

The clip start should begin slightly before the important statement when possible.

The clip end should include the natural conclusion or payoff.

Give each clip a viral potential score from 0 to 100.

Scoring:

90-100 = extremely strong viral potential
75-89 = strong potential
60-74 = decent potential
40-59 = weak
0-39 = not worth clipping

Do not give high scores simply because something exists.

Return ONLY valid JSON.

Use exactly this structure:

[
  {
    "score": 92,
    "start": 12.5,
    "end": 42.8,
    "reason": "Short explanation of why this moment is compelling.",
    "hook": "A truthful short hook based only on what was said."
  }
]

If there are no genuinely interesting moments, return:

[]

Do not use markdown.
Do not use code fences.
Do not write anything outside the JSON array.`
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

            if (end <= start) {
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


            // Prevent absurdly long clips.

            if (
              end - start >
              60
            ) {

              end =
                start + 60;

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
      // GENERATE HOOK FOR THE BEST MOMENT
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
                Number(segment.start) || 0;

              const end =
                Number(segment.end) || start;

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

          // Useful information for
          // the frontend.

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