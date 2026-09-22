import fs from 'node:fs';
import path from 'node:path';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

if (!OPENROUTER_API_KEY) {
  console.error('Error: OPENROUTER_API_KEY is not set in environment.');
  process.exit(1);
}

async function runVisionToCompose(imagePath, outputPath, options = {}) {
  console.log(`[VisionPrototype] Reading screenshot: ${imagePath}`);
  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');
  const mimeType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';
  const dataUrl = `data:${mimeType};base64,${base64Image}`;

  const prompt = `You are an expert Android Jetpack Compose engineer.
You are tasked with rebuilding this screen in pure, production-ready Jetpack Compose Kotlin code purely from this screenshot.

Target Platform: Android tablet (Daylight Computer DC1, Sol:OS monochrome LivePaper display).
Requirements:
1. Emulate the visual layout, typography, buttons, cards, icons, and chrome as closely as possible.
2. Produce complete, compilable Kotlin Jetpack Compose code with all necessary imports, a main @Composable function \`VisionReconstructedScreen()\`, and necessary sub-composables.
3. Pay close attention to:
   - Colors and grayscale shades
   - Typography (font size, weight, line spacing)
   - Layout hierarchy (Rows, Columns, Boxes, Paddings, Alignments)
   - Icons (draw them with ImageVector/Canvas or describe how you represent compound glyphs like notebook icons, plus badges, chevrons)
4. Output ONLY valid Kotlin code in a markdown \`\`\`kotlin ... \`\`\` code block.`;

  console.log(`[VisionPrototype] Dispatching multimodal request to google/gemini-2.5-flash...`);
  const startTime = Date.now();

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://antigravity.google.com',
      'X-Title': 'Vision-to-Compose-Prototype'
    },
    body: JSON.stringify({
      model: options.model || 'google/gemini-2.5-flash',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: dataUrl
              }
            }
          ]
        }
      ],
      temperature: 0.1,
      max_tokens: 4000
    })
  });

  const durationMs = Date.now() - startTime;
  console.log(`[VisionPrototype] Response received in ${durationMs}ms`);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error (${response.status}): ${errorText}`);
  }

  const json = await response.json();
  const rawContent = json.choices?.[0]?.message?.content || '';

  // Extract kotlin code
  const kotlinMatch = rawContent.match(/```kotlin([\s\S]*?)```/) || rawContent.match(/```([\s\S]*?)```/);
  const code = kotlinMatch ? kotlinMatch[1].trim() : rawContent.trim();

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, code, 'utf8');
  console.log(`[VisionPrototype] Saved generated Compose code to: ${outputPath}`);

  // Return diagnostic metadata
  return {
    model: options.model || 'google/gemini-2.5-flash',
    durationMs,
    codeLength: code.length,
    outputPath,
    code
  };
}

// CLI execution
const args = process.argv.slice(2);
const targetImage = args[0] || 'output/test_da63/screenshots/desktop_reference.png';
const targetOutput = args[1] || 'output/vision_prototype/VisionReconstructedScreen.kt';

runVisionToCompose(targetImage, targetOutput)
  .then(res => {
    console.log(`[VisionPrototype] Successfully generated ${res.codeLength} chars of Compose code.`);
  })
  .catch(err => {
    console.error(`[VisionPrototype] Failed:`, err);
    process.exit(1);
  });
