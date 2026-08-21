<!DOCTYPE html>
<html lang="en">

<head>

<meta charset="UTF-8">

<meta name="viewport"
content="width=device-width, initial-scale=1.0">

<title>ClipAI</title>

<style>

* {
    box-sizing: border-box;
}

body {
    margin: 0;
    min-height: 100vh;
    background: #080808;
    color: white;
    font-family: -apple-system,
                 BlinkMacSystemFont,
                 "Segoe UI",
                 Arial,
                 sans-serif;
}

.container {
    max-width: 700px;
    margin: auto;
    padding: 60px 20px;
    text-align: center;
}

.logo {
    font-size: 52px;
    font-weight: 800;
    letter-spacing: -2px;
}

.logo span {
    color: #7c5cff;
}

.subtitle {
    color: #999;
    font-size: 18px;
    margin-bottom: 40px;
}

.upload {
    background: #111;
    border: 2px dashed #333;
    border-radius: 20px;
    padding: 35px 20px;
}

input[type="file"] {
    width: 100%;
    margin-top: 20px;
}

button {
    margin-top: 25px;
    padding: 15px 30px;
    border: none;
    border-radius: 12px;
    background: #7c5cff;
    color: white;
    font-size: 17px;
    font-weight: bold;
    cursor: pointer;
}

button:disabled {
    opacity: 0.5;
}

#status {
    margin-top: 20px;
    color: #aaa;
    min-height: 24px;
}

.card {
    margin-top: 20px;
    padding: 20px;
    background: #151515;
    border-radius: 15px;
    text-align: left;
}

.hook {
    font-size: 20px;
    font-weight: 700;
    line-height: 1.4;
}

.transcript {
    white-space: pre-wrap;
    line-height: 1.6;
    color: #ccc;
}

.success {
    color: #66ff99;
}

.error {
    color: #ff6666;
}

.label {
    color: #7c5cff;
    font-weight: bold;
}

</style>

</head>


<body>


<div class="container">


<h1 class="logo">
Clip<span>AI</span>
</h1>


<p class="subtitle">
Turn long videos into short-form content.
</p>


<div class="upload">


<h2>
Upload a video
</h2>


<p>
ClipAI will transcribe and analyse it.
</p>


<input
    type="file"
    id="video"
    accept="video/*"
>


<br>


<button
    id="analyseButton"
    onclick="analyse()"
>

Find Viral Clips

</button>


<div id="status"></div>


<div id="results"></div>


</div>


</div>


<script>


const API_URL =
"https://clipai-api.7km7sfb9zz.workers.dev";


async function analyse() {


    const file =
        document.getElementById("video").files[0];


    const status =
        document.getElementById("status");


    const results =
        document.getElementById("results");


    const button =
        document.getElementById("analyseButton");


    if (!file) {

        status.innerText =
            "Please select a video first.";

        status.className =
            "error";

        return;

    }


    button.disabled = true;

    results.innerHTML = "";

    status.innerText =
        "Uploading video to ClipAI AI...";

    status.className = "";


    try {


        const formData =
            new FormData();


        formData.append(
            "audio",
            file
        );


        status.innerText =
            "🎙️ Transcribing with AI...";


        const response =
            await fetch(

                API_URL,

                {
                    method: "POST",
                    body: formData
                }

            );


        const responseText =
            await response.text();


        let data;


        try {

            data =
                JSON.parse(responseText);

        }

        catch {

            throw new Error(
                "Invalid Worker response: "
                + responseText
            );

        }


        if (!response.ok) {

            throw new Error(
                data.error ||
                "AI request failed."
            );

        }


        status.innerText =
            "🧠 AI analysis complete!";

        status.className =
            "success";


        results.innerHTML = `

            <div class="card">

                <div class="label">
                    🧠 AI-GENERATED HOOK
                </div>

                <p class="hook">
                    ${escapeHTML(
                        data.hook ||
                        "No hook generated."
                    )}
                </p>

            </div>


            <div class="card">

                <div class="label">
                    🎙️ TRANSCRIPT
                </div>

                <p class="transcript">
                    ${escapeHTML(
                        data.transcript ||
                        "No speech detected."
                    )}
                </p>

            </div>

        `;


    }

    catch (error) {


        console.error(
            "ClipAI error:",
            error
        );


        status.innerText =
            "Could not connect to ClipAI.";

        status.className =
            "error";


        results.innerHTML = `

            <div class="card">

                <h3>
                    ❌ Connection Error
                </h3>

                <p>
                    ${escapeHTML(
                        error.message
                    )}
                </p>

            </div>

        `;

    }


    button.disabled = false;

}


function escapeHTML(text) {

    return String(text)

        .replaceAll(
            "&",
            "&amp;"
        )

        .replaceAll(
            "<",
            "&lt;"
        )

        .replaceAll(
            ">",
            "&gt;"
        )

        .replaceAll(
            '"',
            "&quot;"
        )

        .replaceAll(
            "'",
            "&#039;"
        );

}


</script>


</body>

</html>