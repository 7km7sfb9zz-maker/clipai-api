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

      const audioBuffer =
        await audio.arrayBuffer();

      const audioBytes =
        [...new Uint8Array(audioBuffer)];


      const result =
        await env.AI.run(
          "@cf/openai/whisper",
          {
            audio: audioBytes
          }
        );


      /*
       * Return the transcript plus
       * whatever timestamp information
       * Whisper provides.
       */

      return json({

        success: true,

        transcript:
          result.text || "",

        segments:
          result.segments || [],

        words:
          result.words || [],

        message:
          "Whisper transcription complete."

      }, 200, cors);


    } catch (error) {

      console.error(error);

      return json({

        error:
          error.message ||
          "Transcription failed."

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