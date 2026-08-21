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


      // =====================================================
      // SECOND AI ANALYSIS
      // Frontend sends JSON:
      // { action:"analyze", transcript, duration }
      // =====================================================

      if (
        contentType.includes("application/json")
      ) {

        const body =
          await request.json();

        if (
          body.action === "analyze"
        ) {

          return await deepAnalysis(
            body.transcript || "",
            Number(body.duration) || 0,
            env,
            cors
          );

        }

        return json(
          {
            success: false,
            error: "Unknown JSON action."
          },
          400,
          cors
        );
      }


      // =====================================================
      // AUDIO TRANSCRIPTION
      // =====================================================

      const formData =
        await request.formData();

      const audio =
        formData.get("audio");

      if (!audio) {
        return json(
          {
            success: false,
            error:
              "No audio file received."
          },
          400,
          cors
        );
      }


      const audioBuffer =
        await audio.arrayBuffer();


      const MAX_AUDIO_BYTES =
        25 * 1024 * 1024;


      if (
        audioBuffer.byteLength >
        MAX_AUDIO_BYTES
      ) {

        return json(
          {
            success: false,
            error:
              "Audio chunk is too large. Please use smaller chunks."
          },
          413,
          cors
        );

      }


      const audioBytes =
        [...new Uint8Array(audioBuffer)];


      // =====================================================
      // WHISPER
      // =====================================================

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


      return json(
        {
          success: true,
          ai: true,
          transcript,
          segments,
          words
        },
        200,
        cors
      );


    } catch (error) {

      console.error(error);

      return json(
        {
          success: false,
          error:
            error?.message ||
            "AI processing failed."
        },
        500,
        cors
      );

    }
  }
};


// =========================================================
// DEEP SECOND-STAGE ANALYSIS
// =========================================================

async function deepAnalysis(
  transcript,
  duration,
  env,
  cors
) {

  if (!transcript.trim()) {

    return json(
      {
        success: true,
        hook: "",
        viralClips: [],
        clipCount: 0,
        bestScore: 0,
        bestClip: null
      },
      200,
      cors
    );

  }


  // =======================================================
  // FIRST PASS
  // Find candidate viral moments
  // =======================================================

  const firstPass =
    await env.AI.run(
      "@cf/meta/llama-3.1-8b-instruct-fast",
      {

        messages: [

          {
            role: "system",

            content: `
You are ClipAI's first-pass viral video detector.

Analyze the COMPLETE timestamped transcript.

Find up to 5 candidate moments that could work exceptionally well as:
- TikTok clips
- YouTube Shorts
- Instagram Reels

Look for:
- strong openings
- surprising statements
- funny moments
- arguments
- emotional moments
- controversial opinions
- unexpected twists
- impressive facts
- stories
- strong reactions
- curiosity
- unusual information
- satisfying explanations
- clear payoffs

ONLY use information contained in the transcript.

Never invent:
- people
- relationships
- events
- motivations
- emotions
- locations
- backstory
- outcomes

Candidate clips should normally be 10-60 seconds.

Return ONLY JSON.

Format:

[
  {
    "start": 10,
    "end": 35,
    "reason": "Why this moment deserves deeper analysis."
  }
]

If there are no candidates, return [].
`
          },

          {
            role: "user",

            content:
              "TIMESTAMPED TRANSCRIPT:\n\n" +
              transcript
          }

        ],

        max_tokens: 1200,

        temperature: 0.1

      }
    );


  let candidates = [];


  try {

    let raw =
      firstPass.response || "";

    raw =
      cleanJSON(raw);

    candidates =
      JSON.parse(raw);

    if (!Array.isArray(candidates)) {
      candidates = [];
    }

  } catch {

    candidates = [];

  }


  // =======================================================
  // VALIDATE CANDIDATES
  // =======================================================

  candidates =
    candidates
      .filter(item => {

        if (!item) {
          return false;
        }

        const start =
          Number(item.start);

        const end =
          Number(item.end);

        return (
          Number.isFinite(start) &&
          Number.isFinite(end) &&
          end > start
        );

      })
      .map(item => {

        let start =
          Math.max(
            0,
            Number(item.start)
          );

        let end =
          Math.max(
            start,
            Number(item.end)
          );

        if (
          end - start > 60
        ) {
          end = start + 60;
        }

        return {
          start,
          end,
          reason:
            String(
              item.reason || ""
            )
        };

      })
      .slice(0, 5);


  // =======================================================
  // SECOND / DEEP PASS
  // This is the important part.
  //
  // Each candidate is individually examined in detail.
  // =======================================================

  const analysedClips = [];


  for (
    const candidate of candidates
  ) {

    const momentText =
      extractMoment(
        transcript,
        candidate.start,
        candidate.end
      );


    if (!momentText.trim()) {
      continue;
    }


    try {

      const deepAI =
        await env.AI.run(
          "@cf/meta/llama-3.1-8b-instruct-fast",
          {

            messages: [

              {
                role: "system",

                content: `
You are ClipAI's senior viral-video editor.

This is a SECOND, DEEP analysis.

Do not simply decide whether the moment is interesting.

Evaluate it as if you were deciding whether to actually publish it.

Consider:

1. Hook strength
2. Curiosity
3. Emotional impact
4. Surprise
5. Shareability
6. Replay potential
7. Clarity without missing context
8. Beginning-to-payoff structure
9. Whether the moment works as a standalone short
10. Whether viewers would keep watching

Be strict.

A normal conversation should NOT automatically receive a high score.

Score from 0-100.

90-100 = exceptional viral candidate
80-89 = very strong
70-79 = strong
60-69 = usable
40-59 = weak
0-39 = poor

ONLY use information explicitly contained in the supplied moment.

Never invent:
- people
- relationships
- secrets
- drama
- motivations
- emotions
- outcomes
- backstory

Return ONLY valid JSON:

{
  "score": 92,
  "reason": "Detailed explanation of why this could perform.",
  "hook": "A short truthful hook.",
  "strengths": [
    "strength",
    "strength"
  ],
  "weaknesses": [
    "weakness"
  ]
}
`
              },

              {
                role: "user",

                content:
                  "VIDEO MOMENT:\n\n" +
                  momentText
              }

            ],

            max_tokens: 700,

            temperature: 0.1

          }
        );


      let raw =
        cleanJSON(
          deepAI.response || ""
        );


      const result =
        JSON.parse(raw);


      const score =
        Math.round(
          Math.min(
            100,
            Math.max(
              0,
              Number(result.score) || 0
            )
          )
        );


      analysedClips.push({

        score,

        start:
          candidate.start,

        end:
          candidate.end,

        duration:
          Math.round(
            (
              candidate.end -
              candidate.start
            ) * 10
          ) / 10,

        reason:
          String(
            result.reason ||
            candidate.reason ||
            "Potentially strong moment."
          ),

        hook:
          String(
            result.hook || ""
          ),

        strengths:
          Array.isArray(
            result.strengths
          )
            ? result.strengths
            : [],

        weaknesses:
          Array.isArray(
            result.weaknesses
          )
            ? result.weaknesses
            : []

      });


    } catch (error) {

      console.error(
        "Deep analysis error:",
        error
      );

    }

  }


  // =======================================================
  // SORT BEST FIRST
  // =======================================================

  analysedClips.sort(
    (a, b) =>
      b.score - a.score
  );


  const viralClips =
    analysedClips.slice(0, 3);


  // =======================================================
  // GENERATE FINAL HOOK FOR BEST CLIP
  // =======================================================

  let hook = "";


  if (
    viralClips.length > 0
  ) {

    const best =
      viralClips[0];


    const bestText =
      extractMoment(
        transcript,
        best.start,
        best.end
      );


    if (bestText.trim()) {

      try {

        const hookAI =
          await env.AI.run(
            "@cf/meta/llama-3.1-8b-instruct-fast",
            {

              messages: [

                {
                  role: "system",

                  content: `
Create ONE extremely concise spoken hook for this video moment.

The hook must:
- be truthful
- create curiosity
- accurately represent the moment
- take approximately 2-6 seconds to say

Do not invent anything.

Return ONLY the hook.
No quotation marks.
No explanation.
`
                },

                {
                  role: "user",

                  content:
                    bestText
                }

              ],

              max_tokens: 60,

              temperature: 0.15

            }
          );


        hook =
          String(
            hookAI.response || ""
          )
            .trim()
            .replace(
              /^["']|["']$/g,
              ""
            );


      } catch {

        hook =
          best.hook || "";

      }

    }

  }


  return json(
    {

      success: true,

      ai: true,

      hook,

      viralClips,

      clipCount:
        viralClips.length,

      bestScore:
        viralClips.length
          ? viralClips[0].score
          : 0,

      bestClip:
        viralClips.length
          ? viralClips[0]
          : null,

      duration

    },

    200,

    cors
  );

}


// =========================================================
// EXTRACT TIMESTAMP RANGE FROM COMBINED TRANSCRIPT
// =========================================================

function extractMoment(
  transcript,
  start,
  end
) {

  const lines =
    transcript.split("\n");


  const selected = [];


  for (const line of lines) {

    const match =
      line.match(
        /^\[(\d{2}):(\d{2})(?::(\d{2}))?\]/
      );


    if (!match) {
      continue;
    }


    const hours =
      match[3]
        ? Number(match[1])
        : 0;


    const minutes =
      match[3]
        ? Number(match[2])
        : Number(match[1]);


    const seconds =
      match[3]
        ? Number(match[3])
        : Number(match[2]);


    const timestamp =
      hours * 3600 +
      minutes * 60 +
      seconds;


    if (
      timestamp >= start &&
      timestamp <= end
    ) {

      selected.push(line);

    }

  }


  return selected.join("\n");

}


// =========================================================
// CLEAN JSON FROM MODEL
// =========================================================

function cleanJSON(
  text
) {

  return String(text)
    .trim()
    .replace(
      /^```json\s*/i,
      ""
    )
    .replace(
      /^```\s*/i,
      ""
    )
    .replace(
      /\s*```$/i,
      ""
    )
    .trim();

}


// =========================================================
// JSON RESPONSE
// =========================================================

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