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

      const contentType =
        request.headers.get("content-type") || "";


      /*
       * We expect the website to send
       * the video's audio as multipart/form-data.
       */

      if (!contentType.includes("multipart/form-data")) {

        return json({
          error: "Expected multipart/form-data"
        }, 400, cors);

      }


      const formData =
        await request.formData();


      const audio =
        formData.get("audio");


      if (!audio || typeof audio.arrayBuffer !== "function") {

        return json({
          error: "No audio file received"
        }, 400, cors);

      }


      /*
       * Convert the uploaded audio into
       * an ArrayBuffer for Workers AI.
       */

      const audioBuffer =
        await audio.arrayBuffer();


      /*
       * Send the audio to Whisper.
       */

      const result =
        await env.AI.run(
          "@cf/openai/whisper",
          {
            audio: [...new Uint8Array(audioBuffer)]
          }
        );


      return json({

        success: true,

        transcript:
          result.text || "",

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