export default {
  async fetch(request, env) {

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: corsHeaders()
      });
    }

    if (request.method !== "POST") {
      return json({
        error: "Use POST"
      }, 405);
    }

    try {

      const body = await request.json();

      const duration = Number(body.duration);
      const transcript = body.transcript;

      if (!Number.isFinite(duration) || duration <= 0) {
        return json({
          error: "Invalid video duration"
        }, 400);
      }

      if (!transcript) {
        return json({
          error: "No transcript supplied"
        }, 400);
      }

      return json({
        success: true,
        duration: duration,
        transcriptLength: transcript.length,
        message: "ClipAI API is working."
      });

    } catch (error) {

      return json({
        error: "Invalid request"
      }, 400);

    }
  }
};


function corsHeaders() {

  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };

}


function json(data, status = 200) {

  return new Response(
    JSON.stringify(data),
    {
      status: status,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders()
      }
    }
  );

}