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
      return json({
        error: "Use POST"
      }, 405, cors);
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

      const audioBuffer =
        await audio.arrayBuffer();

      const audioBytes =
        [...new Uint8Array(audioBuffer)];

      console.log(
        "Received file:",
        audio.name,
        "Size:",
        audioBuffer.byteLength
      );

      const result =
        await env.AI.run(
          "@cf/openai/whisper",
          {
            audio: audioBytes
          }
        );

      return json({

        success: true,

        transcript:
          result.text || "",

        message:
          "Whisper transcription complete."

      }, 200, cors);

    }

    catch (error) {

      console.error(error);

      return json({

        error:
          error.message ||
          "Whisper transcription failed."

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