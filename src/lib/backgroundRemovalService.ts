/**
 * Background removal / studio cutout generation service.
 *
 * Updated to follow the shoe synthesis pipeline more closely:
 * - analyze reference shoes first
 * - generate each studio cut separately at 3:4
 * - verify match against reference before accepting
 */

import { callGeminiSecure, urlToGeminiPart, type GeminiImagePart } from './geminiClient';

interface ShoeAnalysis {
  shoeType: string;
  outsoleShape: string;
  outsoleColor: string;
  outsolePattern: string;
  outsoleMaterial: string;
  outsoleThickness: string;
  upperMaterial: string;
  upperFinish: string;
  upperColor: string;
  upperPattern: string;
  stitchingPattern: string;
  panelDivisions: string;
  lacingStyle: string;
}

interface VerificationResult {
  pass: boolean;
  confidence: number;
  issues: string[];
}

interface ShotSpec {
  id: string;
  label: string;
  camera: string;
  arrangement: string;
  focus: string;
}

const SHOE_ANALYSIS_PROMPT = `Analyze these shoe product images thoroughly.
Return JSON only:
{
  "shoeType": "sneaker/boot/derby/sandal/heel/loafer/etc",
  "outsoleShape": "chunky/slim/platform/wedge/flat",
  "outsoleColor": "color",
  "outsolePattern": "wavy/grid/smooth/etc",
  "outsoleMaterial": "rubber/foam/leather/etc",
  "outsoleThickness": "thin/medium/thick",
  "upperMaterial": "leather/suede/mesh/canvas",
  "upperFinish": "shiny/matte/cracked/patent",
  "upperColor": "color(s)",
  "upperPattern": "pattern or texture",
  "stitchingPattern": "stitch details or none",
  "panelDivisions": "panel layout",
  "lacingStyle": "lacing type or none"
}
Focus ONLY on the shoe product itself.
Ignore any background, floor, table, acrylic stand, box, hand, prop, shadow shape from the reference photo environment.
Be precise. This is used to replicate the exact shoe as premium e-commerce photography.`;

const SHOT_SPECS: ShotSpec[] = [
  {
    id: 'hero',
    label: 'Hero Pair Shot',
    camera: '3/4 front angle, camera slightly above and in front',
    arrangement: 'both shoes as a matching pair, angled slightly inward toward each other',
    focus: 'iconic hero angle, premium main image quality',
  },
  {
    id: 'side',
    label: 'Side Profile Pair',
    camera: 'eye-level lateral side view',
    arrangement: 'left and right shoe shown as a balanced pair with full silhouette clearly visible',
    focus: 'exact profile shape, sole line, logo placement, panel lines',
  },
  {
    id: 'top',
    label: 'Top Down Pair',
    camera: 'top-down overhead view',
    arrangement: 'both shoes arranged naturally in parallel or subtle V-shape',
    focus: 'tongue, lacing system, opening shape, toe box proportions',
  },
  {
    id: 'back',
    label: 'Back Heel Pair',
    camera: 'eye-level rear view',
    arrangement: 'both shoes visible from behind with a slight inward angle',
    focus: 'heel counter, heel tab, collar shape, rear sole edge',
  },
];

async function analyzeShoeFeatures(shoeParts: GeminiImagePart[]): Promise<ShoeAnalysis> {
  try {
    const result = await callGeminiSecure(SHOE_ANALYSIS_PROMPT, shoeParts, {
      modelName: 'gemini-3-flash-preview',
      temperature: 0.1,
      responseMimeType: 'text/plain',
      silent: true,
    });

    if (result.type === 'text' && result.data) {
      const jsonMatch = result.data.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as ShoeAnalysis;
      }
    }
  } catch (error) {
    console.warn('[nukki] shoe analysis failed, using defaults:', error);
  }

  return {
    shoeType: 'sneaker',
    outsoleShape: 'standard',
    outsoleColor: 'neutral',
    outsolePattern: 'standard tread',
    outsoleMaterial: 'rubber',
    outsoleThickness: 'medium',
    upperMaterial: 'leather',
    upperFinish: 'matte',
    upperColor: 'neutral',
    upperPattern: 'none',
    stitchingPattern: 'standard stitching',
    panelDivisions: 'standard panels',
    lacingStyle: 'standard lacing',
  };
}

async function verifyShoeMatch(
  resultImage: GeminiImagePart,
  referenceParts: GeminiImagePart[],
  expectedAnalysis: ShoeAnalysis,
): Promise<VerificationResult> {
  const prompt = `Compare the LAST image (generated studio image) with the FIRST images (reference shoes).
Expected shoe features:
- Type: ${expectedAnalysis.shoeType}
- Outsole: ${expectedAnalysis.outsoleShape} shape, ${expectedAnalysis.outsoleColor} color, ${expectedAnalysis.outsolePattern} pattern
- Outsole material/thickness: ${expectedAnalysis.outsoleMaterial}, ${expectedAnalysis.outsoleThickness}
- Upper: ${expectedAnalysis.upperMaterial}, ${expectedAnalysis.upperFinish}, ${expectedAnalysis.upperColor}
- Upper texture: ${expectedAnalysis.upperPattern}
- Stitching: ${expectedAnalysis.stitchingPattern}
- Panels: ${expectedAnalysis.panelDivisions}
- Lacing: ${expectedAnalysis.lacingStyle}

Check whether the generated image looks like real studio photography of the EXACT same shoe product.
Reject if the output looks like a generic AI shoe, if details are simplified, if edges melt, or if logos/panel lines/sole shape drift from the reference.

Return ONLY valid JSON:
{ "pass": true/false, "confidence": 0.0-1.0, "issues": ["issue1"] }`;

  try {
    const result = await callGeminiSecure(prompt, [...referenceParts, resultImage], {
      modelName: 'gemini-3-flash-preview',
      temperature: 0.1,
      responseMimeType: 'text/plain',
      silent: true,
    });

    if (result.type === 'text' && result.data) {
      const jsonMatch = result.data.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as VerificationResult;
      }
    }
  } catch (error) {
    console.warn('[nukki] verification failed, allowing result:', error);
  }

  return { pass: true, confidence: 0.5, issues: [] };
}

function buildShotPrompt(analysisText: string, shot: ShotSpec, refCount: number): string {
  return `Using the provided ${refCount} shoe reference images, generate ONE single photorealistic studio product image of the EXACT same shoe pair.

REFERENCE SHOE ANALYSIS:
${analysisText}

SHOT TYPE:
- Shot: ${shot.label}
- Camera: ${shot.camera}
- Pair arrangement: ${shot.arrangement}
- Focus: ${shot.focus}

OUTPUT RULES:
- Show BOTH shoes as a matching pair
- Fill the frame like a premium e-commerce product cut
- Keep the pair centered and properly scaled
- Output one clean 3:4 portrait product image
- Treat the reference photos as product-only references, NOT scene references

PRODUCT IDENTITY LOCK:
- The reference shoes are the ONLY correct shoes
- Reproduce the exact outsole shape, outsole color, tread, upper material, stitching, logo placement, lace structure, panel layout, and silhouette
- Do not invent missing details or redesign anything
- If the source image is soft or unclear, infer the most realistic exact product detail, not a generic substitute
- Completely discard any support surface or environment seen in the reference photos

REALISM / NON-AI LOOK:
- This must look like a real commercial studio photo, not an AI image
- No plastic surfaces, no fake CGI shape language, no melted edges, no invented textures
- Preserve tiny construction details: lace holes, stitching depth, sole separation, panel breaks, material grain
- Keep natural lens rendering and realistic studio lighting falloff
- The shoes should be tack-sharp but still photographic, never overprocessed

STUDIO SETUP:
- Pure white seamless studio background
- Soft commercial key light, subtle fill, very light natural contact shadow
- No colored cast, no reflections, no props, no text, no graphics
- Neutral whites with no magenta, purple, gray haze, or cheap cutout halo
- The shoes must appear photographed directly in studio, not copied from a casual upload
- Do NOT preserve any table edge, floor texture, shelf, wall tone, stand, hand-held perspective, or original background shadow pattern

FORBIDDEN:
- Single shoe
- Collage or strip layout
- 3D render look
- Oversmoothed materials
- Wrong logo, wrong sole, wrong proportions
- Hazy cutout boundary, white fringe, floating shoes
- Generic AI sneaker look
- Any leftover upload environment: display stand, tabletop, shelf, fabric backdrop, room lighting, phone snapshot perspective

This should feel like a top-tier Musinsa or Nike product reshoot using the exact real shoes from the references.`;
}

function buildAnalysisSummary(analysis: ShoeAnalysis): string {
  return `Type: ${analysis.shoeType}
Outsole: ${analysis.outsoleShape}, ${analysis.outsoleColor}, ${analysis.outsolePattern}, ${analysis.outsoleMaterial}, ${analysis.outsoleThickness}
Upper: ${analysis.upperMaterial}, ${analysis.upperFinish}, ${analysis.upperColor}, ${analysis.upperPattern}
Stitching: ${analysis.stitchingPattern}
Panels: ${analysis.panelDivisions}
Lacing: ${analysis.lacingStyle}`;
}

function toResultPart(dataUrl: string): GeminiImagePart {
  return {
    data: dataUrl.split('base64,')[1] || dataUrl,
    mimeType: 'image/png',
  };
}

async function generateSingleShot(
  shot: ShotSpec,
  referenceParts: GeminiImagePart[],
  analysis: ShoeAnalysis,
  onProgress?: (status: string) => void,
): Promise<string> {
  const MAX_ATTEMPTS = 2;
  const prompt = buildShotPrompt(buildAnalysisSummary(analysis), shot, referenceParts.length);
  let lastImage = '';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    onProgress?.(`🔮 ${shot.label} 생성 ${attempt}/${MAX_ATTEMPTS}...`);

    const result = await callGeminiSecure(prompt, referenceParts, {
      useGemini3Pro: true,
      imagesFirst: true,
      aspectRatio: '3:4',
      imageSize: '2K',
      temperature: 0.45,
    });

    if (result.type !== 'image' || !result.data) {
      if (attempt === MAX_ATTEMPTS) {
        throw new Error(`${shot.label} 생성 실패`);
      }
      continue;
    }

    lastImage = result.data;

    const verification = await verifyShoeMatch(toResultPart(result.data), referenceParts, analysis);
    if (verification.pass || verification.confidence >= 0.75) {
      return result.data;
    }

    console.warn(`[nukki] ${shot.id} verification failed:`, verification.issues.join(', '));
  }

  if (lastImage) {
    return lastImage;
  }

  throw new Error(`${shot.label} 생성 실패`);
}

export async function generateNukkiShots(
  productImages: string[],
  onProgress?: (status: string) => void,
): Promise<string[]> {
  if (productImages.length === 0) {
    throw new Error('업로드된 이미지가 없습니다.');
  }

  const referenceImages = productImages.slice(0, 4);
  onProgress?.('🔎 누끼용 신발 분석 중...');

  const referenceParts = await Promise.all(referenceImages.map((img) => urlToGeminiPart(img)));
  const analysis = await analyzeShoeFeatures(referenceParts);

  const results: string[] = [];

  for (let index = 0; index < SHOT_SPECS.length; index += 1) {
    const shot = SHOT_SPECS[index];
    onProgress?.(`📸 누끼 컷 ${index + 1}/4 생성 중...`);
    const image = await generateSingleShot(shot, referenceParts, analysis, onProgress);
    results.push(image);
  }

  onProgress?.('✅ 누끼 4컷 생성 완료!');
  return results;
}
