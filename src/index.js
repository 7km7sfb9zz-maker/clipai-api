export default {
  async fetch(request, env) {

    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
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

      /*
       * ==========================================
       * ROUTE 1
       * AUDIO CHUNK -> WHISPER
       * ==========================================
       */

      const contentType =
        request.headers.get("content-type") || "";

      if (
        contentType.includes("multipart/form-data")
      ) {

        return await handleAudioChunk(
          request,
          env,
          cors
        );

      }


      /*
       * ==========================================
       * ROUTE 2
       * COMBINED TRANSCRIPT -> VIRAL ANALYSIS
       * ==========================================
       */

      if (
        contentType.includes("application/json")
      ) {

        const body =
          await request.json();

        if (
          body &&
          body.action === "analyze"
        ) {

          return await handleAnalysis(
            body,
            env,
            cors
          );

        }

        return json(
          {
            success: false,
            error:
              "Unknown action."
          },
          400,
          cors
        );

      }


      return json(
        {
          success: false,
          error:
            "Unsupported request type."
        },
        400,
        cors
      );

    }

    catch (error) {

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


/*
 * ==========================================
 * AUDIO CHUNK HANDLER
 * ==========================================
 */

async function handleAudioChunk(
  request,
  env,
  cors
) {

  const formData =
    await request.formData();


  const audio =
    formData.get("audio");


  if (!audio) {

    return json(
      {
        success: false,
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
   * Cloudflare Worker protection.
   */

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
    Array.from(
      new Uint8Array(
        audioBuffer
      )
    );


  /*
   * Chunk position supplied by frontend.
   */

  const chunkStart =
    Number(
      formData.get("chunkStart")
    ) || 0;


  /*
   * ==========================================
   * WHISPER
   * ==========================================
   */

  const transcription =
    await env.AI.run(
      "@cf/openai/whisper-large-v3-turbo",
      {
        audio: audioBytes
      }
    );


  const rawText =
    String(
      transcription?.text ||
      ""
    ).trim();


  const segments =
    Array.isArray(
      transcription?.segments
    )
      ? transcription.segments
      : [];


  const words =
    Array.isArray(
      transcription?.words
    )
      ? transcription.words
      : [];


  /*
   * ==========================================
   * IMPORTANT
   *
   * Add absolute timestamps to the transcript.
   *
   * This means the second AI analysis can
   * identify the actual location of a moment
   * in the original video.
   * ==========================================
   */

  let timestampedText = "";


  if (segments.length) {

    timestampedText =
      segments
        .map(segment => {

          const localStart =
            Number(
              segment.start
            ) || 0;


          const localEnd =
            Number(
              segment.end
            ) || localStart;


          const absoluteStart =
            chunkStart +
            localStart;


          const absoluteEnd =
            chunkStart +
            localEnd;


          const text =
            String(
              segment.text ||
              ""
            ).trim();


          if (!text) {
            return "";
          }


          return (
            `[${formatTime(absoluteStart)} - ` +
            `${formatTime(absoluteEnd)}] ` +
            `${text}`
          );

        })
        .filter(Boolean)
        .join("\n");

  }

  else {

    timestampedText =
      rawText
        ? `[${formatTime(chunkStart)}] ${rawText}`
        : "";

  }


  return json(
    {
      success: true,
      ai: true,

      /*
       * The frontend expects data.transcript.
       * We return the timestamped version here
       * so the later analysis has useful timing.
       */

      transcript:
        timestampedText,

      rawTranscript:
        rawText,

      segments:
        segments,

      words:
        words,

      chunkStart:
        chunkStart

    },
    200,
    cors
  );

}


/*
 * ==========================================
 * VIRAL ANALYSIS HANDLER
 * ==========================================
 *
 * This is the SECOND stage.
 *
 * Stage 1:
 * Find possible viral moments.
 *
 * Stage 2:
 * Deeply analyse those candidates and reject
 * weak ones.
 *
 * Stage 3:
 * Generate the final hook for the best one.
 * ==========================================
 */

async function handleAnalysis(
  body,
  env,
  cors
) {

  const transcript =
    String(
      body?.transcript ||
      ""
    ).trim();


  if (!transcript) {

    return json(
      {
        success: true,
        ai: true,
        transcript: "",
        viralClips: [],
        hook: "",
        hookError: "",
        viralError:
          "No transcript supplied.",
        clipCount: 0,
        bestScore: 0,
        bestClip: null
      },
      200,
      cors
    );

  }


  /*
   * ==========================================
   * STAGE 1
   * BROAD VIRAL MOMENT DETECTION
   * ==========================================
   */

  let candidates = [];


  let firstPassError = "";


  try {

    const firstAI =
      await env.AI.run(
        "@cf/meta/llama-3.1-8b-instruct-fast",
        {

          messages: [

            {
              role: "system",

              content: `
You are ClipAI's first-pass viral moment detector.

Analyse the supplied timestamped transcript.

Find up to 8 POSSIBLE moments that could work as:
- TikTok clips
- YouTube Shorts
- Instagram Reels

Look for:
- surprising statements
- funny moments
- emotional moments
- arguments
- controversial opinions
- unusual facts
- stories
- unexpected twists
- impressive information
- strong opinions
- curiosity
- memorable statements
- clear setups and payoffs

ONLY use information explicitly present in the transcript.

NEVER invent:
- people
- relationships
- events
- secrets
- motivations
- emotions
- locations
- backstory
- outcomes

The timestamps MUST come from the transcript.

Return ONLY valid JSON.

Format:

[
  {
    "start": 12.5,
    "end": 42.8,
    "reason": "Why this moment may be interesting.",
    "hook": "A truthful curiosity-based hook."
  }
]

If nothing is interesting, return [].

No markdown.
No explanation.
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


    let raw =
      String(
        firstAI?.response ||
        ""
      ).trim();


    raw =
      cleanJSON(
        raw
      );


    candidates =
      JSON.parse(
        raw
      );


    if (
      !Array.isArray(
        candidates
      )
    ) {

      candidates = [];

    }

  }

  catch (error) {

    firstPassError =
      error?.message ||
      "First viral analysis failed.";

    candidates = [];

  }


  /*
   * ==========================================
   * STAGE 2
   * DEEP ANALYSIS
   * ==========================================
   *
   * We now give the AI the candidates plus
   * the original transcript.
   *
   * This prevents the first quick scan from
   * deciding the final clips by itself.
   * ==========================================
   */

  let viralClips = [];


  let deepAnalysisError = "";


  try {

    const candidateText =
      JSON.stringify(
        candidates
      );


    const deepAI =
      await env.AI.run(
        "@cf/meta/llama-3.1-8b-instruct-fast",
        {

          messages: [

            {
              role: "system",

              content: `
You are ClipAI's senior viral video editor.

This is the DEEP ANALYSIS stage.

A first AI pass has already identified possible viral moments.

Your job is to carefully review those candidates against the FULL transcript and decide which moments are genuinely strong.

Do NOT simply accept every candidate.

Reject moments that are:
- boring
- repetitive
- contextless
- misleading
- too dependent on missing context
- weak without visual information
- not actually interesting
- artificially dramatic

Prioritise moments with:
- a strong opening
- curiosity
- tension
- a surprising statement
- a clear story
- a strong opinion
- a payoff
- a memorable line
- a reason someone would keep watching

ONLY use information explicitly contained in the transcript.

NEVER invent:
- drama
- emotions
- relationships
- people
- secrets
- backstory
- outcomes
- motivations
- facts

The final clip must normally be 10-60 seconds.

You may adjust the start/end slightly if needed, but timestamps must remain inside the supplied transcript.

Give each surviving clip a score from 0-100.

90-100 = exceptional
80-89 = very strong
70-79 = strong
60-69 = decent
Below 60 = weak

Only return the genuinely strongest clips.

Maximum 3 clips.

Return ONLY valid JSON.

Format:

[
  {
    "score": 91,
    "start": 12.5,
    "end": 43.2,
    "reason": "Specific explanation of why this could perform well.",
    "hook": "A truthful short hook based only on the transcript."
  }
]

No markdown.
No explanation outside JSON.
`
            },

            {
              role: "user",

              content:
                "FULL TIMESTAMPED TRANSCRIPT:\n\n" +
                transcript +
                "\n\nFIRST-PASS CANDIDATES:\n\n" +
                candidateText

            }

          ],

          max_tokens: 1400,

          temperature: 0.1

        }
      );


    let raw =
      String(
        deepAI?.response ||
        ""
      ).trim();


    raw =
      cleanJSON(
        raw
      );


    viralClips =
      JSON.parse(
        raw
      );


    if (
      !Array.isArray(
        viralClips
      )
    ) {

      viralClips = [];

    }

  }

  catch (error) {

    deepAnalysisError =
      error?.message ||
      "Deep viral analysis failed.";

    viralClips = [];

  }


  /*
   * ==========================================
   * VALIDATE FINAL CLIPS
   * ==========================================
   */

  const safeClips =
    viralClips

      .filter(clip => {

        if (!clip) {
          return false;
        }


        const start =
          Number(
            clip.start
          );


        const end =
          Number(
            clip.end
          );


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
            Number(
              clip.start
            )
          );


        let end =
          Math.max(
            start,
            Number(
              clip.end
            )
          );


        /*
         * Maximum 60 seconds.
         */

        if (
          end - start >
          60
        ) {

          end =
            start + 60;

        }


        /*
         * Minimum useful clip length.
         */

        if (
          end - start <
          10
        ) {

          end =
            start + 10;

        }


        let score =
          Number(
            clip.score
          );


        if (
          !Number.isFinite(score)
        ) {

          score = 0;

        }


        score =
          Math.round(
            Math.max(
              0,
              Math.min(
                100,
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
              (
                end -
                start
              ) * 10
            ) / 10,

          reason:
            String(
              clip.reason ||
              "Potentially strong viral moment."
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


  /*
   * ==========================================
   * STAGE 3
   * DEEP HOOK GENERATION
   * ==========================================
   */

  let hook = "";

  let hookError = "";


  if (
    safeClips.length > 0
  ) {

    const bestClip =
      safeClips[0];


    const bestText =
      getTranscriptBetween(
        transcript,
        bestClip.start,
        bestClip.end
      );


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

                  content: `
You are ClipAI's final hook writer.

Create ONE extremely concise spoken hook for the selected video moment.

The hook must:
- be truthful
- use only information in the supplied moment
- create curiosity
- make someone want to continue watching
- sound natural when spoken

Do NOT invent:
- secrets
- drama
- people
- relationships
- motivations
- outcomes
- facts

Keep it around 5-12 words.

Return ONLY the hook.

No quotation marks.
No explanation.
`
                },

                {
                  role: "user",

                  content:
                    "SELECTED MOMENT:\n\n" +
                    bestText

                }

              ],

              max_tokens: 50,

              temperature: 0.15

            }
          );


        hook =
          String(
            hookAI?.response ||
            bestClip.hook ||
            ""
          )
            .trim()
            .replace(
              /^["']|["']$/g,
              ""
            );

      }

      catch (error) {

        hookError =
          error?.message ||
          "Hook generation failed.";

        hook =
          bestClip.hook ||
          "";

      }

    }

  }


  /*
   * ==========================================
   * FALLBACK HOOK
   * ==========================================
   */

  if (
    !hook &&
    safeClips.length > 0
  ) {

    hook =
      safeClips[0].hook ||
      "";

  }


  /*
   * ==========================================
   * FINAL RESPONSE
   * ==========================================
   */

  let viralError = "";


  if (
    deepAnalysisError
  ) {

    viralError =
      deepAnalysisError;

  }

  else if (
    firstPassError
  ) {

    viralError =
      firstPassError;

  }


  return json(
    {

      success:
        true,

      ai:
        true,

      transcript:
        transcript,

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
        safeClips.length
          ? safeClips[0].score
          : 0,

      bestClip:
        safeClips.length
          ? safeClips[0]
          : null,

      /*
       * Useful for debugging.
       */

      analysisStages: {
        firstPass:
          candidates.length,

        deepPass:
          safeClips.length

      }

    },

    200,

    cors

  );

}


/*
 * ==========================================
 * EXTRACT TEXT BETWEEN TIMESTAMPS
 * ==========================================
 */

function getTranscriptBetween(
  transcript,
  startTime,
  endTime
) {

  const lines =
    transcript.split("\n");


  const output = [];


  for (
    const line of lines
  ) {

    const match =
      line.match(
        /^\[(\d+):(\d+)(?::(\d+))?\s*-\s*(\d+):(\d+)(?::(\d+))?\]\s*(.*)$/
      );


    if (!match) {

      /*
       * Also support a simple
       * [MM:SS] timestamp.
       */

      const simple =
        line.match(
          /^\[(\d+):(\d+)\]\s*(.*)$/
        );


      if (simple) {

        const minutes =
          Number(
            simple[1]
          );


        const seconds =
          Number(
            simple[2]
          );


        const time =
          minutes * 60 +
          seconds;


        if (
          time >= startTime &&
          time <= endTime
        ) {

          output.push(
            simple[3]
          );

        }

      }

      continue;

    }


    const start =
      parseTimestamp(
        match[1],
        match[2],
        match[3]
      );


    const end =
      parseTimestamp(
        match[4],
        match[5],
        match[6]
      );


    if (
      end >= startTime &&
      start <= endTime
    ) {

      output.push(
        match[7]
      );

    }

  }


  return output.join(" ");

}


/*
 * ==========================================
 * PARSE TIMESTAMP
 * ==========================================
 */

function parseTimestamp(
  first,
  second,
  third
) {

  if (
    third !== undefined
  ) {

    return (
      Number(first) * 3600 +
      Number(second) * 60 +
      Number(third)
    );

  }


  return (
    Number(first) * 60 +
    Number(second)
  );

}


/*
 * ==========================================
 * CLEAN AI JSON
 * ==========================================
 */

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


/*
 * ==========================================
 * FORMAT TIME
 * ==========================================
 */

function formatTime(
  seconds
) {

  seconds =
    Number(seconds) || 0;


  const hours =
    Math.floor(
      seconds / 3600
    );


  const minutes =
    Math.floor(
      (
        seconds % 3600
      ) / 60
    );


  const remaining =
    Math.floor(
      seconds % 60
    );


  if (
    hours > 0
  ) {

    return (
      String(hours)
        .padStart(2, "0") +
      ":" +
      String(minutes)
        .padStart(2, "0") +
      ":" +
      String(remaining)
        .padStart(2, "0")
    );

  }


  return (
    String(minutes)
      .padStart(2, "0") +
    ":" +
    String(remaining)
      .padStart(2, "0")
  );

}


/*
 * ==========================================
 * JSON RESPONSE
 * ==========================================
 */

function json(
  data,
  status,
  cors
) {

  return new Response(
    JSON.stringify(
      data
    ),
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